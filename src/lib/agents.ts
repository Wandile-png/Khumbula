import { db } from "./db";
import { todaySA } from "./dates";

/** Sales figures per agent. "In force" = waiting, covered or in arrears. */
export async function agentStats(tenantId: string, agentId?: string) {
  const today = todaySA();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const policies = await db.policy.findMany({
    where: { tenantId, agentId: agentId ? agentId : { not: null } },
    select: { agentId: true, status: true, premiumCents: true, createdAt: true },
  });
  const by = new Map<string, { sold: number; thisMonth: number; inForce: number; premiumCents: number; behind: number; pending: number }>();
  for (const p of policies) {
    const k = p.agentId!;
    const s = by.get(k) ?? { sold: 0, thisMonth: 0, inForce: 0, premiumCents: 0, behind: 0, pending: 0 };
    s.sold++;
    if (p.createdAt >= monthStart) s.thisMonth++;
    if (["WAITING", "ACTIVE", "ARREARS"].includes(p.status)) { s.inForce++; s.premiumCents += p.premiumCents; }
    if (p.status === "ARREARS" || p.status === "LAPSED") s.behind++;
    if (p.status === "PENDING") s.pending++;
    by.set(k, s);
  }
  return by;
}
