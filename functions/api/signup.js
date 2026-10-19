import { sbAuth, json, sessionCookies, sameOrigin } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Bad origin" }, 403);
  const { email, password } = await request.json().catch(() => ({}));
  if (!email || !password || password.length < 8) return json({ error: "Enter an email and a password of 8+ characters." }, 400);
  const r = await sbAuth(env, "signup", { email, password });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: d.msg || d.error_description || "Could not sign up." }, 400);
  if (d.access_token) return json({ ok: true }, 200, sessionCookies(d));
  return json({ ok: true, confirm: true });
}
