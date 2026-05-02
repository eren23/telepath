#!/usr/bin/env node
/**
 * Telepath demo recorder.
 * - Swaps data/sources.json to a sanitized demo fixture (so no personal data is captured).
 * - Drives a Playwright Chromium browser through the full demo flow.
 * - Records video to recordings/<timestamp>.webm.
 * - Restores the real sources.json on exit.
 *
 * Usage:
 *   pnpm record-demo                      # full demo + restore
 *   pnpm record-demo -- --keep-demo       # do not restore (debug)
 *   pnpm record-demo -- --no-swap         # use whatever sources are currently active
 *   pnpm record-demo -- --headless=false  # show the browser while recording (more reliable)
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const flag = (name) => args.has(name);
const SWAP = !flag("--no-swap");
const KEEP = flag("--keep-demo");
const HEADLESS = !flag("--headless=false");

const SOURCES = path.join(ROOT, "data", "sources.json");
const SOURCES_DEMO = path.join(ROOT, "data", "sources.demo.json");
const SOURCES_BAK = path.join(ROOT, "data", "sources.real.bak.json");
const RECORDINGS = path.join(ROOT, "recordings");

const VIEWPORT = { width: 1440, height: 900 };
const TYPE_DELAY = 28; // ms per char — feels like a confident user
const PAUSE_SHORT = 700;
const PAUSE_MED = 1500;
const PAUSE_LONG = 2400;

async function ensure(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function backupAndSwap() {
  if (!(await ensure(SOURCES_DEMO))) {
    throw new Error(`missing ${SOURCES_DEMO} — see data/sources.demo.json`);
  }
  if (await ensure(SOURCES)) {
    await fs.copyFile(SOURCES, SOURCES_BAK);
    console.log("[demo] backed up sources.json → sources.real.bak.json");
  }
  await fs.copyFile(SOURCES_DEMO, SOURCES);
  console.log("[demo] swapped sources.json ← sources.demo.json");
}

async function restore() {
  if (!(await ensure(SOURCES_BAK))) {
    console.log("[demo] no backup to restore");
    return;
  }
  await fs.copyFile(SOURCES_BAK, SOURCES);
  console.log("[demo] restored sources.json from backup");
}

async function pause(ms) { await new Promise((r) => setTimeout(r, ms)); }

async function ensureServer(url, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok || r.status === 200 || r.status === 405) return true;
    } catch { /* not yet */ }
    await pause(300);
  }
  return false;
}

async function waitForComposerEnabled(page, timeout = 90000) {
  await page.waitForFunction(() => {
    const t = document.querySelector('textarea[placeholder*="see"], textarea[placeholder*="Refine"]');
    return t && !t.disabled;
  }, undefined, { timeout });
}

async function clearComposer(page) {
  await waitForComposerEnabled(page);
  const composer = page.locator('textarea[placeholder*="see"], textarea[placeholder*="Refine"]').first();
  await composer.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Delete");
  return composer;
}

async function typePrompt(page, text) {
  const composer = await clearComposer(page);
  await composer.type(text, { delay: TYPE_DELAY });
  await pause(PAUSE_SHORT);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
}

async function waitForRender(page, timeout = 90000) {
  // Wait for a render canvas (vega svg, mermaid svg, or slide title) to appear,
  // then for shimmer placeholders to disappear.
  await Promise.race([
    page.locator(".vega-host svg").first().waitFor({ state: "visible", timeout }).catch(() => null),
    page.locator('[class*="MermaidCanvas"] svg').first().waitFor({ state: "visible", timeout }).catch(() => null),
    page.locator(".overflow-auto svg").first().waitFor({ state: "visible", timeout }).catch(() => null),
    page.locator('text="It already knew."').first().waitFor({ state: "hidden", timeout }).catch(() => null),
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll(".shimmer").length === 0,
    undefined,
    { timeout },
  ).catch(() => null);
  await waitForComposerEnabled(page, timeout);
}

async function clearThread(page) {
  // The "Clear · N" button only shows when there's at least one thread item
  const clearBtn = page.locator('button[title="Clear conversation"]').first();
  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click();
    await pause(PAUSE_SHORT);
  }
}

async function waitFor(page, locator, timeout = 60000) {
  await page.locator(locator).first().waitFor({ state: "visible", timeout });
}

