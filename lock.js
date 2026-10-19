/* Year Ten lock: all the crypto, shared by index.html (login) and admin.html (builder).
   Pages are encrypted with a random key each. Every user gets a small file entry that only
   their own username + password can open, and it holds the keys for the pages they may see. */
(function (g) {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ITER = 600000;

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

  /* ---------- admin side ---------- */

  // The vault holds the plain pages and the user list. Only the admin password opens it.
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

  /* Build every public file from the vault.
     vault = { pages:[{id,title,emoji,note,html}], users:[{name,salt,ku,iter,pages:[ids],disabled}] }
     Returns { "access.json": text, "p/<id>.enc": text, "vault.enc": text }.
     Page keys are new on every build, so a removed user's old keys stop working on the new files. */
  async function build(vault, admin) {
    var files = {}, keys = {};
    for (var i = 0; i < vault.pages.length; i++) {
      var p = vault.pages[i], k = rand(32);
      keys[p.id] = k;
      files["p/" + p.id + ".enc"] = await seal(k, enc.encode(p.html));
    }
    var users = {};
    for (var j = 0; j < vault.users.length; j++) {
      var u = vault.users[j];
      if (u.disabled) continue;
      var list = vault.pages.filter(function (p) { return u.pages.indexOf(p.id) >= 0; }).map(function (p) {
        return { id: p.id, title: p.title, emoji: p.emoji, note: p.note, key: b64(keys[p.id]) };
      });
      var blob = await seal(unb64(u.ku), enc.encode(JSON.stringify({ name: u.name, pages: list })));
      users[await uid(u.name)] = { salt: u.salt, iter: u.iter, blob: blob };
    }
    files["access.json"] = JSON.stringify({ v: 1, users: users });
    files["vault.enc"] = await sealVault(vault, admin.key, admin.salt, admin.iter);
    return files;
  }

  /* ---------- visitor side ---------- */

  // Returns { name, pages:[{id,title,emoji,note,key}] } or null when the login is wrong or disabled.
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

  g.YTLock = { build: build, login: login, decryptPage: decryptPage, sealVault: sealVault, openVault: openVault,
    newAdminKey: newAdminKey, makeUserSecret: makeUserSecret, b64: b64, unb64: unb64, ITER: ITER };
})(typeof window !== "undefined" ? window : globalThis);
