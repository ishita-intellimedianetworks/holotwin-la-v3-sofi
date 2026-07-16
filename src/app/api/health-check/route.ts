/**
 * GET /api/health
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight liveness probe. Returns 200 with basic process info so load
 * balancers, uptime monitors, and deploy checks can confirm the app is up.
 * Forced dynamic + no-store so the response is never statically cached.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
