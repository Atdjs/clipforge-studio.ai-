import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpToLine,
  BarChart3,
  Captions,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Hash,
  HelpCircle,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Scissors,
  Share2,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AspectFormat,
  AutoEditSettings,
  BrandSettings,
  CaptionLanguage,
  ClipItem,
  TranscriptSegment,
} from '../types/clip';
import { formatTimecode } from '../utils/format';

interface ClipCardProps {
  clip: ClipItem;
  index: number;
  sourceVideoUrl?: string;
  canCutLocally?: boolean;
  videoDuration?: number;
  timelineTotalDuration: number;
  aspectFormat: AspectFormat;
  currentAutoEdit: AutoEditSettings;
  captionLanguage: CaptionLanguage;
  brandSettings?: BrandSettings;
  brandLogoUrl?: string | null;
  hasOverlap: boolean;
  isFocused: boolean;
  isCuttingAny: boolean;
  isGeneratingMetadata?: boolean;
  isScoringClip?: boolean;
  onFocusCard: (clipId: string) => void;
  registerPlayToggle: (clipId: string, toggleFn: (() => void) | null) => void;
  onUpdateTitle: (clipId: string, title: string) => void;
  onUpdateTimes: (clipId: string, startSeconds: number, endSeconds: number) => void;
  onToggleRemoveSilences: (clipId: string, nextValue: boolean) => void;
  onMoveHookToStart: (clipId: string) => void;
  onToggleHookTitleCard: (clipId: string, nextValue: boolean) => void;
  onGenerateMetadata: (clipId: string, platform: 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'general') => void;
  onScoreClip?: (clipId: string) => void;
  onRequestDelete: (clipId: string) => void;
  onCutClip: (clipId: string) => void;
  onReEditClip: (clipId: string) => void;
  onSaveToDevice: (clip: ClipItem, index: number) => void;
  onShareClip: (clip: ClipItem, index: number) => void;
  onDownloadSrt: (clip: ClipItem, index: number) => void;
}

/**
 * Individual precision clip card combining playback, waveform/transcript trimming,
 * silence/filler removal, Virality Score breakdown + AI re-scoring, Hook tools, and Social metadata.
 */
