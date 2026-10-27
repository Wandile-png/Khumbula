import Link from "next/link";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { requireMember } from "@/lib/auth";
import { Footer, Masthead } from "@/components/Masthead";
import { formatRand } from "@/lib/money";
import { formatDate, isoDate, nextDebitOnOrAfter, ordinal, todaySA } from "@/lib/dates";
import { logClaim, logout } from "./actions";

const STATUS_TEXT: Record<string, string> = { PENDING: "Awaiting first premium", WAITING: "Waiting period", ACTIVE: "Covered", ARREARS: "In arrears", LAPSED: "Lapsed", CANCELLED: "Cancelled" };
const METHOD_TEXT: Record<string, string> = { DEBICHECK: "Debit order", CARD: "Card", EFT: "Instant EFT", CASH: "Cash" };

export default async function Portal({ params, searchParams }: { params: { tenant: string }; searchParams: { claimed?: string; e?: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireMember(t.id, t.slug);
  const member = await db.member.findUniqueOrThrow({ where: { id: s.memberId } });
  const policies = await db.policy.findMany({
    where: { memberId: member.id, tenantId: t.id },
    include: { plan: true, dependants: true, beneficiary: true, premiums: { orderBy: { dueDate: "desc" }, take: 12 }, claims: { orderBy: { createdAt: "desc" } }, mandate: true },
    orderBy: { createdAt: "desc" },
  });
  const today = todaySA();

  return (
    <>
      <Masthead tenant={t} active="portal" />
      <main className="page wrap">
        <div className="narrow stack">
          <div className="row between">
            <div className="stack-s" style={{ gap: 2 }}><span className="eyebrow">My policy</span><h1>Hello, {member.firstName}</h1></div>
            <form action={logout.bind(null, t.slug)}><button className="btn ghost sm" type="submit">Sign out</button></form>
          </div>
          {searchParams.claimed && <p className="flash">Claim {searchParams.claimed} is logged. We're sorry for your loss. Our team will contact you about the documents.</p>}
          {searchParams.e === "date" && <p className="flash bad">Enter a date of death that isn't in the future.</p>}

          {policies.map((p) => {
            const open = p.premiums.filter((x) => x.status === "MISSED" || (x.status === "DUE" && x.dueDate <= today));
            const pct = p.firstPaidAt && p.waitingEndsAt ? Math.min(100, Math.max(0, ((today.getTime() - p.firstPaidAt.getTime()) / (p.waitingEndsAt.getTime() - p.firstPaidAt.getTime())) * 100)) : 0;
            const people = [`${member.firstName} ${member.lastName}|Main member`, ...p.dependants.map((d) => `${d.name}|${d.relation}`)];
            return (
              <section key={p.id} className="stack">
                <div className="policy">
                  <div className="row between"><span className="caps" style={{ color: "var(--accent)" }}>{t.name.toUpperCase()}</span><span className={`chip s-${p.status}`} style={{ background: "rgba(255,255,255,.92)" }}>{STATUS_TEXT[p.status]}</span></div>
                  <div className="pn">{p.policyNumber}</div>
                  <div className="row between"><div><div className="small" style={{ opacity: 0.75 }}>{p.plan.name}</div><b className="num">{formatRand(p.premiumCents)}/mo</b></div><div style={{ textAlign: "right" }}><div className="small" style={{ opacity: 0.75 }}>Pays by</div><b>{METHOD_TEXT[p.paymentMethod]}, {ordinal(p.debitDay)}</b></div></div>
                  {p.status === "WAITING" && p.waitingEndsAt && (
                    <div className="stack-s" style={{ gap: 4 }}><div className="meter"><i style={{ width: `${pct}%` }} /></div><span className="small" style={{ opacity: 0.85 }}>Natural-death cover starts {formatDate(p.waitingEndsAt)}</span></div>
                  )}
                </div>

                {open.length > 0 ? (
                  <div className="panel stack-s" style={{ borderColor: "var(--warn)" }}>
                    <b>{open.length === 1 ? "One premium is unpaid" : `${open.length} premiums are unpaid`}</b>
                    <p className="muted small">{p.status === "LAPSED" ? "Your policy has lapsed. Call us to reinstate it." : "Pay now to keep your cover."}</p>
                    {open.map((x) => (
                      <div key={x.id} className="row between"><span className="num">{formatDate(x.dueDate)} · {formatRand(x.amountCents)}</span><Link className="btn sm" href={`/${t.slug}/pay/${x.id}`}>Pay</Link></div>
                    ))}
                  </div>
                ) : (
                  p.status !== "CANCELLED" && <div className="panel row between"><div><span className="muted small">Next premium</span><div><b className="num">{formatRand(p.premiumCents)}</b> on {formatDate(nextDebitOnOrAfter(today, p.debitDay) < p.startDate ? p.startDate : nextDebitOnOrAfter(today, p.debitDay))}</div></div></div>
                )}
                {p.mandate && p.mandate.status === "REQUESTED" && <p className="note">Your DebiCheck mandate is waiting for approval on your banking app ({p.mandate.bank} ••{p.mandate.accountLast4}).</p>}

                <div className="panel stack">
                  <h3>People covered</h3>
                  <div className="summary">{people.map((x) => { const [n, r] = x.split("|"); return <div key={x}><span>{n}</span><span className="muted" style={{ fontWeight: 400 }}>{r}</span></div>; })}</div>
                  {p.beneficiary && <><hr /><div className="summary"><div><span className="muted">Beneficiary</span><span>{p.beneficiary.name}{p.beneficiary.relation ? ` (${p.beneficiary.relation})` : ""}</span></div></div></>}
                </div>

                <div className="panel stack">
                  <h3>Claims</h3>
                  {p.claims.map((c) => (
                    <div key={c.id} className="row between"><div><b className="mono">{c.number}</b> · {c.deceased}<div className="muted small">Logged {formatDate(c.createdAt)}</div></div><span className={`chip s-${c.status}`}>{c.status[0] + c.status.slice(1).toLowerCase()}</span></div>
                  ))}
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Report a death</summary>
                    <form action={logClaim.bind(null, t.slug)} className="stack" style={{ marginTop: 12 }}>
                      <input type="hidden" name="policyId" value={p.id} />
                      <label className="f">Who passed away?<select id={`who-${p.id}`} name="who">{people.map((x) => <option key={x} value={x}>{x.replace("|", " – ")}</option>)}</select></label>
                      <div className="grid2">
                        <label className="f">Date of death<input id={`date-${p.id}`} name="date" type="date" max={isoDate(today)} defaultValue={isoDate(today)} required /></label>
                        <label className="f">Cause<select id={`cause-${p.id}`} name="cause"><option value="NATURAL">Natural causes</option><option value="ACCIDENTAL">Accident</option></select></label>
                      </div>
                      <label className="f">Anything we should know <span className="hint">Optional</span><textarea id={`notes-${p.id}`} name="notes" rows={2} /></label>
                      <p className="note">You'll need the DHA-1663 notification of death, the abridged death certificate, and certified ID copies of the deceased and the claimant.</p>
                      <button className="btn" type="submit">Log claim</button>
                    </form>
                  </details>
                </div>

                <div className="panel stack-s">
                  <h3>Payment history</h3>
                  <div className="summary num">
                    {p.premiums.map((x) => (
                      <div key={x.id}><span>{formatDate(x.dueDate)}</span><span><span className={`chip s-${x.status}`}>{x.status[0] + x.status.slice(1).toLowerCase()}</span> {formatRand(x.amountCents)}</span></div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
          {!policies.length && <p className="muted">No policies found for your ID number.</p>}
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
