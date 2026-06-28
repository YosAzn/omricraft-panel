const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const http = require("http");
const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const managerApiUrl = defineSecret("MANAGER_API_URL");
const managerApiKey = defineSecret("MANAGER_API_KEY");

// ---------------------------------------------------------------------------
// Server-side admin gate. The React isAdmin check is cosmetic only — every
// sensitive callable MUST verify the caller here. Keep this list in sync with
// src/App.jsx (ADMIN_EMAILS) and firestore.rules — three copies on purpose,
// since firestore.rules cannot import JS. Adding an admin = one string in all 3.
// ---------------------------------------------------------------------------
const ADMIN_EMAILS = ['yosijo@gmail.com', 'omri.sokolov@gmail.com']; // sync with App.jsx + firestore.rules
function assertAdmin(request) {
  const t = request.auth && request.auth.token;
  if (!request.auth || !t || !t.email || !t.email_verified ||
      !ADMIN_EMAILS.includes(String(t.email || '').toLowerCase())) {
    throw new HttpsError('permission-denied', 'Admin only');
  }
}

// ---------------------------------------------------------------------------
// Hebrew transliteration for slug generation
// ---------------------------------------------------------------------------
const HE_MAP = {
  'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch',
  'ט':'t','י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n',
  'ן':'n','ס':'s','ע':'a','פ':'p','ף':'p','צ':'tz','ץ':'tz','ק':'k',
  'ר':'r','ש':'sh','ת':'t'
};

function slugify(str) {
  return String(str || '')
    .split('')
    .map(c => HE_MAP[c] || c)
    .join('')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
}

// ---------------------------------------------------------------------------
// HTTP helper — calls Oracle Manager API
// ---------------------------------------------------------------------------
function callManagerApi(baseUrl, apiKey, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 110000
    };

    // Pick http/https by the BASE_URL protocol — MANAGER_API_URL is now the TLS
    // endpoint (https://api.omricraft.com); http kept for backward-compat/rollback.
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Manager API request timed out'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// createServer
// ---------------------------------------------------------------------------
exports.createServer = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { displayName, version, memoryMb, gamemode, difficulty, worldType, ops, maxPlayers, seed, addons, icon, isPrivate, whitelistPlayers, type } = request.data || {};

    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return { success: false, error: 'displayName is required' };
    }
    if (displayName.length > 64) {
      return { success: false, error: 'displayName too long (max 64 chars)' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    // Generate slug
    let slug = slugify(displayName);
    if (!slug || slug.length < 2) {
      slug = `server-${Date.now()}`;
    }

    const serverId = `server-${Date.now()}`;

    // Fetch existing servers to find next free port
    let existingServers = [];
    try {
      const listRes = await callManagerApi(BASE_URL, API_KEY, 'GET', '/servers', null);
      existingServers = listRes.servers || [];
    } catch (e) {
      console.warn('Could not fetch existing servers for port allocation:', e.message);
    }

    // Ensure the slug is UNIQUE — two servers with the same display name would
    // otherwise collide on the same subdomain, leaving the newer one unroutable
    // in Velocity (the "new server shows under an old server's name" bug).
    const usedSlugs = new Set(existingServers.map(s => s.slug).filter(Boolean));
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }

    // Dedupe the new port against BOTH existing game AND rcon ports, and put rcon in a
    // separate high range (game+10000) so an rcon port can never collide with another
    // server's game port. The old rcon=game+10 scheme overlapped after ~10 servers
    // (server A's rcon 25576 == server B's game 25576).
    const usedPorts = new Set();
    for (const s of existingServers) {
      if (s.gamePort) usedPorts.add(s.gamePort);
      if (s.rconPort) usedPorts.add(s.rconPort);
    }
    let gamePort = 25566;
    while (usedPorts.has(gamePort) || usedPorts.has(gamePort + 10000)) gamePort++;
    const rconPort = gamePort + 10000;

    console.log(`createServer: id=${serverId} slug=${slug} port=${gamePort}`);

    // Call Oracle Manager API
    const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/create-server', {
      serverId,
      displayName: displayName.trim(),
      slug,
      type: type || 'paper',
      version: version || '1.21.1',
      gamePort,
      rconPort,
      memoryMb: memoryMb || 2048,
      gamemode: gamemode || 'survival',
      difficulty: difficulty || 'normal',
      worldType: worldType || 'default',
      maxPlayers: maxPlayers || 20,
      seed: seed || '',
      ops: Array.isArray(ops) ? ops : [],
      addons: Array.isArray(addons) ? addons : [],
      icon: icon || '',
      isPrivate: isPrivate === true,
      whitelistPlayers: Array.isArray(whitelistPlayers) ? whitelistPlayers : []
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Server creation failed' };
    }

    return {
      success: true,
      id: serverId,
      displayName: displayName.trim(),
      slug,
      address: `${slug}.omricraft.com`,
      publicHost: `${slug}.omricraft.com`,
      gamePort,
      rconPort,
      status: 'starting'
    };
  }
);

