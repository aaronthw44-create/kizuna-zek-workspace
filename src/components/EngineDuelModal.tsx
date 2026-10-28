import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Columns,
  Play,
  Square,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Copy,
} from 'lucide-react';
import { AppSettings, Chat, Folder, LoreFile, Message } from '../types';
import { executeDirectApiStream } from '../utils/directApiStream';
import { compressLoreDocsTo2K, estimateTokenCount } from '../utils/documentParser';
import { filterLoreByDynamicRag } from '../utils/lorebookRag';
import { buildRollingSessionSummary } from '../utils/memoryDetector';
import { getGeminiApiKey, getNvidiaApiKey } from '../services/apiService';

export interface DuelEngineOption {
  id: string;
  label: string;
  provider: 'alibaba' | 'gemini' | 'custom';
  model: string;
  badge: string;
}

const DUEL_ENGINES: DuelEngineOption[] = [
  {
    id: 'alibaba_qwen38_max',
    label: 'Alibaba Qwen 3.8 Max',
    provider: 'alibaba',
    model: 'qwen3.8-max',
    badge: 'Alibaba MaaS',
  },
  {
    id: 'gemini_36_flash',
    label: 'Google Gemini 3.6 Flash',
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    badge: 'Google AI',
  },
  {
    id: 'nvidia_kimi_k3',
    label: 'NVIDIA Kimi K3',
    provider: 'custom',
    model: 'moonshotai/kimi-k3',
    badge: 'NVIDIA NIM',
  },
  {
    id: 'alibaba_qwen37_plus',
    label: 'Alibaba Qwen 3.7 Plus',
    provider: 'alibaba',
    model: 'qwen3.7-plus',
    badge: 'Alibaba MaaS',
  },
  {
    id: 'alibaba_deepseek_r1',
    label: 'Alibaba DeepSeek R1',
    provider: 'alibaba',
    model: 'deepseek-r1',
    badge: 'Alibaba MaaS',
  },
  {
    id: 'gemini_31_pro',
    label: 'Google Gemini 3.1 Pro',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    badge: 'Google AI',
  },
];

interface DuelSideState {
  text: string;
  thinking: string;
  isStreaming: boolean;
  error: string | null;
  ttftSeconds: number | null;
  reasoningSeconds: number | null;
  tokensPerSec: number | null;
  wordCount: number;
}

const INITIAL_SIDE_STATE: DuelSideState = {
  text: '',
  thinking: '',
  isStreaming: false,
  error: null,
  ttftSeconds: null,
  reasoningSeconds: null,
  tokensPerSec: null,
  wordCount: 0,
};

interface EngineDuelModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat | null;
  folder: Folder | null;
  loreFiles: LoreFile[];
  settings: AppSettings;
  onAdoptDuelResult: (
    promptText: string,
    winnerText: string,
    winnerThinking: string,
    winnerModelLabel: string,
    winnerModelId: string,
    runnerUpText?: string
  ) => void;
  onShowToast?: (msg: string) => void;
}

function cleanDuelProse(raw: string): { prose: string; inlineThought: string } {
  if (!raw) return { prose: '', inlineThought: '' };
  let extractedThought = '';
  let clean = raw;

  if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(raw)) {
    const closeMatch = raw.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
    if (closeMatch) {
      const preTag = closeMatch[1];
      const postTag = closeMatch[2];
      const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
      if (openMatch) {
        extractedThought = openMatch[1].trim();
        clean = postTag;
      } else {
        extractedThought = preTag.trim();
        clean = postTag;
      }
    }
  } else if (/(?:<think>|<thought>|<reasoning>|<cot>)/i.test(raw)) {
    const openMatch = raw.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
    if (openMatch) {
      extractedThought = openMatch[1].trim();
      clean = raw.slice(0, raw.toLowerCase().indexOf(openMatch[0].toLowerCase()));
    }
  }

  clean = clean
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '')
    .trim();

  return { prose: clean, inlineThought: extractedThought };
}

