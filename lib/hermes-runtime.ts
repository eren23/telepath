import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import { promises as fs } from "node:fs";

const HERMES_BIN =
  process.env.HERMES_BIN ?? path.join(os.homedir(), ".local", "bin", "hermes");

export type AskOptions = {
  /** Hard timeout in ms (default 35000). */
  timeoutMs?: number;
  /** Comma-separated toolsets to enable (e.g., "web,session_search"). */
  toolsets?: string[];
  /** Skill slugs to preload. */
  skills?: string[];
  /** Force a specific provider (default lets Hermes pick). */
  provider?: "kimi-coding" | "openrouter" | "nous" | "anthropic" | "auto";
  /** Optional model override. */
  model?: string;
  /** Stream callback for incremental stdout. */
  onChunk?: (chunk: string) => void;
};

export type AskResult = {
  ok: boolean;
  text: string;
  durationMs: number;
  exitCode: number | null;
  error?: string;
  command: string[];
};

let _availability: Promise<boolean> | null = null;

export async function isHermesAvailable(): Promise<boolean> {
  if (_availability) return _availability;
  _availability = (async () => {
    try {
      await fs.access(HERMES_BIN, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  })();
  return _availability;
}

export async function askHermes(prompt: string, opts: AskOptions = {}): Promise<AskResult> {
  const start = Date.now();
  const provider = opts.provider ?? (process.env.HERMES_PROVIDER as AskOptions["provider"]) ?? "openrouter";
  const model = opts.model ?? process.env.HERMES_MODEL ?? "moonshotai/kimi-k2-0905";

  const args: string[] = ["chat", "-q", prompt, "-Q"];
  if (opts.toolsets && opts.toolsets.length > 0) {
    args.push("-t", opts.toolsets.join(","));
  }
  if (opts.skills && opts.skills.length > 0) {
    args.push("-s", opts.skills.join(","));
  }
  if (provider) args.push("--provider", provider);
  if (model) args.push("-m", model);
  const command = [HERMES_BIN, ...args];

  const available = await isHermesAvailable();
  if (!available) {
    return {
      ok: false,
      text: "",
      durationMs: 0,
      exitCode: null,
      error: `hermes binary not found at ${HERMES_BIN}. Set HERMES_BIN env or install via the Nous Research instructions.`,
      command,
    };
  }

  // Pass through any OpenRouter / Moonshot keys we have so Hermes can authenticate.
  const inheritedKey =
    process.env.OPENROUTER_API_KEY ??
    process.env.OPEN_ROUTER_API_KEY ??
    "";

  return new Promise<AskResult>((resolve) => {
    const timeoutMs = opts.timeoutMs ?? 35_000;
    const proc = spawn(HERMES_BIN, args, {
      env: {
        ...process.env,
        NO_COLOR: "1",
        HERMES_NONINTERACTIVE: "1",
        ...(inheritedKey ? { OPENROUTER_API_KEY: inheritedKey } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGTERM"); } catch {}
      resolve({
        ok: false,
        text: out,
        durationMs: Date.now() - start,
        exitCode: null,
        error: `timed out after ${timeoutMs}ms`,
        command,
      });
    }, timeoutMs);

    proc.stdout?.on("data", (buf: Buffer) => {
      const chunk = buf.toString("utf8");
      out += chunk;
      if (opts.onChunk) opts.onChunk(chunk);
    });
    proc.stderr?.on("data", (buf: Buffer) => {
      err += buf.toString("utf8");
    });
    proc.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        text: out,
        durationMs: Date.now() - start,
        exitCode: null,
        error: e.message,
        command,
      });
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const text = stripBanner(out).trim();
      resolve({
        ok: code === 0 && text.length > 0,
        text,
        durationMs: Date.now() - start,
        exitCode: code,
        error: code === 0 ? undefined : err.trim().slice(0, 600) || `exit ${code}`,
        command,
      });
    });
  });
}

function stripBanner(out: string): string {
  // Strip ANSI, box-drawing banner, warnings, session_id footer.
  return out
    .replace(/\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\][^]*/g, "")
    .replace(/^[╭╰╯╮┌└┐┘├┤┬┴┼─│║═╔╚╝╗].*$/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^Warning: .*$/gm, "")
    .replace(/\n*session_id:\s*[\w-]+\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\[[0-9;]*[A-Za-z]/g, "")
    .replace(/^[├└│─]+.*$/gm, "")
    .replace(/^Session: [\w-]+\s*$/gm, "")
    .trim();
}

/** Quick availability + warm-up probe. Cached. */
let _probe: Promise<{ available: boolean; version: string | null }> | null = null;
export async function hermesProbe() {
  if (_probe) return _probe;
  _probe = (async () => {
    if (!(await isHermesAvailable())) {
      return { available: false, version: null };
    }
    return new Promise<{ available: boolean; version: string | null }>((resolve) => {
      const proc = spawn(HERMES_BIN, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout?.on("data", (b: Buffer) => (out += b.toString("utf8")));
      proc.on("close", () => {
        const m = out.match(/Hermes Agent v([\d.]+)/);
        resolve({ available: true, version: m ? m[1] : null });
      });
      proc.on("error", () => resolve({ available: true, version: null }));
    });
  })();
  return _probe;
}
