import JSZip from 'jszip';
import type { CaptionLanguage, ClipItem, ClipSourceMode } from '../types/clip';
import { buildSrtContent, formatTimecode, sanitizeFileName } from '../utils/format';

/**
 * Build a clear, consistent filename such as "clip-01-my-hook.mp4".
 */
export function buildClipFileName(clip: ClipItem, index: number, ext: 'mp4' | 'srt'): string {
  const slug = sanitizeFileName(clip.title);
  return `clip-${String(index + 1).padStart(2, '0')}-${slug}.${ext}`;
}

/**
 * Trigger a clean browser download for any Blob without opening popups.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation slightly so mobile browsers finish reading the download stream
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Download an individual cut clip as clip-01-title.mp4
 */
export function downloadCutClip(clip: ClipItem, index: number): void {
  if (!clip.outputBlob) return;
  triggerBlobDownload(clip.outputBlob, buildClipFileName(clip, index, 'mp4'));
}

/**
 * Share or Save to Files using the Web Share API (navigator.canShare + navigator.share).
 * Falls back gracefully to a normal browser download if unsupported.
 */
export async function shareOrDownloadClip(clip: ClipItem, index: number): Promise<void> {
  if (!clip.outputBlob) return;
  const filename = buildClipFileName(clip, index, 'mp4');

  try {
    const file = new File([clip.outputBlob], filename, { type: 'video/mp4' });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        title: clip.title,
      });
      return;
    }
  } catch (err) {
    // If the user explicitly cancelled the native share sheet, do not force a duplicate download
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    // Any other share failure falls through to standard file download
  }

  triggerBlobDownload(clip.outputBlob, filename);
}

/**
 * Generate and download the .srt subtitle file for a clip.
 */
export function downloadClipSrt(clip: ClipItem, index: number): void {
  const srt = buildSrtContent(clip);
  const blob = new Blob([srt], { type: 'application/x-subrip;charset=utf-8' });
  triggerBlobDownload(blob, buildClipFileName(clip, index, 'srt'));
}

export interface SceneBreakdownExport {
  exportedAt: string;
  sourceMode: ClipSourceMode;
  sourceName: string;
  totalDurationSeconds?: number;
  captionLanguage: CaptionLanguage;
  clipCount: number;
  scenes: Array<{
    clipNumber: number;
    id: string;
    title: string;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
    start_timecode: string;
    end_timecode: string;
    hook_reason: string;
    caption_text: string;
    caption_language: CaptionLanguage;
    speaker_x_ratio: number;
    transcript: Array<{
      start_seconds: number;
      end_seconds: number;
      start_timecode: string;
      end_timecode: string;
      text: string;
      filler_words?: Array<{
        word: string;
        start_seconds: number;
        end_seconds: number;
      }>;
    }>;
  }>;
}

/**
 * Export the full scene breakdown (all clip titles, timestamps, hook reasons,
 * and associated timestamped transcript segments) as a formatted JSON file.
 */
export function downloadSceneBreakdownJson(params: {
  clips: ClipItem[];
  sourceMode: ClipSourceMode;
  sourceName: string;
  totalDurationSeconds?: number;
  captionLanguage: CaptionLanguage;
}): void {
  const { clips, sourceMode, sourceName, totalDurationSeconds, captionLanguage } = params;
  if (clips.length === 0) return;

  const payload: SceneBreakdownExport = {
    exportedAt: new Date().toISOString(),
    sourceMode,
    sourceName,
    ...(typeof totalDurationSeconds === 'number' && totalDurationSeconds > 0
      ? { totalDurationSeconds: Number(totalDurationSeconds.toFixed(2)) }
      : {}),
    captionLanguage,
    clipCount: clips.length,
    scenes: clips.map((clip, idx) => ({
      clipNumber: idx + 1,
      id: clip.id,
      title: clip.title,
      start_seconds: clip.start_seconds,
      end_seconds: clip.end_seconds,
      duration_seconds: Math.max(1, Number((clip.end_seconds - clip.start_seconds).toFixed(2))),
      start_timecode: formatTimecode(clip.start_seconds),
      end_timecode: formatTimecode(clip.end_seconds),
      hook_reason: clip.hook_reason,
      caption_text: clip.caption_text,
      caption_language: clip.captionLanguage || captionLanguage,
      speaker_x_ratio: typeof clip.speaker_x_ratio === 'number' ? clip.speaker_x_ratio : 0.5,
      transcript: (clip.transcript || []).map((seg) => ({
        start_seconds: seg.start_seconds,
        end_seconds: seg.end_seconds,
        start_timecode: formatTimecode(seg.start_seconds),
        end_timecode: formatTimecode(seg.end_seconds),
        text: seg.text,
        ...(Array.isArray(seg.filler_words) && seg.filler_words.length > 0
          ? { filler_words: seg.filler_words }
          : {}),
      })),
    })),
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const baseName = sanitizeFileName(sourceName || 'clip-cutter');
  triggerBlobDownload(blob, `${baseName}-scene-breakdown.json`);
}

/**
 * Package all cut MP4 clips (and their matching .srt caption files) into a single ZIP bundle.
 */
export async function downloadAllClipsAsZip(
  clips: ClipItem[],
  sourceVideoName: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const readyClips = clips.filter((c) => c.cutStatus === 'done' && c.outputBlob);
  if (readyClips.length === 0) {
    throw new Error('Cut at least one clip before saving all clips.');
  }

  const zip = new JSZip();

  clips.forEach((clip, idx) => {
    if (clip.cutStatus === 'done' && clip.outputBlob) {
      const mp4Name = buildClipFileName(clip, idx, 'mp4');
      const srtName = buildClipFileName(clip, idx, 'srt');
      zip.file(mp4Name, clip.outputBlob);
      zip.file(srtName, buildSrtContent(clip));
    }
  });

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      // MP4 files are already compressed, so STORE avoids wasting mobile CPU
      compression: 'STORE',
    },
    (metadata) => {
      onProgress?.(Math.round(metadata.percent));
    },
  );

  const archiveName = `${sanitizeFileName(sourceVideoName)}-clips.zip`;
  triggerBlobDownload(zipBlob, archiveName);
}