// ---------------------------------------------------------------------------
// deleteServer
// ---------------------------------------------------------------------------
exports.deleteServer = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`deleteServer: id=${serverId}`);

    const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/delete-server', { serverId });

    if (!result.success) {
      return { success: false, error: result.error || 'Delete failed' };
    }

    return { success: true, serverId };
  }
);

// ---------------------------------------------------------------------------
// startServer / stopServer — control server via Oracle Manager API
// ---------------------------------------------------------------------------
exports.startServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || !/^[a-z0-9_-]+$/.test(serverId)) return { success: false, error: 'Invalid serverId' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    // Get server memoryMb from servers.json via /servers endpoint
    let memoryMb = 2048;
    try {
      const list = await callManagerApi(BASE_URL, API_KEY, 'GET', '/servers', null);
      const srv = (list.servers || []).find(s => s.id === serverId);
      if (srv && srv.memoryMb) memoryMb = srv.memoryMb;
    } catch(e) { console.error('startServer memoryMb lookup failed, using default:', e.message); }
    return await callManagerApi(BASE_URL, API_KEY, 'POST', '/start-server', { serverId, memoryMb });
  }
);

exports.stopServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || !/^[a-z0-9_-]+$/.test(serverId)) return { success: false, error: 'Invalid serverId' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    return await callManagerApi(BASE_URL, API_KEY, 'POST', '/stop-server', { serverId });
  }
);

