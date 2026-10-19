import { getUser, getSubscription, stripe, json, sameOrigin } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Bad origin" }, 403);
  const auth = await getUser(request, env);
  if (!auth || !auth.user) return json({ error: "Please log in first." }, 401);
  const sub = await getSubscription(env, auth.user.id);

  const params = {
    mode: "subscription",
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    client_reference_id: auth.user.id,
    success_url: `${env.SITE_URL}/account.html?paid=1`,
    cancel_url: `${env.SITE_URL}/account.html`,
  };
  if (sub && sub.stripe_customer_id) params.customer = sub.stripe_customer_id;
  else params.customer_email = auth.user.email;

  const r = await stripe(env, "checkout/sessions", params);
  const d = await r.json();
  if (!r.ok) return json({ error: "Could not start checkout." }, 502, auth.cookies);
  return json({ url: d.url }, 200, auth.cookies);
}
