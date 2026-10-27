import { formatRand } from "@/lib/money";

type PlanWithTiers = {
  code: string; name: string; description: string; coversSpouse: boolean; maxChildren: number; maxChildAge: number; maxExtended: number;
  tiers: { id: string; minAge: number; maxAge: number; premiumCents: number }[];
};

export function holderLabel(p: PlanWithTiers) {
  if (p.maxExtended) return `Policy holder + ${p.maxExtended} ext`;
  if (p.coversSpouse) return "Policy holder & spouse";
  return "Policy holder";
}

export function PlanTable({ plan }: { plan: PlanWithTiers }) {
  const from = Math.min(...plan.tiers.map((t) => t.premiumCents));
  return (
    <>
      <div className="band">
        <span>{plan.name.toUpperCase()}</span>
        <span className="price">{formatRand(from, { whole: true })}<span style={{ fontSize: 12 }}>/pm</span></span>
      </div>
      <div className="tt num">
        <div className="th"><span>Main member</span><span>Age</span><span>Premium</span></div>
        {plan.tiers.map((t) => (
          <div className="tr" key={t.id}><span>{holderLabel(plan)}</span><span>{t.minAge} – {t.maxAge} years</span><span>{formatRand(t.premiumCents)}</span></div>
        ))}
        {plan.maxChildren > 0 && <div className="tr"><span>Children</span><span>0 – {plan.maxChildAge} years</span><span className="muted">Included</span></div>}
      </div>
      {plan.description && <p className="muted small" style={{ padding: "10px 14px" }}>{plan.description}</p>}
    </>
  );
}