// ---------------------------------------------------------------------------
// getServerStatus — returns real running status from VPS PID check
// ---------------------------------------------------------------------------
exports.getServerStatus = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 15,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'GET', `/server-status/${serverId}`, null);
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// setServerPrivacy — enables/disables whitelist via Oracle Manager API
// ---------------------------------------------------------------------------
exports.setServerPrivacy = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, isPrivate } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`setServerPrivacy: id=${serverId} isPrivate=${isPrivate}`);

    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/set-whitelist', { serverId, enabled: isPrivate === true });
      return result;
    } catch (error) {
      console.error('setServerPrivacy error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// updateWhitelistPlayers — writes whitelist.json + reloads via Oracle Manager API
// ---------------------------------------------------------------------------
exports.updateWhitelistPlayers = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, players } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!Array.isArray(players)) {
      return { success: false, error: 'players must be an array' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`updateWhitelistPlayers: id=${serverId} count=${players.length}`);

    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/update-whitelist-players', { serverId, players });
      return result;
    } catch (error) {
      console.error('updateWhitelistPlayers error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// updateServerIcon — writes server-icon.png to VPS via Oracle Manager API
// ---------------------------------------------------------------------------
exports.updateServerIcon = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, icon } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!icon || typeof icon !== 'string') {
      return { success: false, error: 'Missing icon' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`updateServerIcon: id=${serverId}`);

    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/update-icon', { serverId, icon });
      return result;
    } catch (error) {
      console.error('updateServerIcon error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// sendMcCommand — proxies through Oracle Manager API /send-command
// ---------------------------------------------------------------------------
exports.sendMcCommand = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, command } = request.data || {};

    if (!command || typeof command !== 'string') {
      return { success: false, error: 'אין פקודת RCON תקינה' };
    }
    if (!serverId) {
      return { success: false, error: 'serverId required' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`sendMcCommand: serverId=${serverId} command=${command}`);

    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/send-command', { serverId, command });
      return result;
    } catch (error) {
      console.error('sendMcCommand error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// installPlugin — installs or removes a plugin on an existing server
// ---------------------------------------------------------------------------
exports.installPlugin = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 90,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, pluginId, install } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!pluginId || typeof pluginId !== 'string') {
      return { success: false, error: 'Invalid pluginId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    const endpoint = install === false ? '/remove-plugin' : '/install-plugin';
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', endpoint, { serverId, pluginId });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// installDatapack — installs a datapack on an existing server BY addonId.
// SSRF-safe: the client never sends a URL. The Manager API resolves the addonId
// against a server-side allowlist (DATAPACK_CATALOG) and, if the server is up,
// enables + reloads the datapack live over RCON. addonId not in the catalog =>
// { success:false } from the Manager API (no download attempt).
// Contract: installDatapackFn({ serverId, addonId }) -> POST /install-datapack-by-id
// -> { success, addonId, file, path, installedToWorld, rconApplied, needsRestart, note }
// ---------------------------------------------------------------------------
exports.installDatapack = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, addonId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!addonId || typeof addonId !== 'string' || !/^[a-z0-9_-]+$/.test(addonId)) {
      return { success: false, error: 'Invalid addonId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/install-datapack-by-id', { serverId, addonId });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// installMod — installs a mod on an existing fabric/forge/neoforge server BY modId.
// SSRF-safe (same pattern as installDatapack): the client sends only { serverId, modId };
// the Manager API maps modId -> Modrinth slug via a server-side allowlist (MOD_CATALOG),
// reads the server's loader(type)+version from servers.json, and runs install-mod.sh
// which resolves the correct loader+MC build from the Modrinth API. modId not in the
// catalog => { success:false } (no download). Mods need a restart to load (no live RCON).
// ---------------------------------------------------------------------------
exports.installMod = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, modId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!modId || typeof modId !== 'string' || !/^[a-z0-9_-]+$/.test(modId)) {
      return { success: false, error: 'Invalid modId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/install-mod', { serverId, modId });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// installResourcepack — addonId-driven server-forced resource pack (texture). Mirrors
// installDatapack: SSRF-safe (client sends only { serverId, addonId }); the Manager API
// maps addonId -> Modrinth slug (TEXTURE_CATALOG), reads the server's MC version, and
// runs install-resourcepack.sh which writes resource-pack + sha1 into server.properties.
// Resource packs cannot be hot-set over vanilla RCON -> needsRestart:true.
// ---------------------------------------------------------------------------
exports.installResourcepack = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, addonId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!addonId || typeof addonId !== 'string' || !/^[a-z0-9_-]+$/.test(addonId)) {
      return { success: false, error: 'Invalid addonId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/install-resourcepack', { serverId, addonId });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// removePluginJar — deletes a single .jar from a server's plugins dir (VPS truth)
// ---------------------------------------------------------------------------
exports.removePluginJar = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 20,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, file } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!file || typeof file !== 'string' || file.includes('/') || file.includes('..') || !file.endsWith('.jar')) {
      return { success: false, error: 'invalid file' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', `/remove-plugin-jar/${serverId}`, { file });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// File manager — list / read / write files inside a server's directory
// ---------------------------------------------------------------------------
function fileFn(endpoint, timeoutSeconds) {
  return onCall(
    { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: timeoutSeconds || 30 },
    async (request) => {
      assertAdmin(request);
      const { serverId, path: relPath, content } = request.data || {};
      if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
        return { success: false, error: 'Invalid serverId' };
      }
      const BASE_URL = managerApiUrl.value().trim();
      const API_KEY  = managerApiKey.value().trim();
      const body = { serverId };
      if (relPath !== undefined) body.path = relPath;
      if (content !== undefined) body.content = content;
      try {
        return await callManagerApi(BASE_URL, API_KEY, 'POST', endpoint, body);
      } catch (error) {
        return { success: false, error: error?.message || String(error) };
      }
    }
  );
}

exports.listFiles  = fileFn('/list-files');
exports.readFile   = fileFn('/read-file');
exports.writeFile  = fileFn('/write-file');
exports.deleteFile = fileFn('/delete-file');

// ---------------------------------------------------------------------------
// reloadPlugin — sends RCON "reload confirm" to reload all plugins live
// ---------------------------------------------------------------------------
exports.reloadPlugin = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 20,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/send-command', {
        serverId,
        command: 'reload confirm',
      });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// getPlayersOnline — real-time player count for all servers via Manager API
