import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const HERMES_BIN =
  process.env.HERMES_BIN ?? path.join(os.homedir(), ".local", "bin", "hermes");

type Cadence = "daily" | "weekly" | "off";

const CADENCE_SCHEDULE: Record<Exclude<Cadence, "off">, string> = {
  daily: "every 1d",
  weekly: "every 7d",
};

function inheritedEnv(): NodeJS.ProcessEnv {
  const inheritedKey =
    process.env.OPENROUTER_API_KEY ??
    process.env.OPEN_ROUTER_API_KEY ??
    "";
  return {
    ...process.env,
    NO_COLOR: "1",
    ...(inheritedKey ? { OPENROUTER_API_KEY: inheritedKey } : {}),
  };
}

function runHermes(args: string[], timeoutMs = 20_000): Promise<{ ok: boolean; out: string; err: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(HERMES_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: inheritedEnv(),
    });
    let out = "";
    let err = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGTERM"); } catch {}
      resolve({ ok: false, out, err: err + "\n[timeout]", code: null });
    }, timeoutMs);
    proc.stdout?.on("data", (b: Buffer) => (out += b.toString("utf8")));
    proc.stderr?.on("data", (b: Buffer) => (err += b.toString("utf8")));
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, out, err, code });
    });
  });
}

function jobName(slug: string): string {
  return `telepath-${slug}`;
}

export type ScheduleResult = {
  ok: boolean;
  cadence: Cadence;
  message: string;
  command?: string[];
};

export async function listJobs(): Promise<{ ok: boolean; raw: string }> {
  const r = await runHermes(["cron", "list"]);
  return { ok: r.ok, raw: r.out + r.err };
}

async function findExistingJobId(slug: string): Promise<string | null> {
  const r = await runHermes(["cron", "list"]);
  const text = r.out + r.err;
  // hermes cron list output includes job names; we look for "telepath-<slug>"
  const lines = text.split(/\n/);
  const target = jobName(slug);
  for (const line of lines) {
    if (line.includes(target)) {
      const m = line.match(/\b([0-9a-f]{6,}|cron-[\w-]+|job-[\w-]+|[a-zA-Z0-9_-]{10,})\b/);
      if (m && m[1] !== target) return m[1];
    }
  }
  return null;
}

export async function setSchedule(slug: string, cadence: Cadence): Promise<ScheduleResult> {
  if (cadence === "off") {
    const existing = await findExistingJobId(slug);
    if (!existing) {
      return { ok: true, cadence: "off", message: "no schedule was set" };
    }
    const r = await runHermes(["cron", "remove", existing]);
    return {
      ok: r.ok,
      cadence: "off",
      message: r.ok ? "schedule removed" : (r.err || "remove failed").slice(0, 200),
      command: [HERMES_BIN, "cron", "remove", existing],
    };
  }

  // Remove any existing schedule first to avoid duplicates
  const existing = await findExistingJobId(slug);
  if (existing) {
    await runHermes(["cron", "remove", existing]);
  }

  const schedule = CADENCE_SCHEDULE[cadence];
  const args = [
    "cron",
    "create",
    "--name", jobName(slug),
    "--skill", jobName(slug),
    "--deliver", "local",
    schedule,
    `Replay the Telepath skill telepath-${slug} and save the rendered output locally.`,
  ];
  const r = await runHermes(args);
  return {
    ok: r.ok,
    cadence,
    message: r.ok ? `scheduled ${cadence}` : (r.err || r.out || "create failed").slice(0, 300),
    command: [HERMES_BIN, ...args],
  };
}

export async function getSchedule(slug: string): Promise<{ active: boolean; cadence: Cadence; raw?: string }> {
  const existing = await findExistingJobId(slug);
  if (!existing) return { active: false, cadence: "off" };
  return { active: true, cadence: "daily", raw: existing };
}
