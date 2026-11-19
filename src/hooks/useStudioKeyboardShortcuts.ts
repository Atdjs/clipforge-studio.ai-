import { useEffect } from 'react';

interface UseStudioKeyboardShortcutsOptions {
  /** Whether keyboard shortcuts should currently be active (disabled when a modal is open) */
  enabled: boolean;
  /** Currently focused clip ID, if any */
  focusedClipId: string | null;
  /** Toggle play/pause on the focused clip card preview */
  onTogglePlayFocused: (clipId: string) => void;
  /** Request deletion (opens confirmation modal) for the focused clip card */
  onRequestDeleteFocused: (clipId: string) => void;
  /** Trigger the bulk cut-and-edit queue for all pending clips */
  onBulkCut: () => void;
  /** Nudge focused clip start time by +/- 0.1s */
  onNudgeFocusedStart?: (clipId: string, deltaSeconds: number) => void;
  /** Toggle keyboard shortcuts modal (`?`) */
  onToggleShortcutsModal?: () => void;
}

/**
 * Determine whether the active DOM target is an editable field where
 * Space / Delete / Enter / Arrows should behave natively instead of triggering global shortcuts.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"]'));
}

/**
 * Global keyboard shortcuts hook for Clip Cutter:
 * - Space: Play / pause preview video in the focused clip card
 * - Delete: Request deletion confirmation for the focused clip
 * - Ctrl+Enter (or Cmd+Enter on macOS): Trigger the bulk cut & edit queue
 * - ArrowLeft / ArrowRight: Nudge focused clip start by ±0.1s
 * - ?: Toggle keyboard shortcuts help dialog
 */
export function useStudioKeyboardShortcuts({
  enabled,
  focusedClipId,
  onTogglePlayFocused,
  onRequestDeleteFocused,
  onBulkCut,
  onNudgeFocusedStart,
  onToggleShortcutsModal,
}: UseStudioKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleGlobalHelp = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === '?' && onToggleShortcutsModal) {
        event.preventDefault();
        onToggleShortcutsModal();
      }
    };
    window.addEventListener('keydown', handleGlobalHelp);
    return () => window.removeEventListener('keydown', handleGlobalHelp);
  }, [onToggleShortcutsModal]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      // 1. Ctrl+Enter (or Cmd+Enter on macOS) -> Trigger bulk cut process
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (event.target instanceof HTMLElement && event.target.tagName === 'TEXTAREA') {
          return;
        }
        event.preventDefault();
        onBulkCut();
        return;
      }

      // Skip single-key shortcuts when typing inside inputs, sliders, or selects
      if (isEditableTarget(event.target)) {
        return;
      }

      // 2. Space -> Play / pause preview in the focused clip card
      if (event.code === 'Space' || event.key === ' ') {
        if (!focusedClipId) return;

        if (
          event.target instanceof HTMLElement &&
          event.target.closest('button:not([data-play-toggle="true"]), a[href]')
        ) {
          return;
        }

        event.preventDefault();
        onTogglePlayFocused(focusedClipId);
        return;
      }

      // 3. ArrowLeft / ArrowRight -> 0.1s fine-nudge on focused clip start
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && focusedClipId && onNudgeFocusedStart) {
        event.preventDefault();
        onNudgeFocusedStart(focusedClipId, event.key === 'ArrowLeft' ? -0.1 : 0.1);
        return;
      }

      // 4. Delete -> Prompt confirmation to remove the focused clip
      if (event.key === 'Delete') {
        if (!focusedClipId) return;
        event.preventDefault();
        onRequestDeleteFocused(focusedClipId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    focusedClipId,
    onTogglePlayFocused,
    onRequestDeleteFocused,
    onBulkCut,
    onNudgeFocusedStart,
  ]);
}
