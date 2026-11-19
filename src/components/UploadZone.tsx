import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  Clock,
  FolderOpen,
  Globe,
  Link2,
  Loader2,
  Play,
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import {
  MAX_UPLOAD_MB,
  type InputMode,
  type RecentProjectSummary,
  type VideoAsset,
} from '../types/clip';
import { formatBytes, formatTimecode } from '../utils/format';
import { classifyVideoUrl } from '../utils/youtube';

export interface ActiveLinkTarget {
  kind: 'youtube' | 'direct';
  rawUrl: string;
  canonicalUrl: string;
  youtubeVideoId?: string;
}

interface UploadZoneProps {
  inputMode: InputMode;
  onModeChange: (mode: InputMode) => void;
  video: VideoAsset | null;
  activeLink: ActiveLinkTarget | null;
  pendingReuseCount: number;
  isBusy: boolean;
  isLoadingSample?: boolean;
  selectionError: string | null;
  recentProjects: RecentProjectSummary[];
  onClearRecentProjects: () => void;
  onSelectFile: (file: File) => void;
  onTrySampleVideo?: () => void;
  onSubmitLink: (target: ActiveLinkTarget) => void;
  onClearLink: () => void;
  onClearSelectionError: () => void;
  onClearVideo: () => void;
  onDismissPendingReuse: () => void;
}

/**
 * Step 1 Source Selector & Quiet Luxury Hero:
 * - Left-aligned serif headline + single honest supporting line
 * - Upload / Paste-link control + secondary "Try with a sample video" action
 * - Clean hairline 1 GB drop zone + Recent projects list
 */
