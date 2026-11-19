import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ClipItem, VideoAsset } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface WaveformTimelineProps {
  video: VideoAsset;
  clip: ClipItem;
  clipIndex: number;
  disabled: boolean;
  onUpdateTimes: (clipId: string, startSeconds: number, endSeconds: number) => void;
}

const MAX_PCM_DECODE_BYTES = 150 * 1024 * 1024;
const BAR_COUNT = 84;

function buildFallbackEnvelope(seedStr: string, count: number): number[] {
  let seed = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = (seed % 1000) / 1000;
    const phraseWave = 0.5 + 0.35 * Math.sin(i * 0.42);
    bars.push(Math.max(0.18, Math.min(0.96, 0.25 + n * 0.45 * phraseWave + 0.15 * phraseWave)));
  }
  return bars;
}

/**
 * Interactive waveform timeline for the currently focused clip.
 * Features draggable start/end trim handles and 0.1s precision nudge buttons.
 */
export function WaveformTimeline({
  video,
  clip,
  clipIndex,
  disabled,
  onUpdateTimes,
}: WaveformTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<number[]>(() => buildFallbackEnvelope(video.name, BAR_COUNT));
  const [isRealAudioWaveform, setIsRealAudioWaveform] = useState(false);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | null>(null);

  const totalDuration = Math.max(1, video.durationSeconds || clip.end_seconds);

  useEffect(() => {
    let cancelled = false;
    setPeaks(buildFallbackEnvelope(video.name, BAR_COUNT));
    setIsRealAudioWaveform(false);

    if (video.sizeBytes > MAX_PCM_DECODE_BYTES) {
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    void (async () => {
      try {
        const buffer = await video.file.arrayBuffer();
        if (cancelled) return;
        const decoded = await ctx.decodeAudioData(buffer.slice(0));
        if (cancelled) return;

        const channel = decoded.getChannelData(0);
        const step = Math.max(1, Math.floor(channel.length / BAR_COUNT));
        const sampled: number[] = [];
        let maxPeak = 0.01;

        for (let i = 0; i < BAR_COUNT; i++) {
          const start = i * step;
          const end = Math.min(channel.length, start + step);
          let peak = 0;
          const innerStep = Math.max(1, Math.floor((end - start) / 48));
          for (let j = start; j < end; j += innerStep) {
            const abs = Math.abs(channel[j]);
            if (abs > peak) peak = abs;
          }
          if (peak > maxPeak) maxPeak = peak;
          sampled.push(peak);
        }

        if (!cancelled) {
          setPeaks(sampled.map((v) => Math.max(0.14, Math.min(1, v / maxPeak))));
          setIsRealAudioWaveform(true);
        }
      } catch {
        // Silent fallback when container codec isn't natively decodable by Web Audio
      } finally {
        void ctx.close().catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      void ctx.close().catch(() => {});
    };
  }, [video.file, video.name, video.sizeBytes]);

  const startPct = Math.max(0, Math.min(99, (clip.start_seconds / totalDuration) * 100));
  const endPct = Math.max(startPct + 1, Math.min(100, (clip.end_seconds / totalDuration) * 100));
  const widthPct = Math.max(1, endPct - startPct);

  const roundTenth = (val: number) => Math.round(val * 10) / 10;

  const clientXToSeconds = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return clip.start_seconds;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return roundTenth(ratio * totalDuration);
  };

  const applyDraggedTime = (handle: 'start' | 'end', sec: number) => {
    if (disabled) return;
    if (handle === 'start') {
      const clamped = Math.max(0, Math.min(roundTenth(clip.end_seconds - 1), sec));
      if (clamped !== clip.start_seconds) {
        onUpdateTimes(clip.id, clamped, clip.end_seconds);
      }
    } else {
      const clamped = Math.min(
        roundTenth(totalDuration),
        Math.max(roundTenth(clip.start_seconds + 1), sec),
      );
      if (clamped !== clip.end_seconds) {
        onUpdateTimes(clip.id, clip.start_seconds, clamped);
      }
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragHandle || disabled) return;
    applyDraggedTime(dragHandle, clientXToSeconds(e.clientX));
  };

  const clipDuration = Math.max(1, clip.end_seconds - clip.start_seconds);

  const nudgeStart = (delta: number) => {
    if (disabled) return;
    const next = roundTenth(
      Math.max(0, Math.min(clip.end_seconds - 1, clip.start_seconds + delta)),
    );
    if (next !== clip.start_seconds) onUpdateTimes(clip.id, next, clip.end_seconds);
  };

  const nudgeEnd = (delta: number) => {
    if (disabled) return;
    const next = roundTenth(
      Math.min(totalDuration, Math.max(clip.start_seconds + 1, clip.end_seconds + delta)),
    );
    if (next !== clip.end_seconds) onUpdateTimes(clip.id, clip.start_seconds, next);
  };

  const activeBars = useMemo(() => peaks, [peaks]);

  return (
    <section
      aria-label="Focused clip waveform timeline"
      className="rounded-xl border border-[#DFDCD2] bg-white p-4 sm:p-5 dark:border-[#2A2A2E] dark:bg-[#151517]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
              Waveform trim · Clip {String(clipIndex + 1).padStart(2, '0')} — {clip.title}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-[#64625D] dark:text-[#8C8C93]">
              {formatTimecode(clip.start_seconds)} – {formatTimecode(clip.end_seconds)} ({clipDuration.toFixed(1)}s)
              {' · '}
              {isRealAudioWaveform ? 'Audio PCM waveform' : 'Cadence preview (1 GB memory-safe)'}
            </p>
          </div>
        </div>

        {/* Precision 0.1s nudge controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-[#64625D] dark:text-[#8C8C93]">
            0.1s trim:
          </span>
          <button
            type="button"
            disabled={disabled || clip.start_seconds <= 0}
            onClick={() => nudgeStart(-0.1)}
            aria-label="Move start back 0.1 seconds"
            className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md border border-[#DFDCD2] bg-[#EFECE4] px-2 font-mono text-[11px] font-medium text-[#151517] hover:border-[#64625D] disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            <ChevronLeft className="h-3 w-3" /> In
          </button>
          <button
            type="button"
            disabled={disabled || clip.start_seconds >= clip.end_seconds - 1}
            onClick={() => nudgeStart(0.1)}
            aria-label="Move start forward 0.1 seconds"
            className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md border border-[#DFDCD2] bg-[#EFECE4] px-2 font-mono text-[11px] font-medium text-[#151517] hover:border-[#64625D] disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            In <ChevronRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={disabled || clip.end_seconds <= clip.start_seconds + 1}
            onClick={() => nudgeEnd(-0.1)}
            aria-label="Move end back 0.1 seconds"
            className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md border border-[#DFDCD2] bg-[#EFECE4] px-2 font-mono text-[11px] font-medium text-[#151517] hover:border-[#64625D] disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            <ChevronLeft className="h-3 w-3" /> Out
          </button>
          <button
            type="button"
            disabled={disabled || clip.end_seconds >= totalDuration}
            onClick={() => nudgeEnd(0.1)}
            aria-label="Move end forward 0.1 seconds"
            className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md border border-[#DFDCD2] bg-[#EFECE4] px-2 font-mono text-[11px] font-medium text-[#151517] hover:border-[#64625D] disabled:opacity-40 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
          >
            Out <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Waveform Scrubber Track with Draggable Handles */}
      <div
        ref={trackRef}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setDragHandle(null)}
        onPointerCancel={() => setDragHandle(null)}
        className="relative flex h-16 touch-none select-none items-center gap-[2px] overflow-hidden rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-2 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]"
      >
        {/* Active selection highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 bg-[#E8A33D]/12"
          style={{ left: `${startPct}%`, width: `${widthPct}%` }}
        />

        {/* Waveform bars */}
        {activeBars.map((height, idx) => {
          const barPct = ((idx + 0.5) / activeBars.length) * 100;
          const inside = barPct >= startPct && barPct <= endPct;
          return (
            <span
              key={idx}
              aria-hidden="true"
              className={`relative z-0 flex-1 rounded-full transition-colors duration-100 motion-reduce:transition-none ${
                inside
                  ? 'bg-[#E8A33D]'
                  : 'bg-[#DFDCD2] dark:bg-[#2A2A2E]'
              }`}
              style={{ height: `${Math.round(height * 78)}%` }}
            />
          );
        })}

        {/* Start Trim Handle */}
        <button
          type="button"
          disabled={disabled}
          aria-label={`Drag clip start handle (${formatTimecode(clip.start_seconds)})`}
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDragHandle('start');
          }}
          style={{ left: `calc(${startPct}% - 7px)` }}
          className="absolute inset-y-1 z-10 flex w-3.5 cursor-ew-resize items-center justify-center rounded bg-[#E8A33D] ring-1 ring-white focus-visible:outline-none dark:ring-[#0E0E0F]"
        >
          <span className="h-5 w-0.5 rounded-full bg-[#0E0E0F]" />
        </button>

        {/* End Trim Handle */}
        <button
          type="button"
          disabled={disabled}
          aria-label={`Drag clip end handle (${formatTimecode(clip.end_seconds)})`}
          onPointerDown={(e) => {
            if (disabled) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            setDragHandle('end');
          }}
          style={{ left: `calc(${endPct}% - 7px)` }}
          className="absolute inset-y-1 z-10 flex w-3.5 cursor-ew-resize items-center justify-center rounded bg-[#E8A33D] ring-1 ring-white focus-visible:outline-none dark:ring-[#0E0E0F]"
        >
          <span className="h-5 w-0.5 rounded-full bg-[#0E0E0F]" />
        </button>
      </div>
    </section>
  );
}
