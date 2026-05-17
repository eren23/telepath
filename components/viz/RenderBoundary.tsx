"use client";

import { Component, type ReactNode } from "react";

type Props = { kind: string; children: ReactNode };
type State = { error: Error | null };

export class RenderBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[render crash]", this.props.kind, error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-[var(--missing)]/40 bg-[var(--missing)]/10 p-4 text-[12px] text-[var(--missing)]">
          <div className="font-semibold">
            This <code>{this.props.kind}</code> output crashed while rendering
          </div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--missing)]/80">
            {this.state.error.message}
          </pre>
          <div className="mt-2 text-[11px] text-[var(--missing)]/70">
            Other panels still rendered — try a refine to fix this one.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
