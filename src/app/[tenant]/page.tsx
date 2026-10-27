import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { Footer, Masthead } from "@/components/Masthead";
import { PlanTable } from "@/components/PlanTable";

export default async function TenantHome({ params }: { params: { tenant: string } }) {
  const t = await getTenant(params.tenant);
  return (
    <>
      <Masthead tenant={t} active="join" />
      <main className="page wrap">
        <div className="narrow stack">
          <div className="hero">
            <span className="pill">Tailor-made packages and group schemes on request</span>
            <p className="tag">{t.tagline}</p>
            <p className="small" style={{ opacity: 0.8 }}>Choose a plan, add your family and pay by debit order, card, EFT or cash. It takes about five minutes.</p>
            <div className="row" style={{ marginTop: 6 }}>
              <Link className="btn" href={`/${t.slug}/join`} style={{ background: "var(--accent)", color: "#16130F" }}>Get cover now</Link>
              <Link className="btn ghost" href={`/${t.slug}/portal`} style={{ color: "var(--onbrand)", borderColor: "color-mix(in srgb, var(--onbrand) 30%, transparent)" }}>I'm already a member</Link>
            </div>
          </div>
          <h2 style={{ fontStyle: "italic", fontSize: 26 }}>Our Basic Funeral Plans</h2>
          {t.plans.map((p) => (
            <Link key={p.id} href={`/${t.slug}/join?plan=${p.code}`} className="plan" style={{ textDecoration: "none" }}>
              <PlanTable plan={p} />
            </Link>
          ))}
          <section className="panel stack">
            <h2 style={{ fontStyle: "italic" }}>Our Benefits</h2>
            <ul className="benefits">{t.benefits.map((b) => <li key={b.id}>{b.label}</li>)}</ul>
            <p className="note">{t.waitingMonths} months waiting period applicable for all plans. Accidental death is covered from your first paid premium.</p>
          </section>
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
