import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createStaff, updateStaff } from "../../actions";

const ROLES = [
  ["OWNER", "Owner", "Everything, including settings, premiums and adding or removing users"],
  ["ADMIN", "Admin", "Policies, payments, claims, agents and messages. Not settings or users"],
  ["CLAIMS", "Claims", "Works on claims only"],
  ["VIEWER", "View only", "Can look at everything, can't change anything"],
] as const;
const ROLE_NAME: Record<string, string> = Object.fromEntries(ROLES.map(([k, n]) => [k, n]));

const OK: Record<string, string> = {
  added: "User added. Give them the sign-in link, their email and password.",
  role: "Access level changed.",
  deactivate: "Access removed. They are signed out straight away.",
  activate: "Access restored.",
  pw: "Password changed.",
};
const ERR: Record<string, string> = {
  fields: "Add a name, a valid email, an access level and a password of at least 10 characters.",
  email: "Someone already signs in with that email.",
  lastowner: "There must always be at least one active owner. Make someone else an owner first.",
  self: "You can't remove your own access.",
  pw: "Passwords need at least 10 characters.",
};

export default async function Users({ params, searchParams }: { params: { tenant: string }; searchParams: { ok?: string; e?: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireStaff(t.id, t.slug);
  const isOwner = s.role === "OWNER";
  const users = await db.staffUser.findMany({ where: { tenantId: t.id, role: { not: "AGENT" } }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });

  return (
    <div className="stack">
      <div className="stack-s" style={{ gap: 2 }}><span className="eyebrow">Office staff</span><h1>Users</h1></div>
      {searchParams.ok && <p className="flash">{OK[searchParams.ok]}</p>}
      {searchParams.e && <p className="flash bad">{ERR[searchParams.e]}</p>}
      {!isOwner && <p className="note">Only an owner can add users or change access.</p>}

      <div className="tablewrap"><table>
        <thead><tr><th>Person</th><th>Access</th><th>Added</th>{isOwner && <th></th>}</tr></thead>
        <tbody>
          {users.map((u) => {
            const me = u.id === s.staffId;
            return (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td><b>{u.name}</b>{me && <span className="muted"> (you)</span>}<div className="muted small">{u.email}{u.active ? "" : " · access removed"}</div></td>
                <td>
                  {isOwner ? (
                    <form action={updateStaff.bind(null, t.slug)} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="action" value="role" />
                      <select id={`role-${u.id}`} name="role" defaultValue={u.role} aria-label={`Access for ${u.name}`} style={{ width: "auto" }}>
                        {ROLES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                      </select>
                      <button className="btn ghost sm" type="submit">Save</button>
                    </form>
                  ) : ROLE_NAME[u.role]}
                </td>
                <td className="small">{formatDate(u.createdAt)}</td>
                {isOwner && (
                  <td>
                    {!me && (
                      <form action={updateStaff.bind(null, t.slug)}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="action" value={u.active ? "deactivate" : "activate"} />
                        <button className="btn ghost sm" type="submit" style={u.active ? { color: "var(--bad)" } : undefined}>{u.active ? "Remove access" : "Restore access"}</button>
                      </form>
                    )}
                    <details style={{ marginTop: 6 }}>
                      <summary className="small muted" style={{ cursor: "pointer" }}>Change password</summary>
                      <form action={updateStaff.bind(null, t.slug)} className="row" style={{ marginTop: 6, gap: 6 }}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="action" value="password" />
                        <input id={`pw-${u.id}`} name="password" type="text" minLength={10} placeholder="New password" style={{ maxWidth: 170 }} />
                        <button className="btn sm" type="submit">Save</button>
                      </form>
                    </details>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table></div>

      {isOwner && (
        <form action={createStaff.bind(null, t.slug)} className="panel stack" style={{ maxWidth: 640 }}>
          <h3>Add a user</h3>
          <div className="grid2">
            <label className="f">Full name<input id="u-name" name="name" type="text" required /></label>
            <label className="f">Email for signing in<input id="u-email" name="email" type="email" required /></label>
            <label className="f">Starting password <span className="hint">At least 10 characters. Ask them to keep it private.</span><input id="u-password" name="password" type="text" minLength={10} required /></label>
          </div>
          <fieldset className="stack-s" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Access level</legend>
            {ROLES.map(([k, n, d]) => (
              <label key={k} className="opt">
                <input type="radio" name="role" value={k} defaultChecked={k === "ADMIN"} />
                <span className="stack-s" style={{ gap: 2 }}><b>{n}</b><span className="muted small">{d}</span></span>
              </label>
            ))}
          </fieldset>
          <button className="btn" type="submit" style={{ alignSelf: "flex-start" }}>Add user</button>
          <p className="muted small">They sign in at /{t.slug}/admin/login. Sales agents are added under Agents instead.</p>
        </form>
      )}
    </div>
  );
}
