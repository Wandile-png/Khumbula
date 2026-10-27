# Khumbula — funeral cover platform

White-label sign-up, member portal and subscription billing for South African funeral homes. Each funeral home (tenant) gets its own branded pages at `/<slug>`, its own plans and premiums, and its own admin.

## What's in it

| Area | What it does |
|---|---|
| Sign-up (`/<slug>/join`) | Plan choice, SA ID validation (checksum + age → premium tier), spouse, children 0–21, up to 15 extended members, beneficiary, POPIA consent |
| Payments | Debit order (DebiCheck), card (PayFast subscription or Paystack saved card), Instant EFT pay links, cash at branch |
| Member portal (`/<slug>/portal`) | Sign in with ID number + SMS code, see cover status and waiting period, pay arrears, report a death |
| Admin (`/<slug>/admin`) | Premium book, arrears, policies, record cash payments, approve mandates, claims workflow with waiting-period screening, message queue, brand and premium settings |
| Daily job (`/api/cron/daily`) | Creates premiums, charges Paystack cards, marks missed premiums, moves policies between Waiting / Covered / Arrears / Lapsed, sends WhatsApp/SMS reminders |

Policy rules: cover starts with the first paid premium; natural-death cover after the waiting period (default 6 months); accidental death from the first premium; one missed premium = arrears; two consecutive = lapsed.

ID numbers are encrypted at rest (AES-256-GCM). Full bank account numbers are passed to the debit-order provider and never stored; only the last four digits are kept.

## Deploy from your phone (GitHub + Vercel + Neon)

1. **Code on GitHub.** The repository holds this code.
2. **Vercel.** In your phone's browser go to vercel.com → sign in with GitHub → **Add New → Project** → import the repository. Don't deploy yet if it asks; open **Settings → Environment Variables** first (step 4). If it deploys immediately, the first build fails because there's no database; that's fine.
3. **Database.** In the Vercel project open **Storage → Create → Neon (Postgres)** → free plan → connect it to the project. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
4. **Environment variables.** Add these in **Settings → Environment Variables** (all environments):
   - `APP_URL` — your Vercel address, e.g. `https://khumbula.vercel.app`
   - `SESSION_SECRET`, `DATA_KEY`, `SETUP_KEY`, `CRON_SECRET` — long random values (`DATA_KEY` must be 32 bytes in base64; never change it after members sign up or their ID numbers can't be read)
   - `MESSAGING_DRY_RUN` = `true` until WhatsApp/SMS are set up
   - `PAYFAST_MERCHANT_ID` = `10000100`, `PAYFAST_MERCHANT_KEY` = `46f0cd694581a`, `PAYFAST_SANDBOX` = `true` (PayFast's public sandbox account, for testing)
5. **Deploy.** **Deployments → Redeploy**. The build creates the database tables.
6. **Set up the first funeral home.** Open `https://<your-app>/setup`, enter the `SETUP_KEY`, the funeral home's name, a web address (e.g. `ekuthuleni`) and your admin login.
7. **Try it.** `/<slug>` is the public sign-up page, `/<slug>/admin` is the admin.

The daily billing job runs at 06:00 SA time via `vercel.json`. You can also run it from Admin → Dashboard → **Run billing now**.

## Going live checklist

- [ ] **PayFast**: live merchant ID, key and passphrase; set `PAYFAST_SANDBOX=false`. Recurring billing must be enabled on the PayFast account.
- [ ] **Paystack** (if used instead of PayFast for cards): `PAYSTACK_SECRET_KEY`; webhook URL `https://<app>/api/webhooks/paystack`.
- [ ] **DebiCheck**: open a Netcash account. Until `NETCASH_DEBICHECK_SERVICE_KEY` is set, mandates run in manual mode (staff mark them approved in Admin). Finish `src/lib/payments/netcash.ts` with Netcash's sandbox. Netcash results post to `/api/webhooks/netcash`.
- [ ] **WhatsApp**: Meta WhatsApp Business account, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`. Create templates in WhatsApp Manager with the names and bodies in `src/lib/messaging/templates.ts`.
- [ ] **SMS**: BulkSMS token (`BULKSMS_TOKEN_ID`, `BULKSMS_TOKEN_SECRET`); needed for member login codes. Then set `MESSAGING_DRY_RUN=false`.
- [ ] **Compliance**: underwriter agreement and FSP number in Settings; policy wording and terms page; POPIA information officer registered; FAIS disclosures on the sign-up page.
- [ ] **Domain**: add the funeral home's domain in Vercel → Domains and update `APP_URL`.

## Local development (needs a computer)

```bash
cp .env.example .env      # fill in DATABASE_URL etc.
npm install
npx prisma db push
npm run db:seed           # demo funeral home at /demo
npm run dev
npm test                  # core rule tests
```

## Code map

- `prisma/schema.prisma` — data model
- `src/lib/rules.ts` — premium tiers, status and claim screening (pure, tested)
- `src/lib/policies.ts` — sign-up, payments, status refresh
- `src/lib/billing.ts` — daily job
- `src/lib/payments/` — PayFast, Paystack, Netcash
- `src/lib/messaging/` — WhatsApp/SMS providers and templates
- `src/app/[tenant]/` — public, portal and admin pages
- `src/app/api/` — sign-up, webhooks, cron
