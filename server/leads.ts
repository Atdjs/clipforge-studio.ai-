import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WaitlistEntry {
  email: string;
  plan: 'pro';
  consentGiven: boolean;
  consentAt: string;
}

export interface FeedbackEntry {
  id: string;
  category: 'bug' | 'feature' | 'general';
  message: string;
  email?: string;
  submittedAt: string;
}

const DATA_DIR = path.join(os.tmpdir(), 'clip-cutter-data');
const WAITLIST_FILE = path.join(DATA_DIR, 'waitlist.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(filePath: string, items: T[]): void {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf8');
}

export function saveWaitlistEntry(entry: WaitlistEntry): { alreadyJoined: boolean } {
  const existing = readJsonArray<WaitlistEntry>(WAITLIST_FILE);
  if (existing.some((item) => item.email.toLowerCase() === entry.email.toLowerCase())) {
    return { alreadyJoined: true };
  }
  writeJsonArray(WAITLIST_FILE, [...existing, entry]);
  return { alreadyJoined: false };
}

export function saveFeedbackEntry(entry: FeedbackEntry): void {
  const existing = readJsonArray<FeedbackEntry>(FEEDBACK_FILE);
  writeJsonArray(FEEDBACK_FILE, [entry, ...existing].slice(0, 500));
}
