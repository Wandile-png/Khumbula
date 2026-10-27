/**
 * Pure policy rules. No database access here so they are easy to test.
 */
import { addMonths } from "./dates";

export type TierLike = { minAge: number; maxAge: number; premiumCents: number };
export type PremiumLike = { dueDate: Date; status: "DUE" | "PAID" | "MISSED" | "WAIVED" };
export type Status = "PENDING" | "WAITING" | "ACTIVE" | "ARREARS" | "LAPSED" | "CANCELLED";

export function premiumForAge(tiers: TierLike[], age: number): number | null {
  const t = tiers.find((x) => age >= x.minAge && age <= x.maxAge);
  return t ? t.premiumCents : null;
}

export function waitingEnds(firstPaidDueDate: Date, waitingMonths: number): Date {
  return addMonths(firstPaidDueDate, waitingMonths);
}

/** Consecutive MISSED premiums counting back from the most recent settled one. DUE premiums are ignored. */
export function consecutiveMissed(premiums: PremiumLike[]): number {
  const settled = premiums
    .filter((p) => p.status !== "DUE")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  let n = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].status === "MISSED") n++;
    else break;
  }
  return n;
}

export function computeStatus(input: {
  cancelled: boolean;
  firstPaidAt: Date | null;
  waitingEndsAt: Date | null;
  premiums: PremiumLike[];
  today: Date;
}): Status {
  if (input.cancelled) return "CANCELLED";
  if (!input.firstPaidAt) {
    // never paid: lapse once two premiums have been missed
    return consecutiveMissed(input.premiums) >= 2 ? "LAPSED" : "PENDING";
  }
  const missed = consecutiveMissed(input.premiums);
  if (missed >= 2) return "LAPSED";
  if (missed === 1) return "ARREARS";
  if (input.waitingEndsAt && input.today < input.waitingEndsAt) return "WAITING";
  return "ACTIVE";
}

/**
 * Claim screening: natural deaths inside the waiting period are not covered; accidental deaths are
 * covered once the first premium is paid. Lapsed or never-paid policies are not covered.
 */
export function claimScreen(input: {
  status: Status;
  firstPaidAt: Date | null;
  waitingEndsAt: Date | null;
  dateOfDeath: Date;
  cause: "NATURAL" | "ACCIDENTAL";
}): { covered: boolean; reason: string } {
  if (!input.firstPaidAt) return { covered: false, reason: "No premium had been received." };
  if (input.status === "LAPSED" || input.status === "CANCELLED") return { covered: false, reason: "Policy is not in force." };
  if (input.dateOfDeath < input.firstPaidAt) return { covered: false, reason: "Death occurred before cover started." };
  if (input.cause === "NATURAL" && input.waitingEndsAt && input.dateOfDeath < input.waitingEndsAt)
    return { covered: false, reason: "Natural death inside the waiting period." };
  return { covered: true, reason: input.cause === "ACCIDENTAL" ? "Accidental death, covered from first premium." : "Waiting period cleared." };
}
