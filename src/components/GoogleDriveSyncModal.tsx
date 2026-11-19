import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Cloud,
  FolderOpen,
  LogOut,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import {
  getCachedDriveAccessToken,
  signInWithGoogleDrive,
  signOutGoogleDrive,
  type DriveAuthUser,
} from '../services/googleAuthService';
import {
  createDriveProjectFile,
  defaultDriveFileName,
  downloadDriveProjectFile,
  openDriveProjectPicker,
  updateDriveProjectFile,
  type DriveProjectSnapshot,
} from '../services/googleDriveSyncService';
import type { LinkedDriveFile } from '../types/clip';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser: DriveAuthUser | null;
  onAuthUserChange: (user: DriveAuthUser | null) => void;
  linkedDriveFile: LinkedDriveFile | null;
  onLinkedDriveFileChange: (file: LinkedDriveFile | null) => void;
  canSaveCurrentProject: boolean;
  defaultVideoName: string;
  clipCount: number;
  buildSnapshot: () => DriveProjectSnapshot | null;
  onRestoreSnapshot: (snapshot: DriveProjectSnapshot, file: LinkedDriveFile) => void;
  onToast: (message: string) => void;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  isOpen,
  onClose,
  authUser,
  onAuthUserChange,
  linkedDriveFile,
  onLinkedDriveFileChange,
  canSaveCurrentProject,
  defaultVideoName,
  clipCount,
  buildSnapshot,
  onRestoreSnapshot,
  onToast,
}) => {
  const [fileName, setFileName] = useState('');
  const [busyAction, setBusyAction] = useState<'auth' | 'pick' | 'save-new' | 'overwrite' | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setConfirmOverwrite(false);
    setFileName(linkedDriveFile?.name || defaultDriveFileName(defaultVideoName || 'project'));
  }, [isOpen, linkedDriveFile, defaultVideoName]);

  if (!isOpen) return null;

  const ensureDriveToken = async (): Promise<string> => {
    const existing = getCachedDriveAccessToken();
    if (existing && authUser) return existing;
    const { user, accessToken } = await signInWithGoogleDrive();
    onAuthUserChange(user);
    return accessToken;
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setBusyAction('auth');
    try {
      const { user } = await signInWithGoogleDrive();
      onAuthUserChange(user);
      onToast(`Signed in to Google Drive as ${user.email || user.displayName || 'Google user'}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSignOut = async () => {
    setErrorMsg(null);
    setConfirmOverwrite(false);
    await signOutGoogleDrive();
    onAuthUserChange(null);
    onToast('Signed out of Google Drive.');
  };

  const handlePickFromDrive = async () => {
    setErrorMsg(null);
    setConfirmOverwrite(false);
    setBusyAction('pick');
    try {
      const token = await ensureDriveToken();
      const picked = await openDriveProjectPicker(token);
      if (!picked) {
        setBusyAction(null);
        return;
      }

      const snapshot = await downloadDriveProjectFile(token, picked.id);
      onRestoreSnapshot(snapshot, picked);
      onLinkedDriveFileChange(picked);
      onToast(`Loaded "${picked.name}" (${snapshot.clips.length} clips) from Google Drive.`);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load project from Google Drive.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveAsNew = async () => {
    setErrorMsg(null);
    setConfirmOverwrite(false);
    const snapshot = buildSnapshot();
    if (!snapshot) {
      setErrorMsg('Open or load a video project before saving to Google Drive.');
      return;
    }

    setBusyAction('save-new');
    try {
      const token = await ensureDriveToken();
      const created = await createDriveProjectFile(token, fileName, snapshot);
      onLinkedDriveFileChange(created);
      onToast(`Saved "${created.name}" to Google Drive.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save project to Google Drive.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmedOverwrite = async () => {
    if (!linkedDriveFile) return;
    setErrorMsg(null);
    const snapshot = buildSnapshot();
    if (!snapshot) {
      setErrorMsg('Open or load a video project before syncing to Google Drive.');
      return;
    }

    setBusyAction('overwrite');
    try {
      const token = await ensureDriveToken();
      const updated = await updateDriveProjectFile(
        token,
        linkedDriveFile.id,
        fileName.trim() || linkedDriveFile.name,
        snapshot,
      );
      onLinkedDriveFileChange(updated);
      setConfirmOverwrite(false);
      onToast(`Updated "${updated.name}" in Google Drive.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not overwrite file in Google Drive.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-sync-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2A2A2E]">
          <div className="flex items-center gap-2.5">
            <Cloud className="h-4 w-4 text-[#E8A33D]" />
            <div>
              <h2 id="drive-sync-title" className="text-sm font-semibold">
                Google Drive Project Sync
              </h2>
              <p className="text-xs text-zinc-500 dark:text-[#8C8C93]">
                Save or restore clip timelines, settings, and transcripts via File Picker.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Drive Sync modal"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#8C8C93] dark:hover:bg-[#1C1C1F] dark:hover:text-[#F2F0EA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Account Connection Box */}
          <div className="rounded-md border border-zinc-200 bg-[#F7F5F0] p-3.5 dark:border-[#2A2A2E] dark:bg-[#1C1C1F]">
            {authUser ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-900 dark:text-[#F2F0EA]">
                    {authUser.displayName || 'Connected Google Account'}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500 dark:text-[#8C8C93]">
                    {authUser.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!getCachedDriveAccessToken() && (
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={busyAction !== null}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:border-zinc-400 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA]"
                    >
                      Refresh access
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={busyAction !== null}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93] dark:hover:text-[#F2F0EA]"
                  >
                    <LogOut className="h-3 w-3" />
                    Sign out
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-zinc-600 dark:text-[#8C8C93]">
                  Sign in with Google to open or save `.clipcutter.json` session files. OAuth tokens
                  stay strictly in memory.
                </p>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busyAction !== null}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#F2F0EA] dark:hover:bg-[#0E0E0F]"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  {busyAction === 'auth' ? 'Connecting...' : 'Sign in with Google'}
                </button>
              </div>
            )}
          </div>

          {/* Open via Google File Picker */}
          <div className="space-y-2 rounded-md border border-zinc-200 p-3.5 dark:border-[#2A2A2E]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-[#F2F0EA]">
                  Open from Google Drive
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-[#8C8C93]">
                  Pick a saved `.clipcutter.json` project to restore clips, scores, and transcripts.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePickFromDrive}
                disabled={busyAction !== null}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition-colors hover:border-zinc-400 disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#1C1C1F] dark:text-[#F2F0EA]"
              >
                <FolderOpen className="h-3.5 w-3.5 text-[#E8A33D]" />
                {busyAction === 'pick' ? 'Opening...' : 'Open Picker'}
              </button>
            </div>
          </div>

          {/* Save / Sync Current Session */}
          <div className="space-y-3 rounded-md border border-zinc-200 p-3.5 dark:border-[#2A2A2E]">
            <div>
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-[#F2F0EA]">
                Save current session to Google Drive
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-[#8C8C93]">
                Saves clip timestamps, settings, virality scores, and transcript JSON (~50 KB). Your
                source video file stays local on your device.
              </p>
            </div>

            {linkedDriveFile && (
              <div className="flex items-center justify-between rounded bg-[#E8A33D]/10 px-2.5 py-1.5 text-[11px] text-zinc-800 dark:text-[#F2F0EA]">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Check className="h-3 w-3 shrink-0 text-[#E8A33D]" />
                  Linked file: <strong className="truncate">{linkedDriveFile.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onLinkedDriveFileChange(null);
                    setConfirmOverwrite(false);
                  }}
                  className="ml-2 shrink-0 text-[10px] underline hover:text-[#E8A33D]"
                >
                  Unlink
                </button>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-[#8C8C93]">
                Project file name
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                disabled={!canSaveCurrentProject || busyAction !== null}
                placeholder="my-video.clipcutter.json"
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-xs text-zinc-900 focus:border-[#E8A33D] focus:outline-none disabled:opacity-50 dark:border-[#2A2A2E] dark:bg-[#0E0E0F] dark:text-[#F2F0EA]"
              />
            </div>

            {confirmOverwrite && linkedDriveFile ? (
              <div className="space-y-2.5 rounded-md border border-[#E8A33D]/50 bg-[#E8A33D]/10 p-3">
                <div className="flex items-start gap-2 text-xs text-zinc-900 dark:text-[#F2F0EA]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#E8A33D]" />
                  <div>
                    <p className="font-semibold">Confirm overwriting Google Drive file</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-[#8C8C93]">
                      This will replace the contents of <strong>{linkedDriveFile.name}</strong> in
                      your Google Drive with your current {clipCount} clip
                      {clipCount === 1 ? '' : 's'} and transcript.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOverwrite(false)}
                    disabled={busyAction !== null}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-[#2A2A2E] dark:bg-[#151517] dark:text-[#8C8C93]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmedOverwrite}
                    disabled={busyAction !== null}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#E8A33D] px-3 py-1 text-xs font-semibold text-[#0E0E0F] hover:brightness-105 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {busyAction === 'overwrite' ? 'Updating...' : 'Confirm overwrite'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {linkedDriveFile && (
                  <button
                    type="button"
                    onClick={() => setConfirmOverwrite(true)}
                    disabled={!canSaveCurrentProject || busyAction !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#E8A33D]/60 bg-[#E8A33D]/15 px-3 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-[#E8A33D]/25 disabled:opacity-50 dark:text-[#F2F0EA]"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-[#E8A33D]" />
                    Update linked file
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  disabled={!canSaveCurrentProject || busyAction !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#E8A33D] px-3.5 py-1.5 text-xs font-semibold text-[#0E0E0F] transition-colors hover:brightness-105 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {busyAction === 'save-new' ? 'Saving...' : 'Save as new file'}
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
