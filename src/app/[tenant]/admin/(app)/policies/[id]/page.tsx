import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { formatRand } from "@/lib/money";
import { formatDate, ordinal } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { maskId, decrypt } from "@/lib/crypto";
import { cancelPolicy, recordCashPayment, setMandate } from "../../../actions";

const OK: Record<string, string> = { paid: "Payment recorded.", mandate: "Mandate updated.", cancelled: "Policy cancelled." };

export default async function PolicyDetail({ params, searchParams }: { params: { tenant: string; id: string }; searchParams: { ok?: string; e?: string } }) {
  const t = await getTenant(params.tenant);
  const p = await db.policy.findFirst({
    where: { id: params.id, tenantId: t.id },
    include: { member: true, plan: true, dependants: true, beneficiary: true, mandate: true, premiums: { orderBy: { dueDate: "desc" } }, claims: true, messages: { orderBy: { createdAt: "desc" }, take: 10 } },
  });
  if (!p) notFound();
  const open = p.premiums.filter((x) => x.status === "DUE" || x.status === "MISSED");
  return (
    <div className="stack">
      {searchParams.ok && <p className="flash">{OK[searchParams.ok]}</p>}
      {searchParams.e === "confirm" && <p className="flash bad">Type CANCEL to confirm cancelling the policy.</p>}
      <div className="row between">
        <div className="stack-s" style={{ gap: 2 }}><span className="eyebrow mono">{p.policyNumber}</span><h1>{p.member.firstName} {p.member.lastName}</h1></div>
        <span className={`chip s-${p.status}`}>{p.status.toLowerCase()}</span>
      </div>
      <div className="cols">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="panel summary num">
            <div><span className="muted">Plan</span><span>{p.plan.name}</span></div>
            <div><span className="muted">Premium</span><span>{formatRand(p.premiumCents)} on the {ordinal(p.debitDay)}</span></div>
            <div><span className="muted">Pays by</span><span>{p.paymentMethod.toLowerCase()}{p.payfastToken ? " · PayFast card saved" : ""}{p.paystackAuthCode ? " · Paystack card saved" : ""}</span></div>
            <div><span className="muted">First premium</span><span>{formatDate(p.startDate)}{p.firstPaidAt ? ` · paid ${formatDate(p.firstPaidAt)}` : " · not yet paid"}</span></div>
            <div><span className="muted">Waiting period ends</span><span>{p.waitingEndsAt ? formatDate(p.waitingEndsAt) : "After first payment"}</span></div>
            <div><span className="muted">ID number</span><span className="mono">{maskId(decrypt(p.member.idNumberEnc))}</span></div>
            <div><span className="muted">Cellphone</span><span>{displayPhone(p.member.phone)}</span></div>
            {p.member.email && <div><span className="muted">Email</span><span>{p.member.email}</span></div>}
            <div><span className="muted">Consent recorded</span><span>{formatDate(p.consentAt)}</span></div>
          </div>
          <div className="panel stack">
            <h3>People covered</h3>
            <div className="summary">
              <div><span>{p.member.firstName} {p.member.lastName}</span><span className="muted" style={{ fontWeight: 400 }}>Main member</span></div>
              {p.dependants.map((d) => <div key={d.id}><span>{d.name}</span><span className="muted" style={{ fontWeight: 400 }}>{d.relation}</span></div>)}
            </div>
            {p.beneficiary && <p className="small">Beneficiary: <b>{p.beneficiary.name}</b> ({p.beneficiary.relation || "relationship not given"}) · {displayPhone(p.beneficiary.phone)}</p>}
          </div>
          <div className="panel stack-s">
            <h3>Premiums</h3>
            <div className="tablewrap"><table className="num" style={{ minWidth: 420 }}>
              <thead><tr><th>Due</th><th className="r">Amount</th><th>Status</th><th>Reference</th></tr></thead>
              <tbody>{p.premiums.map((x) => <tr key={x.id}><td>{formatDate(x.dueDate)}</td><td className="r">{formatRand(x.amountCents)}</td><td><span className={`chip s-${x.status}`}>{x.status.toLowerCase()}</span>{x.lastError && <div className="err">{x.lastError}</div>}</td><td className="mono small">{x.gatewayRef ?? ""}</td></tr>)}</tbody>
            </table></div>
          </div>
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          {open.length > 0 && (
            <form action={recordCashPayment.bind(null, t.slug)} className="panel stack">
              <h3>Record a payment</h3>
              <p className="muted small">For cash at the branch or an EFT straight into your account.</p>
              <label className="f">Premium<select id="premiumId" name="premiumId">{open.map((x) => <option key={x.id} value={x.id}>{formatDate(x.dueDate)} · {formatRand(x.amountCents)}</option>)}</select></label>
              <label className="f">Receipt or reference<input id="reference" name="reference" type="text" /></label>
              <button className="btn" type="submit">Record payment</button>
            </form>
          )}
          {p.mandate && (
            <div className="panel stack">
              <h3>DebiCheck mandate</h3>
              <p className="small">{p.mandate.bank} {p.mandate.accountType.toLowerCase()} ••{p.mandate.accountLast4} · <span className={`chip s-${p.mandate.status}`}>{p.mandate.status.toLowerCase()}</span></p>
              {p.mandate.status === "REQUESTED" && (
                <div className="row">
                  <form action={setMandate.bind(null, t.slug)}><input type="hidden" name="policyId" value={p.id} /><input type="hidden" name="status" value="APPROVED" /><button className="btn sm" type="submit">Mark approved</button></form>
                  <form action={setMandate.bind(null, t.slug)}><input type="hidden" name="policyId" value={p.id} /><input type="hidden" name="status" value="DECLINED" /><button className="btn ghost sm" type="submit">Mark declined</button></form>
                </div>
              )}
            </div>
          )}
          <div className="panel stack-s">
            <h3>Messages</h3>
            {p.messages.map((m) => <div key={m.id} className="msg"><div className="row between small"><b>{m.template.replace("_", " ")}</b><span className={`chip s-${m.status}`}>{m.status.toLowerCase()}</span></div><div className="body">{m.body}</div></div>)}
            {!p.messages.length && <p className="muted small">None yet.</p>}
          </div>
          {p.status !== "CANCELLED" && (
            <form action={cancelPolicy.bind(null, t.slug)} className="panel stack">
              <h3>Cancel policy</h3>
              <input type="hidden" name="policyId" value={p.id} />
              <label className="f">Reason<input id="reason" name="reason" type="text" /></label>
              <label className="f">Type CANCEL to confirm<input id="confirm" name="confirm" type="text" autoComplete="off" /></label>
              <button className="btn ghost" type="submit" style={{ color: "var(--bad)" }}>Cancel this policy</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
