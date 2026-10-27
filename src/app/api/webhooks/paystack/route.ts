import { db } from "@/lib/db";
import { verifyPaystackSignature } from "@/lib/payments/paystack";
import { payOldestOpen, recordPayment } from "@/lib/policies";
import { audit } from "@/lib/audit";

type ChargeEvent = {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    metadata?: { policy?: string; premiumId?: string } | string;
    authorization?: { authorization_code: string; reusable: boolean };
    customer?: { email: string };
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) return new Response("bad signature", { status: 401 });
  const evt = JSON.parse(raw) as ChargeEvent;
  if (evt.event !== "charge.success") return new Response("ignored", { status: 200 });

  const meta = typeof evt.data.metadata === "object" && evt.data.metadata ? evt.data.metadata : {};
  const policy = meta.policy ? await db.policy.findUnique({ where: { policyNumber: meta.policy } }) : null;
  if (!policy) return new Response("unknown policy", { status: 200 });

  const auth = evt.data.authorization;
  if (auth?.reusable && auth.authorization_code !== policy.paystackAuthCode) {
    await db.policy.update({ where: { id: policy.id }, data: { paystackAuthCode: auth.authorization_code, paystackEmail: evt.data.customer?.email ?? policy.paystackEmail } });
  }
  const premium = meta.premiumId ? await db.premium.findUnique({ where: { id: meta.premiumId } }) : null;
  if (premium && Math.abs(evt.data.amount - premium.amountCents) > 1) {
    await audit(policy.tenantId, "webhook:paystack", "charge.amount_mismatch", policy.id, { reference: evt.data.reference });
    return new Response("amount mismatch", { status: 200 });
  }
  if (premium) await recordPayment(premium.id, "CARD", evt.data.reference, "webhook:paystack");
  else await payOldestOpen(policy.id, "CARD", evt.data.reference, "webhook:paystack");
  return new Response("ok", { status: 200 });
}
