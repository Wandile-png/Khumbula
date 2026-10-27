import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { tenant: string } }): Promise<Metadata> {
  const t = await getTenant(params.tenant);
  return { title: t.name, description: t.tagline };
}

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: { tenant: string } }) {
  const t = await getTenant(params.tenant);
  const style = { "--brand": t.brandColor, "--accent": t.accentColor } as React.CSSProperties;
  return <div style={style}>{children}</div>;
}
