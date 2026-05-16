import { describe, it, expect } from "vitest";
import { readSse } from "@/lib/sse-client";

function streamOf(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200 });
}

async function collect<T>(iter: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("readSse", () => {
  it("parses a well-formed event with JSON data", async () => {
    const events = await collect(
      readSse(streamOf(`event: chunk\ndata: {"delta":"hi"}\n\n`)),
    );
    expect(events).toEqual([{ event: "chunk", data: { delta: "hi" } }]);
  });

  it("handles multiple events back-to-back", async () => {
    const events = await collect(
      readSse(
        streamOf(
          `event: start\ndata: {}\n\nevent: chunk\ndata: {"delta":"a"}\n\nevent: done\ndata: {"ok":true}\n\n`,
        ),
      ),
    );
    expect(events.map((e) => e.event)).toEqual(["start", "chunk", "done"]);
    expect((events[2].data as { ok: boolean }).ok).toBe(true);
  });

  it("reassembles events split across chunks", async () => {
    const events = await collect(
      readSse(
        streamOf(
          `event: chu`,
          `nk\ndata: {"del`,
          `ta":"x"}\n\nevent: done\nda`,
          `ta: {"ok":true}\n\n`,
        ),
      ),
    );
    expect(events.map((e) => e.event)).toEqual(["chunk", "done"]);
    expect((events[0].data as { delta: string }).delta).toBe("x");
  });

  it("falls back to raw string when data is not JSON", async () => {
    const events = await collect(
      readSse(streamOf(`event: ping\ndata: hello world\n\n`)),
    );
    expect(events).toEqual([{ event: "ping", data: "hello world" }]);
  });

  it("defaults event name to 'message' when omitted", async () => {
    const events = await collect(
      readSse(streamOf(`data: "just-data"\n\n`)),
    );
    expect(events).toEqual([{ event: "message", data: "just-data" }]);
  });

  it("emits a trailing event with no double-newline if present at EOS", async () => {
    const events = await collect(
      readSse(streamOf(`event: tail\ndata: {"n":1}`)),
    );
    expect(events).toEqual([{ event: "tail", data: { n: 1 } }]);
  });

  it("joins multi-line data fields with newline", async () => {
    const events = await collect(
      readSse(streamOf(`event: multi\ndata: line1\ndata: line2\n\n`)),
    );
    expect(events[0].data).toBe("line1\nline2");
  });

  it("throws if response has no body", async () => {
    const bodiless = new Response(null, { status: 204 });
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of readSse(bodiless)) {
        // noop
      }
    }).rejects.toThrow(/no response body/);
  });
});
