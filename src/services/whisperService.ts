import type { CaptionLanguage, TranscriptSegment } from '../types/clip';

/**
 * Optional on-device speech transcription powered by @huggingface/transformers (Whisper Tiny).
 * Lazy-loaded only when the user explicitly toggles On-device transcription ON,
 * so the initial bundle stays lightweight. Runs via WebGPU when available, falling back to WASM.
 */

interface WhisperChunk {
  text?: string;
  timestamp?: [number | null, number | null];
}

interface WhisperOutput {
  text?: string;
  chunks?: WhisperChunk[];
}

type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<WhisperOutput>;

const cachedPipelines = new Map<string, Promise<AsrPipeline>>();

async function detectPreferredDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    };
    if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Fall back to WASM
  }
  return 'wasm';
}

async function decodeAudioBlobToMono16kHz(audioBlob: Blob): Promise<Float32Array> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is unavailable in this browser for local Whisper decoding.');
  }

  const ctx = new AudioCtx({ sampleRate: 16000 });
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    if (audioBuffer.numberOfChannels <= 1) {
      return new Float32Array(audioBuffer.getChannelData(0));
    }

    // Mix multi-channel audio down to mono if browser decoded stereo
    const length = audioBuffer.length;
    const mixed = new Float32Array(length);
    const channels = audioBuffer.numberOfChannels;
    for (let ch = 0; ch < channels; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mixed[i] += data[i] / channels;
      }
    }
    return mixed;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function getWhisperPipeline(
  modelId: string,
  device: 'webgpu' | 'wasm',
  onModelProgress?: (statusLabel: string, percent?: number) => void,
): Promise<AsrPipeline> {
  const cacheKey = `${modelId}::${device}`;
  const existing = cachedPipelines.get(cacheKey);
  if (existing) return existing;

  const loaderPromise = (async () => {
    onModelProgress?.(`Loading on-device Whisper model (${device.toUpperCase()})...`, 5);
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;

    const asr = await pipeline('automatic-speech-recognition', modelId, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
        if (typeof info.progress === 'number' && Number.isFinite(info.progress)) {
          onModelProgress?.(
            `Downloading Whisper model (${Math.round(info.progress)}%)...`,
            Math.round(info.progress),
          );
        }
      },
    });

    return asr as unknown as AsrPipeline;
  })();

  cachedPipelines.set(cacheKey, loaderPromise);

  try {
    return await loaderPromise;
  } catch (err) {
    cachedPipelines.delete(cacheKey);
    // If WebGPU failed mid-init, retry cleanly on WASM once
    if (device === 'webgpu') {
      return getWhisperPipeline(modelId, 'wasm', onModelProgress);
    }
    throw err;
  }
}

function mapLanguageCode(captionLanguage: CaptionLanguage): string | undefined {
  switch (captionLanguage) {
    case 'English':
      return 'english';
    case 'Hindi':
    case 'Hinglish':
      return 'hindi';
    case 'Marathi':
      return 'marathi';
    case 'Spanish':
      return 'spanish';
    default:
      return undefined;
  }
}

export async function transcribeWithWhisperInBrowser(params: {
  audioBlob: Blob;
  durationSeconds: number;
  captionLanguage: CaptionLanguage;
  onStatus?: (label: string, progress?: number) => void;
  signal?: AbortSignal;
}): Promise<TranscriptSegment[]> {
  const { audioBlob, durationSeconds, captionLanguage, onStatus, signal } = params;

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onStatus?.('Decoding audio for on-device Whisper...', 10);
  const pcm16k = await decodeAudioBlobToMono16kHz(audioBlob);

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const device = await detectPreferredDevice();
  const isEnglish = captionLanguage === 'English';
  const modelId = isEnglish ? 'Xenova/whisper-tiny.en' : 'Xenova/whisper-tiny';

  const asr = await getWhisperPipeline(modelId, device, (label, pct) => {
    onStatus?.(label, pct);
  });

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onStatus?.(`Transcribing audio locally (${device.toUpperCase()})...`, 65);

  const options: Record<string, unknown> = {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  };
  if (!isEnglish) {
    const lang = mapLanguageCode(captionLanguage);
    if (lang) {
      options.language = lang;
      options.task = 'transcribe';
    }
  }

  const output = await asr(pcm16k, options);
  const chunks = Array.isArray(output?.chunks) ? output.chunks : [];

  const segments: TranscriptSegment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = String(chunk?.text || '').trim();
    if (!text) continue;

    const rawStart = chunk?.timestamp?.[0];
    const rawEnd = chunk?.timestamp?.[1];
    const start =
      typeof rawStart === 'number' && Number.isFinite(rawStart)
        ? Math.max(0, rawStart)
        : segments.length > 0
          ? segments[segments.length - 1].end_seconds
          : 0;
    const nextStart =
      typeof chunks[i + 1]?.timestamp?.[0] === 'number'
        ? (chunks[i + 1].timestamp?.[0] as number)
        : durationSeconds;
    const end =
      typeof rawEnd === 'number' && Number.isFinite(rawEnd) && rawEnd > start
        ? Math.min(durationSeconds, rawEnd)
        : Math.min(durationSeconds, Math.max(start + 1.2, nextStart));

    segments.push({
      start_seconds: Number(start.toFixed(2)),
      end_seconds: Number(Math.max(start + 0.3, end).toFixed(2)),
      text,
    });
  }

  if (segments.length === 0 && output?.text?.trim()) {
    segments.push({
      start_seconds: 0,
      end_seconds: Math.max(2, Number(durationSeconds.toFixed(2))),
      text: output.text.trim(),
    });
  }

  onStatus?.('On-device transcription complete.', 100);
  return segments;
}
