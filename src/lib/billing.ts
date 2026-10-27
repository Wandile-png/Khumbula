/**
 * Daily billing job. Safe to run more than once a day: every step is idempotent.
 *  1. Create premium rows for debit dates in the next 3 days
 *  2. Charge stored Paystack cards for premiums due today
 *  3. Mark premiums MISSED once they are unpaid `graceDays` after the due date
 *  4. Refresh every policy's status (WAITING → ACTIVE, ARREARS, LAPSED)
 *  5. Queue reminders, then send the queue
 */
import { db } from "./db";
import { addDays, debitDateIn, isoDate, todaySA } from "./dates";
import { chargeAuthorization, paystackEmailFor } from "./payments/paystack";
import { payLink, recordPayment, refreshStatus } from "./policies";
import { queueMessage, sendQueued } from "./messaging";

export async function runDaily(today = todaySA()) {
  const report = { premiumsCreated: 0, cardCharges: 0, cardFailures: 0, missed: 0, statusChecked: 0, queued: 0, sent: 0, failed: 0 };
  const tenants = await db.tenant.findMany();

  for (const tenant of tenants) {
    const policies = await db.policy.findMany({
      where: { tenantId: tenant.id, status: { notIn: ["CANCELLED"] } },
      include: { member: true, premiums: { orderBy: { dueDate: "desc" }, take: 1 } },
    });

    // 1. upcoming premiums
    for (const p of policies) {
      if (p.status === "LAPSED") continue;
      for (let i = 0; i <= 3; i++) {
        const d = addDays(today, i);
        const due = debitDateIn(d.getUTCFullYear(), d.getUTCMonth(), p.debitDay);
        if (isoDate(due) !== isoDate(d) || due < p.startDate) continue;
        const exists = await db.premium.findUnique({ where: { policyId_dueDate: { policyId: p.id, dueDate: due } } });
        if (exists) continue;
        await db.premium.create({ data: { policyId: p.id, dueDate: due, amountCents: p.premiumCents } });
        report.premiumsCreated++;
      }
    }

    // 2. Paystack card charges due today
    if (tenant.cardGateway === "PAYSTACK" && process.env.PAYSTACK_SECRET_KEY) {
      const due = await db.premium.findMany({
        where: { status: "DUE", dueDate: { lte: today }, attempts: { lt: 3 }, policy: { tenantId: tenant.id, paymentMethod: "CARD", paystackAuthCode: { not: null } } },
        include: { policy: { include: { member: true } } },
      });
      for (const pr of due) {
        const ref = `${pr.policy.policyNumber}-${isoDate(pr.dueDate)}-${pr.attempts + 1}`;
        try {
          const r = await chargeAuthorization({
            email: pr.policy.paystackEmail ?? paystackEmailFor(pr.policy.policyNumber, pr.policy.member.email),
            amountCents: pr.amountCents,
            authorizationCode: pr.policy.paystackAuthCode!,
            reference: ref,
            metadata: { policy: pr.policy.policyNumber, premiumId: pr.id },
          });
          if (r.status === "success") {
            await recordPayment(pr.id, "CARD", r.reference, "billing:paystack");
            report.cardCharges++;
          } else {
            await db.premium.update({ where: { id: pr.id }, data: { attempts: { increment: 1 }, lastError: r.gateway_response } });
            report.cardFailures++;
          }
        } catch (e) {
          await db.premium.update({ where: { id: pr.id }, data: { attempts: { increment: 1 }, lastError: String(e) } });
          report.cardFailures++;
        }
      }
    }

    // 3. missed premiums
    const cutoff = addDays(today, -tenant.graceDays);
    const m = await db.premium.updateMany({ where: { status: "DUE", dueDate: { lt: cutoff }, policy: { tenantId: tenant.id } }, data: { status: "MISSED" } });
    report.missed += m.count;

    // 4. statuses
    for (const p of policies) {
      await refreshStatus(p.id, today);
      report.statusChecked++;
    }

    // 5. reminders
    const fresh = await db.policy.findMany({
      where: { tenantId: tenant.id, status: { notIn: ["CANCELLED", "LAPSED"] } },
      include: { member: true, premiums: { where: { status: { in: ["DUE", "MISSED"] } }, orderBy: { dueDate: "asc" } } },
    });
    for (const p of fresh) {
      const base = { tenant: tenant.name, tenantPhone: tenant.phone, first: p.member.firstName, policy: p.policyNumber, amountCents: p.premiumCents };
      for (const pr of p.premiums) {
        const link = p.paymentMethod === "EFT" || pr.status === "MISSED" ? payLink(tenant.slug, pr.id) : undefined;
        if (pr.status === "DUE" && pr.dueDate >= today && pr.dueDate <= addDays(today, 3)) {
          const r = await queueMessage({ tenantId: tenant.id, policyId: p.id, to: p.member.phone, template: "due_soon", dedupeKey: `due:${pr.id}`, ctx: { ...base, amountCents: pr.amountCents, date: pr.dueDate, link } });
          if (r) report.queued++;
        }
        if (pr.status === "MISSED") {
          const r = await queueMessage({ tenantId: tenant.id, policyId: p.id, to: p.member.phone, template: "missed", dedupeKey: `missed:${pr.id}`, ctx: { ...base, amountCents: pr.amountCents, link } });
          if (r) report.queued++;
        }
      }
      if (p.status === "WAITING" && p.waitingEndsAt && p.waitingEndsAt > today && p.waitingEndsAt <= addDays(today, 7)) {
        const r = await queueMessage({ tenantId: tenant.id, policyId: p.id, to: p.member.phone, template: "cover_starting", dedupeKey: `cover:${p.id}`, ctx: { ...base, date: p.waitingEndsAt } });
        if (r) report.queued++;
      }
    }
  }

  const s = await sendQueued(500);
  report.sent = s.sent;
  report.failed = s.failed;
  return report;
}
