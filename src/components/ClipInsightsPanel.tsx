import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Scissors, Timer, TrendingUp } from 'lucide-react';
import type { ClipItem } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface ClipInsightsPanelProps {
  clips: ClipItem[];
  sourceDurationSeconds?: number;
  onSelectClip: (clipId: string) => void;
}

/**
 * Clip Insights Panel:
 * Visualizes total duration saved, cut clips completed, average Virality Score,
 * and a ranked breakdown of engagement potential across clips.
 */
export function ClipInsightsPanel({
  clips,
  sourceDurationSeconds,
  onSelectClip,
}: ClipInsightsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  const stats = useMemo(() => {
    const cutCount = clips.filter((c) => c.cutStatus === 'done' && c.outputBlob).length;
    const totalClipsDuration = clips.reduce(
      (sum, c) => sum + Math.max(1, c.end_seconds - c.start_seconds),
      0,
    );
    const silencesRemoved = clips.reduce((sum, c) => sum + (c.removedSeconds || 0), 0);
    const trimmedFromSource =
      typeof sourceDurationSeconds === 'number' && sourceDurationSeconds > totalClipsDuration
        ? Math.max(0, sourceDurationSeconds - totalClipsDuration)
        : 0;
    const totalSaved = Math.round(silencesRemoved + trimmedFromSource);

    const scoredClips = clips.filter((c) => typeof c.virality_score === 'number');
    const avgScore =
      scoredClips.length > 0
        ? Math.round(
            scoredClips.reduce((sum, c) => sum + (c.virality_score ?? 0), 0) /
              scoredClips.length,
          )
        : 75;

    const ranked = [...clips].sort(
      (a, b) => (b.virality_score ?? 75) - (a.virality_score ?? 75),
    );

    return {
      cutCount,
      totalClipsDuration,
      silencesRemoved,
      totalSaved,
      avgScore,
      ranked,
    };
  }, [clips, sourceDurationSeconds]);

  if (clips.length === 0) return null;

  return (
    <section
      aria-label="Clip insights and engagement breakdown"
      className="rounded-xl border border-[#DFDCD2] bg-white dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex min-h-[56px] w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left transition-colors hover:bg-[#EFECE4]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:hover:bg-[#1C1C1F]/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-sm font-semibold text-[#151517] sm:text-base dark:text-[#F2F0EA]">
              Clip Insights &amp; Virality Breakdown
            </h3>
            <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              Avg virality {stats.avgScore}/100 · {stats.cutCount}/{clips.length} cut ·{' '}
              {stats.totalSaved > 0
                ? `${formatTimecode(stats.totalSaved)} condensed`
                : `${Math.round(stats.totalClipsDuration)}s selected`}
            </p>
          </div>
        </div>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93]">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-[#DFDCD2] p-5 dark:border-[#2A2A2E]">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
                  Duration saved
                </span>
                <Timer className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              </div>
              <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-[#151517] dark:text-[#F2F0EA]">
                {stats.totalSaved > 0 ? formatTimecode(stats.totalSaved) : `${Math.round(stats.totalClipsDuration)}s`}
              </p>
              <p className="mt-0.5 text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                {stats.silencesRemoved > 0
                  ? `Includes ${stats.silencesRemoved.toFixed(1)}s dead-air trimmed`
                  : 'Trimmed from full source runtime'}
              </p>
            </div>

            <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
                  Clips ready
                </span>
                <Scissors className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              </div>
              <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-[#151517] dark:text-[#F2F0EA]">
                {stats.cutCount}{' '}
                <span className="text-sm font-normal text-[#64625D] dark:text-[#8C8C93]">
                  / {clips.length}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                Total highlight runtime: {formatTimecode(Math.round(stats.totalClipsDuration))}
              </p>
            </div>

            <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
                  Avg virality potential
                </span>
                <TrendingUp className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              </div>
              <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-[#151517] dark:text-[#F2F0EA]">
                {stats.avgScore}{' '}
                <span className="text-sm font-normal text-[#64625D] dark:text-[#8C8C93]">
                  / 100
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                Top clip scores {stats.ranked[0]?.virality_score ?? 75}/100
              </p>
            </div>
          </div>

          {/* Ranked Engagement Breakdown */}
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#64625D] dark:text-[#8C8C93]">
              Engagement ranking (click to focus)
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {stats.ranked.map((clip, rankIdx) => {
                const score = clip.virality_score ?? 75;
                const barTone =
                  score >= 85
                    ? 'bg-emerald-600 dark:bg-emerald-500'
                    : score >= 70
                      ? 'bg-[#E8A33D]'
                      : 'bg-[#64625D] dark:bg-[#8C8C93]';
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => onSelectClip(clip.id)}
                    className="group flex items-center gap-3 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3 py-2.5 text-left transition-colors hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:hover:border-[#E8A33D]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#DFDCD2] bg-white font-mono text-xs font-medium tabular-nums text-[#151517] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]">
                      #{rankIdx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-[#151517] dark:text-[#F2F0EA]">
                          {clip.title}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[#E8A33D]">
                          {score}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#DFDCD2] dark:bg-[#2A2A2E]">
                        <div
                          className={`h-full rounded-full ${barTone}`}
                          style={{ width: `${Math.max(8, Math.min(100, score))}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
