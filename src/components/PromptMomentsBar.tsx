import { useState, type FormEvent } from 'react';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import type { ClipItem } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface PromptMomentsBarProps {
  disabled: boolean;
  isSearching: boolean;
  candidates: ClipItem[];
  addedCandidateIds: Set<string>;
  searchError: string | null;
  onSearchMoments: (prompt: string) => void;
  onAddCandidate: (clip: ClipItem) => void;
  onAddAllCandidates: () => void;
  onClearCandidates: () => void;
}

const SUGGESTION_CHIPS = [
  'Funny moments',
  'Clips about money',
  'Controversial takes',
  'Practical tips',
  'Emotional stories',
];

/**
 * Prompt-Based Clipping bar:
 * Queries /api/find-moments on the active video/transcript and lets users preview
 * and add scored candidate highlights with 1 click.
 */
export function PromptMomentsBar({
  disabled,
  isSearching,
  candidates,
  addedCandidateIds,
  searchError,
  onSearchMoments,
  onAddCandidate,
  onAddAllCandidates,
  onClearCandidates,
}: PromptMomentsBarProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || disabled || isSearching) return;
    onSearchMoments(prompt.trim());
  };

  const unaddedCount = candidates.filter((c) => !addedCandidateIds.has(c.id)).length;

  return (
    <section
      aria-label="Prompt-based moment finder"
      className="rounded-xl border border-[#DFDCD2] bg-white p-4 sm:p-5 dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
            <h3 className="font-display text-sm font-semibold text-[#151517] sm:text-base dark:text-[#F2F0EA]">
              Find specific moments by prompt
            </h3>
          </div>
          <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
            Ask AI to find specific themes, exchanges, or quotes across your video.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-2 sm:flex-row lg:max-w-xl">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64625D] dark:text-[#8C8C93]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={prompt}
              disabled={disabled || isSearching}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='Try "find funny moments" or "clips about pricing"...'
              aria-label="Describe what moments to find"
              className="min-h-[44px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] pl-10 pr-3 text-sm text-[#151517] placeholder:text-[#64625D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || isSearching || !prompt.trim()}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-4 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Searching...</span>
              </>
            ) : (
              <span>Find moments</span>
            )}
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled || isSearching}
            onClick={() => {
              setPrompt(chip);
              onSearchMoments(chip);
            }}
            className="min-h-[36px] rounded-md border border-[#DFDCD2] bg-[#EFECE4] px-2.5 text-xs font-medium text-[#151517] transition-colors hover:border-[#E8A33D] disabled:opacity-45 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#E8A33D]"
          >
            {chip}
          </button>
        ))}
      </div>

      {searchError && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {searchError}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="mt-4 space-y-2.5 border-t border-[#DFDCD2] pt-3.5 dark:border-[#2A2A2E]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-medium text-[#64625D] dark:text-[#8C8C93]">
              {candidates.length} matching moment{candidates.length === 1 ? '' : 's'} found
            </span>
            <div className="flex items-center gap-2">
              {unaddedCount > 0 && (
                <button
                  type="button"
                  onClick={onAddAllCandidates}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#E8A33D] px-3 text-xs font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add all ({unaddedCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClearCandidates}
                className="min-h-[36px] rounded-md px-2.5 text-xs font-medium text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
              >
                Clear results
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {candidates.map((cand) => {
              const isAdded = addedCandidateIds.has(cand.id);
              return (
                <div
                  key={cand.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#E8A33D]">
                      <span>
                        {formatTimecode(cand.start_seconds)}–{formatTimecode(cand.end_seconds)}
                      </span>
                      <span>·</span>
                      <span>Score {cand.virality_score ?? 75}</span>
                    </div>
                    <p className="mt-0.5 truncate font-display text-xs font-semibold text-[#151517] dark:text-[#F2F0EA]">
                      {cand.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[#64625D] dark:text-[#8C8C93]">
                      {cand.hook_reason}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => onAddCandidate(cand)}
                    className={`inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-md border px-3 text-xs font-medium transition-colors ${
                      isAdded
                        ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-[#E8A33D]/50 bg-[#E8A33D]/10 text-[#151517] hover:bg-[#E8A33D] hover:text-[#0E0E0F] dark:text-[#E8A33D] dark:hover:text-[#0E0E0F]'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Added</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
