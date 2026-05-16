import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import matter from "gray-matter";

const HERMES_HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
const MEMORIES_DIR = path.join(HERMES_HOME, "memories");
const SKILLS_DIR = path.join(HERMES_HOME, "skills");
const TELEPATH_SKILLS = path.join(SKILLS_DIR, "telepath");
const SPIDERCHAT_FIXTURE = path.join(process.cwd(), "data", "spiderchat-memories.json");

export type ChipSource = "hermes" | "external";

export type MemoryChip = {
  id: string;
  label: string;
  raw: string;
  origin: ChipSource;
};

export type SkillRecord = {
  slug: string;
  name: string;
  description: string;
  outputKind: "chart" | "diagram" | "slide" | "math" | "story";
  spec: unknown;
  dimensions?: unknown;
  createdAt?: string;
  whenToUse?: string[];
  tags?: string[];
};

const COLD_FIXTURE = {
  user: "",
  memory: "",
  chips: [] as MemoryChip[],
};

const FALLBACK_FIXTURE = {
  user: `User is a software engineer building a hackathon submission. They prefer dark UIs, colorblind-safe Tableau-10 palettes, and weekly granularity for any time series. Audience for most outputs is "self".`,
  memory: `User commits to GitHub repos via the gh CLI. Time-tracked work lives in Toggl. Auth flows in their main project use JWT with refresh-rotation.`,
};

export function isCold(): boolean {
  return process.env.TELEPATH_COLD === "1";
}

async function readSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function readUser(): Promise<string> {
  if (isCold()) return COLD_FIXTURE.user;
  const real = await readSafe(path.join(MEMORIES_DIR, "USER.md"));
  if (real !== null && real.trim().length > 0) return real;
  return FALLBACK_FIXTURE.user;
}

export async function readMemory(): Promise<string> {
  if (isCold()) return COLD_FIXTURE.memory;
  const real = await readSafe(path.join(MEMORIES_DIR, "MEMORY.md"));
  if (real !== null && real.trim().length > 0) return real;
  return FALLBACK_FIXTURE.memory;
}

export function chipsFromUserDoc(doc: string): MemoryChip[] {
  if (!doc.trim()) return [];
  const sentences = doc
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#") && !s.startsWith("---"));
  return sentences.slice(0, 12).map((s, i) => ({
    id: `hermes-${i}`,
    label: shortLabel(s),
    raw: s,
    origin: "hermes" as const,
  }));
}


type SpiderchatFile = {
  source: string;
  user?: { summary?: string };
  chips: { id: string; label: string; raw: string }[];
};

export async function readSpiderchatChips(): Promise<{ chips: MemoryChip[]; summary: string }> {
  if (isCold()) return { chips: [], summary: "" };
  try {
    const raw = await fs.readFile(SPIDERCHAT_FIXTURE, "utf8");
    const json = JSON.parse(raw) as SpiderchatFile;
    return {
      chips: json.chips.map((c) => ({
        id: c.id,
        label: c.label,
        raw: c.raw,
        origin: "external" as const,
      })),
      summary: json.user?.summary ?? "",
    };
  } catch {
    return { chips: [], summary: "" };
  }
}

function shortLabel(s: string): string {
  const trimmed = s.replace(/^User\s+/i, "").trim();
  return trimmed.length > 64 ? trimmed.slice(0, 61) + "…" : trimmed;
}

export async function listSkills(): Promise<SkillRecord[]> {
  if (isCold()) return [];
  try {
    const entries = await fs.readdir(TELEPATH_SKILLS, { withFileTypes: true });
    const records: SkillRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Hermes-canonical filename is SKILL.md; fall back to DESCRIPTION.md for older saves.
      const skillPath = path.join(TELEPATH_SKILLS, entry.name, "SKILL.md");
      const descPath = path.join(TELEPATH_SKILLS, entry.name, "DESCRIPTION.md");
      const raw = (await readSafe(skillPath)) ?? (await readSafe(descPath));
      if (!raw) continue;
      const parsed = matter(raw);
      const data = parsed.data as Partial<SkillRecord> & {
        metadata?: { telepath?: { spec?: unknown; dimensions?: unknown; outputKind?: SkillRecord["outputKind"] } };
      };
      const tel = data.metadata?.telepath ?? {};
      const outputKind = (data.outputKind ?? tel.outputKind) as SkillRecord["outputKind"] | undefined;
      const spec = data.spec ?? tel.spec;
      if (!outputKind || !spec) continue;
      records.push({
        slug: entry.name,
        name: data.name ?? entry.name,
        description: data.description ?? parsed.content.trim().slice(0, 160),
        outputKind,
        spec,
        dimensions: data.dimensions ?? tel.dimensions,
        createdAt: data.createdAt,
      });
    }
    return records.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } catch {
    return [];
  }
}

