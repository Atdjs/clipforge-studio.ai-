import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Layers,
  Trash2,
  X,
} from 'lucide-react';
import type { AspectFormat, BrandPosition, BrandSettings } from '../types/clip';

interface BrandPanelProps {
  brand: BrandSettings;
  aspectFormat: AspectFormat;
  disabled: boolean;
  onChange: (next: BrandSettings) => void;
}

const POSITION_OPTIONS: { value: BrandPosition; label: string }[] = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

/**
 * Brand Template Panel with IndexedDB persistence and Quiet Luxury surfaces.
 */
export function BrandPanel({ brand, aspectFormat, disabled, onChange }: BrandPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isExpanded, setIsExpanded] = useState(Boolean(brand.logoBlob));
  const [isDragging, setIsDragging] = useState(false);
  const [isValidatingLogo, setIsValidatingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const logoPreviewUrl = useMemo(() => {
    if (!brand.logoBlob) return null;
    return URL.createObjectURL(brand.logoBlob);
  }, [brand.logoBlob]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const validateAndLoadPng = async (file: File) => {
    setLogoError(null);
    const isPng =
      file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (!isPng) {
      setLogoError('Please choose a .png logo file (transparent PNG recommended).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setLogoError('Logo image must be under 10 MB.');
      return;
    }

    setIsValidatingLogo(true);
    try {
      const testUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(testUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(testUrl);
          reject(new Error('Could not decode this PNG image. Please try another file.'));
        };
        img.src = testUrl;
      });

      onChange({
        ...brand,
        logoBlob: file,
        logoName: file.name,
        applyToAllClips: true,
      });
      setIsExpanded(true);
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : 'Unable to load the selected PNG file.',
      );
    } finally {
      setIsValidatingLogo(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isValidatingLogo) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      void validateAndLoadPng(files[0]);
    }
  };

  const handleRemoveLogo = () => {
    setLogoError(null);
    onChange({
      ...brand,
      logoBlob: null,
      logoName: '',
      applyToAllClips: false,
    });
  };

  const positionStyle = (() => {
    switch (brand.position) {
      case 'top-left':
        return { top: '6%', left: '5%' };
      case 'top-right':
        return { top: '6%', right: '5%' };
      case 'bottom-left':
        return { bottom: '6%', left: '5%' };
      case 'bottom-right':
        return { bottom: '6%', right: '5%' };
    }
  })();

  const activePositionLabel =
    POSITION_OPTIONS.find((p) => p.value === brand.position)?.label || 'Bottom Right';

  return (
    <section
      aria-label="Brand template"
      className="rounded-xl border border-[#DFDCD2] bg-white dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,.png"
        className="sr-only"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            void validateAndLoadPng(files[0]);
          }
          e.target.value = '';
        }}
      />

      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex min-h-[56px] w-full items-center justify-between gap-4 rounded-xl px-5 py-4 text-left transition-colors hover:bg-[#EFECE4]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] sm:px-6 dark:hover:bg-[#1C1C1F]/60"
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2.5">
            <Layers className="h-4 w-4 shrink-0 text-[#E8A33D]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#151517] sm:text-lg dark:text-[#F2F0EA]">
              Brand template
            </h2>
          </div>
          <p className="truncate font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
            {brand.logoBlob
              ? `${brand.logoName} · ${activePositionLabel} · ${brand.opacity}% opacity · ${
                  brand.applyToAllClips ? 'Applied to all cuts' : 'Off'
                }`
              : 'Optional PNG watermark overlay saved locally in IndexedDB'}
          </p>
        </div>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] text-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#8C8C93]">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {isExpanded && (
        <div className="space-y-5 border-t border-[#DFDCD2] p-5 sm:p-6 dark:border-[#2A2A2E]">
          {logoError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3.5 text-sm text-red-700 dark:text-red-300"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                <p>{logoError}</p>
              </div>
              <button
                type="button"
                onClick={() => setLogoError(null)}
                aria-label="Dismiss logo error"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-red-600 hover:bg-red-500/20 dark:text-red-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              {!brand.logoBlob ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !disabled && !isValidatingLogo && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isValidatingLogo) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={handleDrop}
                  className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] ${
                    isDragging
                      ? 'border-[#E8A33D] bg-[#E8A33D]/10'
                      : 'border-[#DFDCD2] bg-[#F7F5F0] hover:border-[#E8A33D] dark:border-[#2A2A2E] dark:bg-[#0E0E0F]'
                  }`}
                >
                  <ImagePlus className="mb-2 h-6 w-6 text-[#E8A33D]" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                    {isValidatingLogo ? 'Loading PNG logo...' : 'Upload PNG logo (transparent supported)'}
                  </p>
                  <p className="mt-1 text-xs text-[#64625D] dark:text-[#8C8C93]">
                    Drag &amp; drop or tap to browse · Saved automatically in IndexedDB
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
                  <div className="flex min-w-0 items-center gap-3">
                    {logoPreviewUrl && (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#DFDCD2] bg-white p-1 dark:border-[#2A2A2E] dark:bg-[#151517]">
                        <img
                          src={logoPreviewUrl}
                          alt={brand.logoName}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                        {brand.logoName}
                      </p>
                      <p className="font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
                        PNG logo saved locally
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={disabled || isValidatingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-white px-3.5 text-xs font-medium text-[#151517] transition-colors hover:border-[#64625D] disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] whitespace-nowrap"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={handleRemoveLogo}
                      aria-label="Remove brand logo"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#DFDCD2] bg-white text-[#64625D] transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93] dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="block text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">Corner position</span>
                <div
                  role="group"
                  aria-label="Logo corner position"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {POSITION_OPTIONS.map((opt) => {
                    const active = brand.position === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange({ ...brand, position: opt.value })}
                        className={`min-h-[44px] rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] whitespace-nowrap ${
                          active
                            ? 'border-[#E8A33D] bg-[#E8A33D] text-[#0E0E0F] font-semibold'
                            : 'border-[#DFDCD2] bg-[#EFECE4] text-[#151517] hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] dark:hover:border-[#8C8C93]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor="brand-opacity-range" className="font-medium text-[#151517] dark:text-[#F2F0EA]">
                      Opacity
                    </label>
                    <span className="font-mono text-xs font-semibold tabular-nums text-[#E8A33D]">
                      {brand.opacity}%
                    </span>
                  </div>
                  <input
                    id="brand-opacity-range"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={brand.opacity}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...brand, opacity: Number(e.target.value) })}
                    className="amber-slider w-full"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor="brand-size-range" className="font-medium text-[#151517] dark:text-[#F2F0EA]">
                      Size (% width)
                    </label>
                    <span className="font-mono text-xs font-semibold tabular-nums text-[#E8A33D]">
                      {brand.sizePercent}%
                    </span>
                  </div>
                  <input
                    id="brand-size-range"
                    type="range"
                    min={8}
                    max={35}
                    step={1}
                    value={brand.sizePercent}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...brand, sizePercent: Number(e.target.value) })}
                    className="amber-slider w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DFDCD2] pt-4 dark:border-[#2A2A2E]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={brand.applyToAllClips}
                  disabled={disabled}
                  onClick={() => onChange({ ...brand, applyToAllClips: !brand.applyToAllClips })}
                  className="inline-flex min-h-[44px] items-center gap-3 rounded-lg pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D] disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      brand.applyToAllClips
                        ? 'bg-[#E8A33D]'
                        : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                        brand.applyToAllClips ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                  <span className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                    Apply to all clips
                  </span>
                </button>

                <span className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                  Overlaid automatically during FFmpeg cuts
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-lg border border-[#DFDCD2] bg-[#EFECE4] p-4 lg:col-span-5 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
              <span className="mb-2.5 font-mono text-[11px] uppercase tracking-wider text-[#64625D] dark:text-[#8C8C93]">
                Frame preview ({aspectFormat === 'vertical' ? '9:16' : '16:9'})
              </span>

              <div
                className={`relative overflow-hidden rounded-lg border border-[#2A2A2E] bg-[#151517] ${
                  aspectFormat === 'vertical' ? 'aspect-[9/16] h-48' : 'aspect-video w-full max-w-[280px]'
                }`}
              >
                <div className="absolute inset-0 flex items-center justify-center text-xs text-[#8C8C93]">
                  Video frame
                </div>

                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="Watermark preview"
                    className="pointer-events-none absolute object-contain"
                    style={{
                      ...positionStyle,
                      width: `${brand.sizePercent}%`,
                      opacity: brand.applyToAllClips ? brand.opacity / 100 : 0.25,
                    }}
                  />
                ) : (
                  <div
                    className="pointer-events-none absolute rounded border border-dashed border-[#E8A33D]/60 bg-[#E8A33D]/10 px-2 py-1 font-mono text-[10px] text-[#E8A33D]"
                    style={{
                      ...positionStyle,
                      opacity: brand.opacity / 100,
                    }}
                  >
                    LOGO
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
