import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPolicy, SignupError } from "@/lib/policies";
import { toE164 } from "@/lib/phone";
import { signLink } from "@/lib/auth";
import { requestMandate, BANKS } from "@/lib/payments/netcash";
import { decrypt } from "@/lib/crypto";
import { rateLimit } from "@/lib/ratelimit";

const phone = z.string().transform((v, ctx) => {
  const e = toE164(v);
  if (!e) ctx.addIssue({ code: "custom", message: "Enter a valid SA cellphone number." });
  return e ?? "";
});

const Body = z.object({
  planCode: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  idNumber: z.string().regex(/^\d{13}$/, "Enter all 13 digits of the SA ID number."),
  phone,
  email: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  spouse: z.object({ name: z.string().trim().min(1).max(120), idNumber: z.string().regex(/^\d{13}$/) }).nullable().optional(),
  children: z.array(z.object({ name: z.string().trim().min(1).max(120), age: z.number().int().min(0).max(25) })).max(20).default([]),
  extended: z.array(z.object({ name: z.string().trim().min(1).max(120), relation: z.string().trim().min(1).max(40) })).max(20).default([]),
  beneficiary: z.object({ name: z.string().trim().min(1).max(120), relation: z.string().trim().max(40).default(""), phone }),
  method: z.enum(["DEBICHECK", "CARD", "EFT", "CASH"]),
  debitDay: z.number().int().min(1).max(31),
  bank: z.object({ bank: z.string().refine((b) => b in BANKS, "Choose a bank from the list."), accountType: z.enum(["Savings", "Cheque", "Transmission"]), accountNumber: z.string().regex(/^\d{7,12}$/, "Account numbers are 7 to 12 digits.") }).nullable().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Accept the terms to continue." }) }),
});

export async function POST(req: Request, { params }: { params: { tenant: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`signup:${ip}`, 10, 60 * 60_000)) return NextResponse.json({ error: "Too many sign-ups from this connection. Try again later or call us." }, { status: 429 });

  const tenant = await db.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant) return NextResponse.json({ error: "Unknown funeral home." }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your details." }, { status: 400 });
  const b = parsed.data;
  if (b.method === "DEBICHECK" && !b.bank) return NextResponse.json({ error: "Add your bank details for the debit order." }, { status: 400 });

  try {
    const policy = await createPolicy(tenant.id, { ...b, spouse: b.spouse ?? null, bank: b.bank ?? null, beneficiary: { ...b.beneficiary, relation: b.beneficiary.relation } });

    if (b.method === "DEBICHECK" && b.bank) {
      const full = await db.policy.findUniqueOrThrow({ where: { id: policy.id }, include: { member: true } });
      const r = await requestMandate({
        policyNumber: policy.policyNumber,
        accountHolder: `${b.firstName} ${b.lastName}`,
        idNumber: decrypt(full.member.idNumberEnc),
        phone: b.phone,
        bank: b.bank.bank,
        accountType: b.bank.accountType,
        accountNumber: b.bank.accountNumber,
        branchCode: BANKS[b.bank.bank],
        amountCents: policy.premiumCents,
        debitDay: b.debitDay,
        firstCollection: policy.startDate,
      });
      if (r.providerRef) await db.mandate.update({ where: { policyId: policy.id }, data: { providerRef: r.providerRef } });
    }

    const token = await signLink({ policyId: policy.id }, 24 * 60);
    return NextResponse.json({ ok: true, policyNumber: policy.policyNumber, next: `/${tenant.slug}/join/done?t=${encodeURIComponent(token)}` });
  } catch (e) {
    if (e instanceof SignupError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("signup failed", e);
    return NextResponse.json({ error: "We couldn't create your policy. Please try again or call us." }, { status: 500 });
  }
}
