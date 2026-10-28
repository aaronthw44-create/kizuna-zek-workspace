import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Menu,
  Download,
  SlidersHorizontal,
  Image as ImageIcon,
  BookOpen,
  Edit2,
  Check,
  ChevronDown,
  Trash2,
  Gauge,
  X,
  BarChart3,
  FolderInput,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Book,
  FolderOpen,
  Camera,
  MoreVertical,
  Sun,
  Moon,
  Gamepad,
  CloudUpload,
  Phone,
  Search,
  MoreHorizontal,
  Columns,
  Filter,
  FileText,
} from 'lucide-react';
import { RunicSealIcon } from './RunicSealIcon';
import { BookBindingIcon } from './BookBindingIcon';
import { Chat, Folder, LoreFile, AppSettings } from '../types';
import { useGamepadNav } from '../hooks/useGamepadNav';

interface ChatHeaderProps {
  chat: Chat | null;
  folder: Folder | null;
  folders?: Folder[];
  availableLoreFiles: LoreFile[];
  sessionMediaCount: number;
  totalContextTokens: number;
  settings?: AppSettings;
  currentProvider?: 'gemini' | 'custom' | 'alibaba';
  onSelectQuickModel?: (provider: 'gemini' | 'custom' | 'alibaba', model: string) => void;
  onToggleAutoRouting?: (enabled: boolean) => void;
  onUpdateProvider?: (provider: 'gemini' | 'custom' | 'alibaba', model: string) => void;
  isZenMode?: boolean;
  isStreaming?: boolean;
  isAuditingLore?: boolean;
  isAuditFinished?: boolean;
  isLightMode?: boolean;
  onToggleTheme?: () => void;
  reasoningMode?: 'off' | 'light' | 'deep';
  onCycleReasoningMode?: () => void;
  onToggleReasoning?: (mode: 'off' | 'light' | 'deep') => void;
  onToggleSidebar: () => void;
  onOpenMediaGallery: () => void;
  onOpenSettings: () => void;
  onOpenStats?: () => void;
  onToggleZenMode?: () => void;
  onAuditScene?: () => void;
  onInspectUI?: () => void;
  onOpenFolderManager: (folderId: string) => void;
  onUpdateChatTitle: (chatId: string, newTitle: string) => void;
  onToggleLoreFile: (chatId: string, loreFileId: string) => void;
  onSelectAllLoreFiles?: (chatId: string, loreIds: string[]) => void;
  onDeselectAllLoreFiles?: (chatId: string) => void;
  onMoveChat?: (chatId: string, targetFolderId: string | null) => void;
  onExportChat: () => void;
  onExportEpub?: () => void;
  onExportChatToDrive?: () => void;
  onClearChat: () => void;
  onOpenGoogleDrive?: () => void;
  onStartVoiceCall?: () => void;
  onOpenChatDriveSheet?: (chat: Chat) => void;
  onToggleInChatSearch?: () => void;
  onOpenTokenBreakdown?: () => void;
  onOpenEngineDuel?: () => void;
  onOpenEditorialExport?: () => void;
  onToggleDynamicLoreRag?: (enabled: boolean) => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = React.memo(({
  chat,
  folder,
  folders = [],
  availableLoreFiles,
  sessionMediaCount,
  totalContextTokens,
  settings,
  currentProvider = 'gemini',
  onSelectQuickModel,
  onToggleAutoRouting,
  onUpdateProvider,
  isZenMode = false,
  isStreaming = false,
  isAuditingLore = false,
  isAuditFinished = false,
  isLightMode = false,
  onToggleTheme,
  reasoningMode = 'deep',
  onCycleReasoningMode,
  onToggleReasoning,
  onToggleSidebar,
  onOpenMediaGallery,
  onOpenSettings,
  onOpenStats,
  onToggleZenMode,
  onAuditScene,
  onInspectUI,
  onOpenFolderManager,
  onUpdateChatTitle,
  onToggleLoreFile,
  onSelectAllLoreFiles,
  onDeselectAllLoreFiles,
  onMoveChat,
  onExportChat,
  onExportEpub,
  onExportChatToDrive,
  onClearChat,
  onOpenGoogleDrive,
  onStartVoiceCall,
  onOpenChatDriveSheet,
  onToggleInChatSearch,
  onOpenTokenBreakdown,
  onOpenEngineDuel,
  onOpenEditorialExport,
  onToggleDynamicLoreRag,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isLoreSelectorOpen, setIsLoreSelectorOpen] = useState(false);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [isTokenGaugeOpen, setIsTokenGaugeOpen] = useState(false);
  const [isBindingEpub, setIsBindingEpub] = useState(false);
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xl' | 'xxl'>(() => {
    try {
      const saved = localStorage.getItem('kizuna_font_scale');
      if (saved === 'normal' || saved === 'large' || saved === 'xl' || saved === 'xxl') {
        return saved;
      }
    } catch {}
    return 'large';
  });
  const loreDropdownRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const tokenGaugeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (fontScale === 'normal') {
      root.style.setProperty('--kz-prose-size', '15.5px');
      root.style.setProperty('--kz-prose-leading', '1.58');
    } else if (fontScale === 'large') {
      root.style.setProperty('--kz-prose-size', '17px');
      root.style.setProperty('--kz-prose-leading', '1.62');
    } else if (fontScale === 'xl') {
      root.style.setProperty('--kz-prose-size', '18.5px');
      root.style.setProperty('--kz-prose-leading', '1.66');
    } else if (fontScale === 'xxl') {
      root.style.setProperty('--kz-prose-size', '20.5px');
      root.style.setProperty('--kz-prose-leading', '1.70');
    }
    try {
      localStorage.setItem('kizuna_font_scale', fontScale);
    } catch {}
  }, [fontScale]);

  const handleTriggerExportEpub = () => {
    if (!onExportEpub || isBindingEpub) return;
    setIsBindingEpub(true);
    // 1.2s micro-interaction: bookSnapShut -> latchClick -> epubFloatSuccess bounce as download triggers
    setTimeout(() => {
      onExportEpub();
    }, 450);
    setTimeout(() => {
      setIsBindingEpub(false);
    }, 1200);
  };

  useEffect(() => {
    if (chat) {
      setTitleInput(chat.title);
    }
  }, [chat?.id, chat?.title]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        loreDropdownRef.current &&
        !loreDropdownRef.current.contains(e.target as Node)
      ) {
        setIsLoreSelectorOpen(false);
      }
      if (
        folderDropdownRef.current &&
        !folderDropdownRef.current.contains(e.target as Node)
      ) {
        setIsFolderSelectorOpen(false);
      }
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setIsOverflowOpen(false);
      }
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(e.target as Node)
      ) {
        setIsModelMenuOpen(false);
      }
      if (
        tokenGaugeRef.current &&
        !tokenGaugeRef.current.contains(e.target as Node)
      ) {
        setIsTokenGaugeOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLoreSelectorOpen(false);
        setIsFolderSelectorOpen(false);
        setIsOverflowOpen(false);
        setIsModelMenuOpen(false);
        setIsTokenGaugeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSaveTitle = () => {
    if (chat && titleInput.trim()) {
      onUpdateChatTitle(chat.id, titleInput.trim());
    }
    setIsEditingTitle(false);
  };

  const activeLoreCount = chat
    ? availableLoreFiles.filter((l) => chat.selectedLoreFileIds.includes(l.id)).length
    : 0;

  const activeLoreWords = chat
    ? availableLoreFiles
        .filter((l) => chat.selectedLoreFileIds.includes(l.id))
        .reduce((sum, l) => sum + l.wordCount, 0)
    : 0;

  const { isGamepadConnected, gamepadName } = useGamepadNav();

  // 1,000,000 Context Window Calculation
  const maxContextWindow = 1000000;
  const contextPercentage = Math.min((totalContextTokens / maxContextWindow) * 100, 100);
  const formattedTokenCount =
    totalContextTokens > 1000
      ? `${(totalContextTokens / 1000).toFixed(1)}k`
      : `${totalContextTokens}`;

  return (
    <header className="sticky top-0 z-30 w-full h-14 bg-[#09090b] border-b border-white/10 px-2 sm:px-3 flex items-center justify-between gap-1 sm:gap-2 shrink-0 select-none">
      {/* Left Section: Fixed Hamburger Menu + Clean Title & Folder */}
      <div className="flex items-center min-w-0 flex-1 mr-1 sm:mr-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="relative z-30 w-11 h-11 min-h-[44px] min-w-[44px] ml-0.5 mr-1.5 shrink-0 rounded-full bg-white/[0.08] md:hover:bg-white/[0.14] active:bg-white/[0.2] border border-white/[0.08] text-neutral-100 select-none active:scale-95 transition-colors duration-150 flex items-center justify-center cursor-pointer touch-manipulation after:content-[''] after:absolute after:-inset-2"
          aria-label="Abrir menú"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" className="pointer-events-none">
            <line x1="4" y1="8.5" x2="20" y2="8.5" />
            <line x1="4" y1="15.5" x2="14" y2="15.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 flex flex-col justify-center ml-0.5 sm:ml-1 py-0.5">
          {/* Breadcrumb row (visible on desktop or when folder is distinct) */}
          {chat && folder && (
            <div className="relative z-20 hidden sm:block" ref={folderDropdownRef}>
              <div className="flex items-center gap-1 text-[10.5px] sm:text-[11px] text-zinc-500 dark:text-[#71717a] font-mono leading-tight mb-0.5 truncate">
                <button
                  type="button"
                  onClick={() => setIsFolderSelectorOpen(!isFolderSelectorOpen)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors truncate cursor-pointer max-w-[160px] sm:max-w-[240px] select-none active:scale-95"
                  title="Cambiar carpeta / arco"
                >
                  <span className="truncate font-semibold">{folder.name}</span>
                  <ChevronDown size={10} className="shrink-0 text-zinc-500" />
                </button>
              </div>
              {/* Folder Selector Dropdown */}
              <AnimatePresence>
                {isFolderSelectorOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full mt-2 w-60 max-w-[calc(100vw-24px)] bg-[#0e0e12] border border-[#27272c] rounded-xl shadow-2xl p-2 z-[120] text-white space-y-1"
                  >
                    <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase tracking-wider border-b border-[#1c1c24]">
                      Reasignar Conversación
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onMoveChat?.(chat.id, null);
                        setIsFolderSelectorOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono text-left transition-colors cursor-pointer ${
                        !chat.folderId
                          ? 'bg-white text-black font-semibold'
                          : 'text-zinc-300 hover:bg-[#181820] hover:text-white'
                      }`}
                    >
                      <span>Sin archivar (General)</span>
                      {!chat.folderId && <Check size={12} />}
                    </button>
                    {folders.map((f) => {
                      const isSelected = chat.folderId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            onMoveChat?.(chat.id, f.id);
                            setIsFolderSelectorOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-white text-black font-semibold'
                              : 'text-zinc-300 hover:bg-[#181820] hover:text-white'
                          }`}
                        >
                          <span className="truncate">{f.name}</span>
                          {isSelected && <Check size={12} />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {/* Title row */}
          {chat ? (
            <div className="flex items-center gap-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-1 min-w-0">
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle();
                      if (e.key === 'Escape') setIsEditingTitle(false);
                    }}
                    autoFocus
                    className="bg-[#141418] border border-amber-500/50 rounded-md px-2 py-0.5 text-[16px] md:text-xs text-white focus:outline-none focus:border-amber-400 font-medium max-w-[160px] xs:max-w-[220px] sm:max-w-[280px]"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // prevent input blur before button click
                    onClick={handleSaveTitle}
                    className="p-1 min-h-[36px] min-w-[36px] text-amber-400 hover:text-white hover:bg-amber-500/20 rounded-md shrink-0 cursor-pointer flex items-center justify-center transition-colors"
                    title="Guardar título"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group min-w-0">
                  <h1
                    onClick={() => {
                      if (onOpenChatDriveSheet) {
                        onOpenChatDriveSheet(chat);
                      } else {
                        setIsEditingTitle(true);
                      }
                    }}
                    className={`truncate max-w-[170px] xs:max-w-[230px] sm:max-w-xs md:max-w-md text-xs sm:text-sm font-semibold text-white hover:text-amber-300 leading-normal select-none cursor-pointer transition-colors ${
                      isStreaming ? 'chat-title-streaming-fade' : ''
                    }`}
                    title={`${chat.title} • Toca para opciones de la conversación`}
                  >
                    {chat.title}
                  </h1>
                </div>
              )}
            </div>
          ) : (
            <h1 className="truncate max-w-[180px] sm:max-w-xs text-sm font-semibold text-white leading-normal">
              Kizuna-Zek
            </h1>
          )}
        </div>
      </div>

      {/* PS5 DualSense Gamepad Indicator */}
      {isGamepadConnected && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] rounded-xl text-xs font-mono bg-amber-500/15 border border-amber-500/40 text-amber-300 animate-noir-enter shrink-0 mr-1 sm:mr-2"
          title={`${gamepadName} activo • D-Pad/Sticks: Navegar | ✖: Seleccionar | ◯: Atrás | ■: Razonamiento | ▲: Modelos`}
        >
          <Gamepad size={15} className="text-amber-400 animate-pulse" />
          <span className="hidden sm:inline text-[11px] font-semibold">{gamepadName}</span>
        </div>
      )}

      {/* UNIVERSAL MODEL HUB DROPDOWN */}
      <div className="relative shrink-0 mr-1 sm:mr-2" ref={modelMenuRef}>
        <button
          type="button"
          onClick={() => setIsModelMenuOpen((prev) => !prev)}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 min-h-[36px] sm:min-h-[44px] rounded-xl text-xs font-mono border transition-all cursor-pointer select-none active:scale-95 ${
            settings?.autoModelRouting
              ? 'bg-amber-500/15 dark:bg-[#161410] border-amber-500/50 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 hover:border-amber-500 dark:hover:border-amber-400'
              : 'bg-zinc-100 dark:bg-[#141418] border-zinc-300 dark:border-[#27272c] text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white'
          }`}
          title={
            settings?.autoModelRouting
              ? 'Modo Automático Activo: Alterna entre Qwen 3.8 Max, DeepSeek V4 Pro 0813, Kimi K3, Qwen 2.4-A95B, DeepSeek V4.1 Flash, Qwen Flash y Qwen Plus'
              : 'Cambiar modelo activo'
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              settings?.autoModelRouting
                ? 'bg-amber-500 dark:bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                : currentProvider === 'alibaba'
                  ? 'bg-orange-500'
                  : currentProvider === 'custom'
                    ? 'bg-amber-400'
                    : 'bg-amber-400'
            } animate-pulse`}
          />
          <span className="text-[10.5px] sm:text-[11px] font-semibold truncate max-w-[65px] xs:max-w-[85px] sm:max-w-[145px] flex items-center gap-1">
            {settings?.autoModelRouting ? (
              <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300">
                <span>✦</span>
                <span className="hidden sm:inline">Automático</span>
                <span className="sm:hidden">Auto</span>
              </span>
            ) : (
              <>
                {currentProvider === 'alibaba' && settings?.alibabaCustomLoraModel && settings.alibabaModel === settings.alibabaCustomLoraModel && (
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    LoRA
                  </span>
                )}
                <span>
                  {currentProvider === 'alibaba'
                    ? (settings?.alibabaModel?.split('/')?.pop()?.replace(/^qwen-?/i, 'Qwen ') || 'Qwen 3.8')
                    : currentProvider === 'custom'
                      ? (settings?.customModel?.split('/')?.pop()?.replace(/^moonshotai\//i, '') || 'Kimi K3')
                      : (settings?.geminiModel || 'Gemini 3.8')}
                </span>
              </>
            )}
          </span>
          <ChevronDown size={10} className="text-zinc-500 shrink-0" />
        </button>

        <AnimatePresence>
          {isModelMenuOpen && (
            <UniversalModelDropdown
              settings={settings}
              currentProvider={currentProvider}
              currentModel={
                currentProvider === 'alibaba'
                  ? (settings?.alibabaModel || 'qwen-3.8-max')
                  : currentProvider === 'custom'
                    ? (settings?.customModel || 'moonshotai/kimi-k3')
                    : (settings?.geminiModel || 'gemini-3.6-flash')
              }
              onSelect={(provider, modelId) => {
                onSelectQuickModel?.(provider, modelId);
                setIsModelMenuOpen(false);
              }}
              onToggleAutoRouting={(enabled) => {
                onToggleAutoRouting?.(enabled);
                setIsModelMenuOpen(false);
              }}
              onClose={() => setIsModelMenuOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Right Section: Header Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Lore selector (Hidden on mobile <640px to prevent overcrowding, accessible via ChatInput and overflow) */}
        {chat && (
          <div className="relative shrink-0 hidden sm:block" ref={loreDropdownRef}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsLoreSelectorOpen(!isLoreSelectorOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] text-xs rounded-xl border transition-colors select-none active:scale-95 ${
                activeLoreCount > 0
                  ? 'bg-zinc-100 dark:bg-[#121216] border-zinc-300 dark:border-[#25252b] text-zinc-900 dark:text-white hover:border-zinc-400 dark:hover:border-[#38383e]'
                  : 'bg-transparent border-zinc-200 dark:border-[#1b1b1f] text-zinc-600 dark:text-[#71717a] hover:text-zinc-900 dark:hover:text-[#d4d4d8]'
              }`}
              title="Selector de Lore: Elige qué documentos de este arco alimentar en el contexto"
            >
              <BookOpen size={13} className={activeLoreCount > 0 ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-[#71717a]'} />
              <span className="hidden sm:inline font-medium">Docs:</span>
              <span className="font-mono text-[11px] text-zinc-900 dark:text-white">
                {activeLoreCount}/{availableLoreFiles.length}
              </span>
              <ChevronDown size={11} className="text-zinc-500 dark:text-[#71717a]" />
            </motion.button>

            {/* Lore checklist dropdown */}
            <AnimatePresence>
              {isLoreSelectorOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white/95 dark:bg-[#0a0a0d]/95 backdrop-blur-md border border-zinc-200 dark:border-[#262626] rounded-xl shadow-2xl p-3 z-[120] text-zinc-900 dark:text-white"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-[#1f1f23]">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span>Docs en Contexto</span>
                        {Math.round(activeLoreWords * 1.35) > 1450 && (
                          <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/35 text-[9px] font-sans font-semibold text-orange-400">
                            🛡️ Escudo 2K Activo
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-zinc-500 dark:text-[#71717a]">
                        {Math.round(activeLoreWords * 1.35) > 1450
                          ? `~1,450 tok enviados (comprimido de ~${Math.round(activeLoreWords * 1.35).toLocaleString()} tok)`
                          : `${activeLoreWords.toLocaleString()} palabras (~${Math.round(activeLoreWords * 1.35).toLocaleString()} tok activos)`}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setIsLoreSelectorOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="text-[11px] text-zinc-600 dark:text-[#a1a1aa] hover:text-zinc-900 dark:hover:text-white underline font-sans cursor-pointer"
                    >
                      Gestionar / Auto-Divisor
                    </button>
                  </div>

                  {/* Dynamic RAG Filter Toggle inside Docs Dropdown */}
                  {onToggleDynamicLoreRag && (
                    <div className="flex items-center justify-between px-2.5 py-2 mb-2 rounded-lg bg-zinc-100 dark:bg-[#14141c] border border-zinc-200 dark:border-[#242430]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Filter size={12} className="text-orange-500 shrink-0" />
                        <span className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          Filtro Dinámico RAG Ligero
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleDynamicLoreRag(settings?.enableDynamicLoreRag === false)}
                        className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold border transition-colors cursor-pointer ${
                          settings?.enableDynamicLoreRag !== false
                            ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {settings?.enableDynamicLoreRag !== false ? 'Activo' : 'Inactivo'}
                      </button>
                    </div>
                  )}

                  {availableLoreFiles.length > 0 && onSelectAllLoreFiles && onDeselectAllLoreFiles && (
                    <div className="flex flex-wrap items-center gap-1 pb-2 mb-2 border-b border-zinc-200 dark:border-[#1f1f23]">
                      <button
                        type="button"
                        onClick={() => {
                          const chapterFiles = availableLoreFiles.filter(
                            (f) => f.fileType === 'md' || /^\d+_/i.test(f.filename) || (f.estimatedTokens || 0) < 15000
                          );
                          const pool = chapterFiles.length > 0 ? chapterFiles : availableLoreFiles;
                          const sorted = [...pool].sort((a, b) => {
                            const numA = parseInt(a.filename.match(/^\d+/)?.[0] || '0', 10);
                            const numB = parseInt(b.filename.match(/^\d+/)?.[0] || '0', 10);
                            if (numA !== numB) return numA - numB;
                            return a.filename.localeCompare(b.filename);
                          });
                          const latest = sorted[sorted.length - 1];
                          if (latest) {
                            (onSelectAllLoreFiles as any)(chat.id, [latest.id], true);
                          }
                        }}
                        className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-[10px] font-semibold text-amber-600 dark:text-amber-300 transition-colors cursor-pointer"
                        title="Inyectar únicamente el último capítulo de la novela (Ignora PDFs masivos)"
                      >
                        ⚡ Solo Actual
                      </button>
                      {availableLoreFiles.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const chapterFiles = availableLoreFiles.filter(
                              (f) => f.fileType === 'md' || /^\d+_/i.test(f.filename) || (f.estimatedTokens || 0) < 15000
                            );
                            const pool = chapterFiles.length > 0 ? chapterFiles : availableLoreFiles;
                            const sorted = [...pool].sort((a, b) => {
                              const numA = parseInt(a.filename.match(/^\d+/)?.[0] || '0', 10);
                              const numB = parseInt(b.filename.match(/^\d+/)?.[0] || '0', 10);
                              if (numA !== numB) return numA - numB;
                              return a.filename.localeCompare(b.filename);
                            });
                            const last3 = sorted.slice(-3).map((f) => f.id);
                            (onSelectAllLoreFiles as any)(chat.id, last3, true);
                          }}
                          className="px-2 py-1 rounded bg-zinc-100 dark:bg-[#16161c] hover:bg-zinc-200 dark:hover:bg-[#1e1e26] border border-zinc-300 dark:border-[#2a2a34] text-[10px] text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                        >
                          Últimos 3
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => (onSelectAllLoreFiles as any)(chat.id, availableLoreFiles.map((f) => f.id), true)}
                        className="px-2 py-1 rounded bg-zinc-100 dark:bg-[#16161c] hover:bg-zinc-200 dark:hover:bg-[#1e1e26] border border-zinc-300 dark:border-[#2a2a34] text-[10px] text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeselectAllLoreFiles(chat.id)}
                        className="px-2 py-1 rounded bg-zinc-100 dark:bg-[#16161c] hover:bg-zinc-200 dark:hover:bg-[#1e1e26] border border-zinc-300 dark:border-[#2a2a34] text-[10px] text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                      >
                        Ninguno
                      </button>
                    </div>
                  )}

                  {availableLoreFiles.length === 0 ? (
                    <div className="py-4 text-center text-xs text-zinc-500 dark:text-[#71717a]">
                      No hay documentos en contexto todavía.
                      <button
                        onClick={() => {
                          setIsLoreSelectorOpen(false);
                          onOpenFolderManager(folder?.id || 'general');
                        }}
                        className="block mx-auto mt-1.5 text-zinc-900 dark:text-white underline cursor-pointer"
                      >
                        Subir o Pegar Documentos (.txt, .md, Docs)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto smooth-scroll pr-1">
                      {availableLoreFiles.map((file) => {
                        const isSelected = chat.selectedLoreFileIds.includes(file.id);
                        return (
                          <div
                            key={file.id}
                            onClick={() => onToggleLoreFile(chat.id, file.id)}
                            className={`flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-zinc-100 dark:bg-[#15151a] text-zinc-900 dark:text-white'
                                : 'hover:bg-zinc-50 dark:hover:bg-[#111115] text-zinc-600 dark:text-[#a1a1aa]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-0.5 accent-amber-500 dark:accent-white cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate flex items-center gap-1.5">
                                <span>{file.title}</span>
                                <span className="text-[9px] font-mono text-zinc-500 dark:text-[#71717a] uppercase">
                                  [{file.fileType}]
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-zinc-500 dark:text-[#71717a]">
                                {file.filename} · ~{(file.estimatedTokens || 0).toLocaleString()} tok
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Media Gallery "Cajita" (Hidden on mobile <640px to prevent overcrowding, accessible via ChatInput and overflow) */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onOpenMediaGallery}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[44px] text-xs text-zinc-700 dark:text-[#d4d4d8] hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-[#0e0e12] hover:bg-zinc-200 dark:hover:bg-[#141418] border border-zinc-300 dark:border-[#1f1f23] hover:border-zinc-400 dark:hover:border-[#2f2f35] rounded-xl transition-colors shrink-0 select-none active:scale-95 cursor-pointer"
          title="Galería Multimedia (La Cajita): Ver imágenes y referencias de la sesión"
        >
          <ImageIcon size={13} className="text-zinc-800 dark:text-white" />
          <span className="hidden sm:inline font-medium">Cajita</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 bg-zinc-200 dark:bg-[#1f1f23] text-zinc-800 dark:text-white rounded">
            {sessionMediaCount}
          </span>
        </motion.button>

        {/* Visual Infinite Continuous Context Gauge (Visible on both Mobile & PC) */}
        <div className="relative shrink-0" ref={tokenGaugeRef}>
          <button
            type="button"
            onClick={() => setIsTokenGaugeOpen((prev) => !prev)}
            className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2.5 py-1 min-h-[36px] sm:min-h-[40px] bg-zinc-100 dark:bg-[#0d0d12] hover:bg-zinc-200 dark:hover:bg-[#14141c] border border-zinc-300 dark:border-[#22222a] hover:border-zinc-400 dark:hover:border-[#343442] rounded-xl shrink-0 cursor-pointer active:scale-95 transition-all"
            title={`Hilo Continuo Infinito: ${totalContextTokens.toLocaleString()} tokens procesados. Toca para ver desglose y documentos activos.`}
          >
            <Gauge size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-[9.5px] sm:text-[10px] font-mono text-zinc-800 dark:text-white leading-tight whitespace-nowrap">
                Infinito · {formattedTokenCount} tok
              </span>
              <div className="w-16 h-1 bg-zinc-300 dark:bg-[#1a1a22] rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full bg-amber-500 dark:bg-amber-400 transition-all duration-300"
                  style={{ width: `${Math.max(contextPercentage, 5)}%` }}
                />
              </div>
            </div>
            <span className="sm:hidden text-[10px] font-mono text-amber-800 dark:text-amber-300 font-semibold px-0.5 whitespace-nowrap">
              {formattedTokenCount} tok
            </span>
          </button>

          {/* Interactive Context & Quick Hub Popover for Mobile & PC */}
          <AnimatePresence>
            {isTokenGaugeOpen && (
              <>
                <div
                  className="fixed inset-0 z-[118] bg-black/40 sm:bg-transparent"
                  onClick={() => setIsTokenGaugeOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.12 }}
                  className="fixed right-2 left-2 top-14 sm:fixed-none sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-w-[calc(100vw-16px)] rounded-2xl bg-white dark:bg-[#0e0e14] border border-zinc-200 dark:border-white/15 p-3.5 shadow-2xl z-[120] text-zinc-900 dark:text-white space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Gauge size={14} className="text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                        Hilo Continuo Infinito (1M)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 font-semibold">
                      Activo
                    </span>
                  </div>

                  {/* Token Gauge Meter */}
                  <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-[#14141d] border border-zinc-200 dark:border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-600 dark:text-zinc-400">Contexto en sesión:</span>
                      <span className="text-zinc-900 dark:text-white font-bold">
                        {totalContextTokens.toLocaleString()} / 1,000,000 tok
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-200 dark:bg-[#09090d] rounded-full overflow-hidden border border-zinc-300/60 dark:border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 dark:from-amber-400 dark:to-orange-500 transition-all duration-300"
                        style={{ width: `${Math.max(contextPercentage, 3)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed pt-0.5">
                      Memoria elástica activa: Kizuna conserva el hilo narrativo y tus documentos de Lore sin que tengas que reiniciar el chat.
                    </p>
                  </div>

                  {/* Quick Mobile/PC Controls for Docs & Cajita */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenFolderManager(folder?.id || 'general');
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100 dark:bg-[#15151f] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">Docs Lore</span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold">
                        {activeLoreCount}/{availableLoreFiles.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenMediaGallery();
                      }}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-100 dark:bg-[#15151f] hover:bg-zinc-200 dark:hover:bg-[#1c1c28] border border-zinc-200 dark:border-white/10 text-xs transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5">
                        <ImageIcon size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-medium text-zinc-800 dark:text-zinc-200">La Cajita</span>
                      </div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-semibold">
                        {sessionMediaCount}
                      </span>
                    </button>
                  </div>

                  {onOpenTokenBreakdown && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenTokenBreakdown();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-xs font-semibold text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
                    >
                      <Gauge size={14} className="text-amber-500 dark:text-amber-400" />
                      <span>Desglose Visual de Contexto (Inspector %)</span>
                    </button>
                  )}

                  {onOpenStats && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsTokenGaugeOpen(false);
                        onOpenStats();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <BarChart3 size={13} className="text-amber-600 dark:text-amber-400" />
                      <span>Ver Estadísticas y Actividad Completa</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Day / Night Theme Toggle (Desktop quick toggle, mobile in overflow) */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="hidden sm:flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-400 hover:text-amber-400 select-none active:scale-95 transition-all cursor-pointer shrink-0"
          title={isLightMode ? "Modo Noir" : "Modo Día"}
        >
          {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* In-Chat Search Lupa Button */}
        {chat && onToggleInChatSearch && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onToggleInChatSearch}
            className="p-1.5 sm:p-2 min-w-[38px] min-h-[38px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded-xl text-amber-400 hover:text-white hover:bg-amber-500/20 select-none active:scale-95 transition-all cursor-pointer shrink-0"
            aria-label="Buscar palabras clave en este chat"
            title="Buscar palabras clave o conceptos en esta conversación"
          >
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </motion.button>
        )}

        {/* OpenWebUI Overflow Menu Button (Visible on desktop & mobile) */}
        <div className="relative shrink-0" ref={overflowRef}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setIsOverflowOpen(!isOverflowOpen)}
            className={`p-1.5 sm:p-2 min-w-[38px] min-h-[38px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center rounded-full select-none transition-colors duration-200 cursor-pointer ${
              isOverflowOpen
                ? 'bg-white text-black shadow-lg'
                : 'text-neutral-300 hover:text-white hover:bg-white/10'
            }`}
            aria-label={isOverflowOpen ? 'Cerrar menú' : 'Más opciones'}
            title={isOverflowOpen ? 'Cerrar menú (×)' : 'Más opciones'}
          >
            <motion.span
              animate={{ rotate: isOverflowOpen ? 90 : 0, scale: isOverflowOpen ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 16, mass: 0.7 }}
              className="flex items-center justify-center origin-center"
            >
              {isOverflowOpen ? <X className="w-5 h-5" strokeWidth={2.4} /> : <MoreVertical className="w-5 h-5" />}
            </motion.span>
          </motion.button>

          {/* Mobile Dropdown Panel with Dark Frosted Backdrop & Staggered Spring Cascade */}
          <AnimatePresence>
            {isOverflowOpen && (
              <>
                {/* Dark Frosted Backdrop Overlay */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOverflowOpen(false);
                  }}
                  className="fixed inset-0 z-[119] bg-black/50 backdrop-blur-[4px]"
                />

                {/* Constrained Menu Card with Staggered Cascade ("Fila India") & Spring Bounce */}
                <motion.div
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={{
                    hidden: { opacity: 0, y: -16, scale: 0.84 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: {
                        type: 'spring',
                        stiffness: 390,
                        damping: 20,
                        mass: 0.72,
                        staggerChildren: 0.042,
                        delayChildren: 0.01,
                      },
                    },
                    exit: {
                      opacity: 0,
                      y: -10,
                      scale: 0.9,
                      transition: { duration: 0.12 },
                    },
                  }}
                  className="fixed right-3 top-14 max-w-[min(330px,92vw)] max-h-[calc(100dvh-4.5rem)] overflow-y-auto smooth-scroll w-full rounded-[26px] bg-white/95 dark:bg-[#13131a]/95 border border-zinc-200 dark:border-white/12 p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.78)] z-[120] text-zinc-900 dark:text-white space-y-2 origin-top-right font-sans"
                >
                  {/* 1. Selector Rápido de Tamaño de Letra */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: -12, scale: 0.84 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                      },
                    }}
                    className="px-2.5 py-2 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04] border border-zinc-200/80 dark:border-white/10 origin-center"
                  >
                    <div className="flex items-center justify-between text-[11px] font-medium tracking-tight text-zinc-600 dark:text-zinc-300 mb-1.5">
                      <span>Tamaño de letra</span>
                      <span className="text-[11px] text-orange-600 dark:text-orange-400 font-semibold tracking-tight">
                        {fontScale === 'normal'
                          ? '15.5px'
                          : fontScale === 'large'
                          ? '17px · Cómodo'
                          : fontScale === 'xl'
                          ? '18.5px'
                          : '20.5px'}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {(
                        [
                          { id: 'normal', label: 'A', desc: 'Compacto' },
                          { id: 'large', label: 'A+', desc: 'Cómodo' },
                          { id: 'xl', label: 'A++', desc: 'Grande' },
                          { id: 'xxl', label: 'MAX', desc: 'Extra' },
                        ] as const
                      ).map((opt) => {
                        const active = fontScale === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFontScale(opt.id);
                            }}
                            className={`flex flex-col items-center justify-center min-h-[44px] rounded-xl border text-xs font-sans tracking-tight transition-all cursor-pointer select-none active:scale-95 ${
                              active
                                ? 'bg-orange-500/20 border-orange-500/60 text-orange-700 dark:text-orange-300 font-semibold shadow-xs'
                                : 'bg-white dark:bg-[#16161d] border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10'
                            }`}
                            title={`Tamaño ${opt.desc}`}
                          >
                            <span className="text-[12px] leading-none font-semibold">{opt.label}</span>
                            <span className="text-[9.5px] opacity-75 mt-0.5">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* 2. Cuadrícula Principal de Accesos Rápidos (Efecto Cascada Item por Item) */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {onToggleTheme && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onToggleTheme();
                        }}
                        className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                      >
                        {isLightMode ? <Moon size={15} className="shrink-0" /> : <Sun size={15} className="shrink-0" />}
                        <span className="truncate">{isLightMode ? 'Modo Noir' : 'Modo Día'}</span>
                      </motion.button>
                    )}

                    {onToggleZenMode && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onToggleZenMode();
                        }}
                        className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                      >
                        {isZenMode ? <Minimize2 size={15} className="shrink-0" /> : <BookOpen size={15} className="shrink-0" />}
                        <span className="truncate">{isZenMode ? 'Salir Zen' : 'Modo Zen'}</span>
                      </motion.button>
                    )}

                    {onStartVoiceCall && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onStartVoiceCall();
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/10 text-xs transition-colors cursor-pointer select-none origin-center group"
                      >
                        {/* Mini Noir Volumetric Sphere ("esa bola" en Blanco y Negro) */}
                        <span
                          className="w-4 h-4 rounded-full shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform"
                          style={{
                            background:
                              'radial-gradient(circle at 36% 32%, #ffffff 0%, #e4e4e7 42%, #52525b 78%, #09090b 100%)',
                          }}
                        />
                        <span className="truncate tracking-tight text-[12.5px] flex items-baseline gap-1">
                          <span className="font-semibold text-zinc-900 dark:text-white">Kizuna</span>
                          <span className="font-normal text-zinc-500 dark:text-zinc-400">Voz</span>
                        </span>
                      </motion.button>
                    )}

                    <motion.button
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.82 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      whileTap={{ scale: 0.94 }}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenSettings();
                      }}
                      className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                    >
                      <SlidersHorizontal size={15} className="shrink-0" />
                      <span className="truncate">Ajustes</span>
                    </motion.button>

                    <motion.button
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.82 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      whileTap={{ scale: 0.94 }}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOverflowOpen(false);
                        onOpenMediaGallery();
                      }}
                      className="flex items-center justify-between gap-1.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer select-none origin-center"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ImageIcon size={15} className="shrink-0" />
                        <span className="truncate">La Cajita</span>
                      </div>
                      <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-white/10 text-zinc-800 dark:text-zinc-200 shrink-0">
                        {sessionMediaCount}
                      </span>
                    </motion.button>

                    {chat && (
                      <motion.button
                        variants={{
                          hidden: { opacity: 0, y: -12, scale: 0.82 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                          },
                        }}
                        whileTap={{ scale: 0.94 }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onOpenFolderManager(folder?.id || 'general');
                        }}
                        className="flex items-center justify-between gap-1.5 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-orange-500 dark:hover:text-orange-400 transition-colors cursor-pointer select-none origin-center"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <BookOpen size={15} className="text-orange-500 dark:text-orange-400 shrink-0" />
                          <span className="truncate">Docs Lore</span>
                        </div>
                        <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-800 dark:text-orange-300 shrink-0">
                          {activeLoreCount}/{availableLoreFiles.length}
                        </span>
                      </motion.button>
                    )}
                  </div>

                  {/* 3. Barra Compacta de Exportación (1 sola fila con efecto resorte y paleta Noir/Naranja) */}
                  {chat && chat.messages.length > 0 && (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: -12, scale: 0.84 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      className="pt-1.5 border-t border-zinc-200 dark:border-white/10 origin-center"
                    >
                      <div className="px-1 pb-1.5 text-[11px] font-medium tracking-tight text-zinc-500 dark:text-zinc-400">
                        Exportar capítulo
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {onOpenEditorialExport && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              onOpenEditorialExport();
                            }}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-orange-500/12 hover:bg-orange-500/22 border border-orange-500/35 text-[10.5px] font-medium tracking-tight text-orange-700 dark:text-orange-300 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportador Editorial (MD / DOCX / EPUB)"
                          >
                            <FileText size={14} className="text-orange-500 dark:text-orange-400" />
                            <span>Editorial</span>
                          </button>
                        )}

                        {onExportEpub && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              handleTriggerExportEpub();
                            }}
                            disabled={isBindingEpub}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportar EPUB (.epub)"
                          >
                            <BookBindingIcon isBinding={isBindingEpub} size={14} />
                            <span>EPUB</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOverflowOpen(false);
                            onExportChat();
                          }}
                          className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-zinc-200/80 dark:hover:bg-white/10 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none active:scale-95"
                          title="Exportar Markdown (.md)"
                        >
                          <Download size={14} className="text-zinc-800 dark:text-white" />
                          <span>.MD</span>
                        </button>

                        {onExportChatToDrive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              onExportChatToDrive();
                            }}
                            className="flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-xl bg-zinc-100/80 dark:bg-white/[0.04] hover:bg-orange-500/15 border border-zinc-200/80 dark:border-white/10 text-[10.5px] font-medium tracking-tight text-zinc-700 dark:text-zinc-200 hover:text-orange-400 transition-colors cursor-pointer select-none active:scale-95"
                            title="Exportar a Google Drive"
                          >
                            <CloudUpload size={14} className="text-orange-500 dark:text-orange-400" />
                            <span>Drive</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* 4. Acordeón Compacto de Herramientas Avanzadas con Cascada Spring */}
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: -10, scale: 0.86 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                      },
                    }}
                    className="pt-1 border-t border-zinc-200 dark:border-white/10 origin-center"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAdvancedMenu((prev) => !prev);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 min-h-[44px] rounded-2xl text-xs font-medium tracking-tight text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors cursor-pointer select-none"
                    >
                      <span>Más herramientas y análisis</span>
                      <motion.span
                        animate={{ rotate: showAdvancedMenu ? 180 : 0 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                        className="flex items-center justify-center"
                      >
                        <ChevronDown size={15} className={showAdvancedMenu ? 'text-orange-400' : ''} />
                      </motion.span>
                    </button>

                    <AnimatePresence>
                      {showAdvancedMenu && (
                        <motion.div
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          variants={{
                            hidden: { opacity: 0, height: 0 },
                            visible: {
                              opacity: 1,
                              height: 'auto',
                              transition: { staggerChildren: 0.038 },
                            },
                          }}
                          className="grid grid-cols-2 gap-1.5 pt-1.5 overflow-hidden"
                        >
                          {chat && chat.messages.length > 0 && onAuditScene && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onAuditScene();
                              }}
                              disabled={isAuditingLore}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <RunicSealIcon isAuditing={isAuditingLore} isFinished={isAuditFinished} size={14} />
                              <span className="truncate">Auditar Lore</span>
                            </motion.button>
                          )}

                          {chat && onOpenEngineDuel && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenEngineDuel();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Columns size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                              <span className="truncate">Duelo Motores</span>
                            </motion.button>
                          )}

                          {chat && onOpenTokenBreakdown && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenTokenBreakdown();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Gauge size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                              <span className="truncate">Tokens (%)</span>
                            </motion.button>
                          )}

                          {onOpenStats && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onOpenStats();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <BarChart3 size={14} className="shrink-0" />
                              <span className="truncate">Estadísticas</span>
                            </motion.button>
                          )}

                          <motion.button
                            variants={{
                              hidden: { opacity: 0, y: 10, scale: 0.84 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 380, damping: 18 },
                              },
                            }}
                            whileTap={{ scale: 0.94 }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsOverflowOpen(false);
                              if (onOpenGoogleDrive) {
                                onOpenGoogleDrive();
                              }
                            }}
                            className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                          >
                            <FolderOpen size={14} className="text-orange-500 dark:text-orange-400 shrink-0" />
                            <span className="truncate">Carpeta Drive</span>
                          </motion.button>

                          {onInspectUI && (
                            <motion.button
                              variants={{
                                hidden: { opacity: 0, y: 10, scale: 0.84 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { type: 'spring', stiffness: 380, damping: 18 },
                                },
                              }}
                              whileTap={{ scale: 0.94 }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsOverflowOpen(false);
                                onInspectUI();
                              }}
                              className="flex items-center gap-2 px-2.5 py-2 min-h-[44px] rounded-2xl bg-zinc-100/70 dark:bg-white/[0.04] hover:bg-zinc-200/70 dark:hover:bg-white/10 border border-zinc-200/70 dark:border-white/8 text-xs font-medium tracking-tight text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer select-none origin-center"
                            >
                              <Camera size={14} className="shrink-0" />
                              <span className="truncate">Captura UI</span>
                            </motion.button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* 5. Limpiar conversación */}
                  {chat && chat.messages.length > 0 && (
                    <motion.div
                      variants={{
                        hidden: { opacity: 0, y: -8, scale: 0.88 },
                        visible: {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 380, damping: 18, mass: 0.68 },
                        },
                      }}
                      className="pt-1 border-t border-zinc-200 dark:border-white/10 origin-center"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsOverflowOpen(false);
                          onClearChat();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] rounded-2xl text-xs font-medium tracking-tight text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors cursor-pointer select-none active:scale-95"
                      >
                        <Trash2 size={14} />
                        <span>Limpiar conversación</span>
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Full-Width Runic Amber Filament directly under top header */}
      <div className="absolute bottom-0 left-0 right-0 w-full overflow-hidden pointer-events-none">
        <div className="runic-aura-divider" />
      </div>
    </header>
  );
}, (prev, next) => {
  return (
    prev.chat?.id === next.chat?.id &&
    prev.chat?.title === next.chat?.title &&
    prev.chat?.folderId === next.chat?.folderId &&
    (prev.chat?.selectedLoreFileIds?.length || 0) === (next.chat?.selectedLoreFileIds?.length || 0) &&
    prev.folder?.id === next.folder?.id &&
    prev.folder?.name === next.folder?.name &&
    (prev.folders?.length || 0) === (next.folders?.length || 0) &&
    prev.availableLoreFiles.length === next.availableLoreFiles.length &&
    prev.sessionMediaCount === next.sessionMediaCount &&
    prev.totalContextTokens === next.totalContextTokens &&
    prev.settings === next.settings &&
    prev.currentProvider === next.currentProvider &&
    prev.isZenMode === next.isZenMode &&
    prev.isStreaming === next.isStreaming &&
    prev.isAuditingLore === next.isAuditingLore &&
    prev.isAuditFinished === next.isAuditFinished &&
    prev.isLightMode === next.isLightMode &&
    prev.reasoningMode === next.reasoningMode
  );
});

const VisionLensIcon: React.FC<{ size?: number; className?: string }> = ({ size = 11, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <circle cx="12" cy="12" r="9" opacity="0.3" strokeDasharray="2 2" />
    <path d="M2.5 12c2.8-4.8 6.5-7.5 9.5-7.5s6.7 2.7 9.5 7.5c-2.8 4.8-6.5 7.5-9.5 7.5s-6.7-2.7-9.5-7.5z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.2" />
    <circle cx="13.2" cy="10.8" r="0.9" fill="currentColor" />
  </svg>
);

const NeuralCoreIcon: React.FC<{ size?: number; className?: string }> = ({ size = 11, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
    <rect x="4" y="4" width="16" height="16" rx="4" opacity="0.3" />
    <circle cx="9" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="15" cy="9" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <circle cx="12" cy="15" r="1.8" fill="currentColor" fillOpacity="0.25" />
    <path d="M9 9l3 6 3-6" opacity="0.75" />
    <path d="M9 9h6" opacity="0.5" strokeDasharray="1.5 1.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);

interface LiveModelItem {
  id: string;
  name: string;
  provider: 'gemini' | 'custom' | 'alibaba';
  description: string;
  isVision: boolean;
  hasReasoning: boolean;
  badge?: string;
}

const UniversalModelDropdown: React.FC<{
  settings?: AppSettings;
  currentProvider: 'gemini' | 'custom' | 'alibaba';
  currentModel: string;
  onSelect: (provider: 'gemini' | 'custom' | 'alibaba', modelId: string) => void;
  onToggleAutoRouting?: (enabled: boolean) => void;
  onClose: () => void;
}> = ({ settings, currentProvider, currentModel, onSelect, onToggleAutoRouting, onClose }) => {
  const [models, setModels] = useState<LiveModelItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [providerTab, setProviderTab] = useState<'all' | 'alibaba' | 'gemini' | 'custom'>('all');
  const [onlyVision, setOnlyVision] = useState(false);
  const [onlyReasoning, setOnlyReasoning] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchAllModels = async () => {
      setIsLoading(true);
      const list: LiveModelItem[] = [];

      // 0. Registered Author LoRA / Custom Fine-Tuned Model
      if (settings?.alibabaCustomLoraModel?.trim()) {
        const loraId = settings.alibabaCustomLoraModel.trim();
        list.push({
          id: loraId,
          name: settings.alibabaCustomLoraName?.trim() || `${loraId} (Afinado de Autor)`,
          provider: 'alibaba',
          description: 'Alibaba Cloud MaaS: Adaptador LoRA / SFT Personalizado de Novela',
          isVision: true,
          hasReasoning: true,
          badge: 'LoRA Autor',
        });
      }

      // 1. Fetch real Gemini models
      try {
        const gKey = settings?.geminiApiKey || localStorage.getItem('kizuna_gemini_api_key') || '';
        const gRes = await fetch(`/api/gemini/models?key=${encodeURIComponent(gKey)}`);
        if (gRes.ok) {
          const gData = await gRes.json();
          const listM = Array.isArray(gData.models) ? gData.models : [];
          const nonChatRegex = /tts|computer-use|audio|robotics|embedding|imagen|veo|aqa/i;
          listM.forEach((m: any) => {
            const cleanId = m.id.replace(/^models\//, '');
            if (nonChatRegex.test(cleanId) || nonChatRegex.test(m.name || '') || nonChatRegex.test(m.displayName || '')) return;
            list.push({
              id: cleanId,
              name: m.displayName || cleanId,
              provider: 'gemini',
              description: m.description || 'Google Generative AI Engine',
              isVision: true,
              hasReasoning: /3\.[0-9]|4-|thinking/i.test(cleanId),
              badge: cleanId.includes('3.8') ? 'Flash 3.8' : cleanId.includes('argon') ? 'Argon' : undefined,
            });
          });
        }
      } catch {
        // Fallback core models
        ['gemini-3.8-flash', 'gemini-3.8-live', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite'].forEach((id) => {
          list.push({
            id,
            name: id === 'gemini-3.8-live' ? 'Gemini 3.8 Live' : id,
            provider: 'gemini',
            description: 'Google Generative AI Engine',
            isVision: true,
            hasReasoning: true,
            badge: id.includes('3.8') ? 'SOTA Flash' : undefined,
          });
        });
      }

      // 2. Fetch real NVIDIA NIM models from server route
      const nKey = (settings?.customApiKey || localStorage.getItem('kizuna_custom_api_key') || '').trim();
      const nBase = (settings?.customBaseUrl || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');

      if (nKey) {
        try {
          const nRes = await fetch('/api/nvidia/models', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${nKey}`,
            },
            body: JSON.stringify({ apiKey: nKey, baseUrl: nBase, silent: true }),
          });
          if (nRes.ok) {
            const nData = await nRes.json();
            const rawNvModels = Array.isArray(nData.data) ? nData.data : [];
            rawNvModels.forEach((m: any) => {
              const modelId = m.id || m.name || '';
              if (!modelId) return;

              // STRICT FILTER: Exclude embeddings, detectors, audio, rerankers, reward models, tts, robotics, etc.
              const isNonChat = /embed|embedding|rerank|detector|reward|moderation|guard|safety|stt|tts|whisper|audio|diffusion|flux|clip|computer-use|robotics|imagen|veo|aqa/i.test(modelId);
              if (isNonChat) return;

              const isVis = /vision|vl|-v-|-4v|fuyu|pixtral|llava|omni|step/i.test(modelId);
              const isCoT = /kimi|moonshot|reason|cot|thinking|step/i.test(modelId);
              list.push({
                id: modelId,
                name: modelId.split('/').pop()?.replace(/-/g, ' ') || modelId,
                provider: 'custom',
                description: `NVIDIA NIM: ${modelId.split('/')[0] || 'Inferencia'}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId.includes('step') ? 'StepFun 1M' : modelId.includes('kimi') ? 'Narrativa' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
              });
            });
          }
        } catch {
          // Graceful fallback
        }
      }

      // 3. Fetch real Alibaba Cloud MaaS models from server route
      const aKey = (settings?.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim();
      const aBase = (
        aKey && !aKey.startsWith('sk-ws-')
          ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
          : (settings?.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
      ).replace(/\/+$/, '');

      if (aKey) {
        try {
          const aRes = await fetch('/api/alibaba/models', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aKey}`,
            },
            body: JSON.stringify({ apiKey: aKey, baseUrl: aBase, silent: true }),
          });
          if (aRes.ok) {
            const aData = await aRes.json();
            const rawAliModels = Array.isArray(aData.data) ? aData.data : [];
            rawAliModels.forEach((m: any) => {
              const modelId = m.id || m.name || '';
              if (!modelId) return;
              const isNonChat = /embed|embedding|rerank|detector|reward|moderation|guard|safety|stt|tts|whisper|audio|diffusion|flux|clip|computer-use|robotics|imagen|veo|aqa/i.test(modelId);
              if (isNonChat) return;

              const isVis = /vision|vl|-v-|-4v|kimi|omni/i.test(modelId);
              const isCoT = /reason|cot|thinking|k3|deepseek|kimi|omni|3\.8/i.test(modelId);
              const displayName =
                modelId === 'kimi-k3'
                  ? 'Kimi K3 (1M Cuota Gratis)'
                  : modelId === 'kimi/kimi-k3'
                  ? 'Kimi K3 (Partner / Pago directo)'
                  : modelId.split('/').pop()?.replace(/-/g, ' ') || modelId;
              list.push({
                id: modelId,
                name: displayName,
                provider: 'alibaba',
                description:
                  modelId === 'kimi-k3'
                    ? 'Alibaba Singapur: 1M Tokens Gratis + Tope de Seguridad'
                    : modelId === 'kimi/kimi-k3'
                    ? 'Alibaba Partner Endpoint (0% cuota gratis, cobro por uso)'
                    : `Alibaba Cloud MaaS: ${modelId}`,
                isVision: isVis,
                hasReasoning: isCoT,
                badge: modelId === 'kimi-k3' ? 'K3 Gratis' : modelId.includes('omni') ? 'Omni 1M' : modelId.includes('3.8') ? 'Qwen 3.8' : modelId.includes('kimi') ? 'Partner' : isCoT ? 'CoT' : isVis ? 'Visión' : undefined,
              });
            });
          }
        } catch {
          // Graceful fallback
        }
      }

      // Add preset Alibaba core models supported in Singapore (ap-southeast-1)
      const alibabaPresets: LiveModelItem[] = [
        { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (1.6T MoE)', provider: 'alibaba', description: 'Alibaba Singapur: 1.6T MoE (49B activos) • $0.66/1M • Auditor & Diálogos con Subtexto', isVision: false, hasReasoning: true, badge: 'V4 Pro 0813' },
        { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', provider: 'alibaba', description: 'Alibaba Singapur: 552B MoE (~8B activos) • Multimodal • $0.15/1M • Co-agente Ágil', isVision: true, hasReasoning: true, badge: 'V4.1 Flash' },
        { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max 0902 (Último)', provider: 'alibaba', description: 'Alibaba Singapur: Flagship 0902 con Thinking CoT Profundo', isVision: false, hasReasoning: true, badge: '0902 SOTA' },
        { id: 'qwen3.8-2.4-a95b', name: 'Qwen 3.8 2.4-A95B (MoE)', provider: 'alibaba', description: 'Alibaba Singapur: Arquitectura MoE A95B Activos + Thinking CoT', isVision: false, hasReasoning: true, badge: 'A95B MoE' },
        { id: 'kimi-k3', name: 'Kimi K3 (1M Cuota Gratis)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Tokens Gratis + Tope de Seguridad Activo', isVision: true, hasReasoning: true, badge: 'K3 Gratis' },
        { id: 'qwen3.8-plus', name: 'Qwen 3.8 Plus (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Contexto Extendido para Manuscritos y Síntesis', isVision: true, hasReasoning: true, badge: '3.8 Plus' },
        { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Tokens + Ultra-rápido y económico', isVision: false, hasReasoning: true, badge: 'Flash 1M' },
        { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus (Balanceado)', provider: 'alibaba', description: 'Alibaba Singapur: Equilibrio óptimo para síntesis y estructura', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
        { id: 'qwen3.8-omni-flash', name: 'Qwen 3.8 Omni Flash (1M)', provider: 'alibaba', description: 'Alibaba Singapur: Multimodal Nativo + 1M Contexto (Ultra-Económico)', isVision: true, hasReasoning: true, badge: 'Omni 1M' },
        { id: 'qwen3.8-max', name: 'Qwen 3.8 Max (CoT)', provider: 'alibaba', description: 'Alibaba Singapur: SOTA con Thinking CoT', isVision: false, hasReasoning: true, badge: 'Max' },
        { id: 'deepseek-r1', name: 'DeepSeek R1 (CoT)', provider: 'alibaba', description: 'Alibaba Cloud MaaS: SOTA Razonamiento CoT', isVision: false, hasReasoning: true, badge: 'DeepSeek' },
        { id: 'deepseek-v3', name: 'DeepSeek V3', provider: 'alibaba', description: 'Alibaba Cloud MaaS: MoE 671B', isVision: false, hasReasoning: false, badge: 'V3' },
        { id: 'qwen-plus', name: 'Qwen Plus (1M)', provider: 'alibaba', description: 'Alibaba Singapur: 1M Contexto Balanceado', isVision: false, hasReasoning: false, badge: '1M' },
        { id: 'qwen-vl-max', name: 'Qwen VL Max', provider: 'alibaba', description: 'Alibaba Singapur: Visión Multimodal', isVision: true, hasReasoning: false, badge: 'Visión' },
      ];
      alibabaPresets.forEach((preset) => {
        if (!list.some((m) => m.id === preset.id)) {
          list.push(preset);
        }
      });

      if (isMounted) {
        if (list.length > 0) {
          const loraModelId = settings?.alibabaCustomLoraModel?.trim();
          const topPriority = [
            ...(loraModelId ? [loraModelId] : []),
            'deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'qwen3.8-max-0902', 'qwen3.8-2.4-a95b', 'kimi-k3', 'stepfun-ai/step-5-preview', 'qwen3.8-plus', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.8-omni-flash', 'gemini-3.8-flash', 'gemini-3.8-live', 'qwen3.8-max', 'qwen-plus', 'stepfun-ai/step-2-16k', 'moonshotai/kimi-k3', 'gemini-3.1-pro-preview'
          ];
          // Deduplicate list by provider and ID to avoid React key warnings
          const uniqueMap = new Map<string, LiveModelItem>();
          list.forEach((m) => {
            const key = `${m.provider}_${m.id}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, m);
            }
          });
          const uniqueList = Array.from(uniqueMap.values());

          uniqueList.sort((a, b) => {
            if (a.id === currentModel && b.id !== currentModel) return -1;
            if (b.id === currentModel && a.id !== currentModel) return 1;
            const prioA = topPriority.indexOf(a.id);
            const prioB = topPriority.indexOf(b.id);
            if (prioA !== -1 && prioB !== -1) return prioA - prioB;
            if (prioA !== -1) return -1;
            if (prioB !== -1) return 1;
            if (a.hasReasoning && !b.hasReasoning) return -1;
            if (!a.hasReasoning && b.hasReasoning) return 1;
            return a.name.localeCompare(b.name);
          });
          setModels(uniqueList);
        } else {
          // Standard defaults fallback if network is cold
          const defaultLora = settings?.alibabaCustomLoraModel?.trim()
            ? [{
                id: settings.alibabaCustomLoraModel.trim(),
                name: settings.alibabaCustomLoraName?.trim() || `${settings.alibabaCustomLoraModel.trim()} (Afinado de Autor)`,
                provider: 'alibaba' as const,
                description: 'Alibaba Cloud MaaS: Adaptador LoRA / SFT Personalizado',
                isVision: true,
                hasReasoning: true,
                badge: 'LoRA Autor'
              }]
            : [];
          setModels([
            ...defaultLora,
            { id: 'deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro 0813 (1.6T MoE)', provider: 'alibaba', description: 'Alibaba Singapur: 1.6T MoE (49B activos) • $0.66/1M • Auditor & Diálogos', isVision: false, hasReasoning: true, badge: 'V4 Pro 0813' },
            { id: 'deepseek-v4.1-flash-1017', name: 'DeepSeek V4.1 Flash (1017)', provider: 'alibaba', description: 'Alibaba Singapur: 552B MoE (~8B activos) • Multimodal • $0.15/1M', isVision: true, hasReasoning: true, badge: 'V4.1 Flash' },
            { id: 'qwen3.8-max-0902', name: 'Qwen 3.8 Max 0902 (Último)', provider: 'alibaba', description: 'Alibaba Singapur: Flagship 0902 con Thinking CoT', isVision: false, hasReasoning: true, badge: '0902 SOTA' },
            { id: 'qwen3.8-2.4-a95b', name: 'Qwen 3.8 2.4-A95B (MoE)', provider: 'alibaba', description: 'Alibaba Singapur: Arquitectura MoE A95B + Thinking CoT', isVision: false, hasReasoning: true, badge: 'A95B MoE' },
            { id: 'kimi-k3', name: 'Kimi K3 (1M Cuota Gratis)', provider: 'alibaba', description: 'Alibaba Singapur: Visión & CoT', isVision: true, hasReasoning: true, badge: 'K3 Gratis' },
            { id: 'qwen3.8-plus', name: 'Qwen 3.8 Plus (1M)', provider: 'alibaba', description: 'Alibaba Cloud MaaS: 1M Contexto & Visión', isVision: true, hasReasoning: true, badge: '3.8 Plus' },
            { id: 'qwen3.8-flash', name: 'Qwen 3.8 Flash', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Visión & CoT', isVision: true, hasReasoning: true, badge: 'Flash' },
            { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', provider: 'alibaba', description: 'Alibaba Cloud MaaS: Balanceado', isVision: true, hasReasoning: true, badge: '3.7 Plus' },
            { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Paid)', provider: 'gemini', description: 'Google AI Studio: SOTA Model (Paid Tier)', isVision: true, hasReasoning: true, badge: 'Argon 4' },
            { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', provider: 'gemini', description: 'Google Generative AI', isVision: true, hasReasoning: true, badge: 'Flash 3.8' },
            { id: 'gemini-3.8-live', name: 'Gemini 3.8 Live', provider: 'gemini', description: 'Google Generative AI (Llamada)', isVision: true, hasReasoning: true, badge: 'Live' },
            { id: 'stepfun-ai/step-5-preview', name: 'Step 5 Preview (StepFun 1M)', provider: 'custom', description: 'NVIDIA NIM: 1M Contexto Multimodal MoE', isVision: true, hasReasoning: true, badge: 'Step 5' },
            { id: 'stepfun-ai/step-2-16k', name: 'Step 2 16K (StepFun)', provider: 'custom', description: 'NVIDIA NIM: StepFun MoE', isVision: true, hasReasoning: true, badge: 'StepFun' },
            { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (Moonshot)', provider: 'custom', description: 'NVIDIA NIM: MoE CoT & Visión', isVision: true, hasReasoning: true, badge: 'Narrativa' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B (NVIDIA)', provider: 'custom', description: 'NVIDIA NIM: Ultra-rápido', isVision: false, hasReasoning: true, badge: 'NVIDIA' },
          ]);
        }
        setIsLoading(false);
      }
    };

    fetchAllModels();
    return () => { isMounted = false; };
  }, [settings?.customApiKey, settings?.customBaseUrl, settings?.alibabaApiKey, settings?.alibabaBaseUrl, settings?.alibabaCustomLoraModel, settings?.alibabaCustomLoraName, currentModel]);

  const filtered = models.filter((m) => {
    if (providerTab !== 'all' && m.provider !== providerTab) return false;
    if (onlyVision && !m.isVision) return false;
    if (onlyReasoning && !m.hasReasoning) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      {/* Full-screen backdrop to catch taps outside on mobile */}
      <div
        className="fixed inset-0 z-[115] bg-black/40 sm:bg-transparent"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.96 }}
        transition={{ duration: 0.12 }}
        className="fixed left-3 right-3 top-14 sm:fixed-none sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] max-w-[calc(100vw-24px)] max-h-[80vh] flex flex-col bg-white dark:bg-[#0e0e12] border border-zinc-200 dark:border-[#27272c] rounded-2xl shadow-2xl z-[120] text-zinc-900 dark:text-zinc-100 overflow-hidden"
      >
        {/* Header with Search and Counters */}
        <div className="p-3 border-b border-zinc-200 dark:border-[#1c1c24] space-y-2 bg-zinc-50 dark:bg-[#121216]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
              Modelos de tus APIs
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              {isLoading ? 'Sincronizando...' : `${filtered.length} disponibles`}
            </span>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelo real (ej. qwen, deepseek, kimi, flash)..."
            className="w-full bg-white dark:bg-[#09090c] border border-zinc-300 dark:border-[#27272e] rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-amber-400 font-sans"
            autoFocus={typeof window !== 'undefined' && window.innerWidth >= 640}
          />

          {/* Filter Pills with Safe Light/Dark Contrast */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center bg-zinc-200 dark:bg-zinc-800 p-0.5 rounded-lg text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setProviderTab('all')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'all'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('alibaba')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'alibaba'
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Alibaba
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('gemini')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'gemini'
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                Gemini
              </button>
              <button
                type="button"
                onClick={() => setProviderTab('custom')}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  providerTab === 'custom'
                    ? 'bg-white dark:bg-zinc-700 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                NVIDIA
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOnlyVision((v) => !v)}
              className={`px-2 py-1 rounded-lg text-[10px] font-sans flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyVision
                  ? 'bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/50 text-orange-800 dark:text-orange-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <VisionLensIcon size={11} className={onlyVision ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500'} />
              <span>Visión</span>
            </button>
            <button
              type="button"
              onClick={() => setOnlyReasoning((r) => !r)}
              className={`px-2 py-1 rounded-lg text-[10px] font-sans flex items-center gap-1 border transition-colors cursor-pointer ${
                onlyReasoning
                  ? 'bg-orange-100 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/50 text-orange-800 dark:text-orange-300 font-semibold'
                  : 'bg-zinc-100 dark:bg-transparent border-zinc-300 dark:border-[#27272e] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <NeuralCoreIcon size={11} className={onlyReasoning ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500'} />
              <span>CoT</span>
            </button>
          </div>
        </div>

        {/* Dynamic List */}
        <div className="p-1.5 overflow-y-auto max-h-72 space-y-1 smooth-scroll">
          {/* Smart Auto-Router Pinned Option (Gemini PC Style) */}
          <button
            type="button"
            onClick={() => {
              onToggleAutoRouting?.(!settings?.autoModelRouting);
            }}
            className={`w-full flex items-start justify-between p-2.5 mb-1.5 rounded-xl text-left transition-all cursor-pointer border ${
              settings?.autoModelRouting
                ? 'bg-amber-500/15 border-amber-500/50 text-zinc-900 dark:text-white shadow-sm'
                : 'bg-zinc-50 dark:bg-[#13131a] hover:bg-zinc-100 dark:hover:bg-[#181822] border-zinc-200 dark:border-[#252530] text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <div className="min-w-0 flex-1 pr-2">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-500 dark:text-amber-400 font-bold text-xs">✦</span>
                <span className="font-semibold text-xs text-zinc-900 dark:text-white">
                  Modo Automático (Smart Router)
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-semibold">
                  {settings?.autoModelRouting ? 'Activo' : 'Auto'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-sans mt-0.5 leading-snug">
                Detecta tu mensaje y alterna automáticamente entre <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 Max 0902</strong>, <strong className="text-zinc-700 dark:text-zinc-200">DeepSeek V4 Pro 0813</strong> (Auditoría/Diálogos), <strong className="text-zinc-700 dark:text-zinc-200">Kimi K3</strong>, <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 2.4-A95B</strong>, <strong className="text-zinc-700 dark:text-zinc-200">DeepSeek V4.1 Flash</strong> (Co-agente ágil), <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.8 Flash</strong> y <strong className="text-zinc-700 dark:text-zinc-200">Qwen 3.7 Plus</strong>.
              </div>
            </div>
            {settings?.autoModelRouting && <Check size={14} className="text-amber-500 shrink-0 mt-1" />}
          </button>

          {isLoading && filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono animate-pulse">
              Sincronizando modelos con tus claves...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400 font-mono">
              No se encontraron modelos
            </div>
          ) : (
            filtered.map((m) => {
              const isSelected = !settings?.autoModelRouting && currentProvider === m.provider && currentModel === m.id;
              return (
                <button
                  key={`${m.provider}_${m.id}`}
                  type="button"
                  onClick={() => {
                    onSelect(m.provider, m.id);
                  }}
                  className={`w-full flex items-start justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/10 border border-amber-500/40 text-zinc-900 dark:text-white'
                      : 'hover:bg-zinc-100 dark:hover:bg-[#16161c] text-zinc-700 dark:text-zinc-300 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-zinc-900 dark:text-white truncate">
                        {m.name}
                      </span>
                      {m.badge && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                          m.badge === 'LoRA Autor'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate" title={m.id}>
                      {m.id}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${m.provider === 'alibaba' ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-400' : m.provider === 'gemini' ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400' : 'bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400'}`}>
                        {m.provider === 'alibaba' ? 'Alibaba' : m.provider === 'gemini' ? 'Google' : 'NVIDIA'}
                      </span>
                      {m.isVision && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/30">
                          <VisionLensIcon size={9} className="text-amber-600 dark:text-amber-400" />
                          <span>Visión</span>
                        </span>
                      )}
                      {m.hasReasoning && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
                          <NeuralCoreIcon size={9} /> CoT
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check size={13} className="text-amber-500 shrink-0 mt-1" />}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </>
  );
};
