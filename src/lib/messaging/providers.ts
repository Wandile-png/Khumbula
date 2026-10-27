/**
 * Outbound messaging.
 *  - WhatsApp: Meta WhatsApp Cloud API. Business-initiated messages must use templates approved in
 *    WhatsApp Manager. Each template here maps to one approved template with {{1}}..{{n}} body params.
 *  - SMS: BulkSMS.com JSON API (basic auth). Swap for Clickatell etc. by replacing sendSms.
 * Without credentials, messages are logged and marked SENT in dev (MESSAGING_DRY_RUN=true).
 */
export type SendResult = { ok: true; providerRef: string } | { ok: false; error: string };

const dryRun = () => process.env.MESSAGING_DRY_RUN === "true";

export async function sendWhatsAppTemplate(toE164: string, template: string, params: string[], lang = "en"): Promise<SendResult> {
  if (dryRun()) {
    console.log(`[whatsapp dry-run] ${toE164} ${template}`, params);
    return { ok: true, providerRef: "dry-run" };
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "WhatsApp is not configured" };
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok || !json.messages?.[0]) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
  return { ok: true, providerRef: json.messages[0].id };
}

export async function sendSms(toE164: string, body: string): Promise<SendResult> {
  if (dryRun()) {
    console.log(`[sms dry-run] ${toE164}: ${body}`);
    return { ok: true, providerRef: "dry-run" };
  }
  const id = process.env.BULKSMS_TOKEN_ID;
  const secret = process.env.BULKSMS_TOKEN_SECRET;
  if (!id || !secret) return { ok: false, error: "SMS is not configured" };
  const res = await fetch("https://api.bulksms.com/v1/messages", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/json" },
    body: JSON.stringify({ to: toE164, body, from: process.env.BULKSMS_SENDER || undefined }),
  });
  const json = (await res.json()) as Array<{ id: string }> | { detail?: string };
  if (!res.ok || !Array.isArray(json)) return { ok: false, error: (json as { detail?: string }).detail ?? `HTTP ${res.status}` };
  return { ok: true, providerRef: json[0].id };
}
