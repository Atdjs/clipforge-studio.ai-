import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Play, RefreshCw, Scissors, Upload, X } from 'lucide-react';
import { AllTimelinesStrip } from './components/AllTimelinesStrip';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalysisSettings } from './components/AnalysisSettings';
import { AutoEditToggles } from './components/AutoEditToggles';
import { BrandPanel } from './components/BrandPanel';
import { BulkAdjustDialog, computeAdjustedRange } from './components/BulkAdjustDialog';
import { ClipCard } from './components/ClipCard';
import { ClipInsightsPanel } from './components/ClipInsightsPanel';
import { type CustomClipInput, CustomClipCreator } from './components/CustomClipCreator';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { FeedbackModal } from './components/FeedbackModal';
import { Header } from './components/Header';
import { LandingSections } from './components/LandingSections';
import { LegalPage, type LegalSectionId } from './components/LegalPage';
import { OnboardingTour } from './components/OnboardingTour';
import { PromptMomentsBar } from './components/PromptMomentsBar';
import { ShortcutsModal } from './components/ShortcutsModal';
import { StudioActionBar } from './components/StudioActionBar';
import { ToastHost, type ToastMessage } from './components/ToastHost';
import { type ActiveLinkTarget, UploadZone } from './components/UploadZone';
import { WaveformTimeline } from './components/WaveformTimeline';
import { SAMPLE_VIDEO_CONFIG } from './config/siteContent';
import { useStudioKeyboardShortcuts } from './hooks/useStudioKeyboardShortcuts';
import {
  analyzeVideoForClips,
  analyzeYouTubeForClips,
  deleteRemoteVideoFile,
  fetchDirectVideoUrlInBrowser,
  fetchServerUsage,
  findMomentsViaProxy,
  generateClipMetadataViaProxy,
  scoreClipViaProxy,
  translateClipsCaptions,
  uploadVideoToGemini,
  waitForFileActive,
} from './services/apiClient';
import {
  downloadAllClipsAsZip,
  downloadClipSrt,
  downloadCutClip,
  downloadSceneBreakdownJson,
  shareOrDownloadClip,
} from './services/exportService';
import { clearFFmpegCache, cutClipInBrowser } from './services/ffmpegService';
import {
  clearAllFromIndexedDb,
  clearRecentProjects,
  clearSessionFromIndexedDb,
  loadBrandSettingsFromIndexedDb,
  loadRecentProjects,
  loadSessionFromIndexedDb,
  saveBrandSettingsToIndexedDb,
  saveRecentProjectSummary,
  saveSessionToIndexedDb,
} from './services/persistenceService';
import { inspectLocalVideo } from './services/videoMetadata';
import type {
  AnalysisPhase,
  AppError,
  AutoEditSettings,
  BrandSettings,
  CaptionLanguage,
  CaptionStylePresetId,
  ClipItem,
  ClipSettings,
  ClipSourceMode,
  GeminiFileSession,
  InputMode,
  RecentProjectSummary,
  ServerUsageStatus,
  ThemeMode,
  TranscriptSegment,
  VideoAsset,
} from './types/clip';
import { findOverlappingClipIds } from './utils/format';

const DEFAULT_PAGE_TITLE = 'Clip Cutter — Quietly Precise Video Clipping';
const THEME_STORAGE_KEY = 'clip-cutter-theme';

const DEFAULT_AUTO_EDIT: AutoEditSettings = {
  removeSilences: true,
  burnCaptions: true,
  reframeVertical: true,
  fadeInOut: true,
  normalizeAudio: true,
  captionStyle: 'classic-amber',
};

const DEFAULT_SETTINGS: ClipSettings = {
  clipCount: 5,
  lengthRange: '30-60',
  aspectFormat: 'vertical',
  customPrompt: '',
  captionLanguage: 'English',
  autoEdit: DEFAULT_AUTO_EDIT,
};

const DEFAULT_BRAND: BrandSettings = {
  logoBlob: null,
  logoName: '',
  position: 'bottom-right',
  opacity: 85,
  sizePercent: 15,
  applyToAllClips: false,
};