// ---------------------------------------------------------------------------
exports.getPlayersOnline = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 20,
  },
  async (request) => {
    assertAdmin(request);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'GET', '/players', null);
      // Sync server status to Firestore — only write if value changed (L3 fix)
      if (result?.success && result.servers) {
        const batch = db.batch();
        let hasWrites = false;
        await Promise.all(Object.entries(result.servers).map(async ([serverId, info]) => {
          const ref = db.collection('omricraft/main/servers').doc(serverId);
          const newStatus = info.online ? 'online' : 'offline';
          const newPlayers = info.count || 0;
          try {
            const snap = await ref.get();
            const existing = snap.data() || {};
            if (existing.status !== newStatus || existing.players !== newPlayers) {
              batch.update(ref, { status: newStatus, players: newPlayers });
              hasWrites = true;
            }
          } catch { /* doc may not exist yet — skip */ }
        }));
        if (hasWrites) await batch.commit().catch(() => {}); // silent — don't fail the request
      }
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// updateServerOps — writes ops to server via RCON (op/deop commands)
// ---------------------------------------------------------------------------
exports.updateServerOps = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, ops } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!Array.isArray(ops)) {
      return { success: false, error: 'ops must be an array' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/update-ops', { serverId, ops });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// changeDifficulty — updates server.properties + sends RCON /difficulty
// ---------------------------------------------------------------------------
exports.changeDifficulty = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 30,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, difficulty } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const VALID = ['peaceful', 'easy', 'normal', 'hard'];
    if (!VALID.includes(difficulty)) {
      return { success: false, error: 'Invalid difficulty. Must be peaceful|easy|normal|hard' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/change-difficulty', { serverId, difficulty });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// getServerLog — real console log tail from VPS
// ---------------------------------------------------------------------------
exports.getServerLog = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 20 },
  async (request) => {
    assertAdmin(request);
    const { serverId, lines = 100 } = request.data || {};
    if (!serverId || !/^[a-z0-9_-]+$/.test(serverId)) return { success: false, error: 'Invalid serverId' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/read-log', { serverId, lines });
      return result;
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
);

// ---------------------------------------------------------------------------
// updateServerProperties — syncs UI settings to server.properties on VPS
// ---------------------------------------------------------------------------
exports.updateServerProperties = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    assertAdmin(request);
    const { serverId, properties } = request.data || {};
    if (!serverId) return { success: false, error: 'Missing serverId' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/update-server-properties', { serverId, properties });
      return result;
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
);

// ---------------------------------------------------------------------------
// restartServer — dedicated restart (stop+start via single script)
// ---------------------------------------------------------------------------
exports.restartServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId) return { success: false, error: 'Missing serverId' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/restart-server', { serverId });
      return result;
    } catch(e) {
      return { success: false, error: e.message };
    }
  }
);

