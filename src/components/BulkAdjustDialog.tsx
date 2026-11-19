import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { ClipItem } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface BulkAdjustDialogProps {
  isOpen: boolean;
  clips: ClipItem[];
  maxDurationSeconds?: number;
  onClose: () => void;
  onApply: (startDelta: number, endDelta: number) => void;
}

const PRESETS: { label: string; startDelta: number; endDelta: number }[] = [
  { label: 'Pad +1s both sides', startDelta: -1, endDelta: 1 },
  { label: 'Pad +2s both sides', startDelta: -2, endDelta: 2 },
  { label: 'Trim 1s both sides', startDelta: 1, endDelta: -1 },
  { label: 'Shift all -1s', startDelta: -1, endDelta: -1 },
  { label: 'Shift all +1s', startDelta: 1, endDelta: 1 },
];

export function computeAdjustedRange(
  clip: ClipItem,
  startDelta: number,
  endDelta: number,
  maxDurationSeconds?: number,
): { start: number; end: number } {
  const upperBound =
    typeof maxDurationSeconds === 'number' && maxDurationSeconds > 0
      ? Math.floor(maxDurationSeconds)
      : Number.MAX_SAFE_INTEGER;

  let nextStart = Math.max(0, Math.round(clip.start_seconds + startDelta));
  let nextEnd = Math.min(upperBound, Math.round(clip.end_seconds + endDelta));

  if (nextEnd - nextStart < 1) {
    if (nextStart + 1 <= upperBound) {
      nextEnd = nextStart + 1;
    } else {
      nextEnd = upperBound;
      nextStart = Math.max(0, upperBound - 1);
    }
  }

  return { start: nextStart, end: nextEnd };
}

export function BulkAdjustDialog({
  isOpen,
  clips,
  maxDurationSeconds,
  onClose,
  onApply,
}: BulkAdjustDialogProps) {
  const [startDelta, setStartDelta] = useState(0);
  const [endDelta, setEndDelta] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setStartDelta(0);
    setEndDelta(0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const previewClips = clips.slice(0, 3);
  const hasChange = startDelta !== 0 || endDelta !== 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-adjust-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-xl border border-[#DFDCD2] bg-white p-5 sm:rounded-xl sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="bulk-adjust-title" className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]">
                Bulk adjust timings
              </h2>
              <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                Apply consistent padding or shift across all {clips.length} clips at once.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk adjust dialog"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <span className="block text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">Quick presets</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const isSelected =
                startDelta === preset.startDelta && endDelta === preset.endDelta;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setStartDelta(preset.startDelta);
                    setEndDelta(preset.endDelta);
                  }}
                  className={`min-h-[40px] rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
                    isSelected
                      ? 'border-[#E8A33D] bg-[#E8A33D]/15 text-[#151517] dark:text-[#E8A33D]'
                      : 'border-[#DFDCD2] bg-[#EFECE4] text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-[#DFDCD2] pt-4 sm:grid-cols-2 dark:border-[#2A2A2E]">
          <div className="space-y-1.5">
            <label htmlFor="bulk-start-offset" className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
              Start offset (seconds)
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStartDelta((d) => d - 1)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                -1s
              </button>
              <input
                id="bulk-start-offset"
                type="number"
                value={startDelta}
                onChange={(e) => setStartDelta(Math.round(Number(e.target.value) || 0))}
                className="min-h-[44px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
              />
              <button
                type="button"
                onClick={() => setStartDelta((d) => d + 1)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                +1s
              </button>
            </div>
            <p className="text-[11px] text-[#64625D] dark:text-[#8C8C93]">Negative adds lead-in earlier</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="bulk-end-offset" className="block text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
              End offset (seconds)
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setEndDelta((d) => d - 1)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                -1s
              </button>
              <input
                id="bulk-end-offset"
                type="number"
                value={endDelta}
                onChange={(e) => setEndDelta(Math.round(Number(e.target.value) || 0))}
                className="min-h-[44px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2 text-center font-mono text-sm tabular-nums text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
              />
              <button
                type="button"
                onClick={() => setEndDelta((d) => d + 1)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] font-mono text-xs font-medium text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                +1s
              </button>
            </div>
            <p className="text-[11px] text-[#64625D] dark:text-[#8C8C93]">Positive extends tail later</p>
          </div>
        </div>

        {previewClips.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-[#DFDCD2] pt-4 dark:border-[#2A2A2E]">
            <span className="block text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">Preview</span>
            <ul className="space-y-1.5">
              {previewClips.map((clip, i) => {
                const next = computeAdjustedRange(clip, startDelta, endDelta, maxDurationSeconds);
                return (
                  <li
                    key={clip.id}
                    className="flex items-center justify-between gap-3 text-xs text-[#151517] dark:text-[#F2F0EA]"
                  >
                    <span className="truncate">
                      {i + 1}. {clip.title}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                      {formatTimecode(clip.start_seconds)}–{formatTimecode(clip.end_seconds)}
                      <span className="mx-1.5">→</span>
                      <span className="font-semibold text-[#E8A33D]">
                        {formatTimecode(next.start)}–{formatTimecode(next.end)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasChange}
            onClick={() => {
              onApply(startDelta, endDelta);
              onClose();
            }}
            className="min-h-[44px] rounded-lg bg-[#E8A33D] px-5 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply to all {clips.length} clips
          </button>
        </div>
      </div>
    </div>
  );
}
