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
  # Resolve the LATEST Fabric installer dynamically so a pinned version can't 404
  # (the old hard-pinned 0.16.14 went dead). meta.fabricmc.net returns newest-first;
  # [0].version + [0].url are the current installer. Fall back to 1.1.1 if fetch fails.
  FABRIC_INSTALLER_VER=$(curl -sf "https://meta.fabricmc.net/v2/versions/installer" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['version'])" 2>/dev/null || echo "")
  FABRIC_INSTALLER_FETCHED_URL=$(curl -sf "https://meta.fabricmc.net/v2/versions/installer" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['url'])" 2>/dev/null || echo "")
  if [ -z "$FABRIC_INSTALLER_VER" ]; then
    FABRIC_INSTALLER_VER="1.1.1"
  fi
  if [ -z "$FABRIC_INSTALLER_FETCHED_URL" ]; then
    FABRIC_INSTALLER_FETCHED_URL="https://maven.fabricmc.net/net/fabricmc/fabric-installer/${FABRIC_INSTALLER_VER}/fabric-installer-${FABRIC_INSTALLER_VER}.jar"
  fi
  echo "[$(date)] Fabric installer version: $FABRIC_INSTALLER_VER"
  FABRIC_INSTALLER="/tmp/fabric-installer-$SERVER_ID.jar"
  wget -q -L "$FABRIC_INSTALLER_FETCHED_URL" \
    -O "$FABRIC_INSTALLER"
  if [ ! -s "$FABRIC_INSTALLER" ]; then
    echo "[$(date)] ERROR: Could not download Fabric installer"
    exit 1
  fi
  java -jar "$FABRIC_INSTALLER" server -mcversion "$VERSION" -dir "$SERVER_DIR" -downloadMinecraft
  rm -f "$FABRIC_INSTALLER"
  # -downloadMinecraft places the REAL ~56MB Minecraft server at server.jar, and
  # fabric-server-launcher.properties points serverJar=server.jar. The launcher
  # (fabric-server-launch.jar, ~639B) loads that. DO NOT copy the launcher over
  # server.jar — that clobbers the real MC jar and Fabric can't locate the game.
  # start-server.sh detects fabric-server-launch.jar and launches via it.
  if [ ! -f "$SERVER_DIR/fabric-server-launch.jar" ]; then
    echo "[$(date)] ERROR: fabric-server-launch.jar not found after install"
    exit 1
  fi
  if [ ! -s "$SERVER_DIR/server.jar" ]; then
    echo "[$(date)] ERROR: Fabric did not download the Minecraft server jar (server.jar missing). Cannot start."
    exit 1
  fi
  echo "[$(date)] Fabric $VERSION installed successfully (launcher + MC server.jar)"

elif [ "$TYPE" = "folia" ]; then
  echo "[$(date)] Installing Folia $VERSION..."
  FOLIA_BUILD=$(curl -sf "https://api.papermc.io/v2/projects/folia/versions/${VERSION}/builds" | python3 -c "import sys,json; builds=json.load(sys.stdin)['builds']; print(builds[-1]['build'])" 2>/dev/null || echo "")
  if [ -z "$FOLIA_BUILD" ]; then echo "[$(date)] ERROR: cannot find Folia build for $VERSION"; exit 1; fi
  wget -q -L "https://api.papermc.io/v2/projects/folia/versions/${VERSION}/builds/${FOLIA_BUILD}/downloads/folia-${VERSION}-${FOLIA_BUILD}.jar" -O "$SERVER_DIR/server.jar"
  if [ ! -s "$SERVER_DIR/server.jar" ]; then echo "[$(date)] ERROR: Folia jar 0 bytes"; exit 1; fi
  echo "[$(date)] Folia $VERSION build $FOLIA_BUILD installed"

elif [ "$TYPE" = "neoforge" ]; then
  echo "[$(date)] Installing NeoForge $VERSION..."
  # Map MC version -> NeoForge prefix: MC 1.X.Y -> "X.Y.", MC 1.X -> "X.0.". Anchor to
  # the FULL minor so "1.21" can't match every 21.x build, and sort NUMERICALLY (string
  # sort wrongly ranks 21.9.9 above 21.11.1). Prefer stable over -beta/-rc.
  NEO_VER=$(curl -sf "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge" | python3 -c "import sys,json,re; v='${VERSION}'.split('.'); prefix=(v[1] if len(v)>1 else '0')+'.'+(v[2] if len(v)>2 else '0')+'.'; allv=[x for x in json.load(sys.stdin)['versions'] if x.startswith(prefix)]; key=lambda s: tuple(int(n) for n in re.findall(r'\d+', s)); stable=[x for x in allv if 'beta' not in x.lower() and 'rc' not in x.lower()]; pick=stable or allv; print(sorted(pick,key=key)[-1] if pick else '')" 2>/dev/null || echo "")
  if [ -z "$NEO_VER" ]; then echo "[$(date)] ERROR: cannot find NeoForge for $VERSION"; exit 1; fi
  wget -q -L "https://maven.neoforged.net/releases/net/neoforged/neoforge/${NEO_VER}/neoforge-${NEO_VER}-installer.jar" -O "$SERVER_DIR/neoforge-installer.jar"
  if [ ! -s "$SERVER_DIR/neoforge-installer.jar" ]; then echo "[$(date)] ERROR: NeoForge installer 0 bytes"; exit 1; fi
  java -jar "$SERVER_DIR/neoforge-installer.jar" --installServer "$SERVER_DIR" 2>&1
  rm -f "$SERVER_DIR/neoforge-installer.jar"
  # NeoForge (like modern Forge) ships a run.sh launcher, not a runnable jar. Copy it
  # to server.jar so the universal 0-byte/size check passes, and drop a .use-run-sh
  # sentinel so start-server.sh launches via run.sh (loader-name-INDEPENDENT — do not
  # rely on grepping "neoforge" out of run.sh, which silently breaks plain Forge).
  if [ -f "$SERVER_DIR/run.sh" ]; then
    cp "$SERVER_DIR/run.sh" "$SERVER_DIR/server.jar" 2>/dev/null || true
    : > "$SERVER_DIR/.use-run-sh"
    echo "[$(date)] NeoForge $NEO_VER installed (modern, run.sh)"
  else
    echo "[$(date)] ERROR: NeoForge run.sh not found after install"
    exit 1
  fi

