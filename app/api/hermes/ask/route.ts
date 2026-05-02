import { NextResponse } from "next/server";
import { z } from "zod";
import { askHermes, hermesProbe } from "@/lib/hermes-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(2000),
  toolsets: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(120000).optional(),
  stream: z.boolean().optional(),
});

export async function GET() {
  const probe = await hermesProbe();
  return NextResponse.json(probe);
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { prompt, toolsets, skills, timeoutMs, stream } = parsed.data;

  if (!stream) {
    const r = await askHermes(prompt, { toolsets, skills, timeoutMs });
    return NextResponse.json(r);
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      send("start", { prompt });
      const result = await askHermes(prompt, {
        toolsets,
        skills,
        timeoutMs,
        onChunk: (chunk) => send("chunk", { delta: chunk }),
      });
      send("done", result);
      controller.close();
    },
  });

  return new Response(sse, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
