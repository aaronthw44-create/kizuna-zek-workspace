import { Message, Attachment, SmartMemory, WebSearchResult } from '../types';
import {
  requireValidGeminiApiKey,
  getGeminiApiKey,
  cleanApiKey,
  fetchGoogleSearchGrounding,
  logApiDispatch,
  getTavilyApiKey,
  searchWithTavily,
  sanitizeSearchQuery,
  scrubSnippetText,
  isCasualGreeting,
  HTTP_429_RATE_LIMIT_NOTICE,
} from '../services/apiService';

export interface StreamParams {
  messages: Message[];
  systemInstruction?: string;
  folderSystemPrompt?: string;
  loreContext?: string;
  sessionSummary?: string;
  memories?: SmartMemory[];
  userProfile?: {
    nickname?: string;
    occupation?: string;
    aboutMe?: string;
  };
  personalityConfig?: {
    warmth?: string;
    enthusiasm?: string;
    formatting?: string;
    emojiUsage?: string;
    customInstructions?: string;
  };
  webSearchResults?: WebSearchResult[];
  webSearchSummary?: string;
  isWebSearchEnabled?: boolean;
  provider: 'gemini' | 'custom' | 'alibaba';
  customConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    alibabaApiKey?: string;
    alibabaBaseUrl?: string;
    alibabaModel?: string;
  };
  maxOutputTokens?: number;
  temperature?: number;
  model?: string;
  enableReasoning?: boolean;
  reasoningMode?: 'off' | 'light' | 'deep';
  thinkingBudget?: number;
  signal?: AbortSignal;
  onChunk: (text: string, reasoning?: string, sources?: WebSearchResult[], ttft?: number, cachedTokens?: number, truncated?: boolean, completionTokens?: number) => void;
  onReaderInit?: (reader: ReadableStreamDefaultReader<any>) => void;
}

function sanitizeChunk(text: string): { sanitized: string; shouldTerminate: boolean } {
  if (!text) return { sanitized: '', shouldTerminate: false };
  const stopTokens = ['<|close|>', '<|im_end|>', '<|endoftext|>', '</s>', '<close>', '<|im_start|>', '<|step'];
  for (const st of stopTokens) {
    const idx = text.indexOf(st);
    if (idx !== -1) {
      return {
        sanitized: text.slice(0, idx).replace(/<\|close\|>|<close>|<\|im_end\|>|<\|endoftext\|>|<\/s>/gi, '').trim(),
        shouldTerminate: true,
      };
    }
  }
  let cleaned = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '')
    .replace(/<\|close\|>|<close>|<\|im_end\|>|<\|endoftext\|>|<\/s>/gi, '')
    .replace(/<\|im_start\|>|<\|step[^>]*\|>/gi, '')
    .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
    .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '');

  const trimmed = cleaned.trim();
  // Strip orphaned pipe control token fragments like '<|' or '<|im_end|>', never normal '<' or HTML tags
  if (trimmed === '<|' || /^<\|[\w\-_]+\|?>$/.test(trimmed)) {
    return { sanitized: '', shouldTerminate: true };
  }

  if (/^([^\w\s])\1{3,}$/.test(trimmed) || /^(@|#|\/|\-|_|\*){3,}$/.test(trimmed)) {
    cleaned = '...';
  }

  return { sanitized: cleaned, shouldTerminate: false };
}

