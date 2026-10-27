import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readLink } from "@/lib/auth";
import { initializeCard, paystackEmailFor } from "@/lib/payments/paystack";
import { appUrl } from "@/lib/tenant";
import { isoDate } from "@/lib/dates";

export async function GET(req: Request, { params }: { params: { tenant: string } }) {
  const token = new URL(req.url).searchParams.get("t");
  const link = await readLink<{ policyId: string }>(token);
  if (!link) return NextResponse.json({ error: "This link has expired." }, { status: 400 });
  const p = await db.policy.findUnique({ where: { id: link.policyId }, include: { member: true, tenant: true, premiums: { where: { status: { in: ["DUE", "MISSED"] } }, orderBy: { dueDate: "asc" }, take: 1 } } });
  if (!p || p.tenant.slug !== params.tenant) return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  const pr = p.premiums[0];
  if (!pr) return NextResponse.redirect(appUrl(`/${params.tenant}/portal`));
  const email = paystackEmailFor(p.policyNumber, p.member.email);
  const init = await initializeCard({
    email,
    amountCents: pr.amountCents,
    reference: `${p.policyNumber}-${isoDate(pr.dueDate)}-init-${Date.now().toString(36)}`,
    callbackUrl: appUrl(`/${params.tenant}/pay/return?policy=${p.policyNumber}`),
    metadata: { policy: p.policyNumber, premiumId: pr.id, tenant: params.tenant },
  });
  await db.policy.update({ where: { id: p.id }, data: { paystackEmail: email } });
  return NextResponse.redirect(init.authorization_url);
}
