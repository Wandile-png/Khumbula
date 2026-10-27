import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { parseSaId, makeTestId, ageOn, luhnValid } from "./sa-id";
import { formatRand } from "./money";
import { firstDebitAfter, debitDateIn, addMonths, utcDate, ordinal } from "./dates";
import { computeStatus, premiumForAge, claimScreen, consecutiveMissed } from "./rules";
import { pfSignature, pfEncode, buildPayfastForm } from "./payments/payfast";
import { verifyPaystackSignature } from "./payments/paystack";
import { toE164 } from "./phone";

process.env.DATA_KEY = Buffer.alloc(32, 7).toString("base64");

test("SA ID: valid, checksum and date", () => {
  const id = makeTestId("880415", 4321, true);
  assert.equal(id.length, 13);
  const p = parseSaId(id, utcDate(2026, 9, 27));
  assert.ok(p.ok);
  if (p.ok) {
    assert.equal(p.sex, "F");
    assert.equal(ageOn(p.dateOfBirth, utcDate(2026, 9, 27)), 38);
  }
  const bad = id.slice(0, 12) + ((Number(id[12]) + 1) % 10);
  assert.equal(parseSaId(bad).ok, false);
  assert.equal(parseSaId("8802305009081").ok, false); // 30 Feb
  assert.ok(luhnValid("8001015009087"));
});

test("SA ID: century boundary", () => {
  const today = utcDate(2026, 9, 27);
  const kid = parseSaId(makeTestId("150101", 1, false), today);
  const gran = parseSaId(makeTestId("400101", 1, false), today);
  assert.ok(kid.ok && gran.ok);
  if (kid.ok && gran.ok) {
    assert.equal(kid.dateOfBirth.getUTCFullYear(), 2015);
    assert.equal(gran.dateOfBirth.getUTCFullYear(), 1940);
  }
});

test("money format", () => {
  assert.equal(formatRand(12000), "R 120.00");
  assert.equal(formatRand(123456789), "R 1 234 567.89");
  assert.equal(formatRand(44000, { whole: true }), "R 440");
});

test("debit dates clamp to month end and skip sign-up day", () => {
  assert.equal(debitDateIn(2026, 1, 31).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(firstDebitAfter(utcDate(2026, 9, 25), 25).toISOString().slice(0, 10), "2026-11-25");
  assert.equal(firstDebitAfter(utcDate(2026, 9, 24), 25).toISOString().slice(0, 10), "2026-10-25");
  assert.equal(addMonths(utcDate(2026, 0, 31), 1).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(22), "22nd");
});

test("premium tiers", () => {
  const tiers = [{ minAge: 18, maxAge: 64, premiumCents: 12000 }, { minAge: 65, maxAge: 84, premiumCents: 15000 }];
  assert.equal(premiumForAge(tiers, 64), 12000);
  assert.equal(premiumForAge(tiers, 65), 15000);
  assert.equal(premiumForAge(tiers, 85), null);
});

test("policy status", () => {
  const today = utcDate(2026, 9, 27);
  const P = (m: number, status: "PAID" | "MISSED" | "DUE") => ({ dueDate: utcDate(2026, m, 1), status });
  const base = { cancelled: false, firstPaidAt: utcDate(2026, 0, 1), waitingEndsAt: utcDate(2026, 6, 1), today };
  assert.equal(computeStatus({ ...base, premiums: [P(8, "PAID"), P(9, "PAID")] }), "ACTIVE");
  assert.equal(computeStatus({ ...base, premiums: [P(8, "PAID"), P(9, "MISSED")] }), "ARREARS");
  assert.equal(computeStatus({ ...base, premiums: [P(8, "MISSED"), P(9, "MISSED")] }), "LAPSED");
  assert.equal(computeStatus({ ...base, premiums: [P(8, "MISSED"), P(9, "PAID"), P(10, "DUE")] }), "ACTIVE");
  assert.equal(computeStatus({ ...base, waitingEndsAt: utcDate(2027, 0, 1), premiums: [P(9, "PAID")] }), "WAITING");
  assert.equal(computeStatus({ ...base, firstPaidAt: null, premiums: [P(10, "DUE")] }), "PENDING");
  assert.equal(consecutiveMissed([P(9, "MISSED"), P(10, "DUE")]), 1);
});

test("claim screening", () => {
  const base = { status: "WAITING" as const, firstPaidAt: utcDate(2026, 6, 1), waitingEndsAt: utcDate(2027, 0, 1), dateOfDeath: utcDate(2026, 9, 1) };
  assert.equal(claimScreen({ ...base, cause: "NATURAL" }).covered, false);
  assert.equal(claimScreen({ ...base, cause: "ACCIDENTAL" }).covered, true);
  assert.equal(claimScreen({ ...base, status: "LAPSED", cause: "ACCIDENTAL" }).covered, false);
});

test("PayFast encoding and signature", () => {
  assert.equal(pfEncode("Single cover (R120)"), "Single+cover+%28R120%29");
  const fields: [string, string][] = [["merchant_id", "10000100"], ["merchant_key", "46f0cd694581a"], ["amount", "120.00"], ["item_name", "Test Item"]];
  const expected = createHash("md5").update("merchant_id=10000100&merchant_key=46f0cd694581a&amount=120.00&item_name=Test+Item&passphrase=jt7NOE43FZPn").digest("hex");
  assert.equal(pfSignature(fields, "jt7NOE43FZPn"), expected);
  process.env.PAYFAST_MERCHANT_ID = "10000100";
  process.env.PAYFAST_MERCHANT_KEY = "46f0cd694581a";
  const form = buildPayfastForm({ policyNumber: "EFH-1001", firstName: "Thandi", lastName: "Nkosi", amountCents: 28000, itemName: "Immediate family", returnUrl: "https://x/r", cancelUrl: "https://x/c", notifyUrl: "https://x/n", subscription: { billingDate: utcDate(2026, 10, 1) } });
  const map = Object.fromEntries(form.fields);
  assert.equal(map.recurring_amount, "280.00");
  assert.equal(map.frequency, "3");
  assert.equal(map.billing_date, "2026-11-01");
  assert.equal(map.signature, pfSignature(form.fields.filter(([k]) => k !== "signature")));
  assert.ok(form.action.includes("sandbox"));
});

test("Paystack webhook signature", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
  const sig = createHmac("sha512", "sk_test_abc").update(body).digest("hex");
  assert.ok(verifyPaystackSignature(body, sig, "sk_test_abc"));
  assert.ok(!verifyPaystackSignature(body + " ", sig, "sk_test_abc"));
});

test("phone normalisation", () => {
  assert.equal(toE164("072 123 4567"), "+27721234567");
  assert.equal(toE164("+27 82 555 0000"), "+27825550000");
  assert.equal(toE164("011 123 4567"), null);
});

test("ID encryption round trip", async () => {
  const { encrypt, decrypt, lookupHash } = await import("./crypto");
  const id = makeTestId("900101", 77, false);
  const enc = encrypt(id);
  assert.notEqual(enc, id);
  assert.equal(decrypt(enc), id);
  assert.equal(lookupHash(id), lookupHash(id));
});
