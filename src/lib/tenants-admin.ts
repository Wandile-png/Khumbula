import bcrypt from "bcryptjs";
import { db } from "./db";
import { DEFAULT_BENEFITS, DEFAULT_PLANS } from "./defaults";

export async function createTenantWithOwner(input: {
  slug: string; name: string; tagline: string; policyPrefix: string; brandColor?: string; accentColor?: string;
  owner: { name: string; email: string; password: string };
}) {
  return db.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
      tagline: input.tagline,
      policyPrefix: input.policyPrefix,
      ...(input.brandColor ? { brandColor: input.brandColor } : {}),
      ...(input.accentColor ? { accentColor: input.accentColor } : {}),
      plans: { create: DEFAULT_PLANS.map(({ tiers, ...p }) => ({ ...p, tiers: { create: tiers } })) },
      benefits: { create: DEFAULT_BENEFITS.map((label, i) => ({ label, sortOrder: i })) },
      staff: { create: { name: input.owner.name, email: input.owner.email.toLowerCase(), passwordHash: await bcrypt.hash(input.owner.password, 12), role: "OWNER" } },
    },
  });
}
