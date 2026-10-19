// Runs before every request. Everything is locked unless it is on the public list
// or the visitor is logged in with a paid subscription.
import { getUser, getSubscription, isPaid, withCookies } from "../lib/auth.js";

const PUBLIC = new Set([
  "/", "/index.html", "/login.html", "/account.html",
  "/manifest.webmanifest", "/sw.js", "/icon-180.png", "/icon-192.png", "/icon-512.png",
]);

export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);
  if (PUBLIC.has(pathname) || pathname.startsWith("/api/")) return next();

  const auth = await getUser(request, env);
  if (auth && auth.user) {
    const sub = await getSubscription(env, auth.user.id);
    if (isPaid(sub)) {
      const res = await next();
      const out = withCookies(res, auth.cookies);
      out.headers.set("Cache-Control", "private, no-store");
      return out;
    }
    return withCookies(Response.redirect(new URL("/account.html?locked=1", request.url), 302), auth.cookies);
  }
  const to = new URL("/login.html", request.url);
  to.searchParams.set("next", pathname);
  return withCookies(Response.redirect(to, 302), auth ? auth.cookies : []);
}
