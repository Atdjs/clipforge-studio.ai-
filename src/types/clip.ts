/**
 * Shared TypeScript types and upload limits for Clip Cutter.
 * Video processing runs locally in the browser; session & brand preferences persist in IndexedDB.
 */

/** Maximum allowed upload file size: 1 GB (1024 MB) */
export const MAX_UPLOAD_MB = 1024;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export type LengthRange = '15-30' | '30-60' | '60-90';
export type AspectFormat = 'original' | 'vertical';
export type InputMode = 'file' | 'link';
export type ClipSourceMode = 'file' | 'youtube';
export type CaptionLanguage = 'English' | 'Hindi' | 'Marathi' | 'Hinglish' | 'Spanish';
export type BrandPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type ThemeMode = 'dark' | 'light';

export type CaptionStylePresetId =
  | 'classic-amber'
  | 'bold-yellow'
  | 'minimal-clean'
  | 'neon-coral'
  | 'kinetic-pop';

export interface ViralitySubScores {
  hook: number;
  emotion: number;
  flow: number;
  shareability: number;
}

export interface ServerUsageStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface FillerWordSpan {
  word: string;
  start_seconds: number;
  end_seconds: number;
}

export interface TranscriptSegment {
  start_seconds: number;
  end_seconds: number;
  text: string;
  filler_words?: FillerWordSpan[];
}

export interface AutoEditSettings {
  /** Remove silences & dead pauses (>0.45s) and filler words */
  removeSilences: boolean;
  /** Auto-generate and burn captions into the edited video */
  burnCaptions: boolean;
  /** Crop/reframe to vertical 9:16 keeping the speaker in frame */
  reframeVertical: boolean;
  /** Add short video & audio fade in/out */
  fadeInOut: boolean;
  /** Normalize audio loudness (EBU R128 -16 LUFS) */
  normalizeAudio: boolean;
  /** Visual preset used when burning captions onto video */
  captionStyle?: CaptionStylePresetId;
}

export interface BrandSettings {
  /** PNG logo uploaded by the user (persisted as Blob in IndexedDB) */
  logoBlob: Blob | null;
  logoName: string;
  /** Video corner where the logo will be overlaid */
  position: BrandPosition;
  /** Watermark opacity percentage (10 to 100) */
  opacity: number;
  /** Watermark width as percentage of output video width (8 to 35) */
  sizePercent: number;
  /** When true, every cut clip includes this PNG overlay */
  applyToAllClips: boolean;
}

export interface VideoAsset {
  file: File;
  objectUrl: string;
  name: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  /** True when file size is large (> 500 MB up to 1 GB) and uses chunked streaming */
  isLargeFile: boolean;
  /** Soft warning if duration exceeds 30 minutes (1800s) */
  isOverDurationLimit: boolean;
}

export interface ClipSettings {
  /** Number of clips to request (3 to 10, default 5) */
  clipCount: number;
  /** Preferred clip duration window */
  lengthRange: LengthRange;
  /** Output framing: Original or Vertical 9:16 (1080x1920 speaker-reframed crop) */
  aspectFormat: AspectFormat;
  /** Optional user instruction guiding Gemini clip selection */
  customPrompt: string;
  /** Language used by Gemini for transcript & caption translation + .SRT export */
  captionLanguage: CaptionLanguage;
  /** Automatic post-cut editing toggles (all enabled by default) */
  autoEdit: AutoEditSettings;
}

export type ClipCutStatus = 'idle' | 'queued' | 'cutting' | 'done' | 'error';

export interface ClipItem {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string;
  hook_reason: string;
  caption_text: string;
  /** Horizontal speaker focus ratio (0 = left, 0.5 = center, 1 = right) for 9:16 reframing */
  speaker_x_ratio?: number;
  /** Stage 1 AI Clip Intelligence: overall virality score 0..100 */
  virality_score?: number;
  /** Short Gemini explanation of why this clip scores as it does */
  virality_reason?: string;
  /** Breakdown across Hook, Emotion, Flow, Shareability (0..100) */
  sub_scores?: ViralitySubScores;
  /** Strongest spoken opening hook phrase inside this clip */
  hook_line?: string;
  hook_start_seconds?: number;
  hook_end_seconds?: number;
  /** Whether the user chose to burn a 2-second hook title card at the start of the clip */
  addHookTitleCard?: boolean;
  /** Visual marker showing hook start was prioritized to clip start */
  hookMovedToStart?: boolean;
  /** Social post description & hashtags generated for this clip */
  description?: string;
  hashtags?: string[];
  suggestedTitles?: string[];
  /** Timestamped phrase-level transcript with optional filler word spans */
  transcript?: TranscriptSegment[];
  /** Language of transcript & caption_text */
  captionLanguage?: CaptionLanguage;
  /** Optional per-clip override for silence/filler removal */
  removeSilencesAndFillers?: boolean;
  /** Total seconds trimmed by silence/filler removal on the last cut */
  removedSeconds?: number;
  /** Snapshot of auto-edit toggles baked into the current outputBlob */
  autoEditApplied?: AutoEditSettings;
  /** Local browser cutting & auto-edit status via ffmpeg.wasm */
  cutStatus: ClipCutStatus;
  /** Cutting + auto-edit progress 0..100 */
  cutProgress: number;
  /** Current sub-step label during worker execution */
  cutStageLabel?: string;
  /** Rendered MP4 Blob in browser memory */
  outputBlob?: Blob;
  /** Object URL for direct download or edited preview playback */
  outputUrl?: string;
  /** Error message if ffmpeg cutting/editing failed for this clip */
  cutError?: string;
}

export type AnalysisPhase =
  | 'idle'
  | 'fetching-url'
  | 'uploading'
  | 'processing'
  | 'analyzing'
  | 'ready'
  | 'error';

export interface AppError {
  stage: 'fetch' | 'upload' | 'processing' | 'analyze' | 'ffmpeg';
  code: string;
  message: string;
  retryable: boolean;
}

export interface GeminiFileSession {
  name: string;
  uri: string;
  mimeType: string;
}

export interface RecentProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  clipCount: number;
  cutCount: number;
  avgViralityScore?: number;
  sourceMode: ClipSourceMode;
}
