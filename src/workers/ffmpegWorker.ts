/// <reference lib="webworker" />
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import type { AutoEditSettings, BrandPosition } from '../types/clip';

/**
 * Dedicated Web Worker running single-thread ffmpeg.wasm (@ffmpeg/core).
 * Streams large files (up to 1 GB / 1024 MB) via WORKERFS byte-slices so the UI never freezes.
 * Automatically executes the post-cut editing pipeline:
 *  1. Cut clip + remove silences & filler words (silencedetect + Gemini filler spans)
 *  2. Crop/reframe to vertical 9:16 keeping the speaker in frame (speaker_x_ratio)
 *  3. Burn auto-generated caption PNG overlays (sync-remapped after silence cuts)
 *  4. Apply short fade in / fade out (video + audio)
 *  5. Normalize audio volume (loudnorm -16 LUFS)
 *  6. Optional Brand PNG watermark overlay
 */

interface FFmpegCoreInstance {
  FS: {
    mkdir: (path: string) => void;
    mount: (type: unknown, opts: Record<string, unknown>, mountpoint: string) => void;
    unmount: (mountpoint: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
    filesystems: Record<string, unknown>;
  };
  exec: (...args: string[]) => number;
  reset: () => void;
  setLogger: (cb: (data: { type: string; message: string }) => void) => void;
  setProgress: (cb: (data: { progress: number; time: number }) => void) => void;
}

interface TimeInterval {
  start: number;
  end: number;
}

interface CaptionOverlayInput {
  origRelStart: number;
  origRelEnd: number;
  pngBytes: ArrayBuffer;
}

interface BrandOverlayPayload {
  logoBytes: ArrayBuffer;
  position: BrandPosition;
  opacity: number;
  sizePercent: number;
  outputWidth: number;
}

interface HookTitleCardPayload {
  pngBytes: ArrayBuffer;
  duration: number;
}

type WorkerRequest =
  | {
      type: 'cut';
      id: string;
      file: File;
      startSeconds: number;
      endSeconds: number;
      speakerXRatio: number;
      autoEdit: AutoEditSettings;
      fillerSpans?: TimeInterval[];
      captionOverlays?: CaptionOverlayInput[];
      hookTitleCard?: HookTitleCardPayload;
      brandOverlay?: BrandOverlayPayload;
    }
  | {
      type: 'clear';
    };

let ffmpegCore: FFmpegCoreInstance | null = null;
let loadPromise: Promise<FFmpegCoreInstance> | null = null;
let mountedFileKey: string | null = null;
let mountedInputPath = '';
let usedWorkerFs = false;
let activeCutId: string | null = null;
let activeStageLabel = 'Cutting clip...';
let progressRange: [number, number] = [2, 98];
let logCollector: string[] | null = null;

function toAbsoluteUrl(assetUrl: string): string {
  return new URL(assetUrl, self.location.origin).href;
}

async function getFFmpegCore(): Promise<FFmpegCoreInstance> {
  if (ffmpegCore) return ffmpegCore;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const absCoreUrl = toAbsoluteUrl(coreURL);
    const absWasmUrl = toAbsoluteUrl(wasmURL);

    const mod = (await import(/* @vite-ignore */ absCoreUrl)) as {
      default?: (cfg: Record<string, unknown>) => Promise<FFmpegCoreInstance>;
    };
    const createFFmpegCore = mod.default;
    if (typeof createFFmpegCore !== 'function') {
      throw new Error('Failed to load single-thread FFmpeg core module.');
    }

    const core = await createFFmpegCore({
      mainScriptUrlOrBlob: `${absCoreUrl}#${btoa(
        JSON.stringify({ wasmURL: absWasmUrl, workerURL: '' }),
      )}`,
    });

    core.setLogger(({ message }) => {
      if (logCollector && typeof message === 'string') {
        logCollector.push(message);
      }
    });

    core.setProgress(({ progress }) => {
      if (activeCutId && Number.isFinite(progress)) {
        const [minPct, maxPct] = progressRange;
        const scaled = minPct + Math.max(0, Math.min(1, progress)) * (maxPct - minPct);
        self.postMessage({
          type: 'progress',
          id: activeCutId,
          progress: Math.max(minPct, Math.min(99, Math.round(scaled))),
          stage: activeStageLabel,
        });
      }
    });

    ffmpegCore = core;
    return core;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    ffmpegCore = null;
    throw err;
  }
}

