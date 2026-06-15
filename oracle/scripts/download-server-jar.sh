#!/usr/bin/env bash
set -euo pipefail

# download-server-jar.sh — single source of truth for downloading the correct
# server jar for a given TYPE + VERSION into SERVER_DIR/server.jar.
#
# Usage: ./download-server-jar.sh SERVER_DIR TYPE VERSION
#
# Behaviour contract (relied on by create-server.sh AND change-version):
#   - writes SERVER_DIR/server.jar (or installs mod loader into SERVER_DIR)
#   - 0-byte check on every download
#   - FAIL LOUD: exit non-zero on any failure. NEVER silently install a
#     different version under a false label (the "server says 26.x but really
#     runs 1.21.1, client can't connect" bug).
#   - NEVER touches world directories or server.properties — jar only.

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 SERVER_DIR TYPE VERSION"
  exit 1
fi

SERVER_DIR="$1"
TYPE="$2"
VERSION="$3"

# Shared jar validation helper (B-8)
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/jar-utils.sh"

if [ ! -d "$SERVER_DIR" ]; then
  echo "[$(date)] ERROR: SERVER_DIR '$SERVER_DIR' does not exist"
  exit 1
fi

BASE="/home/ubuntu/omricraft"
# Use a stable id derived from the dir name for temp installer file names.
SERVER_ID="$(basename "$SERVER_DIR")"

mkdir -p "$SERVER_DIR/mods"

# Fabric/Forge: install mod loader instead of Paper
if [ "$TYPE" = "fabric" ]; then
  echo "[$(date)] Installing Fabric $VERSION..."
  FABRIC_INSTALLER_VER="0.16.14"
  FABRIC_INSTALLER="/tmp/fabric-installer-$SERVER_ID.jar"
  wget -q -L "https://maven.fabricmc.net/net/fabricmc/fabric-installer/${FABRIC_INSTALLER_VER}/fabric-installer-${FABRIC_INSTALLER_VER}.jar" \
    -O "$FABRIC_INSTALLER"
  if [ ! -s "$FABRIC_INSTALLER" ]; then
    echo "[$(date)] ERROR: Could not download Fabric installer"
    exit 1
  fi
  java -jar "$FABRIC_INSTALLER" server -mcversion "$VERSION" -dir "$SERVER_DIR" -downloadMinecraft
  rm -f "$FABRIC_INSTALLER"
  # Fabric generates fabric-server-launch.jar; copy to server.jar for uniform start-server.sh
  if [ -f "$SERVER_DIR/fabric-server-launch.jar" ]; then
    cp "$SERVER_DIR/fabric-server-launch.jar" "$SERVER_DIR/server.jar"
    echo "[$(date)] Fabric $VERSION installed successfully"
  else
    echo "[$(date)] ERROR: fabric-server-launch.jar not found after install"
    exit 1
  fi

elif [ "$TYPE" = "folia" ]; then
  echo "[$(date)] Installing Folia $VERSION..."
  FOLIA_BUILD=$(curl -sf "https://api.papermc.io/v2/projects/folia/versions/${VERSION}/builds" | python3 -c "import sys,json; builds=json.load(sys.stdin)['builds']; print(builds[-1]['build'])" 2>/dev/null || echo "")
  if [ -z "$FOLIA_BUILD" ]; then echo "[$(date)] ERROR: cannot find Folia build for $VERSION"; exit 1; fi
  wget -q -L "https://api.papermc.io/v2/projects/folia/versions/${VERSION}/builds/${FOLIA_BUILD}/downloads/folia-${VERSION}-${FOLIA_BUILD}.jar" -O "$SERVER_DIR/server.jar"
  if [ ! -s "$SERVER_DIR/server.jar" ]; then echo "[$(date)] ERROR: Folia jar 0 bytes"; exit 1; fi
  echo "[$(date)] Folia $VERSION build $FOLIA_BUILD installed"

elif [ "$TYPE" = "neoforge" ]; then
  echo "[$(date)] Installing NeoForge $VERSION..."
  MC_SHORT="${VERSION#1.}"
  NEO_VER=$(curl -sf "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge" | python3 -c "import sys,json; vs=[v for v in json.load(sys.stdin)['versions'] if v.startswith('${VERSION#1.}.')]; print(sorted(vs)[-1])" 2>/dev/null || echo "")
  if [ -z "$NEO_VER" ]; then echo "[$(date)] ERROR: cannot find NeoForge for $VERSION"; exit 1; fi
  wget -q -L "https://maven.neoforged.net/releases/net/neoforged/neoforge/${NEO_VER}/neoforge-${NEO_VER}-installer.jar" -O "$SERVER_DIR/neoforge-installer.jar"
  if [ ! -s "$SERVER_DIR/neoforge-installer.jar" ]; then echo "[$(date)] ERROR: NeoForge installer 0 bytes"; exit 1; fi
  java -jar "$SERVER_DIR/neoforge-installer.jar" --installServer "$SERVER_DIR" 2>&1
  rm -f "$SERVER_DIR/neoforge-installer.jar"
  echo "[$(date)] NeoForge $NEO_VER installed"

