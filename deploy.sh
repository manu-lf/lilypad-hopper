#!/usr/bin/env bash
# Lilypad Hopper — repo + deploy key + Lilypad. Idempotent; run from this folder as manu-lf.
set -euo pipefail
NAME=lilypad-hopper; OWNER=manu-lf; CLIENT=leapfrog; KEY=".ssh/$NAME.key"
cd "$(dirname "$0")"

# --- stage 1: repo ---
if ! gh auth status 2>&1 | grep -q "account $OWNER"; then
  echo "gh is not on $OWNER. Run: gh auth switch -u $OWNER"; exit 1; fi
if [ ! -d .git ]; then
  git init -b main && git add -A && git add -f .env && git commit -m "init $NAME"
  gh repo create "$OWNER/$NAME" --private --source . --remote origin --push
else
  git add -A && git add -f .env && (git commit -m "update $NAME" || true) && git push -u origin main
fi

# --- stage 2: lilypad (independent of stage 1 having just run) ---
if ! lilypad status "$NAME" >/dev/null 2>&1; then
  mkdir -p .ssh && chmod 700 .ssh
  [ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -f "./$KEY" -C "lilypad-$NAME"
  git check-ignore -q "./$KEY" || { echo "STOP: $KEY is not git-ignored"; exit 1; }
  gh repo deploy-key list -R "$OWNER/$NAME" | grep -q "lilypad-$NAME" || \
    gh repo deploy-key add "./$KEY.pub" -R "$OWNER/$NAME" --title "lilypad-$NAME"
  GIT_SSH_COMMAND="ssh -i ./$KEY -o IdentitiesOnly=yes" git ls-remote "git@github.com:$OWNER/$NAME.git" >/dev/null
  GITHUB_AUTH="$PWD/$KEY" lilypad setup "$NAME" --repo "https://github.com/$OWNER/$NAME" \
    --client "$CLIENT" --branch main --port 8080 --health /healthz
  lilypad status "$NAME" | jq -r .data.lastMessage || true
  lilypad create "$NAME"
else
  lilypad redeploy "$NAME"
fi
echo "→ https://$NAME-$CLIENT.demo.lftechnology.com/   (no login; see SHARE.md)"
