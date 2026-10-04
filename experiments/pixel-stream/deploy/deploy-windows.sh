#!/usr/bin/env bash
# Deploy to a Windows render server n (OS_n=windows in config.env): copy the pool
# code and the site, build the site, write Caddy's config, restart the pool's
# logon task. Uses server-windows.env (falls back to server.env).
#   ./deploy-windows.sh 2
set -euo pipefail
source "$(dirname "$0")/lib.sh"
n=${1:?server number}
repo=$(cd "$here/../../.." && pwd)
src=$(cd "$here/.." && pwd)
envfile="$here/server-windows.env"; [ -f "$envfile" ] || envfile="$here/server.env"
eip=$(server_eip "$n")
host=$(server_host "$n" || true)
ssh=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "Administrator@$eip")
ps() { "${ssh[@]}" "$1"; }
tmp=$(mktemp -d)

echo "== waiting for Windows first boot (driver install + reboot, ~10-15 min)"
for i in $(seq 1 120); do
  out=$("${ssh[@]}" 'if (Test-Path C:\pixel-stream-bootstrapped) { "ready" }' 2>&1) && [[ "$out" == *ready* ]] && break
  case "$out" in *"Host key verification failed"*|*"Permission denied"*) echo "$out"; exit 1;; esac
  sleep 15; printf .
done; echo

echo "== pool code → C:\\pixel-stream"
COPYFILE_DISABLE=1 tar -C "$src" --exclude '.chrome-*' --exclude results --exclude '*.png' --exclude 'deploy/*.env' --exclude turn-usage.json --exclude stop-requested -czf "$tmp/pool.tgz" .
scp -q -i "$SSH_KEY" "$tmp/pool.tgz" "Administrator@$eip:C:/pool.tgz"
scp -q -i "$SSH_KEY" "$envfile" "Administrator@$eip:C:/pixel-stream/server.env"
ps 'tar -xzf C:\pool.tgz -C C:\pixel-stream; Remove-Item C:\pool.tgz'

# Windows locks files a running process has open (next's native binaries), so
# npm ci fails unless the site and the pool are stopped first.
echo "== stop the pool and the site"
ps 'schtasks /End /TN pixel-stream | Out-Null; Get-Process node, chrome -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 3; "stopped"'

echo "== site → C:\\portfolio-site (install + production build, several minutes)"
COPYFILE_DISABLE=1 tar -C "$repo" --exclude .git --exclude node_modules --exclude .next --exclude animation_frames \
  --exclude public/_originals --exclude experiments --exclude '.chrome-*' --exclude '*.blend' \
  --exclude assets-original --exclude fonts-original --exclude tsconfig.tsbuildinfo \
  --exclude '.env' --exclude '.env.*' --exclude .vercel -czf "$tmp/site.tgz" .  # secrets stay on this machine
scp -q -i "$SSH_KEY" "$tmp/site.tgz" "Administrator@$eip:C:/site.tgz"
ps 'Remove-Item C:\portfolio-site\.env* -Force -ErrorAction SilentlyContinue; tar -xzf C:\site.tgz -C C:\portfolio-site; Remove-Item C:\site.tgz; Set-Location C:\portfolio-site; $env:NEXT_TELEMETRY_DISABLED="1"; & "C:\Program Files\nodejs\npm.cmd" ci --no-audit --no-fund --loglevel=error; & "C:\Program Files\nodejs\npx.cmd" next build 2>&1 | Select-Object -Last 3'

echo "== scheduled tasks (idle self-stop watcher; boot-time Caddy host)"
ps 'Register-ScheduledTask -TaskName pixel-stream-stop -Force -Action (New-ScheduledTaskAction -Execute powershell.exe -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\pixel-stream\deploy\stop-watch.ps1") -Trigger (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)) -Principal (New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest) | Out-Null; Register-ScheduledTask -TaskName pixel-stream-caddy -Force -Action (New-ScheduledTaskAction -Execute powershell.exe -Argument "-NoProfile -ExecutionPolicy Bypass -File C:\pixel-stream\deploy\caddy-host.ps1") -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal (New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest) | Out-Null; "ok"'

echo "== caddy (${host:-plain HTTP on :80})"
ps "Set-Content -Path C:\\caddy\\Caddyfile -Value \"${host:-:80} {\`n\`treverse_proxy 127.0.0.1:8787\`n}\"; Restart-Service caddy"

echo "== restart the pool (logon task in the auto-logon desktop session)"
ps 'schtasks /End /TN pixel-stream | Out-Null; Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2; schtasks /Run /TN pixel-stream | Out-Null; "started"'
rm -rf "$tmp"

base=${host:+https://$host}; base=${base:-http://$eip}
echo "== warming seats"
for _ in $(seq 1 60); do
  if curl -fsS "$base/healthz" >/dev/null 2>&1; then echo "healthy: $base"; break; fi
  sleep 5; printf .
done
echo
echo "viewer:  $base/   (lab: $base/?lab)"
echo "logs:    ssh -i $SSH_KEY Administrator@$eip 'Get-Content C:\\pixel-stream\\logs\\pool.log -Tail 40'"
