import type { ClipItem } from '../types/clip';

/**
 * Format byte sizes cleanly for display (e.g., "142.8 MB" or "1.12 GB").
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Format seconds into clean mm:ss or hh:mm:ss timecodes.
 */
export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format seconds into SubRip (.srt) timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  const safeMs = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(safeMs / 3_600_000);
  const mins = Math.floor((safeMs % 3_600_000) / 60_000);
  const secs = Math.floor((safeMs % 60_000) / 1000);
  const ms = safeMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Build a valid .srt subtitle file string for a cut clip in the chosen language.
 * Uses timestamped transcript segments when available, anchored to 00:00:00,000 at clip.start_seconds.
 * Falls back cleanly to splitting caption_text when transcript timestamps are unavailable.
 */
export function buildSrtContent(clip: ClipItem): string {
  const duration = Math.max(1, clip.end_seconds - clip.start_seconds);

  const overlappingSegments = (clip.transcript || []).filter(
    (seg) =>
      seg.text.trim().length > 0 &&
      seg.end_seconds > clip.start_seconds &&
      seg.start_seconds < clip.end_seconds,
  );

  if (overlappingSegments.length > 0) {
    return overlappingSegments
      .map((seg, index) => {
        const relStart = Math.max(0, seg.start_seconds - clip.start_seconds);
        const relEnd = Math.min(duration, Math.max(relStart + 0.4, seg.end_seconds - clip.start_seconds));
        return `${index + 1}\n${formatSrtTimestamp(relStart)} --> ${formatSrtTimestamp(relEnd)}\n${seg.text.trim()}\n`;
      })
      .join('\n');
  }

  const rawText = (clip.caption_text || clip.title || 'Highlight clip').trim();

  // Split into sentence/phrase chunks of ~7 words max per cue
  const words = rawText.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return `1\n00:00:00,000 --> ${formatSrtTimestamp(duration)}\n${clip.title}\n`;
  }

  const wordsPerCue = 7;
  const cues: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    cues.push(words.slice(i, i + wordsPerCue).join(' '));
  }

  const totalWords = words.length;
  let elapsed = 0;

  return cues
    .map((cueText, index) => {
      const cueWords = cueText.split(/\s+/).length;
      const cueDuration =
        index === cues.length - 1
          ? Math.max(0.5, duration - elapsed)
          : Math.max(0.8, (cueWords / totalWords) * duration);
      const start = elapsed;
      const end = Math.min(duration, elapsed + cueDuration);
      elapsed = end;

      return `${index + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${cueText}\n`;
    })
    .join('\n');
}

/**
 * Create a clean, filesystem-safe filename slug.
 */
export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'clip';
}

/**
 * Detect any clips whose manually edited start/end times overlap another clip.
 * Returns a Set of clip IDs involved in an overlap so the UI can warn the user.
 */
export function findOverlappingClipIds(clips: ClipItem[]): Set<string> {
  const overlapping = new Set<string>();
  const sorted = [...clips].sort((a, b) => a.start_seconds - b.start_seconds);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.end_seconds > next.start_seconds) {
      overlapping.add(current.id);
      overlapping.add(next.id);
    }
  }

  return overlapping;
}
