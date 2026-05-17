import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { snapshotMemory } from "@/lib/hermes-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentMode = "claude-env" | "claude-cli" | "kimi-only";

let cliPathCache: string | null | undefined;

function findClaudeCli(): string | null {
  if (cliPathCache !== undefined) return cliPathCache;
  const path = process.env.PATH ?? "";
  const exeName = process.platform === "win32" ? "claude.exe" : "claude";
  for (const dir of path.split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    const candidate = join(dir, exeName);
    if (existsSync(candidate)) {
      cliPathCache = candidate;
      return candidate;
    }
  }
  cliPathCache = null;
  return null;
}

function detectAgentMode(): AgentMode {
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return "claude-env";
  }
  if (findClaudeCli()) return "claude-cli";
  return "kimi-only";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cold = url.searchParams.get("cold") === "1";
  if (cold) process.env.TELEPATH_COLD = "1";
  else delete process.env.TELEPATH_COLD;
  const snap = await snapshotMemory();
  return NextResponse.json({
    cold: snap.cold,
    chips: snap.chips,
    skills: snap.skills,
    paths: snap.paths,
    agent: { mode: detectAgentMode() },
  });
}
