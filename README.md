# Lilypad Hopper — a frog hopping game (Leapfrog Lilypad concept demo)

A small, playable arcade game built as a **static page** with **bitwrench.js + SVG + Web Audio**: no framework, no build step, no asset files beyond the Leapfrog logo. It exists to show what a Lilypad demo looks like end to end — a bitwrench UI, the Leapfrog brand, one Dockerfile, `/healthz`, basic-auth login — on something fun instead of a sales walkthrough. **Illustrative; built by Leapfrog Technology.**

![Lilypad Hopper](public/assets/favicon.svg)

## The game

Frogger meets the Chrome dino. Hop a frog up an endless pond, row by row.

- **Lily pads drift sideways** (rows alternate direction, some stand still). Land on a pad, not the water. A pad carries you with it; drift off the edge and you're out.
- **The pond scrolls down and speeds up** as your score grows, so you can't sit still (that's the dino part). Fall off the bottom and you're left behind.
- **Score:** +1 per new row, **+5** for a fly (the frog's tongue flicks out), **+3 "ribbit"** for every five new rows gained in quick succession (streak window ≈ 1.1 s between row gains; sidesteps neither count nor reset). Best score is kept in `localStorage`.
- **Breathers:** a grassy bank every 12 rows up to row 48; after that it's pads all the way, smaller and faster.
- **Controls:** `Space` / `↑` / `W` / tap = hop forward · `←` `→` / `A` `D` / swipe = sidestep · `↓` / `S` = hop back · `P` pause · `M` mute · `Enter` start. On-screen D-pad for phones. One input is buffered while a hop is in flight, so quick double-taps feel right.
- **Sound:** all synthesized with the Web Audio API — a "boing" hop, a soft landing thud, a filtered-noise splash, fly blips, a croak for the streak bonus, a short game-over slide and a best-score arpeggio. Master volume is 0.14 (quiet by design); mute persists.

Deep link: `/#play` starts a game immediately.

## Branding

Leapfrog palette from lftechnology.com, recorded in `public/assets/brand.md`: green `#038E43` (primary), dark green `#05572B`, navy `#102B7B` (secondary), deep navy `#0C183A`, ground `#F7F8FB`, lime `#D4F479`, mint `#B4FFD6`, pink `#EA4C89`. The pond is navy water with Leapfrog-green pads and frog, lime belly, pink tongue. Type is the site's fallback stack (Tomato Grotesk is commercial and not vendored). `lf-logo.svg` in the header and footer; `lf-logo-white.svg` is available for dark surfaces.

## Built with bitwrench (v2.1.11, vendored)

- **UI is TACO** (`{t,a,c,o}`) throughout — `public/js/app.js` is the page, `public/js/game.js` is the board. SVG is ordinary TACO (`t:'svg'`, `t:'g'`, `t:'path'`…), no HTML strings, no `innerHTML`.
- **Styling order:** `bw.loadStyles()` (structural + utility CSS) first, then `bw.loadStyles(THEME)` with the Leapfrog palette. Layout uses the utility classes; `bw.css()` adds only the page frame, stage, overlay and D-pad, all derived from `bw.makeStyles(THEME).palette`.
- **Per-frame updates in place:** the scene is mounted once. Each frame `bw.patch(el, {transform…})` moves the frog/camera and `bw.syncChildren()` keeps the keyed lists (pads `row:i`, flies, banks, effects) in step — rows that stay keep their nodes. No re-mounting.
- **Known library issue, worked around:** in bitwrench 2.1.11 anything created *after* the mount (`syncChildren`, `append`, `patch` with a TACO, `replace`) lands in the HTML namespace even inside an `<svg>`, so it never draws. Each synced item here is therefore rooted in a nested `<svg overflow="visible">` positioned by `x`/`y` (see `svgItem()` in `game.js`). Details and a minimal repro: `BITWRENCH-ISSUE.md`.
- **Decoupled HUD:** the game `bw.pub`s `hopper:hud` and `hopper:state`; the page `bw.sub`s and patches stat-card slots (`el.bw.setValue`) and the overlay (`bw.patch`, `bw.toggleClass`).
- **Components used:** `makeStatCard`, `makeCard`, `makeButton`, `makeBadge`; `bw.toggleThemeMode()` for light/dark.

## Run it

**Just open it:** `public/index.html` works from the filesystem (relative paths), or build the single-file version:

```bash
node build-standalone.js      # → standalone.html (everything inlined, ~230 KB)
```

**Node (no dependencies):**

```bash
npm start                     # http://localhost:8080  (no login; see Access control)
PORT=8099 npm start           # shell PORT wins (the env files don't set it)
npm test                      # server-side render of page + board, zero deps
npm i jsdom -g 2>/dev/null; NODE_PATH=$(npm root -g) npm run test:ui   # or install jsdom in a scratch dir
```

**Docker:**

```bash
docker build -t lilypad-hopper . && docker run -p 8080:8080 lilypad-hopper
# or: docker compose up
```

**bwcli (bitwrench's own tooling):** the game is a plain static folder, so bitwrench's dev server hosts it too, and the page can attach itself to the `bwcli attach` REPL for debugging:

```bash
npm run serve:bw            # = npx bwcli serve public --port 9933   (no login; bwserve static dir)
npm run debug               # = npx bwcli attach --allow-screenshot  (REPL on 7902)
# then open http://localhost:9933/?attach   (or ?attach=<port>) — the page loads /bw/attach.js and connects
#   bw> /tree #hop_stage 3        board structure
#   bw> /tree #hop_pads 2         the synced lily pads (nested <svg> items, see note below)
#   bw> /listen .hop_dpad button click
#   bw> /patch hud_score 42       patches the stat card host (the game overwrites it on the next hop)
```

The hook is a few lines at the end of `mountApp()` in `public/js/app.js`: if the URL has `attach`, it appends `<script src="http://localhost:<port>/bw/attach.js">` with `bw.append`. Nothing loads otherwise.

**Health:** `GET /healthz` → `{"status":"ok","service":"lilypad-hopper",...}`, no login required. The image declares a `HEALTHCHECK` against it.

## Access control (currently off)

The Lilypad login gate (`demo-auth.cjs`) is wired in but **switched off**: `DEMO_PASS=` is empty in both `.env.example` and `.env`, so the game is public. To require a login, set `DEMO_USER`/`DEMO_PASS` in `.env` (git-ignored; `deploy.sh` force-adds it) — precedence `.env` > shell env > `.env.example`. `/healthz` is always exempt. Docker copies both `.env` files into the image.

**Cookie login:** `demo-auth.cjs` (shared by all demos) accepts basic auth *or* an `lp_auth` cookie — an HMAC token derived from `DEMO_PASS`, never the password — `HttpOnly; SameSite=Lax; Secure` behind https, 30-day `Max-Age` (matches the Lilypad TTL). `/?key=<DEMO_PASS>` sets the cookie and redirects (the one-click link in `SHARE.md`); `/logout` clears it. Changing the password invalidates every cookie.

## Deploy (Lilypad)

Repo `manu-lf/lilypad-hopper`, branch `main`, port `8080`, health `/healthz`, client `leapfrog` → `lilypad-hopper-leapfrog.demo.lftechnology.com`. `DEPLOY-COMMANDS.md` has the step list; `deploy.sh` runs it (repo + deploy key + Lilypad setup/create, or redeploy if already set up).

## Files

```
public/index.html            loads bitwrench + audio + game + app, mounts #app
public/js/game.js            simulation + SVG board (TACO), input, pub/sub
public/js/app.js             page chrome: header, HUD, how-to, D-pad, overlays, footer, theme
public/js/audio.js           Web Audio synth: hop, land, splash, fly, ribbit, game over, best
public/vendor/bitwrench.umd.min.js   v2.1.11
public/assets/               lf-logo.svg, lf-logo-white.svg, favicon.svg, brand.md
server.js · demo-auth.cjs    zero-dep static server + shared auth (healthz exempt)
Dockerfile · docker-compose.yml · .env.example · .env
build-standalone.js          one-file build
render-test.cjs · ui-test.cjs   zero-dep SSR smoke test · jsdom click-through
SHARE.md · DEPLOY-COMMANDS.md · deploy.sh
```

## What's real vs. illustrative

Everything on the page runs for real in the browser. There is no backend state: scores live in the player's `localStorage`. Nothing is connected to a Leapfrog system.

## Next steps (if anyone wants more)

Leaderboard route in `server.js` (the Lilypad server is a plain Node `http` server; add a route before the static handler), a sinking-pad variant, a two-frog mode, and a Tomato Grotesk license so the type matches the site exactly.
