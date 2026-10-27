/**
 * Message templates. `params` feed the approved WhatsApp template; `sms` is the plain-text fallback
 * (keep under 160 characters where possible — one SMS part).
 * Register these names and bodies in WhatsApp Manager exactly as written in `whatsappBody`.
 */
import { formatRand } from "../money";
import { formatDate, ordinal } from "../dates";

type Ctx = { tenant: string; tenantPhone: string; first: string; policy: string; amountCents: number; date?: Date; plan?: string; link?: string; debitDay?: number };

export const TEMPLATES = {
  welcome: {
    whatsappBody: "Welcome to {{1}}. Your {{2}} policy {{3}} is set up. Premium {{4}} on the {{5}} of each month. Natural-death cover starts {{6}}. Questions: {{7}}",
    params: (c: Ctx) => [c.tenant, c.plan ?? "", c.policy, formatRand(c.amountCents), ordinal(c.debitDay ?? 1), c.date ? formatDate(c.date) : "", c.tenantPhone],
    sms: (c: Ctx) => `${c.tenant}: policy ${c.policy} set up. ${formatRand(c.amountCents)} monthly. Full cover from ${c.date ? formatDate(c.date) : "after waiting period"}. ${c.tenantPhone}`,
  },
  due_soon: {
    whatsappBody: "{{1}}: your premium of {{2}} for policy {{3}} is due on {{4}}. {{5}}",
    params: (c: Ctx) => [c.tenant, formatRand(c.amountCents), c.policy, c.date ? formatDate(c.date) : "", c.link ? `Pay here: ${c.link}` : "Please keep funds available."],
    sms: (c: Ctx) => `${c.tenant}: ${formatRand(c.amountCents)} for ${c.policy} due ${c.date ? formatDate(c.date) : ""}.${c.link ? " Pay: " + c.link : " Keep funds available."}`,
  },
  missed: {
    whatsappBody: "{{1}}, we did not receive your {{2}} premium for policy {{3}}. Pay within 30 days to keep your cover. {{4}}",
    params: (c: Ctx) => [c.first, formatRand(c.amountCents), c.policy, c.link ? `Pay here: ${c.link}` : `Call ${c.tenantPhone}`],
    sms: (c: Ctx) => `${c.tenant}: ${c.first}, ${formatRand(c.amountCents)} for ${c.policy} not received. Pay within 30 days to keep cover.${c.link ? " " + c.link : ""}`,
  },
  lapsed: {
    whatsappBody: "{{1}}, policy {{2}} has lapsed after two unpaid premiums. Call {{3}} to reinstate your cover.",
    params: (c: Ctx) => [c.first, c.policy, c.tenantPhone],
    sms: (c: Ctx) => `${c.tenant}: ${c.first}, policy ${c.policy} has lapsed. Call ${c.tenantPhone} to reinstate.`,
  },
  cover_starting: {
    whatsappBody: "Good news {{1}}: full cover on policy {{2}} starts {{3}} when your waiting period ends. Thank you for paying on time. {{4}}",
    params: (c: Ctx) => [c.first, c.policy, c.date ? formatDate(c.date) : "", c.tenant],
    sms: (c: Ctx) => `${c.tenant}: full cover on ${c.policy} starts ${c.date ? formatDate(c.date) : ""}. Thank you for paying on time.`,
  },
  payment_received: {
    whatsappBody: "{{1}}: we received {{2}} for policy {{3}}. Thank you.",
    params: (c: Ctx) => [c.tenant, formatRand(c.amountCents), c.policy],
    sms: (c: Ctx) => `${c.tenant}: received ${formatRand(c.amountCents)} for ${c.policy}. Thank you.`,
  },
  otp: {
    whatsappBody: "{{1}} is your {{2}} login code. It expires in 10 minutes.",
    params: (c: Ctx) => [c.link ?? "", c.tenant],
    sms: (c: Ctx) => `${c.link} is your ${c.tenant} login code. It expires in 10 minutes.`,
  },
  claim_logged: {
    whatsappBody: "{{1}}: claim {{2}} on policy {{3}} has been logged. We are sorry for your loss. We will contact you about documents. {{4}}",
    params: (c: Ctx) => [c.tenant, c.link ?? "", c.policy, c.tenantPhone],
    sms: (c: Ctx) => `${c.tenant}: claim ${c.link} on ${c.policy} logged. We are sorry for your loss. We will contact you. ${c.tenantPhone}`,
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
export type TemplateCtx = Ctx;