function unmountOrDeletePreviousInput(core: FFmpegCoreInstance): void {
  if (!mountedFileKey) return;
  try {
    if (usedWorkerFs) {
      core.FS.unmount('/input');
    } else if (mountedInputPath) {
      core.FS.unlink(mountedInputPath);
    }
  } catch {
    // Ignore cleanup errors
  }
  mountedFileKey = null;
  mountedInputPath = '';
  usedWorkerFs = false;
}

async function ensureSourceMounted(core: FFmpegCoreInstance, file: File): Promise<string> {
  const key = `${file.name}-${file.size}-${file.lastModified}`;
  if (mountedFileKey === key && mountedInputPath) {
    return mountedInputPath;
  }

  unmountOrDeletePreviousInput(core);

  // Use WORKERFS so files up to 1 GB (1024 MB) stream by byte slice without copying into WASM RAM
  try {
    if (core.FS.filesystems?.WORKERFS) {
      try {
        core.FS.mkdir('/input');
      } catch {
        // Directory may already exist
      }
      core.FS.mount(core.FS.filesystems.WORKERFS, { files: [file] }, '/input');
      mountedFileKey = key;
      mountedInputPath = `/input/${file.name}`;
      usedWorkerFs = true;
      return mountedInputPath;
    }
  } catch {
    // Fall back only for smaller files so a 1 GB file never OOMs browser memory
  }

  if (file.size > 400 * 1024 * 1024) {
    throw new Error(
      'Streaming filesystem (WORKERFS) is unavailable in this browser for files over 400 MB.',
    );
  }

  const ext = file.name.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4';
  const fallbackPath = `/source_input.${ext}`;
  const buffer = await file.arrayBuffer();
  core.FS.writeFile(fallbackPath, new Uint8Array(buffer));
  mountedFileKey = key;
  mountedInputPath = fallbackPath;
  usedWorkerFs = false;
  return fallbackPath;
}

/**
 * Parse FFmpeg `silencedetect` output lines into relative [start, end] intervals inside 0..duration.
 */
function parseSilenceIntervals(lines: string[], clipDuration: number): TimeInterval[] {
  const intervals: TimeInterval[] = [];
  let pendingStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (startMatch) {
      pendingStart = Number(startMatch[1]);
      continue;
    }

    const endMatch = line.match(/silence_end:\s*([0-9]+(?:\.[0-9]+)?)/);
    if (endMatch) {
      const endVal = Number(endMatch[1]);
      const startVal = pendingStart !== null ? pendingStart : Math.max(0, endVal - 0.5);
      if (Number.isFinite(startVal) && Number.isFinite(endVal) && endVal > startVal) {
        intervals.push({
          start: Math.max(0, startVal),
          end: Math.min(clipDuration, endVal),
        });
      }
      pendingStart = null;
    }
  }

  if (pendingStart !== null && pendingStart < clipDuration) {
    intervals.push({ start: Math.max(0, pendingStart), end: clipDuration });
  }

  return intervals;
}

/**
 * Merge overlapping or near-adjacent silence/filler intervals and return complementary kept intervals.
 */
