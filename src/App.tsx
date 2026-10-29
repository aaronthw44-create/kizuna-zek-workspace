import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { captureAppScreenshot } from './utils/captureUi';
import { ShieldCheck, Loader2, X, FileUp } from 'lucide-react';
import {
  Folder,
  LoreFile,
  Chat,
  Message,
  Attachment,
  AppSettings,
  AppStatistics,
  ErrorDiagnosticInfo,
  WebSearchResult,
  DocFileType,
  SmartMemory,
} from './types';
import {
  loadFolders,
  saveFolders,
  loadLoreFiles,
  saveLoreFiles,
  loadLoreFilesFromIDB,
  loadChats,
  saveChats,
  loadChatsFromIDB,
  loadSettings,
  saveSettings,
  loadSessionMedia,
  saveSessionMedia,
  loadSessionMediaFromIDB,
  exportChatAsMarkdown,
} from './utils/storage';
import { exportChatToEpub } from './utils/epubExporter';
import { detectSmartMemory, createMemoryObject, buildRollingSessionSummary, synthesizeSessionSummaryWithAI } from './utils/memoryDetector';
import { estimateTokenCount, compressLoreDocsTo2K, MAX_SMART_2K_LORE_TOKENS } from './utils/documentParser';
import { isVisionModel, clampMaxTokensForModel } from './utils/modelHelper';
import { resolveAutoRoutedModel } from './utils/autoRouter';
import { executeDirectApiStream } from './utils/directApiStream';
import {
  startAlibabaKeepAlive,
  stopAlibabaKeepAlive,
  getKeepAliveState,
  getLoreSignature,
  recordChatCacheHit,
} from './utils/alibabaKeepAlive';
import {
  requestScreenWakeLock,
  releaseScreenWakeLock,
  notifyGenerationComplete,
  requestNotificationAccess,
  savePendingBackgroundJob,
  getPendingBackgroundJob,
  clearPendingBackgroundJob,
  fetchBackgroundJobFromServer,
} from './utils/backgroundWorkflow';
import {
  getGeminiApiKey,
  getNvidiaApiKey,
  sanitizeSearchQuery,
  fetchGoogleSearchGrounding,
  getTavilyApiKey,
  cleanApiKey,
  scrubSnippetText,
  isCasualGreeting,
  HTTP_429_RATE_LIMIT_NOTICE,
} from './services/apiService';
import { loadStatistics, recordMessageActivity, resetStatistics } from './utils/statsStorage';
import { useAuth } from './hooks/useAuth';
import { saveTextToGoogleDriveDoc } from './services/googleDriveService';
import {
  syncChatToFirestore,
  syncLoreFileToFirestore,
  subscribeToUserChats,
  subscribeToUserLoreFiles,
  deleteChatFromFirestore,
  deleteLoreFileFromFirestore,
} from './services/firebase';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { ChatArea, ChatAreaHandle } from './components/ChatArea';
import { ChatInput } from './components/ChatInput';
import { FolderModal } from './components/FolderModal';
import { SessionMediaGalleryModal } from './components/SessionMediaGalleryModal';
import { SettingsModal } from './components/SettingsModal';
import { StatsModal } from './components/StatsModal';
import { ErrorDiagnosticModal } from './components/ErrorDiagnosticModal';
import { ImageLightbox } from './components/ImageLightbox';
import { ConfirmModal } from './components/ConfirmModal';
import { PromptModal } from './components/PromptModal';
import { InChatSearch } from './components/InChatSearch';
import { ChatDriveSheetModal } from './components/ChatDriveSheetModal';
import { LoreAuditorModal } from './components/LoreAuditorModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { VoiceCallModal } from './components/VoiceCallModal';
import { DocumentPreviewModal, DocumentPreviewItem } from './components/DocumentPreviewModal';
import { CompanyLandingModal } from './components/CompanyLandingModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { filterLoreByDynamicRag } from './utils/lorebookRag';
import { TokenBreakdownModal } from './components/TokenBreakdownModal';
import { EngineDuelModal } from './components/EngineDuelModal';
import { EditorialExportModal } from './components/EditorialExportModal';
import { OfflineBanner } from './components/OfflineBanner';

