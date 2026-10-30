# Lilypad Hopper

A frog hopping arcade game by [Leapfrog](https://www.lftechnology.com), built to show what a Lilypad demo is: an idea turned into a real, playable thing in a day, on its own link, ready to hand to a client.

## Why this exists

Leapfrog Technology builds custom software, AI, data and cloud products for companies that want to get from idea to working product quickly. Lilypad is the tool we use to make the first step fast: a concept demo gets built, packaged and deployed to a private link with one command, so a client can click through the actual experience before anyone commits to a full build.

Most Lilypad demos are business walkthroughs. This one is a game, because a game shows the same things in a way anyone can judge in thirty seconds: it runs, it responds, it looks like the brand, it works on a phone, and it was done quickly. Everything in it, from the pond to the sound effects, was built and deployed through the same pipeline a client demo uses.

## The game

Frogger meets the Chrome dino. Hop a frog up an endless pond, row by row, onto lily pads that drift sideways. The pond scrolls down and speeds up, so you can't sit still. Three lives, a score, a best score, a streak bonus, flies to catch.

| Action | Keyboard | Touch |
|---|---|---|
| Hop forward | `Space`, `↑`, `W` | tap the board, or ▲ |
| Sidestep | `←` `→`, `A` `D` | swipe, or ◀ ▶ |
| Hop back | `↓`, `S` | ▼ |
| Pause / resume | `P`, `Esc` | Esc pill at the top of the board |
| Mute | `M` | Sound button |

- +1 per new row, +5 per fly, +3 and a croak for every five new rows gained in quick succession.
- Pads carry you sideways; off the edge is out. Fall off the bottom of the screen and you're left behind.
- Lose a life and you restart on the row you fell from, score intact. Third loss ends the game.
- Starting a game expands the board to the full window; game over returns to the page.
- Best score is kept in the browser.

Deep links: `#play` starts straight away, `#how` and `#about` open those panels.

## What a Lilypad demo ships with

This folder is the whole demo, and it is the standard Lilypad shape:

- A `Dockerfile`, one port (8080) and a `/healthz` endpoint, so the platform can build, run and monitor it.
- An optional login gate for client-confidential demos. It's off here (`DEMO_PASS` is empty in `.env`); set `DEMO_USER` and `DEMO_PASS` to turn it on.
- `SHARE.md`, the one-card summary a seller pastes into the shared demo list: what it is, the link, how to get in.
- `deploy.sh` and `DEPLOY-COMMANDS.md`: repo, deploy key and Lilypad setup, then `lilypad redeploy` for every iteration.
- Leapfrog branding throughout: palette and logos from lftechnology.com, recorded in `public/assets/brand.md`.
- Sample content only, nothing connected to a live system.

## Play it

Live on GitHub Pages: **https://manu-lf.github.io/lilypad-hopper/** (published from `public/` by `.github/workflows/pages.yml` on every push to `main`).

## Run it locally

```bash
npm start                 # http://localhost:8080, no dependencies to install
PORT=9933 npm start       # any port
node build-standalone.js  # standalone.html: one self-contained file you can email
docker build -t lilypad-hopper . && docker run -p 8080:8080 lilypad-hopper
```

`public/index.html` also opens straight from the filesystem.

Tests: `npm test` renders the page server-side with no dependencies; `npm run test:ui` plays through a game in jsdom (start, hop, lose three lives, game over, pause, mute). jsdom is not a project dependency; put it on `NODE_PATH` from a scratch folder.

## Under the hood

A single static page: plain HTML, SVG for the board, the Web Audio API for sound (synthesized, at a low volume), and bitwrench.js, an open-source UI library, for rendering. No framework, no build step. The board is drawn once and updated in place each frame; the page listens to the game over a small pub/sub channel for the score cards and overlays.

While building it we hit a bitwrench 2.1.11 bug (SVG elements added after the first render don't draw). The game works around it; the write-up and a repro page are in `BITWRENCH-ISSUE.md` and `bitwrench-issue/`. The page can also be served and debugged with bitwrench's own `bwcli` (`npm run serve:bw`, `npm run debug`, then open the page with `?attach`).

## Files

```
public/index.html              page shell
public/js/game.js              simulation, SVG board, input
public/js/app.js               page: header menu, score cards, how-to, D-pad, overlays, About
public/js/audio.js             sound effects
public/vendor/                 bitwrench.js
public/assets/                 logos, favicon, brand.md
server.js, demo-auth.cjs       static server with the Lilypad health and login contract
Dockerfile, docker-compose.yml, .env.example, .env
build-standalone.js            one-file build
render-test.cjs, ui-test.cjs   tests
SHARE.md, DEPLOY-COMMANDS.md, deploy.sh
BITWRENCH-ISSUE.md, bitwrench-issue/   library bug write-up and repro
```

Built by Leapfrog Technology. Hop on with Leapfrog: [lftechnology.com](https://www.lftechnology.com).
