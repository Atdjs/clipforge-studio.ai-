import {
  Archive,
  BarChart3,
  Cloud,
  Download,
  FileJson,
  Layers,
  Loader2,
  RefreshCw,
  Scissors,
  SlidersHorizontal,
} from 'lucide-react';

interface StudioActionBarProps {
  totalClips: number;
  cutCount: number;
  canCutLocally: boolean;
  autoSaveWhenReady: boolean;
  showAllTimelines: boolean;
  isCuttingAll: boolean;
  isRegenerating: boolean;
  isBatchScoring: boolean;
  isZipping: boolean;
  zipProgress: number;
  driveLinkedName?: string;
  onToggleAutoSave: (next: boolean) => void;
  onToggleShowAllTimelines: () => void;
  onOpenBulkAdjust: () => void;
  onOpenMobileSettings?: () => void;
  onExportJson: () => void;
  onBatchScoreAll: () => void;
  onOpenDriveSync: () => void;
  onRegenerate: () => void;
  onCutAll: () => void;
  onSaveAll: () => void;
}

/**
 * Responsive studio controls + sticky mobile thumb-zone bar.
 */
export function StudioActionBar({
  totalClips,
  cutCount,
  canCutLocally,
  autoSaveWhenReady,
  showAllTimelines,
  isCuttingAll,
  isRegenerating,
  isBatchScoring,
  isZipping,
  zipProgress,
  driveLinkedName,
  onToggleAutoSave,
  onToggleShowAllTimelines,
  onOpenBulkAdjust,
  onOpenMobileSettings,
  onExportJson,
  onBatchScoreAll,
  onOpenDriveSync,
  onRegenerate,
  onCutAll,
  onSaveAll,
}: StudioActionBarProps) {
  const uncutCount = totalClips - cutCount;
  const hasReadyClips = cutCount > 0;
  const allClipsDone = totalClips > 0 && cutCount === totalClips;

  return (
    <>
      {/* Desktop & Inline Header Bar */}
      <div className="space-y-3 rounded-xl border border-[#DFDCD2] bg-white p-4 sm:px-5 dark:border-[#2A2A2E] dark:bg-[#151517]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <h2 className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]">
              Suggested clips
            </h2>
            <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              {totalClips} clips found · {cutCount} of {totalClips} ready
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={showAllTimelines}
              onClick={onToggleShowAllTimelines}
              disabled={totalClips === 0}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 ${
                showAllTimelines
                  ? 'border-[#E8A33D] bg-[#E8A33D]/10 text-[#151517] dark:text-[#E8A33D]'
                  : 'border-[#DFDCD2] bg-[#EFECE4] text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]'
              }`}
            >
              <Layers className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              <span>{showAllTimelines ? 'Hide Timelines' : 'All Timelines'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenBulkAdjust}
              disabled={isRegenerating || isCuttingAll || totalClips === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
            >
              <SlidersHorizontal className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              <span>Bulk adjust</span>
            </button>

            <button
              type="button"
              onClick={onBatchScoreAll}
              disabled={isBatchScoring || isRegenerating || isCuttingAll || totalClips === 0}
              title="Score all clips together in a single batched Gemini text call"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
            >
              {isBatchScoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#E8A33D]" aria-hidden="true" />
                  <span>Scoring batch...</span>
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
                  <span>Score all</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onExportJson}
              disabled={totalClips === 0}
              title="Download full scene breakdown JSON with titles, timestamps, and transcripts"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
            >
              <FileJson className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={onOpenDriveSync}
              title={driveLinkedName ? `Synced: ${driveLinkedName}` : 'Save project snapshot to Google Drive'}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#E8A33D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
            >
              <Cloud className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
              <span>{driveLinkedName ? 'Sync Drive' : 'Save to Drive'}</span>
            </button>

            {canCutLocally && (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={isRegenerating || isCuttingAll}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
              >
                <RefreshCw
                  className={`h-4 w-4 text-[#E8A33D] ${isRegenerating ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Regenerate</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCutAll}
              disabled={!canCutLocally || isCuttingAll || isRegenerating || uncutCount === 0}
              className="hidden min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-5 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
            >
              {isCuttingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Cutting clips...</span>
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  <span>{uncutCount === 0 ? 'All clips cut' : `Cut & Edit (${uncutCount})`}</span>
                </>
              )}
            </button>

            {allClipsDone ? (
              <button
                type="button"
                onClick={onSaveAll}
                disabled={isZipping}
                className="hidden min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
              >
                {isZipping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span className="font-mono tabular-nums">Saving {zipProgress}%</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    <span>Save all</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onSaveAll}
                disabled={!hasReadyClips || isZipping}
                className="hidden min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#E8A33D]/50 bg-[#E8A33D]/10 px-4 py-2 text-xs font-medium text-[#151517] transition-colors hover:bg-[#E8A33D]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#E8A33D] md:inline-flex"
              >
                {isZipping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span className="font-mono tabular-nums">Zipping {zipProgress}%</span>
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    <span>Download (.zip)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Auto-save toggle + Shortcut hints */}
        <div className="flex flex-col gap-3 border-t border-[#DFDCD2] pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E]">
          <button
            type="button"
            role="switch"
            aria-checked={autoSaveWhenReady}
            onClick={() => onToggleAutoSave(!autoSaveWhenReady)}
            className="inline-flex min-h-[44px] items-center gap-3 self-start rounded-lg pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
          >
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                autoSaveWhenReady ? 'bg-[#E8A33D]' : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  autoSaveWhenReady ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
            <span className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
              Auto-save each clip when ready
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#64625D] dark:text-[#8C8C93]">
            <div className="hidden items-center gap-3 md:flex" aria-label="Keyboard shortcuts">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[#DFDCD2] bg-[#F7F5F0] px-1.5 py-0.5 font-mono text-[11px] text-[#151517] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]">
                  Space
                </kbd>
                <span>Play/Pause</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[#DFDCD2] bg-[#F7F5F0] px-1.5 py-0.5 font-mono text-[11px] text-[#151517] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]">
                  Delete
                </kbd>
                <span>Remove</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-[#DFDCD2] bg-[#F7F5F0] px-1.5 py-0.5 font-mono text-[11px] text-[#151517] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]">
                  Ctrl+Enter
                </kbd>
                <span>Cut all</span>
              </span>
            </div>
            <p>Keep this tab open while exporting.</p>
          </div>
        </div>
      </div>

      {/* Mobile Thumb-Zone Sticky Action Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#DFDCD2] bg-[#F7F5F0] px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:hidden dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          {onOpenMobileSettings && (
            <button
              type="button"
              onClick={onOpenMobileSettings}
              aria-label="Open auto-edit settings"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#151517] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
            >
              <SlidersHorizontal className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
            </button>
          )}

          {!allClipsDone && (
            <button
              type="button"
              onClick={onCutAll}
              disabled={!canCutLocally || isCuttingAll || isRegenerating || uncutCount === 0}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-3 py-2 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isCuttingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Cutting...</span>
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4" aria-hidden="true" />
                  <span>Cut &amp; Edit ({uncutCount})</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onSaveAll}
            disabled={!hasReadyClips || isZipping}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              allClipsDone
                ? 'bg-emerald-600 text-white'
                : 'border border-[#E8A33D]/50 bg-[#E8A33D]/10 text-[#151517] dark:text-[#E8A33D]'
            }`}
          >
            {isZipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="font-mono tabular-nums">{zipProgress}%</span>
              </>
            ) : allClipsDone ? (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Save all</span>
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                <span>.ZIP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
