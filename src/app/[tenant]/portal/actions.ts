"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { hashOtp, lookupHash, otpCode, safeEqual } from "@/lib/crypto";
import { normaliseId } from "@/lib/sa-id";
import { endSession, requireMember, startMemberSession } from "@/lib/auth";
import { queueMessage, sendQueued } from "@/lib/messaging";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { todaySA } from "@/lib/dates";

export async function requestOtp(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const id = normaliseId(String(form.get("idNumber") ?? ""));
  if (!/^\d{13}$/.test(id)) redirect(`/${slug}/portal/login?e=id`);
  if (!rateLimit(`otp:${id}`, 5, 60 * 60_000)) redirect(`/${slug}/portal/login?e=rate`);
  const member = await db.member.findUnique({ where: { tenantId_idHash: { tenantId: t.id, idHash: lookupHash(id) } } });
  // Same response whether or not the member exists, so ID numbers can't be probed.
  if (!member) redirect(`/${slug}/portal/login?step=code&ref=none`);
  const code = otpCode();
  const otp = await db.otp.create({ data: { tenantId: t.id, memberId: member.id, codeHash: "", expiresAt: new Date(Date.now() + 10 * 60_000) } });
  await db.otp.update({ where: { id: otp.id }, data: { codeHash: hashOtp(code, otp.id) } });
  await queueMessage({
    tenantId: t.id, to: member.phone, template: "otp", channel: "SMS", dedupeKey: `otp:${otp.id}`,
    ctx: { tenant: t.name, tenantPhone: t.phone, first: member.firstName, policy: "", amountCents: 0, link: code },
  });
  await sendQueued(5, t.id);
  // Test mode only: no SMS is really sent, so show the code on screen.
  const testCode = process.env.MESSAGING_DRY_RUN === "true" ? `&test=${code}` : "";
  redirect(`/${slug}/portal/login?step=code&ref=${otp.id}&to=${member.phone.slice(-3)}${testCode}`);
}

export async function verifyOtp(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const ref = String(form.get("ref") ?? "");
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  const back = `/${slug}/portal/login?step=code&ref=${ref}&e=code`;
  if (ref === "none") redirect(back);
  const otp = await db.otp.findUnique({ where: { id: ref } });
  if (!otp || otp.tenantId !== t.id || otp.usedAt || otp.expiresAt < new Date() || otp.attempts >= 5) redirect(`/${slug}/portal/login?e=expired`);
  if (!safeEqual(hashOtp(code, otp.id), otp.codeHash)) {
    await db.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    redirect(back);
  }
  await db.otp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  await startMemberSession({ memberId: otp.memberId, tenantId: t.id });
  redirect(`/${slug}/portal`);
}

export async function logout(slug: string) {
  endSession("member");
  redirect(`/${slug}`);
}

export async function logClaim(slug: string, form: FormData) {
  const t = await getTenant(slug);
  const s = await requireMember(t.id, slug);
  const policyId = String(form.get("policyId"));
  const policy = await db.policy.findFirst({ where: { id: policyId, memberId: s.memberId, tenantId: t.id }, include: { member: true } });
  if (!policy) redirect(`/${slug}/portal`);
  const who = String(form.get("who") ?? "");
  const [deceased, relation] = who.split("|");
  const date = new Date(String(form.get("date")) + "T00:00:00Z");
  if (isNaN(date.getTime()) || date > todaySA()) redirect(`/${slug}/portal?e=date`);
  const cause = form.get("cause") === "ACCIDENTAL" ? "ACCIDENTAL" : "NATURAL";
  const tt = await db.tenant.update({ where: { id: t.id }, data: { claimSeq: { increment: 1 } } });
  const claim = await db.claim.create({
    data: { tenantId: t.id, policyId: policy.id, number: `CL-${tt.claimSeq}`, deceased, relation: relation ?? "", dateOfDeath: date, cause, notes: String(form.get("notes") ?? "").slice(0, 1000) },
  });
  await audit(t.id, `member:${policy.policyNumber}`, "claim.logged", claim.id);
  await queueMessage({
    tenantId: t.id, policyId: policy.id, to: policy.member.phone, template: "claim_logged", dedupeKey: `claim:${claim.id}`,
    ctx: { tenant: t.name, tenantPhone: t.phone, first: policy.member.firstName, policy: policy.policyNumber, amountCents: 0, link: claim.number },
  });
  await sendQueued(5, t.id);
  redirect(`/${slug}/portal?claimed=${claim.number}`);
}
