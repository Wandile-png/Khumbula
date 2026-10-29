import { db } from "./db";
import { encryptBytes } from "./crypto";
import { audit } from "./audit";

/** Limits for ID uploads. Photos are shrunk in the browser first, so most arrive well under 1 MB. */
export const DOC_MAX_BYTES = 3 * 1024 * 1024;
export const DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type UploadInput = { name: string; mime: string; data: string };

/** Check the file really is what it claims to be by its first bytes, not just its name. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

export function parseUpload(input: UploadInput | null | undefined): { ok: true; buf: Buffer; mime: string; name: string } | { ok: false; error: string } {
  if (!input || !input.data) return { ok: false, error: "Add a photo or scan of your ID document." };
  const base64 = input.data.includes(",") ? input.data.slice(input.data.indexOf(",") + 1) : input.data;
  const buf = Buffer.from(base64, "base64");
  if (!buf.length) return { ok: false, error: "That file is empty. Try again." };
  if (buf.length > DOC_MAX_BYTES) return { ok: false, error: "That file is larger than 3 MB. Take a photo instead, or scan at a lower quality." };
  const mime = sniff(buf);
  if (!mime) return { ok: false, error: "Upload a photo (JPG or PNG) or a PDF of the ID." };
  const name = (input.name || "id-document").replace(/[^\w.\- ]+/g, "").slice(0, 120) || "id-document";
  return { ok: true, buf, mime, name };
}

export async function saveDocument(opts: { tenantId: string; memberId: string; file: { buf: Buffer; mime: string; name: string }; actor: string }) {
  const doc = await db.memberDocument.create({
    data: {
      tenantId: opts.tenantId,
      memberId: opts.memberId,
      kind: "ID",
      filename: opts.file.name,
      mime: opts.file.mime,
      size: opts.file.buf.length,
      dataEnc: encryptBytes(opts.file.buf),
      uploadedBy: opts.actor,
    },
    select: { id: true, filename: true, size: true, createdAt: true },
  });
  await audit(opts.tenantId, opts.actor, "document.uploaded", doc.id, { memberId: opts.memberId, size: doc.size });
  return doc;
}

export function listDocuments(memberId: string) {
  return db.memberDocument.findMany({
    where: { memberId },
    select: { id: true, kind: true, filename: true, mime: true, size: true, uploadedBy: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}
