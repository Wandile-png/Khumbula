"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ClaimStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { endSession, requireStaff, startStaffSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { recordPayment, refreshStatus } from "@/lib/policies";
import { runDaily } from "@/lib/billing";
import { sendQueued } from "@/lib/messaging";
import { toCents } from "@/lib/money";

export async function staffLogin(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!rateLimit(`staff:${email}`, 8, 15 * 60_000)) redirect(`/${slug}/admin/login?e=rate`);
  const u = await db.staffUser.findUnique({ where: { tenantId_email: { tenantId: t.id, email } } });
  if (!u || !u.active || !(await bcrypt.compare(password, u.passwordHash))) redirect(`/${slug}/admin/login?e=bad`);
  await startStaffSession({ staffId: u.id, tenantId: t.id, role: u.role, email: u.email });
  await audit(t.id, u.email, "staff.login");
  redirect(u.role === "AGENT" ? `/${slug}/agent` : `/${slug}/admin`);
}

export async function staffLogout(slug: string) {
  endSession("staff");
  redirect(`/${slug}/admin/login`);
}

export async function recordCashPayment(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const premiumId = String(form.get("premiumId"));
  const pr = await db.premium.findUnique({ where: { id: premiumId }, include: { policy: true } });
  if (!pr || pr.policy.tenantId !== t.id) redirect(`/${slug}/admin/policies`);
  const ref = String(form.get("reference") ?? "").trim() || `cash-${Date.now()}`;
  await recordPayment(pr.id, "CASH", ref, s.email);
  revalidatePath(`/${slug}/admin`);
  redirect(`/${slug}/admin/policies/${pr.policyId}?ok=paid`);
}

export async function setMandate(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const policyId = String(form.get("policyId"));
  const status = form.get("status") === "APPROVED" ? "APPROVED" : "DECLINED";
  const p = await db.policy.findFirst({ where: { id: policyId, tenantId: t.id } });
  if (!p) redirect(`/${slug}/admin/policies`);
  await db.mandate.update({ where: { policyId }, data: { status } });
  await audit(t.id, s.email, "mandate." + status.toLowerCase(), policyId);
  redirect(`/${slug}/admin/policies/${policyId}?ok=mandate`);
}

export async function cancelPolicy(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const policyId = String(form.get("policyId"));
  if (form.get("confirm") !== "CANCEL") redirect(`/${slug}/admin/policies/${policyId}?e=confirm`);
  const p = await db.policy.findFirst({ where: { id: policyId, tenantId: t.id } });
  if (!p) redirect(`/${slug}/admin/policies`);
  await db.policy.update({ where: { id: policyId }, data: { cancelledAt: new Date() } });
  await db.premium.updateMany({ where: { policyId, status: "DUE" }, data: { status: "WAIVED" } });
  await refreshStatus(policyId);
  await audit(t.id, s.email, "policy.cancelled", policyId, { reason: String(form.get("reason") ?? "") });
  redirect(`/${slug}/admin/policies/${policyId}?ok=cancelled`);
}

const CLAIM_FLOW: Record<string, ClaimStatus[]> = { LOGGED: ["DOCUMENTS", "DECLINED"], DOCUMENTS: ["APPROVED", "DECLINED"], APPROVED: ["PAID"] };

export async function updateClaim(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN", "CLAIMS"]);
  const id = String(form.get("claimId"));
  const c = await db.claim.findFirst({ where: { id, tenantId: t.id } });
  if (!c) redirect(`/${slug}/admin/claims`);
  const to = String(form.get("to") ?? "") as ClaimStatus;
  const docs = { docDha1663: form.get("docDha1663") === "on", docDeathCert: form.get("docDeathCert") === "on", docIds: form.get("docIds") === "on" };
  if (to && !(CLAIM_FLOW[c.status] ?? []).includes(to)) redirect(`/${slug}/admin/claims?e=flow`);
  if (to === "APPROVED" && !(docs.docDha1663 && docs.docDeathCert && docs.docIds)) redirect(`/${slug}/admin/claims?e=docs`);
  await db.claim.update({ where: { id }, data: { ...docs, ...(to ? { status: to } : {}), notes: String(form.get("notes") ?? c.notes) } });
  await audit(t.id, s.email, to ? `claim.${to.toLowerCase()}` : "claim.updated", id);
  redirect(`/${slug}/admin/claims?ok=${c.number}`);
}

