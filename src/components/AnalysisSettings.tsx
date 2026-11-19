import {
  AlertCircle,
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
 * quick topic tags, and caption language selection.
 */
export function AnalysisSettings({
  settings,
  disabled,
  hasClips,
  isTranslatingCaptions,
  translationError,
  onChange,
  onChangeCaptionLanguage,
  onRetryTranslation,
  onAnalyze,
}: AnalysisSettingsProps) {
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
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]">
          Clip settings
        </h2>
        <p className="mt-1 text-sm text-[#64625D] dark:text-[#8C8C93]">
          Guide what Gemini looks for, choose clip count (3–10), length, framing, and caption language.
        </p>
      </div>

      {/* Prompt-based clipping + Quick-pick tags */}
      <div className="mb-6 space-y-3 border-b border-[#DFDCD2] pb-6 dark:border-[#2A2A2E]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="custom-clip-prompt" className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
            What should I look for? <span className="font-normal text-[#64625D] dark:text-[#8C8C93]">(optional)</span>
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
                className={`min-h-[40px] rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-40 whitespace-nowrap ${
                  active
                    ? 'border-[#E8A33D] bg-[#E8A33D] text-[#0E0E0F] font-semibold'
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
            <label htmlFor="clip-count-range" className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
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
          <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">Range: 3 to 10</p>
        </div>

        {/* Setting 2: Clip length */}
        <div className="space-y-3">
          <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">Clip length</span>
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
                  className={`min-h-[44px] rounded-md px-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] whitespace-nowrap ${
                    active
                      ? 'bg-[#E8A33D] text-[#0E0E0F] font-semibold'
                      : 'text-[#64625D] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">Target duration per highlight</p>
        </div>

        {/* Setting 3: Output format */}
        <div className="space-y-3">
          <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">Output format</span>
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
                  className={`min-h-[44px] rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] whitespace-nowrap ${
                    active
                      ? 'bg-[#E8A33D] text-[#0E0E0F] font-semibold'
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
          <label htmlFor="caption-language-select" className="flex items-center gap-1.5 text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
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
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#E8A33D] px-3.5 text-xs font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Retry translation</span>
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 border-t border-[#DFDCD2] pt-5 sm:flex-row sm:items-center sm:justify-between dark:border-[#2A2A2E]">
        <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
          AI returns ranked virality scores, timestamps, hooks, and transcripts you can trim &amp; edit locally.
        </p>

        <button
          type="button"
          disabled={disabled || isTranslatingCaptions}
          onClick={onAnalyze}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-[#E8A33D] px-6 py-3 text-sm font-semibold text-[#0E0E0F] transition-colors hover:bg-[#DDA03A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto whitespace-nowrap"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Find best clips</span>
        </button>
      </div>
    </section>
  );
}
