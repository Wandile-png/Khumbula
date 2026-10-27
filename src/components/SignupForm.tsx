"use client";

import { useMemo, useState } from "react";
import { ageOn, parseSaId } from "@/lib/sa-id";
import { premiumForAge } from "@/lib/rules";
import { formatRand } from "@/lib/money";
import { addMonths, firstDebitAfter, formatDate, ordinal, todaySA } from "@/lib/dates";
import { PlanTable } from "./PlanTable";

type Tier = { id: string; minAge: number; maxAge: number; premiumCents: number };
type Plan = { code: string; name: string; description: string; coversSpouse: boolean; maxChildren: number; maxChildAge: number; maxExtended: number; tiers: Tier[] };
type Method = "DEBICHECK" | "CARD" | "EFT" | "CASH";
type Props = {
  tenant: { slug: string; name: string; waitingMonths: number; underwriter: string; methods: Method[]; cardGateway: string };
  plans: Plan[];
  initialPlan?: string;
  banks: string[];
};

const STEPS = ["Choose a plan", "Your details", "Family & beneficiary", "Payment", "Confirm"];
const METHOD_TEXT: Record<Method, [string, string]> = {
  DEBICHECK: ["Debit order (DebiCheck)", "Approve the mandate once on your banking app. Collected on your chosen day each month."],
  CARD: ["Card", "Your card is saved securely by the payment gateway and charged monthly."],
  EFT: ["Instant EFT", "We send a secure pay link 3 days before each due date."],
  CASH: ["Cash at our branch", "Pay at our office using your policy number as the reference."],
};
const DAYS = [1, 15, 20, 25, 26, 28];

