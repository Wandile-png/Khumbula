import { db } from "@/lib/db";
import { validateItn } from "@/lib/payments/payfast";
import { payOldestOpen, recordPayment } from "@/lib/policies";
import { audit } from "@/lib/audit";

/**
 * PayFast ITN. PayFast expects HTTP 200 quickly. Every charge on a subscription sends an ITN with the same
 * m_payment_id (the policy number), so those pay the oldest open premium. Once-off payments carry
 * "POLICY:premiumId" and pay that premium.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const mPaymentId = params.get("m_payment_id") ?? "";
  const [policyNumber, premiumId] = mPaymentId.split(":");
  const policy = await db.policy.findUnique({ where: { policyNumber } });
  if (!policy) return new Response("unknown policy", { status: 200 });

  const premium = premiumId ? await db.premium.findUnique({ where: { id: premiumId } }) : null;
  const expected = premium?.amountCents ?? policy.premiumCents;
  const v = await validateItn(raw, expected);
  if (!v.ok) {
    await audit(policy.tenantId, "webhook:payfast", "itn.rejected", policy.id, { reason: v.reason ?? "", pf: v.data.pf_payment_id ?? "" });
    return new Response("rejected", { status: 400 });
  }
  const d = v.data;
  if (d.token && !policy.payfastToken) await db.policy.update({ where: { id: policy.id }, data: { payfastToken: d.token } });

  if (d.payment_status === "COMPLETE") {
    const method = d.payment_method === "eft" ? "EFT" : "CARD";
    if (premium) await recordPayment(premium.id, method, d.pf_payment_id, "webhook:payfast");
    else await payOldestOpen(policy.id, method, d.pf_payment_id, "webhook:payfast");
  } else if (d.payment_status === "CANCELLED") {
    await db.policy.update({ where: { id: policy.id }, data: { payfastToken: null } });
    await audit(policy.tenantId, "webhook:payfast", "subscription.cancelled", policy.id);
  } else {
    await audit(policy.tenantId, "webhook:payfast", "itn." + (d.payment_status ?? "unknown").toLowerCase(), policy.id);
  }
  return new Response("ok", { status: 200 });
}
