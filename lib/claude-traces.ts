import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude", "projects");

export type ProjectSummary = {
  id: string;
  decoded: string;
  sessionCount: number;
  totalMessages: number;
  lastModified: string;
  bytes: number;
};

export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: { name: string; isDirectory: boolean }[] = [];
  try {
    const dirs = await fs.readdir(CLAUDE_PROJECTS, { withFileTypes: true });
    entries = dirs.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }));
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory) continue;
    const dir = path.join(CLAUDE_PROJECTS, ent.name);
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    if (files.length === 0) continue;
    let bytes = 0;
    let lastMs = 0;
    let totalLines = 0;
    let cwd: string | null = null;
    let newestFile: string | null = null;
    let newestFileMtime = 0;
    for (const f of files) {
      try {
        const stat = await fs.stat(path.join(dir, f));
        bytes += stat.size;
        if (stat.mtimeMs > lastMs) lastMs = stat.mtimeMs;
        if (stat.mtimeMs > newestFileMtime) {
          newestFileMtime = stat.mtimeMs;
          newestFile = f;
        }
        const content = await fs.readFile(path.join(dir, f), "utf8");
        totalLines += content.split(/\n/).filter((l) => l.trim().length > 0).length;
      } catch {
        // skip
      }
    }
    if (newestFile) {
      cwd = await sniffCwd(path.join(dir, newestFile));
    }
    out.push({
      id: ent.name,
      decoded: cwd ?? decodeProject(ent.name),
      sessionCount: files.length,
      totalMessages: totalLines,
      lastModified: new Date(lastMs).toISOString(),
      bytes,
    });
  }
  return out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

function decodeProject(slug: string): string {
  if (!slug.startsWith("-")) return slug;
  return slug.replace(/^-/, "/").replace(/-/g, "/");
}

async function sniffCwd(file: string, maxLines = 30): Promise<string | null> {
  try {
    const fh = await fs.open(file, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const text = buf.subarray(0, bytesRead).toString("utf8");
      const lines = text.split("\n", maxLines + 1);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { cwd?: unknown };
          if (typeof obj.cwd === "string" && obj.cwd.length > 0) {
            return obj.cwd;
          }
        } catch {
          // Try next line; first lines may be truncated by buffer boundary
          continue;
        }
      }
    } finally {
      await fh.close();
    }
  } catch {
    // ignore
  }
  return null;
}

type RawMessage = {
  type?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  timestamp?: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  ts?: string;
};

export async function readProjectTurns(
  projectId: string,
  opts: { maxChars?: number } = {},
): Promise<ChatTurn[]> {
  const dir = path.join(CLAUDE_PROJECTS, projectId);
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir))
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
  const turns: ChatTurn[] = [];
  let totalChars = 0;
  const maxChars = opts.maxChars ?? 60000;
  for (const f of files) {
    let content: string;
    try {
      content = await fs.readFile(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\n/)) {
      if (!line.trim()) continue;
      let raw: RawMessage;
      try {
        raw = JSON.parse(line) as RawMessage;
      } catch {
        continue;
      }
      if (raw.type !== "user" && raw.type !== "assistant") continue;
      const text = extractText(raw.message?.content);
      if (!text) continue;
      const trimmed = text.length > 1200 ? text.slice(0, 1200) + "…" : text;
      turns.push({ role: raw.type, text: trimmed, ts: raw.timestamp });
      totalChars += trimmed.length;
      if (totalChars >= maxChars) return turns;
    }
  }
  return turns;
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content.startsWith("<command-")
      ? ""
      : content.startsWith("<system-reminder")
        ? ""
        : content.trim();
  }
  if (!Array.isArray(content)) return "";
  const pieces: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (
        !t.startsWith("<system-reminder") &&
        !t.startsWith("<command-") &&
        !t.match(/^Caveat: The messages below/)
      ) {
        pieces.push(t);
      }
    }
  }
  return pieces.join("\n").trim();
}

export function buildTranscript(turns: ChatTurn[]): string {
  return turns
    .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.text}`)
    .join("\n\n");
}