export function SignupForm({ tenant, plans, initialPlan, banks }: Props) {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState(initialPlan && plans.some((p) => p.code === initialPlan) ? initialPlan : plans[0]?.code);
  const [me, setMe] = useState({ firstName: "", lastName: "", idNumber: "", phone: "", email: "", address: "" });
  const [spouse, setSpouse] = useState({ name: "", idNumber: "" });
  const [children, setChildren] = useState<{ name: string; age: string }[]>([]);
  const [extended, setExtended] = useState<{ name: string; relation: string }[]>([]);
  const [ben, setBen] = useState({ name: "", relation: "", phone: "" });
  const [method, setMethod] = useState<Method>(tenant.methods[0]);
  const [bank, setBank] = useState({ bank: banks[0] ?? "", accountType: "Savings", accountNumber: "" });
  const [debitDay, setDebitDay] = useState(1);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const p = plans.find((x) => x.code === plan)!;
  const today = todaySA();
  const id = useMemo(() => (me.idNumber.replace(/\s/g, "").length === 13 ? parseSaId(me.idNumber) : null), [me.idNumber]);
  const age = id && id.ok ? ageOn(id.dateOfBirth, today) : null;
  const premium = age != null ? premiumForAge(p.tiers, age) : null;
  const firstDebit = firstDebitAfter(today, debitDay);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (!me.firstName.trim()) e.firstName = "Enter your first name.";
      if (!me.lastName.trim()) e.lastName = "Enter your surname.";
      const r = parseSaId(me.idNumber);
      if (!r.ok) e.idNumber = r.error;
      else if (premium == null) e.idNumber = `Age ${age} is outside this plan's entry ages. Go back and choose another plan.`;
      if (!/^0[6-8]\d{8}$/.test(me.phone.replace(/\s/g, ""))) e.phone = "Enter a 10-digit SA cellphone number starting with 06, 07 or 08.";
      if (me.email && !/^\S+@\S+\.\S+$/.test(me.email)) e.email = "Check the email address.";
    }
    if (step === 2) {
      if (spouse.name && !parseSaId(spouse.idNumber).ok) e.spouse = "Spouse ID: " + (parseSaId(spouse.idNumber) as { error: string }).error;
      if (children.some((c) => c.name && (c.age === "" || +c.age < 0 || +c.age > p.maxChildAge))) e.children = `Children must be aged 0 to ${p.maxChildAge}.`;
      if (extended.some((x) => x.name && !x.relation.trim())) e.extended = "Add a relationship for each family member.";
      if (!ben.name.trim() || !/^0[6-8]\d{8}$/.test(ben.phone.replace(/\s/g, ""))) e.ben = "Add your beneficiary's name and a valid cellphone number.";
    }
    if (step === 3 && method === "DEBICHECK" && !/^\d{7,12}$/.test(bank.accountNumber.replace(/\s/g, ""))) e.account = "Account numbers are 7 to 12 digits.";
    if (step === 4 && !consent) e.consent = "Tick the box to accept the terms.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function submit() {
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch(`/api/${tenant.slug}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: plan,
          ...me,
          spouse: p.coversSpouse && spouse.name ? spouse : null,
          children: children.filter((c) => c.name).map((c) => ({ name: c.name, age: Number(c.age) })),
          extended: extended.filter((x) => x.name),
          beneficiary: ben,
          method,
          debitDay,
          bank: method === "DEBICHECK" ? { ...bank, accountNumber: bank.accountNumber.replace(/\s/g, "") } : null,
          consent,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors({ submit: json.error ?? "Something went wrong. Please try again." });
        setBusy(false);
        return;
      }
      window.location.href = json.next;
    } catch {
      setErrors({ submit: "We couldn't reach the server. Check your connection and try again." });
      setBusy(false);
    }
  }

  function next() {
    if (!validate()) return;
    if (step === 4) return void submit();
    setStep(step + 1);
    window.scrollTo(0, 0);
  }

  const err = (k: string) => (errors[k] ? <span className="err">{errors[k]}</span> : null);
  const peopleCovered = 1 + (spouse.name ? 1 : 0) + children.filter((c) => c.name).length + extended.filter((x) => x.name).length;

  return (
    <div className="narrow stack">
      <div className="stack-s">
        <span className="eyebrow">{tenant.name}</span>
        <h1>{STEPS[step]}</h1>
      </div>
      <div>
        <div className="steps">{STEPS.map((_, i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>
        <span className="muted small">Step {step + 1} of {STEPS.length}</span>
      </div>

      {step === 0 && (
        <div className="stack">
          {plans.map((x) => (
            <label key={x.code} className="plan">
              <input type="radio" name="plan" checked={plan === x.code} onChange={() => setPlan(x.code)} />
              <PlanTable plan={x} />
            </label>
          ))}
          <p className="note">A {tenant.waitingMonths}-month waiting period applies to death from natural causes. Accidental death is covered from your first paid premium.</p>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <div className="grid2">
            <label className="f">First name<input id="firstName" type="text" autoComplete="given-name" value={me.firstName} onChange={(e) => setMe({ ...me, firstName: e.target.value })} />{err("firstName")}</label>
            <label className="f">Surname<input id="lastName" type="text" autoComplete="family-name" value={me.lastName} onChange={(e) => setMe({ ...me, lastName: e.target.value })} />{err("lastName")}</label>
          </div>
          <label className="f">SA ID number <span className="hint">We read your age from it to set your premium.</span>
            <input id="idNumber" type="text" inputMode="numeric" maxLength={13} className="mono" value={me.idNumber} onChange={(e) => setMe({ ...me, idNumber: e.target.value.replace(/\D/g, "") })} />
            {errors.idNumber ? err("idNumber") : id && (id.ok ? (premium != null ? <span className="ok">Age {age} · premium {formatRand(premium)} per month</span> : <span className="err">Age {age} is outside this plan's entry ages.</span>) : <span className="err">{id.error}</span>)}
          </label>
          <div className="grid2">
            <label className="f">Cellphone<input id="phone" type="tel" autoComplete="tel" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} />{err("phone")}</label>
            <label className="f">Email <span className="hint">Optional</span><input id="email" type="email" autoComplete="email" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} />{err("email")}</label>
          </div>
          <label className="f">Home address<textarea id="address" rows={2} value={me.address} onChange={(e) => setMe({ ...me, address: e.target.value })} /></label>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          {p.coversSpouse && (
            <div className="panel stack">
              <h3>Spouse</h3>
              <div className="grid2">
                <label className="f">Full name <span className="hint">Leave blank if none</span><input id="spouseName" type="text" value={spouse.name} onChange={(e) => setSpouse({ ...spouse, name: e.target.value })} /></label>
                <label className="f">SA ID number<input id="spouseId" type="text" inputMode="numeric" maxLength={13} className="mono" value={spouse.idNumber} onChange={(e) => setSpouse({ ...spouse, idNumber: e.target.value.replace(/\D/g, "") })} /></label>
              </div>
              {err("spouse")}
            </div>
          )}
          {p.maxChildren > 0 && (
            <div className="panel stack">
              <div className="row between"><div><h3>Children</h3><span className="muted small">Aged 0–{p.maxChildAge}. Up to {p.maxChildren}.</span></div><span className="muted small num">{children.length}/{p.maxChildren}</span></div>
              {children.map((c, i) => (
                <div className="dep" key={i}>
                  <label className="f">Name<input id={`child-${i}-name`} type="text" value={c.name} onChange={(e) => setChildren(children.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></label>
                  <label className="f">Age<input id={`child-${i}-age`} type="number" min={0} max={p.maxChildAge} value={c.age} onChange={(e) => setChildren(children.map((x, j) => (j === i ? { ...x, age: e.target.value } : x)))} /></label>
                  <button type="button" className="btn ghost sm rm" onClick={() => setChildren(children.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              {err("children")}
              {children.length < p.maxChildren && <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setChildren([...children, { name: "", age: "" }])}>Add child</button>}
            </div>
          )}
          {p.maxExtended > 0 && (
            <div className="panel stack">
              <div className="row between"><div><h3>Extended family</h3><span className="muted small">Parents, siblings, in-laws, grandparents. Up to {p.maxExtended}.</span></div><span className="muted small num">{extended.length}/{p.maxExtended}</span></div>
              {extended.map((x, i) => (
                <div className="dep" key={i}>
                  <label className="f">Name<input id={`ext-${i}-name`} type="text" value={x.name} onChange={(e) => setExtended(extended.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></label>
                  <label className="f">Relationship<input id={`ext-${i}-rel`} type="text" placeholder="e.g. Mother" value={x.relation} onChange={(e) => setExtended(extended.map((y, j) => (j === i ? { ...y, relation: e.target.value } : y)))} /></label>
                  <button type="button" className="btn ghost sm rm" onClick={() => setExtended(extended.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              {err("extended")}
              {extended.length < p.maxExtended && <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setExtended([...extended, { name: "", relation: "" }])}>Add family member</button>}
            </div>
          )}
          <div className="panel stack">
            <h3>Beneficiary</h3>
            <p className="muted small">The person we pay out to, or who arranges the service, if you pass away.</p>
            <div className="grid2">
              <label className="f">Full name<input id="benName" type="text" value={ben.name} onChange={(e) => setBen({ ...ben, name: e.target.value })} /></label>
              <label className="f">Relationship<input id="benRel" type="text" placeholder="e.g. Sister" value={ben.relation} onChange={(e) => setBen({ ...ben, relation: e.target.value })} /></label>
              <label className="f">Cellphone<input id="benPhone" type="tel" value={ben.phone} onChange={(e) => setBen({ ...ben, phone: e.target.value })} /></label>
            </div>
            {err("ben")}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          {tenant.methods.map((m) => (
            <label key={m} className="opt">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              <span className="stack-s" style={{ gap: 2 }}>
                <b>{METHOD_TEXT[m][0]}{m === "CARD" && <span className="muted" style={{ fontWeight: 500 }}> via {tenant.cardGateway === "PAYSTACK" ? "Paystack" : "PayFast"}</span>}</b>
                <span className="muted small">{METHOD_TEXT[m][1]}</span>
              </span>
            </label>
          ))}
          {method === "DEBICHECK" && (
            <div className="panel grid2">
              <label className="f">Bank<select id="bank" value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })}>{banks.map((b) => <option key={b}>{b}</option>)}</select></label>
              <label className="f">Account type<select id="accountType" value={bank.accountType} onChange={(e) => setBank({ ...bank, accountType: e.target.value })}>{["Savings", "Cheque", "Transmission"].map((b) => <option key={b}>{b}</option>)}</select></label>
              <label className="f">Account number<input id="accountNumber" type="text" inputMode="numeric" className="mono" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} />{err("account")}</label>
            </div>
          )}
          <label className="f">Premium day <span className="hint">Match it to your payday.</span>
            <select id="debitDay" value={debitDay} onChange={(e) => setDebitDay(Number(e.target.value))}>
              {DAYS.map((d) => <option key={d} value={d}>{ordinal(d)} of each month</option>)}
            </select>
          </label>
        </div>
      )}

      {step === 4 && premium != null && (
        <div className="stack">
          <div className="panel summary num">
            <div><span className="muted">Plan</span><span>{p.name}</span></div>
            <div><span className="muted">Main member</span><span>{me.firstName} {me.lastName}, {age}</span></div>
            <div><span className="muted">People covered</span><span>{peopleCovered}</span></div>
            <div><span className="muted">Beneficiary</span><span>{ben.name}</span></div>
            <hr />
            <div><span className="muted">Monthly premium</span><span>{formatRand(premium)}</span></div>
            <div><span className="muted">Paid by</span><span>{METHOD_TEXT[method][0]}{method === "DEBICHECK" ? ` · ${bank.bank} ••${bank.accountNumber.slice(-4)}` : ""}</span></div>
            <div><span className="muted">First premium</span><span>{formatDate(firstDebit)}</span></div>
            <div><span className="muted">Natural-death cover from</span><span>{formatDate(addMonths(firstDebit, tenant.waitingMonths))}</span></div>
          </div>
          <label className="opt">
            <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="small">I confirm the information is correct. I accept the policy terms and the {tenant.waitingMonths}-month waiting period, and I agree that {tenant.name} may process my and my family's personal information under POPIA to administer this policy.</span>
          </label>
          {err("consent")}
          {tenant.underwriter && <p className="note">Underwritten by {tenant.underwriter}.</p>}
        </div>
      )}

      {err("submit")}
      <div className="row between">
        {step > 0 ? <button type="button" className="btn ghost" onClick={() => { setErrors({}); setStep(step - 1); }}>Back</button> : <span />}
        <button type="button" className="btn" onClick={next} disabled={busy}>{busy ? "Activating…" : step === 4 ? "Activate my policy" : "Continue"}</button>
      </div>
    </div>
  );
}
