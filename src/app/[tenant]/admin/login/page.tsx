import { getTenant } from "@/lib/tenant";
import { Masthead } from "@/components/Masthead";
import { staffLogin } from "../actions";

export default async function AdminLogin({ params, searchParams }: { params: { tenant: string }; searchParams: { e?: string; created?: string } }) {
  const t = await getTenant(params.tenant);
  return (
    <>
      <Masthead tenant={t} />
      <main className="page wrap">
        <form action={staffLogin.bind(null, t.slug)} className="narrow stack" style={{ maxWidth: 420 }}>
          <div className="stack-s"><span className="eyebrow">Staff and agents</span><h1>Sign in</h1></div>
          {searchParams.created && <p className="flash">{t.name} is set up. Sign in with the admin email and password you just chose.</p>}
          {searchParams.e === "bad" && <p className="flash bad">That email and password don't match.</p>}
          {searchParams.e === "rate" && <p className="flash bad">Too many attempts. Wait 15 minutes.</p>}
          <label className="f">Email<input id="email" name="email" type="email" autoComplete="username" required /></label>
          <label className="f">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn" type="submit">Sign in</button>
        </form>
      </main>
    </>
  );
}
