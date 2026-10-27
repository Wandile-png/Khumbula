/**
 * Paystack (https://paystack.com/docs) — South African merchants settle in ZAR.
 * Flow used here:
 *  1. Initialize a transaction for the first premium (card channel). Paystack returns a checkout URL.
 *  2. On charge.success we store the reusable authorization_code.
 *  3. The daily billing job charges that authorization on each debit date (charge_authorization).
 * Webhooks are verified with HMAC-SHA512 of the raw body using the secret key (x-paystack-signature).
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "../crypto";

const API = "https://api.paystack.co";

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  const res = await fetch(API + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !json.status) throw new Error(`Paystack ${path}: ${json.message}`);
  return json.data;
}

export async function initializeCard(opts: {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    email: opts.email,
    amount: opts.amountCents, // Paystack amounts are in the subunit (cents)
    currency: "ZAR",
    reference: opts.reference,
    callback_url: opts.callbackUrl,
    channels: ["card"],
    metadata: opts.metadata,
  });
}

export async function chargeAuthorization(opts: { email: string; amountCents: number; authorizationCode: string; reference: string; metadata: Record<string, string> }) {
  return call<{ status: string; reference: string; gateway_response: string }>("/transaction/charge_authorization", {
    email: opts.email,
    amount: opts.amountCents,
    currency: "ZAR",
    authorization_code: opts.authorizationCode,
    reference: opts.reference,
    metadata: opts.metadata,
  });
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secret = process.env.PAYSTACK_SECRET_KEY ?? ""): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** Members without email still need one for Paystack; use a stable per-policy address on your domain. */
export function paystackEmailFor(policyNumber: string, email?: string) {
  return email && email.includes("@") ? email : `${policyNumber.toLowerCase()}@members.${process.env.MEMBER_EMAIL_DOMAIN ?? "example.co.za"}`;
}
