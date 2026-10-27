import { getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { holderLabel } from "@/components/PlanTable";
import { saveSettings } from "../../actions";

export default async function Settings({ params, searchParams }: { params: { tenant: string }; searchParams: { ok?: string } }) {
  const t = await getTenant(params.tenant);
  await requireStaff(t.id, t.slug, ["OWNER"]);
  const text = (name: keyof typeof t, label: string, hint?: string) => (
    <label className="f">{label}{hint && <span className="hint">{hint}</span>}<input id={String(name)} name={String(name)} type="text" defaultValue={String(t[name] ?? "")} /></label>
  );
  return (
    <form action={saveSettings.bind(null, t.slug)} className="narrow stack">
      <h1>Settings</h1>
      {searchParams.ok && <p className="flash">Settings saved. Your sign-up pages are updated.</p>}
      <section className="panel stack">
        <h3>Brand</h3>
        {text("name", "Funeral home name")}
        {text("tagline", "Tagline")}
        <div className="grid2">
          <label className="f">Main colour<input id="brandColor" name="brandColor" type="color" defaultValue={t.brandColor} style={{ height: 44, padding: 4 }} /></label>
          <label className="f">Accent colour<input id="accentColor" name="accentColor" type="color" defaultValue={t.accentColor} style={{ height: 44, padding: 4 }} /></label>
        </div>
      </section>
      <section className="panel stack">
        <h3>Contact details</h3>
        <div className="grid2">{text("phone", "Office phone")}{text("whatsapp", "WhatsApp line")}{text("email", "Email")}{text("website", "Website")}</div>
        {text("address", "Branch address")}
        <div className="grid2">{text("underwriter", "Underwriter")}{text("fspNumber", "FSP number")}</div>
      </section>
      <section className="panel stack">
        <h3>Rules and payments</h3>
        <div className="grid2">
          <label className="f">Waiting period (months)<input id="waitingMonths" name="waitingMonths" type="number" min={0} max={24} defaultValue={t.waitingMonths} /></label>
          <label className="f">Days before a premium counts as missed<input id="graceDays" name="graceDays" type="number" min={1} max={31} defaultValue={t.graceDays} /></label>
          <label className="f">Card gateway<select id="cardGateway" name="cardGateway" defaultValue={t.cardGateway}><option value="PAYFAST">PayFast</option><option value="PAYSTACK">Paystack</option></select></label>
        </div>
        <div className="row small">
          {[["DEBICHECK", "Debit order"], ["CARD", "Card"], ["EFT", "Instant EFT"], ["CASH", "Cash"]].map(([m, l]) => (
            <label key={m} className="row" style={{ gap: 6 }}><input type="checkbox" name={`m_${m}`} defaultChecked={t.enabledMethods.includes(m as "CARD")} /> {l}</label>
          ))}
        </div>
      </section>
      <section className="panel stack">
        <h3>Monthly premiums (R)</h3>
        {t.plans.map((p) => (
          <div key={p.id} className="stack-s">
            <b>{p.name}</b>
            {p.tiers.map((x) => (
              <label key={x.id} className="row between small">{holderLabel(p)}, {x.minAge}–{x.maxAge}
                <input id={`tier_${x.id}`} name={`tier_${x.id}`} type="number" step="5" min={0} defaultValue={(x.premiumCents / 100).toFixed(0)} style={{ maxWidth: 120 }} />
              </label>
            ))}
          </div>
        ))}
        <p className="note">New premiums apply to new sign-ups. Existing members keep their premium.</p>
      </section>
      <section className="panel stack">
        <h3>Benefits</h3>
        <label className="f">One per line<textarea id="benefits" name="benefits" rows={12} defaultValue={t.benefits.map((b) => b.label).join("\n")} /></label>
      </section>
      <button className="btn" type="submit">Save settings</button>
    </form>
  );
}
