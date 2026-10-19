import { json, clearCookies, sameOrigin } from "../../lib/auth.js";

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ error: "Bad origin" }, 403);
  return json({ ok: true }, 200, clearCookies());
}
