"use strict";
// Shared demo auth (zero-dep, CommonJS; works from ESM via `import auth from "./demo-auth.cjs"`).
// Basic auth OR a cookie. The cookie is an HMAC token derived from DEMO_PASS (never the password),
// host-only, HttpOnly, SameSite=Lax, Secure when behind https, Max-Age = ttlDays. Changing the
// password invalidates every cookie; no server state, so it works across replicas.
// Magic link: any URL with ?key=<DEMO_PASS> sets the cookie and redirects to the same path without the key.
// /logout clears the cookie. Caller keeps /healthz outside of this.
var crypto = require("crypto");
module.exports = function createAuth(opts) {
  var USER = opts.user || "", PASS = opts.pass || "", ON = PASS !== "";
  var NAME = opts.cookieName || "lp_auth", TTL = (opts.ttlDays || 30) * 86400;
  var TOKEN = ON ? crypto.createHmac("sha256", PASS).update("lp_auth:v1:" + USER).digest("hex") : "";
  function cookies(req) { var o = {}; (req.headers.cookie || "").split(";").forEach(function (c) { var i = c.indexOf("="); if (i > 0) o[c.slice(0, i).trim()] = c.slice(i + 1).trim(); }); return o; }
  function https(req) { return req.socket && req.socket.encrypted || /https/i.test(req.headers["x-forwarded-proto"] || ""); }
  function setCookie(req, res, clear) {
    var v = NAME + "=" + (clear ? "" : TOKEN) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + (clear ? 0 : TTL) + (https(req) ? "; Secure" : "");
    var prev = res.getHeader("Set-Cookie"); res.setHeader("Set-Cookie", prev ? [].concat(prev, v) : v);
  }
  function basicOk(req) { var h = req.headers.authorization || ""; if (h.indexOf("Basic ") !== 0) return false;
    var d = Buffer.from(h.slice(6), "base64").toString("utf8"), i = d.indexOf(":"); return d.slice(i + 1) === PASS && (USER === "" || d.slice(0, i) === USER); }
  function safeEq(a, b) { return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
  function redirect(res, to) { res.writeHead(302, { Location: to, "Cache-Control": "no-store" }); res.end(); }
  var api = {
    // Returns true if the request may proceed. Handles /logout and ?key= itself (returns false after responding).
    gate: function (req, res) {
      if (!ON) return true;
      var u = req.url, q = u.indexOf("?"), p = q < 0 ? u : u.slice(0, q), qs = q < 0 ? "" : u.slice(q + 1);
      if (p === "/logout") { setCookie(req, res, true); redirect(res, "/"); return false; }
      var m = /(?:^|&)key=([^&]*)/.exec(qs);
      if (m) {
        var rest = qs.replace(/(?:^|&)key=[^&]*/, "").replace(/^&/, "");
        if (safeEq(decodeURIComponent(m[1]), PASS)) setCookie(req, res, false);
        redirect(res, p + (rest ? "?" + rest : "")); return false;
      }
      var c = cookies(req)[NAME];
      if (c && safeEq(c, TOKEN)) return true;
      if (basicOk(req)) { setCookie(req, res, false); return true; }
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="demo"', "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end("Authentication required."); return false;
    },
    // Express-style middleware
    middleware: function (req, res, next) { if (api.gate(req, res)) next(); }
  };
  return api;
};
