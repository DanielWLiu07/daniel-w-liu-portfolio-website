#!/usr/bin/env bash
# Host the site itself on render server n (default 1), so its seats load
# http://localhost:3000/resume from the same machine: no dependency on a laptop
# tunnel or a Vercel deploy. Copies this working tree (minus heavy/unused folders),
# installs, builds for production, and runs `next start` as a service.
#   ./site.sh        server 1
# Then set SITE_URL=http://localhost:3000/resume in server.env and ./deploy.sh n.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
n=${1:-1}
repo=$(cd "$here/../../.." && pwd)
eip=$(server_eip "$n")
ssh=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$eip")

echo "== waiting for first-boot setup on $(server_name "$n") ($eip)"
for i in $(seq 1 90); do
  out=$("${ssh[@]}" -o ConnectTimeout=8 test -f /var/lib/pixel-stream-bootstrapped 2>&1) && break
  # Surface real ssh failures (e.g. a changed host key) instead of waiting forever.
  case "$out" in *"Host key verification failed"*|*"Permission denied"*) echo "$out"; exit 1;; esac
  sleep 10; printf .
done; echo

echo "== site source → /opt/portfolio-site"
"${ssh[@]}" 'sudo mkdir -p /opt/portfolio-site && sudo chown ubuntu:ubuntu /opt/portfolio-site'
rsync -az --delete -e "ssh -i $SSH_KEY" \
  --exclude .git --exclude node_modules --exclude .next --exclude animation_frames \
  --exclude public/_originals --exclude experiments --exclude '.chrome-*' --exclude '*.blend' \
  --exclude assets-original --exclude fonts-original --exclude tsconfig.tsbuildinfo \
  "$repo/" "ubuntu@$eip:/opt/portfolio-site/"

echo "== install + production build (a few minutes)"
"${ssh[@]}" 'cd /opt/portfolio-site && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npx next build 2>&1 | tail -4'

echo "== service"
"${ssh[@]}" 'sudo tee /etc/systemd/system/portfolio-site.service >/dev/null <<UNIT
[Unit]
Description=Portfolio site (production build) for the stream seats
After=network-online.target

[Service]
User=ubuntu
WorkingDirectory=/opt/portfolio-site
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/npx next start -p 3000 -H 127.0.0.1
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
sudo sed -i "s/^After=network-online.target xorg-stream.service$/After=network-online.target xorg-stream.service portfolio-site.service/" /etc/systemd/system/pixel-stream.service
sudo systemctl daemon-reload && sudo systemctl enable --now portfolio-site && sudo systemctl restart portfolio-site
for i in $(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/resume && break; sleep 1; done
curl -s -o /dev/null -w "site on the server: HTTP %{http_code}\n" http://127.0.0.1:3000/resume'
