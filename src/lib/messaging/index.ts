import { Channel, Prisma } from "@prisma/client";
import { db } from "../db";
import { TEMPLATES, TemplateCtx, TemplateName } from "./templates";
import { sendSms, sendWhatsAppTemplate } from "./providers";

/**
 * Queue a message. `dedupeKey` makes the daily job idempotent: the same reminder is never queued twice.
 */
export async function queueMessage(opts: {
  tenantId: string;
  policyId?: string;
  to: string;
  template: TemplateName;
  ctx: TemplateCtx;
  channel?: Channel;
  dedupeKey: string;
}) {
  const t = TEMPLATES[opts.template];
  const channel = opts.channel ?? (process.env.WHATSAPP_TOKEN || process.env.MESSAGING_DRY_RUN === "true" ? "WHATSAPP" : "SMS");
  const body = channel === "WHATSAPP" ? fill(t.whatsappBody, t.params(opts.ctx)) : t.sms(opts.ctx);
  try {
    return await db.message.create({
      data: { tenantId: opts.tenantId, policyId: opts.policyId, to: opts.to, template: opts.template, channel, body, dedupeKey: opts.dedupeKey },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // already queued
    throw e;
  }
}

function fill(body: string, params: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
}

/** Extract the params back out of a stored WhatsApp body using the template pattern. */
function paramsFrom(template: TemplateName, body: string): string[] {
  const pattern = TEMPLATES[template].whatsappBody.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\\\{\d+\\\}\\\}/g, "(.*)");
  const m = new RegExp("^" + pattern + "$", "s").exec(body);
  return m ? m.slice(1) : [];
}

export async function sendQueued(limit = 200, tenantId?: string) {
  const queued = await db.message.findMany({ where: { status: "QUEUED", ...(tenantId ? { tenantId } : {}) }, take: limit, orderBy: { createdAt: "asc" } });
  let sent = 0, failed = 0;
  for (const m of queued) {
    const template = m.template as TemplateName;
    const r = m.channel === "WHATSAPP" ? await sendWhatsAppTemplate(m.to, template, paramsFrom(template, m.body)) : await sendSms(m.to, m.body);
    if (r.ok) {
      sent++;
      await db.message.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerRef: r.providerRef } });
    } else if (m.channel === "WHATSAPP") {
      // fall back to SMS once
      const ctxBody = m.body; // WhatsApp body is readable as SMS too
      const sms = await sendSms(m.to, ctxBody.length > 300 ? ctxBody.slice(0, 300) : ctxBody);
      await db.message.update({
        where: { id: m.id },
        data: sms.ok ? { status: "SENT", channel: "SMS", sentAt: new Date(), providerRef: sms.providerRef, error: "WhatsApp: " + r.error } : { status: "FAILED", error: `${r.error}; SMS: ${sms.ok ? "" : sms.error}` },
      });
      sms.ok ? sent++ : failed++;
    } else {
      failed++;
      await db.message.update({ where: { id: m.id }, data: { status: "FAILED", error: r.error } });
    }
  }
  return { sent, failed };
}
