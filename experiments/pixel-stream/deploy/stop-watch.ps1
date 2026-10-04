# Runs every minute as SYSTEM (scheduled task 'pixel-stream-stop'). The pool runs as
# the auto-logon user, which may not shut Windows down; when it decides the server
# has been idle long enough (SELF_STOP=1, no StreamAlwaysOn tag) it writes
# C:\pixel-stream\stop-requested, and this shuts down. EC2 launches servers with
# InstanceInitiatedShutdownBehavior=stop, so this is a stop: billing ends, the disk stays.
$flag = 'C:\pixel-stream\stop-requested'
if (Test-Path $flag) {
  Remove-Item $flag -Force
  "$(Get-Date -Format s) idle stop requested by the pool: shutting down" | Out-File -Append C:\pixel-stream\logs\stop-watch.log
  Stop-Computer -Force
}
