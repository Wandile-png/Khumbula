/** Normalise SA cellphone numbers to E.164 (+27...). Returns null if invalid. */
export function toE164(raw: string): string | null {
  const d = (raw || "").replace(/[\s()-]/g, "");
  if (/^0[6-8]\d{8}$/.test(d)) return "+27" + d.slice(1);
  if (/^\+27[6-8]\d{8}$/.test(d)) return d;
  if (/^27[6-8]\d{8}$/.test(d)) return "+" + d;
  return null;
}

export function displayPhone(e164: string): string {
  if (!e164.startsWith("+27")) return e164;
  const n = "0" + e164.slice(3);
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}
