/**
 * South African ID numbers: YYMMDD SSSS C A Z (13 digits)
 *  - YYMMDD date of birth
 *  - SSSS   0000–4999 female, 5000–9999 male
 *  - C      0 = SA citizen, 1 = permanent resident
 *  - A      historical, usually 8
 *  - Z      Luhn check digit over the first 12 digits
 */
export type ParsedId =
  | { ok: true; dateOfBirth: Date; sex: "F" | "M"; citizen: boolean }
  | { ok: false; error: string };

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function normaliseId(raw: string): string {
  return (raw || "").replace(/\s|-/g, "");
}

export function parseSaId(raw: string, today: Date = new Date()): ParsedId {
  const id = normaliseId(raw);
  if (!/^\d{13}$/.test(id)) return { ok: false, error: "Enter all 13 digits of the SA ID number." };
  if (!luhnValid(id)) return { ok: false, error: "This ID number fails the checksum. Check for a typo." };
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const currentYY = today.getUTCFullYear() % 100;
  const year = (yy > currentYY ? 1900 : 2000) + yy;
  const dob = new Date(Date.UTC(year, mm - 1, dd));
  if (dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) {
    return { ok: false, error: "The date of birth in this ID isn't a real date." };
  }
  const c = id[10];
  if (c !== "0" && c !== "1") return { ok: false, error: "Digit 11 of an SA ID must be 0 or 1." };
  return { ok: true, dateOfBirth: dob, sex: Number(id[6]) >= 5 ? "M" : "F", citizen: c === "0" };
}

export function ageOn(dob: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Build a valid test ID (for seeds and tests only). */
export function makeTestId(yymmdd: string, seq: number, female: boolean): string {
  const s = female ? String(seq % 5000).padStart(4, "0") : String(5000 + (seq % 5000));
  const base = yymmdd + s + "08";
  for (let z = 0; z < 10; z++) if (luhnValid(base + z)) return base + z;
  throw new Error("unreachable");
}
