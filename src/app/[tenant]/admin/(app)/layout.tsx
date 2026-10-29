import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { requireStaff } from "@/lib/auth";
import { Masthead } from "@/components/Masthead";
import { AdminNav } from "@/components/AdminNav";
import { staffLogout } from "../actions";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: { tenant: string } }) {
  const t = await getTenant(params.tenant);
  const s = await requireStaff(t.id, t.slug);
  if (s.role === "AGENT") redirect(`/${t.slug}/agent`);
  return (
    <>
      <Masthead tenant={t} />
      <div className="wrap">
        <div className="container row between">
          <AdminNav slug={t.slug} />
          <form action={staffLogout.bind(null, t.slug)} className="row small"><span className="muted">{s.email}</span><button className="btn ghost sm" type="submit">Sign out</button></form>
        </div>
      </div>
      <main className="page wrap"><div className="container">{children}</div></main>
    </>
  );
}