export function UploadZone({
  inputMode,
  onModeChange,
  video,
  activeLink,
  pendingReuseCount,
  isBusy,
  isLoadingSample = false,
  selectionError,
  recentProjects,
  onClearRecentProjects,
  onSelectFile,
  onTrySampleVideo,
  onSubmitLink,
  onClearLink,
  onClearSelectionError,
  onClearVideo,
  onDismissPendingReuse,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlDraft, setUrlDraft] = useState(activeLink?.rawUrl || '');
  const [linkValidationError, setLinkValidationError] = useState<string | null>(null);

  const hasSelectedSource = Boolean(video || activeLink);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onSelectFile(files[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isBusy) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isBusy) return;
    handleFiles(e.dataTransfer.files);
  };

  const handleLinkFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isBusy) return;

    const classified = classifyVideoUrl(urlDraft);
    if (classified.kind === 'invalid') {
      setLinkValidationError(classified.reason);
      return;
    }

    setLinkValidationError(null);
    if (classified.kind === 'youtube') {
      onSubmitLink({
        kind: 'youtube',
        rawUrl: urlDraft.trim(),
        canonicalUrl: classified.canonicalUrl,
        youtubeVideoId: classified.videoId,
      });
    } else {
      onSubmitLink({
        kind: 'direct',
        rawUrl: urlDraft.trim(),
        canonicalUrl: classified.url,
      });
    }
  };

  return (
    <section aria-label="Video source" className="space-y-6">
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.mov,video/mp4,video/quicktime"
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Left-aligned Quiet Luxury Hero (before source is chosen) */}
      {!hasSelectedSource && (
        <div className="max-w-3xl space-y-3 pt-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[#151517] sm:text-5xl sm:leading-[1.08] [text-wrap:balance] dark:text-[#F2F0EA]">
            Cut long-form recordings into clean vertical shorts.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
            Videos are cut on your device. Audio is sent securely for transcription only with your consent.
          </p>
        </div>
      )}

      {/* Mode Switcher + Secondary Sample Video Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Choose video input method"
          className="grid w-full max-w-xs grid-cols-2 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] p-1 dark:border-[#2A2A2E] dark:bg-[#151517]"
        >
          {(['file', 'link'] as const).map((mode) => {
            const isActive = inputMode === mode;
            const Icon = mode === 'file' ? Upload : Link2;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={isBusy || isLoadingSample}
                onClick={() => onModeChange(mode)}
                className={`inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E8A33D] text-[#0E0E0F] font-semibold'
                    : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{mode === 'file' ? 'Upload file' : 'Paste link'}</span>
              </button>
            );
          })}
        </div>

        {!hasSelectedSource && onTrySampleVideo && (
          <button
            type="button"
            disabled={isBusy || isLoadingSample}
            onClick={onTrySampleVideo}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#DFDCD2] bg-white px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] whitespace-nowrap"
          >
            {isLoadingSample ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#E8A33D]" aria-hidden="true" />
                <span>Loading sample...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
                <span>Try with a sample video</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Pending YouTube timestamps ready to auto-cut banner */}
      {inputMode === 'file' && pendingReuseCount > 0 && !video && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-[#E8A33D]/50 bg-[#E8A33D]/10 p-4 text-sm text-[#151517] sm:flex-row sm:items-center sm:justify-between dark:text-[#F2F0EA]"
        >
          <p className="leading-relaxed">
            <span className="font-semibold text-[#9A6516] dark:text-[#E8A33D]">
              {pendingReuseCount} clip timestamps ready.
            </span>{' '}
            Upload the matching MP4 or MOV file below and Clip Cutter will cut them automatically.
          </p>
          <button
            type="button"
            onClick={onDismissPendingReuse}
            className="min-h-[40px] shrink-0 rounded-lg border border-[#E8A33D]/50 px-3 py-1.5 text-xs font-medium text-[#9A6516] transition-colors hover:bg-[#E8A33D]/20 dark:text-[#E8A33D] whitespace-nowrap"
          >
            Discard timestamps
          </button>
        </div>
      )}

      {selectionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="leading-relaxed">{selectionError}</p>
          </div>
          <button
            type="button"
            onClick={onClearSelectionError}
            aria-label="Dismiss error"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {inputMode === 'file' ? (
        !video ? (
          <div
            role="button"
            tabIndex={0}
            aria-label="Select or drop an MP4 or MOV video file"
            onClick={() => !isBusy && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isBusy) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] sm:min-h-[270px] sm:p-10 ${
              isDragging
                ? 'border-[#E8A33D] bg-[#E8A33D]/10'
                : 'border-[#DFDCD2] bg-white hover:border-[#E8A33D]/80 dark:border-[#2A2A2E] dark:bg-[#151517] dark:hover:border-[#E8A33D]/70 dark:hover:bg-[#1C1C1F]'
            }`}
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F]">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>

            <h2 className="font-display text-lg font-semibold text-[#151517] sm:text-xl dark:text-[#F2F0EA]">
              {isDragging ? 'Drop video to open in workspace' : 'Drop an MP4 or MOV file to begin'}
            </h2>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
              Supports uploads up to 1 GB ({MAX_UPLOAD_MB} MB). Local trimming, 9:16 framing, and .SRT export execute on your device.
            </p>

            <span className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-colors group-hover:bg-[#DDA03A]">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <span>Choose video file</span>
            </span>

            <p className="mt-4 font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              MP4 / MOV · Max 1 GB ({MAX_UPLOAD_MB} MB) · Chunked streaming enabled
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-[#DFDCD2] bg-white p-4 sm:p-5 dark:border-[#2A2A2E] dark:bg-[#151517]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-[#DFDCD2] bg-[#0E0E0F] dark:border-[#2A2A2E]">
                  <video
                    src={video.objectUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="truncate font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                    {video.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                    <span>{formatBytes(video.sizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTimecode(video.durationSeconds)}</span>
                    {video.width > 0 && video.height > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {video.width}×{video.height}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={isBusy}
                  className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] whitespace-nowrap"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={onClearVideo}
                  disabled={isBusy}
                  aria-label="Remove selected video"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] transition-colors hover:border-red-500/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93] dark:hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {(video.isLargeFile || video.isOverDurationLimit) && (
              <div
                role="status"
                className="mt-4 flex items-start gap-3 rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 p-3.5 text-sm text-[#151517] dark:text-[#F2F0EA]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
                <div className="space-y-0.5 leading-relaxed">
                  <p className="font-semibold text-[#9A6516] dark:text-[#E8A33D]">
                    Large video streaming enabled
                  </p>
                  <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                    {video.isLargeFile && video.isOverDurationLimit
                      ? 'This video is large and over 30 minutes. It streams in 8 MB chunks for AI upload and mounts via WORKERFS slice reading locally.'
                      : video.isLargeFile
                        ? 'This large file (up to 1 GB / 1024 MB) uploads in 8 MB chunks and reads via WORKERFS.'
                        : 'This video is longer than 30 minutes. Best performance is on clips up to 30 minutes; rendering speed depends on your device.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* Paste Link Tab */
        <div className="rounded-xl border border-[#DFDCD2] bg-white p-5 sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]">
          <form onSubmit={handleLinkFormSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="video-link-input"
                className="block font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]"
              >
                Paste a public YouTube link or direct MP4 URL
              </label>
              <p className="mt-1 text-sm text-[#64625D] dark:text-[#8C8C93]">
                Public YouTube links are analyzed for timestamps and transcripts; direct MP4 URLs download in-browser when allowed by CORS.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                id="video-link-input"
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
                value={urlDraft}
                disabled={isBusy}
                onChange={(e) => {
                  setUrlDraft(e.target.value);
                  if (linkValidationError) setLinkValidationError(null);
                }}
                className="min-h-[46px] flex-1 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-4 text-sm text-[#151517] placeholder:text-[#64625D]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]/70"
              />
              <button
                type="submit"
                disabled={isBusy || !urlDraft.trim()}
                className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                <span>{activeLink ? 'Update link' : 'Load link'}</span>
              </button>
            </div>

            {linkValidationError && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {linkValidationError}
              </p>
            )}
          </form>

          {activeLink && (
            <div className="mt-4 flex flex-col gap-3 border-t border-[#DFDCD2] pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E]">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F]">
                  {activeLink.kind === 'youtube' ? (
                    <Youtube className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Globe className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
                    {activeLink.kind === 'youtube'
                      ? 'Public YouTube video ready for analysis'
                      : 'Direct video URL ready to fetch & analyze'}
                  </p>
                  <p className="truncate font-mono text-xs text-[#64625D] dark:text-[#8C8C93]">
                    {activeLink.canonicalUrl}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setUrlDraft('');
                  onClearLink();
                }}
                aria-label="Clear pasted link"
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 text-xs font-medium text-[#151517] transition-colors hover:border-red-500/50 hover:text-red-600 disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:text-red-400"
              >
                <X className="h-4 w-4" />
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recent projects list when idle and saved locally */}
      {!hasSelectedSource && recentProjects.length > 0 && (
        <div className="rounded-xl border border-[#DFDCD2] bg-white p-5 dark:border-[#2A2A2E] dark:bg-[#151517]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
                Recent sessions
              </h3>
            </div>
            <button
              type="button"
              onClick={onClearRecentProjects}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-xs font-medium text-[#64625D] transition-colors hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear history</span>
            </button>
          </div>

          <div className="divide-y divide-[#DFDCD2] dark:divide-[#2A2A2E]">
            {recentProjects.map((proj) => (
              <div
                key={proj.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
              >
                <p className="truncate font-display text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                  {proj.name}
                </p>
                <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                  {proj.clipCount} clips · {proj.cutCount} cut
                  {typeof proj.avgViralityScore === 'number'
                    ? ` · Avg score ${proj.avgViralityScore}`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
