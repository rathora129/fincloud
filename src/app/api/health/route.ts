import { NextResponse } from "next/server";
import { persistenceSummary } from "@/server/env";

export async function GET() {
  try {
    const persistence = persistenceSummary();
    return NextResponse.json({
      status: "ok",
      persistence,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "misconfigured", persistence: { adapter: "unavailable" } },
      { status: 503 },
    );
  }
}

export const runtime = "nodejs";
