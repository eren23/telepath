"use client";

import { useEffect, useState } from "react";
import type { GeneralizedSkill } from "@/lib/skill-generalize";

type Props = {
  open: boolean;
  initialSlug: string;
  initialName: string;
  initialDescription: string;
  generalizing: boolean;
  generalized: GeneralizedSkill | null;
  generalizeError: string | null;
  onCloseAction: () => void;
  onSaveAction: (payload: {
    slug: string;
    name: string;
    description: string;
    whenToUse: string[];
    tags: string[];
  }) => Promise<void>;
};

export default function DistillModal({
  open,
  initialSlug,
  initialName,
  initialDescription,
  generalizing,
  generalized,
  generalizeError,
  onCloseAction,
  onSaveAction,
}: Props) {
  const [mode, setMode] = useState<"generalized" | "literal">("generalized");
  const [slug, setSlug] = useState(initialSlug);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [whenToUse, setWhenToUse] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (generalized && mode === "generalized") {
      setSlug(generalized.slug);
      setName(generalized.name);
      setDescription(generalized.description);
      setWhenToUse(generalized.whenToUse);
      setTags(generalized.tags);
    } else if (mode === "literal") {
      setSlug(initialSlug);
      setName(initialName);
      setDescription(initialDescription);
      setWhenToUse([]);
      setTags([]);
    }
  }, [open, generalized, mode, initialSlug, initialName, initialDescription]);

  if (!open) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await onSaveAction({
        slug: slug.replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 60),
        name,
        description,
        whenToUse,
        tags,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6">
      <div className="glass w-[640px] max-w-[95vw] overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--memory)]/30 bg-[var(--memory)]/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--memory)]">
                ⚕ Hermes
              </span>
              <div className="text-[14px] font-semibold text-zinc-100">Distill into skill</div>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              Hermes Agent abstracts the recipe so the skill works for many future asks.
            </div>
          </div>
          <button
            onClick={onCloseAction}
            disabled={saving}
            className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
        </header>

        <div className="px-5 py-4">
          <div className="mb-3 flex gap-1.5">
            {(["generalized", "literal"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={m === "generalized" && (generalizing || !generalized)}
                className={
                  "rounded-full border px-3 py-1 text-[11px] " +
                  (mode === m
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--panel)] text-zinc-400 hover:text-zinc-200") +
                  (m === "generalized" && generalizing ? " opacity-50" : "")
                }
              >
                {m === "generalized" ? "Generalized (Hermes)" : "Literal"}
              </button>
            ))}
            {generalizing ? (
              <span className="ml-2 self-center text-[11px] text-[var(--memory)]">
                ⚕ distilling…
              </span>
            ) : null}
          </div>

          {mode === "generalized" && generalizeError ? (
            <div className="mb-3 rounded border border-[var(--missing)]/40 bg-[var(--missing)]/10 px-3 py-2 text-[11px] text-[var(--missing)]">
              Hermes couldn&apos;t distill this one — falling back to literal.
              <br />
              <span className="opacity-70">{generalizeError.slice(0, 200)}</span>
            </div>
          ) : null}

          <div className="space-y-3">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-[var(--accent-soft)]"
              />
            </Field>
            <Field label="Slug">
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 font-mono text-[12px] text-zinc-300 outline-none focus:border-[var(--accent-soft)]"
              />
              <div className="mt-1 text-[10px] text-zinc-500">
                CLI: <span className="text-[var(--memory)]">$ hermes /telepath-{slug}</span>
              </div>
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[12px] text-zinc-100 outline-none focus:border-[var(--accent-soft)]"
              />
            </Field>
            {whenToUse.length > 0 ? (
              <Field label="When to use (Hermes-suggested)">
                <ul className="space-y-1 text-[11px] text-zinc-300">
                  {whenToUse.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--memory)]" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </Field>
            ) : null}
            {tags.length > 0 ? (
              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Field>
            ) : null}
            {generalized && generalized.slots.length > 0 ? (
              <Field label="Slots Hermes parameterized">
                <div className="space-y-1 text-[11px]">
                  {generalized.slots.map((s) => (
                    <div key={s.id} className="flex items-baseline gap-2 text-zinc-300">
                      <span className="font-mono text-[var(--accent)]">{`{${s.id}}`}</span>
                      <span className="text-zinc-500">·</span>
                      <span>{s.label}</span>
                      <span className="text-zinc-500">→</span>
                      <span className="italic text-zinc-400">{s.example}</span>
                    </div>
                  ))}
                </div>
              </Field>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={onCloseAction}
            disabled={saving}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || generalizing || !name.trim() || !slug.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-1.5 text-[12px] font-medium text-black transition hover:bg-[var(--accent-soft)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : `Save ${mode === "generalized" ? "generalized" : "literal"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      {children}
    </div>
  );
}
