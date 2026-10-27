/**
 * PayFast (https://developers.payfast.co.za)
 *  - Card subscriptions: a recurring billing form (subscription_type=1, frequency=3 monthly, cycles=0 indefinite).
 *    PayFast charges the card every month and sends an ITN for each charge.
 *  - Instant EFT once-off: the same form without subscription fields, payment_method=eft.
 *
 * Signature: MD5 of "key=value&key=value..." in the order the fields are posted, values URL-encoded
 * PHP-style (spaces as "+", upper-case percent escapes), empty values skipped, then "&passphrase=...".
 */
import { createHash } from "node:crypto";
import { gatewayAmount } from "../money";
import { isoDate } from "../dates";

export const PAYFAST_HOST = () =>
  process.env.PAYFAST_SANDBOX === "false" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";

export function pfEncode(v: string): string {
  return encodeURIComponent(v)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export function pfSignature(fields: [string, string][], passphrase?: string): string {
  const parts = fields
    .filter(([k, v]) => k !== "signature" && v !== "" && v != null)
    .map(([k, v]) => `${k}=${pfEncode(String(v).trim())}`);
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase.trim())}`);
  return createHash("md5").update(parts.join("&")).digest("hex");
}

export type PayfastCheckout = {
  policyNumber: string;
  premiumId?: string; // once-off EFT payment for a specific premium
  firstName: string;
  lastName: string;
  email?: string;
  cellNumber?: string; // 0721234567 format
  amountCents: number;
  itemName: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  subscription?: { billingDate: Date };
  method?: "cc" | "eft";
};

/** Returns the action URL and ordered fields to render as an auto-submitting HTML form. */
export function buildPayfastForm(c: PayfastCheckout) {
  const merchantId = process.env.PAYFAST_MERCHANT_ID ?? "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY ?? "";
  // Field order follows PayFast's documented order; the signature depends on it.
  const f: [string, string][] = [
    ["merchant_id", merchantId],
    ["merchant_key", merchantKey],
    ["return_url", c.returnUrl],
    ["cancel_url", c.cancelUrl],
    ["notify_url", c.notifyUrl],
    ["name_first", c.firstName],
    ["name_last", c.lastName],
    ["email_address", c.email ?? ""],
    ["cell_number", c.cellNumber ?? ""],
    ["m_payment_id", c.premiumId ? `${c.policyNumber}:${c.premiumId}` : c.policyNumber],
    ["amount", gatewayAmount(c.amountCents)],
    ["item_name", c.itemName],
    ["custom_str1", c.policyNumber],
  ];
  if (c.method) f.push(["payment_method", c.method]);
  if (c.subscription) {
    f.push(
      ["subscription_type", "1"],
      ["billing_date", isoDate(c.subscription.billingDate)],
      ["recurring_amount", gatewayAmount(c.amountCents)],
      ["frequency", "3"],
      ["cycles", "0"],
    );
  }
  const fields = f.filter(([, v]) => v !== "");
  const signature = pfSignature(fields, process.env.PAYFAST_PASSPHRASE);
  return { action: `${PAYFAST_HOST()}/eng/process`, fields: [...fields, ["signature", signature]] as [string, string][] };
}

/**
 * Validate an ITN (Instant Transaction Notification):
 *  1. signature over the posted fields (in posted order) matches
 *  2. amount matches what we expected
 *  3. PayFast confirms the data via the validate endpoint
 */
export async function validateItn(rawBody: string, expectedCents?: number): Promise<{ ok: boolean; data: Record<string, string>; reason?: string }> {
  const params = new URLSearchParams(rawBody);
  const pairs = [...params.entries()];
  const data = Object.fromEntries(pairs);
  const sig = pfSignature(pairs.filter(([k]) => k !== "signature"), process.env.PAYFAST_PASSPHRASE);
  if (sig !== data.signature) return { ok: false, data, reason: "signature mismatch" };
  if (expectedCents != null && Math.abs(Number(data.amount_gross) * 100 - expectedCents) > 1)
    return { ok: false, data, reason: "amount mismatch" };
  if (process.env.PAYFAST_SKIP_VALIDATE === "true") return { ok: true, data };
  const body = pairs.filter(([k]) => k !== "signature").map(([k, v]) => `${k}=${pfEncode(v)}`).join("&");
  const res = await fetch(`${PAYFAST_HOST()}/eng/query/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = (await res.text()).trim();
  return text === "VALID" ? { ok: true, data } : { ok: false, data, reason: "PayFast did not validate: " + text };
}
