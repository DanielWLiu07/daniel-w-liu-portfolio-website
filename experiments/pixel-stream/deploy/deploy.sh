#!/usr/bin/env bash
# Push the server code + server.env to render server n (default 1), write Caddy's
# config for its host, and (re)start the pool. Safe to re-run after any change.
#   ./deploy.sh        server 1
#   ./deploy.sh 2      server 2 (Linux servers; the fleet is Windows now: deploy-windows.sh)
set -euo pipefail
source "$(dirname "$0")/lib.sh"
n=${1:-1}
src=$(cd "$here/.." && pwd)
[ -f "$here/server.env" ] || { echo "missing $here/server.env (copy server.env.example)"; exit 1; }
eip=$(server_eip "$n")
[ "$eip" != "None" ] || { echo "no Elastic IP for $(server_name "$n"); run ./aws-launch.sh $n first"; exit 1; }
host=$(server_host "$n" || true)
ssh=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$eip")

echo "== waiting for first-boot setup on $(server_name "$n") ($eip)"
for i in $(seq 1 90); do
  out=$("${ssh[@]}" -o ConnectTimeout=8 test -f /var/lib/pixel-stream-bootstrapped 2>&1) && break
  # Surface real ssh failures (e.g. a changed host key) instead of waiting forever.
  case "$out" in *"Host key verification failed"*|*"Permission denied"*) echo "$out"; exit 1;; esac
  sleep 10; printf .
done; echo

echo "== code → /opt/pixel-stream (the seats' warm caches are kept)"
rsync -az --delete -e "ssh -i $SSH_KEY" \
  --exclude '.chrome-*' --exclude results --exclude deploy --exclude '*.png' \
  "$src/" "ubuntu@$eip:/opt/pixel-stream/"
scp -q -i "$SSH_KEY" "$here/server.env" "ubuntu@$eip:/opt/pixel-stream/server.env"

echo "== caddy (${host:-plain HTTP on :80})"
"${ssh[@]}" "echo '${host:-:80} {
  reverse_proxy 127.0.0.1:8787
}' | sudo tee /etc/caddy/Caddyfile >/dev/null && sudo systemctl reload caddy"

echo "== restart pool"
"${ssh[@]}" 'sudo systemctl restart pixel-stream && sleep 2 && systemctl --no-pager --lines=5 status pixel-stream'

base=$(server_base "$n")
echo "== warming seats (each loads the site + compiles shaders)"
for _ in $(seq 1 60); do
  if curl -fsS "$base/healthz" >/dev/null 2>&1; then echo "healthy: $base"; break; fi
  sleep 5; printf .
done
echo
echo "viewer:        $base/"
echo "lab stats:     $base/?lab   (status: $base/status?token=<LAB_TOKEN>)"
echo "seat check:    $base/api/seat"
echo "server logs:   ./aws-ctl.sh logs $n"