function computeKeptIntervals(
  duration: number,
  removals: TimeInterval[],
): { kept: TimeInterval[]; removedSeconds: number; editedDuration: number } {
  const validRemovals = removals
    .map((r) => ({
      start: Math.max(0, Math.min(duration, r.start)),
      end: Math.max(0, Math.min(duration, r.end)),
    }))
    .filter((r) => r.end - r.start >= 0.08)
    .sort((a, b) => a.start - b.start);

  if (validRemovals.length === 0) {
    return { kept: [{ start: 0, end: duration }], removedSeconds: 0, editedDuration: duration };
  }

  const merged: TimeInterval[] = [];
  for (const item of validRemovals) {
    const last = merged[merged.length - 1];
    if (!last || item.start > last.end + 0.15) {
      merged.push({ ...item });
    } else {
      last.end = Math.max(last.end, item.end);
    }
  }

  const kept: TimeInterval[] = [];
  let cursor = 0;
  for (const rem of merged) {
    if (rem.start - cursor >= 0.25) {
      kept.push({ start: cursor, end: rem.start });
    }
    cursor = Math.max(cursor, rem.end);
  }
  if (duration - cursor >= 0.25) {
    kept.push({ start: cursor, end: duration });
  }

  const totalKept = kept.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
  if (kept.length === 0 || totalKept < 0.5) {
    return { kept: [{ start: 0, end: duration }], removedSeconds: 0, editedDuration: duration };
  }

  const removedSeconds = Math.max(0, Number((duration - totalKept).toFixed(1)));
  if (removedSeconds < 0.2) {
    return { kept: [{ start: 0, end: duration }], removedSeconds: 0, editedDuration: duration };
  }

  return { kept, removedSeconds, editedDuration: totalKept };
}

/**
 * Map a relative timestamp from the original uncut clip timeline onto the new timeline
 * after silence/filler intervals are removed, keeping burned-in captions lip-synced.
 */
function remapPointThroughKept(t: number, kept: TimeInterval[]): number {
  let acc = 0;
  for (const seg of kept) {
    if (t <= seg.start) return acc;
    if (t <= seg.end) return acc + (t - seg.start);
    acc += seg.end - seg.start;
  }
  return acc;
}

function remapCaptionsToEditedTimeline(
  captions: CaptionOverlayInput[],
  kept: TimeInterval[],
): Array<{ start: number; end: number; pngBytes: ArrayBuffer }> {
  const mapped: Array<{ start: number; end: number; pngBytes: ArrayBuffer }> = [];
  for (const cue of captions) {
    const newStart = remapPointThroughKept(cue.origRelStart, kept);
    const newEnd = remapPointThroughKept(cue.origRelEnd, kept);
    if (newEnd - newStart >= 0.2) {
      mapped.push({
        start: Number(newStart.toFixed(2)),
        end: Number(newEnd.toFixed(2)),
        pngBytes: cue.pngBytes,
      });
    }
  }
  return mapped;
}

/**
 * Build the combined FFmpeg master filter arguments for:
 * - Vertical 9:16 speaker-tracked crop
 * - Burned-in caption PNG overlays
 * - Optional Brand PNG watermark overlay
 * - Video & audio short fade in/out
 * - Audio volume normalization (loudnorm -16 LUFS)
 */
