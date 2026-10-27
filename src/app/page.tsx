import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.DEFAULT_TENANT) redirect(`/${process.env.DEFAULT_TENANT}`);
  const tenants = await db.tenant.findMany({ orderBy: { name: "asc" } });
  return (
    <main className="page wrap">
      <div className="narrow stack">
        <h1>Funeral homes on this platform</h1>
        {tenants.map((t) => (
          <Link key={t.id} href={`/${t.slug}`} className="panel" style={{ textDecoration: "none" }}>
            <b>{t.name}</b>
            <div className="muted small">{t.tagline}</div>
          </Link>
        ))}
        {!tenants.length && <p className="muted">No funeral homes yet. <Link href="/setup">Set up the first one</Link>.</p>}
      </div>
    </main>
  );
}