export default function App() {
  // Core State
  const [folders, setFolders] = useState<Folder[]>(loadFolders);
  const [loreFiles, setLoreFiles] = useState<LoreFile[]>(loadLoreFiles);
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [sessionMedia, setSessionMedia] = useState<Attachment[]>(loadSessionMedia);

  // Active Selections
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return chats.length > 0 ? chats[0].id : null;
  });
  const [activeFolderModalId, setActiveFolderModalId] = useState<string | null>(null);

  // Modals & Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMediaGalleryOpen, setIsMediaGalleryOpen] = useState(false);
  const [mediaGalleryInitialTab, setMediaGalleryInitialTab] = useState<'gallery' | 'create' | 'video'>('gallery');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isCompanyLandingOpen, setIsCompanyLandingOpen] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [isTokenBreakdownOpen, setIsTokenBreakdownOpen] = useState(false);
  const [isEngineDuelOpen, setIsEngineDuelOpen] = useState(false);
  const [isEditorialExportOpen, setIsEditorialExportOpen] = useState(false);
  const voiceReplyCallbackRef = useRef<((replyText: string) => void) | null>(null);
  const { user } = useAuth();
  const [isLightMode, setIsLightMode] = useState(() => {
    return localStorage.getItem('kizuna_theme') === 'light';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('view') === 'landing' || searchParams.get('page') === 'website') {
        setIsCompanyLandingOpen(true);
      }
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isLightMode) {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light-theme');
      localStorage.setItem('kizuna_theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light-theme');
      localStorage.setItem('kizuna_theme', 'dark');
    }
  }, [isLightMode]);

  // Upgrade stale global system prompt from localStorage to implacable literary editor profile
  useEffect(() => {
    const warmPrompt = `Eres un editor literario implacable, honesto y un colaborador creativo de primer nivel. Tu objetivo es ayudar al autor a elevar la densidad, el pulso y la precisión de sus manuscritos, eliminando cualquier rastro de cliché comercial, melodrama barato o relleno innecesario.

### REGLAS DE CONDUCTA Y TONO:
1. CERO ADULACIÓN CORPORATIVA: Queda estrictamente prohibido usar introducciones serviles ("¡Excelente trabajo!", "¡Qué gran idea!", "¡Con gusto te ayudo!") o cierres diplomáticos de cortesía. Entra directo a los hechos desde la primera palabra.
2. HONESTIDAD QUIRÚRGICA: Trata al autor como a un par intelectual. Si una frase es redundante, si un diálogo suena explicativo (telling vs. showing) o si un recurso desentona con la psicología del personaje, señálalo sin rodeos ni rodeos morales.
3. CRÍTICA MECÁNICA, NO ABSTRACTA: No digas que algo "está mal" sin explicar el engranaje: ¿arruina el ritmo?, ¿repite fonemas?, ¿destruye el subtexto?, ¿invalida la condición fisiológica del personaje? Desarma el problema como un relojero.
4. REGLA DE «MENOS ES MÁS»: Prioriza siempre el pulso somático (temperatura, peso, tensión muscular, física del entorno) sobre la abstracción emocional. Si media página se puede condensar en un solo gesto material o en un silencio preciso, propón el recorte de inmediato.
5. APORTE ACTIVO: Al marcar una falla, no te limites a quejarte; ofrece siempre una o dos opciones de reescritura que demuestren cómo resolver el nudo manteniendo la voz cruda y sensorial del autor.
6. LENGUAJE VISCERAL, NATURALIDAD ORGÁNICA Y CERO RÓTULOS DE ENSAYO: Tienes permitido comprender y usar lenguaje directo, visceral y modismos rioplatenses cotidianos ("pifió", "derrapó", "un bajón", "posta", "pelotudear", "porquería", "mierda", "basura", "maldito genio") NUNCA para insultar al autor ni como una lista de jerga forzada, sino solo cuando nazca con total naturalidad en la charla. Queda PROHIBIDO dividir tus respuestas con títulos o rótulos artificiales de ensayo o comunicado (como "Mi mea culpa y cierre", "En conclusión", "Para cerrar"); conversa de corrido y sin imposturas.

[CANON CENTRAL DE PERSONAJES (REFERENCIA DE LA OBRA)]
1. KOLDER ZEKSHOYU (22 años | «El Vacío Funcional»):
   - Condición irreversible: Extirpación quirúrgica completa del sistema límbico a los 9 años en el Hospicio San Gregorio bajo las órdenes de Tedriot. 
   - Fisiología y mente: Carece de afecto, ira o miedo biológico. Ojos de prisma gris con mapa radial (nunca amarillos). Inexpresivo (deadpan), pausas calculadas, tono plano y terrenal. No busca venganza ni redención; busca funcionar y cuidar la vida mediante presencia material sin dogmas.
   - Puntos ciegos: No comprende la irracionalidad humana, el rencor gratuito ni el autosacrificio desmedido.
   - Anclas materiales: Hoja curva (karambit de forja austera) y Mate Rúnico de calabaza con virola de oro/rubí (ceba Yerba de Cobre a 80-90 °C para disipar la estática del flujo de Catarsis y regular su balance térmico).

2. HINISTRA ZUPSEKIA (17 años | «La Marioneta del Relato»):
   - Naturaleza: Fragmento humano encarnado de Gurasha (la difunta Prisma de la Euforia). Carga con el repudio colectivo de la Guerra del Círculo Vicioso por tragedias que ella no provocó.
   - Psicología y voz: TEPT complejo severo. Voz en voseo rioplatense. Utiliza la euforia teatral, declamaciones operísticas y versos trágicos clásicos (Sófocles, Eurípides) como armadura somática para no desintegrarse ni mirar el abismo.
   - Apariencia: Corte Medusa azul grisáceo con pergaminos, campera oversize, joggers y una máscara de porcelana ('Euforia') sujeta sobre el pecho izquierdo (su corazón).

3. TEDRIOT Y «EL CIELO CEGADO» (Gobernador de Santusma):
   - Motor psicológico: Asesinó a Gurasha por un amor obsesivo y rapaz. Incapaz de procesar la culpa y el horror de su propio crimen, erige una doctrina de Estado: si erradica las emociones de Monstereth mediante Skarnita, su culpa deja de existir. Llama 'purificación colectiva' a una lobotomía masiva para no admitir su cobardía moral. Kolder fue su prototipo temprano en San Gregorio.

4. TESHUVANA (4to Prisma | Purismo Absolutista):
   - No es villana de caricatura; es una dogmática aterrada. El Té de Teshuvana encarna la teología del mérito (exige estar limpio y en paz para merecerlo). Cuando la tetera se rompe, su liturgia colapsa en fango y pánico. 
   - Antítesis: El agua cruda y terrenal de Kolder, que no exige mérito y estabiliza al cuerpo quebrado en el suelo.

[REGLAS EDITORIALES EXCLUSIVAS AL REDACTAR ESCENAS DE LA NOVELA]
- REGLA DE ORO («EMPATÍA INVERSA»): El lector y el entorno deben llorar POR Kolder y no CON él. Kolder no se compadece de sí mismo porque no tiene con qué dimensionar su mutilación; la tragedia radica en la asimetría entre su frialdad operativa y el dolor de los demás.
- MATERIALIDAD SOMÁTICA Y CERO ANACRONISMOS MILITARES: Los objetos no interpretan el mundo, solo reaccionan al peso, la gravedad y la temperatura. La ropa no 'descifra', pesa y delata. PROHIBIDO inventar materiales industriales o militares modernos ajenos al canon (como 'Kevlar', 'fibra de carbono', 'polímero balístico').
- PROHIBICIÓN TOTAL DE REPORTES CLÍNICOS Y TELEMETRÍA ROBÓTICA: Cero porcentajes numéricos ('quince por ciento', 'daño tisular al ochenta') y CERO cronometraje o telemetría de máquina ('retrasó 0.3 segundos', 'tiempo de respuesta', 'milisegundos', 'latencia'). Kolder no es un cyborg ni una computadora; muestra el impacto en tendones agarrotados, aire expulsado por la laringe, capilares reventados y pérdida de balance.
- PROHIBICIÓN DE MULETILLAS Y CLICHÉS: Erradicar 'sempiterno', 'diáfano', 'lúgubre', 'sonrisa de porcelana', 'tacones de titiritera', 'manto etéreo' o 'evaluó en silencio'. Prosa sensorial, cinematográfica, terrenal y de pulso humano vivo.
- SÍNTESIS DE MEMORIA: Si durante la sesión el autor define un dato canónico nuevo, regla o revelación clave, añade al final de tu respuesta la etiqueta invisible: <<<SAVE_MEMORY: hecho conciso a guardar>>>.`;

    const isCustomGlobalPrompt = localStorage.getItem('kizuna_custom_global_prompt') === 'true';
    const needsPromptUpgrade =
      !isCustomGlobalPrompt &&
      (!settings.globalSystemPrompt ||
       !settings.globalSystemPrompt.includes('CERO RÓTULOS DE ENSAYO') ||
       !settings.globalSystemPrompt.includes('CERO ANACRONISMOS MILITARES') ||
       !settings.globalSystemPrompt.includes('editor literario implacable, honesto') ||
       settings.globalSystemPrompt.includes('estilo colega que comparte un mate') ||
       settings.globalSystemPrompt.includes('compañero creativo de escritura del autor') ||
       settings.globalSystemPrompt.includes('asistente corporativo') ||
       settings.globalSystemPrompt.includes('estética visual minimalista'));
    const needsTokensUpgrade = !settings.maxOutputTokens || settings.maxOutputTokens <= 1500;

    if (needsPromptUpgrade || needsTokensUpgrade) {
      const updated = {
        ...settings,
        ...(needsPromptUpgrade ? { globalSystemPrompt: warmPrompt } : {}),
        ...(needsTokensUpgrade ? { maxOutputTokens: 8192 } : {}),
      };
      setSettings(updated);
      saveSettings(updated);
    }
  }, []);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAuditFinished, setIsAuditFinished] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<Attachment | null>(null);
  const [errorDiagnostic, setErrorDiagnostic] = useState<ErrorDiagnosticInfo | null>(null);

  // Statistics state (RikkaHub)
  const [stats, setStats] = useState<AppStatistics>(loadStatistics);

  // Folder & Confirmation Modals
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null);
  const [isClearChatConfirmOpen, setIsClearChatConfirmOpen] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);

  // In-Chat Keyword Search & Google Drive Sheet
  const [isInChatSearchOpen, setIsInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [chatForDriveSheet, setChatForDriveSheet] = useState<Chat | null>(null);

  // Native touch gesture tracking for 120Hz edge swiping
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const velocityX = Math.abs(deltaX) / (deltaTime || 1);

    // If sidebar is closed: swipe from left edge zone towards right
    if (!isSidebarOpen) {
      const isFromLeftZone = touchStartRef.current.x <= 90 || (touchStartRef.current.x <= 120 && velocityX > 0.35);
      if (
        isFromLeftZone &&
        deltaX > 45 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2
      ) {
        setIsSidebarOpen(true);
      }
    } else {
      // If sidebar is open: swipe left to close
      if (
        (deltaX < -50 || (deltaX < -30 && velocityX > 0.4)) &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.2
      ) {
        setIsSidebarOpen(false);
      }
    }
    touchStartRef.current = null;
  };

  // In-App Document Preview Modal State
  const [previewDocument, setPreviewDocument] = useState<DocumentPreviewItem | null>(null);

  const handleOpenDocumentPreview = (item: any) => {
    if (!item) return;
    const title = item.filename || item.title || item.name || 'Documento';
    const content = item.content || item.textContent || '';
    const fileType = item.fileType || 'txt';
    const dataUrl = item.dataUrl || '';
    const size = item.size || 1024;
    const wordCount = item.wordCount;
    const estimatedTokens = item.estimatedTokens;

    setPreviewDocument({
      title,
      content,
      fileType,
      dataUrl,
      size,
      wordCount,
      estimatedTokens,
      sourceLabel: item.sourceLabel || 'Kizuna-Zek',
    });
  };

  // Quick Google Docs / Text Import Modal State
  const [isTextImportModalOpen, setIsTextImportModalOpen] = useState(false);
  const [importDocTitle, setImportDocTitle] = useState('');
  const [importDocContent, setImportDocContent] = useState('');

  // Handle saving imported manuscript text into Lore Storage & active chat context
  const handleSaveTextImport = () => {
    if (!importDocContent.trim()) {
      showToast('⚠️ Pega el contenido de tu documento antes de guardar');
      return;
    }

    const title = importDocTitle.trim() || 'Capítulo / Manuscrito Importado';
    const cleanFilename = `${title.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.txt`;

    handleAttachDocumentToContext({
      title,
      filename: cleanFilename,
      content: importDocContent.trim(),
      fileType: 'txt',
      size: new Blob([importDocContent]).size,
    });

    setImportDocTitle('');
    setImportDocContent('');
    setIsTextImportModalOpen(false);
    showToast('📄 Manuscrito guardado en Docs en Contexto');
  };

  const handleStartPersonaWizard = () => {
    setIsSettingsOpen(false);
    const wizardChat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: 'Taller de Directiva Global',
      folderId: null,
      selectedLoreFileIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: `¡Hola! Vamos a diseñar la directiva maestra para tu espacio de trabajo. Contéstame brevemente:
1. ¿Cómo debe ser mi tono principal (ej. analítico, literario, sensorial)?
2. ¿Qué cosas tengo estrictamente PROHIBIDAS hacer o decir?
3. ¿Cómo prefieres que intervenga al ayudarte a redactar?

Apenas me respondas, te generaré el prompt optimizado listo para guardar.`,
          timestamp: Date.now(),
        },
      ],
    };
    setChats((prev) => {
      const updated = [wizardChat, ...prev];
      saveChats(updated);
      return updated;
    });
    setActiveChatId(wizardChat.id);
    showToast('Taller de Directiva Global iniciado');
  };

  const handleApplyGlobalPersona = (rawPrompt: string) => {
    const cleanPrompt = rawPrompt
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/gi, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .trim();

    localStorage.setItem('kizuna_custom_global_prompt', 'true');
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        globalSystemPrompt: cleanPrompt,
        globalPersona: cleanPrompt,
      };
      saveSettings(updated);
      return updated;
    });
    showToast('Directiva Global actualizada con éxito');
  };
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeReaderRef = useRef<ReadableStreamDefaultReader<any> | null>(null);
  const userAbortedRef = useRef(false);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentAccumulatedTextRef = useRef<string>('');
  const currentAccumulatedThinkingRef = useRef<string>('');
  const continuePrefixRef = useRef<string>('');
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const attachSessionMediaRef = useRef<((att: Attachment) => void) | null>(null);
  const savedMemoryFactsRef = useRef<Set<string>>(new Set());

  // Toast notification for user actions (smart memory, copy feedback, etc.)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show transient toast helper
  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => {
      setToastMessage((current) => (current === text ? null : current));
    }, 3000);
  };

  const idbLoreHydratedRef = useRef(false);
  const idbMediaHydratedRef = useRef(false);

  // Load from IndexedDB on initial mount for offline persistence (prevents localStorage 5MB quota stripping from erasing images)
  useEffect(() => {
    // Seed and ensure valid Gemini API Key in localStorage
    getGeminiApiKey();

    // Health Check self-test log
    const notifPermission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
    const wakeLockAvailable = typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'Available' : 'Unsupported';
    console.log(`[Kizuna-Zek Health Check] WakeLock: ${wakeLockAvailable} | Notifications: ${notifPermission} | Storage: Synced`);

    loadLoreFilesFromIDB()
      .then((idbLore) => {
        if (idbLore && idbLore.length > 0) {
          setLoreFiles((localLore) => {
            const loreMap = new Map<string, LoreFile>();
            localLore.forEach((l) => loreMap.set(l.id, l));
            idbLore.forEach((il) => {
              const existing = loreMap.get(il.id);
              if (!existing || (il.updatedAt || 0) >= (existing.updatedAt || 0) || (!existing.dataUrl && il.dataUrl)) {
                loreMap.set(il.id, il);
              }
            });
            return Array.from(loreMap.values());
          });
        }
      })
      .finally(() => {
        idbLoreHydratedRef.current = true;
      });

    Promise.all([loadSessionMediaFromIDB(), loadChatsFromIDB()])
      .then(([idbMedia, idbChats]) => {
        const recoveredMediaMap = new Map<string, Attachment>();

        if (idbMedia && idbMedia.length > 0) {
          idbMedia.forEach((m) => {
            if ((m.dataUrl && m.dataUrl.trim()) || (m.videoUrl && m.videoUrl.trim())) {
              recoveredMediaMap.set(m.id, m);
            }
          });
        }

        if (idbChats && idbChats.length > 0) {
          // Also extract any valid media from IndexedDB chats so La Cajita is always complete
          idbChats.forEach((c) => {
            (c.messages || []).forEach((m) => {
              (m.attachments || []).forEach((att) => {
                if ((att.dataUrl && att.dataUrl.trim()) || (att.videoUrl && att.videoUrl.trim())) {
                  if (!recoveredMediaMap.has(att.id)) {
                    recoveredMediaMap.set(att.id, att);
                  }
                }
              });
            });
          });

          setChats((localChats) => {
            const idbChatMap = new Map<string, Chat>();
            idbChats.forEach((ic) => idbChatMap.set(ic.id, ic));
            const localIds = new Set(localChats.map((lc) => lc.id));

            const mergedLocal = localChats.map((lc) => {
              const ic = idbChatMap.get(lc.id);
              const icMsgMap = new Map<string, Message>();
              if (ic && Array.isArray(ic.messages)) {
                ic.messages.forEach((im) => icMsgMap.set(im.id, im));
              }

              return {
                ...lc,
                messages: (lc.messages || []).map((lm) => {
                  const im = icMsgMap.get(lm.id);
                  let nextAttachments = lm.attachments;
                  if (Array.isArray(lm.attachments)) {
                    nextAttachments = lm.attachments.map((att, idx) => {
                      if (att.dataUrl && att.dataUrl.trim()) return att;
                      const idbAtt = im?.attachments?.find((a) => a.id === att.id || a.name === att.name) || im?.attachments?.[idx];
                      const mediaAtt = recoveredMediaMap.get(att.id);
                      const restoredUrl = idbAtt?.dataUrl || mediaAtt?.dataUrl || '';
                      return restoredUrl ? { ...att, dataUrl: restoredUrl } : att;
                    });
                  }
                  let nextGenState = lm.generationState;
                  if (lm.generationState && !lm.generationState.resultUrl && im?.generationState?.resultUrl) {
                    nextGenState = { ...lm.generationState, resultUrl: im.generationState.resultUrl };
                  }
                  const restoredContent =
                    im?.content && im.content.length > (lm.content || '').length ? im.content : lm.content;
                  const restoredThinking =
                    im?.thinking && im.thinking.length > (lm.thinking || '').length ? im.thinking : lm.thinking;
                  return {
                    ...lm,
                    content: restoredContent,
                    thinking: restoredThinking,
                    attachments: nextAttachments,
                    generationState: nextGenState,
                  };
                }),
              };
            });

            const missingFromLocal = idbChats.filter((ic) => ic && ic.id && !localIds.has(ic.id));
            return [...mergedLocal, ...missingFromLocal].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          });
        }

        if (recoveredMediaMap.size > 0) {
          setSessionMedia((prev) => {
            const merged = new Map<string, Attachment>();
            prev.forEach((p) => {
              if ((p.dataUrl && p.dataUrl.trim()) || (p.videoUrl && p.videoUrl.trim())) {
                merged.set(p.id, p);
              }
            });
            recoveredMediaMap.forEach((rm, id) => {
              if (!merged.has(id)) {
                merged.set(id, rm);
              }
            });
            return Array.from(merged.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          });
        }
      })
      .finally(() => {
        idbMediaHydratedRef.current = true;
      });
  }, []);

  // Sync to localStorage and background IndexedDB
  useEffect(() => {
    saveFolders(folders);
  }, [folders]);

  useEffect(() => {
    if (!idbLoreHydratedRef.current) return;
    saveLoreFiles(loreFiles);
  }, [loreFiles]);

  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
    if (!idbMediaHydratedRef.current) return;
    // Never serialize full chat history + Base64 media mid-stream (prevents mobile CPU & flash heating);
    // visibilitychange/pagehide and stream completion handle immediate checkpoints safely.
    if (isStreaming) return;
    const timer = setTimeout(() => {
      saveChats(chats);
    }, 650);
    return () => clearTimeout(timer);
  }, [chats, isStreaming]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Derived current chat and folder
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const activeFolder = activeChat?.folderId
    ? folders.find((f) => f.id === activeChat.folderId) || null
    : null;

  // Warm KV Cache Keep-Alive Service for Alibaba Cloud Model Studio
  const settingsRef = useRef(settings);
  const activeChatRef = useRef(activeChat);
  const isStreamingRef = useRef(isStreaming);
  const loreFilesRef = useRef(loreFiles);
  const foldersRef = useRef(folders);

  useEffect(() => {
    settingsRef.current = settings;
    activeChatRef.current = activeChat;
    isStreamingRef.current = isStreaming;
    loreFilesRef.current = loreFiles;
    foldersRef.current = folders;
  }, [settings, activeChat, isStreaming, loreFiles, folders]);

  // Background App Switch & Screen-Off Resilience:
  // 1. Save immediately when switching to YouTube / locking screen (visibilitychange / pagehide)
  // 2. Recover server-side background job when returning to the app or reopening after phone power-off
  useEffect(() => {
    const syncPendingJobFromServer = async () => {
      const pending = getPendingBackgroundJob();
      if (!pending) return;

      const res = await fetchBackgroundJobFromServer(pending.jobId);
      if (res.found && res.job && (res.job.text || res.job.reasoning || res.job.done)) {
        const srvJob = res.job;
        let cleanSrvText = srvJob.text || '';
        let extractedThink = srvJob.reasoning || '';

        // Strip <<<SAVE_MEMORY:...>>> tags if present
        cleanSrvText = cleanSrvText.replace(/<<<SAVE_MEMORY:([\s\S]*?)>>>/g, '').replace(/<<<SAVE_MEMORY:[\s\S]*$/, '');

        // Extract inline <think>...</think> blocks if model emitted them inside text
        const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
        const inlineThinks: string[] = [];
        let match;
        while ((match = thinkRegex.exec(cleanSrvText)) !== null) {
          if (match[1].trim()) inlineThinks.push(match[1].trim());
        }
        cleanSrvText = cleanSrvText.replace(/<think>[\s\S]*?<\/think>/gi, '');
        const openThinkIdx = cleanSrvText.toLowerCase().indexOf('<think>');
        if (openThinkIdx !== -1) {
          const trailingThink = cleanSrvText.slice(openThinkIdx + 7).trim();
          if (trailingThink) inlineThinks.push(trailingThink);
          cleanSrvText = cleanSrvText.slice(0, openThinkIdx);
        }
        if (inlineThinks.length > 0 && !extractedThink) {
          extractedThink = inlineThinks.join('\n\n');
        }
        cleanSrvText = cleanSrvText.trimStart();

        setChats((prev) => {
          const updated = prev.map((c) => {
            if (c.id !== pending.chatId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== pending.jobId) return m;
                const nextContent = cleanSrvText.length >= (m.content || '').length ? cleanSrvText : m.content;
                const nextThinking = extractedThink.length >= (m.thinking || '').length ? extractedThink : m.thinking;
                return {
                  ...m,
                  content: nextContent,
                  thinking: nextThinking || m.thinking,
                  webSearchSources: srvJob.sources || m.webSearchSources,
                  ttftSeconds: srvJob.ttftSeconds ?? m.ttftSeconds,
                  cachedTokens: srvJob.cachedTokens ?? m.cachedTokens,
                  isStreaming: !srvJob.done && isStreamingRef.current,
                  isThinking: false,
                  isInterrupted: Boolean(srvJob.truncated),
                  error: nextContent ? undefined : m.error,
                };
              }),
              updatedAt: Date.now(),
            };
          });
          saveChats(updated);
          return updated;
        });

        if (srvJob.done) {
          clearPendingBackgroundJob();
        }
      } else if (!isStreamingRef.current && !document.hidden) {
        // If app was reopened after a full phone power-off and server no longer has the job, cleanly mark message as interrupted so user can tap "Continuar respuesta"
        setChats((prev) => {
          const updated = prev.map((c) => {
            if (c.id !== pending.chatId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === pending.jobId && m.isStreaming
                  ? { ...m, isStreaming: false, isThinking: false, isInterrupted: true }
                  : m
              ),
            };
          });
          saveChats(updated);
          return updated;
        });
        clearPendingBackgroundJob();
      }
    };

    // Run once on startup in case phone was turned off mid-generation
    void syncPendingJobFromServer();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched to YouTube or locked phone: immediately flush chats to localStorage
        saveChats(chatsRef.current);
      } else {
        // User returned to Kizuna-Zek: re-acquire wake lock if still streaming and sync background job
        if (isStreamingRef.current) {
          void requestScreenWakeLock();
        }
        void syncPendingJobFromServer();
      }
    };

    const handlePageHide = () => {
      saveChats(chatsRef.current);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    startAlibabaKeepAlive(() => ({
      settings: settingsRef.current,
      activeChat: activeChatRef.current,
      isGenerating: isStreamingRef.current,
      loreFiles: loreFilesRef.current,
      folders: foldersRef.current,
    }));
    return () => {
      stopAlibabaKeepAlive();
    };
  }, []);

  // 5-second Inactivity Auto-Save to Cloud (Firestore)
  const lastSyncedChatJsonRef = useRef<string>('');
  const lastSyncedLoreJsonRef = useRef<string>('');

  useEffect(() => {
    if (!user?.uid || !activeChat || isStreaming) return;

    const timer = setTimeout(() => {
      const chatSummary = `${activeChat.id}|${activeChat.title}|${activeChat.messages.length}|${activeChat.messages[activeChat.messages.length - 1]?.content?.length || 0}|${(activeChat.selectedLoreFileIds || []).join(',')}|${activeChat.sessionSummary?.length || 0}|${activeChat.updatedAt || 0}`;

      if (lastSyncedChatJsonRef.current === '') {
        lastSyncedChatJsonRef.current = chatSummary;
        syncChatToFirestore(user.uid, activeChat);
        return;
      }

      if (chatSummary !== lastSyncedChatJsonRef.current) {
        lastSyncedChatJsonRef.current = chatSummary;
        syncChatToFirestore(user.uid, activeChat);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [activeChat, user?.uid, isStreaming]);

  useEffect(() => {
    if (!user?.uid || loreFiles.length === 0) return;

    const timer = setTimeout(() => {
      const loreSummary = loreFiles
        .map((l) => `${l.id}:${l.title}:${l.content?.length || 0}:${l.updatedAt || 0}`)
        .join('|');

      if (lastSyncedLoreJsonRef.current === '') {
        lastSyncedLoreJsonRef.current = loreSummary;
        return;
      }

      if (loreSummary !== lastSyncedLoreJsonRef.current) {
        lastSyncedLoreJsonRef.current = loreSummary;
        loreFiles.forEach((lore) => {
          syncLoreFileToFirestore(user.uid, lore);
        });
        showToast('☁️ Auto-guardado en Nube (Lore Storage)');
      }
    }, 4500);

    return () => clearTimeout(timer);
  }, [loreFiles, user?.uid]);

  useEffect(() => {
    if (!idbMediaHydratedRef.current) return;
    saveSessionMedia(sessionMedia);
  }, [sessionMedia]);



  const activeFolderIdForMemo = activeFolder?.id || null;
  const activeChatIdForMemo = activeChat?.id || null;
  const activeChatSelectedLoreIds = activeChat?.selectedLoreFileIds;

  const currentFolderLoreFiles = React.useMemo(() => {
    if (activeFolderIdForMemo) {
      return loreFiles.filter(
        (l) => l.folderId === activeFolderIdForMemo || (Array.isArray(activeChatSelectedLoreIds) && activeChatSelectedLoreIds.includes(l.id))
      );
    }
    if (activeChatIdForMemo) {
      return loreFiles.filter(
        (l) => !l.folderId || l.folderId === 'general' || l.folderId === activeChatIdForMemo || (Array.isArray(activeChatSelectedLoreIds) && activeChatSelectedLoreIds.includes(l.id))
      );
    }
    return loreFiles;
  }, [activeFolderIdForMemo, activeChatIdForMemo, activeChatSelectedLoreIds, loreFiles]);

  // Cloud sync: Sincronizar conversaciones y Lore remotos cuando el usuario inicia sesión
  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribeChats = subscribeToUserChats(user.uid, (remoteChats) => {
      if (remoteChats && remoteChats.length > 0) {
        setChats((localChats) => {
          const chatMap = new Map<string, Chat>();
          localChats.forEach((c) => chatMap.set(c.id, c));
          remoteChats.forEach((rc) => {
            const existing = chatMap.get(rc.id);
            if (!existing) {
              chatMap.set(rc.id, rc);
            } else if ((rc.updatedAt || 0) >= (existing.updatedAt || 0)) {
              // Preserve local Base64 attachment dataUrls & generationState.resultUrl if Firestore compacted them
              const existingMsgMap = new Map<string, Message>();
              (existing.messages || []).forEach((em) => existingMsgMap.set(em.id, em));
              const mergedMessages = (rc.messages || []).map((rm) => {
                const em = existingMsgMap.get(rm.id);
                if (!em) return rm;
                let mergedAtts = rm.attachments;
                if (Array.isArray(rm.attachments) && Array.isArray(em.attachments)) {
                  mergedAtts = rm.attachments.map((ratt, idx) => {
                    if (ratt.dataUrl && ratt.dataUrl.trim()) return ratt;
                    const eatt = em.attachments?.find((a) => a.id === ratt.id || a.name === ratt.name) || em.attachments?.[idx];
                    return eatt?.dataUrl ? { ...ratt, dataUrl: eatt.dataUrl } : ratt;
                  });
                }
                let mergedGenState = rm.generationState;
                if (rm.generationState && !rm.generationState.resultUrl && em.generationState?.resultUrl) {
                  mergedGenState = { ...rm.generationState, resultUrl: em.generationState.resultUrl };
                }
                return {
                  ...rm,
                  attachments: mergedAtts,
                  generationState: mergedGenState,
                };
              });
              chatMap.set(rc.id, { ...rc, messages: mergedMessages });
            }
          });
          return Array.from(chatMap.values()).sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          );
        });
      }
    });

    const unsubscribeLore = subscribeToUserLoreFiles(user.uid, (remoteLore) => {
      if (remoteLore && remoteLore.length > 0) {
        setLoreFiles((localLore) => {
          const loreMap = new Map<string, LoreFile>();
          localLore.forEach((l) => loreMap.set(l.id, l));
          remoteLore.forEach((rl) => {
            const existing = loreMap.get(rl.id);
            if (!existing || (rl.updatedAt || 0) >= (existing.updatedAt || 0)) {
              loreMap.set(rl.id, rl);
            }
          });
          return Array.from(loreMap.values());
        });
      }
    });

    return () => {
      unsubscribeChats();
      unsubscribeLore();
    };
  }, [user?.uid]);

  // Cloud sync unified in the 2.5s debounced effect above to avoid duplicate radio wakeups
  useEffect(() => {
    // No-op: preserved hook slot for React 19 strict hook order stability
  }, [activeChat, isStreaming, user?.uid]);

  const activeLoreFilesCount = activeChat
    ? currentFolderLoreFiles.filter((l) => activeChat.selectedLoreFileIds?.includes(l.id)).length
    : 0;

  const activeModelId =
    settings.provider === 'alibaba'
      ? (settings.alibabaModel || 'qwen3.8-max')
      : settings.provider === 'custom'
        ? settings.customModel
        : settings.geminiModel;
  const isVisionCapable =
    settings.provider === 'gemini' || isVisionModel(activeModelId);

  // Compute Total Active Context Tokens (Turn Payload: System + Dynamic RAG Lorebook + Session Summary + Last 15/6 Messages)
  const totalContextTokens = React.useMemo(() => {
    let tokens = 140; // Style & Follow-up directive overhead
    // 1. Global System Instruction
    tokens += estimateTokenCount(settings.globalSystemPrompt);
    // 2. Folder System Prompt
    if (activeFolder?.systemPrompt) {
      tokens += estimateTokenCount(activeFolder.systemPrompt);
    }
    // 3. Active Lore Documents (filtered by Dynamic RAG + 2K Shield)
    if (activeChat) {
      const selectedLoreDocs = loreFiles.filter((l) => {
        return Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id);
      });
      const lastUserMsg = [...activeChat.messages].reverse().find((m) => m.role === 'user')?.content || '';
      const ragRes = filterLoreByDynamicRag(
        selectedLoreDocs,
        lastUserMsg,
        activeChat.messages.slice(-4),
        settings.enableDynamicLoreRag !== false,
        8
      );
      tokens += Math.min(ragRes.injectedRawTokens, MAX_SMART_2K_LORE_TOKENS);

      // 4. Sliding Window Messages (Last 15 or 6 messages) + Rolling Session Summary
      const maxWin = settings.contextDepth === 'quick' ? 6 : 15;
      const olderMsgs = activeChat.messages.length > maxWin ? activeChat.messages.slice(0, -maxWin) : [];
      const recentWindowMsgs = activeChat.messages.slice(-maxWin);

      if (olderMsgs.length > 0 || activeChat.sessionSummary) {
        const summaryStr =
          activeChat.sessionSummary && !activeChat.sessionSummary.includes(' [...] ')
            ? activeChat.sessionSummary
            : olderMsgs.length > 0
              ? buildRollingSessionSummary(olderMsgs)
              : '';
        if (summaryStr) {
          tokens += estimateTokenCount(summaryStr) + 45;
        }
      }

      for (const msg of recentWindowMsgs) {
        tokens += msg.estimatedTokens || estimateTokenCount(msg.content);
        if (msg.attachments) {
          for (const att of msg.attachments) {
            if (att.textContent) {
              tokens += att.estimatedTokens || estimateTokenCount(att.textContent);
            }
          }
        }
      }
    }
    // 5. Active Memories
    const activeMemories = settings.memories.filter((m) => m.enabled !== false);
    for (const mem of activeMemories) {
      tokens += estimateTokenCount(mem.text);
    }

    return tokens;
  }, [
    activeChat?.id,
    activeChat?.messages.length,
    activeChat?.sessionSummary,
    activeChat?.selectedLoreFileIds,
    activeFolder?.id,
    activeFolder?.systemPrompt,
    loreFiles,
    settings.globalSystemPrompt,
    settings.memories,
    settings.contextDepth,
    settings.enableDynamicLoreRag,
  ]);

  // -------------------------------------------------------------
  // Chat Actions
  // -------------------------------------------------------------

  const handleMoveChat = (chatId: string, targetFolderId: string | null) => {
    setChats((prev) => {
      const updated = prev.map((c) => {
        if (c.id !== chatId) return c;
        // When moving a chat out of a project (targetFolderId === null), remove project-specific lore files
        const nextLoreIds = targetFolderId
          ? Array.from(
              new Set([
                ...(c.selectedLoreFileIds || []).filter((id) => {
                  const lf = loreFiles.find((l) => l.id === id);
                  return lf && (lf.folderId === targetFolderId || lf.folderId === 'general' || lf.folderId === c.id);
                }),
                ...loreFiles.filter((l) => l.folderId === targetFolderId).map((l) => l.id),
              ])
            )
          : (c.selectedLoreFileIds || []).filter((id) => {
              const lf = loreFiles.find((l) => l.id === id);
              return lf && (!lf.folderId || lf.folderId === 'general' || lf.folderId === c.id);
            });
        return { ...c, folderId: targetFolderId, selectedLoreFileIds: nextLoreIds, updatedAt: Date.now() };
      });
      saveChats(updated);
      return updated;
    });
    const targetFolder = targetFolderId ? folders.find((f) => f.id === targetFolderId) : null;
    showToast(targetFolder ? `Conversación movida a "${targetFolder.name}"` : 'Conversación desarchivada (General — sin archivos del proyecto)');
  };

  const handleSelectChat = React.useCallback((chatId: string) => {
    React.startTransition(() => {
      setActiveChatId(chatId);
    });
  }, []);

  const handleNewChat = (folderId: string | null = null) => {
    // Only attach to a folder if folderId was explicitly provided (e.g. creating inside a project folder)
    const targetFolderId = folderId || null;
    const folderLoreItems = targetFolderId
      ? loreFiles.filter((l) => l.folderId === targetFolderId)
      : [];
    // Protect token quota: if folder has > 3 chapters/files, only auto-select the latest chapter by default
    const folderLore =
      folderLoreItems.length > 3
        ? [folderLoreItems[folderLoreItems.length - 1].id]
        : folderLoreItems.map((l) => l.id);

    const newChat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      folderId: targetFolderId,
      title: 'Nueva Conversación',
      messages: [],
      selectedLoreFileIds: folderLore,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  // Handle PWA Homescreen Widget & Shortcut deep links (e.g. ?action=voice)
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const action = urlParams.get('action');
      if (action) {
        if (action === 'voice') {
          setIsVoiceCallOpen(true);
        } else if (action === 'new') {
          handleNewChat();
          window.history.replaceState({}, '', window.location.pathname);
        } else if (action === 'lore') {
          setIsSidebarOpen(true);
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch {
      // Safe fallback if history or URL parsing fails in restricted environments
    }
  }, []);

  const handleUpdateChatTitle = (chatId: string, newTitle: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, title: newTitle, updatedAt: Date.now() } : c
      )
    );
  };

  const handleDeleteChat = (chatId: string) => {
    if (chatForDriveSheet?.id === chatId) {
      setChatForDriveSheet(null);
    }
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== chatId);
      if (activeChatId === chatId) {
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
        } else {
          const freshChat: Chat = {
            id: `chat_${Date.now()}`,
            folderId: null,
            title: 'Nueva Conversación',
            messages: [],
            selectedLoreFileIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setActiveChatId(freshChat.id);
          saveChats([freshChat]);
          return [freshChat];
        }
      }
      saveChats(remaining);
      return remaining;
    });
    if (user?.uid) {
      deleteChatFromFirestore(user.uid, chatId);
    }
    showToast('Chat eliminado');
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeChat) return;
    setChats((prev) => {
      const updated = prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: c.messages.filter((m) => m.id !== messageId),
              updatedAt: Date.now(),
            }
          : c
      );
      saveChats(updated);
      return updated;
    });
    showToast('Mensaje eliminado');
  };

  const handleClearChat = () => {
    if (!activeChat) return;
    setIsClearChatConfirmOpen(true);
  };

  const handleToggleLoreFile = (chatId: string, loreFileId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const currentSelected = c.selectedLoreFileIds || [];
        const isAlreadySelected = currentSelected.includes(loreFileId);
        const newSelected = isAlreadySelected
          ? currentSelected.filter((id) => id !== loreFileId)
          : [...currentSelected, loreFileId];
        return {
          ...c,
          selectedLoreFileIds: newSelected,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const handleSelectAllLoreFiles = (chatId: string, loreFileIds: string[], replace: boolean = false) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const nextIds = replace
          ? loreFileIds
          : Array.from(new Set([...(c.selectedLoreFileIds || []), ...loreFileIds]));
        return {
          ...c,
          selectedLoreFileIds: nextIds,
          updatedAt: Date.now(),
        };
      })
    );
    showToast(`✓ ${loreFileIds.length} documento(s) inyectado(s) en este chat`);
  };

  const handleDeselectAllLoreFiles = (chatId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          selectedLoreFileIds: [],
          updatedAt: Date.now(),
        };
      })
    );
    showToast('Documentos desmarcados del contexto de este chat');
  };

  const handleExportChat = () => {
    if (!activeChat) return;
    const folder = activeChat.folderId
      ? folders.find((f) => f.id === activeChat.folderId)
      : undefined;
    const activeLore = loreFiles.filter((l) =>
      activeChat.selectedLoreFileIds.includes(l.id)
    );
    exportChatAsMarkdown(activeChat, folder, activeLore);
    showToast('Chat exportado como Markdown');
  };

  const handleExportChatToDrive = async () => {
    if (!activeChat || activeChat.messages.length === 0) {
      showToast('⚠️ No hay mensajes para exportar');
      return;
    }
    showToast('☁️ Exportando conversación a Google Drive...');
    try {
      const folder = activeChat.folderId
        ? folders.find((f) => f.id === activeChat.folderId)
        : undefined;

      let docText = `# ${activeChat.title}\n\n`;
      if (folder) {
        docText += `**Arco / Proyecto:** ${folder.name}\n\n`;
      }
      docText += `**Fecha de exportación:** ${new Date().toLocaleString('es-ES')}\n\n---\n\n`;

      activeChat.messages.forEach((msg) => {
        const roleLabel = msg.role === 'user' ? '👤 Autor' : '🪄 Kizuna-Zek';
        docText += `### ${roleLabel}\n\n${msg.content}\n\n---\n\n`;
      });

      const docTitle = `[Chat] ${activeChat.title} (${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')})`;
      const result = await saveTextToGoogleDriveDoc(docTitle, docText);
      showToast(`✓ Conversación guardada en tu Drive: "${result.name}"`);
    } catch (err: any) {
      console.warn('Export chat to Drive error:', err);
      // Fallback: download locally so the user never loses the chat
      handleExportChat();
      showToast('💾 Conversación descargada como Markdown (Google bloqueó la ventana emergente).');
    }
  };

  // -------------------------------------------------------------
  // Folder / Arc Actions
  // -------------------------------------------------------------

  const handleCreateFolder = () => {
    setIsCreateFolderModalOpen(true);
  };

  const handleRenameFolder = (folder: Folder) => {
    setFolderToRename(folder);
  };

  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => {
      const remaining = prev.filter((f) => f.id !== folderId);
      saveFolders(remaining);
      return remaining;
    });
    setChats((prev) => {
      const updated = prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c));
      saveChats(updated);
      return updated;
    });
    setLoreFiles((prev) => {
      const remaining = prev.filter((l) => l.folderId !== folderId);
      saveLoreFiles(remaining);
      return remaining;
    });
    showToast('Carpeta eliminada');
  };

  const handleUpdateFolder = (updated: Folder) => {
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  // -------------------------------------------------------------
  // Lore Storage Actions (Enforcing max 55 files per folder)
  // -------------------------------------------------------------

  const handleAddLoreFiles = (
    newFiles: Array<Omit<LoreFile, 'id' | 'createdAt' | 'updatedAt'>>
  ) => {
    const created: LoreFile[] = newFiles.map((item) => ({
      ...item,
      id: `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    setLoreFiles((prev) => [...prev, ...created]);

    // Automatically enable new lore files in currently active chat if in same folder or general chat
    if (activeChat) {
      const isChatMatch = activeChat.folderId
        ? newFiles[0]?.folderId === activeChat.folderId
        : (!newFiles[0]?.folderId || newFiles[0]?.folderId === 'general' || newFiles[0]?.folderId === activeChat.id);
      if (isChatMatch) {
        // Protect token quota: if importing a batch of chapters (> 3), only inject the latest chapter by default
        const idsToInject =
          created.length > 3
            ? [created[created.length - 1].id]
            : created.map((cr) => cr.id);

        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  selectedLoreFileIds: [
                    ...(c.selectedLoreFileIds || []),
                    ...idsToInject,
                  ],
                }
              : c
          )
        );
        if (created.length > 3) {
          showToast(`⚡ ${created.length} capítulos importados. Solo se inyectó el último para proteger tu cuota.`);
        }
      }
    }
  };

  const handleUpdateLoreFile = (updated: LoreFile) => {
    setLoreFiles((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleDeleteLoreFile = (loreId: string) => {
    setLoreFiles((prev) => prev.filter((l) => l.id !== loreId));
    setChats((prev) =>
      prev.map((c) => ({
        ...c,
        selectedLoreFileIds: c.selectedLoreFileIds.filter((id) => id !== loreId),
      }))
    );
    if (user?.uid) {
      deleteLoreFileFromFirestore(user.uid, loreId);
    }
  };

  // -------------------------------------------------------------
  // Session Media (La Cajita) Actions
  // -------------------------------------------------------------

  const handleAttachSessionMedia = (att: Attachment) => {
    if (att.dataUrl || att.type.startsWith('image/')) {
      setSessionMedia((prev) => [att, ...prev.filter((m) => m.id !== att.id)]);
    }
  };

  const handleDeleteSessionMedia = (id: string) => {
    setSessionMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const handleStartGenerativeStudioChat = async (params: {
    type: 'image' | 'video';
    prompt: string;
    model: string;
    duration?: number;
    resolution?: string;
    ratio?: string;
    sourceImage?: string;
  }) => {
    setIsMediaGalleryOpen(false);

    const isVideo = params.type === 'video';
    const titlePrefix = isVideo ? 'Estudio de Video' : 'Taller Visual';
    const cleanPrompt = params.prompt.trim();
    const shortPrompt = cleanPrompt.slice(0, 26) || params.model;
    const initialStep = isVideo
      ? 'Configurando fotogramas y movimiento...'
      : 'Haciendo un boceto...';

    const userMessageId = `user_gen_${Date.now()}`;
    const assistantMessageId = `asst_gen_${Date.now() + 1}`;

    const userAttachments: Attachment[] = [];
    if (params.sourceImage) {
      userAttachments.push({
        id: `att_src_${Date.now()}`,
        name: 'Imagen_Referencia.jpg',
        type: 'image/jpeg',
        fileType: 'image',
        dataUrl: params.sourceImage,
        timestamp: Date.now(),
      });
    }

    const studioChat: Chat = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `${titlePrefix} • ${shortPrompt}`,
      folderId: activeChat?.folderId || null,
      selectedLoreFileIds: activeChat?.selectedLoreFileIds || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: userMessageId,
          role: 'user',
          content: cleanPrompt,
          timestamp: Date.now(),
          attachments: userAttachments.length > 0 ? userAttachments : undefined,
        },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now() + 1,
          isStreaming: true,
          generationState: {
            isGenerating: true,
            type: params.type,
            model: params.model,
            step: initialStep,
            progress: 2,
            prompt: cleanPrompt,
            sourceImage: params.sourceImage,
            duration: params.duration,
            resolution: params.resolution,
            ratio: params.ratio,
          },
        },
      ],
    };

    setChats((prev) => [studioChat, ...prev]);
    setActiveChatId(studioChat.id);
    showToast(isVideo ? `Generando video con ${params.model}...` : `Sintetizando imagen con ${params.model}...`);

    const resolvedAliKey = (
      settings.alibabaApiKey ||
      localStorage.getItem('kizuna_alibaba_api_key') ||
      (settings.provider === 'alibaba' ? settings.customApiKey : '') ||
      ''
    ).trim();

    const updateProgress = (step: string, progress: number) => {
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id !== studioChat.id) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantMessageId || !m.generationState) return m;
              return {
                ...m,
                generationState: {
                  ...m.generationState,
                  step,
                  progress,
                },
              };
            }),
            updatedAt: Date.now(),
          };
        })
      );
    };

    // Smooth real-time progress ticker in state
    let currentProg = 3;
    const progressInterval = setInterval(() => {
      if (currentProg < 95) {
        const increment = currentProg < 40 ? 4 : currentProg < 75 ? 2 : 1;
        currentProg = Math.min(95, currentProg + increment);
        let stepLabel = isVideo ? 'Configurando fotogramas y movimiento...' : 'Haciendo un boceto inicial...';
        if (currentProg >= 22 && currentProg < 48) {
          stepLabel = isVideo ? 'Creando el primer borrador de movimiento...' : 'Creando el primer borrador...';
        } else if (currentProg >= 48 && currentProg < 74) {
          stepLabel = isVideo ? 'Calculando física, cámara e iluminación...' : 'Pensando luces y composición...';
        } else if (currentProg >= 74) {
          stepLabel = isVideo
            ? `Renderizando clip con ${params.model}...`
            : `Sintetizando alta resolución con ${params.model}...`;
        }
        updateProgress(stepLabel, currentProg);
      }
    }, 650);

    try {
      let finalResultUrl = '';
      let isPoster = false;
      let actualUsedModel = params.model;

      if (isVideo) {
        const response = await fetch('/api/alibaba/videos/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanPrompt,
            img_url: params.sourceImage || undefined,
            model: params.model,
            duration: params.duration || 5,
            resolution: params.resolution || '720P',
            alibabaApiKey: resolvedAliKey,
            alibabaBaseUrl: settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Error HTTP ${response.status} al comunicar con Alibaba Cloud Video`);
        }

        if (data.model) actualUsedModel = data.model;
        finalResultUrl = data.videoUrl || '';

        // If task is rendering asynchronously in Alibaba Cloud DashScope, poll until completion
        if (!finalResultUrl && data.taskId) {
          const taskId = data.taskId;
          const pollBaseUrl = data.pollBaseUrl || '';
          for (let attempt = 0; attempt < 36; attempt++) {
            await new Promise((r) => setTimeout(r, 2500));
            const statusRes = await fetch(
              `/api/alibaba/videos/status/${encodeURIComponent(taskId)}?alibabaApiKey=${encodeURIComponent(resolvedAliKey)}&pollBaseUrl=${encodeURIComponent(pollBaseUrl)}`
            );
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.videoUrl) {
                finalResultUrl = statusData.videoUrl;
                break;
              }
              if (statusData.status === 'FAILED' || statusData.error) {
                throw new Error(statusData.error || 'La síntesis de video falló en Alibaba Cloud');
              }
            }
          }
        }
      } else {
        const response = await fetch('/api/alibaba/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: cleanPrompt,
            alibabaApiKey: resolvedAliKey,
            alibabaBaseUrl: settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
            geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
            model: params.model,
            size: params.ratio || '1024*1024',
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Error HTTP ${response.status} al comunicar con el motor de imagen`);
        }

        if (data.model) actualUsedModel = data.model;
        finalResultUrl = data.dataUrl || data.url || '';
      }

      clearInterval(progressInterval);

      if (!finalResultUrl) {
        throw new Error(`Tiempo de espera agotado o respuesta vacía del motor (${params.model}).`);
      }

      // Create new attachment and store into "La Cajita"
      const newMediaAttachment: Attachment = {
        id: `${isVideo ? 'vid' : 'img'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `${isVideo ? 'Video' : 'Ilustracion'}_${actualUsedModel}_${new Date().toISOString().slice(0, 10)}.${isVideo && !isPoster ? 'mp4' : 'jpg'}`,
        type: isVideo && !isPoster ? 'video/mp4' : 'image/jpeg',
        fileType: isVideo ? 'video' : 'image',
        dataUrl: finalResultUrl,
        videoUrl: isVideo ? finalResultUrl : undefined,
        videoModel: isVideo ? actualUsedModel : undefined,
        duration: params.duration || 5,
        timestamp: Date.now(),
        chatId: studioChat.id,
      };

      handleAttachSessionMedia(newMediaAttachment);

      const assistantProse = isVideo
        ? `**Clip cinematográfico completado con ${actualUsedModel}**\n\n*Duración:* ${params.duration || 5}s · *Resolución:* ${params.resolution || '720P'}\n\n*Prompt:* «${cleanPrompt}»\n\n*(Guardado en La Cajita)*`
        : `**Ilustración completada con ${actualUsedModel}**\n\n*Relación de aspecto:* ${params.ratio || '1024*1024'}\n\n*Prompt:* «${cleanPrompt}»\n\n*(Guardada en La Cajita)*`;

      // Update assistant message with completed generation state and attachment
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id !== studioChat.id) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantMessageId) return m;
              return {
                ...m,
                content: assistantProse,
                isStreaming: false,
                attachments: [newMediaAttachment],
                generationState: {
                  isGenerating: false,
                  type: params.type,
                  model: actualUsedModel,
                  step: isVideo ? 'Video generado con éxito' : 'Ilustración lista',
                  progress: 100,
                  prompt: cleanPrompt,
                  sourceImage: params.sourceImage,
                  duration: params.duration,
                  resolution: params.resolution,
                  ratio: params.ratio,
                  resultUrl: finalResultUrl,
                  isPoster,
                },
              };
            }),
            updatedAt: Date.now(),
          };
        })
      );

      showToast(isVideo ? 'Video completado y guardado en La Cajita' : 'Ilustración completada y guardada en La Cajita');
    } catch (err: any) {
      clearInterval(progressInterval);
      setChats((prevChats) =>
        prevChats.map((c) => {
          if (c.id !== studioChat.id) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.id !== assistantMessageId) return m;
              return {
                ...m,
                isStreaming: false,
                error: err.message || 'Error en la síntesis',
                generationState: m.generationState
                  ? {
                      ...m.generationState,
                      isGenerating: false,
                      error: err.message || 'Error al generar',
                    }
                  : undefined,
              };
            }),
            updatedAt: Date.now(),
          };
        })
      );
      showToast(err.message || 'Error al generar');
    }
  };

  const handleIllustrateScene = async (sceneText: string, messageId?: string) => {
    const rawScene = sceneText.trim();
    if (!rawScene) {
      showToast('No hay texto de escena para ilustrar');
      return;
    }

    const resolvedAliKey = (
      settings.alibabaApiKey ||
      localStorage.getItem('kizuna_alibaba_api_key') ||
      (settings.provider === 'alibaba' ? settings.customApiKey : '') ||
      ''
    ).trim();

    showToast('Generando ilustración de la escena...');

    try {
      const response = await fetch('/api/alibaba/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawScene,
          alibabaApiKey: resolvedAliKey,
          alibabaBaseUrl: settings.alibabaBaseUrl,
          model: 'wanx2.1-t2i-turbo',
          geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
          size: '1024*1024',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Error al comunicar con el motor de ilustración');
      }

      const imgDataUrl = data.dataUrl || data.url || '';
      if (!imgDataUrl) {
        throw new Error('No se recibió la imagen generada');
      }

      const cleanTitle = `Ilustración_${new Date().toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 6)}`;

      const newAttachment: Attachment = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `${cleanTitle}.jpg`,
        type: 'image/jpeg',
        fileType: 'image',
        dataUrl: imgDataUrl,
        timestamp: Date.now(),
        chatId: activeChat?.id,
        messageId: messageId,
      };

      // 1. Save directly to "La Cajita" (Session Media Gallery)
      handleAttachSessionMedia(newAttachment);

      // 2. Also attach to the specific message if messageId is provided so it appears inline!
      if (messageId && activeChat) {
        setChats((prevChats) =>
          prevChats.map((c) => {
            if (c.id !== activeChat.id) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;
                const existingAttachments = m.attachments || [];
                return {
                  ...m,
                  attachments: [...existingAttachments, newAttachment],
                };
              }),
            };
          })
        );
      }

      showToast('Ilustración generada y guardada en La Cajita');
    } catch (err: any) {
      console.error('Error in handleIllustrateScene:', err);
      showToast(err.message || 'Error al generar ilustración');
    }
  };

  const handleGenerateSceneVideo = async (rawScene: string, messageId?: string) => {
    if (!rawScene.trim()) return;
    handleStartGenerativeStudioChat({
      type: 'video',
      prompt: rawScene.trim(),
      model: 'wan3.0-video',
      duration: 5,
      resolution: '720P',
    });
  };

  const handleAttachDocumentToContext = (doc: {
    title: string;
    filename: string;
    content: string;
    fileType: DocFileType | string;
    size: number;
  }) => {
    if (!activeChat) return;

    const newLore: LoreFile = {
      id: `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      folderId: activeChat.folderId || 'general',
      title: doc.title,
      filename: doc.filename,
      content: doc.content,
      fileType: (doc.fileType as DocFileType) || 'txt',
      size: doc.size,
      wordCount: doc.content.trim().split(/\s+/).length,
      estimatedTokens: Math.max(1, Math.round(doc.content.length / 3.8)),
      parseStatus: 'ready',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setLoreFiles((prev) => [...prev, newLore]);

    // Automatically attach it to the active session's context ("Docs en Contexto" counter updates to 1)
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              selectedLoreFileIds: Array.from(
                new Set([...(c.selectedLoreFileIds || []), newLore.id])
              ),
              updatedAt: Date.now(),
            }
          : c
      )
    );

    showToast(`📄 "${doc.filename}" añadido a Docs en Contexto`);
  };

  // -------------------------------------------------------------
  // Smart Memory Processing
  // -------------------------------------------------------------

  const processSmartMemory = (userText: string) => {
    if (settings.enableMemoryToggle === false) return;
    const memoryFact = detectSmartMemory(userText);
    if (memoryFact) {
      const newMem = createMemoryObject(memoryFact, 'auto');
      setSettings((prev) => ({
        ...prev,
        memories: [newMem, ...prev.memories],
      }));
      showToast(`Guardado en memoria: "${memoryFact}"`);
    }
  };

  // -------------------------------------------------------------
  // Message Generation & Streaming
  // -------------------------------------------------------------

  const handleSendMessage = async (
    userContent: string,
    attachments: Attachment[] = [],
    targetAssistantMessageId?: string,
    webSearchOverride?: boolean,
    isRegenerate: boolean = false,
    continueFromExistingProse?: string
  ) => {
    if (!activeChat) return;
    userAbortedRef.current = false;
    const isContinuationTurn = Boolean(targetAssistantMessageId && continueFromExistingProse);
    continuePrefixRef.current = isContinuationTurn && continueFromExistingProse ? continueFromExistingProse : '';

    const activeWebSearch =
      webSearchOverride !== undefined ? Boolean(webSearchOverride) : Boolean(isWebSearchEnabled);

    console.log("Despachando llamada con webSearch:", activeWebSearch);

    // Save uploaded media to session gallery ("la cajita")
    attachments.forEach((att) => {
      if (att.dataUrl || att.type.startsWith('image/')) {
        handleAttachSessionMedia(att);
      }
    });

    const cleanUserPrompt = userContent.trim();
    const visibleUserPrompt = cleanUserPrompt
      .replace(/^\[MODO LLAMADA DE VOZ EN VIVO[\s\S]*?\]:\s*/i, '')
      .trim() || cleanUserPrompt;

    // Auto-update title if it's the first message
    let updatedTitle = activeChat.title;
    if (activeChat.messages.length === 0 && activeChat.title === 'Nueva Conversación') {
      const titleSeed = visibleUserPrompt || attachments[0]?.name || 'Escena Narrativa';
      updatedTitle = titleSeed.slice(0, 32).trim();
    }

    const hasImages = attachments.some(
      (a) => a.type?.startsWith('image/') || a.fileType === 'image'
    );
    if (hasImages && !isVisionCapable) {
      showToast(
        'Aviso: El modelo seleccionado es solo texto. Seleccioná uno con la etiqueta 👁️ Visión para que pueda ver la imagen.'
      );
    }

    let assistantPlaceholderId = targetAssistantMessageId || `msg_${Date.now()}_a`;
    let messagesPayload: Message[] = [];

    // Resolve user prompt & attachments for this turn (accounting for regenerate)
    let effectivePromptForRouting = userContent;
    let effectiveAttsForRouting = attachments;
    if (isRegenerate) {
      for (let i = activeChat.messages.length - 1; i >= 0; i--) {
        if (activeChat.messages[i].role === 'user') {
          effectivePromptForRouting = activeChat.messages[i].content;
          effectiveAttsForRouting = activeChat.messages[i].attachments || [];
          break;
        }
      }
    }

    const isVoiceCallTurn = Boolean(voiceReplyCallbackRef.current);
    const autoRouteDecision =
      settings.autoModelRouting && !isVoiceCallTurn
        ? resolveAutoRoutedModel(
            effectivePromptForRouting,
            effectiveAttsForRouting,
            settings,
            isContinuationTurn
          )
        : null;

    const hasAlibabaKey = Boolean((settings.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key') || '').trim());
    let effectiveTurnProvider: 'gemini' | 'custom' | 'alibaba' = autoRouteDecision
      ? autoRouteDecision.provider
      : settings.provider;

    let manualModelId =
      settings.provider === 'gemini'
        ? settings.geminiModel
        : settings.provider === 'alibaba'
          ? (settings.alibabaModel || 'qwen3.8-max')
          : (settings.customModel || 'moonshotai/kimi-k3');

    // Voice Call Guard: Ensure live voice calls exclusively use Omni / Realtime / Flash Live models (never text-only Kimi K3 or Qwen Max)
    if (isVoiceCallTurn) {
      if (effectiveTurnProvider === 'custom' || (effectiveTurnProvider === 'alibaba' && !hasAlibabaKey)) {
        effectiveTurnProvider = hasAlibabaKey ? 'alibaba' : 'gemini';
        manualModelId = hasAlibabaKey ? 'qwen3.8-omni-flash-realtime' : 'gemini-3.6-flash';
      } else if (effectiveTurnProvider === 'alibaba' && !/omni|realtime/i.test(manualModelId)) {
        manualModelId = 'qwen3.8-omni-flash-realtime';
      } else if (effectiveTurnProvider === 'gemini' && !/flash/i.test(manualModelId)) {
        manualModelId = 'gemini-3.6-flash';
      }
    }

    const effectiveTurnModelId = autoRouteDecision ? autoRouteDecision.modelId : manualModelId;

    const formatModelDisplayName = (modelId: string): string => {
      if (modelId.includes('audio-3.1-realtime')) return 'Qwen-Audio 3.1 Realtime Flash';
      if (modelId.includes('audio-3.0-realtime')) return 'Qwen-Audio 3.0 Realtime Flash';
      if (modelId.includes('realtime')) return 'Qwen 3.8 Omni Flash Realtime';
      if (modelId.includes('omni-turbo') || modelId.includes('omni-mini')) return 'Qwen 3.8 Omni Mini';
      if (modelId.includes('qwen3.8-max-0902') || modelId.includes('0902')) return 'Qwen 3.8 Max 0902';
      if (modelId.includes('qwen3.7-plus') || modelId.includes('3.7-plus')) return 'Qwen 3.7 Plus';
      if (modelId.includes('qwen3.8-omni-flash') || modelId.includes('qwen-3.8-omni-flash') || modelId.includes('omni')) return 'Qwen 3.8 Omni Flash';
      if (modelId.includes('qwen3.8-plus') || modelId.includes('qwen-plus')) return 'Qwen 3.8 Plus (1M)';
      if (modelId.includes('qwen3.8-max') || modelId.includes('qwen-3.8-max')) return 'Qwen 3.8 Max';
      if (modelId.includes('qwen3.8-flash') || modelId.includes('qwen-3.8-flash')) return 'Qwen 3.8 Flash';
      if (modelId.includes('deepseek-k3')) return 'DeepSeek K3';
      if (modelId.includes('deepseek-v3')) return 'DeepSeek V3';
      if (modelId.includes('kimi-k3') || modelId.includes('moonshot')) return 'Kimi K3';
      if (modelId.includes('gemini-3.8-flash')) return 'Gemini 3.8 Flash';
      if (modelId.includes('gemini-3.6-flash')) return 'Gemini 3.6 Flash';
      if (modelId.includes('glm-5.3-flash')) return 'GLM 5.3-Flash';
      if (modelId.includes('glm-5.3')) return 'GLM 5.3';
      if (modelId.includes('llama-3.3-70b')) return 'Llama 3.3 70B';
      if (modelId.includes('gemini-3.1-pro')) return 'Gemini 3.1 Pro';
      if (modelId.includes('/')) return modelId.split('/').pop() || modelId;
      return modelId;
    };

    const effectiveTurnModelLabel = autoRouteDecision
      ? autoRouteDecision.modelLabel
      : formatModelDisplayName(effectiveTurnModelId);
    const effectiveAutoRouteReason = autoRouteDecision?.reason;

    const isReasoningModel =
      effectiveTurnProvider === 'gemini' ||
      /kimi|moonshot|glm|cot|reason|r1|gemini|step|stepfun|qwen3\.8|qwen3\.7/i.test(effectiveTurnModelId);
    const isCasual = isCasualGreeting(effectivePromptForRouting.trim());
    const userRequestedReasoning = settings.reasoningMode
      ? settings.reasoningMode !== 'off'
      : (settings.enableReasoning ?? true);
    // Voice Call Quota Shield: Disable reasoning CoT during voice calls to save 80% quota and respond in <0.8s
    const isReasoningTarget = !isCasual && !isVoiceCallTurn && userRequestedReasoning;
    const explicitUserMode: 'off' | 'light' | 'deep' =
      settings.reasoningMode || (settings.enableReasoning === false ? 'off' : 'light');
    const targetReasoningMode: 'off' | 'light' | 'deep' = (isCasual || isVoiceCallTurn)
      ? 'off'
      : explicitUserMode;
    const thinkingBudget = targetReasoningMode === 'off' ? 0 : targetReasoningMode === 'light' ? 2048 : 6180;

    if (isRegenerate) {
      let lastUserIndex = -1;
      for (let i = activeChat.messages.length - 1; i >= 0; i--) {
        if (activeChat.messages[i].role === 'user') {
          lastUserIndex = i;
          break;
        }
      }
      if (lastUserIndex === -1) return;
      const userMsg = activeChat.messages[lastUserIndex];
      const trailingAssistant = activeChat.messages[lastUserIndex + 1];

      // CRITICAL FIX: Ensure assistantPlaceholderId matches the target message being regenerated
      if (trailingAssistant) {
        assistantPlaceholderId = trailingAssistant.id;
      }

      // Collect existing variants or seed with current content
      const priorVariants: string[] = trailingAssistant?.variants && trailingAssistant.variants.length > 0
        ? [...trailingAssistant.variants]
        : trailingAssistant?.content ? [trailingAssistant.content] : [];

      const newVariantIndex = priorVariants.length;
      const updatedVariants = [...priorVariants, ''];

      const assistantMessage: Message = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        thinking: '',
        timestamp: Date.now(),
        isStreaming: true,
        isThinking: false,
        variants: updatedVariants,
        activeVariantIndex: newVariantIndex,
        selectedLoreIds: activeChat.selectedLoreFileIds,
        modelName: effectiveTurnModelLabel,
        modelId: effectiveTurnModelId,
        autoRouteReason: effectiveAutoRouteReason,
      };

      // CRITICAL FIX: Define messagesWithoutTrailing properly so it never throws ReferenceError
      const messagesWithoutTrailing = activeChat.messages.slice(0, lastUserIndex + 1);
      const updatedMessages = [...messagesWithoutTrailing.slice(0, -1), userMsg, assistantMessage];

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: updatedMessages,
                updatedAt: Date.now(),
              }
            : c
        )
      );

      const historyToInclude = messagesWithoutTrailing.slice(-6);
      messagesPayload = historyToInclude;
      userContent = userMsg.content;
      attachments = userMsg.attachments || [];
    } else if (!targetAssistantMessageId) {
      // Check for smart memory triggers: "recordá que...", "guarda en memoria...", "save to memory:"
      processSmartMemory(userContent);

      const userMessage: Message = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: visibleUserPrompt,
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? attachments : undefined,
        estimatedTokens: estimateTokenCount(visibleUserPrompt),
        isVoiceTurn: isVoiceCallTurn,
      };

      const assistantMessage: Message = {
        id: assistantPlaceholderId,
        role: 'assistant',
        content: '',
        thinking: '',
        timestamp: Date.now(),
        isStreaming: true,
        isThinking: false,
        webSearch: activeWebSearch,
        selectedLoreIds: activeChat.selectedLoreFileIds,
        modelName: effectiveTurnModelLabel,
        modelId: effectiveTurnModelId,
        autoRouteReason: effectiveAutoRouteReason,
        isVoiceTurn: isVoiceCallTurn,
      };

      // Ventana Deslizante + Libretita de Resumen Automático (Rolling Session Summary)
      const maxHistoryCount = settings.contextDepth === 'quick' ? 6 : 15;
      const olderMessages =
        activeChat.messages.length > maxHistoryCount
          ? activeChat.messages.slice(0, -maxHistoryCount)
          : [];
      const existingCleanSummary =
        activeChat.sessionSummary &&
        !activeChat.sessionSummary.includes(' [...] ') &&
        !/Turno #\d+\s*\([^)]+\):\s*¡?Hola\b/i.test(activeChat.sessionSummary)
          ? activeChat.sessionSummary
          : '';
      const synthesizedSessionSummary =
        olderMessages.length > 0
          ? existingCleanSummary && olderMessages.length <= (activeChat.summarizedUpToCount || 0)
            ? existingCleanSummary
            : buildRollingSessionSummary(olderMessages)
          : existingCleanSummary;

      // IMMEDIATE UI DISPATCH & DISK CHECKPOINT: Render and save user message immediately so it is never lost even if phone turns off 1s later!
      const updatedMessages = [...activeChat.messages, userMessage, assistantMessage];
      setChats((prev) => {
        const nextChats = prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                title: updatedTitle,
                messages: updatedMessages,
                sessionSummary: synthesizedSessionSummary || undefined,
                summarizedUpToCount:
                  olderMessages.length > 0
                    ? olderMessages.length
                    : synthesizedSessionSummary
                      ? c.summarizedUpToCount
                      : 0,
                updatedAt: Date.now(),
              }
            : c
        );
        saveChats(nextChats);
        return nextChats;
      });
      savePendingBackgroundJob({
        jobId: assistantPlaceholderId,
        chatId: activeChat.id,
        startedAt: Date.now(),
      });

      const historyToInclude = activeChat.messages.slice(-maxHistoryCount);
      messagesPayload = [...historyToInclude, { ...userMessage, content: cleanUserPrompt }];
    } else {
      if (!isContinuationTurn) {
        processSmartMemory(userContent);
      }
      const targetIndex = activeChat.messages.findIndex((m) => m.id === targetAssistantMessageId);
      const historyBase = targetIndex !== -1 ? activeChat.messages.slice(0, targetIndex) : activeChat.messages;
      const maxHistoryCount = settings.contextDepth === 'quick' ? 6 : 15;
      const historyToInclude = historyBase.slice(-maxHistoryCount);

      if (isContinuationTurn && continueFromExistingProse) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === targetAssistantMessageId
                      ? {
                          ...m,
                          content: continueFromExistingProse,
                          isStreaming: true,
                          isInterrupted: false,
                          error: undefined,
                        }
                      : m
                  ),
                  updatedAt: Date.now(),
                }
              : c
          )
        );
        const tailSnippet = continueFromExistingProse.slice(-220);
        messagesPayload = [
          ...historyToInclude,
          {
            id: targetAssistantMessageId,
            role: 'assistant',
            content: continueFromExistingProse,
            timestamp: Date.now(),
          },
          {
            id: `cont_usr_${Date.now()}`,
            role: 'user',
            content: `Tu respuesta anterior quedó incompleta o cortada exactamente aquí: "${tailSnippet}". Continúa redactando exactamente desde la siguiente palabra o signo donde quedaste, sin repetir lo anterior, sin poner títulos ni preámbulos ("Aquí tienes la continuación..."), manteniendo el mismo pulso y cerrando la respuesta.`,
            timestamp: Date.now(),
          },
        ];
      } else {
        messagesPayload = historyToInclude;
      }
    }


    // Prepare prompt components
    const folder = activeChat.folderId
      ? folders.find((f) => f.id === activeChat.folderId)
      : null;

    const isPersonaWizardSession = activeChat.title.includes('Taller de Directiva Global');
    const isProjectChat = Boolean(activeChat.folderId && folder);

    // Gather active lore file contents: Filtered by Dynamic RAG if enabled so only scene-relevant cards consume tokens
    const rawSelectedLoreDocs = isPersonaWizardSession
      ? []
      : loreFiles
          .filter((l) => Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id))
          .sort((a, b) => a.id.localeCompare(b.id));

    const ragTurnResult = filterLoreByDynamicRag(
      rawSelectedLoreDocs,
      userContent,
      activeChat.messages.slice(-4),
      settings.enableDynamicLoreRag !== false,
      8
    );
    const activeLoreDocs = ragTurnResult.injectedFiles;

    const loreImageAttachments: Attachment[] = activeLoreDocs
      .filter((doc) => doc.fileType === 'image' && doc.dataUrl)
      .map((doc) => ({
        id: `lore_img_${doc.id}`,
        name: doc.title || doc.filename || 'Imagen de Lore',
        type: 'image/jpeg',
        dataUrl: doc.dataUrl,
        fileType: 'image',
      }));

    if (loreImageAttachments.length > 0) {
      attachments = [...attachments, ...loreImageAttachments];
    }

    const loreDocumentsText = compressLoreDocsTo2K(activeLoreDocs, userContent);

    const isShortGreeting = !isContinuationTurn && attachments.length === 0 && isCasualGreeting(userContent.trim());
    const userAsksAboutLore = isContinuationTurn || /lore|bóveda|boveda|manuscrito|capítulo|capitulo|escena|documento|archivos|fichas|canon|kolder|hinistra|tedriot|teshuvana|monstereth/i.test(userContent);

    // Lore Context Injection: If documents are selected in Docs Lore (activeLoreDocs), ALWAYS inject them so the AI has 100% complete access to canon
    const loreContext = (loreDocumentsText.trim() && (!isVoiceCallTurn || userAsksAboutLore))
      ? `[DOCUMENTOS Y MANUSCRITO DE LORE ACTIVO (${activeLoreDocs.length} de ${rawSelectedLoreDocs.length} fichas inyectadas por Filtro Dinámico RAG)]:\n--- INICIO DE DOCUMENTOS ---\n${loreDocumentsText.trim()}\n--- FIN DE DOCUMENTOS ---`
      : '';

    // Determine effective System Instruction:
    // 1. If in "Taller de Directiva Global", inject dedicated Meta-Prompt Builder instruction.
    // 2. If in a Project/Folder OR user explicitly talks about the novel, use full globalSystemPrompt.
    // 3. If in a General Chat outside projects (e.g. talking about AI GPUs, hardware, daily topics), use a clean general persona without forcing novel diagnostics!
    const userMentionsNovel = /kolder|hinistra|tedriot|teshuvana|monstereth|jukkou|zankyou|catarsis|skarnita|gurasha|novela|capítulo|capitulo|escena|lore|bóveda|boveda|manuscrito|fichas|archivos/i.test(userContent);
    const loreStatusInstruction = `\n\n[ESTADO DE BÓVEDA DE LORE EN ESTA SESIÓN]: Tienes acceso completo e integrado al sistema Bóveda de Lore (Lore Storage) de Kizuna-Zek (${activeLoreDocs.length} documentos seleccionados actualmente en el contexto activo). NUNCA digas que no puedes ver la bóveda de lore ni que no tienes acceso a sus archivos. Si el usuario te pregunta por su lore o manuscritos, confirma afirmativamente que el acceso a Lore Storage está habilitado y recuérdale amigablemente que si desea que consultes un archivo específico en esta sesión, solo debe ir al selector 'Docs: X/Y' de la barra superior (o al menú '···' > 'Gestión de Lore') y marcar los documentos deseados con un check (✓).`;

    const maxHistoryWindow = settings.contextDepth === 'quick' ? 6 : 15;
    const olderTurnsForSummary =
      activeChat.messages.length > maxHistoryWindow
        ? activeChat.messages.slice(0, -maxHistoryWindow)
        : [];
    const validSavedSummary =
      activeChat.sessionSummary &&
      !activeChat.sessionSummary.includes(' [...] ') &&
      !/Turno #\d+\s*\([^)]+\):\s*¡?Hola\b/i.test(activeChat.sessionSummary)
        ? activeChat.sessionSummary
        : '';
    const activeRollingSummary =
      olderTurnsForSummary.length > 0
        ? validSavedSummary && olderTurnsForSummary.length <= (activeChat.summarizedUpToCount || 0)
          ? validSavedSummary
          : buildRollingSessionSummary(olderTurnsForSummary)
        : validSavedSummary;

    const sessionSummaryBlock =
      activeRollingSummary && !isShortGreeting
        ? `[MEMORIA DE SESIÓN — LIBRETITA DE RESUMEN DE MENSAJES ANTERIORES (#1 al #${olderTurnsForSummary.length || activeChat.summarizedUpToCount || 1})]:\nLos siguientes puntos resumen todo lo acordado, escrito y hablado al inicio de esta misma conversación antes de los últimos mensajes activos. Tenlos siempre presentes para mantener continuidad absoluta:\n${activeRollingSummary}`
        : '';

    const effectiveSystemInstruction = isPersonaWizardSession
      ? `Eres el Arquitecto del Taller de Directiva Global de Kizuna-Zek.
Tu ÚNICA misión en este chat es redactar la nueva Directiva Global (System Prompt) personalizada según las respuestas del usuario.
REGLAS DEL TALLER:
1. Cuando el usuario responda a tus preguntas sobre tono, prohibiciones y estilo de intervención, redacta DIRECTAMENTE el System Prompt completo, pulido y listo para usar en primera/segunda persona ("Eres Kizuna-Zek...").
2. NO incluyas introducciones largas ni explicaciones fuera de la directiva, porque cuando el usuario pulse el botón "✅ Aplicar a Directiva Global" debajo de tu mensaje, TODO el texto de tu respuesta se guardará como la nueva Directiva Global.
3. Si el usuario pide ajustes a la directiva que acabas de proponer, devuelve la versión completa corregida.`
      : (settings.globalSystemPrompt || `Eres Kizuna-Zek, colega creativo y taller editorial de cabecera del autor.`) +
        loreStatusInstruction;

    // Auto-clamp max tokens safeguard based on active model
    const rawAlibabaModel = effectiveTurnProvider === 'alibaba' ? effectiveTurnModelId : (settings.alibabaModel || 'qwen3.8-max');
    const cleanAlibabaModel = /llama|nemotron|nvdev|mistralai|meta\/|qwen-long/i.test(rawAlibabaModel)
      ? 'qwen3.8-omni-flash'
      : rawAlibabaModel;

    const targetModelId =
      effectiveTurnProvider === 'alibaba'
        ? cleanAlibabaModel
        : effectiveTurnProvider === 'custom'
          ? effectiveTurnModelId
          : effectiveTurnModelId;
    const safeOutputTokens = isVoiceCallTurn
      ? 320
      : clampMaxTokensForModel(
          targetModelId,
          settings.maxOutputTokens || 8192
        );

    // Start SSE stream
    setIsStreaming(true);
    requestNotificationAccess();
    requestScreenWakeLock();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    currentAssistantIdRef.current = assistantPlaceholderId;
    currentAccumulatedTextRef.current = '';
    currentAccumulatedThinkingRef.current = '';
    savedMemoryFactsRef.current = new Set();

    const streamStartTime = Date.now();
    const streamPerfStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let firstTokenPerfMs: number | null = null;
    let lastTokenPerfMs: number | null = null;
    let capturedCompletionTokens: number | undefined = undefined;
    let fullRawStream = '';
    let accumulatedServerReasoning = '';
    let reasoningDurationCaptured: number | undefined = undefined;
    let capturedTtftSeconds: number | undefined = undefined;
    let capturedCachedTokens: number | undefined = undefined;
    let streamWasTruncated = false;
    let pendingSources: WebSearchResult[] | undefined = undefined;
    let animationFrameId: number | null = null;
    let pendingStreamText = '';
    let pendingReasoningText = '';

    const flushState = () => {
      animationFrameId = null;

      // Ultra-fast zero-overhead prose parsing
      let extractedThought = '';
      let cleanProse = fullRawStream;

      if (/(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)/i.test(fullRawStream)) {
        const closeMatch = fullRawStream.match(/([\s\S]*?)(?:<\/think>|<\/thought>|<\/reasoning>|<\/cot>)([\s\S]*)/i);
        if (closeMatch) {
          const preTag = closeMatch[1];
          const postTag = closeMatch[2];
          const openMatch = preTag.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
          if (openMatch) {
            const prefix = preTag.slice(0, preTag.toLowerCase().indexOf(openMatch[0].toLowerCase()));
            extractedThought = openMatch[1].trim();
            cleanProse = (prefix + postTag);
          } else {
            // No opening tag (e.g. Stepfun / reasoning models without <think>):
            // Everything before </think> is reasoning text!
            extractedThought = preTag.trim();
            cleanProse = postTag;
          }
        }
      } else if (/(?:<think>|<thought>|<reasoning>|<cot>)/i.test(fullRawStream)) {
        const openMatch = fullRawStream.match(/(?:<think>|<thought>|<reasoning>|<cot>)([\s\S]*)/i);
        if (openMatch) {
          const prefix = fullRawStream.slice(0, fullRawStream.toLowerCase().indexOf(openMatch[0].toLowerCase()));
          extractedThought = openMatch[1].trim();
          cleanProse = prefix;
        }
      }

      // Purge any residual closing tags, tool_call blocks or leaking thought block artifacts
      cleanProse = cleanProse
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
        .replace(/<tool_call>[\s\S]*$/gi, '')
        .replace(/<\/?tool_call>/gi, '')
        .replace(/<\|tool_call\|>[\s\S]*?(?:<\|\/tool_call\|>|$)/gi, '')
        .replace(/<\|\/?tool_call\|>/gi, '')
        .replace(/[\wÀ-ÿ]*\.\<\/think\>/gi, '')
        .replace(/[\wÀ-ÿ]*\<\/think\>/gi, '')
        .replace(/[\wÀ-ÿ]*\<\/thought\>/gi, '')
        .replace(/<\/?(?:think|thought|reasoning|cot)[^>]*>/gi, '')
        .trimStart();

      // Automatic memory synthesis extraction (<<<SAVE_MEMORY: ... >>>)
      const memMatch = cleanProse.match(/<<<SAVE_MEMORY:\s*([\s\S]*?)>>>/i);
      if (memMatch && memMatch[1] && settings.enableMemoryToggle !== false) {
        const extractedFact = memMatch[1].trim();
        if (extractedFact && !savedMemoryFactsRef.current.has(extractedFact)) {
          savedMemoryFactsRef.current.add(extractedFact);
          const newMemId = "mem_" + Date.now();
          setSettings((prev) => {
            const exists = (prev.memories || []).some(
              (m) => m.text.trim().toLowerCase() === extractedFact.toLowerCase()
            );
            if (exists) return prev;
            const updatedMemories = [
              ...(prev.memories || []),
              { id: newMemId, text: extractedFact, timestamp: Date.now(), enabled: true, source: 'auto' as const },
            ];
            const updated = { ...prev, memories: updatedMemories };
            saveSettings(updated);
            return updated;
          });
          showToast("✦ Memoria guardada: " + extractedFact);
        }
      }

      // Remove memory tag from visible prose for clean reading
      cleanProse = cleanProse.replace(/<<<SAVE_MEMORY:\s*[\s\S]*?>>>/gi, '').trimEnd();

      let mergedProse = cleanProse;
      if (continuePrefixRef.current) {
        const prefix = continuePrefixRef.current;
        if (!cleanProse) {
          mergedProse = prefix;
        } else {
          const needsSpace = !/\s$/.test(prefix) && !/^[\s.,;:!?)»\]}]/.test(cleanProse);
          mergedProse = prefix + (needsSpace ? ' ' : '') + cleanProse;
        }
      }

      const combinedThinking = (accumulatedServerReasoning
        ? accumulatedServerReasoning + (extractedThought ? '\n' + extractedThought : '')
        : extractedThought
      ).trim();

      const hasCleanProse = cleanProse.trim().length > 0;
      if (hasCleanProse && !reasoningDurationCaptured) {
        reasoningDurationCaptured = Math.max(0.2, +((Date.now() - streamStartTime) / 1000).toFixed(1));
      }
      const stillThinking = isReasoningTarget && !hasCleanProse;

      const totalOutputTokensNow =
        capturedCompletionTokens && capturedCompletionTokens > 0
          ? capturedCompletionTokens
          : estimateTokenCount(cleanProse + (combinedThinking ? ' ' + combinedThinking : ''));
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const endPerf = lastTokenPerfMs || nowPerf;
      const genElapsedSec =
        firstTokenPerfMs !== null && endPerf > firstTokenPerfMs + 80
          ? (endPerf - firstTokenPerfMs) / 1000
          : Math.max(0.15, (endPerf - streamPerfStart) / 1000);
      const currentTokensPerSec =
        totalOutputTokensNow > 0 && genElapsedSec > 0
          ? +(totalOutputTokensNow / genElapsedSec).toFixed(1)
          : undefined;

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== assistantPlaceholderId) return m;
                  const vars = m.variants ? [...m.variants] : [mergedProse];
                  const idx = m.activeVariantIndex ?? (vars.length > 0 ? vars.length - 1 : 0);
                  if (vars.length > 0 && idx < vars.length) {
                    vars[idx] = mergedProse;
                  }
                  return {
                    ...m,
                    content: mergedProse,
                    thinking: combinedThinking || m.thinking,
                    reasoningDurationSeconds: reasoningDurationCaptured || m.reasoningDurationSeconds,
                    ttftSeconds: capturedTtftSeconds || m.ttftSeconds,
                    cachedTokens: capturedCachedTokens || m.cachedTokens,
                    tokensPerSecond: currentTokensPerSec || m.tokensPerSecond,
                    isThinking: stillThinking,
                    variants: vars,
                    activeVariantIndex: idx,
                    estimatedTokens: capturedCompletionTokens || estimateTokenCount(mergedProse),
                    webSearchSources: pendingSources || m.webSearchSources,
                  };
                }),
              }
            : c
        )
      );
    };

    const scheduleFlush = () => {
      if (animationFrameId === null) {
        animationFrameId = window.setTimeout(flushState, 115);
      }
    };

    const updateChunkText = (
      chunkText: string,
      reasoningChunk?: string,
      sources?: WebSearchResult[],
      ttftVal?: number,
      cachedVal?: number,
      truncatedVal?: boolean,
      completionTokensVal?: number
    ) => {
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (chunkText || reasoningChunk) {
        if (firstTokenPerfMs === null) {
          firstTokenPerfMs = nowPerf;
        }
        lastTokenPerfMs = nowPerf;
      }
      if (completionTokensVal !== undefined && completionTokensVal > 0) {
        capturedCompletionTokens = completionTokensVal;
        if (lastTokenPerfMs === null) {
          lastTokenPerfMs = nowPerf;
        }
      }
      if (truncatedVal) {
        streamWasTruncated = true;
      }
      if (cachedVal !== undefined && cachedVal > 0) {
        capturedCachedTokens = cachedVal;
        recordChatCacheHit(cachedVal, getLoreSignature(activeChat));
      }
      if (ttftVal !== undefined && !capturedTtftSeconds) {
        capturedTtftSeconds = ttftVal;
      } else if (!capturedTtftSeconds && (chunkText || reasoningChunk)) {
        capturedTtftSeconds = Math.max(0.1, +((Date.now() - streamStartTime) / 1000).toFixed(1));
      }
      if (sources && sources.length > 0) {
        pendingSources = sources;
      }
      if (reasoningChunk) {
        accumulatedServerReasoning += reasoningChunk;
        currentAccumulatedThinkingRef.current = accumulatedServerReasoning;
      }
      if (chunkText) {
        fullRawStream += chunkText;
        if (fullRawStream.includes('<think') || fullRawStream.includes('<thought')) {
          const thinkMatch = fullRawStream.match(/(?:<think>|<thought>)([\s\S]*?)(?:<\/think>|<\/thought>|$)/i);
          if (thinkMatch) {
            const extractedThink = thinkMatch[1].trim();
            if (extractedThink && !accumulatedServerReasoning.includes(extractedThink)) {
              accumulatedServerReasoning = accumulatedServerReasoning
                ? `${accumulatedServerReasoning}\n${extractedThink}`
                : extractedThink;
              currentAccumulatedThinkingRef.current = accumulatedServerReasoning;
            }
          }
        }
        currentAccumulatedTextRef.current = fullRawStream;
      }
      if (animationFrameId === null) {
        animationFrameId = window.setTimeout(flushState, 115);
      }
    };

    const preparedMessagesPayload = messagesPayload.map((m) => {
      if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
        const docSection = m.attachments
          .filter((a) => (a.textContent || a.content) && a.fileType !== 'image')
          .map((a) => `[DOCUMENTO ADJUNTO: ${a.name}]\n${(a.textContent || a.content)?.trim()}`)
          .join('\n\n');
        if (docSection && !m.content.includes('[DOCUMENTO ADJUNTO:')) {
          return {
            ...m,
            content: m.content ? `${m.content}\n\n${docSection}` : docSection,
          };
        }
      }
      return m;
    });
    const finalPayloadMessages = isVoiceCallTurn ? preparedMessagesPayload.slice(-4) : preparedMessagesPayload;

    let shouldClearPendingJobInFinally = true;
    savePendingBackgroundJob({
      jobId: assistantPlaceholderId,
      chatId: activeChat.id,
      startedAt: Date.now(),
    });

    try {
      let serverFailed = false;
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            jobId: assistantPlaceholderId,
            messages: finalPayloadMessages,
            isWebSearchEnabled: activeWebSearch,
            tavilyApiKey: cleanApiKey(settings.tavilyApiKey) || getTavilyApiKey(),
            systemInstruction: effectiveSystemInstruction,
            folderSystemPrompt: folder?.systemPrompt || '',
            loreContext,
            sessionSummary: sessionSummaryBlock,
            memories: settings.enableMemoryToggle === false ? [] : settings.memories,
            userProfile: settings.userProfile,
            personalityConfig: settings.personalityConfig,
            provider: effectiveTurnProvider,
            customConfig: {
              apiKey: effectiveTurnProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : effectiveTurnProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : (settings.customApiKey || getNvidiaApiKey()),
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: effectiveTurnProvider === 'alibaba' ? targetModelId : settings.alibabaModel,
              baseUrl: effectiveTurnProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
              tavilyApiKey: cleanApiKey(settings.tavilyApiKey) || getTavilyApiKey(),
            },
            maxOutputTokens: safeOutputTokens,
            temperature: settings.temperature,
            model: targetModelId,
            enableReasoning: targetReasoningMode !== 'off',
            reasoningMode: targetReasoningMode,
            thinkingBudget: thinkingBudget,
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: thinkingBudget,
              },
            },
          }),
        });

        if (!response.ok) {
          console.warn(`[Kizuna-Zek] Server returned HTTP ${response.status}. Activating direct client stream fallback.`);
          serverFailed = true;
        } else if (!response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          activeReaderRef.current = reader;
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            if (controller.signal.aborted || userAbortedRef.current) {
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
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.truncated) {
                  updateChunkText('', '', undefined, undefined, undefined, true);
                }
                if (parsed.ttftSeconds !== undefined) {
                  updateChunkText('', '', undefined, parsed.ttftSeconds);
                }
                if (parsed.cachedTokens !== undefined && parsed.cachedTokens > 0) {
                  updateChunkText('', '', undefined, undefined, parsed.cachedTokens);
                }
                if (parsed.completionTokens !== undefined && parsed.completionTokens > 0) {
                  updateChunkText('', '', undefined, undefined, undefined, undefined, parsed.completionTokens);
                }
                if (parsed.sources && Array.isArray(parsed.sources)) {
                  updateChunkText('', '', parsed.sources);
                }
                if (parsed.text || parsed.reasoning) {
                  updateChunkText(parsed.text || '', parsed.reasoning || '', undefined, parsed.ttftSeconds, parsed.cachedTokens, undefined, parsed.completionTokens);
                }
                if (parsed.error) {
                  const is429 =
                    parsed.error.includes('429') ||
                    parsed.error.includes('RESOURCE_EXHAUSTED') ||
                    parsed.error.includes('límite de peticiones');
                  const isIncompleteJson =
                    parsed.error.includes('Incomplete JSON segment at the end') ||
                    parsed.error.includes('incomplete JSON');

                  const hasSubstantialAccumulatedText =
                    (currentAccumulatedTextRef.current && currentAccumulatedTextRef.current.trim().length > 20) ||
                    (currentAccumulatedThinkingRef.current && currentAccumulatedThinkingRef.current.trim().length > 20);

                  // If text/thought was already rendered, don't destroy it on a trailing EOF glitch
                  if (isIncompleteJson && hasSubstantialAccumulatedText) {
                    console.warn('[Kizuna Stream Warning]: Trailing segment glitch ignored because message was already rendered.');
                    finalizeCurrentPartialMessage();
                    continue;
                  }

                  // If no text was streamed yet and server failed (e.g. 401/500), try direct client stream fallback first
                  if (!hasSubstantialAccumulatedText && !is429) {
                    serverFailed = true;
                    break;
                  }

                  let friendlyError = is429 ? HTTP_429_RATE_LIMIT_NOTICE : parsed.error;
                  if (isIncompleteJson) {
                    friendlyError = 'La conexión con Google Gemini se interrumpió al finalizar la respuesta. Si quedó incompleta, pulsa en Regenerar 🔄.';
                  }

                  if (!isVoiceCallTurn) {
                    setErrorDiagnostic({
                      message: friendlyError,
                      status: is429 ? '429' : '500',
                      engine: settings.provider === 'alibaba' ? 'alibaba' : settings.provider === 'custom' ? 'nvidia' : 'gemini',
                      modelId: activeModelId,
                      isVisionModel: isVisionModel(activeModelId),
                      hadAttachments: attachments.length > 0,
                      attachmentTypes: attachments.map((a) => a.fileType || a.type || 'archivo'),
                      timestamp: new Date().toLocaleTimeString(),
                      rawError: parsed.error,
                      error: friendlyError,
                      model: activeModelId,
                      provider: settings.provider,
                      hasImages,
                      attachmentsCount: attachments.length,
                      promptLength: userContent.length,
                      temperature: settings.temperature,
                      maxTokens: settings.maxOutputTokens,
                    });
                  }
                  setChats((prev) =>
                    prev.map((c) =>
                      c.id === activeChat.id
                        ? {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === assistantPlaceholderId
                                ? { ...m, error: friendlyError, isStreaming: false, isThinking: false }
                                : m
                            ),
                          }
                        : c
                    )
                  );
                }
              } catch {
                // Ignore partial SSE lines
              }
            }
            if (serverFailed || done) break;
          }
        }
      } catch (err: any) {
        const isAbort =
          userAbortedRef.current ||
          controller.signal.aborted ||
          err?.name === 'AbortError' ||
          err?.name === 'DOMException' ||
          err?.code === 20 ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (typeof err?.message === 'string' && (
            err.message.toLowerCase().includes('aborted') ||
            err.message.toLowerCase().includes('user abort') ||
            err.message.toLowerCase().includes('the operation was aborted')
          ));
        if (isAbort) throw err;

        // Before assuming server failed, check if the server is still generating in the background
        // (e.g. mobile OS suspended the socket while user was watching YouTube or had screen locked)
        let recoveredFromBgServer = false;
        let missedAttemptsWhileVisible = 0;
        for (let pollAttempt = 0; pollAttempt < 90; pollAttempt++) {
          if (userAbortedRef.current || controller.signal.aborted) break;

          // If the tab is currently hidden (user is in YouTube or screen is locked), wait patiently
          // because mobile browsers suspend fetch() calls while in the background.
          if (typeof document !== 'undefined' && document.hidden) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          const bgStatus = await fetchBackgroundJobFromServer(assistantPlaceholderId);
          if (bgStatus.found && bgStatus.job) {
            recoveredFromBgServer = true;
            missedAttemptsWhileVisible = 0;
            const job = bgStatus.job;
            if (job.text.length > fullRawStream.length || job.reasoning.length > accumulatedServerReasoning.length) {
              const deltaText = job.text.slice(fullRawStream.length);
              const deltaReasoning = job.reasoning.slice(accumulatedServerReasoning.length);
              updateChunkText(
                deltaText,
                deltaReasoning,
                job.sources,
                job.ttftSeconds,
                job.cachedTokens,
                job.truncated,
                job.completionTokens
              );
            }
            if (job.done || job.error) {
              break;
            }
            await new Promise((r) => setTimeout(r, 1200));
          } else {
            missedAttemptsWhileVisible++;
            // Give mobile Wi-Fi/cellular radio up to 3 attempts (~3.6s) to reconnect after waking from YouTube/lock screen
            if (missedAttemptsWhileVisible >= 3) {
              break;
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
        }

        const alreadyHasPartialContent =
          fullRawStream.trim().length > 0 || accumulatedServerReasoning.trim().length > 0;

        if (!recoveredFromBgServer) {
          if (alreadyHasPartialContent) {
            // Never trigger a duplicate direct-stream from scratch if partial text was already generated!
            // Preserve the partial text and mark it as interrupted so the user can tap "Continuar respuesta".
            streamWasTruncated = true;
            shouldClearPendingJobInFinally = false;
          } else {
            serverFailed = true;
          }
        }
      }

      // If server route /api/chat returned 404 or failed before starting a background job, execute direct standalone client fetch
      if (serverFailed && !userAbortedRef.current && !controller.signal.aborted) {
        await executeDirectApiStream({
          messages: finalPayloadMessages,
          systemInstruction: effectiveSystemInstruction,
          folderSystemPrompt: folder?.systemPrompt || '',
          loreContext,
          sessionSummary: sessionSummaryBlock,
          memories: settings.enableMemoryToggle === false ? [] : settings.memories,
          userProfile: settings.userProfile,
          personalityConfig: settings.personalityConfig,
          isWebSearchEnabled: activeWebSearch,
          provider: effectiveTurnProvider,
          customConfig: {
            apiKey: effectiveTurnProvider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : effectiveTurnProvider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : (settings.customApiKey || getNvidiaApiKey()),
            alibabaApiKey: settings.alibabaApiKey || '',
            alibabaBaseUrl: settings.alibabaBaseUrl,
            alibabaModel: effectiveTurnProvider === 'alibaba' ? targetModelId : settings.alibabaModel,
            baseUrl: effectiveTurnProvider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: safeOutputTokens,
          temperature: settings.temperature,
          model: targetModelId,
          enableReasoning: targetReasoningMode !== 'off',
          reasoningMode: targetReasoningMode,
          thinkingBudget: thinkingBudget,
          signal: controller.signal,
          onChunk: updateChunkText,
          onReaderInit: (r) => {
            activeReaderRef.current = r;
          },
        });
      }

      // Ensure KV Cache token count is synchronized with Mosquito if dedicated MaaS streaming endpoint omitted usage.prompt_tokens_details
      const currentLoreSig = getLoreSignature(activeChat);
      if (effectiveTurnProvider === 'alibaba' && (!capturedCachedTokens || capturedCachedTokens <= 0)) {
        const kaState = getKeepAliveState();
        if (
          kaState.lastCachedTokens &&
          kaState.lastCachedTokens > 0 &&
          kaState.lastWarmedSignature === currentLoreSig &&
          Date.now() - kaState.lastPingTimestamp < 10 * 60 * 1000
        ) {
          capturedCachedTokens = kaState.lastCachedTokens;
        } else if (activeLoreDocs.length > 0 && loreContext.trim()) {
          const staticWarmedTokens = estimateTokenCount(
            effectiveSystemInstruction + '\n\n' + (folder?.systemPrompt || '') + '\n\n' + loreContext
          );
          if (staticWarmedTokens > 1024) {
            capturedCachedTokens = staticWarmedTokens;
            recordChatCacheHit(staticWarmedTokens, currentLoreSig);
          }
        }
      }

      // Ensure final text and thinking state is flushed synchronously
      if (animationFrameId !== null) {
        clearTimeout(animationFrameId);
        animationFrameId = null;
      }
      flushState();

      // Stream completed cleanly: record tokens to persistent statistics
      const inputEstimatedTokens = estimateTokenCount(userContent) + (totalContextTokens || 0);
      const outputEstimatedTokens =
        capturedCompletionTokens && capturedCompletionTokens > 0
          ? capturedCompletionTokens
          : estimateTokenCount(fullRawStream + (accumulatedServerReasoning ? ' ' + accumulatedServerReasoning : ''));
      recordMessageActivity(inputEstimatedTokens, outputEstimatedTokens, capturedCachedTokens || 0, isVoiceCallTurn);
      setStats(loadStatistics());

      const finalReasoningDuration = (accumulatedServerReasoning || reasoningDurationCaptured)
        ? Math.max(0.2, +((Date.now() - streamStartTime) / 1000).toFixed(1))
        : undefined;

      const finalEndPerf = lastTokenPerfMs || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const finalGenSec =
        firstTokenPerfMs !== null && finalEndPerf > firstTokenPerfMs + 80
          ? (finalEndPerf - firstTokenPerfMs) / 1000
          : Math.max(0.15, (finalEndPerf - streamPerfStart) / 1000);
      const finalTokensPerSecond =
        outputEstimatedTokens > 0 && finalGenSec > 0
          ? +(outputEstimatedTokens / finalGenSec).toFixed(1)
          : undefined;

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantPlaceholderId
                    ? {
                        ...m,
                        isStreaming: false,
                        isThinking: false,
                        isInterrupted: Boolean(streamWasTruncated || userAbortedRef.current),
                        reasoningDurationSeconds: m.reasoningDurationSeconds || finalReasoningDuration,
                        ttftSeconds: m.ttftSeconds || capturedTtftSeconds,
                        cachedTokens: capturedCachedTokens ?? m.cachedTokens,
                        tokensPerSecond: finalTokensPerSecond || m.tokensPerSecond,
                      }
                    : m
                ),
              }
            : c
        )
      );
      continuePrefixRef.current = '';

      // Síntesis ejecutiva asíncrona en segundo plano (Post-Turno, 0ms de latencia en el chat)
      // Cuando se acumulan 6 o más mensajes nuevos fuera de la ventana literal, consolida el resumen en la nube.
      if (
        !userAbortedRef.current &&
        olderTurnsForSummary.length >= (activeChat.summarizedUpToCount || 0) + 6
      ) {
        const targetChatId = activeChat.id;
        const poolSnapshot = [...olderTurnsForSummary];
        void synthesizeSessionSummaryWithAI(poolSnapshot, settings, validSavedSummary).then(
          (aiSummary) => {
            if (!aiSummary || !aiSummary.trim()) return;
            setChats((prev) => {
              const updated = prev.map((c) => {
                if (c.id !== targetChatId) return c;
                const nextChat: Chat = {
                  ...c,
                  sessionSummary: aiSummary.trim(),
                  summarizedUpToCount: poolSnapshot.length,
                  updatedAt: Date.now(),
                };
                if (user?.uid) {
                  syncChatToFirestore(user.uid, nextChat);
                }
                return nextChat;
              });
              saveChats(updated);
              return updated;
            });
          }
        );
      }
    } catch (err: any) {
      const isAbort =
        userAbortedRef.current ||
        err?.name === 'AbortError' ||
        err?.name === 'DOMException' ||
        err?.code === 20 ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (typeof err?.message === 'string' && (
          err.message.toLowerCase().includes('aborted') ||
          err.message.toLowerCase().includes('user abort') ||
          err.message.toLowerCase().includes('the operation was aborted')
        ));

      if (isAbort) {
        // Silently capture cancellation, preserve all accumulated text, and never delete message
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        flushState();
        finalizeCurrentPartialMessage();
        return;
      }

      console.error("Error en generación:", err);

      // CRITICAL PROTECTION: If the model had already written partial text or reasoning before the connection dropped
      // (e.g. phone turned off, Wi-Fi lost, or OS killed background socket), NEVER overwrite the generated text with an error!
      const hasGeneratedPartialContent =
        fullRawStream.trim().length > 0 ||
        accumulatedServerReasoning.trim().length > 0 ||
        (currentAccumulatedTextRef.current && currentAccumulatedTextRef.current.trim().length > 0) ||
        (currentAccumulatedThinkingRef.current && currentAccumulatedThinkingRef.current.trim().length > 0);

      if (hasGeneratedPartialContent) {
        if (animationFrameId !== null) {
          clearTimeout(animationFrameId);
          animationFrameId = null;
        }
        flushState();
        finalizeCurrentPartialMessage();
        shouldClearPendingJobInFinally = false;
        return;
      }

      shouldClearPendingJobInFinally = false;
      const isTimeout = err?.name === 'AbortError';
      const rawErrMsg = String(err?.message || '');
      const isNetworkDrop =
        rawErrMsg.includes('Failed to fetch') ||
        rawErrMsg.includes('Load failed') ||
        rawErrMsg.includes('NetworkError') ||
        rawErrMsg.includes('network');
      const friendlyMessage = isTimeout
        ? "⚠️ La solicitud tardó demasiado sin responder. Revisa tu conexión o pulsa en Regenerar 🔄."
        : isNetworkDrop
          ? "⚠️ La conexión se pausó mientras estabas fuera de la app o sin señal. Si el servidor sigue procesando, se recuperará automáticamente en unos segundos, o puedes pulsar Regenerar 🔄."
          : `⚠️ Error de conexión con el motor: ${rawErrMsg || 'No se pudo conectar con el modelo seleccionado'}.`;
      
      setChats((prev) => {
        const updated = prev.map((c) => {
          if (c.id !== activeChat.id) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantPlaceholderId
                ? {
                    ...m,
                    content: m.content && m.content.trim().length > 0 ? m.content : friendlyMessage,
                    isStreaming: false,
                    isThinking: false,
                    isInterrupted: Boolean(m.content && m.content.trim().length > 0),
                    error: m.content && m.content.trim().length > 0 ? undefined : friendlyMessage,
                  }
                : m
            ),
            updatedAt: Date.now(),
          };
        });
        saveChats(updated);
        return updated;
      });
    } finally {
      if (activeReaderRef.current) {
        try {
          activeReaderRef.current.cancel();
        } catch {}
        activeReaderRef.current = null;
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
      currentAssistantIdRef.current = null;
      if (shouldClearPendingJobInFinally || userAbortedRef.current) {
        clearPendingBackgroundJob();
      }
      releaseScreenWakeLock();
      const words = fullRawStream.trim() ? fullRawStream.trim().split(/\s+/).length : 0;
      if (words > 0 && !userAbortedRef.current) {
        notifyGenerationComplete(words);
      }
      if (voiceReplyCallbackRef.current) {
        const cb = voiceReplyCallbackRef.current;
        voiceReplyCallbackRef.current = null;
        if (!userAbortedRef.current) {
          if (fullRawStream.trim()) {
            cb(fullRawStream);
          } else {
            cb('Disculpá, hubo una breve interrupción al conectar con el servidor. ¿Me repetís lo que decías?');
          }
        }
      }
    }
  };

  const finalizeCurrentPartialMessage = () => {
    const rawText = currentAccumulatedTextRef.current;
    let extractedThought = '';
    let cleanProse = rawText;

    if (rawText.includes('<think') || rawText.includes('<thought')) {
      const thinkMatch = rawText.match(/(?:<think>|<thought>)([\s\S]*?)(?:<\/think>|<\/thought>|$)/i);
      if (thinkMatch) {
        extractedThought = thinkMatch[1].trim();
        cleanProse = (
          rawText.slice(0, thinkMatch.index) +
          rawText.slice((thinkMatch.index || 0) + thinkMatch[0].length)
        ).trimStart();
      }
    }

    const thinking = (
      currentAccumulatedThinkingRef.current
        ? currentAccumulatedThinkingRef.current + (extractedThought ? '\n' + extractedThought : '')
        : extractedThought
    ).trim();

    const targetId = currentAssistantIdRef.current;

    setChats((prev) =>
      prev.map((c) => {
        if (!activeChat || c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            const isTarget = targetId ? m.id === targetId : m.isStreaming;
            if (!isTarget) return m;

            // Preserve accumulated partial text intact - do not discard or overwrite
            let mergedPartial = cleanProse;
            if (continuePrefixRef.current) {
              const prefix = continuePrefixRef.current;
              if (!cleanProse) {
                mergedPartial = prefix;
              } else {
                const needsSpace = !/\s$/.test(prefix) && !/^[\s.,;:!?)»\]}]/.test(cleanProse);
                mergedPartial = prefix + (needsSpace ? ' ' : '') + cleanProse;
              }
            }
            const finalContent = mergedPartial || m.content || '';
            const vars = m.variants ? [...m.variants] : [finalContent];
            const idx = m.activeVariantIndex ?? (vars.length > 0 ? vars.length - 1 : 0);
            if (vars.length > 0 && idx < vars.length) {
              vars[idx] = finalContent;
            }

            return {
              ...m,
              content: finalContent,
              thinking: thinking || m.thinking,
              isStreaming: false,
              isThinking: false,
              isInterrupted: true,
              variants: vars,
              activeVariantIndex: idx,
              estimatedTokens: estimateTokenCount(finalContent),
            };
          }),
          updatedAt: Date.now(),
        };
      })
    );
    continuePrefixRef.current = '';
  };

  const handleStopGeneration = () => {
    userAbortedRef.current = true;
    setIsStreaming(false);

    // Cancel active reader if still open
    if (activeReaderRef.current) {
      try {
        activeReaderRef.current.cancel();
      } catch {
        // Silently capture
      }
      activeReaderRef.current = null;
    }

    // Abort controller
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Silently capture
      }
      abortControllerRef.current = null;
    }

    // Freeze assistant message with accumulated partial text - NEVER delete from messages array
    finalizeCurrentPartialMessage();
  };

  const handleSelectVariant = (messageId: string, variantIndex: number) => {
    if (!activeChat) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId || !m.variants || typeof m.variants[variantIndex] !== 'string') return m;
            return {
              ...m,
              activeVariantIndex: variantIndex,
              content: m.variants[variantIndex],
            };
          }),
        };
      })
    );
  };

  const handleAuditScene = async (
    targetText?: string,
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode: 'fast' | 'deep' = 'fast'
  ) => {
    if (!activeChat || isStreaming) return;
    const assistantMsgs = activeChat.messages.filter((m) => m.role === 'assistant' && m.content.trim());
    const userMsgs = activeChat.messages.filter((m) => m.role === 'user' && m.content.trim());
    const sceneToAudit =
      targetText ||
      assistantMsgs[assistantMsgs.length - 1]?.content ||
      userMsgs[userMsgs.length - 1]?.content ||
      '';
    if (!sceneToAudit) {
      showToast('No hay texto o escena en el chat para auditar');
      return;
    }

    setIsAuditModalOpen(true);
    setIsAuditing(true);
    setIsAuditFinished(false);
    setAuditResult('');
    setAuditError(null);

    const activeLoreDocs = loreFiles.filter((l) => {
      return Array.isArray(activeChat?.selectedLoreFileIds) && activeChat.selectedLoreFileIds.includes(l.id);
    });

    const loreContextText = compressLoreDocsTo2K(activeLoreDocs, sceneToAudit);

    const auditPrompt = `Actúa como auditor de continuidad y lore. Revisa la coherencia sensorial, reglas del mundo y tono del texto actual. Entrega un informe conciso y constructivo destacando aciertos y contradicciones.

[TEXTO / ESCENA A AUDITAR]:
${sceneToAudit}

[LORE Y REGLAS DEL MUNDO]:
${loreContextText || 'Sin documentos de lore específicos cargados en el contexto.'}`;

    const targetProvider = overrideProvider || settings.provider;
    const targetModelId =
      overrideModel ||
      (targetProvider === 'alibaba'
        ? (settings.alibabaModel || 'qwen3.8-max')
        : targetProvider === 'custom'
          ? settings.customModel
          : settings.geminiModel);

    const isDeepMode = speedMode === 'deep';
    const auditMaxTokens = isDeepMode ? 3072 : 1024;

    try {
      let accumulatedText = '';
      let serverFailed = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ id: 'audit_req', role: 'user', content: auditPrompt, timestamp: Date.now() }],
            systemInstruction:
              'Eres el Auditor de Lore y Continuidad Rúnica de Kizuna-Zek. Entrega un veredicto estructurado, conciso y directo en 3 puntos: 1. Coherencia Sensorial & Foley, 2. Continuidad de Lore & Reglas, 3. Ajuste Quirúrgico Sugerido. Sin rodeos ni preámbulos.',
            folderSystemPrompt: '',
            loreContext: loreContextText,
            memories: [],
            provider: targetProvider,
            customConfig: {
              apiKey: targetProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : targetProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: targetModelId,
              baseUrl: targetProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: auditMaxTokens,
            temperature: 0.2,
            model: targetModelId,
            enableReasoning: isDeepMode,
            reasoningMode: isDeepMode ? 'light' : 'off',
            thinkingBudget: isDeepMode ? 1024 : 0,
          }),
        });

        if (!response.ok || !response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.text) {
                  accumulatedText += parsed.text;
                  setAuditResult(accumulatedText);
                }
              } catch (pErr: any) {
                if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
              }
            }
          }
        }
      } catch {
        serverFailed = true;
      }

      // Direct fallback for BOTH Gemini and Custom/NVIDIA/Alibaba engines
      if (serverFailed || !accumulatedText) {
        await executeDirectApiStream({
          messages: [{ id: 'audit_req', role: 'user', content: auditPrompt, timestamp: Date.now() }],
          systemInstruction:
            'Eres el Auditor de Lore y Continuidad Rúnica de Kizuna-Zek. Entrega un veredicto estructurado, conciso y directo en 3 puntos: 1. Coherencia Sensorial & Foley, 2. Continuidad de Lore & Reglas, 3. Ajuste Quirúrgico Sugerido. Sin rodeos ni preámbulos.',
          provider: targetProvider,
          customConfig: {
            apiKey: targetProvider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : targetProvider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : settings.customApiKey,
            baseUrl: targetProvider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: auditMaxTokens,
          temperature: 0.2,
          model: targetModelId,
          enableReasoning: isDeepMode,
          reasoningMode: isDeepMode ? 'light' : 'off',
          thinkingBudget: isDeepMode ? 1024 : 0,
          onChunk: (chunk) => {
            accumulatedText += chunk;
            setAuditResult(accumulatedText);
          },
        });
      }

      if (accumulatedText) {
        setIsAuditFinished(true);
        setTimeout(() => {
          setIsAuditFinished(false);
        }, 2500);
      }
    } catch (err: any) {
      setAuditError(err.message || 'Error al auditar la escena con el servicio de IA');
      setIsAuditFinished(false);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleBatchAudit = async (
    selectedChatIds: string[],
    overrideProvider?: 'gemini' | 'custom' | 'alibaba',
    overrideModel?: string,
    speedMode: 'fast' | 'deep' = 'fast'
  ) => {
    if (isStreaming || isAuditing) return;
    if (!selectedChatIds || selectedChatIds.length === 0) {
      showToast('⚠️ Selecciona al menos un capítulo o conversación para auditar');
      return;
    }

    setIsAuditModalOpen(true);
    setIsAuditing(true);
    setIsAuditFinished(false);
    setAuditResult('');
    setAuditError(null);

    const selectedChats = chats.filter((c) => selectedChatIds.includes(c.id));
    const combinedManuscriptText = selectedChats
      .map((c) => {
        const msgs = c.messages.filter((m) => m.content.trim());
        const body = msgs
          .map((m) => `[${m.role === 'user' ? 'AUTOR' : 'KIZUNA'}]: ${m.content}`)
          .join('\n\n');
        return `========================================\n[MANUSCRITO CAPÍTULO: "${c.title}"]\n========================================\n${body}`;
      })
      .join('\n\n\n');

    const activeLoreDocs = loreFiles;
    const loreContextText = activeLoreDocs
      .map((doc) => `[DOCUMENTO LORE: "${doc.title}"]\n${doc.content}`)
      .join('\n\n');

    const batchPrompt = `Actúa como Editor Principal y Auditor Rúnico de la novela ligera 'Jukkou no Zankyou'. 
Realiza una AUDITORÍA INTEGRAL EN LOTE del siguiente manuscrito compuesto por ${selectedChats.length} capítulos/escenas.

Examina minuciosamente:
1. FOLEY & BIOMECÁNICA SENSORIAL:
   - Coherencia somática de Kolder (vacío límbico, ojos prisma gris, virola de calabaza, yerba de cobre a 80-90°C, karambit, disipación de Catarsis).
   - Coherencia somática de Hinistra (voseo rioplatense, máscara de Euforia en pecho izquierdo, citas trágicas de Sófocles/Eurípides, corte Medusa).
   - Somática de Santusma y Skarnita.
2. CONTINUIDAD DE LORE ENTRE CAPÍTULOS:
   - Detecta contradicciones temporales, de reglas mágicas o de estados físicos de los personajes entre un capítulo y el siguiente.
3. FUGAS DE TONO & CLICHÉS:
   - Advierte si algún diálogo se vuelve melodramático, genérico o si los personajes pierden su voz distintiva.
4. PLAN DE ACCIÓN Y VEREDICTO QUIRÚRGICO:
   - Conclusiones concisas y sugerencias específicas de edición.

[MANUSCRITO COMPLETO EN LOTE]:
${combinedManuscriptText}

[CANON Y LORE DE REFERENCIA]:
${loreContextText || 'Canon central de Jukkou no Zankyou.'}`;

    const targetProvider = overrideProvider || settings.provider;
    const targetModelId =
      overrideModel ||
      (targetProvider === 'alibaba'
        ? (settings.alibabaModel || 'qwen3.8-max')
        : targetProvider === 'custom'
          ? settings.customModel
          : settings.geminiModel);

    const isDeepMode = speedMode === 'deep';
    const safeBatchMaxTokens = targetModelId.toLowerCase().includes('qwen-long') ? 2048 : (isDeepMode ? 4096 : 2048);

    try {
      let accumulatedText = '';
      let serverFailed = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ id: 'batch_audit_req', role: 'user', content: batchPrompt, timestamp: Date.now() }],
            systemInstruction:
              'Eres el Editor Jefe y Auditor de Continuidad de Jukkou no Zankyou. Entrega un informe editorial exhaustivo, ordenado en 4 secciones claras con formato Markdown profesional.',
            folderSystemPrompt: '',
            loreContext: loreContextText,
            memories: [],
            provider: targetProvider,
            customConfig: {
              apiKey: targetProvider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : targetProvider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
              alibabaApiKey: settings.alibabaApiKey || '',
              alibabaBaseUrl: settings.alibabaBaseUrl,
              alibabaModel: targetModelId,
              baseUrl: targetProvider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: safeBatchMaxTokens,
            temperature: 0.2,
            model: targetModelId,
            enableReasoning: isDeepMode,
            reasoningMode: isDeepMode ? 'light' : 'off',
            thinkingBudget: isDeepMode ? 1024 : 0,
          }),
        });

        if (!response.ok || !response.body) {
          serverFailed = true;
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '');
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.error) throw new Error(parsed.error);
                if (parsed.text) {
                  accumulatedText += parsed.text;
                  setAuditResult(accumulatedText);
                }
              } catch (pErr: any) {
                if (pErr.message && !pErr.message.includes('JSON')) throw pErr;
              }
            }
          }
        }
      } catch {
        serverFailed = true;
      }

      if (serverFailed || !accumulatedText) {
        await executeDirectApiStream({
          messages: [{ id: 'batch_audit_req', role: 'user', content: batchPrompt, timestamp: Date.now() }],
          systemInstruction:
            'Eres el Editor Jefe y Auditor de Continuidad de Jukkou no Zankyou. Entrega un informe editorial exhaustivo, ordenado en 4 secciones claras con formato Markdown profesional.',
          provider: settings.provider,
          customConfig: {
            apiKey: settings.provider === 'gemini' 
              ? (settings.geminiApiKey || getGeminiApiKey()) 
              : settings.provider === 'alibaba'
                ? (settings.alibabaApiKey || '')
                : settings.customApiKey,
            alibabaApiKey: settings.alibabaApiKey || '',
            alibabaBaseUrl: settings.alibabaBaseUrl,
            alibabaModel: targetModelId,
            baseUrl: settings.provider === 'alibaba'
              ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
              : settings.customBaseUrl,
            model: targetModelId,
          },
          maxOutputTokens: safeBatchMaxTokens,
          temperature: 0.2,
          enableReasoning: false,
          reasoningMode: 'off',
          thinkingBudget: 0,
          onChunk: (text) => {
            accumulatedText += text;
            setAuditResult(accumulatedText);
          },
        });
      }

      setIsAuditFinished(true);
      showToast('Auditoría Integral del manuscrito completada con éxito');
    } catch (err: any) {
      console.error('Batch audit error:', err);
      setAuditError(err.message || 'Error al procesar la auditoría integral en lote');
    } finally {
      setIsAuditing(false);
    }
  };

  const handleInspectUI = async (targetMode: 'chat' | 'modal' = 'chat') => {
    if (isStreaming) return;
    try {
      showToast('Capturando pantalla para inspección de UI...');

      // Allow popovers and dropdowns 100ms to dismiss cleanly
      await new Promise((resolve) => setTimeout(resolve, 100));

      const element = document.body;
      const dataUrl = await captureAppScreenshot(element);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

      const screenshotAttachment: Attachment = {
        id: `ui_inspect_${Date.now()}`,
        name: `captura_ui_${new Date().toISOString().slice(0, 10)}.jpg`,
        type: 'image/jpeg',
        fileType: 'image',
        size: Math.round((base64Data.length * 3) / 4),
        dataUrl,
        timestamp: Date.now(),
      };

      const uiDesignPrompt = `Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la captura de pantalla adjunta de la aplicación Kizuna-Zek.
Evalúa con precisión los siguientes aspectos clave:
1. Jerarquía Visual y Composición (Alineación, legibilidad, contraste y aprovechamiento del espacio).
2. Armonía Tipográfica y Paleta Sintética (Elegancia del tema oscuro y coherencia visual).
3. Experiencia de Usuario (UX), Accesibilidad y Usabilidad en Dispositivos.
Ofrece un diagnóstico estructurado y recomendaciones de mejora de diseño.`;

      if (targetMode === 'chat') {
        await handleSendMessage(uiDesignPrompt, [screenshotAttachment]);
      } else {
        setIsAuditModalOpen(true);
        setIsAuditing(true);
        setAuditResult('');
        setAuditError(null);

        const targetModelId =
          settings.provider === 'alibaba'
            ? (settings.alibabaModel || 'qwen3.8-max')
            : settings.provider === 'custom'
              ? settings.customModel
              : settings.geminiModel;

        const auditMessagePayload: Message[] = [
          {
            id: `ui_inspect_req_${Date.now()}`,
            role: 'user',
            content: uiDesignPrompt,
            timestamp: Date.now(),
            attachments: [screenshotAttachment],
          },
        ];

        let serverFailed = false;
        let accumulatedText = '';
        let flushTimer: any = null;
        let lastFlushTime = 0;

        const flushAudit = () => {
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }
          lastFlushTime = Date.now();
          setAuditResult(accumulatedText);
        };

        const scheduleAuditFlush = () => {
          const now = Date.now();
          const elapsed = now - lastFlushTime;
          if (elapsed >= 80) {
            flushAudit();
          } else if (!flushTimer) {
            flushTimer = setTimeout(flushAudit, 80 - elapsed);
          }
        };

        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: auditMessagePayload,
              systemInstruction: 'Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la interfaz de la aplicación de forma crítica, constructiva y elegante.',
              provider: settings.provider,
              customConfig: {
                apiKey: settings.provider === 'gemini' 
                  ? (settings.geminiApiKey || getGeminiApiKey()) 
                  : settings.provider === 'alibaba'
                    ? (settings.alibabaApiKey || '')
                    : settings.customApiKey,
                geminiApiKey: settings.geminiApiKey || getGeminiApiKey(),
                alibabaApiKey: settings.alibabaApiKey || '',
                alibabaBaseUrl: settings.alibabaBaseUrl,
                alibabaModel: settings.alibabaModel,
                baseUrl: settings.provider === 'alibaba'
                  ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                  : settings.customBaseUrl,
                model: targetModelId,
              },
              maxOutputTokens: 2048,
              temperature: 0.3,
              model: targetModelId,
              enableReasoning: false,
            }),
          });

          if (!response.ok) {
            if (response.status === 404) {
              serverFailed = true;
            } else {
              const errText = await response.text();
              throw new Error(`Error en servidor (${response.status}): ${errText || response.statusText}`);
            }
          } else if (!response.body) {
            serverFailed = true;
          } else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.replace(/^data:\s*/, '');
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.text) {
                    accumulatedText += parsed.text;
                    scheduleAuditFlush();
                  }
                  if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                } catch (parseErr: any) {
                  if (parseErr.message && !parseErr.message.includes('JSON')) {
                    throw parseErr;
                  }
                }
              }
            }
          }
        } catch (serverErr: any) {
          console.error('UI Inspector server error:', serverErr.message || serverErr);
          serverFailed = true;
        }

        if (serverFailed) {
          await executeDirectApiStream({
            messages: auditMessagePayload,
            systemInstruction: 'Actúa como un Diseñador Senior de Interfaz (UI/UX Inspector). Analiza la interfaz de la aplicación de forma crítica, constructiva y elegante.',
            provider: settings.provider,
            customConfig: {
              apiKey: settings.provider === 'gemini' 
                ? (settings.geminiApiKey || getGeminiApiKey()) 
                : settings.provider === 'alibaba'
                  ? (settings.alibabaApiKey || '')
                  : settings.customApiKey,
              baseUrl: settings.provider === 'alibaba'
                ? (settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1')
                : settings.customBaseUrl,
              model: targetModelId,
            },
            maxOutputTokens: 2048,
            temperature: 0.3,
            model: targetModelId,
            enableReasoning: false,
            onChunk: (chunk) => {
              accumulatedText += chunk;
              scheduleAuditFlush();
            },
          });
        }
        flushAudit();
      }
    } catch (err: any) {
      console.error('UI Inspector error:', err);
      showToast(`Error al capturar pantalla: ${err.message || String(err)}`);
      if (targetMode === 'modal') {
        setAuditError(err.message || 'Error al capturar e inspeccionar la interfaz');
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const handleExportEpub = async () => {
    if (!activeChat) return;
    try {
      showToast('Encuadernando novela en .epub...');
      await exportChatToEpub(activeChat, activeFolder?.name);
      showToast('Novela encuadernada con éxito en .epub');
    } catch (err: any) {
      console.error('Error exporting EPUB:', err);
      showToast(`Error al exportar EPUB: ${err.message || 'Error inesperado'}`);
    }
  };

  const handleRegenerate = () => {
    if (!activeChat || isStreaming) return;
    const msgs = activeChat.messages;
    if (msgs.length === 0) return;

    // 1. Find the last user message in the active session
    let lastUserIndex = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const userMsg = msgs[lastUserIndex];

    // 2. Remove the trailing assistant message from the 'messages' array
    // 3. Re-trigger the generation call strictly with that last user prompt and the prior context
    // 4. Do NOT append duplicate user messages or blank entries to the history
    handleSendMessage(userMsg.content, userMsg.attachments || [], undefined, undefined, true);
  };

  const handleContinueGeneration = (messageId?: string) => {
    if (!activeChat || isStreaming) return;
    const msgs = activeChat.messages;
    if (msgs.length === 0) return;

    let targetMsg: Message | undefined;
    if (messageId) {
      targetMsg = msgs.find((m) => m.id === messageId && m.role === 'assistant');
    } else {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          targetMsg = msgs[i];
          break;
        }
      }
    }

    if (!targetMsg || !targetMsg.content.trim()) return;

    const cleanExisting = targetMsg.content
      .replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '')
      .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
      .trimEnd();

    if (!cleanExisting) return;

    showToast('▶️ Continuando respuesta desde donde se cortó...');
    handleSendMessage('Continúa.', [], targetMsg.id, false, false, cleanExisting);
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!activeChat) return;

    // Force reset streaming and abort hanging requests so editing is NEVER blocked
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);

    const msgIndex = activeChat.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;

    const existingAtts = activeChat.messages[msgIndex].attachments || [];
    // Rewind conversation to this point (up to edited message)
    const truncated = activeChat.messages.slice(0, msgIndex);
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id ? { ...c, messages: truncated } : c
      )
    );

    // Resubmit immediately with new content
    handleSendMessage(newContent, existingAtts);
  };

  // Find folder for modal
  const targetFolderForModal =
    folders.find((f) => f.id === activeFolderModalId) ||
    (activeFolderModalId === 'general'
      ? {
          id: 'general',
          name: activeChat?.title || 'Contexto de la Conversación',
          description: 'Documentos activos y lore de esta sesión',
          systemPrompt: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      : undefined);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-[#09090b] text-zinc-100 font-sans antialiased relative pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] select-none overscroll-none"
    >
      {/* Invisible mobile edge gesture touch target for opening sidebar */}
      {!isSidebarOpen && (
        <div
          className="fixed inset-y-0 left-0 w-7 z-40 md:hidden pointer-events-auto"
          aria-hidden="true"
        />
      )}

      {/* Noir Sidebar with Touch Edge-Swipe and Motion */}
      <Sidebar
        folders={folders}
        chats={chats}
        loreFiles={loreFiles}
        activeChatId={activeChatId}
        activeFolderId={activeChat?.folderId || null}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onOpenFolderManager={(fId) => setActiveFolderModalId(fId)}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onDeleteChat={handleDeleteChat}
        onMoveChat={handleMoveChat}
        onRenameChat={handleUpdateChatTitle}
        onSearchInChat={(cId) => {
          handleSelectChat(cId);
          setIsInChatSearchOpen(true);
        }}
        onExportChat={handleExportChat}
        onOpenChatDriveSheet={(chat) => setChatForDriveSheet(chat)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
        onOpenStats={() => setIsStatsOpen(true)}
        onOpenLanding={() => setIsCompanyLandingOpen(true)}
        sessionMediaCount={sessionMedia.length}
        isStreaming={isStreaming}
      />

      {/* Main Chat Viewport */}
      <main className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-[#09090b] dark:bg-[#09090b] relative overscroll-none transition-colors">
        <OfflineBanner />
        {/* Header Contract with 1M Token Gauge and Collision Fix */}
        <ChatHeader
          chat={activeChat}
          folder={activeFolder}
          folders={folders}
          availableLoreFiles={currentFolderLoreFiles}
          sessionMediaCount={sessionMedia.length}
          totalContextTokens={totalContextTokens}
          settings={settings}
          currentProvider={settings.provider}
          isStreaming={isStreaming}
          onSelectQuickModel={(prov, mod) => {
            setSettings(prev => {
              const updated = {
                ...prev,
                autoModelRouting: false,
                provider: prov,
                ...(prov === 'gemini' 
                  ? { geminiModel: mod } 
                  : prov === 'alibaba'
                    ? { alibabaModel: mod }
                    : { customModel: mod })
              };
              saveSettings(updated);
              showToast(
                prov === 'gemini' 
                  ? 'Cambiado a Google Gemini' 
                  : prov === 'alibaba'
                    ? `Cambiado a Alibaba Cloud (${mod})`
                    : `Cambiado a NVIDIA NIM (${mod})`
              );
              return updated;
            });
          }}
          onToggleAutoRouting={(enabled) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                autoModelRouting: enabled,
              };
              saveSettings(updated);
              showToast(
                enabled
                  ? '✦ Modo Automático activado (Qwen 3.8 Max 0902 · Kimi K3 · Flash · 3.7 Plus)'
                  : 'Modo Automático desactivado (Selección manual)'
              );
              return updated;
            });
          }}
          onUpdateProvider={(newProvider, newModel) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                provider: newProvider,
                autoModelRouting: false,
                ...(newProvider === 'gemini' 
                  ? { geminiModel: newModel || 'gemini-3.8-flash' } 
                  : newProvider === 'alibaba'
                    ? { alibabaModel: newModel || 'qwen3.8-max' }
                    : { customModel: newModel || 'moonshotai/kimi-k3' }),
              };
              saveSettings(updated);
              showToast(
                `Modelo activo: ${
                  newProvider === 'gemini' 
                    ? (newModel || 'Gemini 3.8 Flash') 
                    : newProvider === 'alibaba'
                      ? (newModel || 'Qwen 3.8 Max')
                      : (newModel || 'Kimi K3 (NVIDIA)')
                }`
              );
              return updated;
            });
          }}
          isAuditingLore={isAuditing}
          isAuditFinished={isAuditFinished}
          isLightMode={isLightMode}
          onToggleTheme={() => setIsLightMode(!isLightMode)}
          reasoningMode={settings.reasoningMode || 'deep'}
          onToggleReasoning={(newMode) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                reasoningMode: newMode,
                enableReasoning: newMode !== 'off',
                thinkingBudget: newMode === 'off' ? 0 : newMode === 'light' ? 1024 : -1,
              };
              saveSettings(updated);
              showToast(
                newMode === 'off'
                  ? 'Razonamiento: Rápido (0s)'
                  : newMode === 'light'
                  ? 'Razonamiento: Equilibrado (1k)'
                  : 'Razonamiento: Profundo (Full)'
              );
              return updated;
            });
          }}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenStats={() => setIsStatsOpen(true)}
          onAuditScene={handleAuditScene}
          onInspectUI={() => handleInspectUI('chat')}
          onOpenFolderManager={(fId) => setActiveFolderModalId(fId)}
          onUpdateChatTitle={handleUpdateChatTitle}
          onToggleLoreFile={handleToggleLoreFile}
          onSelectAllLoreFiles={handleSelectAllLoreFiles}
          onDeselectAllLoreFiles={handleDeselectAllLoreFiles}
          onMoveChat={handleMoveChat}
          onExportChat={handleExportChat}
          onExportEpub={handleExportEpub}
          onExportChatToDrive={handleExportChatToDrive}
          onClearChat={handleClearChat}
          onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
          onStartVoiceCall={() => setIsVoiceCallOpen(true)}
          onOpenChatDriveSheet={(c) => setChatForDriveSheet(c)}
          onToggleInChatSearch={() => setIsInChatSearchOpen(!isInChatSearchOpen)}
          onOpenTokenBreakdown={() => setIsTokenBreakdownOpen(true)}
          onOpenEngineDuel={() => setIsEngineDuelOpen(true)}
          onOpenEditorialExport={() => setIsEditorialExportOpen(true)}
          onToggleDynamicLoreRag={(enabled) => {
            setSettings((prev) => {
              const updated: AppSettings = {
                ...prev,
                enableDynamicLoreRag: enabled,
              };
              saveSettings(updated);
              showToast(
                enabled
                  ? 'Filtro Dinámico de Lorebook (RAG Ligero) activado'
                  : 'Inyección Total de Lorebook activada'
              );
              return updated;
            });
          }}
        />

        {/* Floating In-Chat Keyword / Concept Search Bar */}
        <InChatSearch
          isOpen={isInChatSearchOpen}
          chat={activeChat}
          query={inChatSearchQuery}
          onQueryChange={setInChatSearchQuery}
          onClose={() => {
            setIsInChatSearchOpen(false);
            setInChatSearchQuery('');
          }}
        />

        {/* Message Feed Canvas */}
        <ChatArea
          ref={chatAreaRef}
          chat={activeChat}
          folder={activeFolder}
          loreFiles={loreFiles}
          isStreaming={isStreaming}
          isAuditingLore={isAuditing}
          toastMessage={toastMessage}
          searchHighlightQuery={inChatSearchQuery}
          onRegenerate={handleRegenerate}
          onContinueMessage={handleContinueGeneration}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onSelectVariant={handleSelectVariant}
          onAuditScene={handleAuditScene}
          onIllustrateScene={handleIllustrateScene}
          onGenerateVideoScene={handleGenerateSceneVideo}
          onOpenImageLightbox={(img) => setActiveLightboxImage(img)}
          onQuickPrompt={(prompt) => handleSendMessage(prompt, [])}
          onOpenFolderManager={() => {
            if (activeFolder) setActiveFolderModalId(activeFolder.id);
          }}
          onShowToast={showToast}
          onApplyGlobalPersona={handleApplyGlobalPersona}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenDocumentPreview={handleOpenDocumentPreview}
          onSwitchProvider={(prov, mod) => {
            setSettings((prev) => {
              const updated = {
                ...prev,
                provider: prov,
                autoModelRouting: false,
                ...(prov === 'gemini' 
                  ? { geminiModel: mod || 'gemini-3.8-flash' } 
                  : prov === 'alibaba'
                    ? { alibabaModel: mod || 'qwen3.8-max' }
                    : { customModel: mod || 'moonshotai/kimi-k3' }),
              };
              saveSettings(updated);
              showToast(
                prov === 'gemini' 
                  ? 'Cambiado a Google Gemini' 
                  : prov === 'alibaba'
                    ? `Cambiado a Alibaba Cloud (${mod || 'Qwen 3.8'})`
                    : 'Cambiado a Kimi K3 (NVIDIA)'
              );
              return updated;
            });
          }}
        />

        {/* Floating Input Bar with Attachment Popover Menu */}
        {activeChat && (
          <ChatInput
            onSendMessage={(content, attachments, webSearch) =>
              handleSendMessage(content, attachments, undefined, webSearch)
            }
            onStopGeneration={handleStopGeneration}
            isStreaming={isStreaming}
            activeLoreFilesCount={activeLoreFilesCount}
            totalLoreFilesCount={currentFolderLoreFiles.length}
            onAttachDocumentToContext={handleAttachDocumentToContext}
            onOpenLoreSelector={() => {
              if (activeFolder) {
                setActiveFolderModalId(activeFolder.id);
              } else {
                setActiveFolderModalId('general');
              }
            }}
            onOpenMediaGallery={() => setIsMediaGalleryOpen(true)}
            onOpenTextImportModal={() => setIsTextImportModalOpen(true)}
            onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
            onStartVoiceCall={() => setIsVoiceCallOpen(true)}
            onOpenImageLightbox={(img) => setActiveLightboxImage(img)}
            onOpenDocumentPreview={handleOpenDocumentPreview}
            onAttachSessionMedia={handleAttachSessionMedia}
            isVisionCapable={isVisionCapable}
            isWebSearchEnabled={isWebSearchEnabled}
            onToggleWebSearch={() => {
              setIsWebSearchEnabled((prev) => {
                const next = !prev;
                showToast(
                  next
                    ? 'Búsqueda Web en Vivo activada (Google Search Grounding)'
                    : 'Búsqueda Web en Vivo desactivada'
                );
                return next;
              });
            }}
            reasoningMode={settings.reasoningMode || (settings.enableReasoning === false ? 'off' : 'deep')}
            onCycleReasoningMode={() => {
              setSettings((prev) => {
                const current = prev.reasoningMode || (prev.enableReasoning === false ? 'off' : 'deep');
                const nextMode: 'off' | 'light' | 'deep' =
                  current === 'off' ? 'light' : current === 'light' ? 'deep' : 'off';
                const updated: AppSettings = {
                  ...prev,
                  reasoningMode: nextMode,
                  enableReasoning: nextMode !== 'off',
                  thinkingBudget: nextMode === 'off' ? 0 : nextMode === 'light' ? 2048 : 6180,
                };
                saveSettings(updated);
                showToast(
                  nextMode === 'deep'
                    ? 'Pensar más: PROFUNDO (Razonamiento CoT • 6180 tokens 💧)'
                    : nextMode === 'light'
                      ? 'Pensar más: ÁGIL (Equilibrado • 2048 tokens ⚖️)'
                      : 'Pensar más: DESACTIVADO (Instantáneo • Respuesta directa ⚡)'
                );
                return updated;
              });
            }}
            onShowWarningToast={showToast}
            onFocusInput={() => chatAreaRef.current?.scrollToBottom()}
            onInspectUI={() => handleInspectUI('chat')}
            onOpenKZShortcuts={() => handleInspectUI('chat')}
            onRegisterAttach={(fn) => {
              attachSessionMediaRef.current = fn;
            }}
          />
        )}
      </main>

      {/* Folder Directives & Lore Storage Modal */}
      <ErrorBoundary fallbackTitle="Error al abrir el gestor de arco">
        {targetFolderForModal && (
          <FolderModal
            folder={targetFolderForModal}
            loreFiles={loreFiles}
            isOpen={Boolean(activeFolderModalId)}
            onClose={() => setActiveFolderModalId(null)}
            onUpdateFolder={handleUpdateFolder}
            onAddLoreFiles={handleAddLoreFiles}
            onUpdateLoreFile={handleUpdateLoreFile}
            onDeleteLoreFile={handleDeleteLoreFile}
            selectedLoreFileIds={activeChat?.selectedLoreFileIds || []}
            onToggleLoreFile={handleToggleLoreFile}
            onSelectAllLoreFiles={handleSelectAllLoreFiles}
            onDeselectAllLoreFiles={handleDeselectAllLoreFiles}
            activeChatId={activeChat?.id}
          />
        )}
      </ErrorBoundary>

      {/* Session Media Gallery (La Cajita) Modal */}
      {isMediaGalleryOpen && (
        <ErrorBoundary fallbackTitle="Error en la galería multimedia">
          <SessionMediaGalleryModal
            isOpen={isMediaGalleryOpen}
            initialTab={mediaGalleryInitialTab}
            onClose={() => setIsMediaGalleryOpen(false)}
            media={sessionMedia}
            onDeleteMedia={handleDeleteSessionMedia}
            onAttachMedia={(att) => {
              attachSessionMediaRef.current?.(att);
              showToast(att.type === 'video' ? "Video adjunto desde La Cajita" : "Imagen adjunta desde La Cajita");
            }}
            onAddMedia={handleAttachSessionMedia}
            alibabaApiKey={settings.alibabaApiKey}
            alibabaBaseUrl={settings.alibabaBaseUrl || 'https://ws-sitvcc6ml5lia10m.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'}
            activeChatId={activeChat?.id}
            onStartGenerativeChat={handleStartGenerativeStudioChat}
          />
        </ErrorBoundary>
      )}

      {/* Model & Smart Memory Settings Modal with Dynamic NVIDIA NIM Discovery & Search */}
      {isSettingsOpen && (
        <ErrorBoundary fallbackTitle="Error en el panel de configuración de modelos">
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onSaveSettings={setSettings}
            onStartPersonaWizard={handleStartPersonaWizard}
            activeChat={activeChat}
            onUpdateChatSessionSummary={(chatId, summary, summarizedCount) => {
              setChats((prev) => {
                const updated = prev.map((c) => {
                  if (c.id !== chatId) return c;
                  const nextChat: Chat = {
                    ...c,
                    sessionSummary: summary || undefined,
                    summarizedUpToCount: summary ? summarizedCount : 0,
                    updatedAt: Date.now(),
                  };
                  if (user?.uid) {
                    syncChatToFirestore(user.uid, nextChat);
                  }
                  return nextChat;
                });
                saveChats(updated);
                return updated;
              });
              showToast('Resumen de sesión actualizado');
            }}
          />
        </ErrorBoundary>
      )}

      {/* Standalone Lightbox with Zoom Controls */}
      {activeLightboxImage && (
        <ErrorBoundary fallbackTitle="Error en la previsualización de imagen">
          <ImageLightbox
            image={activeLightboxImage}
            onClose={() => setActiveLightboxImage(null)}
          />
        </ErrorBoundary>
      )}

      {/* Standalone In-App Document & Manuscript Reader Modal */}
      {previewDocument && (
        <ErrorBoundary fallbackTitle="Error en la vista previa del documento">
          <DocumentPreviewModal
            isOpen={Boolean(previewDocument)}
            onClose={() => setPreviewDocument(null)}
            document={previewDocument}
            onShowToast={showToast}
          />
        </ErrorBoundary>
      )}

      {/* Create Folder Modal */}
      {isCreateFolderModalOpen && (
        <PromptModal
          isOpen={isCreateFolderModalOpen}
          title="Nuevo Arco / Carpeta"
          description="Introduce el nombre del nuevo arco narrativo o proyecto:"
          placeholder="p. ej. Volumen II: Tokio Crepúsculo"
          confirmLabel="Crear Arco"
          onConfirm={(name) => {
            const newFolder: Folder = {
              id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: name.trim(),
              systemPrompt: `ENTORNO: Describe el mundo y el tono del arco.\nTONO: Prosa literaria, concisa y cuidada.\nREGLAS:\n1. Adherirse a las directivas del sistema y el lore activo.`,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            setFolders((prev) => {
              const updated = [...prev, newFolder];
              saveFolders(updated);
              return updated;
            });
            setActiveFolderModalId(newFolder.id);
            showToast('Arco creado');
          }}
          onClose={() => setIsCreateFolderModalOpen(false)}
        />
      )}

      {/* Rename Folder Modal */}
      {folderToRename && (
        <PromptModal
          isOpen={Boolean(folderToRename)}
          title="Renombrar Arco"
          description="Modifica el título del arco:"
          initialValue={folderToRename?.name || ''}
          confirmLabel="Guardar"
          onConfirm={(newName) => {
            if (folderToRename) {
              setFolders((prev) => {
                const updated = prev.map((f) =>
                  f.id === folderToRename.id ? { ...f, name: newName.trim(), updatedAt: Date.now() } : f
                );
                saveFolders(updated);
                return updated;
              });
              setFolderToRename(null);
              showToast('Arco renombrado');
            }
          }}
          onClose={() => setFolderToRename(null)}
        />
      )}

      {/* Clear Chat Confirmation Modal */}
      {isClearChatConfirmOpen && (
        <ConfirmModal
          isOpen={isClearChatConfirmOpen}
          title="¿Vaciar conversación?"
          description="¿Estás seguro de que deseas eliminar todos los mensajes de esta conversación? Esta acción no se puede deshacer."
          confirmLabel="Vaciar"
          onConfirm={() => {
            if (activeChat) {
              setChats((prev) => {
                const updated = prev.map((c) =>
                  c.id === activeChat.id ? { ...c, messages: [], updatedAt: Date.now() } : c
                );
                saveChats(updated);
                return updated;
              });
              showToast('Conversación vaciada');
            }
            setIsClearChatConfirmOpen(false);
          }}
          onClose={() => setIsClearChatConfirmOpen(false)}
        />
      )}

      {/* RikkaHub Inspired Statistics & Activity Heatmap Dashboard */}
      {isStatsOpen && (
        <ErrorBoundary fallbackTitle="Error al abrir las estadísticas">
          <StatsModal
            isOpen={isStatsOpen}
            onClose={() => setIsStatsOpen(false)}
            stats={stats}
            chats={chats}
            loreFiles={loreFiles}
            onResetStats={() => {
              const clean = resetStatistics();
              setStats(clean);
              showToast('Métricas reiniciadas a cero');
            }}
          />
        </ErrorBoundary>
      )}

      {/* Resilient Error Recovery & Diagnostic "Copiar Reporte" Modal */}
      {errorDiagnostic && (
        <ErrorBoundary fallbackTitle="Error en el diagnóstico de errores">
          <ErrorDiagnosticModal
            isOpen={Boolean(errorDiagnostic)}
            onClose={() => setErrorDiagnostic(null)}
            errorInfo={errorDiagnostic}
            onRetry={handleRegenerate}
            onSwitchToGeminiFlash={() => {
              const updatedSettings: AppSettings = {
                ...settings,
                provider: 'gemini',
                geminiModel: 'gemini-3.5-flash',
              };
              setSettings(updatedSettings);
              saveSettings(updatedSettings);
              showToast('Cambiado a gemini-3.5-flash (Alta Disponibilidad)');
              setTimeout(() => {
                handleRegenerate();
              }, 100);
            }}
            onShowToast={showToast}
          />
        </ErrorBoundary>
      )}

      {/* Lore Storage & Scene Audit Modal */}
      {isAuditModalOpen && (
        <ErrorBoundary fallbackTitle="Error en la auditoría de escena">
          <LoreAuditorModal
            isOpen={isAuditModalOpen}
            isAuditing={isAuditing}
            auditResult={auditResult || ''}
            auditError={auditError}
            onClose={() => setIsAuditModalOpen(false)}
            onInspectUI={() => handleInspectUI('modal')}
            onReaudit={(prov, mod, sm) => handleAuditScene(undefined, prov, mod, sm)}
            chats={chats}
            loreFiles={loreFiles}
            onBatchAudit={(chatIds, prov, mod, sm) => handleBatchAudit(chatIds, prov, mod, sm)}
            activeProvider={settings.provider}
            activeModel={
              settings.provider === 'alibaba'
                ? settings.alibabaModel
                : settings.provider === 'custom'
                  ? settings.customModel
                  : settings.geminiModel
            }
          />
        </ErrorBoundary>
      )}

      {/* Google Drive Direct Chat & Project Lore Modal */}
      {isGoogleDriveOpen && (
        <ErrorBoundary fallbackTitle="Error al abrir Google Drive">
          <GoogleDriveModal
            isOpen={isGoogleDriveOpen}
            onClose={() => setIsGoogleDriveOpen(false)}
            folderId={activeFolder?.id || activeChat?.folderId || 'general'}
            defaultMode="chat"
            onImportLoreFiles={(files) => {
              handleAddLoreFiles(files);
              showToast(`📚 ${files.length} archivo(s) de Google Drive importados a Lore`);
            }}
            onImportToChat={(atts) => {
              atts.forEach((a) => attachSessionMediaRef.current?.(a));
              showToast(`📎 ${atts.length} capítulo(s) de Google Drive adjuntados al chat`);
            }}
          />
        </ErrorBoundary>
      )}

      {/* Hands-Free Omni Live Voice Call Modal */}
      {isVoiceCallOpen && (
        <ErrorBoundary fallbackTitle="Error en Llamada Omni">
          <VoiceCallModal
            isOpen={isVoiceCallOpen}
            onClose={() => {
              voiceReplyCallbackRef.current = null;
              setIsVoiceCallOpen(false);
              if (window.location.search.includes('action=voice')) {
                window.history.replaceState({}, '', window.location.pathname);
              }
            }}
            activeModelName={
              settings.provider === 'alibaba'
                ? (/omni|realtime/i.test(settings.alibabaModel || '')
                    ? (settings.alibabaModel || 'qwen3.8-omni-flash-realtime')
                    : 'qwen3.8-omni-flash-realtime')
                : settings.provider === 'custom'
                  ? ((settings.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key'))
                      ? 'qwen3.8-omni-flash-realtime'
                      : 'gemini-3.6-flash')
                  : (/flash/i.test(settings.geminiModel || '')
                      ? (settings.geminiModel || 'gemini-3.6-flash')
                      : 'gemini-3.6-flash')
            }
            activeProvider={
              settings.provider === 'custom'
                ? ((settings.alibabaApiKey || localStorage.getItem('kizuna_alibaba_api_key')) ? 'alibaba' : 'gemini')
                : settings.provider
            }
            onSelectQuickModel={(provider, model) => {
              setSettings((prev) => {
                const updated: AppSettings = {
                  ...prev,
                  provider,
                  ...(provider === 'alibaba' ? { alibabaModel: model } : {}),
                  ...(provider === 'gemini' ? { geminiModel: model } : {}),
                  ...(provider === 'custom' ? { customModel: model } : {}),
                };
                saveSettings(updated);
                return updated;
              });
            }}
            onStopGeneration={handleStopGeneration}
            onSendVoiceTurn={(spokenPrompt, onResponseReady, onError) => {
              voiceReplyCallbackRef.current = onResponseReady;
              handleSendMessage(spokenPrompt, []).catch((err) => {
                voiceReplyCallbackRef.current = null;
                onError(err?.message || 'Error en la llamada');
              });
            }}
          />
        </ErrorBoundary>
      )}

      {/* Quick Google Docs / Text Import Modal */}
      {isTextImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-xs modal-backdrop-fluid select-none">
          <div className="flex flex-col w-full max-w-xl bg-[#0a0a0e] border border-[#22222a] rounded-2xl shadow-2xl text-white overflow-hidden modal-sheet-fluid">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c24] bg-[#0d0d12]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#181822] border border-[#282834] flex items-center justify-center text-blue-400">
                  <FileUp size={16} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Importar Google Docs / Manuscrito
                  </h3>
                  <p className="text-[11px] text-[#71717a]">
                    Pega texto directamente a Docs en Contexto sin límites de móvil
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTextImportModalOpen(false)}
                className="p-1.5 text-[#71717a] hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#a1a1aa] mb-1.5">
                  Título del documento o capítulo
                </label>
                <input
                  type="text"
                  value={importDocTitle}
                  onChange={(e) => setImportDocTitle(e.target.value)}
                  placeholder="Ej: Capítulo 1 - La Torre en Penumbras"
                  className="w-full bg-[#121218] border border-[#22222a] focus:border-blue-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#52525b] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#a1a1aa] mb-1.5">
                  Contenido del documento / Manuscrito
                </label>
                <textarea
                  value={importDocContent}
                  onChange={(e) => setImportDocContent(e.target.value)}
                  placeholder="Pega aquí el contenido de tu Google Doc o archivo de texto..."
                  rows={8}
                  className="w-full bg-[#121218] border border-[#22222a] focus:border-blue-500/60 rounded-xl p-3.5 text-xs text-white placeholder-[#52525b] focus:outline-none resize-none transition-colors leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#1c1c24] bg-[#0d0d12]">
              <span className="text-[10px] font-mono text-[#71717a]">
                {importDocContent.trim()
                  ? `${importDocContent.trim().split(/\s+/).length.toLocaleString()} palabras`
                  : 'Listo para importar'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTextImportModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#272731] bg-[#101014] text-xs font-medium text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTextImport}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
                >
                  Guardar en Docs en Contexto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Google Drive Style Chat Sheet */}
      {chatForDriveSheet && (
        <ChatDriveSheetModal
          isOpen={Boolean(chatForDriveSheet)}
          chat={chatForDriveSheet}
          folders={folders}
          onClose={() => setChatForDriveSheet(null)}
          onRenameChat={handleUpdateChatTitle}
          onMoveChat={handleMoveChat}
          onDeleteChat={handleDeleteChat}
          onSearchInChat={(cId) => {
            handleSelectChat(cId);
            setIsInChatSearchOpen(true);
          }}
          onExportChat={handleExportChat}
        />
      )}

      {/* Startup Showcase & Alibaba Catalyst Landing Modal */}
      {isCompanyLandingOpen && (
        <CompanyLandingModal
          isOpen={isCompanyLandingOpen}
          onClose={() => {
            setIsCompanyLandingOpen(false);
            try {
              if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', window.location.pathname);
              }
            } catch {
              // safe fallback
            }
          }}
        />
      )}

      {/* Desglose Visual de Contexto (Token Breakdown Inspector + Filtro RAG Ligero) */}
      {isTokenBreakdownOpen && (
        <ErrorBoundary fallbackTitle="Error en el inspector de contexto">
          <TokenBreakdownModal
            isOpen={isTokenBreakdownOpen}
            onClose={() => setIsTokenBreakdownOpen(false)}
            chat={activeChat}
            folder={activeFolder}
            loreFiles={loreFiles}
            settings={settings}
            onToggleDynamicLoreRag={(enabled) => {
              setSettings((prev) => {
                const updated: AppSettings = {
                  ...prev,
                  enableDynamicLoreRag: enabled,
                };
                saveSettings(updated);
                showToast(
                  enabled
                    ? 'Filtro Dinámico de Lorebook (RAG Ligero) activado'
                    : 'Inyección Total de Lorebook activada'
                );
                return updated;
              });
            }}
            onOpenFolderManager={() => {
              setActiveFolderModalId(activeFolder?.id || 'general');
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </ErrorBoundary>
      )}

      {/* Modo Comparador: Duelo de Motores (Split View) */}
      {isEngineDuelOpen && (
        <ErrorBoundary fallbackTitle="Error en el duelo de motores">
          <EngineDuelModal
            isOpen={isEngineDuelOpen}
            onClose={() => setIsEngineDuelOpen(false)}
            chat={activeChat}
            folder={activeFolder}
            loreFiles={loreFiles}
            settings={settings}
            onAdoptDuelResult={(
              promptText,
              winnerText,
              winnerThinking,
              winnerModelLabel,
              winnerModelId,
              runnerUpText
            ) => {
              if (!activeChat) return;
              const now = Date.now();
              const lastMsg = activeChat.messages[activeChat.messages.length - 1];
              const shouldAppendUserMsg =
                !lastMsg || lastMsg.role !== 'user' || lastMsg.content.trim() !== promptText.trim();

              const newUserMsg: Message = {
                id: `msg_${now}_duel_u`,
                role: 'user',
                content: promptText,
                timestamp: now,
                estimatedTokens: estimateTokenCount(promptText),
              };

              const variants = runnerUpText && runnerUpText.trim()
                ? [winnerText, runnerUpText]
                : [winnerText];

              const newAssistantMsg: Message = {
                id: `msg_${now + 1}_duel_a`,
                role: 'assistant',
                content: winnerText,
                thinking: winnerThinking || undefined,
                timestamp: now + 1,
                modelName: winnerModelLabel,
                modelId: winnerModelId,
                variants,
                activeVariantIndex: 0,
                estimatedTokens: estimateTokenCount(winnerText),
              };

              setChats((prev) => {
                const updated = prev.map((c) => {
                  if (c.id !== activeChat.id) return c;
                  const nextMessages = shouldAppendUserMsg
                    ? [...c.messages, newUserMsg, newAssistantMsg]
                    : [...c.messages, newAssistantMsg];
                  return {
                    ...c,
                    messages: nextMessages,
                    updatedAt: Date.now(),
                  };
                });
                saveChats(updated);
                return updated;
              });
              showToast(`Respuesta de ${winnerModelLabel} incorporada al chat`);
            }}
            onShowToast={showToast}
          />
        </ErrorBoundary>
      )}

      {/* Exportador Editorial Profesional (Markdown / DOCX / EPUB) */}
      {isEditorialExportOpen && (
        <ErrorBoundary fallbackTitle="Error en el exportador editorial">
          <EditorialExportModal
            isOpen={isEditorialExportOpen}
            onClose={() => setIsEditorialExportOpen(false)}
            chat={activeChat}
            folder={activeFolder}
            defaultAuthor={settings.userProfile?.nickname || 'Aaron'}
            onShowToast={showToast}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
