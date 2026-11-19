import type { ActiveLinkTarget } from '../components/UploadZone';
import type {
  AutoEditSettings,
  BrandSettings,
  CachedTranscriptRecord,
  CaptionLanguage,
  ClipItem,
  ClipSettings,
  ClipSourceMode,
  InputMode,
  LinkedDriveFile,
  RecentProjectSummary,
  TranscriptSegment,
  ViralitySubScores,
} from '../types/clip';

const DB_NAME = 'clip-cutter-session-db';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
const TRANSCRIPT_STORE = 'transcripts';
const SESSION_KEY = 'active-session';
const BRAND_KEY = 'brand-template';
const RECENT_PROJECTS_KEY = 'clip-cutter-recent-projects';

export interface StoredClipRecord {
  id: string;
  start_seconds: number;
  end_seconds: number;
  title: string;
  hook_reason: string;
  caption_text: string;
  speaker_x_ratio?: number;
  virality_score?: number;
  virality_reason?: string;
  sub_scores?: ViralitySubScores;
  hook_line?: string;
  hook_start_seconds?: number;
  hook_end_seconds?: number;
  addHookTitleCard?: boolean;
  hookMovedToStart?: boolean;
  description?: string;
  hashtags?: string[];
  suggestedTitles?: string[];
  transcript?: TranscriptSegment[];
  captionLanguage?: CaptionLanguage;
  removeSilencesAndFillers?: boolean;
  removedSeconds?: number;
  autoEditApplied?: AutoEditSettings;
  cutStatus: ClipItem['cutStatus'];
  cutProgress: number;
  cutError?: string;
  outputBlob?: Blob;
}

export interface PersistedSession {
  updatedAt: number;
  inputMode: InputMode;
  clipSourceMode: ClipSourceMode;
  settings: ClipSettings;
  autoSaveWhenReady: boolean;
  sourceFile?: File | null;
  fileHash?: string;
  cachedTranscript?: TranscriptSegment[];
  activeLink?: ActiveLinkTarget | null;
  linkedDriveFile?: LinkedDriveFile | null;
  clips: StoredClipRecord[];
}

function openSessionDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(TRANSCRIPT_STORE)) {
        db.createObjectStore(TRANSCRIPT_STORE, { keyPath: 'fileHash' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

export async function saveTranscriptToIndexedDb(record: CachedTranscriptRecord): Promise<void> {
  if (!record.fileHash || record.segments.length === 0) return;
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TRANSCRIPT_STORE, 'readwrite');
      tx.objectStore(TRANSCRIPT_STORE).put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore IndexedDB quota issues
  }
}

export async function loadTranscriptFromIndexedDb(
  fileHash: string,
): Promise<CachedTranscriptRecord | null> {
  if (!fileHash) return null;
  try {
    const db = await openSessionDb();
    return await new Promise<CachedTranscriptRecord | null>((resolve, reject) => {
      const tx = db.transaction(TRANSCRIPT_STORE, 'readonly');
      const req = tx.objectStore(TRANSCRIPT_STORE).get(fileHash);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as CachedTranscriptRecord | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Persist active clip list, settings, cached transcript, Drive link, source File, and cut MP4 Blobs.
 */
export async function saveSessionToIndexedDb(session: PersistedSession): Promise<void> {
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(session, SESSION_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore storage quota or private-browsing IndexedDB restrictions silently
  }
}

/**
 * Load any previously saved session from IndexedDB on startup.
 */
export async function loadSessionFromIndexedDb(): Promise<PersistedSession | null> {
  try {
    const db = await openSessionDb();
    return await new Promise<PersistedSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SESSION_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as PersistedSession | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Clear saved active session data from IndexedDB when user starts fresh.
 */
export async function clearSessionFromIndexedDb(): Promise<void> {
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(SESSION_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

/**
 * Erase all locally stored Clip Cutter data (sessions, cached transcripts, MP4 blobs, and brand template).
 */
export async function clearAllFromIndexedDb(): Promise<void> {
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_NAME, TRANSCRIPT_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(TRANSCRIPT_STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

/**
 * Save Brand template settings (including PNG logo Blob) to IndexedDB independently of active video.
 */
export async function saveBrandSettingsToIndexedDb(brand: BrandSettings): Promise<void> {
  try {
    const db = await openSessionDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(brand, BRAND_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Ignore quota / private mode restrictions
  }
}

/**
 * Load persisted Brand template settings from IndexedDB.
 */
export async function loadBrandSettingsFromIndexedDb(): Promise<BrandSettings | null> {
  try {
    const db = await openSessionDb();
    return await new Promise<BrandSettings | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(BRAND_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as BrandSettings | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export function loadRecentProjects(): RecentProjectSummary[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentProjectSummary[]) : [];
  } catch {
    return [];
  }
}

export function saveRecentProjectSummary(summary: RecentProjectSummary): RecentProjectSummary[] {
  try {
    const existing = loadRecentProjects().filter((item) => item.id !== summary.id);
    const next = [summary, ...existing].slice(0, 6);
    window.localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function clearRecentProjects(): void {
  try {
    window.localStorage.removeItem(RECENT_PROJECTS_KEY);
  } catch {
    // Ignore storage errors
  }
}
