import { AlertTriangle, X } from 'lucide-react';
import type { ClipItem } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface AllTimelinesStripProps {
  clips: ClipItem[];
  totalDuration: number;
  overlappingIds: Set<string>;
  onSelectClip?: (clipId: string) => void;
  onClose: () => void;
}

interface OverlapZone {
  start: number;
  end: number;
}

function computeOverlapZones(clips: ClipItem[]): OverlapZone[] {
  const sorted = [...clips].sort((a, b) => a.start_seconds - b.start_seconds);
  const zones: OverlapZone[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start_seconds >= sorted[i].end_seconds) break;
      const start = Math.max(sorted[i].start_seconds, sorted[j].start_seconds);
      const end = Math.min(sorted[i].end_seconds, sorted[j].end_seconds);
      if (end > start) {
        zones.push({ start, end });
      }
    }
  }

  return zones;
}

export function AllTimelinesStrip({
  clips,
  totalDuration,
  overlappingIds,
  onSelectClip,
  onClose,
}: AllTimelinesStripProps) {
  if (clips.length === 0) return null;

  const safeTotal = Math.max(1, totalDuration, ...clips.map((c) => c.end_seconds));
  const sortedClips = [...clips].sort((a, b) => a.start_seconds - b.start_seconds);
  const overlapZones = computeOverlapZones(clips);
  const hasOverlaps = overlappingIds.size > 0;

  return (
    <section
      aria-label="All clip timelines overview"
      className="border-b border-[#DFDCD2] bg-white dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-display text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
              All clip timelines
            </h2>
            <span aria-hidden="true" className="text-[#64625D] dark:text-[#8C8C93]">
              ·
            </span>
            <span className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              {clips.length} clips across {formatTimecode(safeTotal)}
            </span>
            {hasOverlaps ? (
              <>
                <span aria-hidden="true" className="text-[#64625D] dark:text-[#8C8C93]">
                  ·
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{overlappingIds.size} overlapping</span>
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="text-[#64625D] dark:text-[#8C8C93]">
                  ·
                </span>
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">No overlaps</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Hide all timelines"
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
            <span>Combined coverage</span>
            <span>00:00 – {formatTimecode(safeTotal)}</span>
          </div>

          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#1C1C1F]">
            <span aria-hidden="true" className="absolute inset-y-0 left-1/4 w-px bg-black/10 dark:bg-white/10" />
            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-black/10 dark:bg-white/10" />
            <span aria-hidden="true" className="absolute inset-y-0 left-3/4 w-px bg-black/10 dark:bg-white/10" />

            {sortedClips.map((clip) => {
              const left = Math.max(0, Math.min(99, (clip.start_seconds / safeTotal) * 100));
              const width = Math.max(
                1.2,
                Math.min(100 - left, ((clip.end_seconds - clip.start_seconds) / safeTotal) * 100),
              );
              return (
                <div
                  key={`combined-${clip.id}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className="absolute inset-y-0 rounded-sm bg-[#E8A33D] opacity-90"
                />
              );
            })}

            {overlapZones.map((zone, idx) => {
              const left = Math.max(0, Math.min(99, (zone.start / safeTotal) * 100));
              const width = Math.max(
                1.2,
                Math.min(100 - left, ((zone.end - zone.start) / safeTotal) * 100),
              );
              return (
                <div
                  key={`overlap-${idx}`}
                  title={`Overlap: ${formatTimecode(zone.start)} – ${formatTimecode(zone.end)}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className="absolute inset-y-0 bg-red-600 dark:bg-red-500"
                />
              );
            })}
          </div>
        </div>

        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {clips.map((clip, idx) => {
            const left = Math.max(0, Math.min(99, (clip.start_seconds / safeTotal) * 100));
            const width = Math.max(
              1.5,
              Math.min(100 - left, ((clip.end_seconds - clip.start_seconds) / safeTotal) * 100),
            );
            const isOverlapping = overlappingIds.has(clip.id);

            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => onSelectClip?.(clip.id)}
                className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[#EFECE4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:hover:bg-[#1C1C1F]"
              >
                <div className="flex w-36 shrink-0 items-center gap-2 sm:w-52">
                  <span
                    className={`font-mono text-xs font-medium tabular-nums ${
                      isOverlapping ? 'text-red-600 dark:text-red-400' : 'text-[#E8A33D]'
                    }`}
                  >
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-xs text-[#151517] dark:text-[#F2F0EA]">
                    {clip.title}
                  </span>
                </div>

                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#1C1C1F]">
                  <span aria-hidden="true" className="absolute inset-y-0 left-1/4 w-px bg-black/10 dark:bg-white/10" />
                  <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-black/10 dark:bg-white/10" />
                  <span aria-hidden="true" className="absolute inset-y-0 left-3/4 w-px bg-black/10 dark:bg-white/10" />

                  <div
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`absolute inset-y-0 rounded-full transition-[left,width] duration-150 motion-reduce:transition-none ${
                      isOverlapping
                        ? 'bg-red-600 dark:bg-red-500'
                        : clip.cutStatus === 'done'
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : 'bg-[#E8A33D]'
                    }`}
                  />
                </div>

                <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-[#64625D] sm:inline dark:text-[#8C8C93]">
                  {formatTimecode(clip.start_seconds)}–{formatTimecode(clip.end_seconds)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
