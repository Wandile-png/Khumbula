import { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "./db";
import { encrypt, lookupHash } from "./crypto";
import { ageOn, parseSaId } from "./sa-id";
import { computeStatus, premiumForAge, waitingEnds } from "./rules";
import { firstDebitAfter, todaySA } from "./dates";
import { queueMessage } from "./messaging";
import { audit } from "./audit";
import { appUrl } from "./tenant";

export type SignupInput = {
  planCode: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string; // E.164
  email: string;
  address: string;
  spouse?: { name: string; idNumber: string } | null;
  children: { name: string; age: number }[];
  extended: { name: string; relation: string }[];
  beneficiary: { name: string; relation: string; phone: string };
  method: PaymentMethod;
  debitDay: number;
  bank?: { bank: string; accountType: string; accountNumber: string } | null;
  agentId?: string | null;
};

export class SignupError extends Error {}

export async function createPolicy(tenantId: string, input: SignupInput) {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const plan = await db.plan.findFirst({ where: { tenantId, code: input.planCode, active: true }, include: { tiers: true } });
  if (!plan) throw new SignupError("That plan is not available.");
  if (!tenant.enabledMethods.includes(input.method)) throw new SignupError("That payment method is not available.");

  const id = parseSaId(input.idNumber);
  if (!id.ok) throw new SignupError(id.error);
  const today = todaySA();
  const age = ageOn(id.dateOfBirth, today);
  const premium = premiumForAge(plan.tiers, age);
  if (premium == null) throw new SignupError(`Age ${age} is outside this plan's entry ages.`);

  if (input.spouse && !plan.coversSpouse) throw new SignupError("This plan does not cover a spouse.");
  if (input.children.length > plan.maxChildren) throw new SignupError(`This plan covers up to ${plan.maxChildren} children.`);
  if (input.children.some((c) => c.age < 0 || c.age > plan.maxChildAge)) throw new SignupError(`Children must be aged 0 to ${plan.maxChildAge}.`);
  if (input.extended.length > plan.maxExtended) throw new SignupError(`This plan covers up to ${plan.maxExtended} extended members.`);
  let spouseDob: Date | null = null;
  if (input.spouse) {
    const sp = parseSaId(input.spouse.idNumber);
    if (!sp.ok) throw new SignupError("Spouse ID: " + sp.error);
    spouseDob = sp.dateOfBirth;
  }

  const idHash = lookupHash(id.ok ? input.idNumber.replace(/\s/g, "") : "");
  const startDate = firstDebitAfter(today, input.debitDay);

  const result = await db.$transaction(async (tx) => {
    const t = await tx.tenant.update({ where: { id: tenantId }, data: { policySeq: { increment: 1 } } });
    const policyNumber = `${t.policyPrefix}-${t.policySeq}`;

    const member = await tx.member.upsert({
      where: { tenantId_idHash: { tenantId, idHash } },
      update: { phone: input.phone, email: input.email, address: input.address, firstName: input.firstName, lastName: input.lastName },
      create: {
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        idNumberEnc: encrypt(input.idNumber.replace(/\s/g, "")),
        idHash,
        dateOfBirth: id.dateOfBirth,
        phone: input.phone,
        email: input.email,
        address: input.address,
      },
    });

    const dependants: Prisma.DependantCreateWithoutPolicyInput[] = [];
    if (input.spouse) dependants.push({ name: input.spouse.name, relation: "Spouse", kind: "SPOUSE", dateOfBirth: spouseDob, idNumberEnc: encrypt(input.spouse.idNumber.replace(/\s/g, "")) });
    for (const c of input.children) dependants.push({ name: c.name, relation: "Child", kind: "CHILD", dateOfBirth: new Date(Date.UTC(today.getUTCFullYear() - c.age, 0, 1)) });
    for (const e of input.extended) dependants.push({ name: e.name, relation: e.relation, kind: "EXTENDED" });

    const policy = await tx.policy.create({
      data: {
        tenantId,
        memberId: member.id,
        planId: plan.id,
        policyNumber,
        premiumCents: premium,
        debitDay: input.debitDay,
        paymentMethod: input.method,
        startDate,
        consentAt: new Date(),
        agentId: input.agentId ?? null,
        dependants: { create: dependants },
        beneficiary: { create: input.beneficiary },
        premiums: { create: { dueDate: startDate, amountCents: premium } },
        ...(input.method === "DEBICHECK" && input.bank
          ? { mandate: { create: { bank: input.bank.bank, accountType: input.bank.accountType, accountLast4: input.bank.accountNumber.slice(-4) } } }
          : {}),
      },
      include: { premiums: true, plan: true },
    });
    return { policy, member, tenant: t };
  });

  await audit(tenantId, `member:${result.policy.policyNumber}`, "policy.created", result.policy.id, { plan: plan.code, method: input.method });
  await queueMessage({
    tenantId,
    policyId: result.policy.id,
    to: input.phone,
    template: "welcome",
    dedupeKey: `welcome:${result.policy.id}`,
    ctx: {
      tenant: tenant.name,
      tenantPhone: tenant.phone,
      first: input.firstName,
      policy: result.policy.policyNumber,
      amountCents: premium,
      plan: plan.name,
      debitDay: input.debitDay,
      date: waitingEnds(startDate, tenant.waitingMonths),
    },
  });
  return result.policy;
}

/** Mark a premium paid (idempotent) and refresh the policy's status. */
export async function recordPayment(premiumId: string, method: PaymentMethod, gatewayRef: string, actor: string, paidAt = new Date()) {
  const premium = await db.premium.findUniqueOrThrow({ where: { id: premiumId }, include: { policy: { include: { tenant: true, member: true } } } });
  if (premium.status === "PAID") return premium;
  await db.premium.update({ where: { id: premiumId }, data: { status: "PAID", paidAt, method, gatewayRef } });
  const p = premium.policy;
  if (!p.firstPaidAt) {
    await db.policy.update({ where: { id: p.id }, data: { firstPaidAt: paidAt, waitingEndsAt: waitingEnds(premium.dueDate < paidAt ? premium.dueDate : paidAt, p.tenant.waitingMonths) } });
  }
  await audit(p.tenantId, actor, "premium.paid", premiumId, { amountCents: premium.amountCents, gatewayRef });
  await queueMessage({
    tenantId: p.tenantId,
    policyId: p.id,
    to: p.member.phone,
    template: "payment_received",
    dedupeKey: `paid:${premiumId}`,
    ctx: { tenant: p.tenant.name, tenantPhone: p.tenant.phone, first: p.member.firstName, policy: p.policyNumber, amountCents: premium.amountCents },
  });
  await refreshStatus(p.id);
  return premium;
}

/** Pay a policy's oldest unpaid premium (used by gateways that don't reference a specific premium). */
export async function payOldestOpen(policyId: string, method: PaymentMethod, gatewayRef: string, actor: string) {
  const open = await db.premium.findFirst({ where: { policyId, status: { in: ["DUE", "MISSED"] } }, orderBy: { dueDate: "asc" } });
  if (!open) return null;
  return recordPayment(open.id, method, gatewayRef, actor);
}

export async function refreshStatus(policyId: string, today = todaySA()) {
  const p = await db.policy.findUniqueOrThrow({ where: { id: policyId }, include: { premiums: true, member: true, tenant: true } });
  const next = computeStatus({ cancelled: !!p.cancelledAt, firstPaidAt: p.firstPaidAt, waitingEndsAt: p.waitingEndsAt, premiums: p.premiums, today });
  if (next !== p.status) {
    await db.policy.update({ where: { id: p.id }, data: { status: next } });
    await audit(p.tenantId, "system", "policy.status", p.id, { from: p.status, to: next });
    if (next === "LAPSED") {
      await queueMessage({
        tenantId: p.tenantId,
        policyId: p.id,
        to: p.member.phone,
        template: "lapsed",
        dedupeKey: `lapsed:${p.id}:${p.premiums.length}`,
        ctx: { tenant: p.tenant.name, tenantPhone: p.tenant.phone, first: p.member.firstName, policy: p.policyNumber, amountCents: p.premiumCents },
      });
    }
  }
  return next;
}

export const payLink = (slug: string, premiumId: string) => appUrl(`/${slug}/pay/${premiumId}`);
