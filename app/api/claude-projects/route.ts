import { NextResponse } from "next/server";
import { projectsSummary } from "@/lib/extract-claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await projectsSummary();
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
