import {
  MAX_CLOUD_TRANSCRIBE_SECONDS,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  type VideoAsset,
} from '../types/clip';
import { computeVideoFileHash } from '../utils/fileHash';

// Soft notice threshold for chunked streaming hint (files between 500 MB and 1024 MB)
const LARGE_STREAM_NOTICE_BYTES = 500 * 1024 * 1024;
const MAX_RECOMMENDED_SECONDS = 30 * 60; // 30 minutes

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov'];
const ACCEPTED_MIME_TYPES = ['video/mp4', 'video/quicktime'];

/**
 * Step 1: Validate that the dropped/selected file is an MP4 or MOV video within the 1 GB (1024 MB) limit,
 * then inspect its duration and dimensions locally in the browser without loading bytes into RAM.
 */
export async function inspectLocalVideo(file: File): Promise<VideoAsset> {
  const lowerName = file.name.toLowerCase();
  const hasValidExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasValidMime = ACCEPTED_MIME_TYPES.includes(file.type);

  if (!hasValidExt && !hasValidMime) {
    throw new Error('Unsupported file format. Please choose an .mp4 or .mov video file.');
  }

  // Enforce 1 GB (1024 MB) maximum upload size before inspecting or reading slices
  if (file.size > MAX_UPLOAD_BYTES) {
    const fileMb = (file.size / (1024 * 1024)).toFixed(0);
    throw new Error(
      `File is ${fileMb} MB, which exceeds the 1 GB (${MAX_UPLOAD_MB} MB) maximum upload size. Please choose a smaller video.`,
    );
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const [metadata, fileHash] = await Promise.all([
      new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const cleanup = () => {
          video.onloadedmetadata = null;
          video.onerror = null;
          video.removeAttribute('src');
          video.load();
        };

        video.onloadedmetadata = () => {
          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          const width = video.videoWidth || 0;
          const height = video.videoHeight || 0;
          cleanup();
          resolve({ duration, width, height });
        };

        video.onerror = () => {
          cleanup();
          reject(
            new Error(
              'Could not read video metadata. The file may be corrupted or an unsupported codec.',
            ),
          );
        };

        video.src = objectUrl;
      }),
      computeVideoFileHash(file).catch(() => undefined),
    ]);

    if (metadata.duration <= 0) {
      URL.revokeObjectURL(objectUrl);
      throw new Error('This video appears to have zero duration or an unreadable stream.');
    }

    return {
      file,
      objectUrl,
      name: file.name,
      sizeBytes: file.size,
      durationSeconds: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fileHash,
      isLargeFile: file.size > LARGE_STREAM_NOTICE_BYTES,
      isOverDurationLimit: metadata.duration > MAX_RECOMMENDED_SECONDS,
      isOverCloudTranscribeLimit: metadata.duration > MAX_CLOUD_TRANSCRIBE_SECONDS,
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}
