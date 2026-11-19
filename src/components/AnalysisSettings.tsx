import {
  AlertCircle,
  BatteryWarning,
  CheckCircle2,
  Cpu,
  Globe,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type {
  AspectFormat,
  CaptionLanguage,
  ClipSettings,
  LengthRange,
} from '../types/clip';

interface AnalysisSettingsProps {
  settings: ClipSettings;
  disabled: boolean;
  hasClips: boolean;
  hasCachedTranscript?: boolean;
  isOverCloudCap?: boolean;
  isTranslatingCaptions: boolean;
  translationError: string | null;
  onChange: (next: ClipSettings) => void;
  onChangeCaptionLanguage: (nextLang: CaptionLanguage) => void;
  onRetryTranslation: () => void;
  onAnalyze: () => void;
}

const LENGTH_OPTIONS: { value: LengthRange; label: string }[] = [
  { value: '15-30', label: '15–30s' },
  { value: '30-60', label: '30–60s' },
  { value: '60-90', label: '60–90s' },
];

const FORMAT_OPTIONS: { value: AspectFormat; label: string; hint: string }[] = [
  { value: 'original', label: 'Original', hint: 'Keep source framing' },
  { value: 'vertical', label: 'Vertical 9:16', hint: '1080×1920 speaker reframe' },
];

const PROMPT_CHIPS = [
  'Funny',
  'Educational',
  'Emotional',
  'Controversial',
  'Storytelling',
] as const;

const CAPTION_LANGUAGES: { value: CaptionLanguage; label: string }[] = [
  { value: 'English', label: 'English' },
  { value: 'Hindi', label: 'Hindi (हिन्दी)' },
  { value: 'Marathi', label: 'Marathi (मराठी)' },
  { value: 'Hinglish', label: 'Hinglish' },
  { value: 'Spanish', label: 'Spanish (Español)' },
];

/**
 * Step 2 UI: Pre-analysis clip settings with prompt-based clipping,
 * quick topic tags, caption language selection, and optional on-device Whisper toggle.
 */
export function AnalysisSettings({
  settings,
  disabled,
  hasClips,
  hasCachedTranscript = false,
  isOverCloudCap = false,
  isTranslatingCaptions,
  translationError,
  onChange,
  onChangeCaptionLanguage,
  onRetryTranslation,
  onAnalyze,
}: AnalysisSettingsProps) {
  const isWhisperOn = settings.transcriptionEngine === 'whisper';

  const updateCount = (nextCount: number) => {
    const clamped = Math.max(3, Math.min(10, nextCount));
    onChange({ ...settings, clipCount: clamped });
  };

  const isChipActive = (chip: string) => {
    const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(settings.customPrompt);
  };

  const togglePromptChip = (chip: string) => {
    const current = settings.customPrompt.trim();
    const escaped = chip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');

    if (regex.test(current)) {
      const cleaned = current
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part.toLowerCase() !== chip.toLowerCase())
        .join(', ');
      onChange({ ...settings, customPrompt: cleaned });
    } else {
      const next = current ? `${current}, ${chip}` : chip;
      onChange({ ...settings, customPrompt: next });
    }
  };

  return (
    <section
      aria-label="Clip analysis settings"
      className="rounded-xl border border-[#DFDCD2] bg-white p-5 sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]">
            Clip settings
          </h2>
          <p className="mt-1 text-sm text-[#64625D] dark:text-[#8C8C93]">
            Guide what Gemini looks for, choose clip count (3–10), length, framing, and transcription engine.
          </p>
        </div>

        {hasCachedTranscript && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Transcript cached — skips re-transcribing</span>
          </div>
        )}
      </div>

      {/* Prompt-based clipping + Quick-pick tags */}
      <div className="mb-6 space-y-3 border-b border-[#DFDCD2] pb-6 dark:border-[#2A2A2E]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="custom-clip-prompt"
            className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]"
          >
            What should I look for?{' '}
            <span className="font-normal text-[#64625D] dark:text-[#8C8C93]">(optional)</span>
          </label>
          {settings.customPrompt.trim() && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...settings, customPrompt: '' })}
              className="text-xs font-medium text-[#64625D] transition-colors hover:text-[#E8A33D] disabled:opacity-40 dark:text-[#8C8C93]"
            >
              Clear prompt
            </button>
          )}
        </div>

        <input
          id="custom-clip-prompt"
          type="text"
          disabled={disabled}
          value={settings.customPrompt}
          onChange={(e) => onChange({ ...settings, customPrompt: e.target.value })}
          placeholder='e.g. "funny moments", "only business advice", "emotional stories"'
          className="min-h-[46px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-4 text-sm text-[#151517] placeholder:text-[#64625D] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA] dark:placeholder:text-[#8C8C93]"
        />

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick topic picks">
          {PROMPT_CHIPS.map((chip) => {
            const active = isChipActive(chip);
            return (
              <button
                key={chip}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => togglePromptChip(chip)}
                className={`min-h-[40px] whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-40 ${
                  active
                    ? 'border-[#E8A33D] bg-[#E8A33D] font-semibold text-[#0E0E0F]'
                    : 'border-[#DFDCD2] bg-[#EFECE4] text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]'
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Setting 1: Number of clips */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label
              htmlFor="clip-count-range"
              className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]"
            >
              Number of clips
            </label>
            <span className="font-mono text-sm font-semibold tabular-nums text-[#E8A33D]">
              {settings.clipCount} clips
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateCount(settings.clipCount - 1)}
              disabled={disabled || settings.clipCount <= 3}
              aria-label="Decrease clip count"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
            >
              <Minus className="h-4 w-4" />
            </button>

            <input
              id="clip-count-range"
              type="range"
              min={3}
              max={10}
              step={1}
              value={settings.clipCount}
              disabled={disabled}
              onChange={(e) => updateCount(Number(e.target.value))}
              className="amber-slider flex-1"
            />

            <button
              type="button"
              onClick={() => updateCount(settings.clipCount + 1)}
              disabled={disabled || settings.clipCount >= 10}
              aria-label="Increase clip count"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#151517] transition-colors hover:border-[#64625D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
            Range: 3 to 10
          </p>
        </div>

        {/* Setting 2: Clip length */}
        <div className="space-y-3">
          <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
            Clip length
          </span>
          <div
            role="group"
            aria-label="Clip length"
            className="grid grid-cols-3 gap-1 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] p-1 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]"
          >
            {LENGTH_OPTIONS.map((option) => {
              const active = settings.lengthRange === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...settings, lengthRange: option.value })}
                  className={`min-h-[44px] whitespace-nowrap rounded-md px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
                    active
                      ? 'bg-[#E8A33D] font-semibold text-[#0E0E0F]'
                      : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
            Target duration per highlight
          </p>
        </div>

        {/* Setting 3: Output format */}
        <div className="space-y-3">
          <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
            Output format
          </span>
          <div
            role="group"
            aria-label="Output format"
            className="grid grid-cols-2 gap-1 rounded-lg border border-[#DFDCD2] bg-[#EFECE4] p-1 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]"
          >
            {FORMAT_OPTIONS.map((option) => {
              const active = settings.aspectFormat === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...settings, aspectFormat: option.value })}
                  className={`min-h-[44px] whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
                    active
                      ? 'bg-[#E8A33D] font-semibold text-[#0E0E0F]'
                      : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
            {FORMAT_OPTIONS.find((o) => o.value === settings.aspectFormat)?.hint}
          </p>
        </div>

        {/* Setting 4: Caption language dropdown */}
        <div className="space-y-3">
          <label
            htmlFor="caption-language-select"
            className="flex items-center gap-1.5 text-sm font-medium text-[#151517] dark:text-[#F2F0EA]"
          >
            <Globe className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
            <span>Caption language</span>
          </label>
          <select
            id="caption-language-select"
            value={settings.captionLanguage}
            disabled={disabled || isTranslatingCaptions}
            onChange={(e) => onChangeCaptionLanguage(e.target.value as CaptionLanguage)}
            className="min-h-[48px] w-full rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-3.5 text-sm text-[#151517] focus:border-[#E8A33D] focus-visible:outline-none disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
          >
            {CAPTION_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
            {isTranslatingCaptions
              ? `Translating transcripts to ${settings.captionLanguage}...`
              : hasClips
                ? 'Changing translates transcripts & .SRT'
                : 'Used for transcript & .SRT download'}
          </p>
        </div>
      </div>

      {/* Optional On-Device Whisper Transcription Toggle */}
      <div className="mt-6 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-4 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
            <div>
              <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                On-device Whisper transcription
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
                Default is Cloud Audio (fast, sends compressed 16 kHz mono audio). Toggle ON to run Whisper locally via WebGPU/WASM (~45 MB model download once).
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isWhisperOn}
            disabled={disabled}
            onClick={() =>
              onChange({
                ...settings,
                transcriptionEngine: isWhisperOn ? 'cloud' : 'whisper',
              })
            }
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2.5 self-start rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-50 sm:self-center"
          >
            <span className="font-mono text-xs text-[#64625D] dark:text-[#8C8C93]">
              {isWhisperOn ? 'Local Whisper' : 'Cloud Audio'}
            </span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                isWhisperOn ? 'bg-[#E8A33D]' : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  isWhisperOn ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>
        </div>

        {isWhisperOn && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-[#E8A33D]/40 bg-[#E8A33D]/10 px-3 py-2 text-xs text-[#151517] dark:text-[#F2F0EA]">
            <BatteryWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E8A33D]" aria-hidden="true" />
            <span>
              <strong>Heads up:</strong> On-device transcription is free and keeps speech audio offline, but it is noticeably slower and uses more laptop/phone battery than cloud audio.
            </span>
          </div>
        )}
      </div>

      {isTranslatingCaptions && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 px-4 py-3 text-sm text-[#151517] dark:text-[#F2F0EA]"
        >
          <Loader2 className="h-4 w-4 animate-spin text-[#E8A33D]" aria-hidden="true" />
          <span>Translating clip transcripts and captions to {settings.captionLanguage}...</span>
        </div>
      )}

      {translationError && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3.5 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between dark:text-red-300"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p>{translationError}</p>
          </div>
          <button
            type="button"
            onClick={onRetryTranslation}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#E8A33D] px-3.5 text-xs font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry translation</span>
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-[#DFDCD2] pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E]">
        <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
          {isOverCloudCap && !isWhisperOn && !hasCachedTranscript
            ? 'Recording is over 45 min. Switch on Local Whisper above or trim first.'
            : 'Extracts compact audio locally, caches the transcript, and ranks clips via text-only AI.'}
        </p>

        <button
          type="button"
          disabled={
            disabled ||
            isTranslatingCaptions ||
            (isOverCloudCap && !isWhisperOn && !hasCachedTranscript)
          }
          onClick={onAnalyze}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#E8A33D] px-6 py-3 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>{hasCachedTranscript ? 'Find clips from cache' : 'Find best clips'}</span>
        </button>
      </div>
    </section>
  );
}