export const EngineDuelModal: React.FC<EngineDuelModalProps> = ({
  isOpen,
  onClose,
  chat,
  folder,
  loreFiles,
  settings,
  onAdoptDuelResult,
  onShowToast,
}) => {
  const [engineAId, setEngineAId] = useState<string>('alibaba_qwen38_max');
  const [engineBId, setEngineBId] = useState<string>('gemini_36_flash');
  const [promptInput, setPromptInput] = useState<string>('');
  const [mobileViewMode, setMobileViewMode] = useState<'split' | 'a' | 'b'>('split');

  const [sideA, setSideA] = useState<DuelSideState>(INITIAL_SIDE_STATE);
  const [sideB, setSideB] = useState<DuelSideState>(INITIAL_SIDE_STATE);
  const [expandedThinkingA, setExpandedThinkingA] = useState<boolean>(false);
  const [expandedThinkingB, setExpandedThinkingB] = useState<boolean>(false);

  const abortARef = useRef<AbortController | null>(null);
  const abortBRef = useRef<AbortController | null>(null);

  // Pre-fill prompt with last user message if empty when modal opens
  useEffect(() => {
    if (isOpen && !promptInput.trim() && chat && chat.messages.length > 0) {
      const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
      if (lastUser?.content) {
        setPromptInput(lastUser.content);
      }
    }
  }, [isOpen, chat?.id]);

  const stopAllStreams = () => {
    if (abortARef.current) {
      try {
        abortARef.current.abort();
      } catch {}
      abortARef.current = null;
    }
    if (abortBRef.current) {
      try {
        abortBRef.current.abort();
      } catch {}
      abortBRef.current = null;
    }
    setSideA((prev) => ({ ...prev, isStreaming: false }));
    setSideB((prev) => ({ ...prev, isStreaming: false }));
  };

  const runSingleSide = async (
    engine: DuelEngineOption,
    userPrompt: string,
    setSide: React.Dispatch<React.SetStateAction<DuelSideState>>,
    abortRef: React.MutableRefObject<AbortController | null>
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setSide({
      text: '',
      thinking: '',
      isStreaming: true,
      error: null,
      ttftSeconds: null,
      reasoningSeconds: null,
      tokensPerSec: null,
      wordCount: 0,
    });

    const maxHistoryWindow = settings.contextDepth === 'quick' ? 6 : 15;
    const allMsgs = chat?.messages || [];
    const olderMsgs = allMsgs.length > maxHistoryWindow ? allMsgs.slice(0, -maxHistoryWindow) : [];
    const recentMsgs = allMsgs.slice(-maxHistoryWindow);

    const selectedLore = chat
      ? loreFiles.filter((l) => Array.isArray(chat.selectedLoreFileIds) && chat.selectedLoreFileIds.includes(l.id))
      : [];

    const ragResult = filterLoreByDynamicRag(
      selectedLore,
      userPrompt,
      recentMsgs,
      settings.enableDynamicLoreRag !== false,
      8
    );

    const loreDocsText = compressLoreDocsTo2K(ragResult.injectedFiles, userPrompt);
    const loreContext = loreDocsText.trim()
      ? `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO (${ragResult.injectedFiles.length} documentos inyectados por RAG)]:\n--- INICIO DE DOCUMENTOS ---\n${loreDocsText.trim()}\n--- FIN DE DOCUMENTOS ---`
      : '';

    const validSavedSummary =
      chat?.sessionSummary && !chat.sessionSummary.includes(' [...] ') ? chat.sessionSummary : '';
    const rollingSummary =
      olderMsgs.length > 0
        ? validSavedSummary || buildRollingSessionSummary(olderMsgs)
        : validSavedSummary;

    const payloadMessages: Message[] = [
      ...recentMsgs,
      {
        id: `duel_usr_${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: Date.now(),
      },
    ];

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let firstProseTime: number | null = null;
    let rawTextAcc = '';
    let rawThinkAcc = '';

    try {
      await executeDirectApiStream({
        messages: payloadMessages,
        systemInstruction:
          settings.globalSystemPrompt ||
          'Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor.',
        folderSystemPrompt: folder?.systemPrompt || '',
        loreContext,
        sessionSummary: rollingSummary,
        memories: settings.enableMemoryToggle === false ? [] : settings.memories,
        userProfile: settings.userProfile,
        personalityConfig: settings.personalityConfig,
        isWebSearchEnabled: false,
        provider: engine.provider,
        customConfig: {
          apiKey:
            engine.provider === 'gemini'
              ? settings.geminiApiKey || getGeminiApiKey()
              : engine.provider === 'alibaba'
                ? settings.alibabaApiKey || ''
                : settings.customApiKey || getNvidiaApiKey(),
          alibabaApiKey: settings.alibabaApiKey || '',
          alibabaBaseUrl:
            settings.alibabaBaseUrl ||
            'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
          alibabaModel: engine.model,
          baseUrl:
            engine.provider === 'alibaba'
              ? settings.alibabaBaseUrl ||
                'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'
              : settings.customBaseUrl || 'https://integrate.api.nvidia.com/v1',
          model: engine.model,
        },
        maxOutputTokens: Math.min(settings.maxOutputTokens || 4096, 4096),
        temperature: settings.temperature || 0.75,
        model: engine.model,
        enableReasoning: settings.reasoningMode !== 'off',
        reasoningMode: settings.reasoningMode || 'light',
        thinkingBudget: settings.reasoningMode === 'deep' ? 4096 : 1536,
        signal: controller.signal,
        onChunk: (chunkText, reasoningChunk) => {
          const now = Date.now();
          if ((chunkText || reasoningChunk) && firstTokenTime === null) {
            firstTokenTime = now;
          }
          if (reasoningChunk) {
            rawThinkAcc += reasoningChunk;
          }
          if (chunkText) {
            rawTextAcc += chunkText;
          }

          const { prose, inlineThought } = cleanDuelProse(rawTextAcc);
          const fullThinking = [rawThinkAcc.trim(), inlineThought.trim()]
            .filter(Boolean)
            .join('\n\n');

          if (prose.length > 0 && firstProseTime === null) {
            firstProseTime = now;
          }

          const elapsedSec = Math.max(0.2, (now - (firstTokenTime || startTime)) / 1000);
          const estTokens = estimateTokenCount(prose + ' ' + fullThinking);
          const tokPerSec = estTokens > 0 ? +(estTokens / elapsedSec).toFixed(1) : null;
          const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;

          setSide({
            text: prose,
            thinking: fullThinking,
            isStreaming: true,
            error: null,
            ttftSeconds: firstTokenTime ? +((firstTokenTime - startTime) / 1000).toFixed(1) : null,
            reasoningSeconds:
              fullThinking && firstProseTime
                ? Math.max(0.3, +((firstProseTime - startTime) / 1000).toFixed(1))
                : fullThinking
                  ? Math.max(0.3, +((now - startTime) / 1000).toFixed(1))
                  : null,
            tokensPerSec: tokPerSec,
            wordCount: words,
          });
        },
      });

      setSide((prev) => ({ ...prev, isStreaming: false }));
    } catch (err: any) {
      if (controller.signal.aborted) {
        setSide((prev) => ({ ...prev, isStreaming: false }));
        return;
      }
      setSide((prev) => ({
        ...prev,
        isStreaming: false,
        error: err?.message || 'Error al consultar este motor',
      }));
    }
  };

  const handleStartDuel = () => {
    const cleanPrompt = promptInput.trim();
    if (!cleanPrompt) {
      onShowToast?.('Escribe una consulta o escena para iniciar el Duelo de Motores');
      return;
    }

    stopAllStreams();
    setExpandedThinkingA(false);
    setExpandedThinkingB(false);

    const engineA = DUEL_ENGINES.find((e) => e.id === engineAId) || DUEL_ENGINES[0];
    const engineB = DUEL_ENGINES.find((e) => e.id === engineBId) || DUEL_ENGINES[1];

    void Promise.all([
      runSingleSide(engineA, cleanPrompt, setSideA, abortARef),
      runSingleSide(engineB, cleanPrompt, setSideB, abortBRef),
    ]);
  };

  if (!isOpen) return null;

  const engineA = DUEL_ENGINES.find((e) => e.id === engineAId) || DUEL_ENGINES[0];
  const engineB = DUEL_ENGINES.find((e) => e.id === engineBId) || DUEL_ENGINES[1];
  const anyStreaming = sideA.isStreaming || sideB.isStreaming;

  const renderEngineColumn = (
    slotLabel: 'A' | 'B',
    engine: DuelEngineOption,
    selectedId: string,
    onSelectEngine: (id: string) => void,
    state: DuelSideState,
    otherState: DuelSideState,
    expandedThinking: boolean,
    setExpandedThinking: React.Dispatch<React.SetStateAction<boolean>>
  ) => (
    <div className="flex-1 flex flex-col min-w-0 bg-zinc-50 dark:bg-[#0d0d13] border border-zinc-200 dark:border-[#22222c] rounded-2xl overflow-hidden">
      {/* Column Header with Engine Selector */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-zinc-200 dark:border-[#1c1c26] bg-zinc-100/80 dark:bg-[#12121a]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
              slotLabel === 'A'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                : 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/40'
            }`}
          >
            {slotLabel}
          </span>
          <select
            value={selectedId}
            onChange={(e) => onSelectEngine(e.target.value)}
            disabled={anyStreaming}
            className="min-h-[40px] flex-1 bg-white dark:bg-[#09090d] border border-zinc-300 dark:border-[#272732] rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-amber-500/60 cursor-pointer truncate"
          >
            {DUEL_ENGINES.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label} ({opt.badge})
              </option>
            ))}
          </select>
        </div>

        {/* Live Telemetry Pill */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
          {state.ttftSeconds !== null && <span>TTFT {state.ttftSeconds}s</span>}
          {state.tokensPerSec !== null && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-[#1b1b26] text-amber-600 dark:text-amber-300 font-semibold">
              {state.tokensPerSec} tok/s
            </span>
          )}
        </div>
      </div>

      {/* Stream Body */}
      <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 min-h-[240px] max-h-[46dvh] smooth-scroll">
        {/* Internal Reasoning Block (Strictly collapsed by default with '💧 Pensado durante...') */}
        {state.thinking && (
          <div className="rounded-xl bg-zinc-100 dark:bg-[#13131c] border border-zinc-200 dark:border-[#242432] overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedThinking((prev) => !prev)}
              className="w-full min-h-[40px] px-3 py-2 flex items-center justify-between text-left text-xs font-mono text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5 truncate">
                <span>
                  💧 Pensado durante {state.reasoningSeconds ? `${state.reasoningSeconds}s` : '...'}
                </span>
              </span>
              {expandedThinking ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {expandedThinking && (
              <div className="px-3 pb-3 pt-1 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-[#1e1e2a] whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                {state.thinking}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {state.error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 dark:text-red-300 font-mono">
            {state.error}
          </div>
        )}

        {/* Prose Output */}
        {state.text ? (
          <div className="text-xs sm:text-sm text-zinc-800 dark:text-zinc-100 whitespace-pre-wrap leading-relaxed font-sans">
            {state.text}
          </div>
        ) : state.isStreaming ? (
          <div className="flex items-center gap-2 py-8 justify-center text-xs font-mono text-zinc-500 animate-pulse">
            <Sparkles size={14} className="text-amber-400" />
            <span>Generando interpretación con {engine.label}...</span>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-zinc-500 dark:text-zinc-500 font-mono">
            Pulsa &quot;Iniciar Duelo&quot; para comparar la prosa y el razonamiento de {engine.label}.
          </div>
        )}
      </div>

      {/* Column Footer Actions */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-zinc-200 dark:border-[#1c1c26] bg-zinc-100/60 dark:bg-[#101018]">
        <span className="text-[10px] font-mono text-zinc-500">
          {state.wordCount > 0 ? `${state.wordCount.toLocaleString()} palabras` : engine.badge}
        </span>

        <div className="flex items-center gap-1.5">
          {state.text && (
            <>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(state.text);
                  onShowToast?.(`Respuesta de ${engine.label} copiada`);
                }}
                className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-zinc-200/80 dark:bg-[#1a1a24] hover:bg-zinc-300 dark:hover:bg-[#242432] text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
                title="Copiar respuesta"
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                disabled={anyStreaming}
                onClick={() => {
                  onAdoptDuelResult(
                    promptInput.trim(),
                    state.text,
                    state.thinking,
                    engine.label,
                    engine.model,
                    otherState.text || undefined
                  );
                  onClose();
                }}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check size={14} />
                <span>Elegir e Inyectar al Chat</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[140] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm select-none">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          className="flex flex-col w-full max-w-6xl max-h-[94dvh] bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-[#22222a] rounded-2xl shadow-2xl text-zinc-900 dark:text-zinc-100 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-[#1c1c24] bg-zinc-50 dark:bg-[#0d0d12] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0">
                <Columns size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white truncate">
                  Modo Comparador: Duelo de Motores (Split View)
                </h2>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  Compara en paralelo Alibaba Qwen 3.8 Max vs Google Gemini 3.6 Flash o NVIDIA Kimi K3
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Mobile View Switcher */}
              <div className="flex md:hidden items-center bg-zinc-200 dark:bg-[#16161f] p-0.5 rounded-xl border border-zinc-300 dark:border-[#262634]">
                {(['split', 'a', 'b'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMobileViewMode(m)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                      mobileViewMode === m
                        ? 'bg-amber-500 text-black'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {m === 'split' ? '2x' : m === 'a' ? 'Motor A' : 'Motor B'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllStreams();
                  onClose();
                }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Cerrar duelo de motores"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Prompt Input Bar */}
          <div className="p-3.5 sm:px-5 border-b border-zinc-200 dark:border-[#1c1c24] bg-zinc-50/50 dark:bg-[#0b0b10] space-y-2.5 shrink-0">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="Escribe o pega la escena o consulta crítica para evaluar ambos motores en simultáneo..."
                rows={2}
                className="flex-1 bg-white dark:bg-[#12121a] border border-zinc-300 dark:border-[#252532] focus:border-amber-500/60 rounded-xl px-3.5 py-2.5 text-[16px] md:text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
              />
              <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                {anyStreaming ? (
                  <button
                    type="button"
                    onClick={stopAllStreams}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Square size={14} />
                    <span>Detener Duelo</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartDuel}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                  >
                    <Play size={14} />
                    <span>Iniciar Duelo en Paralelo</span>
                  </button>
                )}

                {chat && chat.messages.some((m) => m.role === 'user') && (
                  <button
                    type="button"
                    onClick={() => {
                      const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
                      if (lastUser?.content) setPromptInput(lastUser.content);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-200/70 dark:bg-[#171722] hover:bg-zinc-300 dark:hover:bg-[#20202e] border border-zinc-300 dark:border-[#2a2a38] text-[11px] font-mono text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Cargar el último mensaje enviado en el chat"
                  >
                    <RotateCcw size={12} />
                    <span>Último turno</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Split View Arena */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5">
            <div className="flex flex-col md:flex-row gap-4 h-full">
              {(mobileViewMode === 'split' || mobileViewMode === 'a') &&
                renderEngineColumn(
                  'A',
                  engineA,
                  engineAId,
                  setEngineAId,
                  sideA,
                  sideB,
                  expandedThinkingA,
                  setExpandedThinkingA
                )}
              {(mobileViewMode === 'split' || mobileViewMode === 'b') &&
                renderEngineColumn(
                  'B',
                  engineB,
                  engineBId,
                  setEngineBId,
                  sideB,
                  sideA,
                  expandedThinkingB,
                  setExpandedThinkingB
                )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