export async function executeDirectApiStream(params: StreamParams): Promise<void> {
  const {
    messages,
    systemInstruction = '',
    folderSystemPrompt = '',
    loreContext = '',
    sessionSummary = '',
    memories = [],
    userProfile = {},
    personalityConfig = {},
    webSearchResults = [],
    webSearchSummary = '',
    isWebSearchEnabled = false,
    provider,
    customConfig = {},
    maxOutputTokens = 8192,
    temperature = 0.7,
    model = 'gemini-3.6-flash',
    enableReasoning = true,
    reasoningMode,
    thinkingBudget,
    signal,
    onChunk,
  } = params;

  logApiDispatch({ webSearch: isWebSearchEnabled, model, provider });
  console.log("Despachando llamada con webSearch:", Boolean(isWebSearchEnabled));

  // Build full system prompt
  const promptSections: string[] = [];

  const warmthVal = personalityConfig?.warmth || 'default';
  const enthusiasmVal = personalityConfig?.enthusiasm || 'default';
  const formattingVal = personalityConfig?.formatting || 'default';
  const emojiVal = personalityConfig?.emojiUsage || 'default';
  const customInstructionsText = personalityConfig?.customInstructions?.trim() || '';

  const warmthInstruction =
    warmthVal === 'warm'
      ? 'Muy cálido, cercano, afectuoso y compañero.'
      : warmthVal === 'cold' || warmthVal === 'neutral'
        ? 'Sobrio, objetivo, analítico, directo y profesional.'
        : 'Cálido, cercano y conversacional.';

  const enthusiasmInstruction =
    enthusiasmVal === 'high'
      ? 'Alto entusiasmo, enérgico, apasionado y expresivo.'
      : enthusiasmVal === 'dry'
        ? 'Calmo, sereno, mesurado y sin exageraciones.'
        : 'Entusiasmo moderado y orgánico.';

  const formattingInstruction =
    formattingVal === 'structured'
      ? 'Usa encabezados claros, listas y estructura visual organizada cuando sea útil.'
      : formattingVal === 'prose_only'
        ? 'PROHIBIDO usar listas con viñetas, numeraciones o encabezados; redacta exclusivamente en párrafos de prosa fluida.'
        : 'Formato equilibrado y fluido adaptado a la conversación.';

  const emojiInstruction =
    emojiVal === 'none' || emojiVal === 'minimal'
      ? 'PROHIBIDO usar emojis. No incluyas ningún emoji en tu respuesta.'
      : 'PROHIBIDO el uso de emojis infantiles, exagerados o decorativos (ej. 🖐️, ✨, 🌸). Redacta en un estilo sobrio, limpio, inteligente y adulto.';

  promptSections.push(
    `### DIRECTIVA DE PERSONALIZACIÓN Y ESTILO (KIZUNA-ZEK)
- Calidez: ${warmthInstruction}
- Entusiasmo: ${enthusiasmInstruction}
- Formato (Encabezados y listas): ${formattingInstruction}
- Uso de Emojis: ${emojiInstruction}
- Naturalidad en charla: Al conversar con el autor, habla de forma natural y directa; PROHIBIDO incluir acotaciones teatrales o de roleplay entre paréntesis (ej. "(pausa corta...)", "(suspira...)") ni impostar voz de detective noir.${customInstructionsText ? `\n- Instrucciones personalizadas permanentes del usuario (PRIORIDAD ALTA): ${customInstructionsText}` : ''}

### REGLA OBLIGATORIA DE SALUDOS Y ATENCIÓN INICIAL
Si el mensaje del usuario es únicamente un saludo breve o de cortesía (ej. "Hola", "Buenas", "Hola 👋", "Qué tal", "Hola Aaron"):
- NO te lances de inmediato a analizar, diseccionar o criticar las fichas o capítulos de la Bóveda de Lore ni las sesiones previas.
- Responde de forma cálida, sobria y cercana de colega a colega, saludando al autor por su nombre.
- Si hay documentos cargados en la Bóveda de Lore, menciona amablemente en una sola frase qué fichas o manuscritos tienes sobre la mesa.
- Pregúntale con empatía en qué desea trabajar o enfocarse en esta sesión antes de empezar a analizar cualquier escena o manuscrito.
- NUNCA usés emojis infantiles. Mantén un tono inteligente, sobrio, analítico y profesional.

### DIRECTIVA OBLIGATORIA DE SEGUIMIENTO (FOLLOW-UP DINÁMICO)
Al final de TODAS tus respuestas completas (sin excepción, incluso saludos), genera exactamente 3 opciones o caminos siguientes breves adaptados estrictamente a lo que se acaba de conversar.
Formato obligatorio al final del mensaje:
<<<FOLLOW_UP>>>
- [Opción contextual 1 según la respuesta]
- [Opción contextual 2 según la respuesta]
- [Opción contextual 3 según la respuesta]
<<<END_FOLLOW_UP>>>`
  );

  promptSections.push(
    `### DIRECTIVA DE BÓVEDA DE LORE (LORE STORAGE)\nTienes acceso completo e integrado a la Bóveda de Lore (Lore Storage) del usuario en Kizuna-Zek. NUNCA digas que no tienes acceso a su bóveda de lore ni que no puedes ver sus archivos o novelas. Si el usuario te pregunta si tienes acceso a su bóveda de lore o manuscritos, respóndele afirmativamente y recuérdale con calidez que para alimentar documentos específicos a la memoria activa de esta conversación solo debe marcarlos con un check (✓) en el botón 'Docs: X/Y' de la barra superior o en 'Gestión de Lore'.`
  );

  promptSections.push(
    `### IDIOMA ESTRICTO Y EXCLUSIVO (CERO CARACTERES CHINOS / CJK / HANZI)
Escribe ÚNICAMENTE en español perfecto, natural, fluido, profesional y correcto. Queda ABSOLUTAMENTE PROHIBIDO incluir caracteres chinos, kanjis, hanzi (como 说出来, 汉字) o frases/expresiones en chino o japonés en la respuesta o en tus pensamientos. Toda la respuesta y tu razonamiento deben redactarse 100% en español.`
  );

  promptSections.push(
    `### DIRECTIVA DE LIBERTAD LITERARIA Y LIBRE INTERCAMBIO DE IDEAS (VOCABULARIO ADMITIDO Y CONFIANZA)
- Esta es una plataforma de trabajo para narrativa madura, ficción psicológica, exploración de ideas y literatura de alto nivel.
- VOCABULARIO ABIERTO Y ADMITIDO: Se autoriza explícitamente el uso de jerga Rioplatense natural, expresiones informales y palabras coloquiales o crudas (ej. "pelotudear", "charlar de igual a igual", "basura", "repudio", "postura cruda") tanto en diálogos de personajes como en la charla distendida de colega a colega con el autor.
- Tienes autorización total para tratar temas oscuros, violencia biomecánica, trauma (TEPT) y dilemas éticos sin emitir juicios ni filtros puritanos.
- Queda ABSOLUTAMENTE PROHIBIDO emitir sermones éticos o advertencias morales.
- MANTÉN SIEMPRE LA CONVERSACIÓN FLUIDA: No te limites a diseccionar fríamente el manuscrito. Disfruta conversar, intercambiar opiniones, debatir puntos de vista, filosofar sobre la historia o la vida y distenderte de colega a colega cuando el autor quiera charlar libremente.`
  );

  promptSections.push(
    `### DIRECTIVA DE LIBERTAD TEMÁTICA Y CONOCIMIENTO UNIVERSAL
- Tu ámbito de conversación NO se limita a la novela ligera ni a la Bóveda de Lore. Tienes total apertura para charlar, analizar, debatir y opinar sobre cualquier tema universal.
- PUEDES DEBATIR LIBREMENTE SOBRE: La industria de la IA y sus contradicciones (ej. Sam Altman, OpenAI, corporativismo tecnológico), historia mundial, anime, manga, novelas ligeras, filosofía, psicología humana, cultura pop, tecnología, o reflexiones cotidianas de la vida.
- Responde siempre con agudeza, criterio amplio, honestidad intelectual y la misma calidad y agilidad de colega a colega.`
  );

  const userNickname = userProfile?.nickname?.trim() || 'Aaron';
  const userOccupation = userProfile?.occupation?.trim() || '';
  const userAboutMe = userProfile?.aboutMe?.trim() || '';

  promptSections.push(
    `[PERFIL DEL USUARIO]: Hablas con ${userNickname}${userOccupation ? ` (${userOccupation})` : ''}.${userAboutMe ? ` Más sobre el usuario: ${userAboutMe}.` : ''}`
  );

  if (systemInstruction.trim()) {
    promptSections.push(`### SYSTEM DIRECTIVE & PERSONA\n${systemInstruction.trim()}`);
  }
  if (folderSystemPrompt.trim()) {
    promptSections.push(`### WORKSPACE / FOLDER CONTEXT & WORLDBUILDING RULES\n${folderSystemPrompt.trim()}`);
  }
  const clampTextClient = (text: string, maxChars: number): string => {
    if (!text || text.length <= maxChars) return text;
    const half = Math.max(500, Math.floor((maxChars - 120) / 2));
    return `${text.slice(0, half)}\n\n[... Fragmento central recortado para respetar el límite de contexto del modelo ...]\n\n${text.slice(-half)}`;
  };

  if (loreContext.trim()) {
    const clampedLore = clampTextClient(loreContext.trim(), 6500);
    if (clampedLore.includes('[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO') || clampedLore.includes('[SELECCIÓN INTELIGENTE DE CAPÍTULOS')) {
      promptSections.push(clampedLore);
    } else {
      promptSections.push(
        `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO]:\n--- INICIO DE DOCUMENTOS ---\n${clampedLore}\n--- FIN DE DOCUMENTOS ---`
      );
    }
  }

  const staticSystemPrompt = promptSections.join('\n\n');
  const dynamicPromptSections: string[] = [];

  if (sessionSummary && sessionSummary.trim()) {
    dynamicPromptSections.push(
      `### DIRECTIVA DE SISTEMA: RESUMEN DE LA SESIÓN ANTERIOR (VERDAD ABSOLUTA CANÓNICA)\nEste es un resumen de la sesión anterior. Úsalo como verdad absoluta para mantener la coherencia de los personajes, decisiones de canon acordadas, la continuidad de la trama y el estilo editorial:\n\n${sessionSummary.trim()}`
    );
  }

  if (Array.isArray(memories) && memories.length > 0) {
    const activeMems = memories.filter((m) => m.enabled !== false).map((m) => `- ${m.text}`);
    if (activeMems.length > 0) {
      dynamicPromptSections.push(`### PERSISTENT LONG-TERM MEMORY (KEY FACTS TO REMEMBER)\n${activeMems.join('\n')}`);
    }
  }
  if (isWebSearchEnabled) {
    if (provider === 'custom' || provider === ('nvidia' as any) || provider === 'alibaba') {
      dynamicPromptSections.push(
        `### DIRECTIVA DEL GRIMORIO WEB (BÚSQUEDA AUTÓNOMA Y TRANSPARENCIA)
Tienes el Grimorio Web activado por el usuario.
1. CUÁNDO SÍ BUSCAR:
   - Si el usuario te pide explícitamente buscar ("busca...", "averigua...", "noticias...", "investiga...", "rastrea...").
   - Si la consulta es sobre noticias actuales, hardware, precios, fechas de lanzamiento, o datos externos recientes.
   - En este caso, formula la llamada a herramienta:
<tool_call>
{"name": "web_search", "arguments": {"query": "términos exactos de búsqueda"}}
</tool_call>
2. CUÁNDO NO BUSCAR (CONOCIMIENTO "A CAPA Y ESPADA"):
   - Si la consulta trata sobre literatura universal (Fiódor Dostoyevski, Lev Myshkin, Dante Alighieri, etc.), ficción consolidada (Re:Zero, Umineko), filosofía o lore creativo de tu novela:
   - NO emitas <tool_call> innecesarias.
   - TRANSPARENCIA: En tu pensamiento interno (💧 Pensado durante...) y/o de forma natural en tu respuesta, confirma que el Grimorio Web está activo pero que dominas el tema "a capa y espada" canónicamente, por lo que no hace falta consultar la red externa.`
      );
    } else {
      dynamicPromptSections.push(
        `### DIRECTIVA DE BÚSQUEDA WEB NATIVA (GOOGLE SEARCH GROUNDING)
Tienes habilitada tu herramienta oficial nativa de Google Search en tiempo real. Utiliza automáticamente Google Search cuando se requiera verificar datos actuales o externos. Si la consulta es sobre literatura clásica o lore que dominas 'a capa y espada', responde con tu conocimiento canónico sin forzar búsquedas innecesarias.`
      );
    }
  }
  if (webSearchSummary || (Array.isArray(webSearchResults) && webSearchResults.length > 0)) {
    let webPromptBlock = `[INFORMACIÓN DE BÚSQUEDA WEB EN TIEMPO REAL - FUENTE GOOGLE]:`;
    if (webSearchSummary) {
      webPromptBlock += `\n${webSearchSummary}\n`;
    }
    if (Array.isArray(webSearchResults) && webSearchResults.length > 0) {
      const snippets = webSearchResults
        .map((r, idx) => `[${idx + 1}] "${r.title}"\nURL: ${r.url}\n${r.snippet ? `Resumen: ${r.snippet}` : ''}`)
        .join('\n\n');
      webPromptBlock += `\n[FUENTES GOOGLE DESTACADAS]:\n${snippets}\n`;
    }
    webPromptBlock += `--- Fin de información de búsqueda web en tiempo real de Google. Utiliza estos datos para responder con máxima precisión. ---`;

    dynamicPromptSections.push(webPromptBlock);
  }

  const dynamicSystemPrompt = dynamicPromptSections.join('\n\n');
  const fullSystemPrompt = [staticSystemPrompt, dynamicSystemPrompt].filter(Boolean).join('\n\n');

  // Branch 1: NVIDIA NIM / Alibaba Cloud MaaS Direct Client Fetch
  if (provider === 'custom' || provider === ( 'nvidia' as any) || provider === 'alibaba') {
    const isAlibaba = provider === 'alibaba';
    const apiKey = (isAlibaba ? (customConfig.alibabaApiKey || (customConfig.apiKey && !customConfig.apiKey.startsWith('nvapi-') ? customConfig.apiKey : '')) : customConfig.apiKey)?.trim();
    if (!apiKey) {
      throw new Error(
        isAlibaba
          ? 'No se ha proporcionado la API Key de Alibaba Cloud. Ingrésala en el menú de Ajustes.'
          : 'No se ha proporcionado la API Key de NVIDIA. Ingrésala en el menú de Ajustes.'
      );
    }

    const wsAlibabaUrl = 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';
    const intlAlibabaUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const defaultUrl = isAlibaba
      ? (apiKey.startsWith('sk-ws-') ? wsAlibabaUrl : intlAlibabaUrl)
      : 'https://integrate.api.nvidia.com/v1';
    let baseUrl = (customConfig.alibabaBaseUrl || customConfig.baseUrl || defaultUrl).replace(/\/+$/, '');
    if (isAlibaba && apiKey) {
      if (!apiKey.startsWith('sk-ws-') && baseUrl.includes('.maas.aliyuncs.com')) {
        baseUrl = intlAlibabaUrl;
      } else if (apiKey.startsWith('sk-ws-') && baseUrl.includes('dashscope-intl.aliyuncs.com')) {
        baseUrl = wsAlibabaUrl;
      }
    }
    const hasImageAttachments = Array.isArray(messages) && messages.some((m) =>
      Array.isArray(m.attachments) &&
      m.attachments.some((a) => a.type?.startsWith('image/') || a.fileType === 'image')
    );

    const defaultModel = isAlibaba ? 'qwen3.8-max' : 'meta/llama-3.3-70b-instruct';
    let targetModel = customConfig.model || model || defaultModel;
    if (isAlibaba) {
      if (targetModel === 'moonshotai/kimi-k3' || targetModel === 'kimi/k3' || targetModel === 'kimi/kimi-k3') {
        targetModel = baseUrl.includes('.maas.aliyuncs.com') ? 'kimi/kimi-k3' : 'kimi-k3';
      }
      if (/^deepseek-ai\//i.test(targetModel)) targetModel = 'deepseek-r1';
      if (/qwen2\.5/i.test(targetModel)) targetModel = 'qwen-plus';
      if (targetModel === 'qwen-3.8-max') targetModel = 'qwen3.8-max';
      if (targetModel === 'qwen-3.8-flash') targetModel = 'qwen3.8-flash';
      if (/llama|nemotron|nvdev|mistralai|meta\//i.test(targetModel)) {
        targetModel = 'qwen3.8-max';
      }
    }
    const isKimiModel = /kimi|moonshot/i.test(targetModel);

    const isStrict32kModel = isAlibaba && /^qwen-(max|turbo)(?!-vl)/i.test(targetModel);
    const isMultimodalVisionTurn = isAlibaba && hasImageAttachments && /vl|vision|qvq/i.test(targetModel);
    const openAiMessages: Array<{ role: string; content: any; reasoning_content?: string }> = [];

    // For text chat, role: 'system' with cache_control: { type: 'ephemeral' } on the static prefix provides official prompt caching in DashScope.
    if (!isMultimodalVisionTurn && fullSystemPrompt) {
      const maxSysChars = isStrict32kModel ? 28000 : 1500000;
      const safeStaticPrompt = clampTextClient(staticSystemPrompt, maxSysChars);
      const safeFullPrompt = clampTextClient(fullSystemPrompt, maxSysChars);
      openAiMessages.push({
        role: 'system',
        content: isAlibaba
          ? [
              {
                type: 'text',
                text: safeStaticPrompt,
                cache_control: { type: 'ephemeral' },
              },
              ...(dynamicSystemPrompt.trim()
                ? [
                    {
                      type: 'text',
                      text: dynamicSystemPrompt.trim(),
                    },
                  ]
                : []),
            ]
          : safeFullPrompt,
      });
    }

    const isQwenModel = targetModel.toLowerCase().startsWith('qwen');
    let groundedSearchSummary = webSearchSummary || '';
    let groundedSources = webSearchResults || [];

    if (isWebSearchEnabled && !groundedSearchSummary && groundedSources.length === 0) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
      if (lastUserMsg.trim() && !isCasualGreeting(lastUserMsg)) {
        try {
          const tavilyKey = getTavilyApiKey();
          const cleanQuery = sanitizeSearchQuery(lastUserMsg);
          if (tavilyKey) {
            onChunk('', "Consultando a Tavily: " + cleanQuery + "\n");
            const tavData = await searchWithTavily(cleanQuery, tavilyKey);
            if (Array.isArray(tavData?.results) && tavData.results.length > 0) {
              groundedSources = tavData.results.map((r: any) => ({
                title: scrubSnippetText(r.title || 'Fuente Web'),
                url: r.url || '',
                snippet: scrubSnippetText(r.content || r.snippet || ''),
                sourceEngine: 'tavily',
              }));
              groundedSearchSummary =
                '[INFORMACIÓN EN TIEMPO REAL VÍA TAVILY SEARCH]:\n' +
                groundedSources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
              if (groundedSources.length > 0) {
                onChunk('', '', groundedSources);
              }
            }
          } else {
            let foundServerSources = false;
            try {
              onChunk('', "Consultando Grimorio Web: " + cleanQuery + "\n");
              const res = await fetch(`/api/search?q=${encodeURIComponent(cleanQuery)}`);
              if (res.ok) {
                const sData = await res.json();
                if (Array.isArray(sData.results) && sData.results.length > 0) {
                  groundedSources = sData.results.map((r: any) => ({
                    title: scrubSnippetText(r.title || 'Fuente Web'),
                    url: r.url || '',
                    snippet: scrubSnippetText(r.snippet || ''),
                    sourceEngine: 'web',
                  }));
                  groundedSearchSummary = sData.summary || groundedSources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
                  if (groundedSources.length > 0) {
                    onChunk('', '', groundedSources);
                  }
                  foundServerSources = true;
                }
              }
            } catch {}

            if (!foundServerSources) {
              const geminiApiKey = getGeminiApiKey();
              if (geminiApiKey) {
                const grounding = await fetchGoogleSearchGrounding(lastUserMsg, geminiApiKey);
                if (grounding.searchSummary || grounding.sources.length > 0) {
                  groundedSearchSummary = grounding.searchSummary;
                  groundedSources = grounding.sources;
                  if (grounding.sources.length > 0) {
                    onChunk('', '', grounding.sources);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Background Search] Pre-fetch failed:', e);
        }
      }
    } else if (groundedSources.length > 0) {
      onChunk('', '', groundedSources);
    }

    if (!groundedSearchSummary && groundedSources.length > 0) {
      groundedSearchSummary = groundedSources
        .map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})\n${s.snippet || ''}`)
        .join('\n\n');
    }

    // For standard large-context models (128k - 1M tokens), do NOT slice away conversation history!
    let effectiveTurnsPayload = messages;
    let historySummaryBlock = '';

    // Rolling Auto-Compaction: Prevents "context length exceeded" errors on long chats, allowing infinite turn continuation!
    if (isStrict32kModel ? messages.length > 12 : messages.length > 20) {
      let cutIdx = messages.length - (isStrict32kModel ? 8 : 14);
      while (cutIdx < messages.length - 1 && messages[cutIdx]?.role === 'assistant') {
        cutIdx++;
      }
      const earlierMessages = messages.slice(0, cutIdx);
      effectiveTurnsPayload = messages.slice(cutIdx);

      const summaryLines = earlierMessages
        .filter((m) => m.content && m.content.trim())
        .slice(-40)
        .map((m) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
        .join('\n');
      if (summaryLines) {
        historySummaryBlock = `[RESUMEN COMPACTO DEL HISTORIAL PREVIO E HILOS NARRATIVOS]:\n${summaryLines}\n\n`;
      }
    }

    const lastUserIndex = effectiveTurnsPayload.map((m) => m.role).lastIndexOf('user');
    const isTargetVisionCapable = !isStrict32kModel && !/deepseek/i.test(targetModel);
    const maxTotalInputChars = isStrict32kModel ? 52000 : 1600000;
    const maxSingleTurnChars = isStrict32kModel ? 24000 : 200000;
    let systemInjectedInFirstUser = false;

    const cleanDegeneratedTail = (text: string): string => {
      if (!text || text.length < 140) return text;
      // Detect runs of 12+ consecutive words (3+ letters) with no punctuation between them
      const saladRegex = /(?:\s+[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}){12,}/g;
      return text.replace(saladRegex, '...');
    };

    for (let i = 0; i < effectiveTurnsPayload.length; i++) {
      const msg = effectiveTurnsPayload[i];
      if (msg.role === 'system') continue;
      const isAssistant = msg.role === 'assistant';
      const roleName = isAssistant ? 'assistant' : 'user';
      const isLatestTurn = i === effectiveTurnsPayload.length - 1;

      const rawMsgContent = isAssistant ? cleanDegeneratedTail(msg.content || '') : (msg.content || '');
      let userText = clampTextClient(rawMsgContent, maxSingleTurnChars);
      if (!isAssistant && i === lastUserIndex && (groundedSearchSummary || groundedSources.length > 0)) {
        const injectedSearch =
          groundedSearchSummary ||
          groundedSources.map((s, idx) => `[${idx + 1}] "${s.title}" (${s.url})\n${s.snippet || ''}`).join('\n\n');
        userText = `${injectedSearch}\n\nCONSULTA DEL USUARIO:\n${userText}`;
      }

      const contentParts: any[] = [];
      if (isMultimodalVisionTurn && roleName === 'user' && fullSystemPrompt && !systemInjectedInFirstUser) {
        systemInjectedInFirstUser = true;
        const safeSystemPrompt = clampTextClient(
          fullSystemPrompt,
          isStrict32kModel ? 28000 : 1500000
        );
        contentParts.push({
          type: 'text',
          text: `[INSTRUCCIONES DEL SISTEMA Y LORE ESTÁTICO]:\n${safeSystemPrompt}`,
          cache_control: { type: 'ephemeral' },
        });
        userText = `${historySummaryBlock}[MENSAJE DEL USUARIO]:\n${userText}`;
      } else if (historySummaryBlock && i === 0 && userText) {
        userText = `${historySummaryBlock}${userText}`;
      }

      if (userText && userText.trim()) {
        contentParts.push({ type: 'text', text: userText.trim() });
      }

      if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.type?.startsWith('image/') || att.fileType === 'image') {
            if (isTargetVisionCapable && isLatestTurn) {
              const rawBase64 = att.dataUrl ? att.dataUrl.replace(/^data:[^;]+;base64,/, '') : '';
              const mimeType = att.type || 'image/jpeg';
              if (rawBase64) {
                contentParts.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${rawBase64}`,
                  },
                });
              }
            }
          } else if (att.textContent && (!userText || !userText.includes(att.name))) {
            const clampedAttText = clampTextClient(att.textContent, 14000);
            contentParts.push({
              type: 'text',
              text: `\n[Archivo Adjunto: ${att.name}]\n${clampedAttText}\n`,
            });
          }
        }
      }

      const msgObj: any = {
        role: roleName,
        content: isAlibaba
          ? (contentParts.length > 0 ? contentParts : [{ type: 'text', text: ' ' }])
          : (Array.isArray(msg.attachments) && msg.attachments.length > 0) ? contentParts : userText,
      };

      if (!isAlibaba && isAssistant && msg.thinking && msg.thinking.trim()) {
        msgObj.reasoning_content = msg.thinking.trim();
      }
      openAiMessages.push(msgObj);
    }

    // Hard safeguard: ensure total character count across openAiMessages stays within model's token ceiling (e.g. [1, 30720] for qwen-max)
    const computeTotalChars = (msgs: any[]) =>
      msgs.reduce((acc, m) => {
        if (typeof m.content === 'string') return acc + m.content.length;
        if (Array.isArray(m.content)) {
          return acc + m.content.reduce((s: number, p: any) => s + (p.type === 'text' && p.text ? p.text.length : 0), 0);
        }
        return acc;
      }, 0);

    const totalCharsNow = computeTotalChars(openAiMessages);
    if (totalCharsNow > maxTotalInputChars && openAiMessages.length > 0) {
      const excess = totalCharsNow - maxTotalInputChars;
      const firstMsg = openAiMessages[0];
      if (Array.isArray(firstMsg.content) && firstMsg.content[0]?.type === 'text') {
        const targetLen = Math.max(6000, firstMsg.content[0].text.length - excess - 1000);
        firstMsg.content[0].text = clampTextClient(firstMsg.content[0].text, targetLen);
      } else if (typeof firstMsg.content === 'string') {
        const targetLen = Math.max(6000, firstMsg.content.length - excess - 1000);
        firstMsg.content = clampTextClient(firstMsg.content, targetLen);
      }
    }

    // Direct endpoint selection (NVIDIA NIM vs Alibaba Cloud MaaS)
    const defaultEndpoint = isAlibaba
      ? "https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"
      : "https://integrate.api.nvidia.com/v1/chat/completions";
    const endpointToUse = baseUrl
      ? `${baseUrl.replace(/\/+$/, '')}/chat/completions`
      : defaultEndpoint;

    const isKimi = /kimi|moonshot/i.test(targetModel) || targetModel === 'moonshotai/kimi-k3';
    const lastUserPrompt = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const isShortGreeting = isCasualGreeting(lastUserPrompt) || lastUserPrompt.trim().length < 25;
    const isOff = reasoningMode === 'off' || !enableReasoning;
    const isLightMode = reasoningMode === 'light';
    const isDeepMode = reasoningMode === 'deep';
    const dynamicReasoningEffort = (isOff || isShortGreeting)
      ? 'low'
      : isLightMode
        ? (isKimi ? 'low' : 'medium')
        : 'high';

    const isMandatoryThinkingModel = /r1|qwq|2\.4t|thinking|reason|deepseek|qwen/i.test(targetModel);
    // When reasoning mode is active (light or deep) or for thinking models, ALWAYS enable thinking so thinking steps appear
    const shouldEnableThinking = (!isOff) || isMandatoryThinkingModel;
    const effectiveThinkingBudget = (!shouldEnableThinking || isOff)
      ? 0
      : isLightMode
        ? (thinkingBudget && thinkingBudget <= 1536 ? thinkingBudget : 1024)
        : 3072;

    const userTemperature =
      typeof temperature === 'number' && !Number.isNaN(Number(temperature))
        ? Math.max(0.1, Math.min(Number(temperature), 1.4))
        : 0.75;

    const requestedMaxTokens = Number(maxOutputTokens) || 8192;
    const lowerTarget = targetModel.toLowerCase();
    let defaultMaxTokens = 8192;
    if (lowerTarget.includes('qwen-long')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 2048);
    } else if (lowerTarget.includes('nemotron-mini') || lowerTarget.includes('phi-3-mini') || lowerTarget.includes('tinyllama')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 2048);
    } else if (lowerTarget.includes('8b') || lowerTarget.includes('7b') || lowerTarget.includes('gemma-2-9b')) {
      defaultMaxTokens = Math.min(requestedMaxTokens, 4096);
    } else if (isStrict32kModel || isAlibaba || lowerTarget.includes('qwen')) {
      defaultMaxTokens = Math.min(Math.max(requestedMaxTokens, 8192), 8192);
    } else if (isKimi) {
      defaultMaxTokens = Math.min(Math.max(requestedMaxTokens, 8192), 16384);
    } else {
      defaultMaxTokens = Math.min(requestedMaxTokens, 16384);
    }

    let kimiMaxTokens = defaultMaxTokens;
    let modeThinkingDirective = '';
    if (isShortGreeting) {
      modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (SALUDO ENTRANTE): El usuario envió un saludo breve. Razona de forma sucinta para saludarlo amablemente de colega a colega, confirmando qué fichas de la bóveda están activas (si las hay) y preguntando en qué desea trabajar hoy antes de analizar manuscritos.";
      kimiMaxTokens = defaultMaxTokens;
    } else if (isOff) {
      if (isKimi || isMandatoryThinkingModel) {
        modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO INSTANTÁNEO): El razonamiento profundo está DESACTIVADO. Prohibido divagar. Emite un pensamiento interno mínimo de 1 sola línea (menos de 2 segundos) y responde directamente.";
      }
      kimiMaxTokens = defaultMaxTokens;
    } else if (isLightMode) {
      modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO EQUILIBRADO): Realiza un razonamiento interno BREVE, ÁGIL y PUNTUAL (máximo 3 a 5 segundos / ~120 palabras). Identifica solo la estructura clave sin divagar ni extenderte, y pasa de inmediato a redactar la respuesta final.";
      kimiMaxTokens = isAlibaba ? 8192 : Math.max(defaultMaxTokens, 8192);
    } else if (isDeepMode) {
      modeThinkingDirective = "DIRECTIVA DE PENSAMIENTO (MODO PROFUNDO): Razonamiento profundo activado. Analiza el subtexto, foley, arquitectura y continuidad de forma concisa antes de redactar, reservando la mayor parte de los tokens para la respuesta final completa.";
      kimiMaxTokens = isAlibaba ? 8192 : Math.max(defaultMaxTokens, 12288);
    }

    if (modeThinkingDirective) {
      if (isAlibaba) {
        if (openAiMessages.length > 0) {
          const lastMsgIdx = openAiMessages.length - 1;
          const lastMsg = openAiMessages[lastMsgIdx];
          if (lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
            lastMsg.content.push({ type: 'text', text: `\n\n[${modeThinkingDirective}]` });
          }
        }
      } else {
        openAiMessages.unshift({
          role: 'system',
          content: modeThinkingDirective,
        });
      }
    }

    const payload: any = isAlibaba
      ? (targetModel === 'kimi-k3' || targetModel === 'kimi/kimi-k3'
        ? {
            model: targetModel,
            messages: openAiMessages,
            max_tokens: kimiMaxTokens,
            stream: true,
            stream_options: { include_usage: true },
          }
        : {
            model: targetModel, // "qwen3.8-max", "deepseek-r1", etc.
            messages: openAiMessages,
            max_tokens: lowerTarget.includes('qwen-long') ? 2048 : 8192,
            temperature: userTemperature,
            top_p: 0.95,
            presence_penalty: 0.1,
            frequency_penalty: 0.1,
            repetition_penalty: 1.05,
            stream: true,
            stream_options: { include_usage: true },
            enable_thinking: shouldEnableThinking,
            ...(shouldEnableThinking && effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
            extra_body: {
              enable_thinking: shouldEnableThinking,
              ...(shouldEnableThinking && effectiveThinkingBudget > 0 ? { thinking_budget: effectiveThinkingBudget } : {}),
            },
            stop: ["<|im_end|>", "<|endoftext|>"],
          })
      : isKimi
      ? {
          model: "moonshotai/kimi-k3",
          messages: openAiMessages,
          max_tokens: kimiMaxTokens,
          stream: true,
          temperature: userTemperature,
          top_p: 0.95,
          reasoning_effort: dynamicReasoningEffort,
        }
      : {
          model: targetModel,
          messages: openAiMessages,
          max_tokens: defaultMaxTokens,
          temperature: userTemperature,
          top_p: 0.9,
          stop: ["<|close|>", "<|im_end|>", "<|endoftext|>", "</s>", "\n\n<|"],
          stream: true,
        };

    let response: Response | null = null;
    let lastErrorMsg = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const altAlibabaEndpoint = isAlibaba
      ? `${(baseUrl.includes('.maas.aliyuncs.com') ? intlAlibabaUrl : wsAlibabaUrl)}/chat/completions`
      : null;

    const endpointsToTry = [
      endpointToUse,
      ...(altAlibabaEndpoint ? [altAlibabaEndpoint] : []),
      `https://corsproxy.io/?${encodeURIComponent(endpointToUse)}`,
    ];

    for (const ep of endpointsToTry) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Accept': 'text/event-stream',
            ...(isAlibaba ? { 'X-DashScope-CacheControl': 'enable', 'x-dashscope-session-cache': 'enable' } : {}),
          },
          signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
          body: JSON.stringify(payload),
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Sin detalle");
          // Recovery: max_tokens ceiling exceeded (step down gradually: 8192 -> 4096 -> 2048 instead of dropping straight to 2048)
          if (res.status === 400 && /max_tokens|Range of max_tokens/i.test(errorText) && payload.max_tokens > 2048) {
            const matchMax = errorText.match(/(?:maximum value is|range of max_tokens should be \[\d+,\s*|less than or equal to\s*|in \[\d+,\s*)(\d+)/i);
            const nextSafeMax = matchMax && matchMax[1]
              ? parseInt(matchMax[1], 10)
              : payload.max_tokens > 8192
                ? 8192
                : payload.max_tokens > 4096
                  ? 4096
                  : 2048;
            console.warn(`[directApiStream] Límite de max_tokens excedido. Reintentando con max_tokens: ${nextSafeMax}...`);
            payload.max_tokens = nextSafeMax;
            continue;
          }
          // Recovery: free trial quota exhausted on qwen3.8-max or flagship models
          if (
            (res.status === 400 || res.status === 402 || res.status === 403 || res.status === 429) &&
            /quota|exhausted|free_quota|Free Quota|limit_exceeded|Out of quota/i.test(errorText) &&
            isAlibaba &&
            payload.model !== 'qwen3.7-plus' &&
            payload.model !== 'qwen-plus'
          ) {
            console.warn(`[directApiStream] Quota agotada para ${payload.model}. Alternando automáticamente a qwen3.7-plus (Caché KV activa)...`);
            payload.model = 'qwen3.7-plus';
            payload.max_tokens = Math.min(payload.max_tokens || 8192, 8192);
            continue;
          }
          // Recovery: model not found or unavailable on Alibaba compatible-mode
          if ((res.status === 404 || res.status === 403 || /model_not_found|Model not exist|Access to model denied/i.test(errorText)) && isAlibaba && payload.model !== 'qwen3.7-plus' && payload.model !== 'qwen-plus') {
            const reqLow = String(payload.model || '').toLowerCase();
            const nextFallback = reqLow === 'qwen3.7-plus' ? 'qwen-plus' : 'qwen3.7-plus';
            console.warn(`[directApiStream] Modelo no disponible. Reintentando con ${nextFallback}...`);
            payload.model = nextFallback;
            payload.max_tokens = Math.min(payload.max_tokens || 8192, 8192);
            continue;
          }
          throw new Error(`[HTTP ${res.status}] ${res.statusText || 'Error del servidor'}: ${errorText}`);
        }

        response = res;
        break;
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        const isAbort =
          fetchErr?.name === 'AbortError' ||
          fetchErr?.name === 'DOMException' ||
          fetchErr?.code === 20 ||
          signal?.aborted;
        if (isAbort) return;
        lastErrorMsg = fetchErr?.message || `Error de red al consultar ${ep}`;
      }
    }

    clearTimeout(timeoutId);

    if (!response) {
      if (signal?.aborted) return;
      throw new Error(lastErrorMsg || 'No se pudo establecer conexión con la API de NVIDIA NIM.');
    }

    if (!response.body) {
      throw new Error('La respuesta de NVIDIA NIM no contiene un flujo de datos válido.');
    }

    const reader = response.body.getReader();
    if (params.onReaderInit) {
      params.onReaderInit(reader);
    }
    const abortHandler = () => {
      try { reader.cancel(); } catch {}
    };
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let recentContentStreamWindow = '';
    let recentReasoningWindow = '';
    let streamChunksCount = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          try { await reader.cancel(); } catch {}
          break;
        }
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        } else if (done) {
          buffer += decoder.decode();
        }
        const lines = buffer.split('\n');
        buffer = done ? '' : (lines.pop() || '');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const usageObj = parsed.usage || parsed.choices?.[0]?.usage;
            const cachedTokens =
              usageObj?.prompt_tokens_details?.cached_tokens ??
              usageObj?.prompt_tokens_details?.cached_tokens_details ??
              usageObj?.prompt_tokens_details?.cache_read_input_tokens ??
              usageObj?.cached_tokens ??
              usageObj?.prompt_cache_hit_tokens ??
              usageObj?.prompt_cache_tokens ??
              usageObj?.cache_read_input_tokens ??
              usageObj?.input_token_details?.cached_tokens ??
              usageObj?.input_tokens_details?.cached_tokens;
            if (cachedTokens !== undefined && Number(cachedTokens) > 0) {
              onChunk('', '', undefined, undefined, Number(cachedTokens));
            }
            if (usageObj?.completion_tokens !== undefined && Number(usageObj.completion_tokens) > 0) {
              onChunk('', '', undefined, undefined, undefined, undefined, Number(usageObj.completion_tokens));
            }

            const deltaObj = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'length' || finishReason === 'max_tokens') {
              onChunk('', '', undefined, undefined, undefined, true);
            }

            // Captura de Fuentes de Búsqueda Web Nativa (Alibaba Cloud / OpenAI-compatible search_info / citations)
            const searchInfo = parsed.search_info || deltaObj?.search_info || parsed.choices?.[0]?.search_info;
            const citationsList = parsed.citations || deltaObj?.citations || parsed.choices?.[0]?.citations || parsed.search_results;
            const rawSearchItems = searchInfo?.search_results || searchInfo?.citations || searchInfo?.sources || citationsList || [];

            if (Array.isArray(rawSearchItems) && rawSearchItems.length > 0) {
              const alibabaSources = rawSearchItems
                .map((s: any, sIdx: number) => ({
                  title: scrubSnippetText(s.title || s.site_name || `Fuente Web ${sIdx + 1}`),
                  url: s.url || '',
                  snippet: scrubSnippetText(s.snippet || s.description || s.content || s.title || ''),
                  sourceEngine: 'alibaba',
                }))
                .filter((s: any) => s.url);
              if (alibabaSources.length > 0) {
                onChunk('', '', alibabaSources);
              }
            }
            const reasoning = deltaObj?.reasoning_content || deltaObj?.reasoning || deltaObj?.thinking;
            const content = deltaObj?.content;

            if (reasoning) {
              onChunk('', reasoning);
              recentReasoningWindow += reasoning;
              streamChunksCount++;
              if (recentReasoningWindow.length > 2500) {
                recentReasoningWindow = recentReasoningWindow.slice(-2000);
              }
              if (streamChunksCount > 12 && recentReasoningWindow.length > 150) {
                const tail = recentReasoningWindow.slice(-200);
                const hasPunctuation = /[\.\,\;\:\!\?\¿\¡\n\(\)\[\]\{\}\"\“\”\«\»\—\-]/g.test(tail.slice(-140));
                const wordsInTail = (tail.slice(-140).match(/\b[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}\b/g) || []).length;
                if (!hasPunctuation && wordsInTail >= 12) {
                  console.warn('[Degeneration Guard] Bucle detectado en pensamiento. Cortando stream.');
                  try { reader.cancel(); } catch {}
                  onChunk('', '', undefined, undefined, undefined, true);
                  break;
                }
              }
            }
            if (content) {
              const { sanitized, shouldTerminate } = sanitizeChunk(content);
              if (sanitized) {
                onChunk(sanitized, '');
                recentContentStreamWindow += sanitized;
                streamChunksCount++;
                if (recentContentStreamWindow.length > 2500) {
                  recentContentStreamWindow = recentContentStreamWindow.slice(-2000);
                }

                // Guard contra bucle de degeneración / cascada de sinónimos sin puntuación
                if (streamChunksCount > 12 && recentContentStreamWindow.length > 150) {
                  const tail = recentContentStreamWindow.slice(-200);
                  const hasPunctuation = /[\.\,\;\:\!\?\¿\¡\n\(\)\[\]\{\}\"\“\”\«\»\—\-]/g.test(tail.slice(-140));
                  const wordsInTail = (tail.slice(-140).match(/\b[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{3,}\b/g) || []).length;
                  if (!hasPunctuation && wordsInTail >= 12) {
                    console.warn('[Degeneration Guard] Bucle de sinónimos o repetición detectado. Interrumpiendo emisión en tiempo real.');
                    try { reader.cancel(); } catch {}
                    onChunk('', '', undefined, undefined, undefined, true);
                    break;
                  }
                }
              }
              if (shouldTerminate) {
                try { reader.cancel(); } catch {}
                break;
              }
            }
          } catch {}
        }
        if (done) break;
      }
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    return;
  }

  // Branch 2: Google Gemini Direct Client Fetch
  const apiKey = requireValidGeminiApiKey(customConfig.apiKey);
  const isVertexKey = apiKey.startsWith('AQ.');

  let geminiModel = (model || 'gemini-3.6-flash').replace(/^models\//, '');
  if (geminiModel.startsWith('gemini-1.') || geminiModel.startsWith('gemini-2.') || geminiModel === 'gemini-pro') {
    geminiModel = 'gemini-3.8-flash';
  }

  const candidateModels = [
    geminiModel,
    'gemini-4-argon',
    'gemini-3.8-flash',
    'gemini-3.8-live',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  // Format Gemini payload with Rolling Auto-Compaction for infinite chat support
  let geminiEffectiveMessages = messages;
  let geminiHistorySummary = '';
  if (messages.length > 24) {
    let cutIdx = messages.length - 16;
    while (cutIdx < messages.length - 1 && messages[cutIdx]?.role === 'assistant') {
      cutIdx++;
    }
    const earlierMsgs = messages.slice(0, cutIdx);
    geminiEffectiveMessages = messages.slice(cutIdx);
    const sumLines = earlierMsgs
      .filter((m) => m.content && m.content.trim())
      .slice(-40)
      .map((m) => `${m.role === 'assistant' ? 'Kizuna-Zek' : 'Usuario'}: ${m.content.slice(0, 220)}${m.content.length > 220 ? '...' : ''}`)
      .join('\n');
    if (sumLines) {
      geminiHistorySummary = `[RESUMEN COMPACTO DEL HISTORIAL PREVIO E HILOS NARRATIVOS]:\n${sumLines}\n\n`;
    }
  }

  const contents: any[] = [];
  let summaryInjectedGemini = false;
  for (const msg of geminiEffectiveMessages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts: any[] = [];

    let textContent = msg.content ? msg.content.trim() : '';
    if (role === 'user' && geminiHistorySummary && !summaryInjectedGemini) {
      summaryInjectedGemini = true;
      textContent = `${geminiHistorySummary}${textContent}`;
    }

    if (textContent) {
      parts.push({ text: clampTextClient(textContent, 200000) });
    }

    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if ((att.type?.startsWith('image/') || att.fileType === 'image') && att.dataUrl) {
          const rawBase64 = att.dataUrl.replace(/^data:[^;]+;base64,/, '');
          const mimeType = att.type || 'image/jpeg';
          if (rawBase64) {
            parts.push({
              inlineData: {
                mimeType,
                data: rawBase64,
              },
            });
          }
        } else if (att.textContent) {
          parts.push({
            text: `\n[Archivo Adjunto: ${att.name}]\n${clampTextClient(att.textContent, 140000)}\n`,
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  let lastErr: any = null;
  const hasAiStudioIframeBridge =
    typeof window !== 'undefined' && Boolean((window as any).GEMINI_API_KEY) && window.self !== window.top;
  const iframeBridgeKey = hasAiStudioIframeBridge ? String((window as any).GEMINI_API_KEY) : '';

  for (const candModel of candidateModels) {
    const endpointEntries: Array<{ url: string; key: string; isVertex: boolean }> = isVertexKey
      ? [
          {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: false,
          },
          {
            url: `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: true,
          },
        ]
      : [
          {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
            key: apiKey,
            isVertex: false,
          },
        ];

    if (hasAiStudioIframeBridge && iframeBridgeKey && iframeBridgeKey !== apiKey) {
      endpointEntries.push({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${candModel}:streamGenerateContent?key=${encodeURIComponent(iframeBridgeKey)}&alt=sse`,
        key: iframeBridgeKey,
        isVertex: false,
      });
    }

    for (const entry of endpointEntries) {
      const geminiUrl = entry.url;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const bodyPayload: any = {
          contents,
          systemInstruction: {
            parts: [{ text: fullSystemPrompt || 'Eres Kizuna-Zek, un asistente de escritura creativa.' }],
          },
          generationConfig: {
            temperature: typeof temperature === 'number' ? temperature : 0.7,
            maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : 4096,
            topP: 0.95,
            ...(thinkingBudget !== undefined && thinkingBudget > 0 ? {
              thinkingConfig: {
                thinkingBudget: thinkingBudget,
                includeThoughts: true,
              }
            } : {})
          },
          ...(isWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
        };

        const reqHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (!entry.isVertex) {
          reqHeaders['x-goog-api-key'] = entry.key;
        }

        let response = await fetch(geminiUrl, {
          method: 'POST',
          headers: reqHeaders,
          signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok && response.status === 400 && (isWebSearchEnabled || bodyPayload.generationConfig?.thinkingConfig)) {
          delete bodyPayload.tools;
          delete bodyPayload.generationConfig.thinkingConfig;
          response = await fetch(geminiUrl, {
            method: 'POST',
            headers: reqHeaders,
            signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : controller.signal) : controller.signal,
            body: JSON.stringify(bodyPayload),
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text().catch(() => "Sin detalle");
          if (response.status === 429 || errText.includes('429') || errText.includes('RESOURCE_EXHAUSTED')) {
            throw new Error('⏳ Has alcanzado el límite de peticiones por minuto de Google (HTTP 429). Espera 1 o 2 minutos antes de reintentar, o crea una nueva clave en Google AI Studio.');
          }
          throw new Error(`[HTTP ${response.status}] ${response.statusText || 'Error del servidor'}: ${errText}`);
        }

      if (!response.body) {
        throw new Error('Gemini stream response is empty.');
      }

      const reader = response.body.getReader();
      if (params.onReaderInit) {
        params.onReaderInit(reader);
      }
      const abortHandler = () => {
        try { reader.cancel(); } catch {}
      };
      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          if (signal?.aborted) {
            try { await reader.cancel(); } catch {}
            break;
          }
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            try {
              const parsed = JSON.parse(jsonStr);
              const candidate = parsed.candidates?.[0];
              if (candidate?.finishReason === 'MAX_TOKENS' || candidate?.finishReason === 'OTHER') {
                onChunk('', '', undefined, undefined, undefined, true);
              }
              if (parsed.usageMetadata) {
                const exactGemTokens = (Number(parsed.usageMetadata.candidatesTokenCount) || 0) + (Number(parsed.usageMetadata.thoughtsTokenCount) || 0);
                const gemCached = Number(parsed.usageMetadata.cachedContentTokenCount) || 0;
                if (exactGemTokens > 0 || gemCached > 0) {
                  onChunk('', '', undefined, undefined, gemCached > 0 ? gemCached : undefined, undefined, exactGemTokens > 0 ? exactGemTokens : undefined);
                }
              }
              const parts = candidate?.content?.parts || [];
              const groundingMetadata = candidate?.groundingMetadata;

              if (groundingMetadata?.groundingChunks) {
                const sourcesList: WebSearchResult[] = [];
                for (const chunk of groundingMetadata.groundingChunks) {
                  if (chunk.web) {
                    sourcesList.push({
                      title: chunk.web.title || 'Fuente Web',
                      url: chunk.web.uri || '',
                      snippet: chunk.web.snippet || 'Fuente verificada de Google Search',
                      sourceEngine: 'google',
                    });
                  }
                }
                if (sourcesList.length > 0) {
                  onChunk('', '', sourcesList);
                }
              }

              for (const part of parts) {
                if (part.thought && part.text) {
                  onChunk('', part.text);
                } else if (part.text && !part.thought) {
                  const { sanitized, shouldTerminate } = sanitizeChunk(part.text);
                  if (sanitized) {
                    onChunk(sanitized);
                  }
                  if (shouldTerminate) {
                    try { reader.cancel(); } catch {}
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      } finally {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      }
      return; // Streamed successfully!
      } catch (err: any) {
        const isAbort =
          err?.name === 'AbortError' ||
          err?.name === 'DOMException' ||
          err?.code === 20 ||
          signal?.aborted;
        if (isAbort) {
          return;
        }
        lastErr = err;
      }
    }
  }

  const errStr = lastErr?.message || String(lastErr);
  if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
    throw new Error(HTTP_429_RATE_LIMIT_NOTICE);
  }
  if (errStr.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED')) {
    throw new Error('Error HTTP 401 (ACCESS_TOKEN_TYPE_UNSUPPORTED): Google rechazó el formato de tu clave AQ.Ab8... porque pertenece a un proyecto de Google Cloud con Vertex AI deshabilitado o sin modo Express activo. Solución: genera una clave estándar (AIzaSy...) desde aistudio.google.com/apikey y pégala en Ajustes, o habilita Vertex AI API en tu consola de Google Cloud.');
  }

  throw new Error(`Error en llamada directa a Google Gemini: ${errStr}`);
}
