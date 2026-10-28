import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Copy,
  Check,
  RotateCcw,
  Edit3,
  FileText,
  File,
  FileCheck,
  AlertCircle,
  Eye,
  BookOpen,
  Trash2,
  FileCode,
  Globe,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  Zap,
  Volume2,
  VolumeX,
  Palette,
  Loader2,
  Sparkles,
  Brain,
  Timer,
  Gauge,
  CloudUpload,
  Film,
  Play,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { RunicSealIcon } from './RunicSealIcon';
import { LivingInkDrop } from './LivingInkDrop';
import { CodeBlockCanvas } from './CodeBlockCanvas';
import { GenerativeCanvasCard } from './GenerativeCanvasCard';
import { WikiSectionHeading, InlineSourcePill, WebSearchPillsRow } from './WikiSectionHeading';
import { Message, Attachment, LoreFile } from '../types';
import { saveTextToGoogleDriveDoc, extractCleanDraftWithDeepSeek } from '../services/googleDriveService';

interface ChatMessageProps {
  message: Message;
  isLastAssistant: boolean;
  isInterrupted?: boolean;
  availableLoreFiles?: LoreFile[];
  onRegenerate?: () => void;
  onContinueMessage?: (messageId?: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onSelectVariant?: (messageId: string, variantIndex: number) => void;
  onAuditScene?: (targetText?: string) => void;
  onIllustrateScene?: (messageContent: string, messageId: string) => Promise<void> | void;
  onGenerateVideoScene?: (messageContent: string, messageId: string) => Promise<void> | void;
  onQuickPrompt?: (promptText: string) => void;
  onOpenImageLightbox: (attachment: Attachment) => void;
  onShowToast?: (text: string) => void;
  isPersonaWizardChat?: boolean;
  onApplyGlobalPersona?: (text: string) => void;
  onSelectFollowUp?: (text: string) => void;
  onOpenSettings?: () => void;
  onSwitchProvider?: (provider: 'gemini' | 'custom', modelId?: string) => void;
  onOpenDocumentPreview?: (item: any) => void;
  searchHighlightQuery?: string;
}

const highlightSearchText = (node: React.ReactNode, query?: string): React.ReactNode => {
  if (!query || !query.trim()) return node;
  if (typeof node === 'string') {
    const q = query.trim();
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = node.split(regex);
    if (parts.length <= 1) return node;

    return parts.map((part, index) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark
          key={index}
          className="search-highlight-keyword bg-amber-400/90 text-black font-bold px-1 py-0.5 rounded-md shadow-sm ring-1 ring-amber-300 font-sans inline transition-all duration-300"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <React.Fragment key={idx}>{highlightSearchText(child, query)}</React.Fragment>
    ));
  }

  if (React.isValidElement(node)) {
    if (node.type === 'mark' || node.type === 'code' || node.type === 'pre') {
      return node;
    }
    if ((node.props as any)?.children) {
      return React.cloneElement(
        node,
        node.props as any,
        highlightSearchText((node.props as any).children, query)
      );
    }
  }

