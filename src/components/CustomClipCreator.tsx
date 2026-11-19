import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Plus,
  Scissors,
} from 'lucide-react';
import type { AutoEditSettings, VideoAsset } from '../types/clip';
import { formatTimecode } from '../utils/format';

export interface CustomClipInput {
  startSeconds: number;
  endSeconds: number;
  title: string;
  captionText: string;
  cutAndEditNow: boolean;
}

interface CustomClipCreatorProps {
  video: VideoAsset;
  autoEdit: AutoEditSettings;
  disabled: boolean;
  onCreateClip: (input: CustomClipInput) => void;
}

/**
 * Manual any-length clip creator with source scrubber and instant cut+edit.
 */
export function CustomClipCreator({
  video,
  autoEdit,
  disabled,
  onCreateClip,
}: CustomClipCreatorProps) {
  const maxDuration = Math.max(1, Math.floor(video.durationSeconds));
  const defaultEnd = Math.min(maxDuration, 15);

  const [isExpanded, setIsExpanded] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(defaultEnd);
  const [title, setTitle] = useState('');
  const [captionText, setCaptionText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayhead, setCurrentPlayhead] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const maxSec = Math.max(1, Math.floor(video.durationSeconds));
    setStartSec(0);
    setEndSec(Math.min(maxSec, 15));
    setTitle('');
    setCaptionText('');
    setIsPlaying(false);
    setCurrentPlayhead(0);
  }, [video.objectUrl, video.durationSeconds]);

  const durationSec = Math.max(1, endSec - startSec);

  const commitStart = (raw: number) => {
    const safe = Number.isFinite(raw) ? Math.round(raw) : startSec;
    const clamped = Math.max(0, Math.min(Math.max(0, endSec - 1), safe));
    setStartSec(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
      setCurrentPlayhead(clamped);
    }
  };

  const commitEnd = (raw: number) => {
    const safe = Number.isFinite(raw) ? Math.round(raw) : endSec;
    const clamped = Math.max(Math.min(maxDuration, startSec + 1), Math.min(maxDuration, safe));
    setEndSec(clamped);
  };

  const commitExactDuration = (rawDuration: number) => {
    const safeDur = Number.isFinite(rawDuration) ? Math.round(rawDuration) : durationSec;
    const clampedDur = Math.max(1, Math.min(maxDuration, safeDur));
    if (startSec + clampedDur <= maxDuration) {
      setEndSec(startSec + clampedDur);
    } else {
      const nextStart = Math.max(0, maxDuration - clampedDur);
      setStartSec(nextStart);
      setEndSec(maxDuration);
    }
  };

  const togglePreviewPlay = async () => {
    const vid = videoRef.current;
    if (!vid) return;

    if (!vid.paused) {
      vid.pause();
      setIsPlaying(false);
      return;
    }

    if (vid.currentTime < startSec || vid.currentTime >= endSec - 0.1) {
      vid.currentTime = startSec;
    }

    try {
      await vid.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentPlayhead(vid.currentTime);
    if (vid.currentTime >= endSec) {
      vid.pause();
      vid.currentTime = startSec;
      setIsPlaying(false);
    }
  };

  const setStartFromPlayhead = () => {
    const vid = videoRef.current;
    const target = vid ? Math.floor(vid.currentTime) : Math.floor(currentPlayhead);
    commitStart(target);
  };

  const setEndFromPlayhead = () => {
    const vid = videoRef.current;
    const target = vid ? Math.ceil(vid.currentTime) : Math.ceil(currentPlayhead);
    commitEnd(target);
  };

  const handleSubmit = (cutAndEditNow: boolean) => {
    if (disabled) return;
    onCreateClip({
      startSeconds: startSec,
      endSeconds: endSec,
      title: title.trim() || `Custom Clip (${durationSec}s)`,
      captionText: captionText.trim(),
      cutAndEditNow,
    });
  };

  const startPct = (startSec / maxDuration) * 100;
  const widthPct = Math.max(1.5, ((endSec - startSec) / maxDuration) * 100);

  return (
    <section
      aria-label="Custom any-length clip creator"
      className="rounded-xl border border-[#DFDCD2] bg-white p-5 sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
            <Scissors className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]">
              Custom cut &amp; edit (any length)
            </h2>
            <p className="text-sm text-[#64625D] dark:text-[#8C8C93]">
              Pick any start/end or exact seconds ({formatTimecode(1)} to {formatTimecode(maxDuration)}), auto-edit, and export as an MP4 file.
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={isExpanded ? 'Collapse custom clip creator' : 'Expand custom clip creator'}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] transition-colors hover:border-[#64625D] hover:text-[#151517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-5 grid gap-5 border-t border-[#DFDCD2] pt-5 lg:grid-cols-12 dark:border-[#2A2A2E]">
          <div className="space-y-3 lg:col-span-5">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#0E0E0F]">
              <video
                ref={videoRef}
                src={video.objectUrl}
                playsInline
                preload="metadata"
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onClick={() => void togglePreviewPlay()}
                className="h-full w-full cursor-pointer object-contain"
              />

              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-white/10 bg-[#0E0E0F]/85 px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => void togglePreviewPlay()}
                  aria-label={isPlaying ? 'Pause custom range preview' : 'Play custom range preview'}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-[#F2F0EA] transition-colors hover:bg-[#E8A33D] hover:text-[#0E0E0F]"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5" />}
                </button>

                <input
                  type="range"
                  min={0}
                  max={maxDuration}
                  step={0.5}
                  value={currentPlayhead}
                  aria-label="Scrub source video playhead"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setCurrentPlayhead(next);
                    if (videoRef.current) videoRef.current.currentTime = next;
                  }}
                  className="amber-slider flex-1"
                />

                <span className="shrink-0 rounded border border-[#2A2A2E] bg-[#151517] px-2 py-0.5 font-mono text-xs tabular-nums text-[#F2F0EA]">
                  {formatTimecode(currentPlayhead)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#1C1C1F]">
                <div
                  className="absolute inset-y-0 rounded-full bg-[#E8A33D] transition-[left,width] duration-150 motion-reduce:transition-none"
                  style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={setStartFromPlayhead}
                  className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93] whitespace-nowrap"
                >
                  Set start ({formatTimecode(currentPlayhead)})
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={setEndFromPlayhead}
                  className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93] whitespace-nowrap"
                >
                  Set end ({formatTimecode(currentPlayhead)})
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="custom-clip-start" className="flex items-center justify-between text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                  <span>Start (sec)</span>
                  <span className="font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">{formatTimecode(startSec)}</span>
                </label>
                <input
                  id="custom-clip-start"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={Math.max(0, endSec - 1)}
                  disabled={disabled}
                  value={startSec}
                  onChange={(e) => commitStart(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-clip-end" className="flex items-center justify-between text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                  <span>End (sec)</span>
                  <span className="font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">{formatTimecode(endSec)}</span>
                </label>
                <input
                  id="custom-clip-end"
                  type="number"
                  inputMode="numeric"
                  min={Math.min(maxDuration, startSec + 1)}
                  max={maxDuration}
                  disabled={disabled}
                  value={endSec}
                  onChange={(e) => commitEnd(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-clip-duration" className="flex items-center justify-between text-xs font-medium text-[#E8A33D]">
                  <span>Length (sec)</span>
                  <span className="font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">max {maxDuration}s</span>
                </label>
                <input
                  id="custom-clip-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxDuration}
                  disabled={disabled}
                  value={durationSec}
                  onChange={(e) => commitExactDuration(Number(e.target.value))}
                  className="min-h-[46px] w-full rounded-lg border border-[#E8A33D]/60 bg-[#F7F5F0] px-3 text-center font-mono text-sm font-semibold tabular-nums text-[#E8A33D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-45 dark:bg-[#0E0E0F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="custom-clip-title" className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                  Clip title <span className="font-normal text-[#64625D] dark:text-[#8C8C93]">(optional)</span>
                </label>
                <input
                  id="custom-clip-title"
                  type="text"
                  maxLength={100}
                  disabled={disabled}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Custom Clip (${durationSec}s)`}
                  className="min-h-[46px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3.5 text-sm text-[#151517] placeholder:text-[#64625D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-clip-caption" className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                  Caption text <span className="font-normal text-[#64625D] dark:text-[#8C8C93]">(optional · burned)</span>
                </label>
                <input
                  id="custom-clip-caption"
                  type="text"
                  maxLength={240}
                  disabled={disabled}
                  value={captionText}
                  onChange={(e) => setCaptionText(e.target.value)}
                  placeholder="Text to burn into video & .SRT..."
                  className="min-h-[46px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3.5 text-sm text-[#151517] placeholder:text-[#64625D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-[#DFDCD2] pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E]">
              <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                Output: {durationSec}s · {autoEdit.reframeVertical ? '9:16' : 'Original'}
                {autoEdit.removeSilences ? ' · Trim silences' : ''}
                {autoEdit.normalizeAudio ? ' · Normalized' : ''}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSubmit(false)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93] whitespace-nowrap"
                >
                  <Plus className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                  <span>Add to list</span>
                </button>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSubmit(true)}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-5 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-initial whitespace-nowrap"
                >
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  <span>Cut &amp; edit {durationSec}s file</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
