#!/usr/bin/env bash
# First-boot setup for the render server (EC2 user-data, runs once as root).
# AMI: AWS Deep Learning Base OSS NVIDIA Driver GPU AMI (Ubuntu 24.04), which
# already has the NVIDIA driver. Installs Chrome, Node 22, Caddy and Vulkan
# tools, pins WebRTC to a UDP port range, and installs the services. The app
# code itself arrives later via deploy.sh (rsync), then the service starts.
# Progress: /var/log/pixel-stream-bootstrap.log
set -euo pipefail
exec > >(tee -a /var/log/pixel-stream-bootstrap.log) 2>&1
echo "== bootstrap start $(date -Is)"

export DEBIAN_FRONTEND=noninteractive
APP=/opt/pixel-stream
RUN_USER=ubuntu
UDP_RANGE=10000-10999 # must match the security group (aws-launch.sh)

apt-get update -y
apt-get install -y curl ca-certificates gnupg rsync jq vulkan-tools libvulkan1 \
  fonts-noto fonts-noto-color-emoji debian-keyring debian-archive-keyring apt-transport-https

# --- Chrome (stable) -----------------------------------------------------------
curl -fsSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt-get install -y /tmp/chrome.deb
# WebRTC media on a fixed UDP range so the firewall can stay narrow.
mkdir -p /etc/opt/chrome/policies/managed
echo "{ \"WebRtcUdpPortRange\": \"$UDP_RANGE\" }" > /etc/opt/chrome/policies/managed/webrtc.json

# --- Node 22 ---------------------------------------------------------------------
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# --- Caddy (HTTPS in front of the server) ---------------------------------------
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# --- Vulkan for Chrome's WebGPU ---------------------------------------------------
# The DLAMI ships the compute driver; Chrome needs the NVIDIA Vulkan ICD too.
if [ ! -e /usr/share/vulkan/icd.d/nvidia_icd.json ] && [ ! -e /etc/vulkan/icd.d/nvidia_icd.json ]; then
  ver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1 | cut -d. -f1 || true)
  if [ -n "${ver:-}" ] && dpkg -l | grep -q "nvidia-driver-$ver\|libnvidia-compute-$ver"; then
    apt-get install -y "libnvidia-gl-$ver" || apt-get install -y "libnvidia-gl-$ver-server" || true
  else
    echo "!! NVIDIA Vulkan ICD missing and the driver is not an apt package; install the matching GL/Vulkan libs by hand"
  fi
fi
vulkaninfo --summary 2>&1 | grep -E "deviceName|driverName|apiVersion" || echo "!! vulkaninfo found no GPU"

# --- Virtual GPU display -------------------------------------------------------------
# Windowed Chrome on an NVIDIA X screen composites on the GPU (headless composites
# on the CPU: ~25 fps captured and much more latency). No monitor is attached; the
# driver presents a virtual DVI screen. (UseDisplayDevice "None" is rejected on the
# T4 without the GRID driver, and isn't needed.)
apt-get install -y xserver-xorg-core x11-xserver-utils
bus=$(nvidia-xconfig --query-gpu-info | grep -m1 "PCI BusID" | sed "s/.*: //")
cat > /etc/X11/xorg-stream.conf <<XCONF
Section "ServerLayout"
    Identifier "layout"
    Screen 0 "screen"
EndSection
Section "Device"
    Identifier "gpu"
    Driver "nvidia"
    BusID "$bus"
    Option "AllowEmptyInitialConfiguration" "true"
    Option "HardDPMS" "false"
EndSection
Section "Screen"
    Identifier "screen"
    Device "gpu"
    DefaultDepth 24
    Option "AllowEmptyInitialConfiguration" "true"
    SubSection "Display"
        Depth 24
        Virtual 3840 2160
    EndSubSection
EndSection
XCONF
cat > /etc/systemd/system/xorg-stream.service <<UNIT
[Unit]
Description=Virtual NVIDIA X display :0 for the stream seats
After=systemd-user-sessions.service

[Service]
ExecStart=/usr/bin/Xorg :0 -config xorg-stream.conf -noreset -nolisten tcp
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now xorg-stream.service

# --- App directory + services --------------------------------------------------------
usermod -aG video,render "$RUN_USER" || true
mkdir -p "$APP"
chown -R "$RUN_USER:$RUN_USER" "$APP"

cat > /etc/systemd/system/pixel-stream.service <<UNIT
[Unit]
Description=Pixel-stream warm pool (headless Chrome seats + signaling)
After=network-online.target xorg-stream.service
Wants=network-online.target xorg-stream.service
ConditionPathExists=$APP/server.mjs

[Service]
User=$RUN_USER
WorkingDirectory=$APP
EnvironmentFile=$APP/server.env
ExecStart=/usr/bin/node server.mjs
# SIGTERM makes the server drain: visitors are moved to local rendering first.
KillSignal=SIGTERM
TimeoutStopSec=10
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable pixel-stream.service

# Caddy gets its real config from deploy.sh; until then, a placeholder.
printf ':80 {\n\trespond "pixel-stream: waiting for deploy"\n}\n' > /etc/caddy/Caddyfile
systemctl restart caddy || echo "!! caddy did not start (deploy.sh rewrites its config anyway)"

echo "== bootstrap done $(date -Is)"
touch /var/lib/pixel-stream-bootstrapped