elif [ "$TYPE" = "mohist" ]; then
  echo "[$(date)] Installing Mohist $VERSION..."
  # Use the newest build's own `url` field directly — the latest Mohist builds have
  # no `number` (only a git-SHA), so building the URL from a build number breaks.
  MOHIST_URL=$(curl -sf "https://mohistmc.com/api/v2/projects/mohist/${VERSION}/builds" | python3 -c "import sys,json; b=json.load(sys.stdin).get('builds',[]); print((b[-1].get('url') or '') if b else '')" 2>/dev/null || echo "")
  if [ -z "$MOHIST_URL" ]; then echo "[$(date)] ERROR: cannot find Mohist build for $VERSION"; exit 1; fi
  wget -q -L "$MOHIST_URL" -O "$SERVER_DIR/server.jar"
  if [ ! -s "$SERVER_DIR/server.jar" ]; then echo "[$(date)] ERROR: Mohist jar 0 bytes"; exit 1; fi
  echo "[$(date)] Mohist $VERSION installed from $MOHIST_URL"

elif [ "$TYPE" = "purpur" ]; then
  echo "[$(date)] Installing Purpur $VERSION..."
  PURPUR_URL="https://api.purpurmc.org/v2/purpur/${VERSION}/latest/download"
  VERSION_JAR="$SERVER_DIR/server.jar"
  wget -q -L "$PURPUR_URL" -O "$VERSION_JAR"
  if [ ! -s "$VERSION_JAR" ]; then
    echo "[$(date)] ERROR: Could not download Purpur $VERSION"
    exit 1
  fi
  echo "[$(date)] Purpur $VERSION installed"

elif [ "$TYPE" = "vanilla" ]; then
  echo "[$(date)] Installing Vanilla $VERSION..."
  # Get server jar URL from Mojang manifest
  MANIFEST_URL="https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
  VERSION_META_URL=$(curl -sf "$MANIFEST_URL" | node -e "
    process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { const o=JSON.parse(d); const v=o.versions.find(x=>x.id==='${VERSION}');
        console.log(v?v.url:''); } catch(e){console.log('');}
    });
  " 2>/dev/null || echo "")
  if [ -z "$VERSION_META_URL" ]; then
    echo "[$(date)] ERROR: Vanilla $VERSION not found in Mojang manifest"
    exit 1
  fi
  VANILLA_JAR_URL=$(curl -sf "$VERSION_META_URL" | node -e "
    process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { const o=JSON.parse(d); console.log(o.downloads.server.url); } catch(e){console.log('');}
    });
  " 2>/dev/null || echo "")
  if [ -z "$VANILLA_JAR_URL" ]; then
    echo "[$(date)] ERROR: Could not get Vanilla server jar URL"
    exit 1
  fi
  VERSION_JAR="$SERVER_DIR/server.jar"
  wget -q -L "$VANILLA_JAR_URL" -O "$VERSION_JAR"
  if [ ! -s "$VERSION_JAR" ]; then
    echo "[$(date)] ERROR: Vanilla jar download failed"
    exit 1
  fi
  echo "[$(date)] Vanilla $VERSION installed"

elif [ "$TYPE" = "forge" ]; then
  echo "[$(date)] Installing Forge $VERSION..."
  FORGE_META=$(curl -sf "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json" 2>/dev/null || echo "{}")
  FORGE_BUILD=$(echo "$FORGE_META" | node -e "
    process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try { const o=JSON.parse(d); const k='${VERSION}-recommended'; const k2='${VERSION}-latest';
        console.log(o.promos[k]||o.promos[k2]||''); } catch(e){console.log('');}
    });
  " 2>/dev/null || echo "")
  if [ -z "$FORGE_BUILD" ]; then
    echo "[$(date)] ERROR: No Forge build found for MC $VERSION"
    exit 1
  fi
  FORGE_INSTALLER="/tmp/forge-installer-$SERVER_ID.jar"
  FORGE_URL="https://files.minecraftforge.net/net/minecraftforge/forge/${VERSION}-${FORGE_BUILD}/forge-${VERSION}-${FORGE_BUILD}-installer.jar"
  wget -q -L "$FORGE_URL" -O "$FORGE_INSTALLER"
  if [ ! -s "$FORGE_INSTALLER" ]; then
    echo "[$(date)] ERROR: Could not download Forge installer"
    exit 1
  fi
  java -jar "$FORGE_INSTALLER" --installServer "$SERVER_DIR"
  rm -f "$FORGE_INSTALLER"
  # Find forge unix_args.txt / run.sh (modern Forge) or forge-*.jar (legacy)
  if [ -f "$SERVER_DIR/run.sh" ]; then
    # Modern Forge (1.17+) uses run.sh
    cp "$SERVER_DIR/run.sh" "$SERVER_DIR/server.jar" 2>/dev/null || true
    echo "[$(date)] Forge ${VERSION}-${FORGE_BUILD} installed (modern, run.sh)"
  else
    FORGE_JAR=$(ls "$SERVER_DIR"/forge-*.jar 2>/dev/null | grep -v installer | head -1)
    if [ -n "$FORGE_JAR" ]; then
      cp "$FORGE_JAR" "$SERVER_DIR/server.jar"
      echo "[$(date)] Forge ${VERSION}-${FORGE_BUILD} installed (legacy jar)"
    else
      echo "[$(date)] ERROR: No Forge jar found after install"
      exit 1
    fi
  fi

