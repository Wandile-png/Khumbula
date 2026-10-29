import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getMember, getStaff } from "@/lib/auth";
import { parseUpload, saveDocument } from "@/lib/documents";
import { rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  policyId: z.string().min(1),
  file: z.object({ name: z.string().max(200), mime: z.string().max(60), data: z.string().max(4_500_000) }),
});

/** Upload an ID document after sign-up: by the member in their portal, or by staff in admin. */
export async function POST(req: Request, { params }: { params: { tenant: string } }) {
  const tenant = await db.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant) return NextResponse.json({ error: "Unknown funeral home." }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });

  const policy = await db.policy.findFirst({ where: { id: parsed.data.policyId, tenantId: tenant.id } });
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const staff = await getStaff(tenant.id);
  const member = staff ? null : await getMember(tenant.id);
  if (!staff && (!member || member.memberId !== policy.memberId)) return NextResponse.json({ error: "Sign in again to upload." }, { status: 401 });
  if (staff && staff.role === "VIEWER") return NextResponse.json({ error: "Your role can't upload documents." }, { status: 403 });

  const who = staff ? staff.email : `member:${policy.policyNumber}`;
  if (!rateLimit(`upload:${who}`, 20, 60 * 60_000)) return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });

  const file = parseUpload(parsed.data.file);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: 400 });
  const doc = await saveDocument({ tenantId: tenant.id, memberId: policy.memberId, file, actor: who });
  return NextResponse.json({ ok: true, id: doc.id });
}
