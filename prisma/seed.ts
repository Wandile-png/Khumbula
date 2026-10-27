/** Local development seed: one demo funeral home with an owner and sample members. Not used in production. */
import { PrismaClient } from "@prisma/client";
import { createTenantWithOwner } from "../src/lib/tenants-admin";
import { createPolicy } from "../src/lib/policies";
import { makeTestId } from "../src/lib/sa-id";

const db = new PrismaClient();

async function main() {
  const slug = process.env.SEED_SLUG ?? "demo";
  if (await db.tenant.findUnique({ where: { slug } })) return console.log(`Tenant "${slug}" already exists`);
  const t = await createTenantWithOwner({
    slug, name: "Demo Funeral Home", tagline: "Compassionate cover for you and your loved ones", policyPrefix: "DFH",
    owner: { name: "Owner", email: process.env.SEED_EMAIL ?? "owner@example.com", password: process.env.SEED_PASSWORD ?? "change-me-please" },
  });
  await db.tenant.update({ where: { id: t.id }, data: { phone: "010 000 0000", whatsapp: "060 000 0000", underwriter: "Sample Underwriter" } });
  const people: [string, string, string, boolean, string, "DEBICHECK" | "CARD" | "EFT" | "CASH"][] = [
    ["Nomvula", "Dlamini", "850312", true, "family", "DEBICHECK"],
    ["Sipho", "Mahlangu", "780904", false, "extended", "CARD"],
    ["Thandeka", "Nkosi", "920117", true, "single", "EFT"],
    ["Palesa", "Mokoena", "570210", true, "single", "CASH"],
  ];
  for (const [i, [first, last, dob, f, plan, method]] of people.entries()) {
    await createPolicy(t.id, {
      planCode: plan, firstName: first, lastName: last, idNumber: makeTestId(dob, 200 + i, f), phone: `+2772${String(1000000 + i * 1111).padStart(7, "0")}`,
      email: "", address: "", spouse: null, children: plan === "family" ? [{ name: "Ayanda " + last, age: 9 }] : [],
      extended: plan === "extended" ? [{ name: "Grace " + last, relation: "Mother" }] : [], beneficiary: { name: "Beneficiary " + last, relation: "Sibling", phone: "+27820000000" },
      method, debitDay: [1, 15, 25, 26][i], bank: method === "DEBICHECK" ? { bank: "Capitec", accountType: "Savings", accountNumber: "1234567890" } : null,
    });
  }
  console.log(`Seeded "${slug}". Admin: /${slug}/admin/login`);
}

main().finally(() => db.$disconnect());
