import type {
  AutoEditSettings,
  BrandSettings,
  ClipItem,
  ExtractedAudioResult,
} from '../types/clip';
import { renderCaptionOverlayPngs, renderHookTitleCardPng } from '../utils/captionRenderer';

type WorkerResponse =
  | { type: 'progress'; id: string; progress: number; stage?: string }
  | { type: 'done'; id: string; buffer: ArrayBuffer; removedSeconds?: number }
  | { type: 'audio-done'; id: string; buffer: ArrayBuffer; mimeType: string; fileName: string }
  | { type: 'error'; id: string; error: string };

export interface CutClipResult {
  blob: Blob;
  removedSeconds: number;
}

type PendingJob =
  | {
      kind: 'cut';
      resolve: (result: CutClipResult) => void;
      reject: (err: Error) => void;
      onProgress: (percent: number, stage?: string) => void;
    }
  | {
      kind: 'audio';
      resolve: (result: ExtractedAudioResult) => void;
      reject: (err: Error) => void;
      onProgress: (percent: number, stage?: string) => void;
    };

/**
 * Main-thread bridge to our dedicated ffmpeg.wasm Web Worker.
 * Streams video via WORKERFS to either extract compact 16kHz mono speech audio
 * or cut & auto-edit clips with burned caption PNG overlays.
 */
let workerInstance: Worker | null = null;
const pendingJobs = new Map<string, PendingJob>();

function getWorker(): Worker {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(new URL('../workers/ffmpegWorker.ts', import.meta.url), {
    type: 'module',
  });

  workerInstance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const job = pendingJobs.get(msg.id);
    if (!job) return;

    if (msg.type === 'progress') {
      job.onProgress(msg.progress, msg.stage);
      return;
    }

    if (msg.type === 'done' && job.kind === 'cut') {
      pendingJobs.delete(msg.id);
      job.onProgress(100);
      job.resolve({
        blob: new Blob([msg.buffer], { type: 'video/mp4' }),
        removedSeconds: typeof msg.removedSeconds === 'number' ? msg.removedSeconds : 0,
      });
      return;
    }

    if (msg.type === 'audio-done' && job.kind === 'audio') {
      pendingJobs.delete(msg.id);
      job.onProgress(100);
      const blob = new Blob([msg.buffer], { type: msg.mimeType || 'audio/ogg' });
      job.resolve({
        blob,
        mimeType: msg.mimeType || 'audio/ogg',
        fileName: msg.fileName || 'speech-audio.ogg',
        sizeBytes: blob.size,
      });
      return;
    }

    if (msg.type === 'error') {
      pendingJobs.delete(msg.id);
      job.reject(new Error(msg.error || 'FFmpeg worker failed.'));
    }
  };

  workerInstance.onerror = (errEvent) => {
    const err = new Error(
      errEvent.message
        ? `Web Worker error (ffmpeg.wasm): ${errEvent.message}`
        : 'Could not initialize ffmpeg.wasm Web Worker.',
    );
    pendingJobs.forEach((job) => job.reject(err));
    pendingJobs.clear();
    workerInstance?.terminate();
    workerInstance = null;
  };

  return workerInstance;
}

/**
 * Extract a small 16 kHz mono 32 kbps speech track (Opus/MP3/AAC) on-device using WORKERFS.
 * Reused both for cloud/Whisper transcription and for the Waveform timeline.
 */
export async function extractCompactAudioInBrowser(
  sourceFile: File,
  onProgress: (percent: number, stage?: string) => void,
): Promise<ExtractedAudioResult> {
  const jobId = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return new Promise<ExtractedAudioResult>((resolve, reject) => {
    const worker = getWorker();
    pendingJobs.set(jobId, { kind: 'audio', resolve, reject, onProgress });
    worker.postMessage({
      type: 'extract-audio',
      id: jobId,
      file: sourceFile,
    });
  });
}

/**
 * Extract absolute filler word intervals belonging to this clip from its transcript.
 */
