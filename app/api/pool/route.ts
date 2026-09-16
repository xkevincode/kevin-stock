import { NextResponse } from "next/server";
import { buildCandidatePool } from "@/lib/pool";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await buildCandidatePool();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const error = err instanceof Error ? err.message : "候选池生成失败";
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

export async function POST() {
  return GET();
}
