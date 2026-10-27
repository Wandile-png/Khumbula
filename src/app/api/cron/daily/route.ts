import { NextResponse } from "next/server";
import { runDaily } from "@/lib/billing";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;

/** Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const report = await runDaily();
  return NextResponse.json({ ok: true, report });
}
