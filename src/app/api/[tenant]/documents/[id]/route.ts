import { db } from "@/lib/db";
import { getMember, getStaff } from "@/lib/auth";
import { decryptBytes } from "@/lib/crypto";
import { audit } from "@/lib/audit";

/** View a stored document. Staff of this funeral home, or the member it belongs to. Every staff view is logged. */
export async function GET(_req: Request, { params }: { params: { tenant: string; id: string } }) {
  const tenant = await db.tenant.findUnique({ where: { slug: params.tenant } });
  if (!tenant) return new Response("Not found", { status: 404 });
  const doc = await db.memberDocument.findFirst({ where: { id: params.id, tenantId: tenant.id } });
  if (!doc) return new Response("Not found", { status: 404 });

  const staff = await getStaff(tenant.id);
  const member = staff ? null : await getMember(tenant.id);
  if (!staff && (!member || member.memberId !== doc.memberId)) return new Response("Sign in to view this document.", { status: 401 });
  if (staff && staff.role === "AGENT") {
    const own = await db.policy.count({ where: { memberId: doc.memberId, agentId: staff.staffId } });
    if (!own) return new Response("You can only view documents for your own clients.", { status: 403 });
  }
  if (staff) await audit(tenant.id, staff.email, "document.viewed", doc.id);

  const bytes = decryptBytes(doc.dataEnc);
  const ext = doc.mime === "application/pdf" ? "pdf" : doc.mime.split("/")[1];
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="id-document.${ext}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
