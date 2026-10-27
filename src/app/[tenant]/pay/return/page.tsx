import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { Footer, Masthead } from "@/components/Masthead";

export default async function PayReturn({ params, searchParams }: { params: { tenant: string }; searchParams: { cancelled?: string; policy?: string } }) {
  const t = await getTenant(params.tenant);
  const cancelled = !!searchParams.cancelled;
  return (
    <>
      <Masthead tenant={t} />
      <main className="page wrap">
        <div className="narrow stack">
          <h1>{cancelled ? "Payment not completed" : "Thank you"}</h1>
          <p className="muted">
            {cancelled
              ? "No money was taken. You can try again from your policy page or the link we sent you."
              : `We're confirming your payment with the bank. You'll get a message on your phone once it's received${searchParams.policy ? ` for ${searchParams.policy}` : ""}.`}
          </p>
          <Link className="btn" href={`/${t.slug}/portal`}>Go to my policy</Link>
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
