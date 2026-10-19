import { sbAuth, json, sessionCookies, sameOrigin } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Bad origin" }, 403);
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password) return json({ error: "Enter your email and password." }, 400);
  const r = await sbAuth(env, "token?grant_type=password", { email, password });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: d.msg || d.error_description || "Wrong email or password." }, 401);
  return json({ ok: true }, 200, sessionCookies(d));
}
