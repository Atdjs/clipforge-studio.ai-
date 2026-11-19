import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

export interface DriveAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * In-memory OAuth access token cache only (never stored in localStorage/sessionStorage).
 */
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;

function getFirebaseAuth(): Auth {
  if (firebaseAuthInstance) return firebaseAuthInstance;

  if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId) {
    throw new Error('Firebase configuration is missing. Please complete Firebase setup first.');
  }

  firebaseAppInstance =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: firebaseConfig.apiKey,
          authDomain: firebaseConfig.authDomain,
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
        });

  firebaseAuthInstance = getAuth(firebaseAppInstance);
  return firebaseAuthInstance;
}

function toDriveAuthUser(user: User | null): DriveAuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

export function getCachedDriveAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() >= cachedTokenExpiresAt) {
    cachedAccessToken = null;
    cachedTokenExpiresAt = 0;
    return null;
  }
  return cachedAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
}

export function subscribeDriveAuthState(cb: (user: DriveAuthUser | null) => void): () => void {
  try {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        clearDriveAccessToken();
      }
      cb(toDriveAuthUser(user));
    });
  } catch {
    cb(null);
    return () => {};
  }
}

export async function signInWithGoogleDrive(): Promise<{
  user: DriveAuthUser;
  accessToken: string;
}> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();

  for (const scope of GOOGLE_DRIVE_SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error(
      'Google Sign-In completed, but no Drive access token was returned. Please grant Google Drive access and try again.',
    );
  }

  // OAuth access tokens typically live 60 minutes; refresh in-memory after 50 minutes
  cachedAccessToken = accessToken;
  cachedTokenExpiresAt = Date.now() + 50 * 60 * 1000;

  const mapped = toDriveAuthUser(result.user);
  if (!mapped) {
    throw new Error('Could not read signed-in Google account profile.');
  }

  return { user: mapped, accessToken };
}

export async function signOutGoogleDrive(): Promise<void> {
  clearDriveAccessToken();
  try {
    const auth = getFirebaseAuth();
    await signOut(auth);
  } catch {
    // Ignore sign-out errors if Firebase was not active
  }
}
