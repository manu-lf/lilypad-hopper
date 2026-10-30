"use strict";
// Browser-like click-through in jsdom (npm i jsdom in a scratch dir; run with NODE_PATH pointing at it).
// Loads standalone.html, starts a game with Space, hops onto the first bank row, then hops until the
// frog dies and checks the game-over sheet. Fails on any runtime error.
var fs = require("fs"), path = require("path"), assert = require("assert");
var JSDOM = require("jsdom").JSDOM, VirtualConsole = require("jsdom").VirtualConsole;
var html = fs.readFileSync(path.join(__dirname, "standalone.html"), "utf8");
var vc = new VirtualConsole(), errs = [];
vc.on("jsdomError", function (e) { var m = String(e.message || e); if (!/scrollTo|Not implemented/.test(m)) errs.push(m); });
vc.on("error", function (m) { errs.push(String(m)); });
var dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, url: "http://localhost/" });
var w = dom.window, d = w.document;
function key(code) { w.dispatchEvent(new w.KeyboardEvent("keydown", { code: code, bubbles: true, cancelable: true })); }
function text(sel) { var el = d.querySelector(sel); return el ? el.textContent : ""; }
function hud(id) { return text("#" + id + " .bw_stat_value"); }
function step(ms, fn) { return new Promise(function (res) { setTimeout(function () { fn(); res(); }, ms); }); }
var G = null;
step(400, function () {
  assert(d.getElementById("bw_style_structural"), "structural CSS not loaded");
  assert(d.getElementById("hop_svg"), "no svg board");
  assert(d.querySelectorAll("#hop_pads .hop_pad").length > 4, "no pads rendered");
  assert(/Hop in/.test(text("#hop_overlay")), "title overlay missing");
  assert(d.querySelector("img.logo").getAttribute("src").indexOf("data:image/svg+xml") === 0, "logo not inlined");
  assert(/Lilypad/.test(text("h1")), "title missing");
  G = w.HopperGame.state(); assert.equal(G.state, "title");
  key("Space");
}).then(function () { return step(100, function () {
  G = w.HopperGame.state(); assert.equal(G.state, "playing", "Space should start");
  assert(d.getElementById("hop_overlay").classList.contains("hop_hidden"), "overlay should hide");
  assert(d.body.classList.contains("hop_full"), "full-window mode on play");
  assert.equal(G.lives, 3, "starts with 3 lives"); assert.equal(hud("hud_lives"), "3", "lives card");
  key("ArrowUp");
}); }).then(function () { return step(450, function () {
  G = w.HopperGame.state();
  assert.equal(G.frog.row, 1, "first hop lands on bank row 1");
  assert.equal(G.score, 1, "score 1 after first row"); assert.equal(hud("hud_score"), "1", "HUD score patched");
  assert(d.querySelectorAll("#hop_fx *").length > 0, "landing ripple drawn");
  var up = d.querySelector(".hop_dpad button.up"); assert(up, "d-pad present");
  up.dispatchEvent(new w.Event("pointerdown", { bubbles: true, cancelable: true }));
}); }).then(function () { return step(450, function () {
  G = w.HopperGame.state(); assert(G.frog.row === 2 || G.state === "dead", "d-pad hop moved the frog (row " + G.frog.row + ", " + G.state + ")");
}); }).then(function () {
  // keep hopping blindly until all three lives are gone; on a lost life, check the sheet and continue
  var n = 0, lost = 0;
  function loop() { return step(330, function () { G = w.HopperGame.state(); n++;
    if (G.state === "playing") w.HopperGame.input("up");
    else if (G.state === "lost" && G.overlayShown) { lost++; assert(/lives left|Last life/.test(text("#hop_overlay")), "lost-life sheet"); assert.equal(G.lives, 3 - lost, "lives decrement"); w.HopperGame.input("start"); }
  }).then(function () { return (G.state !== "dead" && n < 90) ? loop() : null; }); }
  return loop().then(function () { if (G.state === "dead") { assert.equal(lost, 2, "two lives lost before game over"); assert.equal(G.lives, 0, "no lives left"); } });
}).then(function () { return step(1100, function () {
  G = w.HopperGame.state();
  if (G.state === "dead") {
    assert(/Hop again/.test(text("#hop_overlay")), "game-over sheet shown");
    assert(/Out of lives/.test(text("#hop_overlay")), "out of lives text");
    assert(/Splash|Swept|Left behind/.test(text("#hop_overlay")), "cause title shown: " + text("#hop_overlay").slice(0, 60));
    assert(!d.getElementById("hop_overlay").classList.contains("hop_hidden"), "overlay visible");
    assert(hud("hud_best") === String(G.best) && G.best >= 1, "best recorded");
    key("Space");
  } else assert(G.score >= 10, "survived 90 hops with score " + G.score);
}); }).then(function () { return step(150, function () {
  G = w.HopperGame.state(); assert.equal(G.state, "playing", "Space restarts after death");
  key("KeyP"); 
}); }).then(function () { return step(100, function () {
  assert(/Paused/.test(text("#hop_overlay")), "pause sheet");
  d.querySelector("#hop_overlay .hop_link").click(); assert(!d.body.classList.contains("hop_full"), "Back to the page leaves full mode");
  d.querySelector("#hop_mute_host button").click();
  assert(/Sound: off/.test(text("#hop_mute_host")), "mute toggles label");
  assert.deepEqual(errs, [], "runtime errors");
  console.log("ui-test: ok  (score " + G.score + ", best " + G.best + ", cause " + (G.cause || "-") + ", rows " + Object.keys(G.rows).length + ")");
  w.close(); process.exit(0);
}); }).catch(function (e) { console.error("ui-test FAILED:", e && e.message || e); if (errs.length) console.error(errs); process.exit(1); });
