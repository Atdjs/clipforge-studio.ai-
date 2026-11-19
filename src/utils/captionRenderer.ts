import type { CaptionStylePresetId, ClipItem } from '../types/clip';

export interface CaptionCueInput {
  origRelStart: number;
  origRelEnd: number;
  text: string;
}

export interface RenderedCaptionOverlay {
  origRelStart: number;
  origRelEnd: number;
  pngBytes: ArrayBuffer;
}

export interface CaptionPresetConfig {
  id: CaptionStylePresetId;
  label: string;
  sampleText: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  highlightColor: string;
  outlineColor?: string;
}

export const CAPTION_STYLE_PRESETS: CaptionPresetConfig[] = [
  {
    id: 'classic-amber',
    label: 'Studio Amber',
    sampleText: 'Wait until you see this',
    bgColor: 'rgba(15, 16, 18, 0.84)',
    borderColor: 'rgba(245, 158, 11, 0.65)',
    textColor: '#F4F4F5',
    highlightColor: '#F59E0B',
  },
  {
    id: 'bold-yellow',
    label: 'Creator Gold',
    sampleText: 'STOP scrolling right now',
    bgColor: 'rgba(0, 0, 0, 0.62)',
    borderColor: 'rgba(250, 204, 21, 0.45)',
    textColor: '#FDE047',
    highlightColor: '#FFFFFF',
    outlineColor: 'rgba(0, 0, 0, 0.9)',
  },
  {
    id: 'minimal-clean',
    label: 'Minimal White',
    sampleText: 'Clean crisp subtitles',
    bgColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(15, 23, 42, 0.14)',
    textColor: '#0F172A',
    highlightColor: '#EA580C',
  },
  {
    id: 'neon-coral',
    label: 'Coral Gradient',
    sampleText: '3 mistakes founders make',
    bgColor: 'rgba(24, 16, 36, 0.88)',
    borderColor: 'rgba(244, 63, 94, 0.72)',
    textColor: '#FFF1F2',
    highlightColor: '#FB7185',
  },
  {
    id: 'kinetic-pop',
    label: 'Boxless Punch',
    sampleText: 'THE REAL SECRET',
    bgColor: 'rgba(15, 16, 18, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.0)',
    textColor: '#FFFFFF',
    highlightColor: '#FBBF24',
    outlineColor: 'rgba(0, 0, 0, 0.95)',
  },
];

export function getCaptionPreset(id?: CaptionStylePresetId): CaptionPresetConfig {
  return CAPTION_STYLE_PRESETS.find((p) => p.id === id) || CAPTION_STYLE_PRESETS[0];
}

/**
 * Build short, punchy clip-relative caption cues (0..clipDuration) from the clip's
 * timestamped transcript or fallback caption_text.
 */
export function buildCaptionCuesForClip(clip: ClipItem): CaptionCueInput[] {
  const duration = Math.max(1, clip.end_seconds - clip.start_seconds);
  const rawCues: CaptionCueInput[] = [];

  const overlapping = (clip.transcript || []).filter(
    (seg) =>
      seg.text.trim().length > 0 &&
      seg.end_seconds > clip.start_seconds &&
      seg.start_seconds < clip.end_seconds,
  );

  if (overlapping.length > 0) {
    for (const seg of overlapping) {
      const relStart = Math.max(0, seg.start_seconds - clip.start_seconds);
      const relEnd = Math.min(duration, Math.max(relStart + 0.35, seg.end_seconds - clip.start_seconds));
      const words = seg.text.trim().split(/\s+/).filter(Boolean);

      if (words.length <= 6) {
        rawCues.push({ origRelStart: relStart, origRelEnd: relEnd, text: words.join(' ') });
      } else {
        const chunkSize = 5;
        const chunkCount = Math.ceil(words.length / chunkSize);
        const span = Math.max(0.4, relEnd - relStart);
        for (let i = 0; i < chunkCount; i++) {
          const slice = words.slice(i * chunkSize, (i + 1) * chunkSize).join(' ');
          const cStart = relStart + (i / chunkCount) * span;
          const cEnd = relStart + ((i + 1) / chunkCount) * span;
          rawCues.push({ origRelStart: cStart, origRelEnd: cEnd, text: slice });
        }
      }
    }
  } else {
    const fallbackText = (clip.caption_text || clip.title || '').trim();
    const words = fallbackText.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      const chunkSize = 5;
      const chunkCount = Math.ceil(words.length / chunkSize);
      for (let i = 0; i < chunkCount; i++) {
        const slice = words.slice(i * chunkSize, (i + 1) * chunkSize).join(' ');
        rawCues.push({
          origRelStart: (i / chunkCount) * duration,
          origRelEnd: ((i + 1) / chunkCount) * duration,
          text: slice,
        });
      }
    }
  }

  if (rawCues.length <= 20) return rawCues;

  const merged: CaptionCueInput[] = [];
  const step = Math.ceil(rawCues.length / 20);
  for (let i = 0; i < rawCues.length; i += step) {
    const group = rawCues.slice(i, i + step);
    merged.push({
      origRelStart: group[0].origRelStart,
      origRelEnd: group[group.length - 1].origRelEnd,
      text: group.map((g) => g.text).join(' '),
    });
  }
  return merged;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Render each caption cue into a transparent PNG buffer using browser Canvas.
 * Supports all scripts natively (English, Hindi/Marathi Devanagari, Hinglish, Spanish)
 * and uses the selected visual preset safely without raw text in FFmpeg filters.
 */
