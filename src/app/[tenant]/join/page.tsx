import { getTenant } from "@/lib/tenant";
import { Footer, Masthead } from "@/components/Masthead";
import { SignupForm } from "@/components/SignupForm";
import { BANKS } from "@/lib/payments/netcash";

export default async function Join({ params, searchParams }: { params: { tenant: string }; searchParams: { plan?: string; agent?: string } }) {
  const t = await getTenant(params.tenant);
  const plans = t.plans.map((p) => ({
    code: p.code, name: p.name, description: p.description, coversSpouse: p.coversSpouse, maxChildren: p.maxChildren,
    maxChildAge: p.maxChildAge, maxExtended: p.maxExtended, tiers: p.tiers.map((x) => ({ id: x.id, minAge: x.minAge, maxAge: x.maxAge, premiumCents: x.premiumCents })),
  }));
  return (
    <>
      <Masthead tenant={t} active="join" />
      <main className="page wrap">
        <SignupForm
          tenant={{ slug: t.slug, name: t.name, waitingMonths: t.waitingMonths, underwriter: t.underwriter, methods: t.enabledMethods, cardGateway: t.cardGateway }}
          plans={plans}
          initialPlan={searchParams.plan}
          initialAgent={searchParams.agent}
          banks={Object.keys(BANKS)}
        />
      </main>
      <Footer tenant={t} />
    </>
  );
}
