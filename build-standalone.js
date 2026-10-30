"use strict";
// Inline everything into one file (standalone.html) for offline preview / a true single-file static page.
// String concatenation on purpose: the minified library contains backticks and ${}.
var fs = require("fs"), path = require("path");
var pub = path.join(__dirname, "public");
function read(p) { return fs.readFileSync(path.join(pub, p), "utf8"); }
function dataUri(p) { return "data:image/svg+xml;base64," + fs.readFileSync(path.join(pub, p)).toString("base64"); }
var html = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n" +
  "<title>Lilypad Hopper · Leapfrog</title>\n<link rel=\"icon\" href=\"" + dataUri("assets/favicon.svg") + "\">\n" +
  "<script>" + read("vendor/bitwrench.umd.min.js") + "</script>\n" +
  "<script>window.__LF_LOGO=" + JSON.stringify(dataUri("assets/lf-logo.svg")) + ";window.__LF_LOGO_WHITE=" + JSON.stringify(dataUri("assets/lf-logo-white.svg")) + ";</script>\n" +
  "<script>" + read("js/audio.js") + "</script>\n<script>" + read("js/game.js") + "</script>\n<script>" + read("js/app.js") + "</script>\n" +
  "</head>\n<body>\n<div id=\"app\"></div>\n<script>Hopper.mountApp();</script>\n</body>\n</html>\n";
fs.writeFileSync(path.join(__dirname, "standalone.html"), html);
console.log("standalone.html", (html.length / 1024).toFixed(0) + " KB");
