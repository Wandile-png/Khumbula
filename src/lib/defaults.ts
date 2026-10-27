/** Starter plans and benefits for a new funeral home. Edit them afterwards in Admin → Settings. */
export const DEFAULT_PLANS = [
  { code: "single", name: "Single cover", description: "Covers you, the main member.", coversSpouse: false, maxChildren: 0, maxExtended: 0, sortOrder: 1,
    tiers: [{ minAge: 18, maxAge: 64, premiumCents: 12000 }, { minAge: 65, maxAge: 84, premiumCents: 15000 }] },
  { code: "family", name: "Immediate family", description: "Covers you, your spouse and your children up to 21.", coversSpouse: true, maxChildren: 6, maxExtended: 0, sortOrder: 2,
    tiers: [{ minAge: 18, maxAge: 64, premiumCents: 28000 }] },
  { code: "extended", name: "Extended family", description: "Covers you plus up to 15 extended family members.", coversSpouse: true, maxChildren: 6, maxExtended: 15, sortOrder: 3,
    tiers: [{ minAge: 18, maxAge: 84, premiumCents: 44000 }] },
];

export const DEFAULT_BENEFITS = [
  "2 Tier Casket", "Hearse", "2x Family Cars", "Medium Coffin Spray", "Wreath (2 Upright)", "50x Programmes", "Removal & Storage",
  "Death Registration", "Duduzane", "Grave Prep", "Grave Fee up to R2000", "Frame Tent (6x12)", "50 Chairs", "4x Tables", "A1 Photo",
  "Toilet", "Grave Marker", "Refreshments", "PA System",
];
