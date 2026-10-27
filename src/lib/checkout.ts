import type { Member, Policy, Premium, Tenant } from "@prisma/client";
import { buildPayfastForm } from "./payments/payfast";
import { appUrl } from "./tenant";

const local = (e164: string) => (e164.startsWith("+27") ? "0" + e164.slice(3) : e164);

/** Card subscription (first premium + monthly) through PayFast. */
export function payfastSubscription(t: Tenant, p: Policy & { member: Member; plan: { name: string } }) {
  return buildPayfastForm({
    policyNumber: p.policyNumber,
    firstName: p.member.firstName,
    lastName: p.member.lastName,
    email: p.member.email || undefined,
    cellNumber: local(p.member.phone),
    amountCents: p.premiumCents,
    itemName: `${t.name} – ${p.plan.name}`.slice(0, 100),
    returnUrl: appUrl(`/${t.slug}/pay/return?policy=${p.policyNumber}`),
    cancelUrl: appUrl(`/${t.slug}/pay/return?cancelled=1`),
    notifyUrl: appUrl(`/api/webhooks/payfast`),
    subscription: { billingDate: p.startDate },
    method: "cc",
  });
}

/** Once-off payment of one premium (Instant EFT or card) through PayFast. */
export function payfastOnceOff(t: Tenant, p: Policy & { member: Member }, pr: Premium, method: "eft" | "cc" = "eft") {
  return buildPayfastForm({
    policyNumber: p.policyNumber,
    premiumId: pr.id,
    firstName: p.member.firstName,
    lastName: p.member.lastName,
    email: p.member.email || undefined,
    cellNumber: local(p.member.phone),
    amountCents: pr.amountCents,
    itemName: `${t.name} premium ${p.policyNumber}`.slice(0, 100),
    returnUrl: appUrl(`/${t.slug}/pay/return?policy=${p.policyNumber}`),
    cancelUrl: appUrl(`/${t.slug}/pay/return?cancelled=1`),
    notifyUrl: appUrl(`/api/webhooks/payfast`),
    method,
  });
}
