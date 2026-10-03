# Runs at the 'stream' user's automatic logon (scheduled task, interactive
# desktop: Chrome gets the GPU there). Starts the site, then the pool, using the
# same server.env as Linux. Logs: C:\pixel-stream\logs\
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force C:\pixel-stream\logs | Out-Null

# server.env → environment variables for this session.
Get-Content C:\pixel-stream\server.env | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  $value = ($value -replace '\s+#.*$', '').Trim()
  [Environment]::SetEnvironmentVariable($name.Trim(), $value, 'Process')
}
# Chrome must render on the NVIDIA T4, not the EC2 virtual VGA adapter the desktop
# runs on (that gives Microsoft WARP: software). Per-user "high performance GPU".
$pref = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
New-Item -Path $pref -Force | Out-Null
New-ItemProperty -Path $pref -Name 'C:\Program Files\Google\Chrome\Application\chrome.exe' -Value 'GpuPreference=2;' -PropertyType String -Force | Out-Null
# The seats' Chrome windows can't be larger than the desktop, which starts at the
# GRID virtual display's 1280x800: switch the primary (NVIDIA) display to the
# largest mode up to 2560x1600. The display must be named explicitly (the
# "default display" query returns no modes here) and the W (Unicode) API used.
try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public class Disp {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency,
      dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplaySettingsW(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int ChangeDisplaySettingsExW(string dev, ref DEVMODE dm, IntPtr hwnd, int flags, IntPtr param);
}
'@
$dev = [System.Windows.Forms.Screen]::PrimaryScreen.DeviceName
$best = $null; $i = 0
while ($i -lt 500) {
  $m = New-Object Disp+DEVMODE; $m.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($m)
  if (-not [Disp]::EnumDisplaySettingsW($dev, $i, [ref]$m)) { break }
  if ($m.dmPelsWidth -le 2560 -and $m.dmPelsHeight -le 1600 -and $m.dmBitsPerPel -eq 32 -and
      (-not $best -or $m.dmPelsWidth * $m.dmPelsHeight -gt $best.dmPelsWidth * $best.dmPelsHeight)) { $best = $m }
  $i++
}
if ($best) {
  $best.dmFields = 0x80000 -bor 0x100000   # DM_PELSWIDTH | DM_PELSHEIGHT
  $r = [Disp]::ChangeDisplaySettingsExW($dev, [ref]$best, [IntPtr]::Zero, 1, [IntPtr]::Zero)   # CDS_UPDATEREGISTRY
  "$(Get-Date -Format s) $dev -> $($best.dmPelsWidth)x$($best.dmPelsHeight) (result $r)" | Out-File -Append C:\pixel-stream\logs\display.log
} else { "$(Get-Date -Format s) ${dev}: no modes ($i enumerated)" | Out-File -Append C:\pixel-stream\logs\display.log }
} catch { "display: $($_.Exception.Message)" | Out-File -Append C:\pixel-stream\logs\display.log }
$env:NODE_ENV = 'production'
$env:NEXT_TELEMETRY_DISABLED = '1'

# The site (production build) on 127.0.0.1:3000, unless already up.
try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/resume -TimeoutSec 2 | Out-Null } catch {
  Start-Process -WindowStyle Hidden -WorkingDirectory C:\portfolio-site -FilePath 'C:\Program Files\nodejs\node.exe' `
    -ArgumentList 'node_modules\next\dist\bin\next', 'start', '-p', '3000', '-H', '127.0.0.1' `
    -RedirectStandardOutput C:\pixel-stream\logs\site.out.log -RedirectStandardError C:\pixel-stream\logs\site.err.log
  for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/resume -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep 1 } }
}

# The pool, restarted whenever it exits. (The task's own restart policy only acts on a
# failed task, and this script exits 0 even when node crashes, e.g. a first boot from
# a golden image, where the restored disk is slow until its blocks are read once.)
Set-Location C:\pixel-stream
while ($true) {
  & 'C:\Program Files\nodejs\node.exe' server.mjs *>> C:\pixel-stream\logs\pool.log
  "$(Get-Date -Format s) pool exited ($LASTEXITCODE), restarting in 5 s" | Out-File -Append C:\pixel-stream\logs\pool.log
  Start-Sleep 5
}
