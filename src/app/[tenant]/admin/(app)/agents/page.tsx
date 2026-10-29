import { db } from "@/lib/db";
import { appUrl, getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { agentStats } from "@/lib/agents";
import { formatRand } from "@/lib/money";
import { CopyButton } from "@/components/CopyButton";
import { createAgent, resetAgentPassword, setAgentActive } from "../../actions";

const ERR: Record<string, string> = {
  fields: "Add the agent's name, a valid email and a password of at least 8 characters.",
  email: "Someone already signs in with that email. Use a different one.",
  pw: "Passwords need at least 8 characters.",
};

export default async function Agents({ params, searchParams }: { params: { tenant: string }; searchParams: { ok?: string; e?: string; pw?: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireStaff(t.id, t.slug);
  const canEdit = s.role === "OWNER" || s.role === "ADMIN";
  const agents = await db.staffUser.findMany({ where: { tenantId: t.id, role: "AGENT" }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const stats = await agentStats(t.id);
  const online = await db.policy.count({ where: { tenantId: t.id, agentId: null } });
  const zero = { sold: 0, thisMonth: 0, inForce: 0, premiumCents: 0, behind: 0, pending: 0 };

  return (
    <div className="stack">
      <div className="row between">
        <div className="stack-s" style={{ gap: 2 }}><span className="eyebrow">Sales</span><h1>Agents</h1></div>
        <span className="muted small">{online} {online === 1 ? "policy" : "policies"} signed up online without an agent</span>
      </div>
      {searchParams.ok && <p className="flash">Agent {searchParams.ok} created. Give them their email, password and the link below.</p>}
      {searchParams.pw && <p className="flash">Password for {searchParams.pw} changed.</p>}
      {searchParams.e && <p className="flash bad">{ERR[searchParams.e]}</p>}

      <div className="tablewrap"><table className="num">
        <thead><tr><th>Agent</th><th className="r">Sold</th><th className="r">This month</th><th className="r">In force</th><th className="r">Monthly premium</th><th className="r">Behind</th><th>Sign-up link</th></tr></thead>
        <tbody>
          {agents.map((a) => {
            const st = stats.get(a.id) ?? zero;
            const link = appUrl(`/${t.slug}?agent=${a.agentCode}`);
            return (
              <tr key={a.id} style={a.active ? undefined : { opacity: 0.55 }}>
                <td><b>{a.name}</b> <span className="mono muted">{a.agentCode}</span><div className="muted small">{a.email}{a.phone ? ` · ${a.phone}` : ""}{a.active ? "" : " · deactivated"}</div></td>
                <td className="r">{st.sold}</td>
                <td className="r">{st.thisMonth}</td>
                <td className="r">{st.inForce}</td>
                <td className="r">{formatRand(st.premiumCents)}</td>
                <td className="r" style={st.behind ? { color: "var(--warn)", fontWeight: 600 } : undefined}>{st.behind}</td>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <CopyButton text={link} />
                    {canEdit && (
                      <form action={setAgentActive.bind(null, t.slug)}>
                        <input type="hidden" name="agentId" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? "0" : "1"} />
                        <button className="btn ghost sm" type="submit">{a.active ? "Deactivate" : "Reactivate"}</button>
                      </form>
                    )}
                  </div>
                  {canEdit && (
                    <details style={{ marginTop: 6 }}>
                      <summary className="small muted" style={{ cursor: "pointer" }}>Change password</summary>
                      <form action={resetAgentPassword.bind(null, t.slug)} className="row" style={{ marginTop: 6, gap: 6 }}>
                        <input type="hidden" name="agentId" value={a.id} />
                        <input id={`pw-${a.id}`} name="password" type="text" minLength={8} placeholder="New password" style={{ maxWidth: 160 }} />
                        <button className="btn sm" type="submit">Save</button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
          {!agents.length && <tr><td colSpan={7} className="muted">No agents yet. Add your first agent below.</td></tr>}
        </tbody>
      </table></div>

      {canEdit && (
        <form action={createAgent.bind(null, t.slug)} className="panel stack" style={{ maxWidth: 640 }}>
          <h3>Add an agent</h3>
          <p className="muted small">The agent signs in at the same staff login page and only sees their own clients. Their code is created for you.</p>
          <div className="grid2">
            <label className="f">Full name<input id="agent-name" name="name" type="text" required /></label>
            <label className="f">Cellphone<input id="agent-phone" name="phone" type="tel" /></label>
            <label className="f">Email for signing in<input id="agent-email" name="email" type="email" required /></label>
            <label className="f">Starting password <span className="hint">At least 8 characters</span><input id="agent-password" name="password" type="text" minLength={8} required /></label>
          </div>
          <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>Add agent</button>
        </form>
      )}
      <p className="note">Commission isn't calculated here. Use "In force" and "Monthly premium" for paying commission, and "Behind" to see clients who may lapse.</p>
    </div>
  );
}