// ---------------------------------------------------------------------------
// getServerStats — real RAM/CPU from VPS /proc via Manager API
// ---------------------------------------------------------------------------
exports.getServerStats = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 15 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || !/^[a-z0-9_-]+$/.test(serverId)) return { success: false, running: false, ram: 0, cpu: 0 };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'GET', `/server-stats/${serverId}`, null);
      return result;
    } catch (e) {
      return { success: false, running: false, ram: 0, cpu: 0 };
    }
  }
);

// ---------------------------------------------------------------------------
// changeServerVersion — swaps the server jar on the VPS + restarts
// ---------------------------------------------------------------------------
exports.changeServerVersion = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const { serverId, version, type } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!version || typeof version !== 'string' || !/^[0-9][0-9a-z.\-+]*$/i.test(version)) {
      return { success: false, error: 'Invalid version' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    const body = { serverId, version };
    if (type && typeof type === 'string') body.type = type;
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/change-version', body);
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// changeServerType — changes the server software (e.g. paper -> fabric) on the
// VPS. Reuses the /change-version endpoint, which now ALSO rewrites the correct
// Velocity modern-forwarding config for the target family (paper-global.yml for
// Bukkit families; FabricProxy-Lite mod+config for fabric). Forge/NeoForge/
// vanilla are rejected by the manager-api (no reliable modern forwarding).
// ---------------------------------------------------------------------------
const VALID_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'fabric', 'forge', 'neoforge', 'vanilla'];

exports.changeServerType = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const { serverId, type, version } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!type || typeof type !== 'string' || !VALID_TYPES.includes(type)) {
      return { success: false, error: 'Invalid type' };
    }
    if (!version || typeof version !== 'string' || !/^[0-9][0-9a-z.\-+]*$/i.test(version)) {
      return { success: false, error: 'Invalid version' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      // type is mandatory here so the manager-api rewrites forwarding config.
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/change-version', { serverId, version, type });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// updateServerMemory — sets memoryMb in servers.json (effective on next restart)
// ---------------------------------------------------------------------------
exports.updateServerMemory = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    assertAdmin(request);
    const { serverId, memoryMb } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const mem = parseInt(memoryMb, 10);
    if (!Number.isFinite(mem)) return { success: false, error: 'Invalid memoryMb' };
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/update-memory', { serverId, memoryMb: mem });
      return result;
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// getPaperVersions — fetches Paper versions server-side (bypasses CORS)
// ---------------------------------------------------------------------------
exports.getPaperVersions = onCall(
  { region: "us-central1", timeoutSeconds: 15 },
  async () => {
    // Only offer versions Paper ACTUALLY builds. Never inject phantom versions
    // (e.g. 26.x) — Paper/Velocity max out at the API's latest, and offering a
    // version the backend can't download makes create-server silently fall back
    // to a different jar under a false label, and Velocity then rejects clients.
    const SAFE_FALLBACK = ['1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4'];

    return new Promise((resolve) => {
      const req = https.get(
        'https://api.papermc.io/v2/projects/paper',
        { headers: { 'User-Agent': 'OmriCraft-Panel/1.0' } },
        (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const stable = (parsed.versions || [])
                .filter(v => !v.includes('-pre') && !v.includes('-rc') && !v.includes('-alpha') && !v.includes('-beta'))
                .reverse();
              resolve({ success: true, versions: stable.length ? stable : SAFE_FALLBACK });
            } catch {
              resolve({ success: true, versions: SAFE_FALLBACK });
            }
          });
        }
      );
      req.on('error', () => resolve({ success: true, versions: SAFE_FALLBACK }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ success: true, versions: SAFE_FALLBACK }); });
    });
  }
);