export default function App() {
  // Theme state synced with <html class="dark"> & localStorage
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Server credit usage & Recent projects
  const [usage, setUsage] = useState<ServerUsageStatus | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectSummary[]>(() =>
    typeof window !== 'undefined' ? loadRecentProjects() : [],
  );

  const refreshUsage = useCallback(async () => {
    const next = await fetchServerUsage();
    if (next) setUsage(next);
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (tone: ToastMessage['tone'], title: string, detail?: string) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, tone, title, detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [],
  );

  const triggerExportSuccessCelebration = useCallback(
    (title: string, detail?: string) => {
      pushToast('success', title, detail);
    },
    [pushToast],
  );

  // Step 1: Input mode ("Upload file" | "Paste link") & local/link sources
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [video, setVideo] = useState<VideoAsset | null>(null);
  const [activeLink, setActiveLink] = useState<ActiveLinkTarget | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [pendingReuseClips, setPendingReuseClips] = useState<ClipItem[]>([]);

  // Step 2: Settings & Brand template
  const [settings, setSettings] = useState<ClipSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef<ClipSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const [brandSettings, setBrandSettings] = useState<BrandSettings>(DEFAULT_BRAND);
  const brandSettingsRef = useRef<BrandSettings>(DEFAULT_BRAND);
  useEffect(() => {
    brandSettingsRef.current = brandSettings;
  }, [brandSettings]);

  const brandLogoUrl = useMemo(() => {
    if (!brandSettings.logoBlob) return null;
    return URL.createObjectURL(brandSettings.logoBlob);
  }, [brandSettings.logoBlob]);

  useEffect(() => {
    return () => {
      if (brandLogoUrl) URL.revokeObjectURL(brandLogoUrl);
    };
  }, [brandLogoUrl]);

  const [autoSaveWhenReady, setAutoSaveWhenReady] = useState(true);
  const autoSaveRef = useRef(true);
  useEffect(() => {
    autoSaveRef.current = autoSaveWhenReady;
  }, [autoSaveWhenReady]);

  // Translation loading/error state
  const [isTranslatingCaptions, setIsTranslatingCaptions] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const translateAbortRef = useRef<AbortController | null>(null);

  // Step 3: Gemini Files API / Link analysis session state
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [analysisMode, setAnalysisMode] = useState<'file' | 'youtube' | 'direct-url'>('file');
  const [fetchProgress, setFetchProgress] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [remoteFileState, setRemoteFileState] = useState('');
  const [geminiSession, setGeminiSession] = useState<GeminiFileSession | null>(null);
  const [analysisError, setAnalysisError] = useState<AppError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Stage 1: Prompt-based moments finder & per-clip metadata generator states
  const [isSearchingMoments, setIsSearchingMoments] = useState(false);
  const [momentSearchError, setMomentSearchError] = useState<string | null>(null);
  const [momentCandidates, setMomentCandidates] = useState<ClipItem[]>([]);
  const [addedCandidateIds, setAddedCandidateIds] = useState<Set<string>>(new Set());
  const [generatingMetaClipIds, setGeneratingMetaClipIds] = useState<Set<string>>(new Set());
  const [scoringClipIds, setScoringClipIds] = useState<Set<string>>(new Set());
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Modals & bottom sheet state
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isMobileSettingsOpen, setIsMobileSettingsOpen] = useState(false);

  // Step 4 & 5: Highlight clips, source mode, bulk dialog, and Web Worker cutting queue
  const [clips, setClips] = useState<ClipItem[]>([]);
  const clipsRef = useRef<ClipItem[]>([]);
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  const [clipSourceMode, setClipSourceMode] = useState<ClipSourceMode>('file');
  const [resultYouTubeId, setResultYouTubeId] = useState<string | undefined>(undefined);
  const [focusedClipId, setFocusedClipId] = useState<string | null>(null);
  const [clipPendingDelete, setClipPendingDelete] = useState<ClipItem | null>(null);
  const playToggleMapRef = useRef<Map<string, () => void>>(new Map());
  const [showAllTimelines, setShowAllTimelines] = useState(false);
  const [isBulkAdjustOpen, setIsBulkAdjustOpen] = useState(false);
  const [isCuttingAll, setIsCuttingAll] = useState(false);
  const isCuttingRef = useRef(false);
  const [globalFfmpegError, setGlobalFfmpegError] = useState<string | null>(null);

  // Record project summary into recent projects when clips exist
  useEffect(() => {
    if (clips.length === 0) return;
    const projectName =
      clipSourceMode === 'youtube'
        ? resultYouTubeId
          ? `YouTube (${resultYouTubeId})`
          : activeLink?.canonicalUrl || 'YouTube Project'
        : video?.name || 'Local Video Project';

    const readyCount = clips.filter((c) => c.cutStatus === 'done' && c.outputBlob).length;
    const avgScore = Math.round(
      clips.reduce((acc, c) => acc + (c.virality_score ?? 75), 0) / clips.length,
    );

    const updated = saveRecentProjectSummary({
      id: `${clipSourceMode}-${resultYouTubeId || video?.name || 'project'}`,
      name: projectName,
      updatedAt: Date.now(),
      clipCount: clips.length,
      cutCount: readyCount,
      avgViralityScore: avgScore,
      sourceMode: clipSourceMode,
    });
    if (updated.length > 0) setRecentProjects(updated);
  }, [clips, clipSourceMode, resultYouTubeId, activeLink?.canonicalUrl, video?.name]);

  // Legal page navigation synced with URL hash
  const parseLegalHash = (): { open: boolean; section: LegalSectionId } => {
    if (typeof window === 'undefined') return { open: false, section: 'terms' };
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'legal') return { open: true, section: 'terms' };
    if (hash.startsWith('legal/')) {
      const sub = hash.slice('legal/'.length) as LegalSectionId;
      if (['terms', 'privacy', 'ai', 'copyright', 'contact'].includes(sub)) {
        return { open: true, section: sub };
      }
      return { open: true, section: 'terms' };
    }
    return { open: false, section: 'terms' };
  };

  const initialLegal = parseLegalHash();
  const [isLegalOpen, setIsLegalOpen] = useState<boolean>(initialLegal.open);
  const [legalSection, setLegalSection] = useState<LegalSectionId>(initialLegal.section);

  const openLegalPage = useCallback((section: LegalSectionId = 'terms') => {
    setLegalSection(section);
    setIsLegalOpen(true);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#legal/${section}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const closeLegalPage = useCallback(() => {
    setIsLegalOpen(false);
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#legal')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseLegalHash();
      setIsLegalOpen(parsed.open);
      if (parsed.open) {
        setLegalSection(parsed.section);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Reload recovery & Resume banner state
  const [hasHydratedDb, setHasHydratedDb] = useState(false);
  const [hasHydratedBrand, setHasHydratedBrand] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Screen Wake Lock ref
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Step 6: ZIP packaging state
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const isAnalyzing =
    phase === 'fetching-url' ||
    phase === 'uploading' ||
    phase === 'processing' ||
    phase === 'analyzing';
  const isCuttingAny = isCuttingAll || clips.some((c) => c.cutStatus === 'cutting');
  useEffect(() => {
    isCuttingRef.current = isCuttingAny;
  }, [isCuttingAny]);

  useEffect(() => {
    if (clips.length === 0) {
      if (focusedClipId !== null) setFocusedClipId(null);
      return;
    }
    if (!focusedClipId || !clips.some((c) => c.id === focusedClipId)) {
      setFocusedClipId(clips[0].id);
    }
  }, [clips, focusedClipId]);

  const focusedClipIndex = useMemo(
    () => Math.max(0, clips.findIndex((c) => c.id === focusedClipId)),
    [clips, focusedClipId],
  );
  const focusedClip = clips[focusedClipIndex] || null;

  const registerPlayToggle = useCallback((clipId: string, toggleFn: (() => void) | null) => {
    if (toggleFn) {
      playToggleMapRef.current.set(clipId, toggleFn);
    } else {
      playToggleMapRef.current.delete(clipId);
    }
  }, []);

  const cutCount = clips.filter((c) => c.cutStatus === 'done' && c.outputBlob).length;
  const overlappingIds = useMemo(() => findOverlappingClipIds(clips), [clips]);

  const timelineTotalDuration = useMemo(() => {
    if (clipSourceMode === 'file' && video?.durationSeconds) {
      return video.durationSeconds;
    }
    return clips.reduce((max, c) => Math.max(max, c.end_seconds), 60);
  }, [clipSourceMode, video?.durationSeconds, clips]);

  const revokeClipUrls = (items: ClipItem[]) => {
    items.forEach((item) => {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    });
  };

  // Wake Lock helpers
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        if (wakeLockRef.current && !wakeLockRef.current.released) return;
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Ignored cleanly
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        await wakeLockRef.current.release();
      }
      wakeLockRef.current = null;
    } catch {
      wakeLockRef.current = null;
    }
  };

  const requestNotificationPermissionOnce = () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    } catch {
      // Ignore
    }
  };

  const notifyBackgroundCompletion = (finishedCount: number) => {
    if (document.visibilityState === 'hidden') {
      document.title = 'Clips ready — Clip Cutter';
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Clips ready — Clip Cutter', {
            body: `${finishedCount} video clip${finishedCount === 1 ? '' : 's'} finished cutting and are ready to save.`,
          });
        }
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (document.title === 'Clips ready — Clip Cutter') {
          document.title = DEFAULT_PAGE_TITLE;
        }
        if (isCuttingRef.current) {
          void requestWakeLock();
        }
        setClips((prev) => [...prev]);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, []);

  // IndexedDB Hydrate on startup
  useEffect(() => {
    let active = true;

    (async () => {
      const [saved, savedBrand] = await Promise.all([
        loadSessionFromIndexedDb(),
        loadBrandSettingsFromIndexedDb(),
      ]);

      if (active && savedBrand) {
        setBrandSettings({ ...DEFAULT_BRAND, ...savedBrand });
      }
      if (active) setHasHydratedBrand(true);

      if (!active || !saved) {
        if (active) setHasHydratedDb(true);
        return;
      }

      if (saved.clips.length > 0 || saved.sourceFile || saved.activeLink) {
        const mergedAutoEdit: AutoEditSettings = {
          ...DEFAULT_AUTO_EDIT,
          ...saved.settings?.autoEdit,
        };
        setSettings({
          ...DEFAULT_SETTINGS,
          ...saved.settings,
          aspectFormat: mergedAutoEdit.reframeVertical
            ? 'vertical'
            : saved.settings?.aspectFormat || 'original',
          autoEdit: mergedAutoEdit,
        });
        setAutoSaveWhenReady(saved.autoSaveWhenReady);
        setInputMode(saved.inputMode);
        setClipSourceMode(saved.clipSourceMode);
        setActiveLink(saved.activeLink ?? null);
        setResultYouTubeId(saved.youtubeVideoId);
        setGeminiSession(saved.geminiSession ?? null);

        if (saved.sourceFile) {
          try {
            const inspected = await inspectLocalVideo(saved.sourceFile);
            if (active) setVideo(inspected);
          } catch {
            // File may no longer be readable
          }
        }

        const restoredClips: ClipItem[] = saved.clips.map((c) => {
          const isFinished = c.cutStatus === 'done' && Boolean(c.outputBlob);
          return {
            id: c.id,
            start_seconds: c.start_seconds,
            end_seconds: c.end_seconds,
            title: c.title,
            hook_reason: c.hook_reason,
            caption_text: c.caption_text,
            speaker_x_ratio: c.speaker_x_ratio,
            virality_score: c.virality_score,
            virality_reason: c.virality_reason,
            sub_scores: c.sub_scores,
            hook_line: c.hook_line,
            hook_start_seconds: c.hook_start_seconds,
            hook_end_seconds: c.hook_end_seconds,
            addHookTitleCard: c.addHookTitleCard,
            hookMovedToStart: c.hookMovedToStart,
            description: c.description,
            hashtags: c.hashtags,
            suggestedTitles: c.suggestedTitles,
            transcript: c.transcript || [],
            captionLanguage: c.captionLanguage,
            removeSilencesAndFillers:
              typeof c.removeSilencesAndFillers === 'boolean'
                ? c.removeSilencesAndFillers
                : mergedAutoEdit.removeSilences,
            removedSeconds: c.removedSeconds,
            autoEditApplied: c.autoEditApplied,
            cutStatus: isFinished ? 'done' : c.cutStatus === 'error' ? 'error' : 'idle',
            cutProgress: isFinished ? 100 : 0,
            cutError: c.cutError,
            outputBlob: isFinished ? c.outputBlob : undefined,
            outputUrl: isFinished && c.outputBlob ? URL.createObjectURL(c.outputBlob) : undefined,
          };
        });

        if (active) {
          setClips(restoredClips);
          if (restoredClips.length > 0) {
            setPhase('ready');
            setShowResumeBanner(true);
          }
        }
      }

      if (active) setHasHydratedDb(true);
    })();

    return () => {
      active = false;
      if (video?.objectUrl) URL.revokeObjectURL(video.objectUrl);
      clipsRef.current.forEach((c) => {
        if (c.outputUrl) URL.revokeObjectURL(c.outputUrl);
      });
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedBrand) return;
    void saveBrandSettingsToIndexedDb(brandSettings);
  }, [brandSettings, hasHydratedBrand]);

  const persistenceSignature = useMemo(() => {
    return JSON.stringify({
      inputMode,
      clipSourceMode,
      settings,
      autoSaveWhenReady,
      videoName: video?.name,
      videoSize: video?.sizeBytes,
      linkUrl: activeLink?.canonicalUrl,
      ytId: resultYouTubeId,
      clipsMeta: clips.map((c) => ({
        id: c.id,
        s: c.start_seconds,
        e: c.end_seconds,
        t: c.title,
        cap: c.caption_text,
        lang: c.captionLanguage,
        sil: c.removeSilencesAndFillers,
        rem: c.removedSeconds,
        ae: c.autoEditApplied,
        st: c.cutStatus,
        hc: c.addHookTitleCard,
        hm: c.hookMovedToStart,
        desc: c.description,
        tags: c.hashtags,
        hasBlob: Boolean(c.outputBlob),
      })),
    });
  }, [
    inputMode,
    clipSourceMode,
    settings,
    autoSaveWhenReady,
    video?.name,
    video?.sizeBytes,
    activeLink?.canonicalUrl,
    resultYouTubeId,
    clips,
  ]);

  useEffect(() => {
    if (!hasHydratedDb) return;
    void saveSessionToIndexedDb({
      updatedAt: Date.now(),
      inputMode,
      clipSourceMode,
      settings,
      autoSaveWhenReady,
      sourceFile: video?.file ?? null,
      activeLink,
      youtubeVideoId: resultYouTubeId,
      geminiSession,
      clips: clips.map((c) => ({
        id: c.id,
        start_seconds: c.start_seconds,
        end_seconds: c.end_seconds,
        title: c.title,
        hook_reason: c.hook_reason,
        caption_text: c.caption_text,
        speaker_x_ratio: c.speaker_x_ratio,
        virality_score: c.virality_score,
        virality_reason: c.virality_reason,
        sub_scores: c.sub_scores,
        hook_line: c.hook_line,
        hook_start_seconds: c.hook_start_seconds,
        hook_end_seconds: c.hook_end_seconds,
        addHookTitleCard: c.addHookTitleCard,
        hookMovedToStart: c.hookMovedToStart,
        description: c.description,
        hashtags: c.hashtags,
        suggestedTitles: c.suggestedTitles,
        transcript: c.transcript,
        captionLanguage: c.captionLanguage,
        removeSilencesAndFillers: c.removeSilencesAndFillers,
        removedSeconds: c.removedSeconds,
        autoEditApplied: c.autoEditApplied,
        cutStatus: c.cutStatus,
        cutProgress: c.cutProgress,
        cutError: c.cutError,
        outputBlob: c.outputBlob,
      })),
    });
  }, [persistenceSignature, hasHydratedDb]);

  // Sequential Web Worker Cutting Queue
  const cutClipListSequentially = async (sourceVideo: VideoAsset, targetClips: ClipItem[]) => {
    const pending = targetClips.filter((c) => c.cutStatus !== 'done');
    if (pending.length === 0) return;

    setIsCuttingAll(true);
    setGlobalFfmpegError(null);
    setShowResumeBanner(false);
    void requestWakeLock();

    setClips((prev) =>
      prev.map((c) =>
        c.cutStatus !== 'done'
          ? {
              ...c,
              cutStatus: 'queued',
              cutProgress: 0,
              cutStageLabel: 'Queued in background worker',
              cutError: undefined,
            }
          : c,
      ),
    );

    let successCount = 0;

    for (const clip of pending) {
      const currentList = clipsRef.current;
      const clipIndex = Math.max(
        0,
        currentList.findIndex((item) => item.id === clip.id),
      );
      const latestClip = currentList[clipIndex] || clip;

      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                cutStatus: 'cutting',
                cutProgress: 1,
                cutStageLabel: latestClip.removeSilencesAndFillers
                  ? 'Detecting silences...'
                  : 'Cutting in worker',
                cutError: undefined,
              }
            : c,
        ),
      );

      try {
        const currentAutoEdit = settingsRef.current.autoEdit;
        const appliedAutoEdit: AutoEditSettings = {
          ...currentAutoEdit,
          removeSilences:
            typeof latestClip.removeSilencesAndFillers === 'boolean'
              ? latestClip.removeSilencesAndFillers
              : currentAutoEdit.removeSilences,
        };

        const result = await cutClipInBrowser({
          sourceFile: sourceVideo.file,
          sourceWidth: sourceVideo.width,
          clip: latestClip,
          autoEdit: currentAutoEdit,
          brandSettings: brandSettingsRef.current,
          onProgress: (pct, stage) => {
            setClips((prev) =>
              prev.map((c) =>
                c.id === clip.id
                  ? { ...c, cutProgress: pct, cutStageLabel: stage || c.cutStageLabel }
                  : c,
              ),
            );
          },
        });

        const url = URL.createObjectURL(result.blob);
        const finishedClip: ClipItem = {
          ...latestClip,
          cutStatus: 'done',
          cutProgress: 100,
          cutStageLabel: undefined,
          removedSeconds: result.removedSeconds,
          autoEditApplied: appliedAutoEdit,
          outputBlob: result.blob,
          outputUrl: url,
          cutError: undefined,
        };

        setClips((prev) =>
          prev.map((c) => {
            if (c.id !== clip.id) return c;
            if (c.outputUrl) URL.revokeObjectURL(c.outputUrl);
            return finishedClip;
          }),
        );

        successCount += 1;

        if (autoSaveRef.current) {
          downloadCutClip(finishedClip, clipIndex);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Browser cutting failed for this clip.';
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id
              ? {
                  ...c,
                  cutStatus: 'error',
                  cutProgress: 0,
                  cutStageLabel: undefined,
                  cutError: msg,
                }
              : c,
          ),
        );
        if (msg.toLowerCase().includes('worker')) {
          setGlobalFfmpegError(msg);
        }
      }
    }

    setIsCuttingAll(false);
    void releaseWakeLock();

    if (successCount > 0) {
      triggerExportSuccessCelebration(
        `${successCount} clip${successCount === 1 ? '' : 's'} exported cleanly`,
        autoSaveRef.current ? 'Saved to your Downloads folder.' : 'Ready to download in the studio.',
      );
      const totalDone = clipsRef.current.filter((c) => c.cutStatus === 'done').length;
      if (totalDone === clipsRef.current.length) {
        notifyBackgroundCompletion(totalDone);
      }
    }
  };

  // Flow 1: File & Link selection
  const handleSelectFile = async (file: File) => {
    setSelectionError(null);
    setGlobalFfmpegError(null);
    setShowResumeBanner(false);
    setMomentCandidates([]);
    setAddedCandidateIds(new Set());

    try {
      const inspected = await inspectLocalVideo(file);

      if (video?.objectUrl) URL.revokeObjectURL(video.objectUrl);
      if (geminiSession?.name) void deleteRemoteVideoFile(geminiSession.name);
      revokeClipUrls(clips);
      clearFFmpegCache();

      setVideo(inspected);
      setGeminiSession(null);
      setAnalysisError(null);
      setTranslationError(null);

      if (pendingReuseClips.length > 0) {
        const maxDur = Math.floor(inspected.durationSeconds);
        const clampedClips: ClipItem[] = pendingReuseClips
          .map((clip, i) => {
            const start = Math.max(
              0,
              Math.min(Math.max(0, maxDur - 1), Math.round(clip.start_seconds)),
            );
            const end = Math.max(start + 1, Math.min(maxDur, Math.round(clip.end_seconds)));
            return {
              ...clip,
              id: `clip-${Date.now()}-${i}`,
              start_seconds: start,
              end_seconds: end,
              cutStatus: 'idle' as const,
              cutProgress: 0,
              outputBlob: undefined,
              outputUrl: undefined,
              cutError: undefined,
            };
          })
          .filter((c) => c.end_seconds - c.start_seconds >= 1);

        setPendingReuseClips([]);
        setClipSourceMode('file');
        setResultYouTubeId(undefined);
        setClips(clampedClips);
        setPhase('ready');

        if (clampedClips.length > 0) {
          void cutClipListSequentially(inspected, clampedClips);
        }
      } else {
        setClips([]);
        setPhase('idle');
      }
    } catch (err) {
      setSelectionError(
        err instanceof Error ? err.message : 'Unable to read the selected video file.',
      );
    }
  };

  const handleLoadSampleVideo = async () => {
    if (isLoadingSample || isAnalyzing || isCuttingAny) return;
    setSelectionError(null);
    setIsLoadingSample(true);
    try {
      const res = await fetch(SAMPLE_VIDEO_CONFIG.url);
      if (!res.ok) {
        throw new Error(`Sample video unavailable (HTTP ${res.status}).`);
      }
      const blob = await res.blob();
      const sampleFile = new File([blob], SAMPLE_VIDEO_CONFIG.fileName, {
        type: blob.type || 'video/mp4',
      });
      setInputMode('file');
      await handleSelectFile(sampleFile);
      pushToast('info', 'Sample video loaded', 'Pick settings or cut any range right away.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load sample video.';
      setSelectionError(message);
      pushToast('error', 'Could not load sample video', message);
    } finally {
      setIsLoadingSample(false);
    }
  };

  const handleClearVideo = () => {
    abortControllerRef.current?.abort();
    translateAbortRef.current?.abort();
    if (video?.objectUrl) URL.revokeObjectURL(video.objectUrl);
    if (geminiSession?.name) void deleteRemoteVideoFile(geminiSession.name);
    revokeClipUrls(clips);
    clearFFmpegCache();
    void clearSessionFromIndexedDb();
    void releaseWakeLock();
    document.title = DEFAULT_PAGE_TITLE;

    setVideo(null);
    setActiveLink(null);
    setPendingReuseClips([]);
    setGeminiSession(null);
    setClips([]);
    setMomentCandidates([]);
    setAddedCandidateIds(new Set());
    setMomentSearchError(null);
    setResultYouTubeId(undefined);
    setPhase('idle');
    setAnalysisError(null);
    setTranslationError(null);
    setGlobalFfmpegError(null);
    setShowResumeBanner(false);
  };

  const handleSelectLink = (target: ActiveLinkTarget) => {
    setSelectionError(null);
    setAnalysisError(null);
    setTranslationError(null);
    setGlobalFfmpegError(null);
    setPendingReuseClips([]);
    setMomentCandidates([]);
    setAddedCandidateIds(new Set());
    setShowResumeBanner(false);
    setActiveLink(target);
    setPhase('idle');
  };

  const handleClearLink = () => {
    abortControllerRef.current?.abort();
    translateAbortRef.current?.abort();
    setActiveLink(null);
    if (clipSourceMode === 'youtube') {
      setClips([]);
      setResultYouTubeId(undefined);
    }
    setPhase('idle');
    setAnalysisError(null);
    setTranslationError(null);
  };

  const handleSettingsChange = (next: ClipSettings) => {
    const syncedNext: ClipSettings =
      next.aspectFormat !== settings.aspectFormat
        ? {
            ...next,
            autoEdit: {
              ...next.autoEdit,
              reframeVertical: next.aspectFormat === 'vertical',
            },
          }
        : next;
    setSettings(syncedNext);
  };

  const handleToggleAutoEdit = (
    key: 'removeSilences' | 'burnCaptions' | 'reframeVertical' | 'fadeInOut' | 'normalizeAudio',
  ) => {
    setSettings((prev) => {
      const nextVal = !prev.autoEdit[key];
      const nextAutoEdit: AutoEditSettings = {
        ...prev.autoEdit,
        [key]: nextVal,
      };
      const nextAspect =
        key === 'reframeVertical' ? (nextVal ? 'vertical' : 'original') : prev.aspectFormat;

      if (key === 'removeSilences') {
        setClips((currClips) =>
          currClips.map((c) =>
            c.cutStatus !== 'done' ? { ...c, removeSilencesAndFillers: nextVal } : c,
          ),
        );
      }

      return {
        ...prev,
        aspectFormat: nextAspect,
        autoEdit: nextAutoEdit,
      };
    });
  };

  const handleSelectCaptionPreset = (captionStyle: CaptionStylePresetId) => {
    setSettings((prev) => ({
      ...prev,
      autoEdit: {
        ...prev.autoEdit,
        captionStyle,
      },
    }));
    pushToast('info', 'Caption preset updated', 'Tap Re-edit or Cut & Edit to burn the new look.');
  };

  const runCaptionTranslation = async (targetLanguage: CaptionLanguage) => {
    if (clipsRef.current.length === 0) return;
    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;

    setIsTranslatingCaptions(true);
    setTranslationError(null);

    try {
      const translated = await translateClipsCaptions(
        clipsRef.current,
        targetLanguage,
        controller.signal,
      );
      setClips(translated);
      void refreshUsage();
      pushToast('success', `Translated captions to ${targetLanguage}`);
    } catch (err) {
      const appErr = err as AppError;
      if (appErr?.code !== 'CANCELLED') {
        setTranslationError(
          appErr?.message || 'Could not translate clip captions. Please retry.',
        );
      }
    } finally {
      setIsTranslatingCaptions(false);
    }
  };

  const handleChangeCaptionLanguage = (nextLang: CaptionLanguage) => {
    setSettings((prev) => ({ ...prev, captionLanguage: nextLang }));
    setTranslationError(null);
    if (clips.length > 0) {
      void runCaptionTranslation(nextLang);
    }
  };

  // Flow 3: Analyze video via proxy
  const runAnalysis = async (forceReupload = false) => {
    requestNotificationPermissionOnce();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalysisError(null);
    setTranslationError(null);
    setGlobalFfmpegError(null);
    setShowResumeBanner(false);
    setFetchProgress(null);
    setUploadProgress(0);
    setRemoteFileState('');

    try {
      if (inputMode === 'link' && activeLink?.kind === 'youtube') {
        setAnalysisMode('youtube');
        setPhase('analyzing');

        const generatedClips = await analyzeYouTubeForClips(
          {
            youtubeUrl: activeLink.canonicalUrl,
            settings,
          },
          controller.signal,
        );

        revokeClipUrls(clips);
        setClipSourceMode('youtube');
        setResultYouTubeId(activeLink.youtubeVideoId);
        setClips(generatedClips);
        setPhase('ready');
        void refreshUsage();
        pushToast('success', `Found ${generatedClips.length} scored highlights`);
        return;
      }

      let targetVideo = video;
      if (inputMode === 'link' && activeLink?.kind === 'direct') {
        setAnalysisMode('direct-url');
        setPhase('fetching-url');

        const fetchedFile = await fetchDirectVideoUrlInBrowser(
          activeLink.canonicalUrl,
          (pct) => setFetchProgress(pct),
          controller.signal,
        );

        const inspected = await inspectLocalVideo(fetchedFile);
        if (video?.objectUrl) URL.revokeObjectURL(video.objectUrl);
        if (geminiSession?.name) void deleteRemoteVideoFile(geminiSession.name);
        clearFFmpegCache();

        targetVideo = inspected;
        setVideo(inspected);
        setGeminiSession(null);
      } else {
        setAnalysisMode('file');
      }

      if (!targetVideo) return;

      let activeSession = forceReupload ? null : geminiSession;

      if (!activeSession) {
        setPhase('uploading');
        const uploaded = await uploadVideoToGemini(
          targetVideo.file,
          (pct) => setUploadProgress(pct),
          controller.signal,
        );

        setPhase('processing');
        setRemoteFileState(uploaded.state);

        if (uploaded.state === 'ACTIVE') {
          activeSession = {
            name: uploaded.name,
            uri: uploaded.uri,
            mimeType: uploaded.mimeType,
          };
        } else {
          activeSession = await waitForFileActive(
            uploaded.name,
            (state) => setRemoteFileState(state),
            controller.signal,
          );
        }

        setGeminiSession(activeSession);
      }

      setPhase('analyzing');
      let generatedClips: ClipItem[];

      try {
        generatedClips = await analyzeVideoForClips(
          {
            session: activeSession,
            durationSeconds: targetVideo.durationSeconds,
            settings,
          },
          controller.signal,
        );
      } catch (err) {
        const appErr = err as AppError;
        if (appErr?.code === 'FILE_EXPIRED' && !forceReupload) {
          setGeminiSession(null);
          await runAnalysis(true);
          return;
        }
        throw err;
      }

      revokeClipUrls(clips);
      setClipSourceMode('file');
      setResultYouTubeId(undefined);
      setClips(generatedClips);
      setPhase('ready');
      void refreshUsage();
      pushToast('success', `Found ${generatedClips.length} viral clips with hooks & scores`);
    } catch (err) {
      const appErr = err as AppError;
      if (appErr?.code === 'CANCELLED') {
        setPhase(clips.length > 0 ? 'ready' : 'idle');
        return;
      }

      setAnalysisError({
        stage: appErr?.stage || 'analyze',
        code: appErr?.code || 'API_ERROR',
        message:
          appErr?.message || 'Something went wrong while analyzing your video. Please retry.',
        retryable: appErr?.retryable !== false,
      });
      setPhase('error');
    }
  };

  const handleCancelAnalysis = () => {
    abortControllerRef.current?.abort();
  };

  // Stage 1: Prompt-based moment search across video/transcript
  const handleSearchPromptMoments = async (promptText: string) => {
    setMomentSearchError(null);
    setIsSearchingMoments(true);

    const combinedTranscript: TranscriptSegment[] = clips
      .flatMap((c) => c.transcript || [])
      .sort((a, b) => a.start_seconds - b.start_seconds);

    try {
      const res = await findMomentsViaProxy({
        customPrompt: promptText,
        transcript: combinedTranscript.length > 0 ? combinedTranscript : undefined,
        session: clipSourceMode === 'file' ? geminiSession : undefined,
        youtubeUrl:
          clipSourceMode === 'youtube' && activeLink?.kind === 'youtube'
            ? activeLink.canonicalUrl
            : undefined,
        durationSeconds: clipSourceMode === 'file' ? video?.durationSeconds : undefined,
        settings,
        clipCount: 5,
      });

      setMomentCandidates(res.clips);
      setAddedCandidateIds(new Set());
      if (res.usage) setUsage(res.usage);
      if (res.clips.length === 0) {
        pushToast('info', 'No matching moments found', 'Try broadening your search prompt.');
      }
    } catch (err) {
      const appErr = err as AppError;
      setMomentSearchError(appErr?.message || 'Could not find matching moments.');
    } finally {
      setIsSearchingMoments(false);
    }
  };

  const handleAddCandidateMoment = (cand: ClipItem) => {
    const newId = `clip-moment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const maxDur = clipSourceMode === 'file' && video?.durationSeconds ? Math.floor(video.durationSeconds) : undefined;
    const start = Math.max(0, Math.round(cand.start_seconds));
    const end = maxDur
      ? Math.min(maxDur, Math.max(start + 1, Math.round(cand.end_seconds)))
      : Math.max(start + 1, Math.round(cand.end_seconds));

    setClips((prev) => [...prev, { ...cand, id: newId, start_seconds: start, end_seconds: end }]);
    setAddedCandidateIds((prev) => new Set(prev).add(cand.id));
    setFocusedClipId(newId);
    pushToast('success', 'Added moment to clip list', cand.title);
  };

  const handleAddAllCandidateMoments = () => {
    const unadded = momentCandidates.filter((c) => !addedCandidateIds.has(c.id));
    if (unadded.length === 0) return;

    const maxDur = clipSourceMode === 'file' && video?.durationSeconds ? Math.floor(video.durationSeconds) : undefined;
    const mapped = unadded.map((cand, idx) => {
      const start = Math.max(0, Math.round(cand.start_seconds));
      const end = maxDur
        ? Math.min(maxDur, Math.max(start + 1, Math.round(cand.end_seconds)))
        : Math.max(start + 1, Math.round(cand.end_seconds));
      return {
        ...cand,
        id: `clip-moment-${Date.now()}-${idx}`,
        start_seconds: start,
        end_seconds: end,
      };
    });

    setClips((prev) => [...prev, ...mapped]);
    setAddedCandidateIds(new Set(momentCandidates.map((c) => c.id)));
    if (mapped[0]) setFocusedClipId(mapped[0].id);
    pushToast('success', `Added ${mapped.length} moments to studio`);
  };

  // Stage 1: Generate fresh Titles, Description & Hashtags on a clip
  const handleGenerateClipMetadata = async (
    clipId: string,
    platform: 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'general',
  ) => {
    const target = clipsRef.current.find((c) => c.id === clipId);
    if (!target) return;

    setGeneratingMetaClipIds((prev) => new Set(prev).add(clipId));
    try {
      const res = await generateClipMetadataViaProxy({
        clip: target,
        targetLanguage: settings.captionLanguage,
        platform,
      });

      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? {
                ...c,
                suggestedTitles: res.titles,
                description: res.description || c.description,
                hashtags: res.hashtags.length > 0 ? res.hashtags : c.hashtags,
              }
            : c,
        ),
      );
      if (res.usage) setUsage(res.usage);
      pushToast('success', 'Generated viral copy & hashtags');
    } catch (err) {
      const appErr = err as AppError;
      pushToast('error', 'Metadata generation failed', appErr?.message);
    } finally {
      setGeneratingMetaClipIds((prev) => {
        const next = new Set(prev);
        next.delete(clipId);
        return next;
      });
    }
  };

  const handleScoreClip = async (clipId: string) => {
    const target = clipsRef.current.find((c) => c.id === clipId);
    if (!target) return;

    setScoringClipIds((prev) => new Set(prev).add(clipId));
    try {
      const res = await scoreClipViaProxy(target);
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId
            ? {
                ...c,
                virality_score: res.virality_score,
                virality_reason: res.virality_reason || c.virality_reason,
                sub_scores: res.sub_scores,
              }
            : c,
        ),
      );
      if (res.usage) setUsage(res.usage);
      pushToast('success', `Virality score updated: ${res.virality_score}/100`);
    } catch (err) {
      const appErr = err as AppError;
      pushToast('error', 'Virality scoring failed', appErr?.message);
    } finally {
      setScoringClipIds((prev) => {
        const next = new Set(prev);
        next.delete(clipId);
        return next;
      });
    }
  };

  // Stage 1: Move hook to start & Toggle hook title card
  const handleMoveHookToStart = (clipId: string) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId) return clip;
        const targetStart =
          typeof clip.hook_start_seconds === 'number'
            ? Math.max(0, Math.min(clip.end_seconds - 1, Math.floor(clip.hook_start_seconds)))
            : clip.start_seconds;
        if (clip.outputUrl) URL.revokeObjectURL(clip.outputUrl);
        return {
          ...clip,
          start_seconds: targetStart,
          hookMovedToStart: true,
          cutStatus: 'idle',
          cutProgress: 0,
          outputBlob: undefined,
          outputUrl: undefined,
          cutError: undefined,
        };
      }),
    );
    pushToast('info', 'Moved opening hook to clip start', 'Tap Cut & Edit to export with the new start.');
  };

  const handleToggleHookTitleCard = (clipId: string, nextValue: boolean) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId) return clip;
        if (clip.outputUrl) URL.revokeObjectURL(clip.outputUrl);
        return {
          ...clip,
          addHookTitleCard: nextValue,
          cutStatus: clip.cutStatus === 'done' ? 'idle' : clip.cutStatus,
          cutProgress: clip.cutStatus === 'done' ? 0 : clip.cutProgress,
          outputBlob: undefined,
          outputUrl: undefined,
        };
      }),
    );
  };

  // Flow 4: Clip editing handlers
  const handleUpdateClipTitle = (clipId: string, title: string) => {
    setClips((prev) =>
      prev.map((clip) => (clip.id === clipId ? { ...clip, title } : clip)),
    );
  };

  const handleUpdateClipTimes = (clipId: string, startSeconds: number, endSeconds: number) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId) return clip;
        if (clip.outputUrl) URL.revokeObjectURL(clip.outputUrl);
        return {
          ...clip,
          start_seconds: startSeconds,
          end_seconds: endSeconds,
          cutStatus: 'idle',
          cutProgress: 0,
          cutStageLabel: undefined,
          removedSeconds: undefined,
          outputBlob: undefined,
          outputUrl: undefined,
          cutError: undefined,
        };
      }),
    );
  };

  const handleToggleRemoveSilences = (clipId: string, nextValue: boolean) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId) return clip;
        if (clip.outputUrl) URL.revokeObjectURL(clip.outputUrl);
        return {
          ...clip,
          removeSilencesAndFillers: nextValue,
          cutStatus: 'idle',
          cutProgress: 0,
          cutStageLabel: undefined,
          removedSeconds: undefined,
          outputBlob: undefined,
          outputUrl: undefined,
          cutError: undefined,
        };
      }),
    );
  };

  const handleBulkAdjustTimings = (startDelta: number, endDelta: number) => {
    const maxDur = clipSourceMode === 'file' ? video?.durationSeconds : undefined;
    revokeClipUrls(clips);
    setClips((prev) =>
      prev.map((clip) => {
        const adjusted = computeAdjustedRange(clip, startDelta, endDelta, maxDur);
        return {
          ...clip,
          start_seconds: adjusted.start,
          end_seconds: adjusted.end,
          cutStatus: 'idle',
          cutProgress: 0,
          cutStageLabel: undefined,
          removedSeconds: undefined,
          outputBlob: undefined,
          outputUrl: undefined,
          cutError: undefined,
        };
      }),
    );
  };

  const handleRequestDeleteClip = useCallback((clipId: string) => {
    const target = clipsRef.current.find((c) => c.id === clipId);
    if (!target || target.cutStatus === 'cutting' || target.cutStatus === 'queued') return;
    setClipPendingDelete(target);
  }, []);

  const handleConfirmDeleteClip = useCallback((clipId: string) => {
    setClipPendingDelete(null);
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === clipId);
      const target = idx >= 0 ? prev[idx] : undefined;
      if (target?.outputUrl) URL.revokeObjectURL(target.outputUrl);
      const next = prev.filter((c) => c.id !== clipId);
      setFocusedClipId((curr) => {
        if (curr !== clipId) return curr;
        return next[idx]?.id || next[idx - 1]?.id || next[0]?.id || null;
      });
      return next;
    });
  }, []);

  const handleCutYouTubeClipsFromFile = () => {
    setPendingReuseClips(clips);
    setClips([]);
    setResultYouTubeId(undefined);
    setPhase('idle');
    setAnalysisError(null);
    setShowResumeBanner(false);
    setInputMode('file');

    if (video?.objectUrl) {
      URL.revokeObjectURL(video.objectUrl);
      setVideo(null);
    }
    if (geminiSession?.name) {
      void deleteRemoteVideoFile(geminiSession.name);
      setGeminiSession(null);
    }
  };

  // Flow 5: Cut & Auto-Edit single clip
  const runCutSingleClipObject = async (
    target: ClipItem,
    targetIndex: number,
    sourceVideo: VideoAsset,
  ) => {
    setGlobalFfmpegError(null);
    void requestWakeLock();

    const currentAutoEdit = settingsRef.current.autoEdit;
    const appliedAutoEdit: AutoEditSettings = {
      ...currentAutoEdit,
      removeSilences:
        typeof target.removeSilencesAndFillers === 'boolean'
          ? target.removeSilencesAndFillers
          : currentAutoEdit.removeSilences,
    };

    setClips((prev) =>
      prev.map((c) =>
        c.id === target.id
          ? {
              ...c,
              cutStatus: 'cutting',
              cutProgress: 1,
              cutStageLabel: appliedAutoEdit.removeSilences
                ? 'Detecting silences...'
                : 'Cutting & auto-editing...',
              cutError: undefined,
            }
          : c,
      ),
    );

    try {
      const result = await cutClipInBrowser({
        sourceFile: sourceVideo.file,
        sourceWidth: sourceVideo.width,
        clip: target,
        autoEdit: currentAutoEdit,
        brandSettings: brandSettingsRef.current,
        onProgress: (pct, stage) => {
          setClips((prev) =>
            prev.map((c) =>
              c.id === target.id
                ? { ...c, cutProgress: pct, cutStageLabel: stage || c.cutStageLabel }
                : c,
            ),
          );
        },
      });

      const url = URL.createObjectURL(result.blob);
      const finishedClip: ClipItem = {
        ...target,
        cutStatus: 'done',
        cutProgress: 100,
        cutStageLabel: undefined,
        removedSeconds: result.removedSeconds,
        autoEditApplied: appliedAutoEdit,
        outputBlob: result.blob,
        outputUrl: url,
        cutError: undefined,
      };

      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== target.id) return c;
          if (c.outputUrl) URL.revokeObjectURL(c.outputUrl);
          return finishedClip;
        }),
      );

      if (autoSaveRef.current) {
        downloadCutClip(finishedClip, targetIndex);
      }

      triggerExportSuccessCelebration(
        `"${finishedClip.title}" is ready`,
        autoSaveRef.current ? 'Downloaded to your device.' : 'Preview and download on the card.',
      );

      const totalDone = clipsRef.current.filter(
        (c) => c.id === target.id || c.cutStatus === 'done',
      ).length;
      if (totalDone === clipsRef.current.length) {
        notifyBackgroundCompletion(totalDone);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Browser cutting failed for this clip.';
      setClips((prev) =>
        prev.map((c) =>
          c.id === target.id
            ? {
                ...c,
                cutStatus: 'error',
                cutProgress: 0,
                cutStageLabel: undefined,
                cutError: msg,
              }
            : c,
        ),
      );
      if (msg.toLowerCase().includes('worker')) {
        setGlobalFfmpegError(msg);
      }
    } finally {
      void releaseWakeLock();
    }
  };

  const handleCutSingleClip = async (clipId: string) => {
    const currentList = clipsRef.current;
    const targetIndex = currentList.findIndex((c) => c.id === clipId);
    const target = currentList[targetIndex];
    if (!target || !video || isCuttingAny) return;
    await runCutSingleClipObject(target, targetIndex, video);
  };

  const handleReEditClip = async (clipId: string) => {
    await handleCutSingleClip(clipId);
  };

  const handleCreateCustomClip = (input: CustomClipInput) => {
    if (!video) return;
    const newId = `clip-custom-${Date.now()}`;
    const newClip: ClipItem = {
      id: newId,
      start_seconds: input.startSeconds,
      end_seconds: input.endSeconds,
      title: input.title,
      hook_reason: 'Custom range clip',
      caption_text: input.captionText,
      speaker_x_ratio: 0.5,
      virality_score: 80,
      virality_reason: 'Manually selected highlight segment.',
      transcript: input.captionText
        ? [
            {
              start_seconds: input.startSeconds,
              end_seconds: input.endSeconds,
              text: input.captionText,
            },
          ]
        : [],
      captionLanguage: settings.captionLanguage,
      removeSilencesAndFillers: settings.autoEdit.removeSilences,
      cutStatus: 'idle',
      cutProgress: 0,
    };

    const nextIndex = clipsRef.current.length;
    setClipSourceMode('file');
    setResultYouTubeId(undefined);
    setClips((prev) => [...prev, newClip]);
    setPhase('ready');
    setFocusedClipId(newId);

    setTimeout(() => {
      document.getElementById(`clip-card-${newId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 60);

    if (input.cutAndEditNow && !isCuttingAny) {
      void runCutSingleClipObject(newClip, nextIndex, video);
    }
  };

  const handleCutAllClips = async () => {
    if (!video || isCuttingAny) return;
    await cutClipListSequentially(video, clips);
  };

  const handleNudgeFocusedStart = useCallback(
    (clipId: string, delta: number) => {
      const target = clipsRef.current.find((c) => c.id === clipId);
      if (!target || target.cutStatus === 'cutting' || target.cutStatus === 'queued') return;
      const nextStart = Math.round(
        Math.max(0, Math.min(target.end_seconds - 1, target.start_seconds + delta)) * 10,
      ) / 10;
      if (nextStart !== target.start_seconds) {
        handleUpdateClipTimes(clipId, nextStart, target.end_seconds);
      }
    },
    [],
  );

  useStudioKeyboardShortcuts({
    enabled:
      !isLegalOpen &&
      !isBulkAdjustOpen &&
      !isShortcutsOpen &&
      !isTourOpen &&
      !isFeedbackOpen &&
      !clipPendingDelete &&
      clips.length > 0,
    focusedClipId,
    onTogglePlayFocused: (clipId) => {
      playToggleMapRef.current.get(clipId)?.();
    },
    onRequestDeleteFocused: handleRequestDeleteClip,
    onBulkCut: () => {
      if (clipSourceMode === 'file' && video && !isCuttingRef.current && !isAnalyzing) {
        void cutClipListSequentially(video, clipsRef.current);
      }
    },
    onNudgeFocusedStart: handleNudgeFocusedStart,
    onToggleShortcutsModal: () => setIsShortcutsOpen((prev) => !prev),
  });

  const handleResumeSession = () => {
    setShowResumeBanner(false);
    if (clipSourceMode === 'file' && video) {
      const uncut = clips.filter((c) => c.cutStatus !== 'done');
      if (uncut.length > 0 && !isCuttingAny) {
        void cutClipListSequentially(video, clips);
      }
    }
  };

  const handleSaveAllZip = async () => {
    if (!video || isZipping) return;
    setIsZipping(true);
    setZipProgress(0);
    setGlobalFfmpegError(null);

    try {
      await downloadAllClipsAsZip(clips, video.name, (pct) => setZipProgress(pct));
      triggerExportSuccessCelebration(
        'ZIP bundle downloaded',
        'Includes all finished MP4 clips and .SRT subtitles.',
      );
    } catch (err) {
      setGlobalFfmpegError(
        err instanceof Error ? err.message : 'Failed to package ZIP archive.',
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleExportSceneBreakdownJson = () => {
    if (clips.length === 0) return;
    const sourceName =
      clipSourceMode === 'youtube'
        ? resultYouTubeId
          ? `youtube-${resultYouTubeId}`
          : 'youtube-clips'
        : video?.name || 'clip-cutter';
    downloadSceneBreakdownJson({
      clips,
      sourceMode: clipSourceMode,
      sourceName,
      totalDurationSeconds: clipSourceMode === 'file' ? video?.durationSeconds : undefined,
      captionLanguage: settings.captionLanguage,
    });
    pushToast('success', 'Scene breakdown exported as JSON');
  };

  const hasSelectedSource =
    (inputMode === 'file' && Boolean(video)) ||
    (inputMode === 'link' && Boolean(activeLink));

  const remainingToCutCount = clips.filter((c) => c.cutStatus !== 'done').length;

  const handleClearAllLocalData = async () => {
    handleClearVideo();
    setBrandSettings(DEFAULT_BRAND);
    clearRecentProjects();
    setRecentProjects([]);
    await clearAllFromIndexedDb();
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[#F7F5F0] text-[#151517] transition-colors duration-200 motion-reduce:transition-none dark:bg-[#0E0E0F] dark:text-[#F2F0EA]">
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header
          hasVideo={Boolean(video || activeLink || clips.length > 0)}
          isBusy={isAnalyzing || isCuttingAny}
          isLegalOpen={isLegalOpen}
          theme={theme}
          usage={usage}
          onToggleTheme={handleToggleTheme}
          onResetVideo={handleClearVideo}
          onOpenLegal={() => openLegalPage('terms')}
          onBackToStudio={closeLegalPage}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
          onOpenTour={() => setIsTourOpen(true)}
        />

        {isLegalOpen ? (
          <div className="flex-1">
            <LegalPage
              activeSection={legalSection}
              onSelectSection={(sec) => openLegalPage(sec)}
              onBackToStudio={closeLegalPage}
              onClearLocalData={handleClearAllLocalData}
            />
          </div>
        ) : (
          <>
            {showAllTimelines && clips.length > 0 && (clipSourceMode === 'youtube' || Boolean(video)) && (
              <AllTimelinesStrip
                clips={clips}
                totalDuration={timelineTotalDuration}
                overlappingIds={overlappingIds}
                onSelectClip={(clipId) => {
                  setFocusedClipId(clipId);
                  document
                    .getElementById(`clip-card-${clipId}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                onClose={() => setShowAllTimelines(false)}
              />
            )}

            <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-14">
              {/* Session Restored Banner */}
              {showResumeBanner && clips.length > 0 && (
                <div
                  role="status"
                  className="flex flex-col gap-3 rounded-xl border border-[#E8A33D]/50 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-[#151517]"
                >
                  <div className="space-y-0.5">
                    <p className="font-display text-sm font-semibold text-[#E8A33D]">
                      Session restored from browser storage
                    </p>
                    <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                      {cutCount} of {clips.length} clips finished
                      {remainingToCutCount > 0 && clipSourceMode === 'file' && video
                        ? ` · ${remainingToCutCount} remaining to cut`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {clipSourceMode === 'file' && video && remainingToCutCount > 0 && (
                      <button
                        type="button"
                        onClick={handleResumeSession}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-4 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] whitespace-nowrap"
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        <span>Resume</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleClearVideo}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] whitespace-nowrap"
                    >
                      <span>Start fresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowResumeBanner(false)}
                      aria-label="Dismiss resume banner"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Flow 1: Upload / Paste Link */}
              <UploadZone
                inputMode={inputMode}
                onModeChange={(mode) => {
                  setInputMode(mode);
                  setAnalysisError(null);
                  setSelectionError(null);
                }}
                video={video}
                activeLink={activeLink}
                pendingReuseCount={pendingReuseClips.length}
                isBusy={isAnalyzing || isCuttingAny}
                isLoadingSample={isLoadingSample}
                selectionError={selectionError}
                recentProjects={recentProjects}
                onClearRecentProjects={() => {
                  clearRecentProjects();
                  setRecentProjects([]);
                }}
                onSelectFile={handleSelectFile}
                onTrySampleVideo={() => void handleLoadSampleVideo()}
                onSubmitLink={handleSelectLink}
                onClearLink={handleClearLink}
                onClearSelectionError={() => setSelectionError(null)}
                onClearVideo={handleClearVideo}
                onDismissPendingReuse={() => setPendingReuseClips([])}
              />

              {/* Landing / Showcase Sections when no source is loaded */}
              {!video && !activeLink && clips.length === 0 && phase === 'idle' && (
                <LandingSections
                  onTrySampleVideo={() => void handleLoadSampleVideo()}
                  isLoadingSample={isLoadingSample}
                />
              )}

              {/* Flow 2: Settings before analysis */}
              {hasSelectedSource && (
                <AnalysisSettings
                  settings={settings}
                  disabled={isAnalyzing || isCuttingAny}
                  hasClips={clips.length > 0}
                  isTranslatingCaptions={isTranslatingCaptions}
                  translationError={translationError}
                  onChange={handleSettingsChange}
                  onChangeCaptionLanguage={handleChangeCaptionLanguage}
                  onRetryTranslation={() => void runCaptionTranslation(settings.captionLanguage)}
                  onAnalyze={() => void runAnalysis(false)}
                />
              )}

              {/* Auto-Edit Pipeline Toggles (before analysis when in file mode & no clips yet) */}
              {hasSelectedSource && inputMode === 'file' && clips.length === 0 && (
                <AutoEditToggles
                  autoEdit={settings.autoEdit}
                  disabled={isAnalyzing || isCuttingAny}
                  hasBrandLogo={Boolean(brandSettings.logoBlob)}
                  brandApplyToAll={brandSettings.applyToAllClips}
                  onToggle={handleToggleAutoEdit}
                  onSelectCaptionPreset={handleSelectCaptionPreset}
                />
              )}

              {/* Custom Any-Length Clip Creator */}
              {inputMode === 'file' && video && (
                <CustomClipCreator
                  video={video}
                  autoEdit={settings.autoEdit}
                  disabled={isAnalyzing || isCuttingAny}
                  onCreateClip={handleCreateCustomClip}
                />
              )}

              {/* Brand Template Panel */}
              {(hasSelectedSource || clips.length > 0 || Boolean(brandSettings.logoBlob)) && (
                <BrandPanel
                  brand={brandSettings}
                  aspectFormat={settings.aspectFormat}
                  disabled={isCuttingAny}
                  onChange={setBrandSettings}
                />
              )}

              {/* Flow 3: Upload / Processing / Analysis Progress */}
              <AnalysisProgress
                phase={phase}
                analysisMode={analysisMode}
                fetchProgress={fetchProgress}
                uploadProgress={uploadProgress}
                remoteFileState={remoteFileState}
                error={analysisError}
                onCancel={handleCancelAnalysis}
                onRetry={() => void runAnalysis(analysisError?.code === 'FILE_EXPIRED')}
                onSwitchToUpload={() => {
                  setAnalysisError(null);
                  setPhase('idle');
                  setInputMode('file');
                }}
              />

              {/* Friendly FFmpeg Error Banner */}
              {globalFfmpegError && (
                <div
                  role="alert"
                  className="flex flex-col gap-3 rounded-xl border border-red-500/40 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-[#151517]"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                    <p className="text-sm text-[#151517] dark:text-[#F2F0EA]">{globalFfmpegError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCutAllClips()}
                    className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-4 py-2 text-sm font-semibold text-[#0E0E0F] hover:bg-[#DDA03A] whitespace-nowrap"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>Retry cut</span>
                  </button>
                </div>
              )}

              {/* Flow 4, 5 & 6: Stage 1 AI Workspace, Waveform Scrubber, Insights & Clip Cards */}
              {clips.length > 0 && (clipSourceMode === 'youtube' || Boolean(video)) && (
                <section aria-label="Clip results" className="space-y-5">
                  <StudioActionBar
                    sourceMode={clipSourceMode}
                    totalClips={clips.length}
                    cutCount={cutCount}
                    autoSaveWhenReady={autoSaveWhenReady}
                    showAllTimelines={showAllTimelines}
                    isCuttingAll={isCuttingAll}
                    isRegenerating={isAnalyzing}
                    isZipping={isZipping}
                    zipProgress={zipProgress}
                    onToggleAutoSave={setAutoSaveWhenReady}
                    onToggleShowAllTimelines={() => setShowAllTimelines((prev) => !prev)}
                    onOpenBulkAdjust={() => setIsBulkAdjustOpen(true)}
                    onOpenMobileSettings={() => setIsMobileSettingsOpen(true)}
                    onExportJson={handleExportSceneBreakdownJson}
                    onRegenerate={() => void runAnalysis(false)}
                    onCutAll={() => void handleCutAllClips()}
                    onSaveAll={() => void handleSaveAllZip()}
                    onSwitchToUploadCut={handleCutYouTubeClipsFromFile}
                  />

                  {/* Stage 1 Prompt-Based Moment Finder */}
                  <PromptMomentsBar
                    disabled={isAnalyzing || isCuttingAny}
                    isSearching={isSearchingMoments}
                    candidates={momentCandidates}
                    addedCandidateIds={addedCandidateIds}
                    searchError={momentSearchError}
                    onSearchMoments={(promptText) => void handleSearchPromptMoments(promptText)}
                    onAddCandidate={handleAddCandidateMoment}
                    onAddAllCandidates={handleAddAllCandidateMoments}
                    onClearCandidates={() => {
                      setMomentCandidates([]);
                      setAddedCandidateIds(new Set());
                    }}
                  />

                  {/* Stage 1 Clip Insights & Engagement Breakdown */}
                  <ClipInsightsPanel
                    clips={clips}
                    sourceDurationSeconds={clipSourceMode === 'file' ? video?.durationSeconds : undefined}
                    onSelectClip={(clipId) => {
                      setFocusedClipId(clipId);
                      document
                        .getElementById(`clip-card-${clipId}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  />

                  {/* Focused Clip Interactive Waveform Timeline (File Mode) */}
                  {clipSourceMode === 'file' && video && focusedClip && (
                    <WaveformTimeline
                      video={video}
                      clip={focusedClip}
                      clipIndex={focusedClipIndex}
                      disabled={isCuttingAny}
                      onUpdateTimes={handleUpdateClipTimes}
                    />
                  )}

                  {/* Desktop Auto-Edit Pipeline & Caption Presets */}
                  {clipSourceMode === 'file' && (
                    <div className="hidden md:block">
                      <AutoEditToggles
                        autoEdit={settings.autoEdit}
                        disabled={isAnalyzing || isCuttingAny}
                        hasBrandLogo={Boolean(brandSettings.logoBlob)}
                        brandApplyToAll={brandSettings.applyToAllClips}
                        onToggle={handleToggleAutoEdit}
                        onSelectCaptionPreset={handleSelectCaptionPreset}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {clips.map((clip, index) => (
                      <ClipCard
                        key={clip.id}
                        clip={clip}
                        index={index}
                        sourceMode={clipSourceMode}
                        sourceVideoUrl={video?.objectUrl}
                        youtubeVideoId={resultYouTubeId}
                        videoDuration={clipSourceMode === 'file' ? video?.durationSeconds : undefined}
                        timelineTotalDuration={timelineTotalDuration}
                        aspectFormat={settings.aspectFormat}
                        currentAutoEdit={settings.autoEdit}
                        captionLanguage={settings.captionLanguage}
                        brandSettings={brandSettings}
                        brandLogoUrl={brandLogoUrl}
                        hasOverlap={overlappingIds.has(clip.id)}
                        isFocused={focusedClipId === clip.id}
                        isCuttingAny={isCuttingAny}
                        isGeneratingMetadata={generatingMetaClipIds.has(clip.id)}
                        isScoringClip={scoringClipIds.has(clip.id)}
                        onFocusCard={setFocusedClipId}
                        registerPlayToggle={registerPlayToggle}
                        onUpdateTitle={handleUpdateClipTitle}
                        onUpdateTimes={handleUpdateClipTimes}
                        onToggleRemoveSilences={handleToggleRemoveSilences}
                        onMoveHookToStart={handleMoveHookToStart}
                        onToggleHookTitleCard={handleToggleHookTitleCard}
                        onGenerateMetadata={(id, plat) => void handleGenerateClipMetadata(id, plat)}
                        onScoreClip={(id) => void handleScoreClip(id)}
                        onRequestDelete={handleRequestDeleteClip}
                        onCutClip={(id) => void handleCutSingleClip(id)}
                        onReEditClip={(id) => void handleReEditClip(id)}
                        onSaveToDevice={downloadCutClip}
                        onShareClip={shareOrDownloadClip}
                        onDownloadSrt={downloadClipSrt}
                      />
                    ))}
                  </div>

                  {clipSourceMode === 'youtube' && (
                    <div className="flex flex-col gap-4 rounded-xl border border-[#DFDCD2] bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E] dark:bg-[#151517]">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
                          <Scissors className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <p className="max-w-2xl text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                          To get downloadable clips, upload the video file in the Upload tab and the timestamps will be reused to cut it.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleCutYouTubeClipsFromFile}
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] whitespace-nowrap"
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        <span>Cut these clips from my file</span>
                      </button>
                    </div>
                  )}
                </section>
              )}
            </main>
          </>
        )}

        {/* Quiet Luxury Legal & Feedback Footer */}
        <footer className="border-t border-[#DFDCD2] bg-[#F7F5F0] dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-[#64625D] sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-[#8C8C93]">
            <span>
              Videos are cut on your device; audio is sent securely only for AI transcription with your consent.
            </span>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {(
                [
                  ['terms', 'Terms'],
                  ['privacy', 'Privacy'],
                  ['ai', 'AI Proxy'],
                  ['copyright', 'Copyright & DMCA'],
                  ['contact', 'Contact'],
                ] as const
              ).map(([sec, label]) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => openLegalPage(sec)}
                  className="underline-offset-4 transition-colors hover:text-[#151517] hover:underline dark:hover:text-[#F2F0EA] whitespace-nowrap"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsFeedbackOpen(true)}
                className="font-medium text-[#E8A33D] underline-offset-4 transition-colors hover:underline whitespace-nowrap"
              >
                Send feedback
              </button>
            </nav>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Sheet for Auto-Edit & Caption Presets */}
      {isMobileSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 md:hidden"
          onClick={() => setIsMobileSettingsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Auto-edit settings"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] w-full overflow-y-auto rounded-t-xl border-t border-[#DFDCD2] bg-white p-4 pb-8 dark:border-[#2A2A2E] dark:bg-[#151517]"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                Auto-edit &amp; caption styles
              </span>
              <button
                type="button"
                onClick={() => setIsMobileSettingsOpen(false)}
                aria-label="Close auto-edit settings"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#64625D] dark:text-[#8C8C93]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <AutoEditToggles
              autoEdit={settings.autoEdit}
              disabled={isAnalyzing || isCuttingAny}
              hasBrandLogo={Boolean(brandSettings.logoBlob)}
              brandApplyToAll={brandSettings.applyToAllClips}
              onToggle={handleToggleAutoEdit}
              onSelectCaptionPreset={handleSelectCaptionPreset}
            />
          </div>
        </div>
      )}

      {/* Bulk Adjust Timings Modal */}
      <BulkAdjustDialog
        isOpen={isBulkAdjustOpen}
        clips={clips}
        maxDurationSeconds={clipSourceMode === 'file' ? video?.durationSeconds : undefined}
        onClose={() => setIsBulkAdjustOpen(false)}
        onApply={handleBulkAdjustTimings}
      />

      {/* Delete Clip Confirmation Modal */}
      <DeleteConfirmModal
        clip={clipPendingDelete}
        onCancel={() => setClipPendingDelete(null)}
        onConfirm={handleConfirmDeleteClip}
      />

      {/* Keyboard Shortcuts Panel */}
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* Product Tour Modal */}
      <OnboardingTour isOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />

      {/* User Feedback Modal */}
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />

      {/* Toast Notifications */}
      <ToastHost
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
