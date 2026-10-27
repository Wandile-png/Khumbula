import { getTenant } from "@/lib/tenant";
import { Footer, Masthead } from "@/components/Masthead";
import { requestOtp, verifyOtp } from "../actions";

const ERRORS: Record<string, string> = {
  id: "Enter all 13 digits of your SA ID number.",
  rate: "Too many attempts. Wait an hour or call us.",
  code: "That code is incorrect. Check the SMS and try again.",
  expired: "That code has expired. Request a new one.",
};

export default async function Login({ params, searchParams }: { params: { tenant: string }; searchParams: { step?: string; ref?: string; to?: string; e?: string; test?: string } }) {
  const t = await getTenant(params.tenant);
  const codeStep = searchParams.step === "code" && searchParams.ref;
  return (
    <>
      <Masthead tenant={t} active="portal" />
      <main className="page wrap">
        <div className="narrow stack" style={{ maxWidth: 440 }}>
          <div className="stack-s">
            <span className="eyebrow">My policy</span>
            <h1>{codeStep ? "Enter your code" : "Sign in"}</h1>
            <p className="muted">
              {codeStep
                ? `If your ID number is on a policy, we've sent a 6-digit code by SMS${searchParams.to ? ` to the number ending ${searchParams.to}` : ""}.`
                : "Enter your SA ID number. We'll SMS a code to the cellphone on your policy."}
            </p>
          </div>
          {searchParams.test && <p className="note">Test mode is on, so no SMS was sent. Your code is <b className="mono">{searchParams.test}</b>.</p>}
          {searchParams.e && <p className="flash bad">{ERRORS[searchParams.e] ?? "Something went wrong."}</p>}
          {codeStep ? (
            <form action={verifyOtp.bind(null, t.slug)} className="stack">
              <input type="hidden" name="ref" value={searchParams.ref} />
              <label className="f">6-digit code<input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="mono" required /></label>
              <button className="btn" type="submit">Sign in</button>
              <a className="muted small" href={`/${t.slug}/portal/login`}>Send a new code</a>
            </form>
          ) : (
            <form action={requestOtp.bind(null, t.slug)} className="stack">
              <label className="f">SA ID number<input id="idNumber" name="idNumber" type="text" inputMode="numeric" maxLength={13} className="mono" required /></label>
              <button className="btn" type="submit">Send my code</button>
            </form>
          )}
        </div>
      </main>
      <Footer tenant={t} />
    </>
  );
}