function extractFillerSpansForClip(clip: ClipItem): Array<{ start: number; end: number }> {
  if (!clip.transcript || clip.transcript.length === 0) return [];
  const spans: Array<{ start: number; end: number }> = [];
  for (const seg of clip.transcript) {
    if (!Array.isArray(seg.filler_words)) continue;
    for (const fw of seg.filler_words) {
      if (fw.end_seconds > clip.start_seconds && fw.start_seconds < clip.end_seconds) {
        spans.push({ start: fw.start_seconds, end: fw.end_seconds });
      }
    }
  }
  return spans;
}

/**
 * Step 3: Cut clip and immediately run all enabled automatic post-cut edits in the Web Worker.
 */
export async function cutClipInBrowser(params: {
  sourceFile: File;
  sourceWidth: number;
  clip: ClipItem;
  autoEdit: AutoEditSettings;
  brandSettings?: BrandSettings;
  onProgress: (percent: number, stage?: string) => void;
}): Promise<CutClipResult> {
  const { sourceFile, sourceWidth, clip, autoEdit, brandSettings, onProgress } = params;

  const shouldRemoveSilences =
    typeof clip.removeSilencesAndFillers === 'boolean'
      ? clip.removeSilencesAndFillers
      : autoEdit.removeSilences;

  const effectiveAutoEdit: AutoEditSettings = {
    ...autoEdit,
    removeSilences: shouldRemoveSilences,
  };

  const targetOutWidth = effectiveAutoEdit.reframeVertical
    ? 1080
    : Math.max(480, sourceWidth || 1280);

  const fillerSpans = effectiveAutoEdit.removeSilences ? extractFillerSpansForClip(clip) : [];

  const captionOverlays = effectiveAutoEdit.burnCaptions
    ? await renderCaptionOverlayPngs(clip, targetOutWidth, effectiveAutoEdit.captionStyle)
    : [];

  let hookTitleCard: { pngBytes: ArrayBuffer; duration: number } | undefined;
  if (clip.addHookTitleCard) {
    const hookText = (clip.hook_line || clip.title || '').trim();
    const pngBytes = await renderHookTitleCardPng(hookText, targetOutWidth);
    if (pngBytes) {
      hookTitleCard = { pngBytes, duration: 2.2 };
    }
  }

  let brandOverlay:
    | {
        logoBytes: ArrayBuffer;
        position: BrandSettings['position'];
        opacity: number;
        sizePercent: number;
        outputWidth: number;
      }
    | undefined;

  if (brandSettings?.applyToAllClips && brandSettings.logoBlob) {
    const logoBytes = await brandSettings.logoBlob.arrayBuffer();
    brandOverlay = {
      logoBytes,
      position: brandSettings.position,
      opacity: brandSettings.opacity,
      sizePercent: brandSettings.sizePercent,
      outputWidth: targetOutWidth,
    };
  }

  return new Promise<CutClipResult>((resolve, reject) => {
    const worker = getWorker();
    pendingJobs.set(clip.id, { kind: 'cut', resolve, reject, onProgress });
    const transferables: Transferable[] = [];
    if (brandOverlay?.logoBytes) {
      transferables.push(brandOverlay.logoBytes);
    }
    if (hookTitleCard?.pngBytes) {
      transferables.push(hookTitleCard.pngBytes);
    }
    captionOverlays.forEach((c) => transferables.push(c.pngBytes));

    worker.postMessage(
      {
        type: 'cut',
        id: clip.id,
        file: sourceFile,
        startSeconds: clip.start_seconds,
        endSeconds: clip.end_seconds,
        speakerXRatio: typeof clip.speaker_x_ratio === 'number' ? clip.speaker_x_ratio : 0.5,
        autoEdit: effectiveAutoEdit,
        fillerSpans,
        captionOverlays,
        hookTitleCard,
        brandOverlay,
      },
      transferables,
    );
  });
}

/**
 * Release cached source file inside the worker when user clears or replaces the video.
 */
export function clearFFmpegCache(): void {
  if (!workerInstance) return;
  workerInstance.postMessage({ type: 'clear' });
}
