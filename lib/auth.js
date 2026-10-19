// Shared helpers for the Pages Functions: cookies, Supabase calls, Stripe calls.

const ACCESS = "yt_access";
const REFRESH = "yt_refresh";

export function getCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function sessionCookies(s) {
  return [cookie(ACCESS, s.access_token, s.expires_in || 3600), cookie(REFRESH, s.refresh_token, 60 * 60 * 24 * 30)];
}

export function clearCookies() {
  return [cookie(ACCESS, "", 0), cookie(REFRESH, "", 0)];
}

export function withCookies(response, cookies) {
  const r = new Response(response.body, response);
  for (const c of cookies) r.headers.append("Set-Cookie", c);
  return r;
}

export function json(data, status = 200, cookies = []) {
  const r = new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  for (const c of cookies) r.headers.append("Set-Cookie", c);
  return r;
}

// Block cross-site POSTs (cookies are SameSite=Lax too).
export function sameOrigin(request) {
  const o = request.headers.get("Origin");
  return !o || o === new URL(request.url).origin;
}

export function sbAuth(env, path, body) {
  return fetch(`${env.SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sbRest(env, path, init = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function getSubscription(env, userId) {
  const r = await sbRest(env, `subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!r.ok) return null;
  return (await r.json())[0] || null;
}

export async function upsertSubscription(env, row) {
  return sbRest(env, "subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
}

export async function updateByCustomer(env, customerId, fields) {
  return sbRest(env, `subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
}

export function isPaid(sub) {
  return !!sub && (sub.status === "active" || sub.status === "trialing");
}

// Returns { user, cookies } or null. Refreshes an expired access token when it can.
export async function getUser(request, env) {
  const access = getCookie(request, ACCESS);
  if (access) {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${access}` },
    });
    if (r.ok) return { user: await r.json(), cookies: [] };
  }
  const refresh = getCookie(request, REFRESH);
  if (!refresh) return null;
  const r = await sbAuth(env, "token?grant_type=refresh_token", { refresh_token: refresh });
  if (!r.ok) return { user: null, cookies: clearCookies() };
  const s = await r.json();
  return { user: s.user, cookies: sessionCookies(s) };
}

export function stripe(env, path, params, method = "POST") {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : new URLSearchParams(params),
  });
}