  return node;
};

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isLastAssistant,
  isInterrupted = false,
  availableLoreFiles = [],
  searchHighlightQuery,
  onRegenerate,
  onContinueMessage,
  onEditMessage,
  onDeleteMessage,
  onSelectVariant,
  onAuditScene,
  onIllustrateScene,
  onGenerateVideoScene,
  onQuickPrompt,
  onOpenImageLightbox,
  onShowToast,
  isPersonaWizardChat = false,
  onApplyGlobalPersona,
  onSelectFollowUp,
  onOpenSettings,
  onSwitchProvider,
  onOpenDocumentPreview,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [isThoughtOpen, setIsThoughtOpen] = useState(false);
  const [isThoughtCopied, setIsThoughtCopied] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTts, setIsLoadingTts] = useState(false);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const isSpeechCancelledRef = useRef<boolean>(false);
  const [isIllustrating, setIsIllustrating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [isDriveSaved, setIsDriveSaved] = useState(false);
  const [apkDownloadModal, setApkDownloadModal] = useState<{
    active: boolean;
    step: string;
    progress: number;
    fileName: string;
    webViewLink?: string;
    isComplete?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!showActionMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
        setShowDeleteConfirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionMenu]);

  const cleanMessageContentForExport = (raw: string): string => {
    return (raw || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .trim();
  };

  const downloadSceneLocally = (content: string, titleHint?: string) => {
    try {
      const cleanContent = cleanMessageContentForExport(content);
      const fileName = `${(titleHint || 'Escena_Kizuna').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`;
      const blob = new Blob([cleanContent], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Fallback download error:', e);
    }
  };

  const handleSaveToDrive = async () => {
    if (isSavingToDrive || !message.content.trim()) return;
    setIsSavingToDrive(true);
    setApkDownloadModal({
      active: true,
      step: 'DeepSeek V4.1 Flash procesando borrador...',
      progress: 25,
      fileName: 'Analizando manuscrito...',
    });

    let key = '';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_settings_v2') || localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      key = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
    } catch {}

    let cleanTitle = 'Escena_Kizuna';
    let cleanContent = cleanMessageContentForExport(message.content);

    try {
      // 1. Run DeepSeek V4.1 Flash to extract strictly clean manuscript prose without AI filler
      const extracted = await extractCleanDraftWithDeepSeek(message.content, key);
      cleanTitle = extracted.title || cleanTitle;
      cleanContent = extracted.content || cleanContent;

      setApkDownloadModal({
        active: true,
        step: 'Sincronizando y guardando en Google Drive...',
        progress: 65,
        fileName: `${cleanTitle}.docx`,
      });

      // 2. Upload Google Doc to Drive
      const docTitle = `${cleanTitle} (Kizuna)`;
      const result = await saveTextToGoogleDriveDoc(docTitle, cleanContent);
      setIsDriveSaved(true);

      setApkDownloadModal({
        active: true,
        step: 'Manuscrito guardado en Google Drive',
        progress: 100,
        fileName: result.name,
        webViewLink: result.webViewLink,
        isComplete: true,
      });

      onShowToast?.(`Guardado en tu Google Drive: "${result.name}"`);
      setTimeout(() => setIsDriveSaved(false), 3500);
    } catch (err: any) {
      console.warn('Google Drive save notice:', err);
      downloadSceneLocally(cleanContent, cleanTitle || 'Escena');
      const isNetworkOrPopup = (err?.message || '').includes('bloqueó') || (err?.code || '').includes('network') || (err?.message || '').includes('network');

      setApkDownloadModal({
        active: true,
        step: 'Manuscrito descargado (.md)',
        progress: 100,
        fileName: `${cleanTitle}.md`,
        isComplete: true,
      });

      if (isNetworkOrPopup) {
        onShowToast?.(`Descargado como "${cleanTitle}.md" (popup bloqueado).`);
      } else {
        onShowToast?.(`Descargado localmente como "${cleanTitle}.md".`);
      }
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleIllustrate = async () => {
    if (!onIllustrateScene || isIllustrating || !message.content.trim()) return;
    setIsIllustrating(true);
    try {
      await onIllustrateScene(message.content, message.id);
    } catch (e: any) {
      console.warn('Illustration error:', e);
    } finally {
      setIsIllustrating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!onGenerateVideoScene || isGeneratingVideo || !message.content.trim()) return;
    setIsGeneratingVideo(true);
    try {
      await onGenerateVideoScene(message.content, message.id);
    } catch (e: any) {
      console.warn('Video generation error:', e);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  useEffect(() => {
    return () => {
      isSpeechCancelledRef.current = true;
      activeUtterancesRef.current = [];
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.src = '';
        } catch {}
        ttsAudioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const isUser = message.role === 'user';

  // Helper to extract internal reasoning (<think>...</think>, Think>..., *thinking*..., etc.) from message content
  const parseMessageContent = (content: string = '', messageThinking?: string) => {
    let thinking = messageThinking ? messageThinking.trim() : null;
    let prose = (content || '').replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '');
    let isStillThinking = false;

    if (!prose.trim()) {
      let activeThinkingState = false;
      if (!isUser && !message.isStreaming && thinking) {
        prose =
          '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
      } else if (message.isStreaming && thinking) {
        activeThinkingState = true;
      }
      return { thinking, prose, isStillThinking: activeThinkingState };
    }

    // Quick check to skip heavy regex routines when text contains no thinking tags or appended docs
    const hasCandidateTag =
      prose.includes('<think') ||
      prose.includes('Think>') ||
      prose.includes('thought>') ||
      prose.includes('*thinking') ||
      prose.includes('<tool_call') ||
      prose.includes('<|tool_call|>') ||
      prose.includes('The user is the developer') ||
      prose.includes('[DOCUMENTO ADJUNTO:');

    if (!hasCandidateTag) {
      if (!prose.trim() && !isUser) {
        if (!message.isStreaming) {
          prose =
            '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
        }
      }
      return { thinking, prose, isStillThinking };
    }

    // Strip out raw appended document blocks if they leaked into message.content
    prose = prose.replace(/\[DOCUMENTO ADJUNTO:[\s\S]*/gi, '').trim();

    if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(prose)) {
      const closeMatch = prose.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
      if (closeMatch) {
        const preTag = closeMatch[1];
        const postTag = closeMatch[2];
        const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
        if (openMatch) {
          const prefix = preTag.slice(0, preTag.toLowerCase().indexOf(openMatch[0].toLowerCase()));
          const extracted = openMatch[1].trim();
          if (extracted) thinking = thinking ? `${thinking}\n${extracted}` : extracted;
          prose = (prefix + postTag);
        } else {
          // Orphan closing tag (e.g. Stepfun Step-5 / models emitting reasoning without opening <think>):
          // Everything before </think> is reasoning text!
          const extracted = preTag.trim();
          if (extracted) thinking = thinking ? `${thinking}\n${extracted}` : extracted;
          prose = postTag;
        }
      }
    } else {
      // Bulletproof reasoning regex catching unclosed tags, meta-deliberation patterns, and broken tags
      const thinkingRegex =
        /(?:<think>|Think>|thought>|\*+thinking\*+|^The user is the developer[\s\S]*?)([\s\S]*?)(?:<\/think>|<\/thought>|<\/|\n\n(?=[A-Z¡¿])|$)/i;

      const match = thinkingRegex.exec(prose);

      if (match) {
        const fullMatch = match[0];
        const capturedThinking = match[1] ? match[1].trim() : '';

        // Check if explicit closing tag or section break boundary was matched
        const hasClosingTag =
          /<\/think>|<\/thought>|\*+\/thinking\*+|\n\n---/i.test(fullMatch) ||
          /\n\n(?=[A-Z¡¿])/.test(fullMatch);

        if (capturedThinking) {
          thinking = thinking ? `${thinking}\n${capturedThinking}` : capturedThinking;
        }

        // Remove the captured thinking block from prose
        prose = prose.replace(fullMatch, '');

        // If no explicit closing tag was found and we matched until end of string, it is actively streaming reasoning
        if (!hasClosingTag && (!fullMatch || fullMatch.endsWith(capturedThinking))) {
          isStillThinking = true;
        }
      }
    }

    // Completely strip any residual or leaked occurrences of tags/labels or orphaned tags from visible prose
    prose = prose
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
      .replace(/<tool_call>[\s\S]*$/gi, '')
      .replace(/<\/?tool_call>/gi, '')
      .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
      .replace(/<\|\/?tool_call\|>/gi, '')
      .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
      .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
      .replace(/[\wÀ-ÿ]*\<\/thought\>/gi, '')
      .replace(/(?:<think>|Think>|thought>|\*+thinking\*+|Thinking:)/gi, '')
      .replace(/(?:<\/think>|<\/thought>|\*+\/thinking\*+)/gi, '')
      .replace(/<\/?think>?/gi, '')
      .replace(/<\/?thought>?/gi, '')
      .replace(/<\|im_end\|>|<\|endoftext\|>|<\|im_start\|>/gi, '')
      .replace(/[\s\n]*<\|?[\w\-_]*>?[\s\n]*$/g, '')
      .replace(/[\s\n]*<[\s\n]*$/g, '')
      .trim();

    // Fallback for empty responses (or responses that consisted solely of thinking / orphaned tags)
    if (!prose.trim() && !isUser) {
      if (!message.isStreaming) {
        prose =
          '*(El modelo completó su proceso reflexivo. Pulsa en Regenerar si no comenzó a redactar la respuesta).*';
      }
    }

    return { thinking, prose, isStillThinking };
  };

  const thoughtContainerRef = useRef<HTMLDivElement>(null);
  const { thinking, prose, isStillThinking, cleanDisplayContent, match } = React.useMemo(() => {
    const followUpRegex = /<<<FOLLOW_UP>>>([\s\S]*?)(?:<<<END_FOLLOW_UP>>>|$)/;
    const foundMatch = message.content.match(followUpRegex);
    const rawClean = message.content.replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '').trim();
    const parsedClean = parseMessageContent(rawClean, message.thinking);
    return {
      thinking: parsedClean.thinking,
      prose: parsedClean.prose,
      isStillThinking: parsedClean.isStillThinking,
      cleanDisplayContent: parsedClean.prose,
      match: foundMatch,
    };
  }, [message.content, message.thinking, message.isStreaming]);
  const thoughtContent = (message.thought || thinking || message.thinking || '').trim();
  const hasThoughts = Boolean(thoughtContent);
  const isThinking = Boolean(
    message.isStreaming && !prose.trim()
  );
  const thinkingDuration = message.thinkingDuration || message.reasoningDurationSeconds || (thinkingSeconds > 0 ? thinkingSeconds : 1.8);

  const thinkingSteps = React.useMemo(() => {
    const steps: { title: string; body: string }[] = [];

    if (message.autoRouteReason) {
      steps.push({
        title: 'Selección y enrutamiento de modelo',
        body: message.autoRouteReason.trim(),
      });
    }

    if (!thoughtContent) {
      if (steps.length === 0) {
        steps.push({
          title: 'Inferencia directa',
          body: 'El modelo procesó la solicitud de forma instantánea sin requerir pasos intermedios extendidos.',
        });
      }
      return steps;
    }

    const fallbackTitles = [
      'Comprensión y análisis del contexto',
      'Evaluación de matices y coherencia',
      'Deliberación de estructura y enfoque',
      'Refinamiento de detalles y tono',
      'Síntesis y verificación final',
    ];

    const rawBlocks = thoughtContent
      .split(/\n{2,}|(?=\n#{1,4}\s)|(?=\n\d+\.\s+\*\*)/)
      .map((b) => b.trim())
      .filter(Boolean);

    const blocksToProcess =
      rawBlocks.length > 1
        ? rawBlocks
        : thoughtContent.length > 260
        ? thoughtContent
            .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿*])/)
            .reduce<string[]>((acc, sentence) => {
              const last = acc[acc.length - 1];
              if (!last || last.length > 220) {
                acc.push(sentence.trim());
              } else {
                acc[acc.length - 1] = `${last} ${sentence.trim()}`;
              }
              return acc;
            }, [])
        : rawBlocks;

    blocksToProcess.forEach((block, idx) => {
      const cleanedBlock = block.replace(/^[-*•]\s*/, '').trim();
      if (!cleanedBlock) return;

      // 1. Check for markdown header: ### Title \n body
      const headerMatch = cleanedBlock.match(/^#{1,4}\s+([^\n]+)(?:\n+([\s\S]*))?$/);
      if (headerMatch) {
        const title = headerMatch[1].replace(/[*_#`]/g, '').trim();
        const body = (headerMatch[2] || '').trim();
        steps.push({
          title: title || fallbackTitles[idx % fallbackTitles.length],
          body: body || title,
        });
        return;
      }

      // 2. Check for bold lead-in: **Title**: body or 1. **Title** body
      const boldMatch = cleanedBlock.match(/^(?:\d+\.\s*)?\*\*([^*]+)\*\*[:.\s-]*([\s\S]*)$/);
      if (boldMatch) {
        const title = boldMatch[1].trim();
        const body = boldMatch[2].trim();
        steps.push({
          title: title || fallbackTitles[idx % fallbackTitles.length],
          body: body || title,
        });
        return;
      }

      // 3. Extract first concise sentence as title if remaining body exists
      const firstSentenceMatch = cleanedBlock.match(/^([^.!?\n]+[.!?])\s+([\s\S]+)$/);
      if (firstSentenceMatch && firstSentenceMatch[1].length <= 95) {
        steps.push({
          title: firstSentenceMatch[1].replace(/^[\d.)\s-*]+/, '').replace(/[*_`]/g, '').trim(),
          body: firstSentenceMatch[2].trim(),
        });
        return;
      }

      // 4. Fallback descriptive title + full paragraph body
      steps.push({
        title: fallbackTitles[idx % fallbackTitles.length],
        body: cleanedBlock,
      });
    });

    return steps;
  }, [thoughtContent, message.autoRouteReason, message.isStreaming]);

  const handleCopyThought = async () => {
    if (!thoughtContent) return;
    try {
      await navigator.clipboard.writeText(thoughtContent);
      setIsThoughtCopied(true);
      onShowToast?.('Pensamiento copiado al portapapeles');
      setTimeout(() => setIsThoughtCopied(false), 2000);
    } catch (err) {
      console.warn('Copy thought failed', err);
    }
  };

  const getThinkingStatusText = (userPromptText: string = '', isWebActive: boolean = false, seconds: number = 0) => {
    const p = userPromptText.toLowerCase();
    const hasAlibabaSrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'alibaba');
    const hasGoogleSrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'google');
    const hasTavilySrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'tavily');
    const hasDdgSrc = message.webSearchSources?.some((s: any) => s.sourceEngine === 'duckduckgo');

    if (isWebActive || Boolean(message.webSearch) || p.includes('busca') || p.includes('noticia') || p.includes('internet')) {
      if (hasAlibabaSrc) {
        return 'Fuentes de Quark / Alibaba encontradas...';
      }
      if (hasTavilySrc) {
        return 'Fuentes de Tavily verificadas...';
      }
      if (hasDdgSrc) {
        return 'Fuentes de DuckDuckGo verificadas...';
      }
      if (hasGoogleSrc) {
        return 'Fuentes de Google Search verificadas...';
      }
      if (message.webSearchSources && message.webSearchSources.length > 0) {
        return `Examinando ${message.webSearchSources.length} fuentes web...`;
      }
      return 'Grimorio Web activo: evaluando necesidad de búsqueda...';
    }
    if (p.includes('kolder') || p.includes('hinistra') || p.includes('lore') || p.includes('monstereth') || p.includes('catarsis') || p.includes('tedriot')) {
      return 'Contrastando lore y registros de Monstereth...';
    }
    if (p.includes('escribe') || p.includes('capítulo') || p.includes('escena') || p.includes('continúa') || p.includes('diálogo')) {
      return 'Afinando pulso narrativo y subtexto...';
    }
    if (p.includes('código') || p.includes('bug') || p.includes('función') || p.includes('componente') || p.includes('react')) {
      return 'Analizando arquitectura y lógica...';
    }
    if (seconds > 18) {
      return 'Desgranando matices complejos...';
    }
    return 'Calibrando respuesta...';
  };

  useEffect(() => {
    if (isThinking && isThoughtOpen && thoughtContainerRef.current) {
      thoughtContainerRef.current.scrollTop = thoughtContainerRef.current.scrollHeight;
    }
  }, [thoughtContent, isThinking, isThoughtOpen]);

  useEffect(() => {
    return () => {
      if (isSpeaking || activeUtterancesRef.current.length > 0 || ttsAudioRef.current) {
        isSpeechCancelledRef.current = true;
        activeUtterancesRef.current = [];
        if (ttsAudioRef.current) {
          try {
            ttsAudioRef.current.pause();
            ttsAudioRef.current.currentTime = 0;
          } catch {}
          ttsAudioRef.current = null;
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      }
    };
  }, [isSpeaking]);

  // cleanDisplayContent and match are already memoized above

  const isResponseCutOff = React.useMemo(() => {
    if (isUser || message.isStreaming || message.error) return false;
    const trimmedProse = cleanDisplayContent.trim();
    if (!trimmedProse || trimmedProse.startsWith('*(El modelo completó su proceso reflexivo')) return false;

    // 1. Explicit interruption or token ceiling (finish_reason === 'length' / 'MAX_TOKENS' / user stop)
    if (isInterrupted || message.isInterrupted) return true;

    // 2. If the model already emitted <<<FOLLOW_UP>>> at the end, the main response finished normally
    if (/<<<FOLLOW_UP>>>/i.test(message.content)) return false;

    // 3. Unclosed markdown code fence (odd number of ```)
    const codeFences = trimmedProse.match(/```/g);
    if (codeFences && codeFences.length % 2 !== 0) return true;

    // 4. Syntactic cut-off check on longer responses (> 60 chars) without <<<FOLLOW_UP>>>
    if (trimmedProse.length > 60) {
      const strippedEnd = trimmedProse.replace(/[*_~`]+$/, '').trimEnd();
      if (!strippedEnd) return false;
      const endsNormally =
        /[.!?…:;"'»”)\]}—–-]$/.test(strippedEnd) ||
        /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(strippedEnd.slice(-2));
      if (!endsNormally && /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9,\(\[«“]$/.test(strippedEnd)) {
        return true;
      }
    }

    return false;
  }, [isUser, message.isStreaming, message.error, message.content, message.isInterrupted, isInterrupted, cleanDisplayContent]);

  // Splits text on natural sentence/clause boundaries (~100-160 chars) to prevent Android Chrome/Chromium 15s TTS cut-off
  const splitTextForSpeech = (text: string): string[] => {
    if (!text) return [];
    const rawSentences = text
      .split(/(?<=[.!?;\n])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let buffer = '';

    for (const sentence of rawSentences) {
      if ((buffer + ' ' + sentence).trim().length <= 150) {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      } else {
        if (buffer) chunks.push(buffer);
        if (sentence.length > 150) {
          const subParts = sentence.split(/(?<=[,:\—])\s+/);
          let subBuffer = '';
          for (const part of subParts) {
            if ((subBuffer + ' ' + part).trim().length <= 150) {
              subBuffer = subBuffer ? `${subBuffer} ${part}` : part;
            } else {
              if (subBuffer) chunks.push(subBuffer);
              subBuffer = part;
            }
          }
          if (subBuffer) buffer = subBuffer;
          else buffer = '';
        } else {
          buffer = sentence;
        }
      }
    }
    if (buffer) chunks.push(buffer);
    return chunks.length > 0 ? chunks : [text];
  };

  const handleToggleSpeak = async () => {
    if (typeof window === 'undefined') return;
    if (isLoadingTts) return;

    // Toggle off: Stop any playing audio or active speech synthesis queue instantly
    if (isSpeaking) {
      isSpeechCancelledRef.current = true;
      activeUtterancesRef.current = [];
      if (ttsAudioRef.current) {
        try {
          ttsAudioRef.current.pause();
          ttsAudioRef.current.currentTime = 0;
        } catch {}
        ttsAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    activeUtterancesRef.current = [];
    isSpeechCancelledRef.current = false;

    // Clean text of markdown, code blocks, and system markers for clear speech
    const cleanSpeechText = cleanDisplayContent
      .replace(/```[\s\S]*?```/g, ' [Bloque de código omitido] ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/💧\s*Pensado durante.*?\n/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .trim();

    if (!cleanSpeechText) return;

    let alibabaApiKey = '';
    let ttsEngine: 'auto' | 'qwen-audio-3.1-tts-flash' | 'qwen-audio-3.1-tts-plus' | 'browser' = 'auto';
    let ttsVoice = 'Cherry';
    let ttsInstruct = '';
    try {
      const rawSettings = localStorage.getItem('kizuna_zek_settings_v2') || localStorage.getItem('kizuna_zek_v2_settings');
      const parsed = rawSettings ? JSON.parse(rawSettings) : {};
      alibabaApiKey = (parsed.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      if (parsed.ttsEngine) ttsEngine = parsed.ttsEngine;
      if (parsed.ttsVoice) ttsVoice = parsed.ttsVoice;
      if (parsed.ttsInstruct) ttsInstruct = parsed.ttsInstruct;
    } catch {}

    // Helper: start sentence-chunked native speech queue with zero latency (< 50ms) & no cut-off
    const startBrowserSpeechQueue = () => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();

      const chunks = splitTextForSpeech(cleanSpeechText);
      if (chunks.length === 0) return;

      isSpeechCancelledRef.current = false;
      setIsSpeaking(true);

      const voices = window.speechSynthesis.getVoices();
      const spanishVoice =
        voices.find(v => v.lang.startsWith('es') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Neural') || v.name.includes('Samsung'))) ||
        voices.find(v => v.lang.startsWith('es')) ||
        null;

      let chunkIdx = 0;

      const speakNext = () => {
        if (isSpeechCancelledRef.current) {
          setIsSpeaking(false);
          activeUtterancesRef.current = [];
          return;
        }

        if (chunkIdx >= chunks.length) {
          setIsSpeaking(false);
          activeUtterancesRef.current = [];
          return;
        }

        const chunkText = chunks[chunkIdx];
        chunkIdx++;

        const utterance = new SpeechSynthesisUtterance(chunkText);
        if (spanishVoice) utterance.voice = spanishVoice;
        utterance.lang = spanishVoice?.lang || 'es-ES';
        utterance.rate = 1.02;
        utterance.pitch = 0.98;

        // Retain strong reference to prevent Chromium GC premature garbage collection
        activeUtterancesRef.current = [utterance];

        utterance.onend = () => {
          if (!isSpeechCancelledRef.current) {
            speakNext();
          }
        };

        utterance.onerror = (e) => {
          if (isSpeechCancelledRef.current) return;
          console.warn('[TTS] Speech chunk error, continuing to next sentence:', e);
          speakNext();
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
    };

    // 1. Qwen-Audio 3.1 Cloud TTS Path
    // NOTE: Model Studio Workspace keys (sk-ws-...) are dedicated to LLM chat/completions inference.
    // They do not support DashScope multimodal AIGC audio generation.
    // For workspace keys or browser mode, jump directly to browser speech with ZERO latency!
    const canAttemptCloudTts = alibabaApiKey && !alibabaApiKey.startsWith('sk-ws-') && ttsEngine !== 'browser';

    if (canAttemptCloudTts) {
      setIsLoadingTts(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const res = await fetch('/api/alibaba/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleanSpeechText.slice(0, 2500),
            alibabaApiKey,
            model: ttsEngine,
            voice: ttsVoice,
            instruct: ttsInstruct,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const srcUrl = data.audioDataUrl || data.audioUrl;
          if (srcUrl && !data.fallback) {
            const audio = new Audio(srcUrl);
            ttsAudioRef.current = audio;
            audio.onended = () => {
              setIsSpeaking(false);
              ttsAudioRef.current = null;
            };
            audio.onerror = () => {
              setIsSpeaking(false);
              ttsAudioRef.current = null;
            };
            setIsLoadingTts(false);
            setIsSpeaking(true);
            await audio.play();
            return;
          }
        }
      } catch {
        // Cloud TTS timed out or failed; seamlessly jump to instant native TTS queue
      } finally {
        setIsLoadingTts(false);
      }
    }

    // 2. High-Fidelity Chunked Native Speech (instant start, no cut-offs)
    startBrowserSpeechQueue();
  };

  let dynamicFollowUps: string[] = [];
  if (match && match[1]) {
    dynamicFollowUps = match[1]
      .split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
  } else if (!message.isStreaming) {
    const questionsFound = cleanDisplayContent.match(/¿[^?]+\?/g);
    if (questionsFound && questionsFound.length > 0) {
      dynamicFollowUps = questionsFound.slice(0, 3).map(q => q.replace(/[¿?]/g, '').trim());
    }
  }

  const prevIsThinkingRef = React.useRef(isThinking);
  useEffect(() => {
    if (prevIsThinkingRef.current && !isThinking) {
      setIsThoughtOpen(false);
    }
    prevIsThinkingRef.current = isThinking;
  }, [isThinking]);

  // Live timer for reasoning seconds counter
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isThinking) {
      const startTime = message.timestamp || Date.now();
      const updateTimer = () => {
        const elapsed = Math.max(0.1, (Date.now() - startTime) / 1000);
        setThinkingSeconds(+elapsed.toFixed(1));
      };
      updateTimer();
      interval = setInterval(updateTimer, 400);
    } else if (!message.isStreaming) {
      if (message.reasoningDurationSeconds !== undefined && !isNaN(message.reasoningDurationSeconds) && message.reasoningDurationSeconds > 0) {
        setThinkingSeconds(message.reasoningDurationSeconds);
      } else if (hasThoughts) {
        if (thinkingSeconds === 0) {
          const words = thoughtContent.split(/\s+/).length;
          const estSecs = +(Math.max(0.4, words / 15)).toFixed(1);
          setThinkingSeconds(estSecs);
        }
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isThinking, message.isStreaming, message.timestamp, message.reasoningDurationSeconds, hasThoughts, thoughtContent]);

  // Word & character stats calculation (deferred until streaming completes so we never run .split(/\s+/) every 96ms)
  const wordCount = React.useMemo(() => {
    if (message.isStreaming || !prose.trim()) return 0;
    return prose.trim().split(/\s+/).length;
  }, [prose, message.isStreaming]);
  const charCount = prose.length;

  const handleCopy = () => {
    navigator.clipboard.writeText(prose || message.content);
    setCopied(true);
    if (onShowToast) {
      onShowToast('Copiado al portapapeles');
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEditMessage) {
      onEditMessage(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (onDeleteMessage) {
      onDeleteMessage(message.id);
    }
    setShowDeleteConfirm(false);
  };

  // Rich Markdown Parser using react-markdown and remark-gfm
  const renderFormattedContent = (content: string) => {
    if (!content) return null;

    let sanitizedContent = content;
    if (
      content.includes('<think') ||
      content.includes('Think>') ||
      content.includes('thought>') ||
      content.includes('*thinking') ||
      content.includes('<tool_call') ||
      content.includes('<|tool_call|>')
    ) {
      sanitizedContent = content
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_call>[\s\S]*$/gi, '')
        .replace(/<\/?tool_call>/gi, '')
        .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
        .replace(/<\|\/?tool_call\|>/gi, '')
        .replace(/(?:<think>|Think>|thought>|\*+thinking\*+)([\s\S]*?)(?:<\/think>|<\/thought>|$)/gi, '')
        .replace(/<\/?think>?/gi, '')
        .replace(/<\/?thought>?/gi, '');
    }
    sanitizedContent = sanitizedContent.trim();

    if (!sanitizedContent) return null;

    // Normalize standalone numbered bold lines (e.g. "**2. La Noche de los Bastones Largos (1966)**")
    // into ### headings when not actively streaming so they also receive Wikipedia side-by-side cards
    if (!isUser && !message.isStreaming) {
      sanitizedContent = sanitizedContent.replace(
        /^(\s*)(?:\*\*(\d+[\.\)]\s+[^*\n]{4,80})\*\*|(\d+[\.\)]\s+)\*\*([^*\n]{4,80})\*\*)\s*$/gm,
        (_m, indent, fullBold, numPrefix, boldTitle) => {
          const headingText = fullBold || `${numPrefix}${boldTitle}`;
          return `${indent}### ${headingText}`;
        }
      );
    }

    return (
      <div className="prose-noir select-text tracking-[0.012em] text-zinc-900 dark:text-zinc-100 space-y-3.5 break-words overflow-hidden max-w-full">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mt-4 mb-2 tracking-tight border-b border-zinc-200 dark:border-[#262626] pb-1 break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </h1>
            ),
            h2: ({ children }) => (
              <WikiSectionHeading
                level="h2"
                isUser={isUser}
                isStreaming={message.isStreaming}
                onOpenImageLightbox={onOpenImageLightbox}
              >
                {highlightSearchText(children, searchHighlightQuery)}
              </WikiSectionHeading>
            ),
            h3: ({ children }) => (
              <WikiSectionHeading
                level="h3"
                isUser={isUser}
                isStreaming={message.isStreaming}
                onOpenImageLightbox={onOpenImageLightbox}
              >
                {highlightSearchText(children, searchHighlightQuery)}
              </WikiSectionHeading>
            ),
            h4: ({ children }) => (
              <h4 className="text-lg font-semibold text-zinc-800 dark:text-[#f4f4f5] mt-2 mb-1 break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-zinc-800 dark:text-[#d4d4d8] mb-3.5 last:mb-0 font-normal break-words max-w-full">
                {highlightSearchText(children, searchHighlightQuery)}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="prose-strong-highlight font-extrabold text-black dark:text-white break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-zinc-700 dark:text-[#d4d4d8] break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </em>
            ),
            table: ({ children }) => (
              <div className="my-3 overflow-x-auto max-w-full rounded-md border border-zinc-200 dark:border-[#262626] bg-white dark:bg-[#09090b]">
                <table className="w-full text-left border-collapse text-xs md:text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-zinc-100 dark:bg-[#161618] text-zinc-900 dark:text-white font-semibold border-b border-zinc-200 dark:border-[#262626]">
                {children}
              </thead>
            ),
            th: ({ children }) => (
              <th className="p-2.5 text-xs md:text-sm font-semibold text-zinc-900 dark:text-white border-r border-zinc-200 dark:border-[#262626] last:border-r-0 break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </th>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-zinc-200 dark:divide-[#262626]">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="odd:bg-white even:bg-zinc-50 dark:odd:bg-[#0c0c0e] dark:even:bg-[#121214] hover:bg-zinc-100/80 dark:hover:bg-[#18181c] transition-colors">
                {children}
              </tr>
            ),
            td: ({ children }) => (
              <td className="p-2.5 text-xs md:text-sm text-zinc-800 dark:text-[#EDEDED] border-r border-zinc-200 dark:border-[#262626] last:border-r-0 break-words">
                {highlightSearchText(children, searchHighlightQuery)}
              </td>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 space-y-1.5 text-zinc-800 dark:text-[#EDEDED] my-2.5 max-w-full">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 space-y-1.5 text-zinc-800 dark:text-[#EDEDED] my-2.5 max-w-full">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-zinc-800 dark:text-[#EDEDED] break-words max-w-full">
                {highlightSearchText(children, searchHighlightQuery)}
              </li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-orange-500 pl-3.5 py-2 my-3.5 bg-orange-500/5 dark:bg-[#121216] text-zinc-800 dark:text-zinc-300 italic rounded-r-lg break-words max-w-full">
                {highlightSearchText(children, searchHighlightQuery)}
              </blockquote>
            ),
            code: ({ className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');
              const codeString = String(children).replace(/\n$/, '');

              if (isInline) {
                return (
                  <code
                    className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-[#16161a] border border-zinc-200 dark:border-[#26262c] text-[11px] font-mono text-zinc-900 dark:text-[#f4f4f5]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              return (
                <CodeBlockCanvas
                  language={match ? match[1] : 'texto'}
                  codeString={codeString}
                  onShowToast={onShowToast}
                />
              );
            },
            hr: () => <hr className="my-4 border-zinc-200 dark:border-[#262626]" />,
            a: ({ href, children }) => {
              const textStr = String(children || '').trim();
              if (href && /^https?:\/\//i.test(href) && textStr.length <= 28) {
                return <InlineSourcePill url={href} title={textStr} />;
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-500 dark:text-orange-400 underline underline-offset-2 hover:text-orange-600 transition-colors"
                >
                  {highlightSearchText(children, searchHighlightQuery)}
                </a>
              );
            },
          }}
        >
          {sanitizedContent}
        </ReactMarkdown>
      </div>
    );
  };

  // During long streaming responses (> 1,600 chars), freeze completed paragraphs above the active tail
  // so ReactMarkdown only re-parses the last ~400 chars on each 96ms tick instead of re-parsing 3,000+ words!
  const { streamingFrozenHead, streamingActiveTail } = React.useMemo(() => {
    if (!message.isStreaming || cleanDisplayContent.length < 1600) {
      return { streamingFrozenHead: '', streamingActiveTail: cleanDisplayContent };
    }
    // Quantize split boundary to 1,200-char chunks so the frozen head only updates once every ~1,200 chars
    const targetBoundary = Math.floor((cleanDisplayContent.length - 450) / 1200) * 1200;
    if (targetBoundary <= 0) {
      return { streamingFrozenHead: '', streamingActiveTail: cleanDisplayContent };
    }
    const splitIdx = cleanDisplayContent.lastIndexOf('\n\n', targetBoundary);
    if (splitIdx <= 200) {
      return { streamingFrozenHead: '', streamingActiveTail: cleanDisplayContent };
    }
    const headCandidate = cleanDisplayContent.slice(0, splitIdx);
    // Do not split inside an unclosed markdown code fence
    const fences = headCandidate.match(/```/g);
    if (fences && fences.length % 2 !== 0) {
      return { streamingFrozenHead: '', streamingActiveTail: cleanDisplayContent };
    }
    return {
      streamingFrozenHead: headCandidate,
      streamingActiveTail: cleanDisplayContent.slice(splitIdx + 2),
    };
  }, [cleanDisplayContent, message.isStreaming]);

  const frozenHeadNodeMemo = React.useMemo(() => {
    if (!streamingFrozenHead) return null;
    return renderFormattedContent(streamingFrozenHead);
  }, [streamingFrozenHead, searchHighlightQuery]);

  const activeTailNodeMemo = React.useMemo(() => {
    if (!streamingActiveTail) return null;
    return renderFormattedContent(streamingActiveTail);
  }, [streamingActiveTail, searchHighlightQuery, message.isStreaming]);

  const formattedContentMemo = React.useMemo(() => {
    if (!streamingFrozenHead) return activeTailNodeMemo;
    return (
      <>
        {frozenHeadNodeMemo}
        {activeTailNodeMemo}
      </>
    );
  }, [streamingFrozenHead, frozenHeadNodeMemo, activeTailNodeMemo]);

  const hasGoogleSources = message.webSearchSources?.some((s: any) => s.sourceEngine === 'google');
  const hasAlibabaSources = message.webSearchSources?.some((s: any) => s.sourceEngine === 'alibaba');

  return (
    <div
      className={`contain-message group w-full py-4 sm:py-5 px-4 sm:px-6 md:px-8 transition-colors ${
        isUser ? 'bg-transparent' : 'bg-transparent sm:dark:bg-zinc-900/20 border-y border-zinc-200/40 dark:border-zinc-800/30'
      }`}
    >
      <div className="max-w-3xl lg:max-w-4xl mx-auto flex gap-3 md:gap-4">
        {/* Role Avatar Badge (Side column on tablet/desktop; inline on mobile so prose gets full screen width) */}
        <div className="hidden sm:block shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-6 h-6 rounded-md bg-zinc-200 dark:bg-[#141418] border border-zinc-300 dark:border-[#222226] flex items-center justify-center text-[10px] font-mono font-semibold text-zinc-800 dark:text-white">
              U
            </div>
          ) : (
            <div className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-[#ffffff] text-white dark:text-black flex items-center justify-center text-[10px] font-mono font-bold tracking-tight shadow-xs">
              KZ
            </div>
          )}
        </div>

        {/* Message Content Container */}
        <div className="min-w-0 flex-1 space-y-2.5">
          {/* Header row: Author + Timestamp + Lore Indicators */}
          <div className="flex items-center justify-between text-xs sm:text-[13px] font-mono text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="sm:hidden inline-flex items-center justify-center w-5 h-5 rounded bg-zinc-900 dark:bg-white text-white dark:text-black text-[9px] font-mono font-bold shrink-0">
                {isUser ? 'U' : 'KZ'}
              </span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                {isUser ? 'Usuario' : 'Kizuna-Zek'}
              </span>
              <span>·</span>
              <span className="text-zinc-500 dark:text-zinc-400">{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

              {/* Clean model name label (no robot emoji) */}
              {!isUser && (message.modelName || message.modelId) && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 bg-zinc-100 dark:bg-[#121218] border border-zinc-300 dark:border-[#272736] text-zinc-800 dark:text-zinc-300 rounded-md">
                    {message.modelName || message.modelId}
                  </span>
                </>
              )}

              {/* Show loaded lore badge if recorded on assistant turn */}
              {!isUser && message.selectedLoreIds && message.selectedLoreIds.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-[#101014] border border-zinc-300 dark:border-[#1f1f23] text-zinc-700 dark:text-neutral-400 rounded-md">
                  <BookOpen size={9} />
                  <span>{message.selectedLoreIds.length} Lore Refs</span>
                </span>
              )}
            </div>


          </div>

          {/* Attached Media/Files if any */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 pb-2">
              {message.attachments.map((att) => {
                const isVideo = Boolean(
                  att.fileType === 'video' ||
                    att.type?.startsWith('video/') ||
                    (att.videoUrl && att.videoUrl.trim()) ||
                    (att.dataUrl && att.dataUrl.startsWith('data:video/'))
                );

                const isImg = !isVideo && Boolean(
                  att.dataUrl &&
                    att.dataUrl.trim() &&
                    (att.type?.startsWith('image/') ||
                      att.fileType === 'image' ||
                      att.dataUrl.startsWith('data:image/'))
                );

                if (isVideo) {
                  return (
                    <div
                      key={att.id || att.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenImageLightbox) onOpenImageLightbox(att);
                      }}
                      className="group/vid relative w-36 h-24 sm:w-44 sm:h-28 rounded-xl border border-zinc-700/60 overflow-hidden bg-black cursor-pointer hover:border-zinc-400 transition-all shadow-md"
                    >
                      {att.videoUrl?.endsWith('.mp4') || att.dataUrl?.startsWith('data:video/') ? (
                        <video
                          src={att.videoUrl || att.dataUrl}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                        />
                      ) : (
                        <img
                          src={att.videoUrl || att.dataUrl}
                          alt={att.name}
                          className="w-full h-full object-cover group-hover/vid:scale-105 transition-transform duration-200"
                        />
                      )}
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 text-[10px] font-semibold flex items-center gap-1 shadow-md">
                        <Film size={10} />
                        <span>{att.duration ? `${att.duration}s` : (att.videoModel || 'Video')}</span>
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/vid:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="p-2 bg-zinc-800 border border-zinc-600 rounded-full text-white shadow-lg">
                          <Play size={14} fill="currentColor" />
                        </span>
                      </div>
                    </div>
                  );
                }

                if (isImg && att.dataUrl) {
                  return (
                    <div
                      key={att.id || att.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenImageLightbox) onOpenImageLightbox(att);
                      }}
                      className="group/img relative w-24 h-24 sm:w-28 sm:h-28 rounded-md border border-[#1f1f23] overflow-hidden bg-black cursor-pointer hover:border-[#38383e] transition-all"
                    >
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                        <Eye size={14} className="text-white" />
                      </div>
                    </div>
                  );
                } else {
                  const formatSize = (s?: number | string) => {
                    if (!s) return null;
                    if (typeof s === 'string') return s;
                    if (s < 1024) return `${s} B`;
                    if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
                    return `${(s / (1024 * 1024)).toFixed(1)} MB`;
                  };
                  const sizeLabel = formatSize(att.size);

                  // Robust document content resolution fallback for Vercel & persistent sessions
                  let resolvedContent = att.content || att.textContent || '';
                  if (!resolvedContent && availableLoreFiles && availableLoreFiles.length > 0) {
                    const foundLore = availableLoreFiles.find(
                      (f) =>
                        f.filename === att.name ||
                        f.title === att.name ||
                        f.filename?.toLowerCase() === att.name.toLowerCase()
                    );
                    if (foundLore && foundLore.content) {
                      resolvedContent = foundLore.content;
                    }
                  }
                  if (!resolvedContent && message.content.includes('[DOCUMENTO ADJUNTO:')) {
                    const docPos = message.content.indexOf('[DOCUMENTO ADJUNTO:');
                    if (docPos !== -1) {
                      const tail = message.content.slice(docPos);
                      resolvedContent = tail.replace(/^\[DOCUMENTO ADJUNTO:[^\]]*\]\s*/i, '').trim();
                    }
                  }

                  return (
                    <div
                      key={att.id || att.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenDocumentPreview) {
                          onOpenDocumentPreview({
                            title: att.name,
                            content: resolvedContent,
                            fileType: att.fileType || 'txt',
                            dataUrl: att.dataUrl || '',
                            size: att.size,
                            wordCount: att.wordCount,
                            estimatedTokens: att.estimatedTokens,
                            sourceLabel: 'Mensaje de Chat',
                          });
                        }
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 bg-zinc-100 dark:bg-[#0c0c10] border border-zinc-300 dark:border-[#22222a] hover:border-zinc-400 dark:hover:border-[#383844] rounded-lg text-xs text-zinc-900 dark:text-white max-w-sm transition-all shadow-sm group/file cursor-pointer hover:bg-zinc-200/70 dark:hover:bg-[#121218] pointer-events-auto"
                      title="Click para ver vista previa en Kizuna-Zek"
                    >
                      <div className="w-8 h-8 rounded-md bg-white dark:bg-[#16161f] border border-zinc-300 dark:border-[#282834] flex items-center justify-center shrink-0 text-zinc-600 dark:text-neutral-300">
                        <FileText size={16} className="text-zinc-600 dark:text-[#d4d4d8] group-hover/file:text-zinc-900 dark:group-hover/file:text-white transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-[12px] text-zinc-900 dark:text-white">
                            {att.name}
                          </span>
                          {sizeLabel && (
                            <span className="text-[10px] font-mono text-zinc-500 dark:text-[#71717a] shrink-0">
                              ({sizeLabel})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-amber-800 dark:text-amber-400/90 bg-amber-500/15 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-800/40 px-1.5 py-0.2 rounded">
                            <span className="w-1 h-1 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse" />
                            Documento adjunto en contexto
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          )}

          {/* Inline Edit Form for User Message */}
          {isEditing ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={4}
                className="w-full bg-[#0e0e12] border border-[#38383e] rounded-md p-2.5 text-xs text-white font-mono focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-xs text-[#a1a1aa] hover:text-white"
                >
                  Cancelar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md cursor-pointer"
                >
                  Guardar y Reenviar
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Indicador en vivo durante el pensamiento */}
              {/* Pasos de pensamiento e indicador de razonamiento (estilo OpenWebUI / Gemini / Qwen) */}
              {!isUser && (hasThoughts || isThinking || Boolean(message.thinking) || Boolean(message.thought) || Boolean(message.autoRouteReason) || Boolean(message.reasoningDurationSeconds) || thinkingDuration > 0) && (
                <div className="mb-3 font-sans">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsThoughtOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 flex-wrap px-3.5 py-1.5 min-h-[38px] rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100/90 dark:bg-[#121216] hover:bg-zinc-200 dark:hover:bg-[#1a1a22] border border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 transition-all cursor-pointer select-none shadow-xs"
                  >
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                      <Lightbulb size={12} className={`text-amber-400 ${message.isStreaming && !prose.trim() ? 'animate-pulse' : ''}`} />
                    </span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {message.isStreaming && !prose.trim()
                        ? (isThoughtOpen ? 'Razonando en tiempo real...' : `Pensando... (${thinkingSeconds.toFixed(1)}s)`)
                        : (isThoughtOpen ? 'Pasos de pensamiento' : `Pensado durante ${thinkingDuration.toFixed(1)}s`)}
                    </span>
                    {!message.isStreaming && thinkingSteps.length > 0 && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
                        ({thinkingSteps.length} {thinkingSteps.length === 1 ? 'paso' : 'pasos'})
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={`ml-1 text-zinc-400 transition-transform duration-200 ${isThoughtOpen ? 'rotate-180 text-zinc-200' : ''}`}
                    />
                  </motion.button>

                  <AnimatePresence>
                    {isThoughtOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.22 }}
                        ref={thoughtContainerRef}
                        className="mt-2.5 px-4 pt-3 pb-4 sm:px-5 rounded-2xl bg-zinc-50 dark:bg-[#101014] border border-zinc-200/90 dark:border-zinc-800/90 text-zinc-900 dark:text-zinc-100 shadow-2xl select-text overflow-hidden font-sans"
                      >
                        {/* Grab Handle superior estilo Bottom Sheet de Gemini / Qwen */}
                        <div className="w-9 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700/80 mx-auto mb-3" />

                        {/* Título "Pasos de pensamiento" + Botón discreto de copiar */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2.5">
                            <h3 className="text-[16px] sm:text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                              {message.isStreaming && !prose.trim() ? 'Razonamiento en tiempo real' : 'Pasos de pensamiento'}
                            </h3>
                            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800/70 px-2 py-0.5 rounded-full">
                              {message.isStreaming ? `${thinkingSeconds.toFixed(1)}s` : `${thinkingDuration.toFixed(1)}s`}
                            </span>
                          </div>

                          {thoughtContent && (
                            <button
                              type="button"
                              onClick={handleCopyThought}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer select-none"
                              title="Copiar pasos de pensamiento"
                            >
                              {isThoughtCopied ? (
                                <>
                                  <Check size={13} className="text-emerald-400" />
                                  <span className="text-emerald-400 font-medium">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span className="hidden sm:inline">Copiar</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Línea de tiempo vertical con nodos circulares y línea punteada */}
                        <div className="max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                          {thinkingSteps.length > 0 ? (
                            thinkingSteps.map((step, idx) => (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(idx * 0.04, 0.25) }}
                                className="flex gap-3.5"
                              >
                                <div className="flex flex-col items-center shrink-0">
                                  <div className="w-3.5 h-3.5 rounded-full border-[1.8px] border-zinc-400 dark:border-zinc-400 bg-zinc-50 dark:bg-[#101014] mt-1 shrink-0" />
                                  <div className="w-px flex-1 border-l-[1.5px] border-dashed border-zinc-300 dark:border-zinc-700 my-1" />
                                </div>
                                <div className="pb-4 min-w-0 flex-1">
                                  <h4 className="text-[15.5px] sm:text-[16px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-1">
                                    {highlightSearchText(step.title, searchHighlightQuery)}
                                  </h4>
                                  {step.body && step.body !== step.title && (
                                    <p className="text-[15px] sm:text-[15.5px] text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words font-normal">
                                      {highlightSearchText(step.body, searchHighlightQuery)}
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            ))
                          ) : (
                            <div className="text-xs text-zinc-300 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
                              {thoughtContent || (message.isStreaming ? 'Procesando razonamiento en tiempo real...' : `El modelo completó su proceso reflexivo de forma interna en ${thinkingDuration.toFixed(1)}s.`)}
                            </div>
                          )}

                          {/* Nodo final: ✓ Se usó el modelo ... */}
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, delay: 0.12 }}
                            className="flex items-center gap-3.5 pt-0.5"
                          >
                            <div className="w-3.5 h-3.5 rounded-full border-[1.8px] border-zinc-500 dark:border-zinc-400 bg-zinc-50 dark:bg-[#101014] flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-300">
                              <Check size={9} strokeWidth={3} />
                            </div>
                            <span className="text-[13px] sm:text-[13.5px] font-medium text-zinc-700 dark:text-zinc-300">
                              Se usó el modelo {message.modelName || message.modelId || 'Gemini 3.6 Flash'}
                            </span>
                          </motion.div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ChatGPT Dotted Matrix Generative Card */}
              {message.generationState && (
                <GenerativeCanvasCard
                  state={message.generationState}
                  onOpenLightbox={onOpenImageLightbox}
                  onAnimateVideo={onGenerateVideoScene}
                  onShowToast={onShowToast}
                />
              )}

              {/* Streaming Skeleton Loader when initialized before first text chunk */}
              {!prose.trim() && !isUser && message.isStreaming && !hasThoughts && !isThinking && !message.generationState && (
                <div className="space-y-2 py-2 max-w-md animate-pulse">
                  <div className="h-3.5 bg-neutral-800 rounded-md w-3/4" />
                  <div className="h-3.5 bg-neutral-800/80 rounded-md w-full" />
                  <div className="h-3.5 bg-neutral-800/60 rounded-md w-1/2" />
                </div>
              )}

              {/* Main Prose Content */}
              {(prose || isUser) && (
                <div className="prose-noir select-text">
                  {formattedContentMemo}

                  {/* Gently glowing silver/white cursor dot tracking active token streaming */}
                  {message.isStreaming && (
                    <span className="inline-flex items-center gap-2 ml-1.5 align-middle">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]"></span>
                      </span>
                      {message.tokensPerSecond !== undefined && message.tokensPerSecond > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-800 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-300 dark:border-zinc-700/60 px-1.5 py-0.5 rounded select-none">
                          <Gauge size={10} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Botón para continuar respuesta únicamente cuando el modelo se corta o no termina su respuesta */}
              {isResponseCutOff && (onContinueMessage || onQuickPrompt) && (
                <div className="mt-3 pt-1 flex items-center gap-2 flex-wrap animate-noir-enter">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (onContinueMessage) {
                        onContinueMessage(message.id);
                      } else if (onQuickPrompt) {
                        const words = prose.trim().split(/\s+/);
                        const lastWords = words.slice(-25).join(' ');
                        onQuickPrompt(`Continúa exactamente desde este punto sin repetir lo anterior: "${lastWords}"`);
                      }
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 active:scale-95 transition-all cursor-pointer shadow-sm"
                    title="Continuar redactando en este mismo mensaje desde la última palabra donde se cortó"
                  >
                    <Zap size={14} className="text-amber-400 shrink-0" />
                    <span>Continuar respuesta</span>
                  </motion.button>
                  <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    Respuesta incompleta · retoma sin repetir
                  </span>
                </div>
              )}


            </div>
          )}

          {/* ChatGPT-style Inline Domain Source Pills (e.g. Argentina, CONEAU +1) */}
          {!isUser && message.webSearchSources && message.webSearchSources.length > 0 && (
            <WebSearchPillsRow
              sources={message.webSearchSources}
              onToggleExpand={() => setIsSourcesOpen((prev) => !prev)}
            />
          )}

          {/* Collapsible Accordion for Web Search Sources */}
          {!isUser && message.webSearchSources && message.webSearchSources.length > 0 && (
            <div className="mt-2 bg-zinc-100 dark:bg-[#151518] border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-zinc-200 rounded-2xl overflow-hidden select-none">
              <button
                type="button"
                onClick={() => setIsSourcesOpen(!isSourcesOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-mono text-zinc-700 dark:text-neutral-400 hover:text-zinc-900 dark:hover:text-white transition-colors bg-zinc-200/50 dark:bg-[#0e0e12]/80 hover:bg-zinc-200/80 dark:hover:bg-[#141419]"
              >
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-orange-500" />
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {hasGoogleSources 
                      ? 'Google Search' 
                      : hasAlibabaSources 
                      ? 'Quark Search (Alibaba)' 
                      : 'Tavily Search'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-500 border-orange-500/20">
                    {message.webSearchSources.length} enlaces
                  </span>
                </div>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-200 text-zinc-500 dark:text-neutral-400 ${
                    isSourcesOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
                  }`}
                />
              </button>

              <AnimatePresence>
                {isSourcesOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="px-3.5 py-2.5 space-y-2 border-t border-zinc-200 dark:border-[#18181f] bg-zinc-50 dark:bg-[#07070a]"
                  >
                    {message.webSearchSources.map((src, sIdx) => (
                      <div key={sIdx} className="flex flex-col gap-0.5 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-zinc-500 dark:text-neutral-400">[{sIdx + 1}]</span>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-zinc-800 dark:text-zinc-200 hover:text-orange-500 dark:hover:text-orange-400 hover:underline truncate inline-flex items-center gap-1 max-w-[90%]"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink size={10} className="shrink-0 text-zinc-400" />
                          </a>
                        </div>
                        {src.snippet && (
                          <p className="text-[11px] text-zinc-600 dark:text-neutral-400 line-clamp-2 pl-4">
                            {src.snippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Error Notice with Actionable Recovery */}
          {message.error && (
            <div className="p-3.5 bg-red-950/20 dark:bg-red-950/30 border border-red-900/40 dark:border-red-900/50 rounded-xl text-xs space-y-3 animate-noir-enter select-text">
              <div className="flex items-start gap-2.5 text-red-600 dark:text-red-300">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" />
                <span className="leading-relaxed font-normal">{message.error}</span>
              </div>

              {(message.error.includes('429') || message.error.includes('cuota') || message.error.includes('límite') || message.error.includes('Gemini')) && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-900/20 dark:border-red-900/40">
                  {onSwitchProvider && (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchProvider('custom', 'moonshotai/kimi-k3');
                        if (onRegenerate) onRegenerate();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500/20 hover:bg-emerald-700 dark:hover:bg-emerald-500/30 text-white dark:text-emerald-300 border border-emerald-600/60 dark:border-emerald-500/40 text-[11px] font-semibold transition-all cursor-pointer active:scale-95 shadow-sm"
                    >
                      <Zap size={12} className="text-white dark:text-emerald-400" />
                      <span>Cambiar a NVIDIA NIM (Kimi K3) y reintentar</span>
                    </button>
                  )}
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
                    >
                      <span>Configurar Clave API en Ajustes ⚙️</span>
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 text-[11px] font-medium transition-all cursor-pointer active:scale-95"
                    >
                      <RotateCcw size={11} />
                      <span>Reintentar</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {!isUser && !message.isStreaming && dynamicFollowUps.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-200/80 dark:border-zinc-800/60 animate-noir-enter">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2 tracking-wide">
                Follow up
              </p>
              <div className="flex flex-col gap-1.5">
                {dynamicFollowUps.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectFollowUp?.(item)}
                    className="flex items-start gap-2.5 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors group w-full py-2 cursor-pointer font-medium min-h-[44px]"
                  >
                    <span className="text-amber-500 font-mono text-base shrink-0 mt-0.5">↳</span>
                    <span className="leading-snug text-[15.5px] sm:text-[16px]">{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isPersonaWizardChat && !isUser && cleanDisplayContent && !message.isStreaming && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => onApplyGlobalPersona?.(cleanDisplayContent)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-300 md:hover:bg-amber-500/25 active:scale-95 transition-all cursor-pointer shadow-xs select-none touch-manipulation"
              >
                <Check size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Aplicar a Directiva Global</span>
              </button>
            </div>
          )}

          {!isUser && !message.isStreaming && onContinueMessage && (isInterrupted || message.isInterrupted || isLastAssistant) && (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onContinueMessage(message.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-white/[0.08] md:hover:bg-zinc-200 dark:md:hover:bg-white/[0.14] active:bg-zinc-300 dark:active:bg-white/[0.18] text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-white/15 transition-all cursor-pointer select-none touch-manipulation shadow-xs"
                title="Continuar redactando la respuesta desde el último punto"
              >
                <Play size={12} className="fill-current shrink-0 text-amber-500 dark:text-amber-400" />
                <span>Continuar redactando</span>
              </button>
            </div>
          )}

          {/* Discreet, Elegant Bottom Bar (Actions + Faint Text Metrics) */}
          {!message.isStreaming && !isEditing && (
            <div className="mt-3 pt-2 border-t border-zinc-200/80 dark:border-zinc-800/40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-zinc-500">
              {/* Left: Streamlined Action Bar (Primary buttons + ··· Overflow Menu) */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap opacity-95 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                {message.variants && message.variants.length > 1 && (
                  <div className="flex items-center gap-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-lg p-0.5 shrink-0 shadow-xs mr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant?.(message.id, (message.activeVariantIndex ?? 0) - 1);
                      }}
                      disabled={(message.activeVariantIndex ?? 0) <= 0}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-white disabled:opacity-25 transition-colors cursor-pointer active:scale-90"
                      title="Versión anterior"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-[10px] text-zinc-800 dark:text-zinc-300 font-semibold px-1 min-w-[24px] text-center">
                      {(message.activeVariantIndex ?? 0) + 1}/{message.variants.length}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant?.(message.id, (message.activeVariantIndex ?? 0) + 1);
                      }}
                      disabled={(message.activeVariantIndex ?? 0) >= message.variants.length - 1}
                      className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-zinc-900 dark:hover:text-white disabled:opacity-25 transition-colors cursor-pointer active:scale-90"
                      title="Versión siguiente"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                {/* 1. Copiar */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer flex items-center justify-center"
                  title="Copiar mensaje"
                >
                  {copied ? <Check size={15} className="text-amber-400" /> : <Copy size={15} />}
                </button>

                {/* Editar (solo mensajes del usuario) */}
                {isUser && onEditMessage && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditContent(message.content);
                      setIsEditing(true);
                    }}
                    className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer flex items-center justify-center"
                    title="Editar mensaje"
                  >
                    <Edit3 size={15} />
                  </button>
                )}

                {/* 2. Escuchar TTS */}
                <button
                  type="button"
                  onClick={handleToggleSpeak}
                  disabled={isLoadingTts}
                  className={`px-2.5 py-2 min-h-[44px] min-w-[44px] rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-[11px] font-mono select-none ${
                    isSpeaking
                      ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30 animate-pulse'
                      : isLoadingTts
                      ? 'text-zinc-300 bg-white/5 border border-white/10'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70'
                  }`}
                  title={
                    isLoadingTts
                      ? 'Sintetizando voz con Qwen-Audio 3.1...'
                      : isSpeaking
                      ? 'Detener lectura en voz alta'
                      : 'Escuchar en voz alta'
                  }
                >
                  {isLoadingTts ? (
                    <Loader2 size={15} className="animate-spin text-zinc-300 shrink-0" />
                  ) : isSpeaking ? (
                    <VolumeX size={15} className="text-amber-400 shrink-0" />
                  ) : (
                    <Volume2 size={15} className="shrink-0" />
                  )}
                </button>

                {/* 3. Regenerar (visible directamente para el asistente) */}
                {!isUser && isLastAssistant && onRegenerate && (
                  <button
                    type="button"
                    onClick={onRegenerate}
                    className="p-2 min-h-[44px] min-w-[44px] rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70 transition-colors cursor-pointer flex items-center justify-center"
                    title="Regenerar respuesta"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}

                {/* Indicadores en vivo si alguna tarea secundaria se está ejecutando */}
                {isIllustrating && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-mono">
                    <Loader2 size={12} className="animate-spin text-amber-400" />
                    <span>Ilustrando...</span>
                  </span>
                )}
                {isGeneratingVideo && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/15 text-zinc-300 text-[11px] font-mono">
                    <Loader2 size={12} className="animate-spin text-zinc-300" />
                    <span>Video 3.0...</span>
                  </span>
                )}
                {isSavingToDrive && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-mono">
                    <Loader2 size={12} className="animate-spin text-amber-400" />
                    <span>Guardando...</span>
                  </span>
                )}

                {/* 4. Menú de acciones secundarias (···) */}
                <div className="relative" ref={actionMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowActionMenu((prev) => !prev);
                      setShowDeleteConfirm(false);
                    }}
                    className={`p-2 min-h-[44px] min-w-[44px] rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center active:scale-90 ${
                      showActionMenu
                        ? 'text-white dark:text-black bg-zinc-900 dark:bg-white shadow-[0_0_16px_rgba(255,255,255,0.2)]'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70'
                    }`}
                    title={showActionMenu ? 'Cerrar acciones (×)' : 'Más acciones'}
                  >
                    <motion.span
                      animate={{
                        rotate: showActionMenu ? 90 : 0,
                        scale: showActionMenu ? 1.08 : 1,
                      }}
                      transition={{
                        type: 'spring',
                        stiffness: 360,
                        damping: 16,
                        mass: 0.7,
                      }}
                      className="inline-flex items-center justify-center origin-center"
                    >
                      {showActionMenu ? <X size={15} strokeWidth={2.5} /> : <MoreHorizontal size={16} />}
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {showActionMenu && (
                      <motion.div
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={{
                          hidden: { opacity: 0, scale: 0.85, y: 12 },
                          visible: {
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            transition: {
                              type: 'spring',
                              stiffness: 400,
                              damping: 22,
                              mass: 0.7,
                              staggerChildren: 0.042,
                              staggerDirection: -1,
                              delayChildren: 0.015,
                            },
                          },
                          exit: {
                            opacity: 0,
                            scale: 0.88,
                            y: 8,
                            transition: { duration: 0.14 },
                          },
                        }}
                        className="absolute left-0 bottom-full mb-2 z-50 w-60 p-1.5 rounded-[22px] bg-white/95 dark:bg-[#13131a]/95 border border-zinc-200 dark:border-white/12 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl flex flex-col gap-0.5 select-none origin-bottom-left"
                      >
                        {!isUser && onIllustrateScene && (
                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 14, scale: 0.82 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                              },
                            }}
                            type="button"
                            disabled={isIllustrating}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActionMenu(false);
                              handleIllustrate();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] active:scale-[0.97] transition-all cursor-pointer disabled:opacity-50 text-left origin-center"
                          >
                            <Palette size={14} className="text-amber-400 shrink-0" />
                            <span>Ilustrar escena</span>
                          </motion.button>
                        )}

                        {!isUser && onGenerateVideoScene && (
                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 14, scale: 0.82 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                              },
                            }}
                            type="button"
                            disabled={isGeneratingVideo}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActionMenu(false);
                              handleGenerateVideo();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] active:scale-[0.97] transition-all cursor-pointer disabled:opacity-50 text-left origin-center"
                          >
                            <Film size={14} className="text-amber-400 shrink-0" />
                            <span>Generar clip de video 3.0</span>
                          </motion.button>
                        )}

                        {!isUser && (
                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 14, scale: 0.82 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                              },
                            }}
                            type="button"
                            disabled={isSavingToDrive}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActionMenu(false);
                              handleSaveToDrive();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] active:scale-[0.97] transition-all cursor-pointer disabled:opacity-50 text-left origin-center"
                          >
                            {isDriveSaved ? (
                              <>
                                <Check size={14} className="text-amber-400 shrink-0" />
                                <span className="text-amber-400 font-semibold">Guardado en Google Drive</span>
                              </>
                            ) : (
                              <>
                                <CloudUpload size={14} className="text-amber-400 shrink-0" />
                                <span>Guardar en Google Drive</span>
                              </>
                            )}
                          </motion.button>
                        )}

                        {onAuditScene && (
                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 14, scale: 0.82 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                              },
                            }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowActionMenu(false);
                              onAuditScene(message.content);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.08] active:scale-[0.97] transition-all cursor-pointer text-left origin-center"
                          >
                            <ShieldAlert size={14} className="text-amber-400 shrink-0" />
                            <span>Auditar consistencia de lore</span>
                          </motion.button>
                        )}

                        {onDeleteMessage && (
                          <motion.div
                            variants={{
                              hidden: { opacity: 0, y: 14, scale: 0.82 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                              },
                            }}
                            className="origin-center"
                          >
                            <div className="my-0.5 border-t border-zinc-200 dark:border-white/10" />
                            {showDeleteConfirm ? (
                              <div className="flex items-center justify-between px-3 py-2 min-h-[44px] rounded-2xl bg-red-950/40 border border-red-800/50 text-xs">
                                <span className="text-red-300 font-medium">¿Eliminar?</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowActionMenu(false);
                                      handleDelete();
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-semibold cursor-pointer"
                                  >
                                    Sí
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDeleteConfirm(false);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowDeleteConfirm(true);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-2xl text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/10 active:scale-[0.97] transition-all cursor-pointer text-left"
                              >
                                <Trash2 size={14} className="shrink-0" />
                                <span>Eliminar mensaje</span>
                              </button>
                            )}
                          </motion.div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right: Word & Token counters (clean line on PC, wraps gracefully on narrow mobile) */}
              {!isUser && (wordCount > 0 || message.estimatedTokens || message.ttftSeconds !== undefined || message.tokensPerSecond !== undefined || (message.cachedTokens !== undefined && message.cachedTokens > 0)) && (
                <div className="text-[10px] font-mono text-zinc-500 flex-wrap justify-end ml-auto flex items-center gap-x-1.5 gap-y-1 pt-0.5">
                  {message.cachedTokens !== undefined && message.cachedTokens > 0 && (
                    <>
                      <span className="text-amber-700 dark:text-amber-400 font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/20 font-medium" title={`KV Cache Hit activo (-90% costo en ${message.cachedTokens.toLocaleString()} tokens de entrada)`}>
                        <Zap size={10} className="shrink-0" />
                        <span>Caché: {message.cachedTokens >= 1000 ? `${(message.cachedTokens / 1000).toFixed(1)}k` : `${message.cachedTokens} tok`} (-90%)</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {message.ttftSeconds !== undefined && (
                    <>
                      <span className="text-amber-700 dark:text-amber-400/90 font-mono font-medium inline-flex items-center gap-1" title="Time To First Token (Latencia hasta el 1er token)">
                        <Timer size={10} className="shrink-0" />
                        <span>TTFT: {message.ttftSeconds.toFixed(1)}s</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {message.tokensPerSecond !== undefined && message.tokensPerSecond > 0 && (
                    <>
                      <span
                        className="font-mono font-medium inline-flex items-center gap-1 text-amber-700 dark:text-amber-400/90"
                        title={`Velocidad real de escritura: ${message.tokensPerSecond.toFixed(1)} tokens/seg (cronometrado desde el 1er al último token)`}
                      >
                        <Gauge size={10} className="shrink-0" />
                        <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {wordCount > 0 && <span>{wordCount} palabras</span>}
                  {wordCount > 0 && <span>·</span>}
                  <span>{message.estimatedTokens || wordCount * 2} tokens</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* APK / Play Store Style Download Progress Modal */}
      <AnimatePresence>
        {apkDownloadModal?.active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
          >
            <div className="w-full max-w-sm bg-[#09090b] border border-[#272730] rounded-3xl p-5 shadow-2xl space-y-4 text-white relative overflow-hidden">
              {/* Glow Header Accent */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500" />

              {/* APK / App Icon Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-blue-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-inner">
                  <CloudUpload className={`w-6 h-6 ${apkDownloadModal.isComplete ? 'text-emerald-400' : 'text-cyan-400 animate-bounce'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold">
                      APK / Drive Package
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate mt-0.5">
                    {apkDownloadModal.fileName || 'Kizuna_Manuscrito.docx'}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400 truncate">
                    {apkDownloadModal.step}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-zinc-400">
                    {apkDownloadModal.isComplete ? 'Descargado y Guardado' : 'Procesando paquete...'}
                  </span>
                  <span className="font-bold text-emerald-400">{apkDownloadModal.progress}%</span>
                </div>
                <div className="h-2.5 w-full bg-[#181820] rounded-full overflow-hidden border border-[#262632] p-0.5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-blue-500 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${apkDownloadModal.progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Sub-status Indicator */}
              <div className="p-3 rounded-2xl bg-[#121218] border border-[#1f1f2a] text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Sparkles size={13} className="text-amber-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-amber-300">Filtro DeepSeek V4.1 Flash activo</span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-tight pl-5">
                  Extrayendo prosa y estructura limpia sin saludos ni comentarios meta.
                </p>
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {apkDownloadModal.webViewLink && (
                  <a
                    href={apkDownloadModal.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95 transition-all shadow-md cursor-pointer"
                  >
                    <ExternalLink size={13} />
                    <span>Abrir en Drive</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setApkDownloadModal(null)}
                  className="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-medium bg-[#1a1a22] hover:bg-[#252530] text-zinc-300 active:scale-95 transition-colors cursor-pointer"
                >
                  {apkDownloadModal.isComplete ? 'Listo' : 'Cerrar'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.thinking === nextProps.message.thinking &&
    prevProps.message.error === nextProps.message.error &&
    prevProps.message.reasoningDurationSeconds === nextProps.message.reasoningDurationSeconds &&
    prevProps.message.ttftSeconds === nextProps.message.ttftSeconds &&
    prevProps.message.cachedTokens === nextProps.message.cachedTokens &&
    prevProps.message.tokensPerSecond === nextProps.message.tokensPerSecond &&
    prevProps.message.estimatedTokens === nextProps.message.estimatedTokens &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.message.isInterrupted === nextProps.message.isInterrupted &&
    prevProps.isInterrupted === nextProps.isInterrupted &&
    prevProps.isLastAssistant === nextProps.isLastAssistant &&
    prevProps.searchHighlightQuery === nextProps.searchHighlightQuery &&
    prevProps.message.activeVariantIndex === nextProps.message.activeVariantIndex &&
    (prevProps.message.variants?.length || 0) === (nextProps.message.variants?.length || 0) &&
    (prevProps.message.attachments?.length || 0) === (nextProps.message.attachments?.length || 0) &&
    (prevProps.availableLoreFiles?.length || 0) === (nextProps.availableLoreFiles?.length || 0)
  );
});