export function ClipCard({
  clip,
  index,
  sourceVideoUrl,
  canCutLocally = true,
  videoDuration,
  timelineTotalDuration,
  aspectFormat,
  currentAutoEdit,
  captionLanguage,
  brandSettings,
  brandLogoUrl,
  hasOverlap,
  isFocused,
  isCuttingAny,
  isGeneratingMetadata = false,
  isScoringClip = false,
  onFocusCard,
  registerPlayToggle,
  onUpdateTitle,
  onUpdateTimes,
  onToggleRemoveSilences,
  onMoveHookToStart,
  onToggleHookTitleCard,
  onGenerateMetadata,
  onScoreClip,
  onRequestDelete,
  onCutClip,
  onReEditClip,
  onSaveToDevice,
  onShareClip,
  onDownloadSrt,
}: ClipCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [editedDuration, setEditedDuration] = useState<number | null>(null);
  const [copiedSocial, setCopiedSocial] = useState(false);

  // Popover & collapsible panel state
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [trimTarget, setTrimTarget] = useState<'start' | 'end'>('start');

  // Local draft inputs so multi-digit numbers edit smoothly
  const [startDraft, setStartDraft] = useState(String(clip.start_seconds));
  const [endDraft, setEndDraft] = useState(String(clip.end_seconds));
  const [lengthDraft, setLengthDraft] = useState(
    String(Math.max(1, Math.round(clip.end_seconds - clip.start_seconds))),
  );

  useEffect(() => {
    setStartDraft(String(clip.start_seconds));
    setEndDraft(String(clip.end_seconds));
    setLengthDraft(String(Math.max(1, Math.round(clip.end_seconds - clip.start_seconds))));
  }, [clip.start_seconds, clip.end_seconds]);

  const isUsingCutOutput = Boolean(clip.outputUrl && clip.cutStatus === 'done');
  const previewSrc = isUsingCutOutput ? clip.outputUrl! : sourceVideoUrl || '';
  const clipDuration = Math.max(1, clip.end_seconds - clip.start_seconds);
  const segStart = isUsingCutOutput ? 0 : clip.start_seconds;
  const segEnd = isUsingCutOutput
    ? editedDuration && editedDuration > 0
      ? editedDuration
      : clipDuration
    : clip.end_seconds;

  const maxVideoEnd =
    typeof videoDuration === 'number' && videoDuration > 0
      ? Math.floor(videoDuration)
      : Number.MAX_SAFE_INTEGER;

  // Timeline visualization geometry
  const safeTotal = Math.max(1, timelineTotalDuration, clip.end_seconds);
  const segmentLeftPct = Math.max(0, Math.min(98, (clip.start_seconds / safeTotal) * 100));
  const rawWidthPct = ((clip.end_seconds - clip.start_seconds) / safeTotal) * 100;
  const segmentWidthPct = Math.max(2, Math.min(100 - segmentLeftPct, rawWidthPct));

  // Count Gemini-detected filler words inside clip range
  const detectedFillerCount = useMemo(() => {
    if (!clip.transcript) return 0;
    let count = 0;
    for (const seg of clip.transcript) {
      if (!Array.isArray(seg.filler_words)) continue;
      for (const fw of seg.filler_words) {
        if (fw.end_seconds > clip.start_seconds && fw.start_seconds < clip.end_seconds) {
          count += 1;
        }
      }
    }
    return count;
  }, [clip.transcript, clip.start_seconds, clip.end_seconds]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setIsPlaying(false);
    setSegmentProgress(0);
    if (!isUsingCutOutput) {
      setEditedDuration(null);
    }
    if (vid.readyState >= 1) {
      vid.pause();
      vid.currentTime = segStart;
    }
  }, [segStart, previewSrc, isUsingCutOutput]);

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isUsingCutOutput && Number.isFinite(vid.duration) && vid.duration > 0) {
      setEditedDuration(vid.duration);
    }
    vid.currentTime = segStart;
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;

    const current = vid.currentTime;
    const span = Math.max(0.1, segEnd - segStart);
    const pct = Math.max(0, Math.min(100, ((current - segStart) / span) * 100));
    setSegmentProgress(pct);

    if (current >= segEnd) {
      vid.pause();
      vid.currentTime = segStart;
      setIsPlaying(false);
      setSegmentProgress(0);
    }
  };

  const togglePlay = async () => {
    const vid = videoRef.current;
    if (!vid) return;

    if (!vid.paused) {
      vid.pause();
      setIsPlaying(false);
      return;
    }

    if (vid.currentTime < segStart || vid.currentTime >= segEnd - 0.1) {
      vid.currentTime = segStart;
    }

    try {
      await vid.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const togglePlayRef = useRef<() => Promise<void>>(togglePlay);
  togglePlayRef.current = togglePlay;

  useEffect(() => {
    if (!previewSrc) {
      registerPlayToggle(clip.id, null);
      return;
    }
    registerPlayToggle(clip.id, () => {
      void togglePlayRef.current();
    });
    return () => registerPlayToggle(clip.id, null);
  }, [clip.id, previewSrc, registerPlayToggle]);

  const toggleMute = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setIsMuted(vid.muted);
  };

  const handleScrub = (pct: number) => {
    const vid = videoRef.current;
    if (!vid) return;
    const span = Math.max(0.1, segEnd - segStart);
    const target = segStart + (pct / 100) * span;
    vid.currentTime = target;
    setSegmentProgress(pct);
  };

  const commitStart = (rawVal: number) => {
    const safe = Number.isFinite(rawVal) ? Math.round(rawVal) : clip.start_seconds;
    const maxStart = Math.max(0, clip.end_seconds - 1);
    const clamped = Math.max(0, Math.min(maxStart, safe));
    setStartDraft(String(clamped));
    if (clamped !== clip.start_seconds) {
      onUpdateTimes(clip.id, clamped, clip.end_seconds);
    }
  };

  const commitEnd = (rawVal: number) => {
    const safe = Number.isFinite(rawVal) ? Math.round(rawVal) : clip.end_seconds;
    const minEnd = Math.min(maxVideoEnd, clip.start_seconds + 1);
    const clamped = Math.max(minEnd, Math.min(maxVideoEnd, safe));
    setEndDraft(String(clamped));
    if (clamped !== clip.end_seconds) {
      onUpdateTimes(clip.id, clip.start_seconds, clamped);
    }
  };

  const commitLength = (rawLen: number) => {
    const currentLen = Math.max(1, clip.end_seconds - clip.start_seconds);
    const safeLen = Number.isFinite(rawLen) ? Math.round(rawLen) : currentLen;
    const upperCap = maxVideoEnd < Number.MAX_SAFE_INTEGER ? maxVideoEnd : Number.MAX_SAFE_INTEGER;
    const clampedLen = Math.max(1, Math.min(upperCap, safeLen));

    let nextStart = clip.start_seconds;
    let nextEnd = nextStart + clampedLen;
    if (nextEnd > upperCap) {
      nextEnd = upperCap;
      nextStart = Math.max(0, upperCap - clampedLen);
    }

    setLengthDraft(String(Math.max(1, nextEnd - nextStart)));
    if (nextStart !== clip.start_seconds || nextEnd !== clip.end_seconds) {
      onUpdateTimes(clip.id, nextStart, nextEnd);
    }
  };

  const handleTapTranscriptPhrase = (seg: TranscriptSegment) => {
    if (isBusyThisClip) return;
    if (trimTarget === 'start') {
      const targetStart = Math.max(
        0,
        Math.min(Math.max(0, clip.end_seconds - 1), Math.floor(seg.start_seconds)),
      );
      setStartDraft(String(targetStart));
      onUpdateTimes(clip.id, targetStart, clip.end_seconds);
    } else {
      const minEnd = Math.min(maxVideoEnd, clip.start_seconds + 1);
      const targetEnd = Math.max(minEnd, Math.min(maxVideoEnd, Math.ceil(seg.end_seconds)));
      setEndDraft(String(targetEnd));
      onUpdateTimes(clip.id, clip.start_seconds, targetEnd);
    }
  };

  const handleCopyText = async (text: string, onSuccess: () => void) => {
    try {
      await navigator.clipboard.writeText(text);
      onSuccess();
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      onSuccess();
    }
  };

  const isBusyThisClip = clip.cutStatus === 'cutting' || clip.cutStatus === 'queued';
  const isReady = clip.cutStatus === 'done' && Boolean(clip.outputBlob);
  const transcriptList = clip.transcript || [];
  const showVerticalGuide = currentAutoEdit.reframeVertical || aspectFormat === 'vertical';

  // Virality Score helpers (color-coded threshold: >=85 emerald, 70-84 amber, <70 neutral)
  const score = clip.virality_score ?? 75;
  const scoreTone =
    score >= 85
      ? 'border-emerald-600/40 bg-emerald-950/90 text-emerald-300'
      : score >= 70
        ? 'border-[#E8A33D]/55 bg-[#0E0E0F]/90 text-[#E8A33D]'
        : 'border-[#2A2A2E] bg-[#0E0E0F]/90 text-[#F2F0EA]';
  const scoreInlineTone =
    score >= 85
      ? 'border-emerald-600/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : score >= 70
        ? 'border-[#E8A33D]/50 bg-[#E8A33D]/10 text-[#151517] dark:text-[#E8A33D]'
        : 'border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93]';
  const scoreBarColor =
    score >= 85
      ? 'bg-emerald-600 dark:bg-emerald-500'
      : score >= 70
        ? 'bg-[#E8A33D]'
        : 'bg-[#64625D] dark:bg-[#8C8C93]';
  const scoreTier = score >= 85 ? 'High' : score >= 70 ? 'Strong' : 'Moderate';

  const hasPendingAutoEditChanges = useMemo(() => {
    if (!isReady || !clip.autoEditApplied) return false;
    const applied = clip.autoEditApplied;
    const desiredRemoveSilences =
      typeof clip.removeSilencesAndFillers === 'boolean'
        ? clip.removeSilencesAndFillers
        : currentAutoEdit.removeSilences;
    return (
      applied.removeSilences !== desiredRemoveSilences ||
      applied.burnCaptions !== currentAutoEdit.burnCaptions ||
      applied.reframeVertical !== currentAutoEdit.reframeVertical ||
      applied.fadeInOut !== currentAutoEdit.fadeInOut ||
      applied.normalizeAudio !== currentAutoEdit.normalizeAudio ||
      (applied.captionStyle || 'classic-amber') !== (currentAutoEdit.captionStyle || 'classic-amber')
    );
  }, [isReady, clip.autoEditApplied, clip.removeSilencesAndFillers, currentAutoEdit]);

  const appliedEditSummary = useMemo(() => {
    if (!clip.autoEditApplied) return [];
    const items: string[] = [];
    if (clip.autoEditApplied.removeSilences) items.push('Silences trimmed');
    if (clip.autoEditApplied.burnCaptions) items.push('Captions burned');
    if (clip.autoEditApplied.reframeVertical) items.push('9:16 crop');
    if (clip.autoEditApplied.fadeInOut) items.push('Fade in/out');
    if (clip.autoEditApplied.normalizeAudio) items.push('Audio normalized');
    if (clip.addHookTitleCard) items.push('Hook card');
    return items;
  }, [clip.autoEditApplied, clip.addHookTitleCard]);

  const brandPreviewPos = (() => {
    if (!brandSettings) return {};
    switch (brandSettings.position) {
      case 'top-left':
        return { top: '6%', left: '4%' };
      case 'top-right':
        return { top: '6%', right: '4%' };
      case 'bottom-left':
        return { bottom: '18%', left: '4%' };
      case 'bottom-right':
        return { bottom: '18%', right: '4%' };
    }
  })();

  const subScores = clip.sub_scores || {
    hook: Math.min(100, score + 4),
    emotion: Math.max(40, score - 3),
    flow: score,
    shareability: Math.max(40, score - 2),
  };

  const canMoveHookToStart =
    typeof clip.hook_start_seconds === 'number' &&
    clip.hook_start_seconds > clip.start_seconds + 0.4 &&
    clip.hook_start_seconds < clip.end_seconds - 1;

  const hashtagsText = (clip.hashtags || [])
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');

  return (
    <article
      id={`clip-card-${clip.id}`}
      data-clip-card={clip.id}
      tabIndex={0}
      onClick={() => onFocusCard(clip.id)}
      onFocusCapture={() => onFocusCard(clip.id)}
      className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors duration-150 focus:outline-none motion-reduce:transition-none dark:bg-[#151517] ${
        isFocused
          ? 'border-[#E8A33D] ring-1 ring-[#E8A33D]'
          : 'border-[#DFDCD2] hover:border-[#64625D] dark:border-[#2A2A2E] dark:hover:border-[#8C8C93]'
      }`}
    >
      {/* Video Preview Frame */}
      <div className="relative aspect-video w-full overflow-hidden bg-[#0E0E0F]">
        {previewSrc ? (
          <>
            <video
              ref={videoRef}
              src={previewSrc}
              muted={isMuted}
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => {
                setIsPlaying(false);
                setSegmentProgress(0);
              }}
              onClick={togglePlay}
              className="h-full w-full cursor-pointer object-contain"
            />

            {showVerticalGuide && !isUsingCutOutput && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div className="h-full flex-1 bg-black/55" />
                <div className="aspect-[9/16] h-full border-x border-[#E8A33D]/70" />
                <div className="h-full flex-1 bg-black/55" />
              </div>
            )}

            {isUsingCutOutput && (
              <div className="pointer-events-none absolute left-2.5 top-2.5 rounded-md border border-emerald-500/40 bg-[#0E0E0F]/90 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
                Edited preview
              </div>
            )}

            {/* Top-right Color-coded Virality Score Badge */}
            <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsWhyOpen((prev) => !prev);
                }}
                aria-expanded={isWhyOpen}
                aria-label={`Virality score ${score} out of 100. View breakdown`}
                className={`inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-medium tabular-nums transition-colors hover:border-[#E8A33D] ${scoreTone}`}
              >
                <BarChart3 className="h-3 w-3" aria-hidden="true" />
                <span>{score}</span>
                <span className="font-sans text-[10px] opacity-80">/ 100 · {scoreTier}</span>
                <HelpCircle className="h-3 w-3 opacity-75" aria-hidden="true" />
              </button>
            </div>

            {brandSettings?.applyToAllClips && brandLogoUrl && !isUsingCutOutput && (
              <img
                src={brandLogoUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute object-contain"
                style={{
                  ...brandPreviewPos,
                  width: `${brandSettings.sizePercent}%`,
                  opacity: brandSettings.opacity / 100,
                }}
              />
            )}

            {/* Precision Player Control Strip */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-white/10 bg-[#0E0E0F]/85 px-2.5 py-1.5">
              <button
                type="button"
                data-play-toggle="true"
                onClick={togglePlay}
                aria-label={isPlaying ? `Pause ${clip.title}` : `Play ${clip.title} segment`}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[#F2F0EA] transition-colors hover:bg-[#E8A33D] hover:text-[#0E0E0F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 translate-x-0.5" />
                )}
              </button>

              <div className="flex flex-1 flex-col gap-1">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={segmentProgress}
                  aria-label={`Seek inside ${clip.title}`}
                  onChange={(e) => handleScrub(Number(e.target.value))}
                  className="amber-slider w-full"
                />
              </div>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute preview' : 'Mute preview'}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[#8C8C93] transition-colors hover:text-[#F2F0EA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsWhyOpen((prev) => !prev);
              }}
              className={`mb-2 inline-flex min-h-[30px] items-center gap-1.5 rounded-md border px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums ${scoreTone}`}
            >
              <BarChart3 className="h-3 w-3" aria-hidden="true" />
              <span>{score}/100 · {scoreTier}</span>
            </button>
            <p className="text-xs text-[#8C8C93]">
              Re-attach your matching video file above to preview and cut this Drive clip.
            </p>
          </div>
        )}
      </div>

      {/* Persistent Timeline Visualization Bar */}
      <div
        aria-label={`Timeline position ${formatTimecode(clip.start_seconds)} to ${formatTimecode(clip.end_seconds)} out of ${formatTimecode(safeTotal)}`}
        className="border-b border-[#DFDCD2] bg-[#EFECE4] px-4 py-2.5 dark:border-[#2A2A2E] dark:bg-[#1C1C1F]"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#DFDCD2] dark:bg-[#2A2A2E]">
          <div
            className="absolute inset-y-0 rounded-full bg-[#E8A33D] transition-[left,width] duration-150 motion-reduce:transition-none"
            style={{
              left: `${segmentLeftPct}%`,
              width: `${segmentWidthPct}%`,
            }}
          />
          {isPlaying && (
            <div
              className="absolute inset-y-0 w-0.5 bg-[#151517] dark:bg-[#F2F0EA]"
              style={{
                left: `${segmentLeftPct + (segmentProgress / 100) * segmentWidthPct}%`,
              }}
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
          <span>00:00</span>
          <span className="font-medium text-[#151517] dark:text-[#E8A33D]">
            {formatTimecode(clip.start_seconds)}–{formatTimecode(clip.end_seconds)}
          </span>
          <span>{formatTimecode(safeTotal)}</span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {/* Top Metadata + Editable Title + Delete */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              <span className="font-medium text-[#E8A33D]">
                Clip {String(index + 1).padStart(2, '0')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{Math.round(clipDuration)}s</span>
              <span aria-hidden="true">·</span>
              <span>
                {(isReady ? clip.autoEditApplied?.reframeVertical : showVerticalGuide)
                  ? '9:16'
                  : 'Original'}
              </span>
              {isFocused && (
                <span className="rounded border border-[#E8A33D]/50 bg-[#E8A33D]/10 px-1.5 py-0.5 font-sans text-[11px] font-medium text-[#151517] dark:text-[#E8A33D]">
                  Focused
                </span>
              )}
              {isReady && (
                <span className="inline-flex items-center gap-1 font-sans text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Ready</span>
                </span>
              )}
            </div>

            <div className="relative mt-2">
              <label htmlFor={`clip-title-${clip.id}`} className="sr-only">
                Clip title
              </label>
              <input
                id={`clip-title-${clip.id}`}
                type="text"
                maxLength={100}
                value={clip.title}
                onChange={(e) => onUpdateTitle(clip.id, e.target.value)}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    onUpdateTitle(clip.id, `Highlight Clip ${index + 1}`);
                  }
                }}
                placeholder="Enter clip title..."
                className="min-h-[44px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] pl-3 pr-9 font-display text-base font-semibold leading-snug text-[#151517] transition-colors hover:border-[#64625D] focus:border-[#E8A33D] focus:bg-white focus-visible:outline-none dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93] dark:focus:bg-[#1C1C1F]"
              />
              <Pencil
                className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64625D] dark:text-[#8C8C93]"
                aria-hidden="true"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(clip.id);
            }}
            disabled={isBusyThisClip}
            aria-label={`Delete ${clip.title}`}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#8C8C93] dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Virality Score Breakdown Popover + AI Re-score */}
        {isWhyOpen && (
          <div className="mt-3 space-y-2.5 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 text-xs dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold tabular-nums text-[#151517] dark:text-[#F2F0EA]">
                  Virality {score}/100
                </span>
                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${scoreInlineTone}`}>
                  {scoreTier}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {onScoreClip && (
                  <button
                    type="button"
                    disabled={isScoringClip || isBusyThisClip}
                    onClick={() => onScoreClip(clip.id)}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#E8A33D] hover:underline disabled:opacity-45"
                  >
                    {isScoringClip ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        <span>Scoring...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        <span>Re-score</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsWhyOpen(false)}
                  className="text-[11px] font-medium text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
                >
                  Hide
                </button>
              </div>
            </div>

            <p className="leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
              {clip.virality_reason || clip.hook_reason}
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {(
                [
                  ['Hook', subScores.hook],
                  ['Emotion', subScores.emotion],
                  ['Flow', subScores.flow],
                  ['Shareability', subScores.shareability],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between font-mono text-[10px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                    <span>{label}</span>
                    <span className="text-[#151517] dark:text-[#F2F0EA]">{val}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-[#DFDCD2] dark:bg-[#2A2A2E]">
                    <div
                      className={`h-full rounded-full ${scoreBarColor}`}
                      style={{ width: `${Math.max(10, Math.min(100, val))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-2.5 flex items-start justify-between gap-2">
          <p className="text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
            {clip.hook_reason}
          </p>
          {onScoreClip && !isWhyOpen && (
            <button
              type="button"
              disabled={isScoringClip || isBusyThisClip}
              onClick={() => onScoreClip(clip.id)}
              title="Compute live 0-100 virality score breakdown with Gemini"
              className="shrink-0 font-mono text-[11px] font-medium text-[#E8A33D] hover:underline disabled:opacity-45"
            >
              {isScoringClip ? 'Scoring...' : 'Re-score'}
            </button>
          )}
        </div>

        {/* Hook Detection Highlight + Actions */}
        {(clip.hook_line || clip.addHookTitleCard) && (
          <div className="mt-3 space-y-2 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#E8A33D]">
                <Scissors className="h-3 w-3" aria-hidden="true" />
                <span>Detected opening hook</span>
              </span>
              {typeof clip.hook_start_seconds === 'number' && (
                <span className="font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                  @{formatTimecode(clip.hook_start_seconds)}
                </span>
              )}
            </div>

            {clip.hook_line && (
              <p className="text-xs font-medium leading-relaxed text-[#151517] dark:text-[#F2F0EA]">
                &ldquo;{clip.hook_line}&rdquo;
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canMoveHookToStart && !clip.hookMovedToStart && (
                <button
                  type="button"
                  disabled={isBusyThisClip}
                  onClick={() => onMoveHookToStart(clip.id)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#E8A33D]/50 bg-[#E8A33D]/10 px-2.5 text-[11px] font-medium text-[#151517] transition-colors hover:bg-[#E8A33D] hover:text-[#0E0E0F] disabled:opacity-45 dark:text-[#E8A33D] dark:hover:text-[#0E0E0F]"
                >
                  <ArrowUpToLine className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Move hook to start</span>
                </button>
              )}

              {clip.hookMovedToStart && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Starts on hook</span>
                </span>
              )}

              <button
                type="button"
                role="switch"
                aria-checked={Boolean(clip.addHookTitleCard)}
                disabled={isBusyThisClip}
                onClick={() => onToggleHookTitleCard(clip.id, !clip.addHookTitleCard)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-45 ${
                  clip.addHookTitleCard
                    ? 'border-[#E8A33D] bg-[#E8A33D]/15 text-[#151517] dark:text-[#E8A33D]'
                    : 'border-[#DFDCD2] bg-white text-[#64625D] hover:text-[#151517] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                }`}
              >
                <span>Hook card {clip.addHookTitleCard ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </div>
        )}

        {clip.caption_text && (
          <p className="mt-3 line-clamp-2 border-t border-[#DFDCD2] pt-3 text-xs leading-relaxed text-[#64625D] dark:border-[#2A2A2E] dark:text-[#8C8C93]">
            <span className="font-medium text-[#151517] dark:text-[#F2F0EA]">
              Caption{clip.captionLanguage ? ` (${clip.captionLanguage})` : ''}:{' '}
            </span>
            {clip.caption_text}
          </p>
        )}

        {/* Expandable Social Metadata & Generator */}
        <div className="mt-3 border-t border-[#DFDCD2] pt-3 dark:border-[#2A2A2E]">
          <button
            type="button"
            aria-expanded={isSocialOpen}
            onClick={() => setIsSocialOpen((prev) => !prev)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3.5 py-2 text-left text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
          >
            <span className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              <span>Social title, description &amp; hashtags</span>
            </span>
            {isSocialOpen ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {isSocialOpen && (
            <div className="mt-2.5 space-y-2.5 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              {clip.suggestedTitles && clip.suggestedTitles.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[#64625D] dark:text-[#8C8C93]">
                    Alternate titles (tap to apply):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {clip.suggestedTitles.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onUpdateTitle(clip.id, t)}
                        className="rounded-md border border-[#DFDCD2] bg-white px-2.5 py-1 text-left text-[11px] font-medium text-[#151517] hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                {clip.description || 'Generate platform-ready description and hashtags for this clip.'}
              </p>

              {hashtagsText && (
                <p className="font-mono text-[11px] text-[#E8A33D]">
                  {hashtagsText}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isGeneratingMetadata}
                  onClick={() => onGenerateMetadata(clip.id, 'shorts')}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#E8A33D]/50 bg-[#E8A33D]/10 px-3 text-xs font-medium text-[#151517] transition-colors hover:bg-[#E8A33D] hover:text-[#0E0E0F] disabled:opacity-45 dark:text-[#E8A33D] dark:hover:text-[#0E0E0F]"
                >
                  {isGeneratingMetadata ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>Generating ({captionLanguage})...</span>
                    </>
                  ) : (
                    <>
                      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Generate copy</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(
                      `${clip.title}\n\n${clip.description || ''}\n\n${hashtagsText}`.trim(),
                      () => {
                        setCopiedSocial(true);
                        setTimeout(() => setCopiedSocial(false), 2000);
                      },
                    )
                  }
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#DFDCD2] bg-white px-3 text-xs font-medium text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
                >
                  {copiedSocial ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
                      <span>Copy all</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Expandable Timestamped Transcript & Tap-to-Trim */}
        <div className="mt-3 border-t border-[#DFDCD2] pt-3 dark:border-[#2A2A2E]">
          <button
            type="button"
            aria-expanded={isTranscriptOpen}
            onClick={() => setIsTranscriptOpen((prev) => !prev)}
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3.5 py-2 text-left text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              <span>Transcript</span>
              <span className="font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                ({transcriptList.length} phrase{transcriptList.length === 1 ? '' : 's'})
              </span>
            </span>
            {isTranscriptOpen ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {isTranscriptOpen && (
            <div className="mt-2.5 space-y-2.5 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                  Tap a phrase to set{' '}
                  <span className="font-medium text-[#E8A33D]">
                    {trimTarget === 'start' ? 'start' : 'end'}
                  </span>{' '}
                  time
                </span>

                <div
                  role="group"
                  aria-label="Choose whether tapping a phrase sets start or end time"
                  className="inline-flex rounded-md border border-[#DFDCD2] bg-white p-0.5 dark:border-[#2A2A2E] dark:bg-[#151517]"
                >
                  <button
                    type="button"
                    onClick={() => setTrimTarget('start')}
                    className={`min-h-[32px] rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      trimTarget === 'start'
                        ? 'bg-[#E8A33D] text-[#0E0E0F]'
                        : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                    }`}
                  >
                    Set start
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrimTarget('end')}
                    className={`min-h-[32px] rounded px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      trimTarget === 'end'
                        ? 'bg-[#E8A33D] text-[#0E0E0F]'
                        : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                    }`}
                  >
                    Set end
                  </button>
                </div>
              </div>

              {transcriptList.length === 0 ? (
                <p className="py-2 text-xs text-[#64625D] dark:text-[#8C8C93]">
                  No phrase-level transcript available for this clip.
                </p>
              ) : (
                <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {transcriptList.map((seg, segIdx) => {
                    const isInside =
                      seg.end_seconds > clip.start_seconds && seg.start_seconds < clip.end_seconds;
                    const fillerCount = seg.filler_words?.length || 0;
                    return (
                      <button
                        key={`${seg.start_seconds}-${segIdx}`}
                        type="button"
                        disabled={isBusyThisClip}
                        onClick={() => handleTapTranscriptPhrase(seg)}
                        className={`flex min-h-[42px] w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-45 ${
                          isInside
                            ? 'border-[#E8A33D]/50 bg-[#E8A33D]/10 text-[#151517] dark:text-[#F2F0EA]'
                            : 'border-[#DFDCD2] bg-white text-[#64625D] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-[#E8A33D]">
                          {formatTimecode(seg.start_seconds)}
                        </span>
                        <span className="flex-1 leading-relaxed">
                          {seg.text}
                          {fillerCount > 0 && (
                            <span className="ml-1.5 font-mono text-[10px] text-[#64625D] dark:text-[#8C8C93]">
                              ({fillerCount} filler{fillerCount === 1 ? '' : 's'})
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Start & End Time Editors with Number Inputs + Nudge Buttons */}
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#DFDCD2] pt-4 sm:grid-cols-2 dark:border-[#2A2A2E]">
          <div className="space-y-1.5">
            <label
              htmlFor={`start-${clip.id}`}
              className="flex items-center justify-between text-xs font-medium text-[#64625D] dark:text-[#8C8C93]"
            >
              <span>Start (sec)</span>
              <span className="font-mono tabular-nums">
                {formatTimecode(clip.start_seconds)}
              </span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isBusyThisClip || clip.start_seconds <= 0}
                onClick={() => commitStart(clip.start_seconds - 1)}
                aria-label="Move start back 1 second"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                -1s
              </button>
              <input
                id={`start-${clip.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={Math.max(0, clip.end_seconds - 1)}
                value={startDraft}
                disabled={isBusyThisClip}
                onChange={(e) => setStartDraft(e.target.value)}
                onBlur={() => commitStart(Number(startDraft))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitStart(Number(startDraft));
                }}
                className="min-h-[44px] w-full min-w-0 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2.5 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
              />
              <button
                type="button"
                disabled={isBusyThisClip || clip.start_seconds >= clip.end_seconds - 1}
                onClick={() => commitStart(clip.start_seconds + 1)}
                aria-label="Move start forward 1 second"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                +1s
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`end-${clip.id}`}
              className="flex items-center justify-between text-xs font-medium text-[#64625D] dark:text-[#8C8C93]"
            >
              <span>End (sec)</span>
              <span className="font-mono tabular-nums">
                {formatTimecode(clip.end_seconds)}
              </span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isBusyThisClip || clip.end_seconds <= clip.start_seconds + 1}
                onClick={() => commitEnd(clip.end_seconds - 1)}
                aria-label="Move end back 1 second"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                -1s
              </button>
              <input
                id={`end-${clip.id}`}
                type="number"
                inputMode="numeric"
                min={clip.start_seconds + 1}
                max={maxVideoEnd < Number.MAX_SAFE_INTEGER ? maxVideoEnd : undefined}
                value={endDraft}
                disabled={isBusyThisClip}
                onChange={(e) => setEndDraft(e.target.value)}
                onBlur={() => commitEnd(Number(endDraft))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEnd(Number(endDraft));
                }}
                className="min-h-[44px] w-full min-w-0 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2.5 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
              />
              <button
                type="button"
                disabled={isBusyThisClip || clip.end_seconds >= maxVideoEnd}
                onClick={() => commitEnd(clip.end_seconds + 1)}
                aria-label="Move end forward 1 second"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                +1s
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <label htmlFor={`length-${clip.id}`} className="text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
              Clip length (sec)
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isBusyThisClip || clipDuration <= 1}
                onClick={() => commitLength(clipDuration - 5)}
                aria-label="Shorten clip by 5 seconds"
                className="flex min-h-[40px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                -5s
              </button>
              <input
                id={`length-${clip.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={maxVideoEnd < Number.MAX_SAFE_INTEGER ? maxVideoEnd : undefined}
                value={lengthDraft}
                disabled={isBusyThisClip}
                onChange={(e) => setLengthDraft(e.target.value)}
                onBlur={() => commitLength(Number(lengthDraft))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLength(Number(lengthDraft));
                }}
                className="min-h-[40px] w-20 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2 text-center font-mono text-sm font-medium tabular-nums text-[#E8A33D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]"
              />
              <button
                type="button"
                disabled={isBusyThisClip || (maxVideoEnd < Number.MAX_SAFE_INTEGER && clipDuration >= maxVideoEnd)}
                onClick={() => commitLength(clipDuration + 5)}
                aria-label="Extend clip by 5 seconds"
                className="flex min-h-[40px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium tabular-nums text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                +5s
              </button>
            </div>
          </div>
        </div>

        {/* Silence & Filler Word Removal Toggle */}
        <div className="mt-4 space-y-1.5 border-t border-[#DFDCD2] pt-3 dark:border-[#2A2A2E]">
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(clip.removeSilencesAndFillers)}
            disabled={isBusyThisClip}
            onClick={() =>
              onToggleRemoveSilences(clip.id, !Boolean(clip.removeSilencesAndFillers))
            }
            className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-50"
          >
            <div className="min-w-0">
              <span className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                Remove silences and filler words
              </span>
              <span className="block font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                {detectedFillerCount > 0
                  ? `${detectedFillerCount} filler${detectedFillerCount === 1 ? '' : 's'} detected · + silence detect`
                  : 'FFmpeg silencedetect + AI filler spans'}
              </span>
            </div>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                clip.removeSilencesAndFillers
                  ? 'bg-[#E8A33D]'
                  : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  clip.removeSilencesAndFillers ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>

          {isReady && clip.removeSilencesAndFillers && typeof clip.removedSeconds === 'number' && (
            <p className="flex items-center gap-1.5 px-1 font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {clip.removedSeconds > 0
                  ? `Removed ${clip.removedSeconds.toFixed(1)}s of silences & fillers`
                  : 'No silences or fillers >0.45s found'}
              </span>
            </p>
          )}
        </div>

        {hasOverlap && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[#E8A33D]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Time range overlaps another clip.</span>
          </div>
        )}

        {/* Cutting Progress Bar */}
        {clip.cutStatus !== 'idle' && (
          <div className="mt-4 space-y-1.5 border-t border-[#DFDCD2] pt-3 dark:border-[#2A2A2E]">
            <div className="flex items-center justify-between text-xs">
              {clip.cutStatus === 'queued' && (
                <span className="text-[#64625D] dark:text-[#8C8C93]">Queued in worker</span>
              )}
              {clip.cutStatus === 'cutting' && (
                <span className="flex items-center gap-1.5 font-medium text-[#E8A33D]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>{clip.cutStageLabel || 'Cutting in worker'}</span>
                </span>
              )}
              {clip.cutStatus === 'done' && (
                <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Auto-edited &amp; ready</span>
                </span>
              )}
              {clip.cutStatus === 'error' && (
                <span className="text-red-600 dark:text-red-400">{clip.cutError || 'Cutting failed'}</span>
              )}

              <span className="font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                {clip.cutStatus === 'error' ? '' : `${clip.cutProgress}%`}
              </span>
            </div>

            {clip.cutStatus !== 'error' && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#1C1C1F]">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 motion-reduce:transition-none ${
                    clip.cutStatus === 'done'
                      ? 'bg-emerald-600 dark:bg-emerald-500'
                      : 'bg-[#E8A33D]'
                  }`}
                  style={{ width: `${clip.cutProgress}%` }}
                />
              </div>
            )}

            {isReady && appliedEditSummary.length > 0 && (
              <p className="pt-1 font-mono text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                Applied: {appliedEditSummary.join(' · ')}
              </p>
            )}

            {hasPendingAutoEditChanges && (
              <p className="pt-0.5 text-xs font-medium text-[#E8A33D]">
                Settings changed — tap Re-edit to update this clip.
              </p>
            )}
          </div>
        )}

        {/* Action Footer */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {isReady ? (
            <>
              <button
                type="button"
                onClick={() => onSaveToDevice(clip, index)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-3.5 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Download</span>
              </button>

              <button
                type="button"
                disabled={!canCutLocally || isCuttingAny}
                onClick={() => onReEditClip(clip.id)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E8A33D]/50 bg-[#E8A33D]/10 px-3.5 py-2 text-sm font-medium text-[#151517] transition-colors hover:bg-[#E8A33D] hover:text-[#0E0E0F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-45 dark:text-[#E8A33D] dark:hover:text-[#0E0E0F]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Re-edit</span>
              </button>

              <button
                type="button"
                onClick={() => void onShareClip(clip, index)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
              >
                <Share2 className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={() => onDownloadSrt(clip, index)}
                title={`Download ${clip.captionLanguage || 'English'} .SRT captions`}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
              >
                <Captions className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                <span>.SRT</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onCutClip(clip.id)}
                disabled={!canCutLocally || isCuttingAny}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-4 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {clip.cutStatus === 'error' ? (
                  <>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>Retry cut</span>
                  </>
                ) : isBusyThisClip ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Cutting...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" aria-hidden="true" />
                    <span>{canCutLocally ? 'Cut & Edit' : 'Attach video to cut'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => onDownloadSrt(clip, index)}
                title={`Download ${clip.captionLanguage || 'English'} .SRT captions`}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
              >
                <Captions className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                <span>.SRT</span>
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