// ---------------------------------------------------------------------------
// getVersionMatrix — per-server-type supported MC versions (server-side, no CORS)
// ---------------------------------------------------------------------------
// Each server software supports a DIFFERENT set of MC versions. Paper currently
// tops out at 1.21.x, while Purpur/Fabric/Vanilla already ship the real 26.x
// releases. We fetch each project's own version source so the UI can show ONLY
// versions that type can actually download — no phantom versions, no false
// labels that make create-server fall back to a different jar.
exports.getVersionMatrix = onCall(
  { region: "us-central1", timeoutSeconds: 25 },
  async () => {
    // 1.21.x stable list — used as a sane fallback for any source that fails.
    const FALLBACK_121 = ['1.21.11', '1.21.10', '1.21.9', '1.21.8', '1.21.7', '1.21.6', '1.21.5', '1.21.4', '1.21.3', '1.21.1', '1.21'];

    // Reject pre-releases / snapshots / experimental builds.
    const isStable = (v) => typeof v === 'string'
      && !/-pre|-rc|-alpha|-beta|snapshot|-exp|w\d{2}[a-z]/i.test(v);

    // Numeric version compare (newest-first) — string sort wrongly orders 1.21.9 > 1.21.11.
    const verTuple = (v) => String(v).split('.').map(n => parseInt(n, 10) || 0);
    const cmpVerDesc = (a, b) => {
      const ta = verTuple(a), tb = verTuple(b);
      for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
        const d = (tb[i] || 0) - (ta[i] || 0);
        if (d) return d;
      }
      return 0;
    };

    // Generic JSON GET that never throws — resolves to a fallback on any failure.
    const fetchJson = (url, fallback) => new Promise((resolve) => {
      const req = https.get(url, { headers: { 'User-Agent': 'OmriCraft-Panel/1.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(fallback); }
        });
      });
      req.on('error', () => resolve(fallback));
      req.setTimeout(12000, () => { req.destroy(); resolve(fallback); });
    });

    // Each entry: fetch source, map to a newest-first stable string[] of MC versions.
    const sources = {
      // PaperMC: .versions[] oldest-first → reverse to newest-first.
      paper: async () => {
        const j = await fetchJson('https://api.papermc.io/v2/projects/paper', null);
        const arr = j?.versions;
        if (!Array.isArray(arr) || !arr.length) return FALLBACK_121;
        return arr.filter(isStable).reverse();
      },
      // Folia: same PaperMC API shape.
      folia: async () => {
        const j = await fetchJson('https://api.papermc.io/v2/projects/folia', null);
        const arr = j?.versions;
        if (!Array.isArray(arr) || !arr.length) return FALLBACK_121;
        return arr.filter(isStable).reverse();
      },
      // Purpur: .versions[] oldest-first → reverse. Already ships 26.x.
      purpur: async () => {
        const j = await fetchJson('https://api.purpurmc.org/v2/purpur', null);
        const arr = j?.versions;
        if (!Array.isArray(arr) || !arr.length) return FALLBACK_121;
        return arr.filter(isStable).reverse();
      },
      // Fabric: array of { version, stable }. Already newest-first; keep stable releases.
      fabric: async () => {
        const j = await fetchJson('https://meta.fabricmc.net/v2/versions/game', null);
        if (!Array.isArray(j) || !j.length) return FALLBACK_121;
        return j.filter(g => g && g.stable && isStable(g.version)).map(g => g.version);
      },
      // Vanilla (Mojang): version_manifest_v2 .versions[] {id,type}; keep type==="release".
      vanilla: async () => {
        const j = await fetchJson('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', null);
        const arr = j?.versions;
        if (!Array.isArray(arr) || !arr.length) return FALLBACK_121;
        // Manifest is newest-first already; keep releases only.
        return arr.filter(v => v && v.type === 'release' && isStable(v.id)).map(v => v.id);
      },
      // Forge: promotions_slim.json keys each MC version as "<mc>-recommended"/"<mc>-latest".
      // Extract the distinct MC versions that actually have a Forge build (no Paper aliasing).
      forge: async () => {
        const j = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', null);
        const promos = j?.promos;
        if (!promos || typeof promos !== 'object') return FALLBACK_121;
        const mc = new Set();
        for (const key of Object.keys(promos)) {
          const m = key.match(/^(\d+\.\d+(?:\.\d+)?)-(?:recommended|latest)$/);
          if (m && isStable(m[1])) mc.add(m[1]);
        }
        const list = Array.from(mc);
        return list.length ? list.sort(cmpVerDesc) : FALLBACK_121;
      },
      // NeoForge: maven versions like "21.1.93" → MC "1.21.1" (major.minor → 1.major.minor).
      // Real source so the form never offers a version with no NeoForge jar.
      neoforge: async () => {
        const j = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge', null);
        const arr = j?.versions;
        if (!Array.isArray(arr) || !arr.length) return FALLBACK_121;
        const mc = new Set();
        for (const v of arr) {
          const m = String(v).match(/^(\d+)\.(\d+)\.\d+/);
          if (m) mc.add(`1.${m[1]}.${m[2]}`);
        }
        const list = Array.from(mc).filter(isStable);
        return list.length ? list.sort(cmpVerDesc) : FALLBACK_121;
      },
      // Mohist only publishes 1.20.1 builds — offer exactly that, no phantom versions.
      mohist: async () => ['1.20.1'],
    };

    const keys = Object.keys(sources);
    const results = await Promise.all(keys.map(async (k) => {
      try {
        const list = await sources[k]();
        return [k, (Array.isArray(list) && list.length) ? list : FALLBACK_121];
      } catch (e) {
        console.error(`getVersionMatrix source failed: ${k}`, e);
        return [k, FALLBACK_121];
      }
    }));

    const matrix = Object.fromEntries(results);
    return { success: true, matrix };
  }
);

