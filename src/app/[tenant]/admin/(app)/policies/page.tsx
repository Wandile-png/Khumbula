import Link from "next/link";
import { Prisma, PolicyStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { formatRand } from "@/lib/money";
import { formatDate, ordinal } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";

const STATUSES: PolicyStatus[] = ["PENDING", "WAITING", "ACTIVE", "ARREARS", "LAPSED", "CANCELLED"];

export default async function Policies({ params, searchParams }: { params: { tenant: string }; searchParams: { status?: string; q?: string } }) {
  const t = await getTenant(params.tenant);
  const status = STATUSES.includes(searchParams.status as PolicyStatus) ? (searchParams.status as PolicyStatus) : undefined;
  const q = (searchParams.q ?? "").trim();
  const where: Prisma.PolicyWhereInput = {
    tenantId: t.id,
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ policyNumber: { contains: q, mode: "insensitive" } }, { member: { lastName: { contains: q, mode: "insensitive" } } }, { member: { firstName: { contains: q, mode: "insensitive" } } }, { member: { phone: { contains: q.replace(/^0/, "") } } }] } : {}),
  };
  const policies = await db.policy.findMany({ where, include: { member: { include: { _count: { select: { documents: true } } } }, plan: true, _count: { select: { dependants: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  const href = (s?: string) => `/${t.slug}/admin/policies${s ? `?status=${s}` : ""}`;
  return (
    <div className="stack">
      <div className="row between">
        <h1>Policies</h1>
        <form className="row" action={`/${t.slug}/admin/policies`}>
          {status && <input type="hidden" name="status" value={status} />}
          <input id="q" name="q" type="text" defaultValue={q} placeholder="Name, policy or cellphone" style={{ width: 240 }} />
          <button className="btn ghost sm" type="submit">Search</button>
        </form>
      </div>
      <div className="filters">
        <Link href={href()} aria-current={!status ? "true" : undefined}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={href(s)} aria-current={status === s ? "true" : undefined}>{s[0] + s.slice(1).toLowerCase()}</Link>)}
      </div>
      <div className="tablewrap"><table className="num">
        <thead><tr><th>Policy</th><th>Member</th><th>Plan</th><th>Pays by</th><th className="r">Premium</th><th>Status</th></tr></thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.id}>
              <td className="mono"><Link href={`/${t.slug}/admin/policies/${p.id}`}>{p.policyNumber}</Link></td>
              <td>{p.member.firstName} {p.member.lastName}<div className="muted small">{displayPhone(p.member.phone)} · {1 + p._count.dependants} covered{p.member._count.documents ? "" : " · "}{!p.member._count.documents && <span style={{ color: "var(--warn)" }}>no ID</span>}</div></td>
              <td>{p.plan.name}</td>
              <td>{p.paymentMethod.toLowerCase()}<div className="muted small">{ordinal(p.debitDay)}</div></td>
              <td className="r">{formatRand(p.premiumCents)}</td>
              <td><span className={`chip s-${p.status}`}>{p.status.toLowerCase()}</span>{p.status === "WAITING" && p.waitingEndsAt && <div className="muted small">until {formatDate(p.waitingEndsAt)}</div>}</td>
            </tr>
          ))}
          {!policies.length && <tr><td colSpan={6} className="muted">No policies match.</td></tr>}
        </tbody>
      </table></div>
      {policies.length === 200 && <p className="muted small">Showing the latest 200. Use search to narrow down.</p>}
    </div>
  );
}
