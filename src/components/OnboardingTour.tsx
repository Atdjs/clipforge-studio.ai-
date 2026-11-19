import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Scissors, Upload, X } from 'lucide-react';

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

const TOUR_STEPS = [
  {
    icon: Upload,
    badge: 'Step 1 of 3 · Audio Extraction',
    title: 'Select a 1 GB video — zero full-video uploads',
    body: 'Local MP4/MOV files stay on your device via WORKERFS. Browser FFmpeg extracts a compact 16 kHz mono audio track for cloud transcription (up to 45 min), or enable local Whisper to keep speech offline.',
  },
  {
    icon: BarChart3,
    badge: 'Step 2 of 3 · Cached Intelligence',
    title: 'Cached transcripts, prompt search & batched scores',
    body: 'Your transcript caches locally in IndexedDB keyed by file hash so repeat searches reuse zero transcription units. Batch-score clips, find prompt moments, and sync projects with Google Drive.',
  },
  {
    icon: Scissors,
    badge: 'Step 3 of 3 · Auto-Edit & Export',
    title: 'Captions, silences, 9:16 crop & 1-click ZIP',
    body: 'Toggle silence removal, pick one of 5 caption presets, add your PNG brand watermark, fine-tune on the waveform scrubber, and download individual MP4 + .SRT files or a single ZIP archive.',
  },
];

/**
 * Manual-trigger 3-step studio guide (never auto-pops on initial page load).
 */
export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setStepIdx(0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const current = TOUR_STEPS[stepIdx];
  const Icon = current.icon;
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-xl border border-[#DFDCD2] bg-white p-5 sm:rounded-xl sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#E8A33D]">
                {current.badge}
              </p>
              <h2
                id="tour-modal-title"
                className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]"
              >
                {current.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
          {current.body}
        </p>

        <div className="mt-5 flex items-center gap-1.5">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setStepIdx(idx)}
              aria-label={`Go to step ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${
                idx === stepIdx ? 'w-7 bg-[#E8A33D]' : 'w-2 bg-[#DFDCD2] dark:bg-[#2A2A2E]'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-3.5 text-sm font-medium text-[#151517] transition-colors hover:border-[#64625D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back</span>
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#E8A33D] px-5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A]"
            >
              <span>Got it</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => Math.min(TOUR_STEPS.length - 1, i + 1))}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#E8A33D] px-5 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A]"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