// ---------------------------------------------------------------------------
// backupServer — creates a full world/server backup on the VPS via Manager API
// ---------------------------------------------------------------------------
exports.backupServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/backup-server', { serverId });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// listBackups — lists existing backups for a server (newest-first) via Manager API
// ---------------------------------------------------------------------------
exports.listBackups = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'GET', `/list-backups/${serverId}`, null);
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// restoreBackup — restores a server from a backup file (does NOT auto-start) via
// Manager API. The backend makes a safety backup of the current world first and
// returns { restartNeeded: true } so the UI can offer to start the server.
// ---------------------------------------------------------------------------
exports.restoreBackup = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 300 },
  async (request) => {
    assertAdmin(request);
    const { serverId, fileName } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!fileName || typeof fileName !== 'string' || fileName.includes('/') || fileName.includes('..')) {
      return { success: false, error: 'Invalid fileName' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/restore-backup', { serverId, fileName });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// War Room / חמ"ל — getDiagnostics (ADMIN-ONLY): runs the health scan on the
// VPS (Manager API GET /diagnostics) and returns the list of detected issues.
// Read-only: no server state is changed by this call.
// ---------------------------------------------------------------------------
exports.getDiagnostics = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'GET', '/diagnostics', null);
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// resetServerStatus (ADMIN-ONLY) — sets a stuck server's status to 'stopped' in
// servers.json via Manager API /reset-status. The Manager API refuses to reset a
// server that is actually running, so this is safe.
// ---------------------------------------------------------------------------
exports.resetServerStatus = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 20 },
  async (request) => {
    assertAdmin(request);
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/reset-status', { serverId });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// removeDatapack (ADMIN-ONLY) — deletes a single datapack zip from a server's
// world/datapacks/ via Manager API /remove-datapack (DESTRUCTIVE). The Manager
// API enforces strict path-safety: file must be a plain basename strictly inside
// that server's datapacks dir. We re-validate the basename here too (defence in
// depth). On a running server the backend attempts a live RCON reload.
// ---------------------------------------------------------------------------
exports.removeDatapack = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const { serverId, file } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!file || typeof file !== 'string' || file.includes('/') || file.includes('\\') || file.includes('..')) {
      return { success: false, error: 'Invalid file' };
    }
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/remove-datapack', { serverId, file });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);
