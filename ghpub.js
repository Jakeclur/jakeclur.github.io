/* Publishing helpers shared by admin.html and accountadmin.html: a store-only ZIP and a one-commit GitHub publish. */
(function (g) {
  "use strict";
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u) { var c = -1; for (var i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], cen = [], off = 0;
    function u16(n) { return [n & 255, n >>> 8 & 255]; } function u32(n) { return [n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255]; }
    Object.keys(files).forEach(function (name) {
      var nm = enc.encode(name), data = enc.encode(files[name]), crc = crc32(data);
      var lh = new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0].concat(u32(crc), u32(data.length), u32(data.length), u16(nm.length), [0, 0]));
      parts.push(lh, nm, data);
      cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0].concat(u32(crc), u32(data.length), u32(data.length), u16(nm.length), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], u32(off))), nm);
      off += lh.length + nm.length + data.length;
    });
    var cl = 0; cen.forEach(function (x) { cl += x.length; });
    var end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0].concat(u16(Object.keys(files).length), u16(Object.keys(files).length), u32(cl), u32(off), [0, 0]));
    return new Blob(parts.concat(cen, [end]), { type: "application/zip" });
  }

  /* Publishes everything as ONE commit, so the site is never left half updated.
     expect: { "accounts.enc": sha or null, ... } = the files as they were when this page loaded them.
     If GitHub has a different version (someone else published in between, or the page loaded an old copy),
     nothing is changed and an error with code "STALE" is thrown. */
  async function publish(opts) {
    var repo = opts.repo, branch = opts.branch, files = opts.files, say = opts.say || function () {}, expect = opts.expect || {};
    var api = "https://api.github.com/repos/" + repo + "/", hd = { Authorization: "Bearer " + opts.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    var wake = null;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) {}   // keep the phone screen on
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function call(method, path, body) {
      var last;
      for (var a = 0; a < 4; a++) {
        try {
          var r = await fetch(api + path, { method: method, headers: hd, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
          if (r.status >= 500 || r.status === 429) { last = new Error(path + ": " + r.status); await wait(1000 * (a + 1)); continue; }
          var d = await r.json().catch(function () { return {}; });
          if (!r.ok) throw new Error(path.split("?")[0] + ": " + r.status + " " + (d.message || ""));
          return d;
        } catch (e) {
          if (/^[^:]*: [0-9]{3}/.test(e.message)) throw e;            // a real answer from GitHub, do not retry
          last = e; await wait(1000 * (a + 1));
        }
      }
      throw new Error("The connection to GitHub failed. Keep this page open with the screen on and try again. (" + (last && last.message) + ")");
    }
    try {
      var ref = await call("GET", "git/ref/heads/" + encodeURIComponent(branch));
      var head = ref.object.sha, commit = await call("GET", "git/commits/" + head);
      var old = await call("GET", "git/trees/" + commit.tree.sha + "?recursive=1");
      var have = {}; old.tree.forEach(function (t) { if (t.type === "blob") have[t.path] = t.sha; });
      Object.keys(expect).forEach(function (p) {
        if ((have[p] || null) !== (expect[p] || null)) {
          var e = new Error("The site was changed after you opened this page (" + p + " is newer on GitHub). Nothing was published. Reload this page, then make your changes again.");
          e.code = "STALE"; throw e;
        }
      });
      var paths = Object.keys(files), done = 0, tree = [], q = paths.slice();
      async function worker() {
        while (q.length) {
          var path = q.shift(), b = await call("POST", "git/blobs", { content: files[path], encoding: "utf-8" });
          tree.push({ path: path, mode: "100644", type: "blob", sha: b.sha });
          say("Uploading " + (++done) + " of " + paths.length + "… keep this page open", "wn");
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      Object.keys(have).forEach(function (p) {                       // remove pages that no longer exist
        if (/^p\/[^\/]+\.enc$/.test(p) && !files[p]) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
      });
      var nt = await call("POST", "git/trees", { base_tree: commit.tree.sha, tree: tree });
      var nc = await call("POST", "git/commits", { message: opts.message || "Update locked site", tree: nt.sha, parents: [head] });
      await call("PATCH", "git/refs/heads/" + encodeURIComponent(branch), { sha: nc.sha });
      return paths.length;
    } finally { if (wake) try { wake.release(); } catch (e) {} }
  }

  // Fetch a site file, skipping any saved or cached copy.
  async function fresh(path) {
    var r = await fetch(path + (path.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache: "no-store" });
    return r.ok ? r.text() : null;
  }

  g.YTPub = { makeZip: makeZip, publish: publish, fresh: fresh };
})(window);
