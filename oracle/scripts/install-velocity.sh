#!/usr/bin/env bash
set -euo pipefail

BASE="/home/ubuntu/omricraft"
VEL_DIR="$BASE/velocity"
VELOCITY_VERSION="3.4.0-SNAPSHOT"
# Resolve the latest build dynamically so a fresh install matches the live proxy
VELOCITY_BUILD=$(curl -sf "https://api.papermc.io/v2/projects/velocity/versions/${VELOCITY_VERSION}" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.builds[o.builds.length-1]);}catch(e){process.exit(1);}})" 2>/dev/null || echo "559")
VELOCITY_JAR_URL="https://api.papermc.io/v2/projects/velocity/versions/${VELOCITY_VERSION}/builds/${VELOCITY_BUILD}/downloads/velocity-${VELOCITY_VERSION}-${VELOCITY_BUILD}.jar"

echo "[$(date)] Installing Velocity..."

mkdir -p "$VEL_DIR/logs" "$VEL_DIR/plugins"

# Download Velocity jar if missing
if [ ! -f "$VEL_DIR/velocity.jar" ]; then
  echo "[$(date)] Downloading Velocity ${VELOCITY_VERSION} build ${VELOCITY_BUILD}..."
  curl -fsSL "$VELOCITY_JAR_URL" -o "$VEL_DIR/velocity.jar"
  echo "[$(date)] Download complete."
else
  echo "[$(date)] velocity.jar already exists, skipping download."
fi

# Generate forwarding.secret if missing
if [ ! -f "$VEL_DIR/forwarding.secret" ]; then
  echo "[$(date)] Generating forwarding.secret..."
  openssl rand -hex 32 > "$VEL_DIR/forwarding.secret"
  echo "[$(date)] forwarding.secret created."
else
  echo "[$(date)] forwarding.secret already exists."
fi

# Install ViaVersion + ViaBackwards so clients NEWER than the proxy's native max
# (e.g. a 26.x client on a 1.21.x backend) can still connect — Via translates the
# protocol. Fetch the latest velocity-compatible build from Modrinth, 0-byte check.
install_via_plugin() {
  local project="$1" out="$2"
  local url
  url=$(curl -sf "https://api.modrinth.com/v2/project/${project}/version" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const a=JSON.parse(d);const v=a.find(x=>x.loaders.includes('velocity'))||a[0];console.log(v.files[0].url);}catch(e){process.exit(1);}})" 2>/dev/null || echo "")
  if [ -z "$url" ]; then echo "[$(date)] WARNING: could not resolve $project download URL"; return; fi
  wget -q -L "$url" -O "$VEL_DIR/plugins/${out}"
  if [ ! -s "$VEL_DIR/plugins/${out}" ]; then echo "[$(date)] ERROR: $project download was 0 bytes"; rm -f "$VEL_DIR/plugins/${out}"; return; fi
  echo "[$(date)] Installed $project -> plugins/${out} ($(stat -c%s "$VEL_DIR/plugins/${out}") bytes)"
}
install_via_plugin viaversion  ViaVersion.jar
install_via_plugin viabackwards ViaBackwards.jar

FORWARDING_SECRET=$(cat "$VEL_DIR/forwarding.secret")

# Create velocity.toml if missing
if [ ! -f "$VEL_DIR/velocity.toml" ]; then
  echo "[$(date)] Creating velocity.toml..."
  cat > "$VEL_DIR/velocity.toml" <<EOF
config-version = "2.7"
bind = "0.0.0.0:25565"
motd = "<#09add3>OmriCraft Network"
show-max-players = 100
online-mode = true
force-key-authentication = true
prevent-client-proxy-connections = false
player-info-forwarding-mode = "MODERN"
forwarding-secret-file = "forwarding.secret"
announce-forge = false
kick-existing-players = false
ping-passthrough = "DISABLED"

[servers]
# Backend servers will be registered here

[forced-hosts]
# Forced host mappings will be added here

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = true
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true

[query]
enabled = false
port = 25577
map = "Velocity"
show-plugins = false
EOF
  echo "[$(date)] velocity.toml created."
else
  echo "[$(date)] velocity.toml already exists."
fi

echo "[$(date)] Velocity installation complete."
echo "[$(date)] Forwarding secret: $(cat "$VEL_DIR/forwarding.secret")"
echo "[$(date)] Run: ./start-velocity.sh"
