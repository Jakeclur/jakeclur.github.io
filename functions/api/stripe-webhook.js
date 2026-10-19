// Stripe calls this by itself when someone pays, renews, or cancels.
import { stripe, upsertSubscription, updateByCustomer } from "../../lib/auth.js";

const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

async function verify(body, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  const t = parts.t, sig = parts.v1;
  if (!t || !sig || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
  return mac.length === sig.length && mac === sig;
}

const periodEnd = s => {
  const t = s.current_period_end ?? (s.items && s.items.data[0] && s.items.data[0].current_period_end);
  return t ? new Date(t * 1000).toISOString() : null;
};

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  if (!(await verify(body, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 400 });
  }
  const event = JSON.parse(body);
  const o = event.data.object;

  if (event.type === "checkout.session.completed" && o.mode === "subscription") {
    const r = await stripe(env, `subscriptions/${o.subscription}`, null, "GET");
    const s = await r.json();
    const res = await upsertSubscription(env, {
      user_id: o.client_reference_id,
      stripe_customer_id: o.customer,
      stripe_subscription_id: o.subscription,
      status: s.status,
      current_period_end: periodEnd(s),
      cancel_at_period_end: !!s.cancel_at_period_end,
    });
    if (!res.ok) return new Response("db error", { status: 500 });
  } else if (event.type.startsWith("customer.subscription.")) {
    const res = await updateByCustomer(env, o.customer, {
      stripe_subscription_id: o.id,
      status: event.type.endsWith(".deleted") ? "canceled" : o.status,
      current_period_end: periodEnd(o),
      cancel_at_period_end: !!o.cancel_at_period_end,
    });
    if (!res.ok) return new Response("db error", { status: 500 });
  }
  return new Response("ok");
}
