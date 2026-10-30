"use strict";
// Zero-dependency smoke test: render the page chrome and the SVG board server-side with bw.html().
var assert = require("assert");
global.bw = require("./public/vendor/bitwrench.umd.min.js");
require("./public/js/audio.js"); require("./public/js/game.js"); require("./public/js/app.js");
var page = bw.html(global.Hopper.pageTaco()), board = bw.html(global.HopperGame.sceneTaco());
["Lilypad", "Hopper", "How to play", "Score", "Best", "Streak", "Leapfrog Technology", "lf-logo.svg", "hop_overlay", "Hop in"].forEach(function (s) {
  assert(page.indexOf(s) >= 0, "page missing: " + s);
});
["<svg", "viewBox=\"0 0 420 640\"", "hop_world", "hop_frog", "hop_pads", "hop_padGrad", "#038E43"].forEach(function (s) {
  assert(board.indexOf(s) >= 0, "board missing: " + s);
});
var css = global.Hopper.customCss();
assert(css.indexOf(".hop_stage") >= 0 && css.indexOf("#038E43") >= 0, "css missing brand");
console.log("render-test: ok  (page " + page.length + " chars, board " + board.length + " chars)");
