# Deploy — Lilypad Hopper

Name `lilypad-hopper` · repo `manu-lf/lilypad-hopper` (private) · client `leapfrog` · port 8080 · health `/healthz`.
URL after deploy: `https://lilypad-hopper-leapfrog.demo.lftechnology.com/`

Run from this folder in Terminal (`./deploy.sh` does all of it). Everything below is as the **manu-lf** GitHub identity — switch first if `gh auth status` shows another account.

## 1. Repo (once)

```bash
gh auth status                              # must be manu-lf;  gh auth switch -u manu-lf  if not
git init -b main && git add -A && git add -f .env && git commit -m "init lilypad-hopper"
gh repo create manu-lf/lilypad-hopper --private --source . --remote origin --push
```

## 2. Read-only deploy key (once; lives in this folder's .ssh/, git- and docker-ignored)

```bash
mkdir -p .ssh && chmod 700 .ssh
ssh-keygen -t ed25519 -N "" -f ./.ssh/lilypad-hopper.key -C "lilypad-lilypad-hopper"
git check-ignore -q ./.ssh/lilypad-hopper.key || echo "STOP: .ssh/ not ignored"
gh repo deploy-key add ./.ssh/lilypad-hopper.key.pub -R manu-lf/lilypad-hopper --title "lilypad-lilypad-hopper"   # NO --allow-write
GIT_SSH_COMMAND="ssh -i ./.ssh/lilypad-hopper.key -o IdentitiesOnly=yes" git ls-remote git@github.com:manu-lf/lilypad-hopper.git
```

## 3. Lilypad (once)

```bash
lilypad login                               # if needed: lilypad auth you@lftechnology.com → lpk_ key → login
GITHUB_AUTH="$PWD/.ssh/lilypad-hopper.key" lilypad setup lilypad-hopper \
  --repo https://github.com/manu-lf/lilypad-hopper --client leapfrog --branch main --port 8080 --health /healthz
lilypad status lilypad-hopper | jq -r .data.lastMessage      # "Deploy key saved…" / "Repo readable, Dockerfile found"
lilypad create lilypad-hopper                                # async
lilypad status lilypad-hopper | jq -r .message               # until RUNNING, Settled: yes
```

## 4. Iterate

```bash
git add -A && git commit -m "…" && git push
lilypad redeploy lilypad-hopper
```

`lilypad extend lilypad-hopper` before day 30 · `lilypad destroy lilypad-hopper` when done.

## Gotchas

- Health path must be `/healthz` — `/` is behind auth and returns 401.
- `.dockerignore` drops `*.cjs` and `*.md` but re-includes `demo-auth.cjs` and `public/assets/brand.md`; keep it that way.
- `.env` is git-ignored; `deploy.sh` force-adds it so the image uses the same settings you ran locally.
- The game ships public (`DEMO_PASS=` empty). To require a login, set `DEMO_USER`/`DEMO_PASS` in `.env` and redeploy.
