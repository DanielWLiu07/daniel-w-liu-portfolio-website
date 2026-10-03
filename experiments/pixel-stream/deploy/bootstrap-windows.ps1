<powershell>
# First-boot setup for a Windows render server (EC2 user-data; runs once as
# SYSTEM). Windows because Chrome there encodes WebRTC H.264 on the NVIDIA GPU
# (NVENC via Media Foundation); Chrome on Linux can only encode in software.
#
# The launch script fills in __PUBKEY__ (SSH key for deploys) and __DRIVER_URL__
# (a short-lived pre-signed link to AWS's NVIDIA GRID driver, free for G4dn).
# Chrome needs a real desktop session for GPU rendering, so a local user logs in
# automatically and the pool starts at that logon (scheduled task).
# Log: C:\pixel-stream-bootstrap.log
$ErrorActionPreference = 'Stop'
Start-Transcript -Path C:\pixel-stream-bootstrap.log -Append
$ProgressPreference = 'SilentlyContinue'
function Fetch($url, $out) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out }
Write-Output "== bootstrap start $(Get-Date -Format o)"

# --- SSH (key only) for deploys ----------------------------------------------------
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
Set-Service sshd -StartupType Automatic
Start-Service sshd
Set-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value '__PUBKEY__'
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
(Get-Content C:\ProgramData\ssh\sshd_config) -replace '^#?PasswordAuthentication .*', 'PasswordAuthentication no' | Set-Content C:\ProgramData\ssh\sshd_config
Restart-Service sshd

# --- Firewall: HTTPS signaling + WebRTC media --------------------------------------
New-NetFirewallRule -DisplayName 'pixel-stream http/https' -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'pixel-stream webrtc' -Direction Inbound -Protocol UDP -LocalPort 10000-10999 -Action Allow | Out-Null

# --- NVIDIA GRID driver (graphics + NVENC) ------------------------------------------
New-Item -ItemType Directory -Force C:\setup | Out-Null
Fetch '__DRIVER_URL__' C:\setup\nvidia-grid.exe
Start-Process -Wait -FilePath C:\setup\nvidia-grid.exe -ArgumentList '-s', '-noreboot', '-clean'
# AWS-provided GRID needs no license server; hide the licensing page.
New-Item -Path 'HKLM:\SOFTWARE\NVIDIA Corporation\Global\GridLicensing' -Force | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\NVIDIA Corporation\Global\GridLicensing' -Name NvCplDisableManageLicensePage -PropertyType DWord -Value 1 -Force | Out-Null

# --- Chrome (enterprise MSI) + WebRTC port policy -----------------------------------
Fetch 'https://dl.google.com/edgedl/chrome/install/GoogleChromeStandaloneEnterprise64.msi' C:\setup\chrome.msi
Start-Process -Wait msiexec.exe -ArgumentList '/i', 'C:\setup\chrome.msi', '/qn', '/norestart'
New-Item -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome' -Force | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome' -Name WebRtcUdpPortRange -Value '10000-10999' -PropertyType String -Force | Out-Null

# --- Node 22 ------------------------------------------------------------------------------
$index = Invoke-WebRequest -UseBasicParsing https://nodejs.org/dist/latest-v22.x/
$msi = ($index.Links.href | Where-Object { $_ -match 'node-v22\.[\d.]+-x64\.msi$' } | Select-Object -First 1)
Fetch "https://nodejs.org/dist/latest-v22.x/$(Split-Path $msi -Leaf)" C:\setup\node.msi
Start-Process -Wait msiexec.exe -ArgumentList '/i', 'C:\setup\node.msi', '/qn', '/norestart'

# --- Caddy (HTTPS) as a Windows service -----------------------------------------------
New-Item -ItemType Directory -Force C:\caddy | Out-Null
Fetch 'https://caddyserver.com/api/download?os=windows&arch=amd64' C:\caddy\caddy.exe
Set-Content -Path C:\caddy\Caddyfile -Value ":80 {`n`trespond `"pixel-stream: waiting for deploy`"`n}"
sc.exe create caddy start= auto binPath= '"C:\caddy\caddy.exe" run --config C:\caddy\Caddyfile' | Out-Null
Start-Service caddy

# --- Desktop session for the seats ---------------------------------------------------
# Auto-logon local user; the pool starts at its logon (interactive => GPU desktop).
# (System.Web's password generator isn't loaded on Server Core/Full by default.)
$pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) + 'aA1!'
$secure = ConvertTo-SecureString $pw -AsPlainText -Force
New-LocalUser -Name stream -Password $secure -PasswordNeverExpires -AccountNeverExpires | Out-Null
Add-LocalGroupMember -Group Users -Member stream
$winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty $winlogon AutoAdminLogon '1'
Set-ItemProperty $winlogon DefaultUserName 'stream'
Set-ItemProperty $winlogon DefaultPassword $pw
Set-ItemProperty $winlogon DefaultDomainName $env:COMPUTERNAME
# No lock screen, screensaver or display sleep in that session.
New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' -Force | Out-Null
Set-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' NoLockScreen 1
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0

# App folders (filled by deploy-windows.sh) and the logon task that runs the pool.
New-Item -ItemType Directory -Force C:\pixel-stream, C:\portfolio-site | Out-Null
icacls C:\pixel-stream /grant 'stream:(OI)(CI)M' | Out-Null
icacls C:\portfolio-site /grant 'stream:(OI)(CI)M' | Out-Null
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\pixel-stream\deploy\start-windows.ps1'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User stream
$principal = New-ScheduledTaskPrincipal -UserId stream -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName pixel-stream -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

# Make the T4's GRID virtual display the only screen: with EC2's virtual VGA card
# (Microsoft Basic Display Adapter) as primary, the desktop runs on it at 1024x768
# and Chrome renders with Microsoft WARP (software). The logon script then sets
# the NVIDIA display to 2560x1600.
Get-PnpDevice -Class Display | Where-Object { $_.FriendlyName -eq 'Microsoft Basic Display Adapter' -and $_.Status -eq 'OK' } |
  ForEach-Object { pnputil /disable-device "$($_.InstanceId)" | Out-Null }

Write-Output "== bootstrap done $(Get-Date -Format o)"
New-Item -ItemType File -Force C:\pixel-stream-bootstrapped | Out-Null
Stop-Transcript
# The driver install needs a reboot; afterwards 'stream' logs in automatically.
Restart-Computer -Force
</powershell>
