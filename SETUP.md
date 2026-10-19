# Paid login setup (about 30 minutes, all free plans)

The site runs on **Cloudflare Pages**. Pages are locked by `functions/_middleware.js`.
Only `index.html`, `login.html`, `account.html`, icons and the manifest are public.
Everything else (including old `index (3).html` and the zip files) needs a paid login.

## 1. Supabase (logins)
1. supabase.com > New project (free plan).
2. SQL Editor > paste `supabase/schema.sql` > Run.
3. Authentication > URL Configuration: set **Site URL** to your site address.
4. Project Settings > API: copy **Project URL**, **anon key**, **service_role key**.

## 2. Stripe (money)
1. stripe.com > make account (needs an adult 18+). Stay in **Test mode** first.
2. Product catalogue > Add product > recurring price > copy the **Price ID** (`price_...`).
3. Settings > Billing > Customer portal > turn it on.

## 3. Cloudflare Pages (host)
1. Make the GitHub repo private (Settings > Danger zone).
2. dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git > pick the repo.
   Build command: *none*. Output directory: `/`.
3. Settings > Variables and Secrets, add (mark keys as secret):

| Name | Value |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_KEY` | service_role key (secret!) |
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_ID` | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |
| `SITE_URL` | `https://your-site.pages.dev` (no slash at end) |

## 4. Stripe webhook
Stripe > Developers > Webhooks > Add endpoint:
- URL: `SITE_URL/api/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`, then redeploy.

## 5. Test, then go live
Sign up, subscribe with card `4242 4242 4242 4242`, check the pages open. Cancel in
"Manage billing", check they lock. Then swap the Stripe keys, price and webhook to live mode.
