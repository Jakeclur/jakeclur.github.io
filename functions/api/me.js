import { getUser, getSubscription, isPaid, json } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await getUser(request, env);
  if (!auth || !auth.user) return json({ loggedIn: false }, 200, auth ? auth.cookies : []);
  const sub = await getSubscription(env, auth.user.id);
  return json({
    loggedIn: true,
    email: auth.user.email,
    paid: isPaid(sub),
    status: sub ? sub.status : "none",
    renews: sub ? sub.current_period_end : null,
    cancelling: sub ? !!sub.cancel_at_period_end : false,
  }, 200, auth.cookies);
}