function buildMasterAutoEditArgs(params: {
  core: FFmpegCoreInstance;
  safeId: string;
  editedDuration: number;
  hasAudio: boolean;
  speakerXRatio: number;
  autoEdit: AutoEditSettings;
  captionOverlays: Array<{ start: number; end: number; path: string }>;
  hookTitleCardPath?: string | null;
  hookTitleCardDuration?: number;
  brandOverlay?: BrandOverlayPayload;
  brandLogoPath: string | null;
}): string[] {
  const {
    editedDuration,
    hasAudio,
    speakerXRatio,
    autoEdit,
    captionOverlays,
    hookTitleCardPath,
    hookTitleCardDuration = 2.2,
    brandOverlay,
    brandLogoPath,
  } = params;

  const extraInputs: string[] = [];
  let nextInputIdx = 1;

  const captionInputIndices: Array<{ idx: number; start: number; end: number }> = [];
  for (const cap of captionOverlays) {
    extraInputs.push('-i', cap.path);
    captionInputIndices.push({ idx: nextInputIdx++, start: cap.start, end: cap.end });
  }

  let hookInputIdx: number | null = null;
  if (hookTitleCardPath) {
    extraInputs.push('-i', hookTitleCardPath);
    hookInputIdx = nextInputIdx++;
  }

  let brandInputIdx: number | null = null;
  if (brandLogoPath && brandOverlay) {
    extraInputs.push('-i', brandLogoPath);
    brandInputIdx = nextInputIdx++;
  }

  // Video chain
  const videoChains: string[] = [];
  const ratio = Math.max(0.15, Math.min(0.85, speakerXRatio || 0.5)).toFixed(2);
  let currentV = '[0:v]';

  if (autoEdit.reframeVertical) {
    // Keep the speaker centered horizontally inside the 1080x1920 9:16 crop window
    videoChains.push(
      `${currentV}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='max(0,min(iw-1080,iw*${ratio}-540))':y='max(0,(ih-1920)/2)',setsar=1[vbase]`,
    );
    currentV = '[vbase]';
  } else {
    videoChains.push(`${currentV}setsar=1[vbase]`);
    currentV = '[vbase]';
  }

  // Burn caption PNG cues onto the video at bottom-safe margin
  captionInputIndices.forEach((cap, i) => {
    const outLabel = `[vcap${i}]`;
    const s = cap.start.toFixed(2);
    const e = cap.end.toFixed(2);
    videoChains.push(
      `${currentV}[${cap.idx}:v]overlay=x=(W-w)/2:y=H-h-round(H*0.13):enable='between(t,${s},${e})':eof_action=repeat${outLabel}`,
    );
    currentV = outLabel;
  });

  // Burn optional 2-second hook title card PNG near top-safe zone
  if (hookInputIdx !== null) {
    const hookEnd = Math.min(editedDuration, Math.max(0.8, hookTitleCardDuration)).toFixed(2);
    videoChains.push(
      `${currentV}[${hookInputIdx}:v]overlay=x=(W-w)/2:y=round(H*0.10):enable='between(t,0,${hookEnd})':eof_action=repeat[vhook]`,
    );
    currentV = '[vhook]';
  }

  // Brand PNG watermark overlay
  if (brandInputIdx !== null && brandOverlay) {
    const targetOutWidth = autoEdit.reframeVertical
      ? 1080
      : Math.max(320, brandOverlay.outputWidth || 1280);
    const rawLogoWidth = Math.max(24, Math.round((targetOutWidth * brandOverlay.sizePercent) / 100));
    const logoWidthEven = rawLogoWidth % 2 === 0 ? rawLogoWidth : rawLogoWidth + 1;
    const pad = Math.max(16, Math.round(targetOutWidth * 0.03));
    const alpha = Math.max(0.05, Math.min(1, brandOverlay.opacity / 100)).toFixed(2);

    let posExpr = `W-w-${pad}:H-h-${pad}`;
    switch (brandOverlay.position) {
      case 'top-left':
        posExpr = `${pad}:${pad}`;
        break;
      case 'top-right':
        posExpr = `W-w-${pad}:${pad}`;
        break;
      case 'bottom-left':
        posExpr = `${pad}:H-h-${pad}`;
        break;
      case 'bottom-right':
        posExpr = `W-w-${pad}:H-h-${pad}`;
        break;
    }

    videoChains.push(
      `[${brandInputIdx}:v]scale=${logoWidthEven}:-1,format=rgba,colorchannelmixer=aa=${alpha}[logo]`,
    );
    videoChains.push(`${currentV}[logo]overlay=${posExpr}:eof_action=repeat[vbrand]`);
    currentV = '[vbrand]';
  }

  // Short video fade in / fade out (0.35s standard, scaled smoothly for short 1s clips)
  if (autoEdit.fadeInOut && editedDuration >= 0.6) {
    const fadeDur = Math.min(0.35, Number((editedDuration * 0.25).toFixed(2)));
    const fadeOutStart = Math.max(fadeDur + 0.05, editedDuration - fadeDur).toFixed(2);
    videoChains.push(
      `${currentV}fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${fadeOutStart}:d=${fadeDur}[vout]`,
    );
    currentV = '[vout]';
  }

  const filterComplex = videoChains.join(';');

  // Audio filters: loudness normalization + short audio fade in/out
  const audioFilters: string[] = [];
  if (hasAudio) {
    if (autoEdit.normalizeAudio) {
      // Follow loudnorm with aresample=44100 because loudnorm upsamples internally to 192kHz
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11', 'aresample=44100');
    }
    if (autoEdit.fadeInOut && editedDuration >= 0.6) {
      const fadeDur = Math.min(0.35, Number((editedDuration * 0.25).toFixed(2)));
      const fadeOutStart = Math.max(fadeDur + 0.05, editedDuration - fadeDur).toFixed(2);
      audioFilters.push(
        `afade=t=in:st=0:d=${fadeDur}`,
        `afade=t=out:st=${fadeOutStart}:d=${fadeDur}`,
      );
    }
  }

  const args: string[] = [...extraInputs, '-filter_complex', filterComplex, '-map', currentV, '-map', '0:a?'];
  if (hasAudio && audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','));
  }
  return args;
}