async function clickIfPresent(page, locator, timeout = 4000) {
  try {
    await page.locator(locator).first().click({ timeout });
    return true;
  } catch {
    return false;
  }
}

async function record() {
  await fs.mkdir(RECORDINGS, { recursive: true });

  const ok = await ensureServer("http://localhost:3000/", 5000);
  if (!ok) {
    console.error("[demo] cannot reach localhost:3000 — start the dev server first (`pnpm dev`)");
    process.exit(1);
  }

  if (SWAP) await backupAndSwap();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: RECORDINGS, size: VIEWPORT },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  try {
    console.log("[demo] beat 0 — open page, settle");
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await pause(PAUSE_LONG);

    console.log("[demo] beat 1 — toggle Cold start ON");
    await clickIfPresent(page, 'button:has-text("Memory active")');
    await pause(PAUSE_LONG);

    console.log("[demo] beat 2 — cold-start ask");
    await typePrompt(page, "chart how my research is going");
    // Either chip-question or render
    await Promise.race([
      page.locator('text="one quick thing"').first().waitFor({ state: "visible", timeout: 60000 }).catch(() => null),
      page.locator('.vega-host svg').first().waitFor({ state: "visible", timeout: 60000 }).catch(() => null),
    ]);
    await pause(PAUSE_MED);

    console.log("[demo] beat 2b — answer chip if asked");
    const firstChipSelector = 'button:has-text("W&B"), button:has-text("Weights & Biases"), button:has-text("Spreadsheet"), button:has-text("HuggingFace"), button:has-text("Google Drive"), button:has-text("Toggl")';
    const chip = page.locator(firstChipSelector).first();
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
    }
    await waitForRender(page);
    await pause(PAUSE_LONG);

    console.log("[demo] beat 3 — clear thread + toggle Cold start OFF");
    await clearThread(page);
    await clickIfPresent(page, 'button:has-text("Cold start")');
    await pause(PAUSE_LONG);

    console.log("[demo] beat 4 — same ask, memory on (chips glow, 0 questions)");
    await typePrompt(page, "chart how my research is going");
    await waitForRender(page);
    // Let the chip-glow animate fully
    await pause(3500);

    console.log("[demo] beat 5 — live-data ask (Hermes web search)");
    await clearThread(page);
    await pause(PAUSE_SHORT);
    await typePrompt(page, "slide of what's new in code-world-models research this week");
    // Wait for live-data badge to appear OR render to complete
    await Promise.race([
      page.locator('text=⚕ Hermes web search').first().waitFor({ state: "visible", timeout: 60000 }).catch(() => null),
      page.locator('.shimmer').first().waitFor({ state: "hidden", timeout: 90000 }).catch(() => null),
    ]);
    await waitForRender(page, 120000);
    // Hold so the viewer can read the slide
    await pause(PAUSE_LONG);

    console.log("[demo] beat 6 — Save as skill → distill modal");
    const saveBtn = page.locator('button:has-text("Save as skill")').first();
    if (await saveBtn.isEnabled().catch(() => false)) {
      await saveBtn.click();
      await page.locator('text=Distill into skill').first().waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
      await page.waitForFunction(
        () => !document.body.innerText.includes("distilling…"),
        undefined,
        { timeout: 60000 },
      ).catch(() => null);
      await pause(PAUSE_LONG);

      console.log("[demo] beat 7 — Save generalized");
      await clickIfPresent(page, 'button:has-text("Save generalized")');
      await pause(PAUSE_LONG);
    } else {
      console.warn("[demo] Save as skill not enabled — skipping skill beat");
    }

    console.log("[demo] beat 8 — final hold");
    await pause(PAUSE_LONG);

    console.log("[demo] done");
  } catch (err) {
    console.error("[demo] error mid-recording:", err);
  } finally {
    const videoPath = await page.video()?.path();
    await context.close();
    await browser.close();

    if (SWAP && !KEEP) await restore();

    if (videoPath) {
      const stat = await fs.stat(videoPath);
      console.log(`\n✅ recording saved: ${videoPath}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      console.log(`\nConvert to mp4 with: ffmpeg -i ${videoPath} -c:v libx264 -crf 22 -preset slow ${videoPath.replace(/\.webm$/, ".mp4")}`);
    }
  }
}

record().catch((e) => {
  console.error(e);
  process.exit(1);
});