elif [ "$TYPE" = "mohist" ]; then
  echo "[$(date)] Installing Mohist $VERSION..."
  # v3 API (api.mohistmc.com). The old v2 host (mohistmc.com/api/v2) is dead. v3 returns
  # a builds array; take the last build's numeric `id`, then download via the dedicated
  # /builds/{id}/download endpoint. NOTE: Mohist only publishes builds for 1.20.1 (no
  # 1.21.x) — the create form caps Mohist to 1.20.1 (see src/lib/constants.js).
  MOHIST_BUILD_ID=$(curl -sf "https://api.mohistmc.com/project/mohist/${VERSION}/builds" | python3 -c "import sys,json; d=json.load(sys.stdin); b=d if isinstance(d,list) else d.get('builds',[]); print(b[-1]['id'] if b else '')" 2>/dev/null || echo "")
  if [ -z "$MOHIST_BUILD_ID" ]; then echo "[$(date)] ERROR: cannot find Mohist build for $VERSION (Mohist publishes 1.20.1 only)"; exit 1; fi
  MOHIST_URL="https://api.mohistmc.com/project/mohist/${VERSION}/builds/${MOHIST_BUILD_ID}/download"
  wget -q -L "$MOHIST_URL" -O "$SERVER_DIR/server.jar"
  if [ ! -s "$SERVER_DIR/server.jar" ]; then echo "[$(date)] ERROR: Mohist jar 0 bytes"; exit 1; fi
  echo "[$(date)] Mohist $VERSION build $MOHIST_BUILD_ID installed from $MOHIST_URL"

elif [ "$TYPE" = "youer" ]; then
  echo "[$(date)] Installing Youer $VERSION..."
  # Youer = MohistMC's maintained NeoForge hybrid (the live successor to the EOL Mohist).
  # Same v3 API (api.mohistmc.com), just the `youer` project. Take the last build's
  # numeric `id`, then download via /builds/{id}/download. The resulting server.jar is a
  # RUNNABLE jar (Main-Class: com.mohistmc.launcher.youer.Main) launched via `java -jar`
  # exactly like Mohist — it self-downloads its NeoForge libraries on first boot, no
  # separate install/run.sh step. Youer publishes ONLY 1.21.1 (see /project/youer/versions),
  # so the create form caps Youer to 1.21.1 (src/lib/constants.js TYPE_VERSION_LIMITS).
  YOUER_BUILD_ID=$(curl -sf "https://api.mohistmc.com/project/youer/${VERSION}/builds" | python3 -c "import sys,json; d=json.load(sys.stdin); b=d if isinstance(d,list) else d.get('builds',[]); print(b[-1]['id'] if b else '')" 2>/dev/null || echo "")
  if [ -z "$YOUER_BUILD_ID" ]; then echo "[$(date)] ERROR: cannot find Youer build for $VERSION (Youer publishes 1.21.1 only)"; exit 1; fi
  YOUER_URL="https://api.mohistmc.com/project/youer/${VERSION}/builds/${YOUER_BUILD_ID}/download"
  wget -q -L "$YOUER_URL" -O "$SERVER_DIR/server.jar"
  if [ ! -s "$SERVER_DIR/server.jar" ]; then echo "[$(date)] ERROR: Youer jar 0 bytes"; exit 1; fi
  echo "[$(date)] Youer $VERSION build $YOUER_BUILD_ID installed from $YOUER_URL"

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
  # Download from the maven host (files.minecraftforge.net no longer serves the jar
  # directly — returns an HTML page → 0-byte/HTML jar). promotions_slim.json above
  # still lives on the files host; only the artifact download moves to maven.
  FORGE_URL="https://maven.minecraftforge.net/net/minecraftforge/forge/${VERSION}-${FORGE_BUILD}/forge-${VERSION}-${FORGE_BUILD}-installer.jar"
  wget -q -L "$FORGE_URL" -O "$FORGE_INSTALLER"
  if [ ! -s "$FORGE_INSTALLER" ]; then
    echo "[$(date)] ERROR: Could not download Forge installer"
    exit 1
  fi
  java -jar "$FORGE_INSTALLER" --installServer "$SERVER_DIR"
  rm -f "$FORGE_INSTALLER"
  # Find forge unix_args.txt / run.sh (modern Forge) or forge-*.jar (legacy)
  if [ -f "$SERVER_DIR/run.sh" ]; then
    # Modern Forge (1.17+) uses run.sh. Copy it to server.jar for the size check and
    # drop the .use-run-sh sentinel so start-server.sh launches via run.sh. (Plain
    # Forge run.sh contains "minecraftforge", NOT "neoforge" — the old grep gate
    # silently skipped it and tried java -jar on a shell script: "Invalid jarfile".)
    cp "$SERVER_DIR/run.sh" "$SERVER_DIR/server.jar" 2>/dev/null || true
    : > "$SERVER_DIR/.use-run-sh"
    echo "[$(date)] Forge ${VERSION}-${FORGE_BUILD} installed (modern, run.sh)"
  else
    # Legacy Forge (<=1.16) ships a real runnable forge-*.jar — launched via -jar,
    # so NO .use-run-sh sentinel here.
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
