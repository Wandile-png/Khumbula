import Link from "next/link";
import { db } from "@/lib/db";
import { appUrl, getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { agentStats } from "@/lib/agents";
import { formatRand } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { displayPhone } from "@/lib/phone";
import { Masthead } from "@/components/Masthead";
import { CopyButton } from "@/components/CopyButton";
import { staffLogout } from "../admin/actions";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = { PENDING: "Awaiting first premium", WAITING: "Waiting period", ACTIVE: "Covered", ARREARS: "In arrears", LAPSED: "Lapsed", CANCELLED: "Cancelled" };

export default async function AgentHome({ params }: { params: { tenant: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireStaff(t.id, t.slug, ["AGENT"]);
  const me = await db.staffUser.findUniqueOrThrow({ where: { id: s.staffId } });
  const st = (await agentStats(t.id, me.id)).get(me.id) ?? { sold: 0, thisMonth: 0, inForce: 0, premiumCents: 0, behind: 0, pending: 0 };
  const clients = await db.policy.findMany({
    where: { tenantId: t.id, agentId: me.id },
    include: { member: true, plan: true, _count: { select: { dependants: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const behind = clients.filter((c) => c.status === "ARREARS" || c.status === "PENDING");
  const link = appUrl(`/${t.slug}?agent=${me.agentCode}`);

  return (
    <>
      <Masthead tenant={t} />
      <main className="page wrap">
        <div className="container stack">
          <div className="row between">
            <div className="stack-s" style={{ gap: 2 }}>
              <span className="eyebrow">Agent {me.agentCode}</span>
              <h1>Hello, {me.name.split(" ")[0]}</h1>
            </div>
            <form action={staffLogout.bind(null, t.slug)}><button className="btn ghost sm" type="submit">Sign out</button></form>
          </div>

          <div className="kpis">
            <div className="kpi"><b>{st.thisMonth}</b><span>Sold this month</span></div>
            <div className="kpi"><b>{st.inForce}</b><span>Clients in force</span></div>
            <div className="kpi"><b>{formatRand(st.premiumCents, { whole: true })}</b><span>Monthly premium in force</span></div>
            <div className="kpi"><b style={st.behind ? { color: "var(--warn)" } : undefined}>{st.behind}</b><span>Clients behind on payments</span></div>
          </div>

          <section className="panel stack-s">
            <h3>Sign up a client</h3>
            <p className="muted small">Open the sign-up on your phone with the client, or send them your link. Either way the policy is credited to you.</p>
            <div className="row">
              <Link className="btn" href={`/${t.slug}/join?agent=${me.agentCode}`}>Sign up a client now</Link>
              <CopyButton text={link} label="Copy my link" />
            </div>
            <p className="mono small muted" style={{ wordBreak: "break-all" }}>{link}</p>
          </section>

          {behind.length > 0 && (
            <section className="panel stack-s" style={{ borderColor: "var(--warn)" }}>
              <h3>Call these clients</h3>
              <p className="muted small">They haven't paid yet or missed their last premium. A call now can stop the policy lapsing.</p>
              <div className="summary">
                {behind.map((c) => (
                  <div key={c.id}><span>{c.member.firstName} {c.member.lastName} · <span className="mono">{c.policyNumber}</span></span><span>{displayPhone(c.member.phone)}</span></div>
                ))}
              </div>
            </section>
          )}

          <h2>My clients</h2>
          <div className="tablewrap"><table className="num">
            <thead><tr><th>Client</th><th>Plan</th><th>Joined</th><th className="r">Premium</th><th>Status</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.member.firstName} {c.member.lastName}<div className="muted small"><span className="mono">{c.policyNumber}</span> · {displayPhone(c.member.phone)} · {1 + c._count.dependants} covered</div></td>
                  <td>{c.plan.name}</td>
                  <td>{formatDate(c.createdAt)}</td>
                  <td className="r">{formatRand(c.premiumCents)}</td>
                  <td><span className={`chip s-${c.status}`}>{STATUS_TEXT[c.status]}</span></td>
                </tr>
              ))}
              {!clients.length && <tr><td colSpan={5} className="muted">No clients yet. Your first sign-up will appear here.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </main>
    </>
  );
}
