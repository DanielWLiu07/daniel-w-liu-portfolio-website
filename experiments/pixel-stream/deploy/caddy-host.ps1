# Runs at every boot as SYSTEM (scheduled task 'pixel-stream-caddy'). Points
# Caddy's HTTPS site at this server's public host, so a server launched from
# the golden image serves on its own name with no deploy step:
#   1. the instance's StreamHost tag (needs instance metadata tags enabled)
#   2. else <public-ip-with-dashes>.sslip.io
# Log: C:\pixel-stream\logs\caddy-host.log
$ErrorActionPreference = 'Stop'
$log = 'C:\pixel-stream\logs\caddy-host.log'
New-Item -ItemType Directory -Force C:\pixel-stream\logs | Out-Null
function Say($m) { "$(Get-Date -Format s) $m" | Out-File -Append $log }
try {
  $imds = 'http://169.254.169.254/latest'
  $token = $null
  for ($i = 0; $i -lt 30 -and -not $token; $i++) {
    try { $token = Invoke-RestMethod -Method Put -Uri "$imds/api/token" -Headers @{ 'X-aws-ec2-metadata-token-ttl-seconds' = '300' } -TimeoutSec 2 } catch { Start-Sleep 2 }
  }
  if (-not $token) { throw 'instance metadata unreachable' }
  $h = @{ 'X-aws-ec2-metadata-token' = $token }
  $hostName = $null
  try { $hostName = (Invoke-RestMethod -Uri "$imds/meta-data/tags/instance/StreamHost" -Headers $h -TimeoutSec 2).Trim() } catch { }
  if ($hostName -match '(^|[.-])None([.-]|$)') { $hostName = $null }   # a tag written before the IP existed
  if (-not $hostName) {
    # The Elastic IP can be attached a few seconds after boot.
    for ($i = 0; $i -lt 30 -and -not $hostName; $i++) {
      try { $hostName = ((Invoke-RestMethod -Uri "$imds/meta-data/public-ipv4" -Headers $h -TimeoutSec 2).Trim() -replace '\.', '-') + '.sslip.io' } catch { Start-Sleep 2 }
    }
  }
  if (-not $hostName) { throw 'no StreamHost tag and no public IP' }
  $want = "$hostName {`n`treverse_proxy 127.0.0.1:8787`n}"
  $have = if (Test-Path C:\caddy\Caddyfile) { (Get-Content -Raw C:\caddy\Caddyfile).Trim() } else { '' }
  if ($have -ne $want.Trim()) {
    Set-Content -Path C:\caddy\Caddyfile -Value $want
    Restart-Service caddy
    Say "host -> $hostName (Caddy restarted)"
  } else { Say "host $hostName (unchanged)" }
} catch { Say "error: $($_.Exception.Message)" }