function safeUnlink(core: FFmpegCoreInstance, filePath: string): void {
  try {
    core.FS.unlink(filePath);
  } catch {
    // Ignore missing/locked files
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;

  if (msg.type === 'clear') {
    if (ffmpegCore) {
      unmountOrDeletePreviousInput(ffmpegCore);
    }
    return;
  }

  if (msg.type === 'cut') {
    const {
      id,
      file,
      startSeconds,
      endSeconds,
      speakerXRatio,
      autoEdit,
      fillerSpans,
      captionOverlays,
      hookTitleCard,
      brandOverlay,
    } = msg;

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const outputName = `/clip_${safeId}.mp4`;
    const rawJoinedPath = `/raw_joined_${safeId}.mp4`;
    const brandLogoPath = brandOverlay ? `/brand_${safeId}.png` : null;
    const hookTitleCardPath = hookTitleCard ? `/hook_${safeId}.png` : null;
    const concatListPath = `/concat_${safeId}.txt`;
    const tempSegmentPaths: string[] = [];
    const tempCaptionPaths: string[] = [];

    try {
      activeCutId = id;
      activeStageLabel = 'Preparing clip cut...';
      progressRange = [2, 10];
      self.postMessage({ type: 'progress', id, progress: 2, stage: activeStageLabel });

      const core = await getFFmpegCore();
      const inputPath = await ensureSourceMounted(core, file);
      const duration = Math.max(1, endSeconds - startSeconds);

      if (brandLogoPath && brandOverlay) {
        core.FS.writeFile(brandLogoPath, new Uint8Array(brandOverlay.logoBytes));
      }
      if (hookTitleCardPath && hookTitleCard) {
        core.FS.writeFile(hookTitleCardPath, new Uint8Array(hookTitleCard.pngBytes));
      }

      // Probe audio presence + run silencedetect when silence removal is enabled
      let keptIntervals: TimeInterval[] = [{ start: 0, end: duration }];
      let removedSeconds = 0;
      let editedDuration = duration;
      let hasAudio = true;

      if (autoEdit.removeSilences) {
        activeStageLabel = 'Removing silences & pauses...';
        progressRange = [5, 18];
        self.postMessage({ type: 'progress', id, progress: 5, stage: activeStageLabel });

        const collectedLogs: string[] = [];
        logCollector = collectedLogs;
        const detectCode = core.exec(
          '-ss',
          startSeconds.toFixed(2),
          '-i',
          inputPath,
          '-t',
          duration.toFixed(2),
          '-vn',
          '-af',
          'silencedetect=noise=-32dB:d=0.45',
          '-f',
          'null',
          '-',
        );
        logCollector = null;
        core.reset();

        if (detectCode !== 0) {
          hasAudio = false;
        }

        const silenceIntervals =
          detectCode === 0 ? parseSilenceIntervals(collectedLogs, duration) : [];

        const relFillers: TimeInterval[] = (fillerSpans || [])
          .map((fw) => ({
            start: fw.start - startSeconds,
            end: fw.end - startSeconds,
          }))
          .filter((fw) => fw.end > 0 && fw.start < duration);

        const computed = computeKeptIntervals(duration, [...silenceIntervals, ...relFillers]);
        keptIntervals = computed.kept;
        removedSeconds = computed.removedSeconds;
        editedDuration = computed.editedDuration;
      }

      // Remap caption cue timestamps so burned-in captions stay synced after silences are cut out
      const remappedCaptions =
        autoEdit.burnCaptions && Array.isArray(captionOverlays)
          ? remapCaptionsToEditedTimeline(captionOverlays, keptIntervals)
          : [];

      const writtenCaptions: Array<{ start: number; end: number; path: string }> = [];
      remappedCaptions.forEach((cap, idx) => {
        const capPath = `/cap_${safeId}_${idx}.png`;
        core.FS.writeFile(capPath, new Uint8Array(cap.pngBytes));
        tempCaptionPaths.push(capPath);
        writtenCaptions.push({ start: cap.start, end: cap.end, path: capPath });
      });

      const needsMasterAutoEdit =
        autoEdit.reframeVertical ||
        autoEdit.fadeInOut ||
        (hasAudio && autoEdit.normalizeAudio) ||
        writtenCaptions.length > 0 ||
        Boolean(hookTitleCardPath) ||
        Boolean(brandLogoPath);

      if (keptIntervals.length <= 1) {
        // Single contiguous interval -> cut + auto-edit in one unified FFmpeg pass
        const seg = keptIntervals[0] || { start: 0, end: duration };
        const absStart = startSeconds + seg.start;
        const segDur = Math.max(0.5, seg.end - seg.start);
        editedDuration = segDur;

        activeStageLabel = autoEdit.burnCaptions
          ? 'Auto-editing & burning captions...'
          : autoEdit.reframeVertical
            ? 'Reframing 9:16 & normalizing audio...'
            : 'Auto-editing clip...';
        progressRange = [18, 96];
        self.postMessage({ type: 'progress', id, progress: 20, stage: activeStageLabel });

        const masterArgs = needsMasterAutoEdit
          ? buildMasterAutoEditArgs({
              core,
              safeId,
              editedDuration: segDur,
              hasAudio,
              speakerXRatio,
              autoEdit,
              captionOverlays: writtenCaptions,
              hookTitleCardPath,
              hookTitleCardDuration: hookTitleCard?.duration,
              brandOverlay,
              brandLogoPath,
            })
          : [];

        const args: string[] = [
          '-ss',
          absStart.toFixed(2),
          '-t',
          segDur.toFixed(2),
          '-i',
          inputPath,
          ...masterArgs,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-ar',
          '44100',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          '-y',
          outputName,
        ];

        const exitCode = core.exec(...args);
        core.reset();

        if (exitCode !== 0) {
          throw new Error(`FFmpeg exited with code ${exitCode} while auto-editing this clip.`);
        }
      } else {
        // Stage 1: Cut each non-silent segment & concatenate seamlessly
        const totalSegs = keptIntervals.length;
        for (let i = 0; i < totalSegs; i++) {
          const seg = keptIntervals[i];
          const absStart = startSeconds + seg.start;
          const segDuration = Math.max(0.25, seg.end - seg.start);
          const segPath = `/seg_${safeId}_${i}.mp4`;
          tempSegmentPaths.push(segPath);

          const pctStart = 18 + Math.round((i / totalSegs) * 42);
          const pctEnd = 18 + Math.round(((i + 1) / totalSegs) * 42);
          progressRange = [pctStart, pctEnd];
          activeStageLabel = `Cutting speech segment ${i + 1}/${totalSegs}...`;
          self.postMessage({ type: 'progress', id, progress: pctStart, stage: activeStageLabel });

          const segExit = core.exec(
            '-ss',
            absStart.toFixed(2),
            '-t',
            segDuration.toFixed(2),
            '-i',
            inputPath,
            '-r',
            '30',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '20',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-ar',
            '44100',
            '-ac',
            '2',
            '-b:a',
            '128k',
            '-y',
            segPath,
          );
          core.reset();

          if (segExit !== 0) {
            throw new Error(`FFmpeg failed while cutting segment ${i + 1} of ${totalSegs}.`);
          }
        }

        activeStageLabel = 'Joining clean segments...';
        progressRange = [60, 66];
        self.postMessage({ type: 'progress', id, progress: 61, stage: activeStageLabel });

        const concatManifest = tempSegmentPaths.map((p) => `file '${p}'`).join('\n');
        core.FS.writeFile(concatListPath, new TextEncoder().encode(concatManifest));

        const intermediateOut = needsMasterAutoEdit ? rawJoinedPath : outputName;
        const concatExit = core.exec(
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          concatListPath,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          '-y',
          intermediateOut,
        );
        core.reset();

        if (concatExit !== 0) {
          throw new Error(`FFmpeg failed while joining segments (exit ${concatExit}).`);
        }

        // Release temporary segment files early to keep WASM RAM low
        tempSegmentPaths.forEach((p) => safeUnlink(core, p));
        tempSegmentPaths.length = 0;

        // Stage 2: Apply 9:16 speaker reframe, burned captions, fades, audio normalization, and brand logo
        if (needsMasterAutoEdit) {
          activeStageLabel = 'Auto-editing (9:16, captions, fades, audio)...';
          progressRange = [66, 97];
          self.postMessage({ type: 'progress', id, progress: 68, stage: activeStageLabel });

          const masterArgs = buildMasterAutoEditArgs({
            core,
            safeId,
            editedDuration,
            hasAudio,
            speakerXRatio,
            autoEdit,
            captionOverlays: writtenCaptions,
            hookTitleCardPath,
            hookTitleCardDuration: hookTitleCard?.duration,
            brandOverlay,
            brandLogoPath,
          });

          const masterExit = core.exec(
            '-i',
            rawJoinedPath,
            ...masterArgs,
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-ar',
            '44100',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            '-y',
            outputName,
          );
          core.reset();

          if (masterExit !== 0) {
            throw new Error(`FFmpeg failed during post-cut auto-editing (exit ${masterExit}).`);
          }
        }
      }

      const rawOutput = core.FS.readFile(outputName);
      const outputCopy = new Uint8Array(rawOutput.byteLength);
      outputCopy.set(rawOutput);

      self.postMessage(
        { type: 'done', id, buffer: outputCopy.buffer, removedSeconds },
        [outputCopy.buffer],
      );
    } catch (err) {
      if (ffmpegCore) {
        try {
          ffmpegCore.reset();
        } catch {
          // Ignore reset errors
        }
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Browser cutting & auto-editing failed in worker. Try adjusting toggles or retrying.';
      self.postMessage({ type: 'error', id, error: errorMessage });
    } finally {
      logCollector = null;
      activeCutId = null;
      if (ffmpegCore) {
        safeUnlink(ffmpegCore, outputName);
        safeUnlink(ffmpegCore, rawJoinedPath);
        if (brandLogoPath) safeUnlink(ffmpegCore, brandLogoPath);
        if (hookTitleCardPath) safeUnlink(ffmpegCore, hookTitleCardPath);
        safeUnlink(ffmpegCore, concatListPath);
        tempSegmentPaths.forEach((p) => safeUnlink(ffmpegCore!, p));
        tempCaptionPaths.forEach((p) => safeUnlink(ffmpegCore!, p));
      }
    }
  }
};
