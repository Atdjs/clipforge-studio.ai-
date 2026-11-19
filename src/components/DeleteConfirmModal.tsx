import { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import type { ClipItem } from '../types/clip';
import { formatTimecode } from '../utils/format';

interface DeleteConfirmModalProps {
  clip: ClipItem | null;
  onCancel: () => void;
  onConfirm: (clipId: string) => void;
}

export function DeleteConfirmModal({
  clip,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    if (!clip) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onConfirm(clip.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clip, onCancel, onConfirm]);

  if (!clip) return null;

  const durationSec = Math.max(1, Math.round(clip.end_seconds - clip.start_seconds));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-clip-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-xl border border-[#DFDCD2] bg-white p-5 sm:rounded-xl sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="delete-clip-title"
                className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]"
              >
                Delete this clip?
              </h2>
              <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                This removes the clip and any cut MP4 from this session.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel delete"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-[#DFDCD2] bg-[#F7F5F0] px-4 py-3 dark:border-[#2A2A2E] dark:bg-[#0E0E0F]">
          <p className="truncate font-display text-sm font-semibold text-[#151517] dark:text-[#F2F0EA]">
            {clip.title || 'Untitled clip'}
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-[#64625D] dark:text-[#8C8C93]">
            {formatTimecode(clip.start_seconds)} – {formatTimecode(clip.end_seconds)}
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            <span>{durationSec}s</span>
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-[#DFDCD2] bg-[#EFECE4] px-4 py-2 text-sm font-medium text-[#151517] transition-colors hover:border-[#64625D] dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA] whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onConfirm(clip.id)}
            className="min-h-[44px] rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 whitespace-nowrap"
          >
            Delete clip
          </button>
        </div>
      </div>
    </div>
  );
}
