import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Upload, X } from 'lucide-react';
import type { AnalysisPhase, AppError, TranscriptionEngine } from '../types/clip';

interface AnalysisProgressProps {
  phase: AnalysisPhase;
  analysisMode: 'file' | 'direct-url';
  transcriptionEngine: TranscriptionEngine;
  fetchProgress: number | null;
  audioExtractProgress: number;
  transcribeStatusLabel: string;
  error: AppError | null;
  onCancel: () => void;
  onRetry: () => void;
  onSwitchToUpload?: () => void;
}

/**
 * Step 3 UI: Progress tracker for Direct URL Fetch -> Local Audio Extraction (16kHz mono) ->
 * Transcription (Cloud Audio or On-Device Whisper) -> Text-only Gemini Highlight Analysis.
 */
export function AnalysisProgress({
  phase,
  analysisMode,
  transcriptionEngine,
  fetchProgress,
  audioExtractProgress,
  transcribeStatusLabel,
  error,
  onCancel,
  onRetry,
  onSwitchToUpload,
}: AnalysisProgressProps) {
  if (phase === 'idle' || phase === 'ready') {
    return null;
  }

  if (phase === 'error' && error) {
    const showUploadFallback =
      onSwitchToUpload &&
      (error.code === 'CORS_ERROR' ||
        error.code === 'FETCH_HTTP_ERROR' ||
        error.code === 'NOT_A_VIDEO');

    return (
      <section
        role="alert"
        aria-label="Analysis error"
        className="rounded-xl border border-red-500/40 bg-white p-5 sm:p-6 dark:bg-[#151517]"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                {error.code === 'RATE_LIMIT' || error.code === 'QUOTA_EXCEEDED'
                  ? 'Daily AI usage limit reached'
                  : error.code === 'AUTH_ERROR'
                    ? 'API configuration required'
                    : error.code === 'CORS_ERROR'
                      ? 'Direct link blocked by CORS'
                      : 'Could not complete analysis'}
              </h3>
              <p className="text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                {error.message}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {showUploadFallback && (
              <button
                type="button"
                onClick={onSwitchToUpload}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Upload file instead</span>
              </button>
            )}

            {error.retryable && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const steps: { key: AnalysisPhase; label: string; detail: string }[] = [
    ...(analysisMode === 'direct-url'
      ? [
          {
            key: 'fetching-url' as AnalysisPhase,
            label: 'Fetching direct video URL in browser',
            detail:
              fetchProgress !== null
                ? `${fetchProgress}% downloaded`
                : 'Downloading MP4 stream...',
          },
        ]
      : []),
    {
      key: 'extracting-audio',
      label: 'Extracting 16 kHz mono audio locally',
      detail: `${audioExtractProgress}% processed in Web Worker (no video upload)`,
    },
    {
      key: 'transcribing',
      label:
        transcriptionEngine === 'whisper'
          ? 'Transcribing speech on-device (Whisper)'
          : 'Transcribing compressed audio via Gemini',
      detail:
        transcribeStatusLabel ||
        (transcriptionEngine === 'whisper'
          ? 'Running local speech model in browser...'
          : 'Sending compact speech audio & caching transcript...'),
    },
    {
      key: 'analyzing',
      label: 'Finding & scoring highlights (text-only)',
      detail: 'Selecting hooks, transcripts, and virality scores from cached text',
    },
  ];

  const activeIndex = steps.findIndex((s) => s.key === phase);

  const overallPct =
    phase === 'fetching-url'
      ? Math.max(5, Math.round((fetchProgress ?? 20) * 0.2))
      : phase === 'extracting-audio'
        ? Math.max(12, Math.round(15 + audioExtractProgress * 0.35))
        : phase === 'transcribing'
          ? 65
          : 90;

  return (
    <div className="space-y-4">
      <section
        aria-live="polite"
        aria-label="Analysis progress"
        className="rounded-xl border border-[#DFDCD2] bg-white p-5 sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/50 bg-[#E8A33D]/10 font-mono text-xs font-semibold tabular-nums text-[#E8A33D]">
              {overallPct}%
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-[#151517] dark:text-[#F2F0EA]">
                Analyzing speech &amp; highlights
              </h3>
              <p className="mt-0.5 text-sm text-[#64625D] dark:text-[#8C8C93]">
                Keep this tab open while transcript and moments finish processing.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 py-2 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        </div>

        {(phase === 'extracting-audio' ||
          (phase === 'fetching-url' && fetchProgress !== null)) && (
          <div className="mt-4 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EFECE4] dark:bg-[#1C1C1F]">
              <div
                className="h-full rounded-full bg-[#E8A33D] transition-[width] duration-200 motion-reduce:transition-none"
                style={{
                  width: `${
                    phase === 'extracting-audio' ? audioExtractProgress : fetchProgress
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        <ol className="mt-5 space-y-3 border-t border-[#DFDCD2] pt-4 dark:border-[#2A2A2E]">
          {steps.map((step, index) => {
            const isComplete = activeIndex > index;
            const isCurrent = activeIndex === index;

            return (
              <li key={step.key} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {isComplete ? (
                    <CheckCircle2
                      className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#E8A33D]" aria-hidden="true" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#DFDCD2] font-mono text-[11px] tabular-nums text-[#64625D] dark:border-[#2A2A2E] dark:text-[#8C8C93]">
                      {index + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent || isComplete
                        ? 'text-[#151517] dark:text-[#F2F0EA]'
                        : 'text-[#64625D] dark:text-[#8C8C93]'
                    }`}
                  >
                    {step.label}
                  </p>
                  {isCurrent && (
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-[#E8A33D]">
                      {step.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Skeleton Preview Placeholders during AI analysis */}
      {phase === 'analyzing' && (
        <div
          aria-hidden="true"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {[0, 1, 2].map((skeletonIdx) => (
            <div
              key={skeletonIdx}
              className="animate-pulse overflow-hidden rounded-xl border border-[#DFDCD2] bg-white p-4 motion-reduce:animate-none dark:border-[#2A2A2E] dark:bg-[#151517]"
            >
              <div className="aspect-video w-full rounded-lg bg-[#EFECE4] dark:bg-[#1C1C1F]" />
              <div className="mt-4 h-4 w-2/3 rounded bg-[#EFECE4] dark:bg-[#1C1C1F]" />
              <div className="mt-2 h-3 w-full rounded bg-[#EFECE4] dark:bg-[#1C1C1F]" />
              <div className="mt-4 h-10 w-full rounded-lg bg-[#EFECE4] dark:bg-[#1C1C1F]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
