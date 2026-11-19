import type {
  ClipItem,
  ClipSettings,
  LinkedDriveFile,
  TranscriptSegment,
  VideoAsset,
} from '../types/clip';
import { clearDriveAccessToken } from './googleAuthService';

export interface DriveProjectSnapshot {
  version: 1;
  app: 'clip-cutter';
  savedAt: number;
  videoMeta: {
    name: string;
    sizeBytes: number;
    durationSeconds: number;
    width: number;
    height: number;
    fileHash?: string;
    directUrl?: string;
  };
  settings: ClipSettings;
  cachedTranscript: TranscriptSegment[];
  clips: Array<
    Omit<ClipItem, 'outputBlob' | 'outputUrl' | 'cutStatus' | 'cutProgress' | 'cutStageLabel'> & {
      cutStatus: 'idle';
      cutProgress: 0;
    }
  >;
}

interface GooglePickerGlobal {
  picker: {
    PickerBuilder: new () => {
      addView: (view: unknown) => GooglePickerBuilder;
      setOAuthToken: (token: string) => GooglePickerBuilder;
      setCallback: (cb: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
      setOrigin: (origin: string) => GooglePickerBuilder;
      setTitle: (title: string) => GooglePickerBuilder;
      build: () => { setVisible: (visible: boolean) => void };
    };
    DocsView: new (viewId: unknown) => {
      setMimeTypes: (mimeTypes: string) => GoogleDocsView;
      setQuery: (query: string) => GoogleDocsView;
      setIncludeFolders: (include: boolean) => GoogleDocsView;
    };
    ViewId: { DOCS: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}

type GoogleDocsView = InstanceType<GooglePickerGlobal['picker']['DocsView']>;
type GooglePickerBuilder = InstanceType<GooglePickerGlobal['picker']['PickerBuilder']>;

interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType?: string;
  }>;
}

interface GapiGlobal {
  load: (apiName: string, options: { callback: () => void; onerror?: () => void }) => void;
}

declare global {
  interface Window {
    gapi?: GapiGlobal;
    google?: GooglePickerGlobal;
  }
}

let gapiLoaderPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in the browser.'));
  }

  if (window.google?.picker?.PickerBuilder) {
    return Promise.resolve();
  }

  if (gapiLoaderPromise) return gapiLoaderPromise;

  gapiLoaderPromise = new Promise<void>((resolve, reject) => {
    const loadPickerModule = () => {
      if (!window.gapi) {
        reject(new Error('Google API loader initialized without gapi.'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => {
          if (window.google?.picker?.PickerBuilder) {
            resolve();
          } else {
            reject(new Error('Google Picker library failed to load.'));
          }
        },
        onerror: () => reject(new Error('Could not initialize Google Picker.')),
      });
    };

    if (window.gapi) {
      loadPickerModule();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]',
    );
    if (existingScript) {
      existingScript.addEventListener('load', loadPickerModule, { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Picker script.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = loadPickerModule;
    script.onerror = () => reject(new Error('Failed to load https://apis.google.com/js/api.js.'));
    document.head.appendChild(script);
  }).catch((err) => {
    gapiLoaderPromise = null;
    throw err;
  });

  return gapiLoaderPromise;
}

export function buildDriveProjectSnapshot(params: {
  video: VideoAsset;
  settings: ClipSettings;
  cachedTranscript: TranscriptSegment[];
  clips: ClipItem[];
  directUrl?: string;
}): DriveProjectSnapshot {
  return {
    version: 1,
    app: 'clip-cutter',
    savedAt: Date.now(),
    videoMeta: {
      name: params.video.name,
      sizeBytes: params.video.sizeBytes,
      durationSeconds: params.video.durationSeconds,
      width: params.video.width,
      height: params.video.height,
      fileHash: params.video.fileHash,
      directUrl: params.directUrl,
    },
    settings: params.settings,
    cachedTranscript: params.cachedTranscript,
    clips: params.clips.map((clip) => {
      const {
        outputBlob: _blob,
        outputUrl: _url,
        cutStatus: _status,
        cutProgress: _progress,
        cutStageLabel: _stage,
        ...rest
      } = clip;
      return {
        ...rest,
        cutStatus: 'idle',
        cutProgress: 0,
      };
    }),
  };
}

export function defaultDriveFileName(videoName: string): string {
  const base = videoName
    .replace(/\.(mp4|mov|mkv|webm)$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'clip-cutter-project'}.clipcutter.json`;
}

/**
 * Open the Google File Picker modal so the user can choose a saved .clipcutter.json file.
 * Strictly avoids developerKey per workspace integration specification.
 */
export async function openDriveProjectPicker(
  accessToken: string,
): Promise<LinkedDriveFile | null> {
  await loadGooglePickerApi();

  const pickerNs = window.google?.picker;
  if (!pickerNs) {
    throw new Error('Google Picker is not ready.');
  }

  const pickerOrigin =
    window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
      ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
      : window.location.origin;

  return new Promise<LinkedDriveFile | null>((resolve) => {
    const view = new pickerNs.DocsView(pickerNs.ViewId.DOCS)
      .setMimeTypes('application/json')
      .setIncludeFolders(true);

    const picker = new pickerNs.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setOrigin(pickerOrigin)
      .setTitle('Select a Clip Cutter project (.clipcutter.json)')
      .setCallback((data: GooglePickerResponse) => {
        if (data.action === pickerNs.Action.PICKED && Array.isArray(data.docs) && data.docs[0]) {
          const doc = data.docs[0];
          resolve({
            id: doc.id,
            name: doc.name,
          });
        } else if (data.action === pickerNs.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}

function buildMultipartBody(
  metadata: Record<string, unknown>,
  jsonPayload: string,
  boundary: string,
): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonPayload,
    `--${boundary}--`,
  ].join('\r\n');
}

async function handleDriveResponse(res: Response, fallbackMessage: string): Promise<Response> {
  if (res.status === 401) {
    clearDriveAccessToken();
    throw new Error('Your Google Drive session expired. Please sign in with Google again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const apiMsg = (body as { error?: { message?: string } })?.error?.message;
    throw new Error(apiMsg || `${fallbackMessage} (HTTP ${res.status})`);
  }
  return res;
}

export async function createDriveProjectFile(
  accessToken: string,
  fileName: string,
  snapshot: DriveProjectSnapshot,
): Promise<LinkedDriveFile> {
  const safeName = fileName.trim().endsWith('.json')
    ? fileName.trim()
    : `${fileName.trim() || 'project'}.clipcutter.json`;
  const boundary = `clipcutter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const body = buildMultipartBody(
    {
      name: safeName,
      mimeType: 'application/json',
      description: `Clip Cutter project snapshot (${snapshot.clips.length} clips)`,
    },
    JSON.stringify(snapshot, null, 2),
    boundary,
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  await handleDriveResponse(res, 'Could not create project file in Google Drive');
  const data = (await res.json()) as { id: string; name: string; modifiedTime?: string };
  return {
    id: data.id,
    name: data.name,
    modifiedTime: data.modifiedTime,
  };
}

export async function updateDriveProjectFile(
  accessToken: string,
  fileId: string,
  fileName: string,
  snapshot: DriveProjectSnapshot,
): Promise<LinkedDriveFile> {
  const boundary = `clipcutter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const body = buildMultipartBody(
    {
      name: fileName,
      mimeType: 'application/json',
      description: `Clip Cutter project snapshot (${snapshot.clips.length} clips)`,
    },
    JSON.stringify(snapshot, null, 2),
    boundary,
  );

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId,
    )}?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  await handleDriveResponse(res, 'Could not update project file in Google Drive');
  const data = (await res.json()) as { id: string; name: string; modifiedTime?: string };
  return {
    id: data.id,
    name: data.name,
    modifiedTime: data.modifiedTime,
  };
}

export async function downloadDriveProjectFile(
  accessToken: string,
  fileId: string,
): Promise<DriveProjectSnapshot> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  await handleDriveResponse(res, 'Could not read project file from Google Drive');
  const parsed = (await res.json().catch(() => null)) as DriveProjectSnapshot | null;

  if (
    !parsed ||
    parsed.app !== 'clip-cutter' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.clips) ||
    !parsed.settings
  ) {
    throw new Error(
      'The selected file is not a valid Clip Cutter (.clipcutter.json) project snapshot.',
    );
  }

  return parsed;
}
