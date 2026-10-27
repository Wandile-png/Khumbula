import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { createTenantWithOwner } from "@/lib/tenants-admin";

export const dynamic = "force-dynamic";

async function setup(form: FormData) {
  "use server";
  const key = process.env.SETUP_KEY ?? "";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  if (!key || !safeEqual(s("setupKey"), key)) redirect("/setup?e=key");
  const slug = s("slug").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug || !s("name") || !/^\S+@\S+\.\S+$/.test(s("email")) || s("password").length < 10) redirect("/setup?e=fields");
  if (await db.tenant.findUnique({ where: { slug } })) redirect(`/setup?e=slug&slug=${slug}`);
  await createTenantWithOwner({
    slug,
    name: s("name"),
    tagline: s("tagline") || "Compassionate cover for you and your loved ones",
    policyPrefix: (s("prefix") || slug.slice(0, 3)).toUpperCase(),
    owner: { name: s("ownerName") || s("email"), email: s("email"), password: s("password") },
  });
  redirect(`/${slug}/admin/login?created=1`);
}

const ERRORS: Record<string, string> = {
  key: "The setup key is wrong. It's the SETUP_KEY value in your Vercel settings.",
  fields: "Fill in the name, web address, a valid email and a password of at least 10 characters.",
  slug: "That web address is already taken. Choose another.",
};

export default async function Setup({ searchParams }: { searchParams: { e?: string; slug?: string } }) {
  const count = await db.tenant.count();
  return (
    <main className="page wrap">
      <form action={setup} className="narrow stack">
        <div className="stack-s">
          <span className="eyebrow">Platform setup</span>
          <h1>{count ? "Add a funeral home" : "Set up your first funeral home"}</h1>
          <p className="muted">This creates the funeral home with starter plans and benefits, plus its owner login. You can change everything later in Admin → Settings.</p>
        </div>
        {searchParams.e === "slug" && searchParams.slug ? (
          <p className="flash bad">
            A funeral home already uses /{searchParams.slug}. If it's yours, <a href={`/${searchParams.slug}/admin/login`}>sign in to its admin</a>. Otherwise choose a different web address.
          </p>
        ) : searchParams.e ? (
          <p className="flash bad">{ERRORS[searchParams.e] ?? "Something went wrong."}</p>
        ) : null}
        <label className="f">Setup key<input id="setupKey" name="setupKey" type="password" autoComplete="off" required /></label>
        <label className="f">Funeral home name<input id="name" name="name" type="text" placeholder="e.g. Ekuthuleni Funeral Home" required /></label>
        <div className="grid2">
          <label className="f">Web address <span className="hint">Letters, numbers and dashes</span><input id="slug" name="slug" type="text" placeholder="ekuthuleni" required /></label>
          <label className="f">Policy prefix<input id="prefix" name="prefix" type="text" maxLength={4} placeholder="EFH" /></label>
        </div>
        <label className="f">Tagline<input id="tagline" name="tagline" type="text" placeholder="Compassionate cover for you and your loved ones" /></label>
        <hr />
        <div className="grid2">
          <label className="f">Your name<input id="ownerName" name="ownerName" type="text" /></label>
          <label className="f">Admin email<input id="email" name="email" type="email" required /></label>
        </div>
        <label className="f">Admin password <span className="hint">At least 10 characters</span><input id="password" name="password" type="password" minLength={10} required /></label>
        <button className="btn" type="submit">Create funeral home</button>
      </form>
    </main>
  );
}
