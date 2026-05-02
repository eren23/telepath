"use client";

import type { ThreadItem } from "@/components/Telepath";

export function threadToJson(thread: ThreadItem[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: "telepath",
      version: 1,
      thread,
    },
    null,
    2,
  );
}

export function threadToMarkdown(thread: ThreadItem[]): string {
  const lines: string[] = [
    `# Telepath chat export`,
    ``,
    `_Exported ${new Date().toISOString()} · ${thread.length} turn${thread.length === 1 ? "" : "s"}_`,
    ``,
  ];
  thread.forEach((item, i) => {
    lines.push(`## Turn ${i + 1}${item.isRefine ? " (refine)" : ""}`);
    lines.push("");
    lines.push(`**Prompt:** ${item.prompt}`);
    lines.push("");
    if (item.intent?.dimensions?.length) {
      lines.push(`**Resolved dimensions:**`);
      for (const d of item.intent.dimensions) {
        lines.push(`- \`${d.id}\` · ${d.label}: ${d.value ?? "—"} _(${d.source})_`);
      }
      lines.push("");
    }
    if (item.liveData) {
      lines.push(
        `**Live web search:** ${item.liveData.ok ? "ok" : "failed"} · ${item.liveData.facts.length} fact(s) · ${item.liveData.durationMs}ms`,
      );
      if (item.liveData.facts.length > 0) {
        for (const f of item.liveData.facts) lines.push(`  - ${f}`);
      }
      lines.push("");
    }
    if (item.result) {
      lines.push(`**Output kind:** \`${item.result.outputKind}\``);
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(item.result.spec, null, 2));
      lines.push("```");
      lines.push("");
    }
    if (item.error) {
      lines.push(`**Error:** ${item.error}`);
      lines.push("");
    }
  });
  return lines.join("\n");
}
