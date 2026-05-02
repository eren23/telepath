"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SourceRow = {
  id: string;
  type: "hermes" | "json" | "http" | "text" | "hermes-sessions";
  name: string;
  enabled: boolean;
  removable: boolean;
  url?: string;
  hasAuth?: boolean;
  contentPreview?: string;
  lastFetched?: string;
  lastError?: string;
  count: number;
};

type Props = {
  open: boolean;
  onCloseAction: () => void;
  onChangedAction: () => void;
};

const TYPE_LABEL: Record<SourceRow["type"], string> = {
  hermes: "Hermes filesystem",
  json: "JSON",
  http: "HTTP API",
  text: "Free text",
  "hermes-sessions": "Hermes sessions (FTS5)",
};

export default function SourcesDrawer({ open, onCloseAction, onChangedAction }: Props) {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sources", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setRows(data.sources);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  const toggle = async (row: SourceRow) => {
    await fetch(`/api/sources/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await refresh();
    onChangedAction();
  };

  const remove = async (row: SourceRow) => {
    if (!row.removable) return;
    if (!confirm(`Remove "${row.name}"?`)) return;
    await fetch(`/api/sources/${row.id}`, { method: "DELETE" });
    await refresh();
    onChangedAction();
  };

  const refetch = async (row: SourceRow) => {
    await fetch(`/api/sources/${row.id}/refresh`, { method: "POST" });
    await refresh();
    onChangedAction();
  };

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCloseAction}
      />
      <aside className="glass absolute right-0 top-0 flex h-full w-[480px] flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-zinc-100">
              Memory sources
            </div>
            <div className="text-[12px] text-zinc-400">
              Where Telepath looks before asking you anything.
            </div>
          </div>
          <button
            onClick={onCloseAction}
            className="rounded-full border border-[var(--border)] px-2 py-1 text-[12px] text-zinc-400 hover:text-zinc-200"
          >
            Close
          </button>
        </header>

        <div className="thin-scroll flex-1 overflow-auto p-4">
          {loading && rows.length === 0 ? (
            <div className="text-[12px] text-zinc-500">Loading…</div>
          ) : null}
          <div className="space-y-3">
            {rows.map((row) => (
              <SourceCard
                key={row.id}
                row={row}
                onToggleAction={() => toggle(row)}
                onRemoveAction={() => remove(row)}
                onRefetchAction={() => refetch(row)}
              />
            ))}
          </div>

          {showAdd ? (
            <AddSourceForm
              onCancelAction={() => setShowAdd(false)}
              onCreatedAction={async () => {
                setShowAdd(false);
                await refresh();
                onChangedAction();
              }}
            />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-xl border border-dashed border-[var(--accent-soft)] bg-[var(--accent)]/5 px-4 py-3 text-[13px] text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
              >
                + Add manual
              </button>
              <ImportClaudeButton
                onImportedAction={async () => {
                  await refresh();
                  onChangedAction();
                }}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function SourceCard({
  row,
  onToggleAction,
  onRemoveAction,
  onRefetchAction,
}: {
  row: SourceRow;
  onToggleAction: () => void;
  onRemoveAction: () => void;
  onRefetchAction: () => void;
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 transition " +
        (row.enabled
          ? "border-[var(--border)] bg-[var(--panel-2)]"
          : "border-[var(--border)] bg-[var(--panel)] opacity-60")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
            <span
              className={
                "rounded px-1.5 py-0.5 " +
                (row.type === "hermes"
                  ? "bg-[var(--memory)]/15 text-[var(--memory)]"
                  : row.type === "http"
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-zinc-700/30 text-zinc-300")
              }
            >
              {TYPE_LABEL[row.type]}
            </span>
            <span>{row.count} chips</span>
            {row.lastFetched ? (
              <span className="text-zinc-600">· {timeAgo(row.lastFetched)}</span>
            ) : null}
          </div>
          <div className="mt-1 text-[13px] font-medium text-zinc-100">{row.name}</div>
          {row.url ? (
            <div className="mt-0.5 truncate text-[11px] text-zinc-500">{row.url}{row.hasAuth ? " 🔒" : ""}</div>
          ) : null}
          {row.contentPreview ? (
            <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{row.contentPreview}</div>
          ) : null}
          {row.lastError ? (
            <div className="mt-1 rounded border border-[var(--missing)]/30 bg-[var(--missing)]/10 px-2 py-1 text-[11px] text-[var(--missing)]">
              {row.lastError}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={onToggleAction}
            className={
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider " +
              (row.enabled
                ? "bg-[var(--memory)]/15 text-[var(--memory)]"
                : "bg-zinc-800 text-zinc-500")
            }
          >
            {row.enabled ? "On" : "Off"}
          </button>
          {row.type === "http" ? (
            <button
              onClick={onRefetchAction}
              className="text-[10px] text-zinc-500 hover:text-zinc-200"
            >
              Refresh
            </button>
          ) : null}
          {row.removable ? (
            <button
              onClick={onRemoveAction}
              className="text-[10px] text-zinc-500 hover:text-[var(--missing)]"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AddSourceForm({
  onCancelAction,
  onCreatedAction,
}: {
  onCancelAction: () => void;
  onCreatedAction: () => void;
}) {
  const [type, setType] = useState<"text" | "json" | "http" | "hermes-sessions">("text");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { type, name: name.trim() || autoName(type) };
      if (type === "http") {
        body.url = url.trim();
        if (auth.trim()) body.authHeader = auth.trim().startsWith("Bearer ") ? auth.trim() : `Bearer ${auth.trim()}`;
      } else if (type === "hermes-sessions") {
        body.query = query.trim();
      } else {
        body.content = content;
      }
      const r = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(JSON.stringify(data.error ?? `HTTP ${r.status}`));
      }
      onCreatedAction();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-[var(--accent-soft)] bg-[var(--panel-2)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-zinc-100">New source</div>
        <button
          onClick={onCancelAction}
          className="text-[11px] text-zinc-500 hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["text", "json", "http", "hermes-sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={
              "rounded-full border px-3 py-1 text-[11px] " +
              (type === t
                ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--panel)] text-zinc-400 hover:text-zinc-200")
            }
          >
            {t === "hermes-sessions" ? "hermes sessions" : t}
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Name (${autoName(type)})`}
        className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
      />

      {type === "http" ? (
        <>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/me/memories"
            className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
          />
          <input
            value={auth}
            onChange={(e) => setAuth(e.target.value)}
            placeholder="Bearer token (optional) — auto-prefixed"
            className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
          />
          <p className="mb-2 text-[11px] text-zinc-500">
            Endpoint must return JSON shaped like{" "}
            <code className="text-zinc-400">{`{ chips: [{ raw, label?, id? }, ...] }`}</code>.
          </p>
        </>
      ) : type === "hermes-sessions" ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='FTS5 query (e.g. "codewm OR sfumato OR diff-xyz")'
            className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
          />
          <p className="mb-2 text-[11px] text-zinc-500">
            Searches Hermes&apos; <code className="text-zinc-400">~/.hermes/state.db</code> via FTS5.
            Returns top-8 matching messages from past sessions as memory chips.
          </p>
        </>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "json"
                ? '{ "chips": [ { "raw": "I work in Python", "label": "Python" }, ... ] }'
                : "Paste a paragraph or bulleted notes about yourself."
            }
            rows={6}
            className="mb-2 w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[12px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[var(--accent-soft)]"
          />
        </>
      )}

      {err ? (
        <div className="mb-2 rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 px-2 py-1 text-[11px] text-[var(--missing)]">
          {err}
        </div>
      ) : null}

      <button
        onClick={submit}
        disabled={
          submitting ||
          (type === "http"
            ? !url.trim()
            : type === "hermes-sessions"
              ? !query.trim()
              : !content.trim())
        }
        className="w-full rounded-xl bg-[var(--accent)] py-2 text-[13px] font-medium text-black transition hover:bg-[var(--accent-soft)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "Adding…" : "Add source"}
      </button>
    </div>
  );
}

