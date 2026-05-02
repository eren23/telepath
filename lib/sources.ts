import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ChipSource, MemoryChip } from "@/lib/hermes-memory";
import { chipsFromUserDoc, readUser } from "@/lib/hermes-memory";

const SOURCES_PATH = path.join(process.cwd(), "data", "sources.json");
const SEED_SPIDER = path.join(process.cwd(), "data", "spiderchat-memories.json");

export type SourceType =
  | "hermes"
  | "json"
  | "http"
  | "text"
  | "hermes-sessions"
  | "url"
  | "pdf";

export type SourceConfig = {
  id: string;
  type: SourceType;
  name: string;
  enabled: boolean;
  removable: boolean;
  /** json or text payload — inline */
  content?: string;
  /** http source */
  url?: string;
  authHeader?: string;
  /** hermes-sessions: stored FTS5 match query */
  query?: string;
  /** cached fetch metadata */
  lastFetched?: string;
  lastError?: string;
};

export type SourceWithChips = SourceConfig & {
  chips: MemoryChip[];
  count: number;
};

type SourcesFile = { sources: SourceConfig[] };

async function ensureSeed(): Promise<SourcesFile> {
  try {
    const raw = await fs.readFile(SOURCES_PATH, "utf8");
    return JSON.parse(raw) as SourcesFile;
  } catch {
    const seed = await buildSeed();
    await fs.mkdir(path.dirname(SOURCES_PATH), { recursive: true });
    await fs.writeFile(SOURCES_PATH, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
}

async function buildSeed(): Promise<SourcesFile> {
  let spiderContent = "";
  try {
    spiderContent = await fs.readFile(SEED_SPIDER, "utf8");
  } catch {
    // optional
  }
  const sources: SourceConfig[] = [
    {
      id: "hermes-fs",
      type: "hermes",
      name: "Hermes filesystem",
      enabled: true,
      removable: false,
    },
  ];
  if (spiderContent) {
    sources.push({
      id: "preloaded-personal",
      type: "json",
      name: "Personal context (preloaded)",
      enabled: true,
      removable: true,
      content: spiderContent,
    });
  }
  return { sources };
}

export async function loadSources(): Promise<SourceConfig[]> {
  const file = await ensureSeed();
  return file.sources;
}

export async function saveSources(sources: SourceConfig[]): Promise<void> {
  await fs.mkdir(path.dirname(SOURCES_PATH), { recursive: true });
  await fs.writeFile(SOURCES_PATH, JSON.stringify({ sources }, null, 2), "utf8");
}

export async function upsertSource(s: SourceConfig): Promise<void> {
  const all = await loadSources();
  const idx = all.findIndex((x) => x.id === s.id);
  if (idx === -1) all.push(s);
  else all[idx] = { ...all[idx], ...s };
  await saveSources(all);
}

export async function deleteSource(id: string): Promise<boolean> {
  const all = await loadSources();
  const target = all.find((x) => x.id === id);
  if (!target) return false;
  if (!target.removable) return false;
  await saveSources(all.filter((x) => x.id !== id));
  return true;
}

function newId(): string {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type CreateSourceInput = {
  type: SourceType;
  name: string;
  content?: string;
  url?: string;
  authHeader?: string;
  query?: string;
};

export async function createSource(input: CreateSourceInput): Promise<SourceConfig> {
  const cfg: SourceConfig = {
    id: newId(),
    type: input.type,
    name: input.name,
    enabled: true,
    removable: true,
    content: input.content,
    url: input.url,
    authHeader: input.authHeader,
    query: input.query,
  };
  await upsertSource(cfg);
  return cfg;
}

type ChipShape = {
  id?: string;
  label?: string;
  raw?: string;
  text?: string;
};

function makeChip(raw: ChipShape, fallbackId: string, origin: ChipSource): MemoryChip | null {
  const text = (raw.raw ?? raw.text ?? raw.label ?? "").toString().trim();
  if (!text) return null;
  const label = (raw.label ?? text).toString();
  return {
    id: raw.id?.toString() ?? fallbackId,
    label: label.length > 64 ? label.slice(0, 61) + "…" : label,
    raw: text,
    origin,
  };
}

function chipsFromJsonContent(content: string, prefix: string): MemoryChip[] {
  if (!content.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const arr = (() => {
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.chips)) return obj.chips as ChipShape[];
    if (Array.isArray(obj.facts)) return obj.facts as ChipShape[];
    if (Array.isArray(obj)) return obj as unknown as ChipShape[];
    return [];
  })();
  return arr
    .map((c, i) => makeChip(c, `${prefix}-${i}`, "external"))
    .filter((c): c is MemoryChip => Boolean(c));
}

function chipsFromText(text: string, prefix: string): MemoryChip[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#") && !s.startsWith("---"));
  return sentences.slice(0, 12).map((s, i) => ({
    id: `${prefix}-${i}`,
    label: s.length > 64 ? s.slice(0, 61) + "…" : s,
    raw: s,
    origin: "external" as const,
  }));
}

async function fetchHttpChips(s: SourceConfig): Promise<MemoryChip[]> {
  if (!s.url) return [];
  const headers: Record<string, string> = { accept: "application/json" };
  if (s.authHeader) headers["authorization"] = s.authHeader;
  const r = await fetch(s.url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${s.url}`);
  const text = await r.text();
  return chipsFromJsonContent(text, s.id);
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#x27": "'",
  "#x2F": "/",
};

function stripHtml(html: string): string {
  let out = html;
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, " ");
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  out = out.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  out = out.replace(/<[^>]+>/g, " ");
  out = out.replace(/&(#?[a-zA-Z0-9]+);/g, (_, ent: string) => HTML_ENTITIES[ent] ?? " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

const MAX_REMOTE_BYTES = 8 * 1024 * 1024;

async function fetchUrlChips(s: SourceConfig): Promise<MemoryChip[]> {
  if (!s.url) return [];
  const headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
    "user-agent": "TelepathBot/0.1 (+https://github.com/eren23/visualizer_hermes)",
  };
  if (s.authHeader) headers["authorization"] = s.authHeader;
  const r = await fetch(s.url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${s.url}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_REMOTE_BYTES) {
    throw new Error(`response too large (${buf.byteLength} bytes)`);
  }
  const ctype = (r.headers.get("content-type") ?? "").toLowerCase();
  const text =
    ctype.includes("text/plain")
      ? new TextDecoder("utf-8", { fatal: false }).decode(buf)
      : stripHtml(new TextDecoder("utf-8", { fatal: false }).decode(buf));
  return chipsFromText(text, s.id);
}

async function fetchPdfChips(s: SourceConfig): Promise<MemoryChip[]> {
  if (!s.url) return [];
  const headers: Record<string, string> = {
    accept: "application/pdf,*/*;q=0.5",
    "user-agent": "TelepathBot/0.1 (+https://github.com/eren23/visualizer_hermes)",
  };
  if (s.authHeader) headers["authorization"] = s.authHeader;
  const r = await fetch(s.url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${s.url}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_REMOTE_BYTES) {
    throw new Error(`pdf too large (${buf.byteLength} bytes)`);
  }
  type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>;
  const mod = (await import("pdf-parse")) as unknown as
    | PdfParseFn
    | { default: PdfParseFn };
  const pdfParse: PdfParseFn = typeof mod === "function" ? mod : mod.default;
  const parsed = await pdfParse(Buffer.from(buf));
  const text = (parsed.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("pdf produced no text");
  return chipsFromText(text, s.id);
}

export async function expandSource(
  s: SourceConfig,
  opts: { cold?: boolean } = {},
): Promise<MemoryChip[]> {
  if (opts.cold) return [];
  if (!s.enabled) return [];
  switch (s.type) {
    case "hermes": {
      const userDoc = await readUser();
      return chipsFromUserDoc(userDoc);
    }
    case "json":
      return chipsFromJsonContent(s.content ?? "", s.id);
    case "text":
      return chipsFromText(s.content ?? "", s.id);
    case "http":
      try {
        const chips = await fetchHttpChips(s);
        s.lastFetched = new Date().toISOString();
        s.lastError = undefined;
        await upsertSource(s);
        return chips;
      } catch (e) {
        s.lastError = e instanceof Error ? e.message : String(e);
        await upsertSource(s);
        return [];
      }
    case "url":
      try {
        const chips = await fetchUrlChips(s);
        s.lastFetched = new Date().toISOString();
        s.lastError = chips.length === 0 ? "page produced no extractable text" : undefined;
        await upsertSource(s);
        return chips;
      } catch (e) {
        s.lastError = e instanceof Error ? e.message : String(e);
        await upsertSource(s);
        return [];
      }
    case "pdf":
      try {
        const chips = await fetchPdfChips(s);
        s.lastFetched = new Date().toISOString();
        s.lastError = chips.length === 0 ? "pdf produced no extractable text" : undefined;
        await upsertSource(s);
        return chips;
      } catch (e) {
        s.lastError = e instanceof Error ? e.message : String(e);
        await upsertSource(s);
        return [];
      }
    case "hermes-sessions": {
      try {
        const { searchSessions } = await import("./hermes-sessions");
        const chips = await searchSessions(s.query ?? "", { limit: 8 });
        s.lastFetched = new Date().toISOString();
        s.lastError = chips.length === 0 ? "no matches" : undefined;
        await upsertSource(s);
        return chips;
      } catch (e) {
        s.lastError = e instanceof Error ? e.message : String(e);
        await upsertSource(s);
        return [];
      }
    }
  }
}

export async function expandAll(opts: { cold?: boolean } = {}): Promise<{
  sources: SourceWithChips[];
  flatChips: MemoryChip[];
  counts: { hermes: number; external: number };
}> {
  const sources = await loadSources();
  const expanded: SourceWithChips[] = [];
  const flat: MemoryChip[] = [];
  let hermesCount = 0;
  let externalCount = 0;
  for (const s of sources) {
    const chips = await expandSource(s, opts);
    expanded.push({ ...s, chips, count: chips.length });
    if (s.enabled) {
      for (const c of chips) {
        flat.push(c);
        if (c.origin === "hermes") hermesCount++;
        else externalCount++;
      }
    }
  }
  return { sources: expanded, flatChips: flat, counts: { hermes: hermesCount, external: externalCount } };
}
