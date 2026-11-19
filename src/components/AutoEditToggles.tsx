import { useState } from 'react';
import {
  Captions,
  ChevronDown,
  ChevronUp,
  Crop,
  Layers,
  SlidersHorizontal,
  Volume2,
  Waves,
} from 'lucide-react';
import type { AutoEditSettings, CaptionStylePresetId } from '../types/clip';
import { CAPTION_STYLE_PRESETS } from '../utils/captionRenderer';

interface AutoEditTogglesProps {
  autoEdit: AutoEditSettings;
  disabled: boolean;
  onToggle: (key: 'removeSilences' | 'burnCaptions' | 'reframeVertical' | 'fadeInOut' | 'normalizeAudio') => void;
  onSelectCaptionPreset: (presetId: CaptionStylePresetId) => void;
  hasBrandLogo?: boolean;
  brandApplyToAll?: boolean;
}

type GroupId = 'captions' | 'audio' | 'format' | 'branding';

/**
 * Grouped collapsible Auto-Edit pipeline with Switches + 5 Caption Style Presets.
 */
export function AutoEditToggles({
  autoEdit,
  disabled,
  onToggle,
  onSelectCaptionPreset,
  hasBrandLogo,
  brandApplyToAll,
}: AutoEditTogglesProps) {
  const [openGroups, setOpenGroups] = useState<Record<GroupId, boolean>>({
    captions: true,
    audio: true,
    format: true,
    branding: false,
  });

  const toggleGroup = (id: GroupId) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const activePreset = autoEdit.captionStyle || 'classic-amber';
  const activeCount = [
    autoEdit.removeSilences,
    autoEdit.burnCaptions,
    autoEdit.reframeVertical,
    autoEdit.fadeInOut,
    autoEdit.normalizeAudio,
  ].filter(Boolean).length;

  const renderSwitch = (
    keyName: 'removeSilences' | 'burnCaptions' | 'reframeVertical' | 'fadeInOut' | 'normalizeAudio',
    label: string,
    detail: string,
    Icon: typeof SlidersHorizontal,
  ) => {
    const active = Boolean(autoEdit[keyName]);
    return (
      <button
        key={keyName}
        type="button"
        role="switch"
        aria-checked={active}
        disabled={disabled}
        onClick={() => onToggle(keyName)}
        className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:cursor-not-allowed disabled:opacity-45 ${
          active
            ? 'border-[#E8A33D]/60 bg-[#E8A33D]/10 text-[#151517] dark:text-[#F2F0EA]'
            : 'border-[#DFDCD2] bg-white text-[#64625D] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93] dark:hover:border-[#8C8C93] dark:hover:text-[#F2F0EA]'
        }`}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon
            className={`mt-0.5 h-4 w-4 shrink-0 ${
              active ? 'text-[#E8A33D]' : 'text-[#64625D] dark:text-[#8C8C93]'
            }`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <span className="block truncate text-xs font-medium">{label}</span>
            <span className="block text-[11px] leading-snug text-[#64625D] dark:text-[#8C8C93]">
              {detail}
            </span>
          </div>
        </div>

        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            active ? 'bg-[#E8A33D]' : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              active ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    );
  };

  return (
    <section
      aria-label="Automatic post-cut edits"
      className="rounded-xl border border-[#DFDCD2] bg-white p-4 sm:p-5 dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#E8A33D]" aria-hidden="true" />
          <h3 className="font-display text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
            Auto-edit pipeline
          </h3>
        </div>
        <span className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
          {activeCount} of 5 active · runs automatically after cut
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Group 1: Captions + Visual Style Presets */}
        <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <button
            type="button"
            aria-expanded={openGroups.captions}
            onClick={() => toggleGroup('captions')}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-[#151517] dark:text-[#F2F0EA]">
              <Captions className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              Captions &amp; style presets
            </span>
            {openGroups.captions ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {openGroups.captions && (
            <div className="mt-3 space-y-3">
              {renderSwitch(
                'burnCaptions',
                'Burn captions into video',
                'Auto-render styled subtitles onto exported MP4',
                Captions,
              )}

              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-[#64625D] dark:text-[#8C8C93]">
                  Visual caption preset (burned preview)
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CAPTION_STYLE_PRESETS.map((preset) => {
                    const selected = activePreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onSelectCaptionPreset(preset.id)}
                        className={`flex flex-col items-start gap-1.5 rounded-lg border p-2 text-left transition-colors disabled:opacity-45 ${
                          selected
                            ? 'border-[#E8A33D] bg-[#E8A33D]/10 ring-1 ring-[#E8A33D]'
                            : 'border-[#DFDCD2] bg-white hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#151517] dark:hover:border-[#8C8C93]'
                        }`}
                      >
                        <div
                          className="w-full truncate rounded px-2 py-1 text-center font-display text-[10px] font-semibold"
                          style={{
                            backgroundColor: preset.bgColor,
                            color: preset.textColor,
                            border: `1px solid ${preset.borderColor}`,
                          }}
                        >
                          {preset.sampleText}
                        </div>
                        <span className="truncate font-sans text-[11px] font-medium text-[#151517] dark:text-[#F2F0EA]">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Group 2: Audio & Silence Removal */}
        <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <button
            type="button"
            aria-expanded={openGroups.audio}
            onClick={() => toggleGroup('audio')}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-[#151517] dark:text-[#F2F0EA]">
              <Volume2 className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              Audio &amp; pacing
            </span>
            {openGroups.audio ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {openGroups.audio && (
            <div className="mt-3 space-y-2.5">
              {renderSwitch(
                'removeSilences',
                'Remove silences & fillers',
                'Cut dead pauses >0.45s & AI filler spans',
                Waves,
              )}
              {renderSwitch(
                'normalizeAudio',
                'Normalize audio loudness',
                'Balance speech loudness (EBU R128 -16 LUFS)',
                Volume2,
              )}
            </div>
          )}
        </div>

        {/* Group 3: Format & Transitions */}
        <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <button
            type="button"
            aria-expanded={openGroups.format}
            onClick={() => toggleGroup('format')}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-[#151517] dark:text-[#F2F0EA]">
              <Crop className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              Format &amp; transitions
            </span>
            {openGroups.format ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {openGroups.format && (
            <div className="mt-3 space-y-2.5">
              {renderSwitch(
                'reframeVertical',
                'Vertical 9:16 speaker reframe',
                'Crop 1080×1920 keeping the speaker in frame',
                Crop,
              )}
              {renderSwitch(
                'fadeInOut',
                'Fade in / out',
                '0.35s smooth video & audio edge fades',
                SlidersHorizontal,
              )}
            </div>
          )}
        </div>

        {/* Group 4: Branding summary */}
        <div className="rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <button
            type="button"
            aria-expanded={openGroups.branding}
            onClick={() => toggleGroup('branding')}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-[#151517] dark:text-[#F2F0EA]">
              <Layers className="h-3.5 w-3.5 text-[#E8A33D]" aria-hidden="true" />
              Branding status
            </span>
            {openGroups.branding ? (
              <ChevronUp className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64625D] dark:text-[#8C8C93]" />
            )}
          </button>

          {openGroups.branding && (
            <p className="mt-2.5 text-xs leading-relaxed text-[#64625D] dark:text-[#8C8C93]">
              {hasBrandLogo
                ? brandApplyToAll
                  ? 'PNG watermark overlay is active and automatically composited onto every cut clip.'
                  : 'PNG logo saved in IndexedDB (enable "Apply to all clips" in Brand template to burn it).'
                : 'No PNG watermark uploaded yet. Expand the Brand template panel to upload a persistent logo overlay.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