export async function writeSkill(record: SkillRecord): Promise<string> {
  const dir = path.join(TELEPATH_SKILLS, record.slug);
  await fs.mkdir(dir, { recursive: true });
  await ensureCategoryReadme();

  const createdAt = record.createdAt ?? new Date().toISOString();
  const whenToUse = record.whenToUse && record.whenToUse.length > 0
    ? record.whenToUse
    : whenToUseFor(record);
  const tags = [
    "telepath",
    record.outputKind,
    ...(record.tags ?? []),
    ...(deriveTags(record) ?? []),
  ].filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 8);

  const skillBody = [
    `# ${record.name}`,
    ``,
    record.description,
    ``,
    `## When to Use`,
    ``,
    ...whenToUse.map((line) => `- ${line}`),
    ``,
    `## How it runs`,
    ``,
    `Telepath stored a resolved \`${record.outputKind}\` spec for this intent. Replaying this skill regenerates the same visualization without re-asking. Invoke from any Hermes gateway:`,
    ``,
    "```bash",
    `hermes /telepath-${record.slug}`,
    "```",
  ].join("\n");

  const body = matter.stringify(skillBody, {
    name: `telepath-${record.slug}`,
    description: record.description,
    version: "1.0.0",
    author: "Telepath",
    license: "MIT",
    platforms: ["macos", "linux"],
    metadata: {
      hermes: {
        tags,
        related_skills: [],
      },
      telepath: {
        outputKind: record.outputKind,
        spec: record.spec,
        dimensions: record.dimensions ?? [],
        createdAt,
      },
    },
  });

  const out = path.join(dir, "SKILL.md");
  await fs.writeFile(out, body, "utf8");

  // Also write a legacy DESCRIPTION.md so older listSkills() callers keep working
  // until Hermes' skill scanner picks up SKILL.md.
  await fs.writeFile(path.join(dir, "DESCRIPTION.md"), body, "utf8");

  return out;
}

async function ensureCategoryReadme(): Promise<void> {
  const catReadme = path.join(TELEPATH_SKILLS, "DESCRIPTION.md");
  try {
    await fs.access(catReadme);
    return;
  } catch {
    // doesn't exist, create
  }
  const body = matter.stringify(
    "Skills auto-generated by Telepath — saved chart, diagram, and slide specs. Each subfolder is one replayable visualization.\n",
    {
      description:
        "Visualizations Telepath saved as Hermes skills. Each replays a chart, diagram, or single-slide infographic with the user's resolved memory dimensions.",
    },
  );
  await fs.writeFile(catReadme, body, "utf8");
}

function whenToUseFor(record: SkillRecord): string[] {
  const lines = [`User asks for the same intent again: "${record.description.slice(0, 120)}".`];
  if (record.outputKind === "chart") {
    lines.push("User wants a refreshed view of the same data shape.");
  } else if (record.outputKind === "diagram") {
    lines.push("User wants the same architecture or flow diagram regenerated.");
  } else {
    lines.push("User wants the same single-slide brief.");
  }
  return lines;
}

function deriveTags(record: SkillRecord): string[] | undefined {
  const dims = (record.dimensions ?? []) as Array<{ id?: string; value?: string | null }>;
  const out: string[] = [];
  for (const d of dims) {
    if (typeof d.value === "string" && d.value.trim().length > 0 && d.value.length < 30) {
      out.push(d.value.replace(/\s+/g, "-").toLowerCase());
    }
  }
  return out.slice(0, 4);
}

export async function getSkill(slug: string): Promise<SkillRecord | null> {
  const all = await listSkills();
  return all.find((s) => s.slug === slug) ?? null;
}

export async function snapshotMemory() {
  const cold = isCold();
  const [user, memory, skills, expanded] = await Promise.all([
    readUser(),
    readMemory(),
    listSkills(),
    (await import("./sources")).expandAll({ cold }),
  ]);
  return {
    cold,
    user,
    memory,
    chips: expanded.flatChips,
    skills,
    sources: expanded.counts,
    sourceConfigs: expanded.sources,
    paths: {
      home: HERMES_HOME,
      memories: MEMORIES_DIR,
      skills: SKILLS_DIR,
      telepathSkills: TELEPATH_SKILLS,
    },
  };
}

export type MemorySnapshot = Awaited<ReturnType<typeof snapshotMemory>>;
