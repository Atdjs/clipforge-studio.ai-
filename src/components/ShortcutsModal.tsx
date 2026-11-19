import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_ITEMS: Array<{ keys: string[]; action: string; note: string }> = [
  {
    keys: ['Space'],
    action: 'Play or pause preview',
    note: 'Controls the currently focused clip card player',
  },
  {
    keys: ['←', '→'],
    action: 'Nudge clip start (±0.1s)',
    note: 'Fine-tunes the start handle of the focused clip',
  },
  {
    keys: ['Ctrl', 'Enter'],
    action: 'Cut & auto-edit all clips',
    note: 'Also works with Cmd + Enter on macOS',
  },
  {
    keys: ['Delete'],
    action: 'Delete focused clip',
    note: 'Opens confirmation dialog before removing',
  },
  {
    keys: ['?'],
    action: 'Toggle keyboard shortcuts',
    note: 'Available outside of text inputs',
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-xl border border-[#DFDCD2] bg-white p-5 sm:rounded-xl sm:p-6 dark:border-[#2A2A2E] dark:bg-[#151517]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#E8A33D]/40 bg-[#E8A33D]/10 text-[#E8A33D]">
              <Keyboard className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="shortcuts-modal-title"
                className="font-display text-lg font-semibold text-[#151517] dark:text-[#F2F0EA]"
              >
                Keyboard shortcuts
              </h2>
              <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">
                Click any clip card to focus it, then navigate without leaving the keyboard.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#64625D] transition-colors hover:bg-[#EFECE4] hover:text-[#151517] dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-5 divide-y divide-[#DFDCD2] dark:divide-[#2A2A2E]">
          {SHORTCUT_ITEMS.map((item) => (
            <li
              key={item.action}
              className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#151517] dark:text-[#F2F0EA]">
                  {item.action}
                </p>
                <p className="text-xs text-[#64625D] dark:text-[#8C8C93]">{item.note}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {item.keys.map((keyLabel) => (
                  <kbd
                    key={keyLabel}
                    className="inline-flex min-h-[28px] min-w-[28px] items-center justify-center rounded border border-[#DFDCD2] bg-[#F7F5F0] px-2 font-mono text-xs font-medium text-[#151517] dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
                  >
                    {keyLabel}
                  </kbd>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
