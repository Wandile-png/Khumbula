import Link from "next/link";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { formatRand } from "@/lib/money";
import { addDays, formatDate, todaySA } from "@/lib/dates";
import { runBillingNow } from "../actions";

const METHOD_TEXT: Record<string, string> = { DEBICHECK: "Debit order", CARD: "Card", EFT: "Instant EFT", CASH: "Cash" };

export default async function Dashboard({ params, searchParams }: { params: { tenant: string }; searchParams: { ran?: string; denied?: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireStaff(t.id, t.slug);
  const today = todaySA();
  const inForce = { tenantId: t.id, status: { in: ["WAITING", "ACTIVE", "ARREARS"] as ("WAITING" | "ACTIVE" | "ARREARS")[] } };

  const [byStatus, book, dependants, unpaid, openClaims, byMethod, dueWeek, recent, queued] = await Promise.all([
    db.policy.groupBy({ by: ["status"], where: { tenantId: t.id }, _count: true }),
    db.policy.aggregate({ where: inForce, _sum: { premiumCents: true }, _count: true }),
    db.dependant.count({ where: { policy: inForce } }),
    db.premium.aggregate({ where: { status: "MISSED", policy: { tenantId: t.id, status: { not: "CANCELLED" } } }, _sum: { amountCents: true } }),
    db.claim.count({ where: { tenantId: t.id, status: { in: ["LOGGED", "DOCUMENTS", "APPROVED"] } } }),
    db.policy.groupBy({ by: ["paymentMethod"], where: inForce, _sum: { premiumCents: true } }),
    db.premium.aggregate({ where: { status: "DUE", dueDate: { gte: today, lte: addDays(today, 7) }, policy: { tenantId: t.id } }, _sum: { amountCents: true }, _count: true }),
    db.policy.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: "desc" }, take: 6, include: { member: true, plan: true } }),
    db.message.count({ where: { tenantId: t.id, status: "QUEUED" } }),
  ]);
  const count = (st: string) => byStatus.find((x) => x.status === st)?._count ?? 0;
  const maxMethod = Math.max(1, ...byMethod.map((m) => m._sum.premiumCents ?? 0));

  return (
    <div className="stack">
      {searchParams.ran && <p className="flash">Billing run finished. Statuses and reminders are up to date.</p>}
      {searchParams.denied && <p className="flash bad">Your role can't do that. Ask the owner.</p>}
      <div className="row between">
        <div className="stack-s" style={{ gap: 2 }}><span className="eyebrow">Administration</span><h1>{t.name}</h1></div>
        {s.role === "OWNER" && <form action={runBillingNow.bind(null, t.slug)}><button className="btn ghost sm" type="submit">Run billing now</button></form>}
      </div>
      <div className="kpis">
        <div className="kpi"><b>{book._count}</b><span>Policies in force</span></div>
        <div className="kpi"><b>{book._count + dependants}</b><span>Lives covered</span></div>
        <div className="kpi"><b>{formatRand(book._sum.premiumCents ?? 0, { whole: true })}</b><span>Monthly premium book</span></div>
        <div className="kpi"><b style={{ color: "var(--warn)" }}>{formatRand(unpaid._sum.amountCents ?? 0, { whole: true })}</b><span>Unpaid premiums</span></div>
        <div className="kpi"><b>{formatRand(dueWeek._sum.amountCents ?? 0, { whole: true })}</b><span>Due in the next 7 days ({dueWeek._count})</span></div>
        <div className="kpi"><b>{openClaims}</b><span>Open claims</span></div>
      </div>
      <div className="cols">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="row between"><h2>Policy status</h2><Link href={`/${t.slug}/admin/policies`} className="small">All policies</Link></div>
          <div className="filters">
            {[["PENDING", "Awaiting first premium"], ["WAITING", "Waiting period"], ["ACTIVE", "Covered"], ["ARREARS", "In arrears"], ["LAPSED", "Lapsed"]].map(([k, l]) => (
              <Link key={k} href={`/${t.slug}/admin/policies?status=${k}`}>{l} {count(k)}</Link>
            ))}
          </div>
          <h2>Latest sign-ups</h2>
          <div className="tablewrap"><table className="num">
            <thead><tr><th>Policy</th><th>Member</th><th>Plan</th><th>Joined</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id}><td className="mono"><Link href={`/${t.slug}/admin/policies/${p.id}`}>{p.policyNumber}</Link></td><td>{p.member.firstName} {p.member.lastName}</td><td>{p.plan.name}</td><td>{formatDate(p.createdAt)}</td><td><span className={`chip s-${p.status}`}>{p.status.toLowerCase()}</span></td></tr>
              ))}
              {!recent.length && <tr><td colSpan={5} className="muted">No sign-ups yet. Share your sign-up link: /{t.slug}/join</td></tr>}
            </tbody>
          </table></div>
        </div>
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="panel stack">
            <h3>Collections by method</h3>
            {byMethod.map((m) => (
              <div key={m.paymentMethod} style={{ display: "grid", gridTemplateColumns: "100px 1fr 80px", gap: 8, alignItems: "center" }} className="small num">
                <span>{METHOD_TEXT[m.paymentMethod]}</span>
                <i style={{ display: "block", height: 10, borderRadius: 5, background: "var(--accent)", width: `${((m._sum.premiumCents ?? 0) / maxMethod) * 100}%` }} />
                <span style={{ textAlign: "right" }}>{formatRand(m._sum.premiumCents ?? 0, { whole: true })}</span>
              </div>
            ))}
            {!byMethod.length && <p className="muted small">No policies in force yet.</p>}
          </div>
          <div className="panel stack-s">
            <h3>Messages</h3>
            <p className="small muted">{queued} waiting to send. Reminders go out automatically every morning.</p>
            <Link href={`/${t.slug}/admin/messages`} className="btn ghost sm" style={{ alignSelf: "flex-start" }}>Open messages</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
