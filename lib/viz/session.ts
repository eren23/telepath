import type { StorySpec } from "@/lib/elicit/schemas";

type Entry = {
  story: StorySpec | null;
  version: number;
  updatedAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, Entry>();

export function getSession(id: string): Entry | null {
  const e = sessions.get(id);
  if (!e) return null;
  if (Date.now() - e.updatedAt > TTL_MS) {
    sessions.delete(id);
    return null;
  }
  return e;
}

export function setSessionStory(id: string, story: StorySpec): Entry {
  const prev = sessions.get(id);
  const next: Entry = {
    story,
    version: (prev?.version ?? 0) + 1,
    updatedAt: Date.now(),
  };
  sessions.set(id, next);
  return next;
}

export function ensureSession(id: string, initial?: StorySpec): Entry {
  const existing = getSession(id);
  if (existing) return existing;
  const fresh: Entry = {
    story: initial ?? null,
    version: 0,
    updatedAt: Date.now(),
  };
  sessions.set(id, fresh);
  return fresh;
}

export function dropSession(id: string): void {
  sessions.delete(id);
}

// Best-effort GC on every set — sessions are small but unbounded otherwise.
function gc() {
  const now = Date.now();
  for (const [id, e] of sessions) {
    if (now - e.updatedAt > TTL_MS) sessions.delete(id);
  }
}

// Run a cheap GC every minute. No-op on server platforms that don't keep the
// process alive long enough for the timer to matter; in those cases entries
// just die with the process.
if (typeof setInterval === "function") {
  setInterval(gc, 60_000).unref?.();
}
