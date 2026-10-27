/** Calendar dates are kept as UTC midnight. "Today" is taken in South African time. */
export const SA_TZ = "Africa/Johannesburg";

export function todaySA(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SA_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

export function utcDate(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d));
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** The debit date for a given month, clamped to the last day (e.g. 31st → 28 Feb). */
export function debitDateIn(y: number, m0: number, debitDay: number): Date {
  return utcDate(y, m0, Math.min(debitDay, daysInMonth(y, m0)));
}

/** First debit date strictly after `from` (sign-up day itself is never charged). */
export function firstDebitAfter(from: Date, debitDay: number): Date {
  let d = debitDateIn(from.getUTCFullYear(), from.getUTCMonth(), debitDay);
  if (d <= from) d = debitDateIn(from.getUTCFullYear(), from.getUTCMonth() + 1, debitDay);
  return d;
}

export function nextDebitOnOrAfter(from: Date, debitDay: number): Date {
  let d = debitDateIn(from.getUTCFullYear(), from.getUTCMonth(), debitDay);
  if (d < from) d = debitDateIn(from.getUTCFullYear(), from.getUTCMonth() + 1, debitDay);
  return d;
}

export function addMonths(d: Date, n: number): Date {
  const day = d.getUTCDate();
  const target = utcDate(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
  return utcDate(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return n + "th";
  const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return n + suffix;
}
