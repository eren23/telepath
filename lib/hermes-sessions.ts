import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";
import type { MemoryChip } from "@/lib/hermes-memory";

const HERMES_HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
const STATE_DB = path.join(HERMES_HOME, "state.db");

type Row = {
  role: string;
  content: string;
  session_id: string;
  ts: number;
};

async function dbExists(): Promise<boolean> {
  try {
    await fs.access(STATE_DB, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function escapeFtsTerm(q: string): string {
  // FTS5 MATCH syntax: wrap each token in quotes; AND between them.
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\w\-]/g, "").trim())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return q.replace(/[^\w\s\-]/g, " ").trim();
  return tokens.map((t) => `"${t}"`).join(" OR ");
}

export async function searchSessions(
  query: string,
  opts: { limit?: number } = {},
): Promise<MemoryChip[]> {
  if (!query.trim()) return [];
  if (!(await dbExists())) return [];
  const limit = opts.limit ?? 8;

  let DatabaseSync: typeof import("node:sqlite").DatabaseSync | undefined;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return [];
  }
  if (!DatabaseSync) return [];

  let db: import("node:sqlite").DatabaseSync | null = null;
  try {
    db = new DatabaseSync(STATE_DB, { readOnly: true });
    const matchExpr = escapeFtsTerm(query);
    const stmt = db.prepare(`
      SELECT m.role AS role,
             substr(m.content, 1, 400) AS content,
             m.session_id AS session_id,
             m.timestamp AS ts
        FROM messages_fts f
        JOIN messages m ON m.id = f.rowid
       WHERE f.content MATCH ?
         AND m.role IN ('user', 'assistant')
         AND length(m.content) BETWEEN 40 AND 1500
       ORDER BY m.timestamp DESC
       LIMIT ?
    `);
    const rows = stmt.all(matchExpr, limit) as unknown as Row[];
    return rows.map((r, i) => {
      const cleaned = (r.content ?? "").replace(/\s+/g, " ").trim();
      const headline = cleaned.length > 64 ? cleaned.slice(0, 61) + "…" : cleaned;
      return {
        id: `hermes-sess-${r.session_id?.slice(-6) ?? i}-${i}`,
        label: `[${r.role}] ${headline}`,
        raw: cleaned,
        origin: "external" as const,
      } satisfies MemoryChip;
    });
  } catch (err) {
    console.warn("[hermes-sessions] query failed:", err);
    return [];
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

export async function sessionsAvailable(): Promise<boolean> {
  if (!(await dbExists())) return false;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(STATE_DB, { readOnly: true });
    const r = db.prepare("SELECT count(*) as n FROM messages_fts").all() as { n: number }[];
    db.close();
    return (r[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
