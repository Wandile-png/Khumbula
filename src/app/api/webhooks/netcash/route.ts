import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { payOldestOpen } from "@/lib/policies";
import { audit } from "@/lib/audit";

/**
 * Placeholder notify endpoint for DebiCheck mandate and collection results.
 * Netcash's real notification format should be mapped here once the account is live. Until then this accepts
 * a simple JSON shape so you (or a middleware like Zapier) can post results:
 *   { "policyNumber": "EFH-1001", "type": "mandate", "status": "APPROVED" | "DECLINED" }
 *   { "policyNumber": "EFH-1001", "type": "collection", "status": "PAID", "reference": "NC123" }
 * Authenticate with header x-webhook-secret = NETCASH_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.NETCASH_WEBHOOK_SECRET ?? "";
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const b = (await req.json()) as { policyNumber: string; type: "mandate" | "collection"; status: string; reference?: string };
  const policy = await db.policy.findUnique({ where: { policyNumber: b.policyNumber } });
  if (!policy) return NextResponse.json({ error: "unknown policy" }, { status: 404 });
  if (b.type === "mandate" && (b.status === "APPROVED" || b.status === "DECLINED")) {
    await db.mandate.update({ where: { policyId: policy.id }, data: { status: b.status } });
  } else if (b.type === "collection" && b.status === "PAID") {
    await payOldestOpen(policy.id, "DEBICHECK", b.reference ?? "netcash", "webhook:netcash");
  }
  await audit(policy.tenantId, "webhook:netcash", `${b.type}.${b.status.toLowerCase()}`, policy.id);
  return NextResponse.json({ ok: true });
}