export async function sendNow(slug: string) {
  const t = await getTenant(slug);
  await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const r = await sendQueued(200, t.id);
  redirect(`/${slug}/admin/messages?sent=${r.sent}&failed=${r.failed}`);
}

export async function runBillingNow(slug: string) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER"]);
  const r = await runDaily();
  await audit(t.id, s.email, "billing.run", "", r);
  redirect(`/${slug}/admin?ran=1`);
}

export async function saveSettings(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER"]);
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const color = (k: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(str(k)) ? str(k) : fallback);
  const methods = ["DEBICHECK", "CARD", "EFT", "CASH"].filter((m) => form.get(`m_${m}`) === "on") as ("DEBICHECK" | "CARD" | "EFT" | "CASH")[];
  await db.tenant.update({
    where: { id: t.id },
    data: {
      name: str("name") || t.name,
      tagline: str("tagline"),
      brandColor: color("brandColor", t.brandColor),
      accentColor: color("accentColor", t.accentColor),
      phone: str("phone"), whatsapp: str("whatsapp"), email: str("email"), website: str("website"), address: str("address"),
      underwriter: str("underwriter"), fspNumber: str("fspNumber"),
      waitingMonths: Math.min(24, Math.max(0, Number(str("waitingMonths")) || 0)),
      graceDays: Math.min(31, Math.max(1, Number(str("graceDays")) || 7)),
      cardGateway: str("cardGateway") === "PAYSTACK" ? "PAYSTACK" : "PAYFAST",
      enabledMethods: methods.length ? methods : t.enabledMethods,
    },
  });
  for (const plan of t.plans) {
    for (const tier of plan.tiers) {
      const v = form.get(`tier_${tier.id}`);
      if (v != null && v !== "") await db.planTier.update({ where: { id: tier.id }, data: { premiumCents: toCents(Number(v)) } });
    }
  }
  const benefits = str("benefits").split("\n").map((b) => b.trim()).filter(Boolean);
  if (benefits.length) {
    await db.benefit.deleteMany({ where: { tenantId: t.id } });
    await db.benefit.createMany({ data: benefits.map((label, i) => ({ tenantId: t.id, label, sortOrder: i })) });
  }
  await audit(t.id, s.email, "settings.saved");
  revalidatePath(`/${slug}`, "layout");
  redirect(`/${slug}/admin/settings?ok=1`);
}

export async function createAgent(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) redirect(`/${slug}/admin/agents?e=fields`);
  if (await db.staffUser.findUnique({ where: { tenantId_email: { tenantId: t.id, email } } })) redirect(`/${slug}/admin/agents?e=email`);
  const tt = await db.tenant.update({ where: { id: t.id }, data: { agentSeq: { increment: 1 } } });
  const agentCode = `AG${tt.agentSeq}`;
  await db.staffUser.create({ data: { tenantId: t.id, name, email, phone, role: "AGENT", agentCode, passwordHash: await bcrypt.hash(password, 12) } });
  await audit(t.id, s.email, "agent.created", agentCode);
  redirect(`/${slug}/admin/agents?ok=${agentCode}`);
}

export async function setAgentActive(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const id = String(form.get("agentId"));
  const active = form.get("active") === "1";
  const a = await db.staffUser.findFirst({ where: { id, tenantId: t.id, role: "AGENT" } });
  if (!a) redirect(`/${slug}/admin/agents`);
  await db.staffUser.update({ where: { id }, data: { active } });
  await audit(t.id, s.email, active ? "agent.activated" : "agent.deactivated", a.agentCode ?? id);
  redirect(`/${slug}/admin/agents`);
}

export async function resetAgentPassword(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireStaff(t.id, slug, ["OWNER", "ADMIN"]);
  const id = String(form.get("agentId"));
  const password = String(form.get("password") ?? "");
  const a = await db.staffUser.findFirst({ where: { id, tenantId: t.id, role: "AGENT" } });
  if (!a) redirect(`/${slug}/admin/agents`);
  if (password.length < 8) redirect(`/${slug}/admin/agents?e=pw`);
  await db.staffUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await audit(t.id, s.email, "agent.password_reset", a.agentCode ?? id);
  redirect(`/${slug}/admin/agents?pw=${a.agentCode}`);
}
