#!/bin/bash
# Fix rclone.service: distro rclone often doesn't support unix:// for --rc-addr.
# Use TCP (127.0.0.1:5572) and a socat proxy so CasaOS can still use the Unix socket.
# Run: sudo bash scripts/fix-rclone-service.sh

set -e

# 1) rclone: listen on TCP only (this works on all rclone versions)
OVERRIDE_DIR=/etc/systemd/system/rclone.service.d
mkdir -p "$OVERRIDE_DIR"
cat > "$OVERRIDE_DIR/override.conf" << 'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/rclone rcd --rc-addr 127.0.0.1:5572 --rc-no-auth --rc-allow-origin "*"
EOF

# 2) socat proxy: create Unix socket CasaOS expects, forward to rclone TCP
SOCAT_SERVICE=/etc/systemd/system/rclone-socket-proxy.service
if ! command -v socat &>/dev/null; then
  echo "Installing socat..."
  apt-get update -qq && apt-get install -y -qq socat
fi

mkdir -p /var/run/rclone
cat > "$SOCAT_SERVICE" << 'EOF'
[Unit]
Description=rclone RC Unix socket proxy for CasaOS
After=network.target rclone.service
Requires=rclone.service

[Service]
Type=simple
ExecStartPre=/bin/rm -f /var/run/rclone/rclone.sock
ExecStart=/usr/bin/socat UNIX-LISTEN:/var/run/rclone/rclone.sock,fork,user=root,group=root,mode=0660 TCP:127.0.0.1:5572
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl restart rclone
sleep 1
systemctl enable --now rclone-socket-proxy.service 2>/dev/null || true
systemctl start rclone-socket-proxy.service 2>/dev/null || true

echo ""
echo "rclone (TCP :5572):"
systemctl status rclone --no-pager || true
echo ""
echo "rclone-socket-proxy (socket -> :5572):"
systemctl status rclone-socket-proxy --no-pager || true
echo ""
echo "If both show 'active (running)', the fix worked. CasaOS can use /var/run/rclone/rclone.sock as before."