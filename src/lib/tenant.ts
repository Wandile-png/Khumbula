import { cache } from "react";
import { notFound } from "next/navigation";
import { db } from "./db";

export const getTenant = cache(async (slug: string) => {
  const t = await db.tenant.findUnique({
    where: { slug },
    include: {
      plans: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { tiers: { orderBy: { minAge: "asc" } } } },
      benefits: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!t) notFound();
  return t;
});

export type TenantFull = Awaited<ReturnType<typeof getTenant>>;

export function appUrl(path = "") {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "") + path;
}
