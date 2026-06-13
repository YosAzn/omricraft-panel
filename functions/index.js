const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const http = require("http");
const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const managerApiUrl = defineSecret("MANAGER_API_URL");
const managerApiKey = defineSecret("MANAGER_API_KEY");

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
      port: url.port || 80,
      path: url.pathname,
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 110000
    };

    const req = http.request(options, (res) => {
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

    const usedPorts = new Set(existingServers.map(s => s.gamePort).filter(Boolean));
    let gamePort = 25566;
    while (usedPorts.has(gamePort)) gamePort++;
    const rconPort = gamePort + 10;

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
    } catch(e) {}
    return await callManagerApi(BASE_URL, API_KEY, 'POST', '/start-server', { serverId, memoryMb });
  }
);

exports.stopServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
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
// removePluginJar — deletes a single .jar from a server's plugins dir (VPS truth)
// ---------------------------------------------------------------------------
exports.removePluginJar = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 20,
  },
  async (request) => {
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
// updateServerMemory — sets memoryMb in servers.json (effective on next restart)
// ---------------------------------------------------------------------------
exports.updateServerMemory = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
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
      // NeoForge / Mohist: deriving a clean MC version from NeoForge's maven version
      // string (e.g. 21.1.x → MC 1.21.1) and Mohist's per-MC builds is messy and
      // error-prone. Until a reliable mapping exists, fall back to the Paper list so
      // the UI never offers a version the backend can't resolve to a real jar.
      neoforge: async () => sources.paper(),
      mohist: async () => sources.paper(),
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
