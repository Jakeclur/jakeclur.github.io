import { getUser, getSubscription, stripe, json, sameOrigin } from "../../lib/auth.js";

// Stripe's hosted page: update card, cancel, see invoices.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Bad origin" }, 403);
  const auth = await getUser(request, env);
  if (!auth || !auth.user) return json({ error: "Please log in first." }, 401);
  const sub = await getSubscription(env, auth.user.id);
  if (!sub || !sub.stripe_customer_id) return json({ error: "No subscription yet." }, 400, auth.cookies);
  const r = await stripe(env, "billing_portal/sessions", {
    customer: sub.stripe_customer_id,
    return_url: `${env.SITE_URL}/account.html`,
  });
  const d = await r.json();
  if (!r.ok) return json({ error: "Could not open billing." }, 502, auth.cookies);
  return json({ url: d.url }, 200, auth.cookies);
}