else
  # Paper (default) — version-aware jar selection with auto-download
  VERSION_JAR="$BASE/templates/paper/paper-${VERSION}.jar"
  if [ ! -f "$VERSION_JAR" ]; then
    echo "[$(date)] Downloading Paper $VERSION..."
    DOWNLOADED=false

    # 26.x versions use new PaperMC download system (fill-data.papermc.io)
    if echo "$VERSION" | grep -qE '^[2-9][0-9]\.' ; then
      echo "[$(date)] Using new PaperMC download system for $VERSION..."
      DL_URL=$(python3 -c "
import re, urllib.request
try:
    req = urllib.request.Request('https://papermc.io/downloads/paper', headers={'User-Agent': 'curl/7.88'})
    content = urllib.request.urlopen(req, timeout=20).read().decode('latin-1', errors='replace')
    ver = '${VERSION}'.replace('.', r'\\\.')
    urls = re.findall(r'fill-data\\.papermc\\.io/v1/objects/[a-f0-9]+/paper-' + ver + r'-[0-9]+\\.jar', content)
    print('https://' + urls[0] if urls else '')
except Exception as e:
    print('')
" 2>/dev/null || echo "")
      if [ -n "$DL_URL" ]; then
        wget -q --timeout=120 -L "$DL_URL" -O "$VERSION_JAR" \
          && echo "[$(date)] Downloaded Paper $VERSION from $DL_URL" && DOWNLOADED=true
      fi

    else
      # 1.x.x versions use old PaperMC API
      BUILD=$(curl -sf "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds" | \
        node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{try{const o=JSON.parse(d); console.log(o.builds[o.builds.length-1].build);}catch(e){process.exit(1);}})" 2>/dev/null || echo "")
      if [ -n "$BUILD" ]; then
        wget -q "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}/downloads/paper-${VERSION}-${BUILD}.jar" \
          -O "$VERSION_JAR" && echo "[$(date)] Downloaded Paper $VERSION build $BUILD" && DOWNLOADED=true
      fi
    fi

    if [ "$DOWNLOADED" != "true" ]; then
      # NEVER silently fall back to the template jar (1.21.1) under the requested
      # label — that is the "server says 26.1.2 but really runs 1.21.1, client
      # can't connect" bug. Fail loudly so the panel reports a real error.
      # Also remove a possibly-partial cache file so we never reuse a bad jar.
      rm -f "$VERSION_JAR"
      echo "[$(date)] ERROR: Could not download Paper $VERSION. Paper does not build this version (max is the PaperMC API latest, e.g. 1.21.11). Refusing to install a different version under a false label. Pick a real Paper version."
      exit 1
    fi
  fi

  if [ ! -f "$VERSION_JAR" ]; then
    echo "[$(date)] ERROR: Paper $VERSION jar not found after download. Aborting instead of installing a mislabeled jar."
    exit 1
  fi

  cp "$VERSION_JAR" "$SERVER_DIR/server.jar"
fi

if [ ! -s "$SERVER_DIR/server.jar" ]; then
  echo "[$(date)] ERROR: server.jar missing or 0 bytes after install for TYPE=$TYPE VERSION=$VERSION"
  exit 1
fi

# B-8: ZIP-magic jar validation for real jar artifacts. Forge/NeoForge "modern"
# loaders copy a run.sh shell-launcher to server.jar (NOT a zip), so skip those.
case "$TYPE" in
  forge|neoforge)
    : # server.jar may be a run.sh launcher — size check above is sufficient
    ;;
  *)
    if ! is_valid_jar "$SERVER_DIR/server.jar"; then
      echo "[$(date)] ERROR: server.jar for TYPE=$TYPE VERSION=$VERSION is not a valid jar (ZIP magic check failed — likely an HTML error page). Refusing to install a corrupt jar."
      exit 1
    fi
    ;;
esac

echo "[$(date)] download-server-jar OK: $TYPE $VERSION -> $SERVER_DIR/server.jar"
