import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { Footer, Masthead } from "@/components/Masthead";
import { GatewayForm } from "@/components/GatewayForm";
import { payfastOnceOff } from "@/lib/checkout";
import { formatRand } from "@/lib/money";
import { formatDate } from "@/lib/dates";

/** Pay link sent by SMS/WhatsApp for EFT members and missed premiums. */
export default async function PayPremium({ params }: { params: { tenant: string; premiumId: string } }) {
  const t = await getTenant(params.tenant);
  const pr = await db.premium.findUnique({ where: { id: params.premiumId }, include: { policy: { include: { member: true } } } });
  if (!pr || pr.policy.tenantId !== t.id) notFound();
  const paid = pr.status === "PAID";
  return (
    <>
      <Masthead tenant={t} />
      <main className="page wrap">
        <div className="narrow stack">
          <h1>Pay your premium</h1>
          <div className="panel summary num">
            <div><span className="muted">Policy</span><span className="mono">{pr.policy.policyNumber}</span></div>
            <div><span className="muted">Member</span><span>{pr.policy.member.firstName} {pr.policy.member.lastName[0]}.</span></div>
            <div><span className="muted">Due</span><span>{formatDate(pr.dueDate)}</span></div>
            <div><span className="muted">Amount</span><span>{formatRand(pr.amountCents)}</span></div>
          </div>
          {paid ? (
            <p className="flash">This premium is already paid. Thank you.</p>
          ) : (
            <div className="stack-s">
              <GatewayForm {...payfastOnceOff(t, pr.policy, pr, "eft")} label="Pay with Instant EFT" />
              <GatewayForm {...payfastOnceOff(t, pr.policy, pr, "cc")} label="Pay with card" />
            </div>
          )}
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
