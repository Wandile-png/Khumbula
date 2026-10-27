import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { readLink, signLink } from "@/lib/auth";
import { Footer, Masthead } from "@/components/Masthead";
import { GatewayForm } from "@/components/GatewayForm";
import { payfastOnceOff, payfastSubscription } from "@/lib/checkout";
import { formatRand } from "@/lib/money";
import { formatDate, ordinal } from "@/lib/dates";
import { waitingEnds } from "@/lib/rules";

export default async function Done({ params, searchParams }: { params: { tenant: string }; searchParams: { t?: string } }) {
  const t = await getTenant(params.tenant);
  const link = await readLink<{ policyId: string }>(searchParams.t);
  if (!link) notFound();
  const p = await db.policy.findFirst({ where: { id: link.policyId, tenantId: t.id }, include: { member: true, plan: true, premiums: { orderBy: { dueDate: "asc" } }, mandate: true } });
  if (!p) notFound();
  const first = p.premiums[0];
  const coverFrom = waitingEnds(p.startDate, t.waitingMonths);
  const paystackToken = p.paymentMethod === "CARD" && t.cardGateway === "PAYSTACK" ? await signLink({ policyId: p.id }, 60) : null;

  return (
    <>
      <Masthead tenant={t} active="join" />
      <main className="page wrap">
        <div className="narrow stack">
          <div className="stack-s">
            <span className="eyebrow">Policy created</span>
            <h1>Welcome, {p.member.firstName}</h1>
            <p className="muted">Your policy number is <b className="mono">{p.policyNumber}</b>. Keep it for payments and claims. We've sent the details to your phone.</p>
          </div>
          <div className="policy">
            <div className="row between"><span className="caps" style={{ color: "var(--accent)" }}>{t.name.toUpperCase()}</span><span className="chip s-PENDING">Awaiting first premium</span></div>
            <div className="pn">{p.policyNumber}</div>
            <div className="row between"><div><div className="small" style={{ opacity: 0.75 }}>Main member</div><b>{p.member.firstName} {p.member.lastName}</b></div><div style={{ textAlign: "right" }}><div className="small" style={{ opacity: 0.75 }}>{p.plan.name}</div><b className="num">{formatRand(p.premiumCents)}/mo</b></div></div>
          </div>

          <section className="panel stack">
            <h2>Next: your first premium</h2>
            <div className="summary num">
              <div><span className="muted">Amount</span><span>{formatRand(p.premiumCents)}</span></div>
              <div><span className="muted">Due</span><span>{formatDate(p.startDate)}, then the {ordinal(p.debitDay)} monthly</span></div>
              <div><span className="muted">Natural-death cover from</span><span>{formatDate(coverFrom)}</span></div>
            </div>
            {p.paymentMethod === "CARD" && t.cardGateway === "PAYFAST" && (
              <>
                <GatewayForm {...payfastSubscription(t, p)} label="Set up card payments with PayFast" />
                <p className="muted small">PayFast saves your card and charges {formatRand(p.premiumCents)} on {formatDate(p.startDate)} and every month after that.</p>
              </>
            )}
            {paystackToken && (
              <>
                <Link className="btn" href={`/api/${t.slug}/paystack/start?t=${encodeURIComponent(paystackToken)}`}>Pay first premium with Paystack</Link>
                <p className="muted small">Your card is saved securely by Paystack and charged on the {ordinal(p.debitDay)} each month.</p>
              </>
            )}
            {p.paymentMethod === "EFT" && first && (
              <>
                <GatewayForm {...payfastOnceOff(t, p, first, "eft")} label="Pay now with Instant EFT" />
                <p className="muted small">You can also pay later. We'll send a pay link 3 days before each due date.</p>
              </>
            )}
            {p.paymentMethod === "DEBICHECK" && (
              <p className="note">Your bank will send a DebiCheck request to your banking app or by SMS. Approve it so we can collect {formatRand(p.premiumCents)} from your {p.mandate?.bank} account ending {p.mandate?.accountLast4} on {formatDate(p.startDate)}.</p>
            )}
            {p.paymentMethod === "CASH" && (
              <p className="note">Pay {formatRand(p.premiumCents)} at our office{t.address ? ` (${t.address})` : ""} before {formatDate(p.startDate)}. Use <b className="mono">{p.policyNumber}</b> as your reference.</p>
            )}
          </section>
          <div className="row">
            <Link className="btn ghost" href={`/${t.slug}/portal`}>Go to my policy</Link>
          </div>
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