function autoName(type: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `${type} source ${ts}`;
}

type ClaudeProject = {
  id: string;
  decoded: string;
  sessionCount: number;
  totalMessages: number;
  lastModified: string;
  bytes: number;
};

function ImportClaudeButton({ onImportedAction }: { onImportedAction: () => void }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/claude-projects", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setProjects(data.projects ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const importProject = async (projectId: string) => {
    setImporting(projectId);
    setErr(null);
    try {
      const r = await fetch("/api/import/claude-traces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.toString() ?? `HTTP ${r.status}`);
      onImportedAction();
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          load();
        }}
        className="rounded-xl border border-dashed border-[var(--memory)]/40 bg-[var(--memory)]/5 px-4 py-3 text-[13px] text-[var(--memory)] transition hover:bg-[var(--memory)]/10"
      >
        ⤓ From Claude Code
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6">
              <button
                type="button"
                aria-label="Close"
                className="absolute inset-0"
                onClick={() => setOpen(false)}
              />
              <div className="relative max-h-[80vh] w-[640px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-zinc-100">
                      Import Claude Code traces
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Pick a project — Kimi will extract durable facts as memory chips.
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="ml-3 shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>
                <div className="thin-scroll max-h-[60vh] overflow-auto p-3">
                  {err ? (
                    <div className="mb-2 rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 px-3 py-2 text-[12px] text-[var(--missing)]">
                      {err}
                    </div>
                  ) : null}
                  {loading ? (
                    <div className="text-[12px] text-zinc-500">
                      Scanning ~/.claude/projects…
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="text-[12px] text-zinc-500">
                      No Claude Code projects found. Run a session first or check
                      ~/.claude/projects.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {projects.slice(0, 30).map((p) => {
                        const tail = projectTail(p.decoded);
                        const isImporting = importing === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => importProject(p.id)}
                            disabled={importing !== null}
                            title={p.decoded}
                            className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-left transition hover:border-[var(--accent-soft)] hover:bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] text-zinc-200">
                                {tail.last}
                              </div>
                              <div className="truncate text-[10px] text-zinc-500">
                                {tail.head}
                              </div>
                              <div className="mt-0.5 text-[10px] text-zinc-600">
                                {p.sessionCount} session{p.sessionCount === 1 ? "" : "s"} ·{" "}
                                {p.totalMessages} msgs · {fmtBytes(p.bytes)}
                              </div>
                            </div>
                            <span
                              className={
                                "shrink-0 text-[10px] " +
                                (isImporting ? "text-[var(--memory)]" : "text-zinc-500")
                              }
                            >
                              {isImporting ? "Extracting…" : "Import →"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function projectTail(decoded: string): { head: string; last: string } {
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0) return { head: "", last: decoded };
  const last = segments.slice(-2).join("/");
  const head = "/" + segments.slice(0, -2).join("/");
  return { head, last };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
