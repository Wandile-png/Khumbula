import Link from "next/link";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/dates";
import { claimScreen } from "@/lib/rules";
import { updateClaim } from "../../actions";

const NEXT: Record<string, [string, string][]> = {
  LOGGED: [["DOCUMENTS", "Request documents"], ["DECLINED", "Decline"]],
  DOCUMENTS: [["APPROVED", "Approve"], ["DECLINED", "Decline"]],
  APPROVED: [["PAID", "Mark paid"]],
};
const ERR: Record<string, string> = { flow: "That step isn't allowed from the claim's current status.", docs: "Tick all three documents before approving." };

export default async function Claims({ params, searchParams }: { params: { tenant: string }; searchParams: { ok?: string; e?: string } }) {
  const t = await getTenant(params.tenant);
  const claims = await db.claim.findMany({ where: { tenantId: t.id }, include: { policy: { include: { member: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="stack">
      <h1>Claims</h1>
      {searchParams.ok && <p className="flash">Claim {searchParams.ok} updated.</p>}
      {searchParams.e && <p className="flash bad">{ERR[searchParams.e]}</p>}
      {claims.map((c) => {
        const screen = claimScreen({ status: c.policy.status, firstPaidAt: c.policy.firstPaidAt, waitingEndsAt: c.policy.waitingEndsAt, dateOfDeath: c.dateOfDeath, cause: c.cause });
        return (
          <form key={c.id} action={updateClaim.bind(null, t.slug)} className="panel stack">
            <input type="hidden" name="claimId" value={c.id} />
            <div className="row between">
              <div><b className="mono">{c.number}</b> · {c.deceased} <span className="muted">({c.relation})</span><div className="muted small">Died {formatDate(c.dateOfDeath)}, {c.cause.toLowerCase()} · policy <Link href={`/${t.slug}/admin/policies/${c.policyId}`} className="mono">{c.policy.policyNumber}</Link> · logged {formatDate(c.createdAt)}</div></div>
              <span className={`chip s-${c.status}`}>{c.status.toLowerCase()}</span>
            </div>
            <p className="small" style={{ color: screen.covered ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{screen.covered ? "Likely covered" : "Check cover"}: {screen.reason}</p>
            <div className="row small">
              <label className="row" style={{ gap: 6 }}><input type="checkbox" name="docDha1663" defaultChecked={c.docDha1663} /> DHA-1663 notification</label>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" name="docDeathCert" defaultChecked={c.docDeathCert} /> Death certificate</label>
              <label className="row" style={{ gap: 6 }}><input type="checkbox" name="docIds" defaultChecked={c.docIds} /> Certified IDs</label>
            </div>
            <label className="f">Notes<textarea id={`notes-${c.id}`} name="notes" rows={2} defaultValue={c.notes} /></label>
            <div className="row">
              <button className="btn ghost sm" type="submit">Save</button>
              {(NEXT[c.status] ?? []).map(([to, label]) => <button key={to} className="btn sm" type="submit" name="to" value={to}>{label}</button>)}
            </div>
          </form>
        );
      })}
      {!claims.length && <p className="muted">No claims logged.</p>}
    </div>
  );
}