export async function renderCaptionOverlayPngs(
  clip: ClipItem,
  outputWidth: number,
  presetId?: CaptionStylePresetId,
): Promise<RenderedCaptionOverlay[]> {
  const cues = buildCaptionCuesForClip(clip);
  if (cues.length === 0) return [];

  const preset = getCaptionPreset(presetId);
  const safeWidth = Math.max(480, Math.min(1920, Math.round(outputWidth)));
  const boxWidth = Math.round(safeWidth * 0.88);
  const fontSize = Math.max(22, Math.round(safeWidth * 0.044));
  const lineHeight = Math.round(fontSize * 1.28);
  const padX = Math.round(fontSize * 0.7);
  const padY = Math.round(fontSize * 0.45);
  const radius = Math.round(fontSize * 0.42);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const fontSpec = `700 ${fontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const results: RenderedCaptionOverlay[] = [];

  for (const cue of cues) {
    ctx.font = fontSpec;
    const lines = wrapCanvasText(ctx, cue.text, boxWidth - padX * 2);
    if (lines.length === 0) continue;

    const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pillWidth = Math.min(boxWidth, Math.ceil(maxLineWidth + padX * 2));
    const pillHeight = Math.ceil(lines.length * lineHeight + padY * 2);

    canvas.width = pillWidth % 2 === 0 ? pillWidth : pillWidth + 1;
    canvas.height = pillHeight % 2 === 0 ? pillHeight : pillHeight + 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = preset.bgColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
    ctx.fill();

    if (preset.borderColor && !preset.borderColor.endsWith(', 0.0)')) {
      ctx.strokeStyle = preset.borderColor;
      ctx.lineWidth = Math.max(1.5, Math.round(fontSize * 0.06));
      ctx.beginPath();
      ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, radius);
      ctx.stroke();
    }

    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 5;

    const startY = padY + lineHeight / 2;
    lines.forEach((line, idx) => {
      const y = startY + idx * lineHeight;
      if (preset.outlineColor) {
        ctx.strokeStyle = preset.outlineColor;
        ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.14));
        ctx.lineJoin = 'round';
        ctx.strokeText(line, canvas.width / 2, y);
      }
      ctx.fillStyle = preset.textColor;
      ctx.fillText(line, canvas.width / 2, y);
    });

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/png'),
    );
    if (!pngBlob) continue;

    const pngBytes = await pngBlob.arrayBuffer();
    results.push({
      origRelStart: cue.origRelStart,
      origRelEnd: cue.origRelEnd,
      pngBytes,
    });
  }

  return results;
}

/**
 * Render an intro Hook Title Card PNG safely in Canvas for clips with `addHookTitleCard` enabled.
 */
export async function renderHookTitleCardPng(
  hookText: string,
  outputWidth: number,
): Promise<ArrayBuffer | null> {
  const clean = hookText.trim().slice(0, 120);
  if (!clean) return null;

  const safeWidth = Math.max(480, Math.min(1920, Math.round(outputWidth)));
  const cardMaxWidth = Math.round(safeWidth * 0.86);
  const fontSize = Math.max(24, Math.round(safeWidth * 0.048));
  const lineHeight = Math.round(fontSize * 1.25);
  const padX = Math.round(fontSize * 0.85);
  const padY = Math.round(fontSize * 0.55);
  const radius = Math.round(fontSize * 0.45);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const fontSpec = `800 ${fontSize}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.font = fontSpec;
  const lines = wrapCanvasText(ctx, clean, cardMaxWidth - padX * 2);
  if (lines.length === 0) return null;

  const maxLineWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const width = Math.min(cardMaxWidth, Math.ceil(maxLineWidth + padX * 2));
  const height = Math.ceil(lines.length * lineHeight + padY * 2);

  canvas.width = width % 2 === 0 ? width : width + 1;
  canvas.height = height % 2 === 0 ? height : height + 1;

  ctx.fillStyle = 'rgba(21, 21, 23, 0.94)';
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(232, 163, 61, 0.85)';
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.07));
  ctx.beginPath();
  ctx.roundRect(1, 1, canvas.width - 2, canvas.height - 2, radius);
  ctx.stroke();

  ctx.font = fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F2F0EA';

  const startY = padY + lineHeight / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, canvas.width / 2, startY + idx * lineHeight);
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) return null;
  return blob.arrayBuffer();
}
