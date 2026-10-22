/* Year Ten lock: all the crypto, shared by index.html (login), admin.html (owner) and accountadmin.html.
   Pages are encrypted with a random key each. Every user gets a small file entry that only
   their own username + password can open, and it holds the keys for the pages they may see.

   Files:
   - vault.enc     the owner's file (admin password): the plain pages and the owner's private key.
   - accounts.enc  the account list, page list and page keys, sealed with a random "directory key".
                   The owner opens it with the private key; account admins get the directory key
                   inside their own access.json entry. A new directory key is made on every publish.
   - access.json   one sealed entry per active account.
   - p/<id>.enc    the encrypted pages. */
(function (g) {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ITER = 600000;
  var RSA = { name: "RSA-OAEP", hash: "SHA-256" };

  function b64(buf) {
    var u = new Uint8Array(buf), s = "";
    for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) {
    var bin = atob(s), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }

  async function sha(text) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
  function uid(name) { return sha("yt1:" + name.trim().toLowerCase()); }
  // The id git gives a file with this content (used to check nobody published in between).
  async function gitSha(text) {
    var body = enc.encode(text), head = enc.encode("blob " + body.length + "\u0000"), all = new Uint8Array(head.length + body.length);
    all.set(head); all.set(body, head.length);
    return hex(await crypto.subtle.digest("SHA-1", all));
  }

  async function aesKey(raw, usage) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usage || ["encrypt", "decrypt"]);
  }
  // Password -> raw 32-byte key. The username is mixed in so two users with the same password differ.
  async function kdf(secret, salt, iter) {
    var base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iter }, base, 256));
  }
  function userSecret(name, password) { return name.trim().toLowerCase() + "\u0000" + password; }

  // AES-GCM. Output is base64 of iv(12) + ciphertext. Wrong key => throws.
  async function seal(rawKey, bytes) {
    var iv = rand(12), k = await aesKey(rawKey, ["encrypt"]);
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, bytes));
    var out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64(out);
  }
  async function open(rawKey, text) {
    var all = unb64(text), k = await aesKey(rawKey, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12) }, k, all.subarray(12)));
  }

  /* ---------- owner key pair: lets anyone lock the directory key for the owner, only the owner can open it ---------- */
  async function newOwnerKeys() {
    var kp = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
    return { pub: await crypto.subtle.exportKey("jwk", kp.publicKey), priv: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  }
  function clean(jwk, ops) { return { kty: jwk.kty, n: jwk.n, e: jwk.e, d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi, alg: jwk.alg, ext: true, key_ops: ops }; }
  async function wrapForOwner(pub, raw) {
    var k = await crypto.subtle.importKey("jwk", clean(pub, ["encrypt"]), RSA, false, ["encrypt"]);
    return b64(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, k, raw));
  }
  async function unwrapAsOwner(priv, text) {
    var k = await crypto.subtle.importKey("jwk", clean(priv, ["decrypt"]), RSA, false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, k, unb64(text)));
  }

  /* ---------- owner vault ---------- */

  // The vault holds the plain pages and the owner's private key. Only the admin password opens it.
  async function sealVault(vault, adminKey, salt, iter) {
    return JSON.stringify({ v: 1, iter: iter, salt: b64(salt), data: await seal(adminKey, enc.encode(JSON.stringify(vault))) }, null, 1);
  }
  async function openVault(fileText, password) {
    var f = JSON.parse(fileText), salt = unb64(f.salt), key = await kdf(password, salt, f.iter);
    var vault = JSON.parse(dec.decode(await open(key, f.data)));
    return { vault: vault, key: key, salt: salt, iter: f.iter };
  }
  async function newAdminKey(password) {
    var salt = rand(16);
    return { key: await kdf(password, salt, ITER), salt: salt, iter: ITER };
  }

  // Make or reset a user. We keep the derived key, never the password itself.
  async function makeUserSecret(name, password) {
    var salt = rand(16);
    return { salt: b64(salt), ku: b64(await kdf(userSecret(name, password), salt, ITER)), iter: ITER };
  }

  /* ---------- directory (accounts.enc) ----------
     dir = { rev, users:[{name,salt,ku,iter,pages:[ids],disabled,admin:{create,manage}}],
             pages:[{id,title,emoji,note,parent,year}], keys:{ id: base64 page key } } */
  async function sealDirectory(dir, dk, pub) {
    return JSON.stringify({ v: 2, rev: dir.rev, pub: pub, ow: await wrapForOwner(pub, dk), data: await seal(dk, enc.encode(JSON.stringify(dir))) });
  }
  // who = { priv: owner private key } or { dk: base64 directory key }
  async function openDirectory(fileText, who) {
    var f = JSON.parse(fileText), dk = who.dk ? unb64(who.dk) : await unwrapAsOwner(who.priv, f.ow);
    return { dir: JSON.parse(dec.decode(await open(dk, f.data))), pub: f.pub };
  }
  function pageMeta(p) { var m = { id: p.id, title: p.title, emoji: p.emoji, note: p.note || "", year: p.year || "10" }; if (p.parent) m.parent = p.parent; return m; }
  function isAdmin(u) { return !!(u.admin && (u.admin.create || u.admin.manage)); }

  // access.json + accounts.enc from a directory. A fresh directory key every time.
  async function buildAccess(dir, pub) {
    var dk = rand(32), users = {};
    for (var j = 0; j < dir.users.length; j++) {
      var u = dir.users[j];
      if (u.disabled) continue;
      // A page with a "parent" (e.g. a practice exam) is unlocked whenever its parent page is.
      var list = dir.pages.filter(function (p) { return u.pages.indexOf(p.id) >= 0 || (p.parent && u.pages.indexOf(p.parent) >= 0); }).map(function (p) {
        return { id: p.id, title: p.title, emoji: p.emoji, note: p.note, year: p.year || "10", key: dir.keys[p.id], hidden: !!p.parent };
      });
      var body = { name: u.name, pages: list };
      if (isAdmin(u)) body.admin = { create: !!u.admin.create, manage: !!u.admin.manage, dk: b64(dk) };
      users[await uid(u.name)] = { salt: u.salt, iter: u.iter, blob: await seal(unb64(u.ku), enc.encode(JSON.stringify(body))) };
    }
    return { "access.json": JSON.stringify({ v: 2, users: users }), "accounts.enc": await sealDirectory(dir, dk, pub) };
  }

  /* Owner build: every public file from the vault.
     vault = { pages:[{id,title,emoji,note,html,parent?,year?}], users:[...], owner:{pub,priv}, rev }
     Page keys are new on every build, so a removed user's old keys stop working on the new files. */
  async function build(vault, admin) {
    var files = {}, keys = {};
    for (var i = 0; i < vault.pages.length; i++) {
      var p = vault.pages[i], k = rand(32);
      keys[p.id] = b64(k);
      files["p/" + p.id + ".enc"] = await seal(k, enc.encode(p.html));
    }
    var dir = { rev: (vault.rev || 0) + 1, users: vault.users, pages: vault.pages.map(pageMeta), keys: keys };
    var acc = await buildAccess(dir, vault.owner.pub);
    files["access.json"] = acc["access.json"]; files["accounts.enc"] = acc["accounts.enc"];
    files["vault.enc"] = await sealVault({ v: 2, pages: vault.pages, owner: vault.owner }, admin.key, admin.salt, admin.iter);
    return files;
  }

  /* Account-admin build: no plain pages and no vault. Each page file is opened with its current key and
     locked again with a new one, then access.json and accounts.enc are rebuilt from the edited directory.
     getPage(id) must return the current text of p/<id>.enc. Returns { files, dir } (dir = the new directory). */
  async function rekey(dir, pub, getPage, progress) {
    var files = {}, keys = {};
    for (var i = 0; i < dir.pages.length; i++) {
      var p = dir.pages[i], body = await open(unb64(dir.keys[p.id]), await getPage(p.id)), k = rand(32);
      keys[p.id] = b64(k);
      files["p/" + p.id + ".enc"] = await seal(k, body);
      if (progress) progress(i + 1, dir.pages.length);
    }
    var nd = { rev: (dir.rev || 0) + 1, users: dir.users, pages: dir.pages, keys: keys };
    var acc = await buildAccess(nd, pub);
    files["access.json"] = acc["access.json"]; files["accounts.enc"] = acc["accounts.enc"];
    return { files: files, dir: nd };
  }

  /* ---------- visitor side ---------- */

  // Returns { name, pages:[{id,title,emoji,note,year,key,hidden}], admin? } or null when the login is wrong or disabled.
  async function login(access, name, password) {
    var rec = access.users[await uid(name)];
    if (!rec) { await kdf("x", rand(16), 100000); return null; }   // similar delay either way
    try {
      var key = await kdf(userSecret(name, password), unb64(rec.salt), rec.iter);
      return JSON.parse(dec.decode(await open(key, rec.blob)));
    } catch (e) { return null; }
  }
  async function decryptPage(fileText, keyB64) {
    return dec.decode(await open(unb64(keyB64), fileText));
  }

  g.YTLock = { build: build, rekey: rekey, login: login, decryptPage: decryptPage, sealVault: sealVault, openVault: openVault,
    newAdminKey: newAdminKey, makeUserSecret: makeUserSecret, newOwnerKeys: newOwnerKeys, openDirectory: openDirectory,
    pageMeta: pageMeta, isAdmin: isAdmin, gitSha: gitSha, uid: uid, b64: b64, unb64: unb64, ITER: ITER };
})(typeof window !== "undefined" ? window : globalThis);
