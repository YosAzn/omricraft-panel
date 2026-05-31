const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const http = require("http");
const https = require("https");

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
    const { displayName, version, memoryMb, gamemode, ops, maxPlayers, seed, addons, icon, isPrivate } = request.data || {};

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
      type: 'paper',
      version: version || '1.21.1',
      gamePort,
      rconPort,
      memoryMb: memoryMb || 2048,
      gamemode: gamemode || 'survival',
      maxPlayers: maxPlayers || 20,
      seed: seed || '',
      ops: Array.isArray(ops) ? ops : [],
      addons: Array.isArray(addons) ? addons : [],
      icon: icon || '',
      isPrivate: isPrivate === true
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
// getPaperVersions — fetches Paper versions server-side (bypasses CORS)
// ---------------------------------------------------------------------------
exports.getPaperVersions = onCall(
  { region: "us-central1", timeoutSeconds: 15 },
  async () => {
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
              resolve({ success: true, versions: stable });
            } catch {
              resolve({ success: false, versions: [] });
            }
          });
        }
      );
      req.on('error', () => resolve({ success: false, versions: [] }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, versions: [] }); });
    });
  }
);
