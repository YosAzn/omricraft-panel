const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const http = require("http");
const https = require("https");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const managerApiUrl = defineSecret("MANAGER_API_URL");
const managerApiKey = defineSecret("MANAGER_API_KEY");
// GEMINI_API_KEY is OPTIONAL and read from process.env at call time — NOT bound
// via defineSecret(), because a bound secret with no value blocks `firebase deploy
// --non-interactive` (CI). Reading from env means: if the env var is unset/empty
// (the default — nobody has set it), suggestModpack's Gemini path gracefully falls
// back to the keyless Modrinth search and never throws. To enable Gemini later:
//   firebase functions:secrets:set GEMINI_API_KEY
// then add `geminiSecret` to suggestModpack's secrets array (a one-line change).
const readGeminiKey = () => String(process.env.GEMINI_API_KEY || '').trim();

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

// True if the authenticated caller is an OmriCraft admin (verified email in the
// allowlist). Non-throwing — used to branch scope/permission logic for callables
// that are NOT admin-only (e.g. getDiagnostics, owner-or-admin mutations).
function isAdminRequest(request) {
  const t = request.auth && request.auth.token;
  return !!(request.auth && t && t.email && t.email_verified &&
    ADMIN_EMAILS.includes(String(t.email || '').toLowerCase()));
}

// Require ANY authenticated caller. Returns the uid. Rejects unauthenticated.
function requireAuth(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign-in required');
  }
  return uid;
}

// Returns the set of serverIds the caller may VIEW, matching the frontend's
// visibleServers rule (App.jsx): admin → ALL servers; otherwise → servers the
// caller strictly owns (ownerUid === uid) OR legacy servers with no ownerUid.
// Ownership is read from Firestore (omricraft/main/servers). Returns null to
// mean "all servers" (admin) so callers can skip filtering entirely.
async function accessibleServerIds(request) {
  if (isAdminRequest(request)) return null; // null = unrestricted (all servers)
  const uid = requireAuth(request);
  const ids = new Set();
  const snap = await db.collection('omricraft/main/servers').get();
  snap.forEach((doc) => {
    const data = doc.data() || {};
    // Legacy server (no ownerUid) is visible to everyone; otherwise strict match.
    if (!data.ownerUid || data.ownerUid === uid) ids.add(doc.id);
  });
  return ids;
}

// Authorize a STATE-CHANGING action on a single server. Admins may act on any
// server. A non-admin may act ONLY on a server they STRICTLY own (its Firestore
// doc ownerUid === their uid). Legacy/unowned servers do NOT grant mutation
// rights to non-admins (read-visible != writable). Throws permission-denied.
async function assertOwnerOrAdmin(request, serverId) {
  if (isAdminRequest(request)) return;
  const uid = requireAuth(request);
  const ref = db.collection('omricraft/main/servers').doc(serverId);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : null;
  if (!data || data.ownerUid !== uid) {
    throw new HttpsError('permission-denied', 'You do not own this server');
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
// createServerInternal — the SHARED server-creation logic (no auth check here).
// Callers MUST authorize BEFORE calling this. Used by:
//   - exports.createServer  (admin-only callable; today's direct create path)
//   - exports.approveServerRequest (admin approves a non-admin's request)
// Returns the SAME success/error shape the createServer callable always returned,
// so the existing client contract is unchanged. When ownerUid is provided it is
// echoed back so the caller can stamp the Firestore doc's ownerUid (e.g. an
// approved request's server belongs to the original REQUESTER, not the admin).
// ---------------------------------------------------------------------------
async function createServerInternal(config) {
  const { displayName, version, memoryMb, gamemode, difficulty, worldType, ops, maxPlayers, seed, addons, icon, isPrivate, whitelistPlayers, type, ownerUid } = config || {};

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

  console.log(`createServerInternal: id=${serverId} slug=${slug} port=${gamePort} ownerUid=${ownerUid || '(admin/default)'}`);

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
    // Only present when the caller passed an ownerUid (request-approval path); the
    // direct admin createServer path leaves this undefined and behaves as before.
    ...(ownerUid ? { ownerUid } : {}),
    status: 'starting'
  };
}

// ---------------------------------------------------------------------------
// createServer — admin-only callable. Accepts an OPTIONAL ownerUid: when an admin
// passes it (e.g. via approveServerRequest), the resulting server is OWNED by that
// uid. Without it, behaves EXACTLY as before (no ownerUid in the response).
// ---------------------------------------------------------------------------
exports.createServer = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const data = request.data || {};
    // ownerUid is only honored from an authenticated ADMIN caller (assertAdmin above).
    const ownerUid = (typeof data.ownerUid === 'string' && data.ownerUid.trim()) ? data.ownerUid.trim() : undefined;
    return await createServerInternal({ ...data, ownerUid });
  }
);

// ---------------------------------------------------------------------------
// requestServer (ANY authenticated caller) — a non-admin submits a request to
// create a server. Writes a pending doc to omricraft/main/serverRequests; an admin
// later approves it (approveServerRequest) which runs the shared create logic with
// ownerUid = the requester. The config is validated to the same shape the create
// form sends; nothing is provisioned here. All reads/writes of serverRequests go
// through admin-SDK callables (bypassing security rules) so firestore.rules is
// unchanged and clients never touch the collection directly.
// ---------------------------------------------------------------------------
const REQUEST_VALID_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'youer', 'fabric', 'forge', 'neoforge', 'vanilla'];

exports.requestServer = onCall(
  { region: "us-central1", timeoutSeconds: 30 },
  async (request) => {
    const requesterUid = requireAuth(request);
    const d = request.data || {};

    // Validate the same fields the create form sends (mirror createServerInternal).
    const displayName = typeof d.displayName === 'string' ? d.displayName.trim() : '';
    if (!displayName) return { success: false, error: 'displayName is required' };
    if (displayName.length > 64) return { success: false, error: 'displayName too long (max 64 chars)' };
    const type = REQUEST_VALID_TYPES.includes(d.type) ? d.type : 'paper';
    const version = (typeof d.version === 'string' && /^[0-9][0-9a-z.\-+]*$/i.test(d.version)) ? d.version : '1.21.1';
    const memNum = parseInt(d.memoryMb, 10);
    const memoryMb = Number.isFinite(memNum) ? Math.min(Math.max(memNum, 512), 4096) : 2048;
    const maxNum = parseInt(d.maxPlayers, 10);
    const maxPlayers = Number.isFinite(maxNum) ? Math.min(Math.max(maxNum, 1), 100) : 20;

    // Build a sanitized config snapshot. Stored as-is; provisioned only on approval.
    const config = {
      displayName,
      type,
      version,
      memoryMb,
      gamemode: typeof d.gamemode === 'string' ? d.gamemode : 'survival',
      difficulty: typeof d.difficulty === 'string' ? d.difficulty : 'normal',
      worldType: typeof d.worldType === 'string' ? d.worldType : 'default',
      maxPlayers,
      seed: typeof d.seed === 'string' ? d.seed : '',
      ops: Array.isArray(d.ops) ? d.ops.filter(x => typeof x === 'string').slice(0, 50) : [],
      addons: Array.isArray(d.addons) ? d.addons.filter(x => typeof x === 'string').slice(0, 100) : [],
      icon: typeof d.icon === 'string' ? d.icon : '',
      isPrivate: d.isPrivate === true,
      whitelistPlayers: Array.isArray(d.whitelistPlayers) ? d.whitelistPlayers.filter(x => typeof x === 'string').slice(0, 200) : []
    };

    try {
      const ref = await db.collection('omricraft/main/serverRequests').add({
        requesterUid,
        requesterEmail: (request.auth.token && request.auth.token.email) || null,
        config,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`requestServer: id=${ref.id} requester=${requesterUid} name="${displayName}"`);
      return { success: true, requestId: ref.id };
    } catch (error) {
      console.error('requestServer error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// getPendingRequests (ADMIN only) — admin-SDK read of all pending server requests.
// Returns a plain array the review UI lists. createdAt is serialized to millis so
// it survives the callable JSON boundary.
// ---------------------------------------------------------------------------
exports.getPendingRequests = onCall(
  { region: "us-central1", timeoutSeconds: 20 },
  async (request) => {
    assertAdmin(request);
    try {
      const snap = await db.collection('omricraft/main/serverRequests')
        .where('status', '==', 'pending')
        .get();
      const requests = snap.docs.map((doc) => {
        const r = doc.data() || {};
        const cfg = r.config || {};
        const ts = r.createdAt && typeof r.createdAt.toMillis === 'function' ? r.createdAt.toMillis() : null;
        return {
          id: doc.id,
          requesterEmail: r.requesterEmail || null,
          config: {
            displayName: cfg.displayName || '',
            type: cfg.type || 'paper',
            version: cfg.version || '',
            memoryMb: cfg.memoryMb || null,
            gamemode: cfg.gamemode || '',
            difficulty: cfg.difficulty || '',
            maxPlayers: cfg.maxPlayers || null,
            isPrivate: cfg.isPrivate === true
          },
          createdAt: ts
        };
      });
      // Newest-first (serverTimestamp may be null momentarily right after write).
      requests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return { success: true, requests };
    } catch (error) {
      console.error('getPendingRequests error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// approveServerRequest (ADMIN only) — reads a pending request, runs the SHARED
// create logic with the request's config + ownerUid = requesterUid (so the server
// belongs to the requester), then marks the request approved + records the created
// serverId. Returns the full create result so the client can write the Firestore
// server doc (with ownerUid = requester) just like the direct create path.
// ---------------------------------------------------------------------------
exports.approveServerRequest = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    timeoutSeconds: 120,
  },
  async (request) => {
    assertAdmin(request);
    const { requestId } = request.data || {};
    if (!requestId || typeof requestId !== 'string') {
      return { success: false, error: 'Invalid requestId' };
    }
    const ref = db.collection('omricraft/main/serverRequests').doc(requestId);
    let reqDoc;
    try {
      reqDoc = await ref.get();
    } catch (error) {
      console.error('approveServerRequest read error:', error);
      return { success: false, error: error?.message || String(error) };
    }
    if (!reqDoc.exists) return { success: false, error: 'Request not found' };
    const reqData = reqDoc.data() || {};
    if (reqData.status !== 'pending') {
      return { success: false, error: `Request already ${reqData.status || 'processed'}` };
    }
    const requesterUid = reqData.requesterUid;
    if (!requesterUid) return { success: false, error: 'Request has no requesterUid' };

    // Run the shared create logic, stamping ownerUid = the ORIGINAL requester.
    const result = await createServerInternal({ ...(reqData.config || {}), ownerUid: requesterUid });
    if (!result.success) {
      // Do NOT consume the request on a failed provision — leave it pending to retry.
      return { success: false, error: result.error || 'Server creation failed' };
    }

    try {
      await ref.update({
        status: 'approved',
        createdServerId: result.id,
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      // Server WAS created; only the request-status write failed. Surface it but
      // still return the create result so the client can persist the server doc.
      console.error('approveServerRequest status-update error (server already created):', error);
    }
    // Echo requesterUid + the original config so the client writes a COMPLETE
    // Firestore server doc (software/version/addons/etc.) owned by the requester,
    // mirroring the direct admin-create path.
    return { ...result, ownerUid: requesterUid, requesterUid, config: reqData.config || {} };
  }
);

// ---------------------------------------------------------------------------
// denyServerRequest (ADMIN only) — marks a pending request denied. No provisioning.
// ---------------------------------------------------------------------------
exports.denyServerRequest = onCall(
  { region: "us-central1", timeoutSeconds: 20 },
  async (request) => {
    assertAdmin(request);
    const { requestId } = request.data || {};
    if (!requestId || typeof requestId !== 'string') {
      return { success: false, error: 'Invalid requestId' };
    }
    try {
      const ref = db.collection('omricraft/main/serverRequests').doc(requestId);
      const snap = await ref.get();
      if (!snap.exists) return { success: false, error: 'Request not found' };
      await ref.update({
        status: 'denied',
        deniedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { success: true, requestId };
    } catch (error) {
      console.error('denyServerRequest error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// deleteServer
// ---------------------------------------------------------------------------
exports.deleteServer = onCall(
  {
    region: "us-central1",
    secrets: [managerApiUrl, managerApiKey],
    // 300s: a SOFT delete archives worlds first (can be slow for large maps),
    // matching backupServer/restoreBackup. Permanent deletes finish fast.
    timeoutSeconds: 300,
  },
  async (request) => {
    assertAdmin(request);
    const { serverId, permanent, installedAddons } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }

    // Soft-delete by default (reversible 30-day VPS archive). Only a strict
    // boolean true triggers a permanent (non-archived) hard delete.
    const isPermanent = permanent === true;

    // installedAddons (catalog ids from the Firestore server doc) are passed THROUGH
    // to the Manager API so the soft-delete manifest records the authoritative addon
    // list for a faithful restore (D2). Only string ids are forwarded; a bad shape
    // degrades to []. Ignored on a permanent delete (no archive is written).
    const addonIds = Array.isArray(installedAddons)
      ? installedAddons.filter((x) => typeof x === 'string')
      : [];

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`deleteServer: id=${serverId} permanent=${isPermanent} addons=${addonIds.length}`);

    const result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/delete-server', { serverId, permanent: isPermanent, installedAddons: addonIds });

    if (!result.success) {
      return { success: false, error: result.error || 'Delete failed' };
    }

    // Clear any War-Room dismissals for this id so a later recreation/restore under
    // the same serverId starts clean (best-effort; a failure here must not fail the
    // delete — the diagnostics also drop issues for servers with no live Firestore doc).
    await cleanupDismissedDiagnostics(serverId);

    return { success: true, serverId, permanent: isPermanent };
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
// uploadServerFile — upload a manual/premium plugin .jar (or .zip) into a
// server's own subdir (e.g. plugins/). This is the mechanism for jars that
// can't be auto-fetched (ItemsAdder etc.). Owner-or-admin only.
//
// Size cap = 15 MB. Base64 inflates ~33%, so a 15MB file ≈ ~20MB payload —
// comfortably under the Cloud Functions callable request limit (32MB), with
// headroom for JSON overhead. The manager-api itself accepts up to 25MB, but
// we cap LOWER here to stay safely under the callable limit. We reject an
// oversized payload EARLY (before the network hop) with a friendly message.
// ---------------------------------------------------------------------------
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 MB decoded (client-friendly cap)

exports.uploadServerFile = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 120 },
  async (request) => {
    const { serverId, dir, filename, contentBase64 } = request.data || {};

    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    await assertOwnerOrAdmin(request, serverId);

    if (!filename || typeof filename !== 'string') {
      return { success: false, error: 'Missing filename' };
    }
    // Basename only — no path separators or traversal (defence-in-depth; VPS re-checks).
    if (filename !== filename.replace(/^.*[\\/]/, '') || filename.indexOf('..') !== -1) {
      return { success: false, error: 'Invalid filename' };
    }
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    if (ext !== '.jar' && ext !== '.zip') {
      return { success: false, error: 'רק קבצי .jar או .zip נתמכים / Only .jar or .zip files are supported' };
    }
    if (typeof dir !== 'undefined' && typeof dir !== 'string') {
      return { success: false, error: 'Invalid dir' };
    }
    if (!contentBase64 || typeof contentBase64 !== 'string') {
      return { success: false, error: 'Missing file content' };
    }

    // Strip any data URL prefix, then estimate decoded size from base64 length
    // (4 base64 chars → 3 bytes; account for '=' padding). Reject early if too big.
    const b64 = contentBase64.replace(/^data:[^;]*;base64,/, '');
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    const approxBytes = Math.floor((b64.length * 3) / 4) - padding;
    if (approxBytes > UPLOAD_MAX_BYTES) {
      const maxMb = Math.floor(UPLOAD_MAX_BYTES / (1024 * 1024));
      return {
        success: false,
        error: `הקובץ גדול מדי — מקסימום ${maxMb}MB / File too large, max ${maxMb}MB`
      };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`uploadServerFile: id=${serverId} dir=${dir || ''} name=${filename} ~${approxBytes}B`);

    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/upload-file', {
        serverId, dir: dir || '', filename, contentBase64: b64
      });
    } catch (error) {
      console.error('uploadServerFile error:', error);
      return { success: false, error: error?.message || String(error) };
    }
  }
);

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
// restartServer (OWNER-OR-ADMIN) — dedicated restart (stop+start via single
// script). State mutation: caller must be admin OR strictly own this server
// (Firestore ownerUid === uid; legacy/unowned does NOT count). Used both from the
// server panel and as a חמ"ל fix action, so non-admin owners must be allowed.
// ---------------------------------------------------------------------------
exports.restartServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    await assertOwnerOrAdmin(request, serverId);
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
const VALID_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'youer', 'fabric', 'forge', 'neoforge', 'vanilla'];

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
      // Youer (maintained NeoForge hybrid, Mohist successor) supports exactly 1.21.1.
      youer: async () => ['1.21.1'],
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
// restoreServer — RESTORE a soft-deleted server from its 30-day archive (D2).
// Calls Manager API POST /restore-server (which re-creates the dir, extracts the
// tarball, re-downloads the jar, re-applies forwarding config, allocates a FREE
// port+rcon and re-registers in servers.json + velocity), then RE-CREATES the
// Firestore server doc and RE-INSTALLS the catalog addons the SAME way createServer
// does (mods via installMod-by-id, datapacks via install-datapack-by-id,
// resourcepacks via install-resourcepack). Plugins (p*) are already restored from the
// archive's plugins/ dir, so they are NOT re-downloaded.
//
// Auth: admins may restore any archive. A non-admin cannot prove ownership of a
// DELETED server (its Firestore doc is gone and the manifest does not yet carry
// ownerUid — D3), so non-admins are rejected fail-CLOSED here rather than silently.
// Accepts { serverId } (newest archive for the id) or { backupId } (an explicit
// archive basename, e.g. "<id>-<epoch>.tar.gz").
// ---------------------------------------------------------------------------
exports.restoreServer = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 300 },
  async (request) => {
    requireAuth(request);
    if (!isAdminRequest(request)) {
      // A deleted server has no Firestore doc + the manifest lacks ownerUid, so
      // ownership cannot be verified. Fail closed (never a silent no-op). D3 adds
      // ownerUid to the manifest to let owners self-restore.
      throw new HttpsError('permission-denied', 'Only an admin can restore a deleted server for now');
    }

    const data = request.data || {};
    // Derive serverId from an explicit backupId (basename "<serverId>-<epoch>.tar.gz")
    // when serverId is not supplied directly.
    let serverId = (typeof data.serverId === 'string' && data.serverId.trim()) ? data.serverId.trim() : '';
    let archiveFile = (typeof data.backupId === 'string' && data.backupId.trim()) ? data.backupId.trim() : '';
    if (!serverId && archiveFile) {
      const mm = archiveFile.match(/^([a-z0-9_-]+)-\d+\.tar\.gz$/);
      if (mm) serverId = mm[1];
    }
    if (!serverId || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId/backupId' };
    }
    if (archiveFile && (archiveFile.includes('/') || archiveFile.includes('..') ||
        archiveFile.indexOf(serverId + '-') !== 0 || !/\.tar\.gz$/.test(archiveFile))) {
      return { success: false, error: 'Invalid backupId' };
    }

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();

    console.log(`restoreServer: id=${serverId} archive=${archiveFile || '(newest)'}`);

    // 1. Restore on the VPS (dir + jar + port + velocity + servers.json).
    let result;
    try {
      result = await callManagerApi(BASE_URL, API_KEY, 'POST', '/restore-server',
        archiveFile ? { serverId, archiveFile } : { serverId });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
    if (!result || !result.success) {
      return { success: false, error: (result && result.error) || 'Restore failed' };
    }

    const type = result.type || 'paper';
    const version = result.version || '1.21.1';
    const slug = result.slug || serverId;
    const name = result.name || slug;
    const installedAddons = Array.isArray(result.installedAddons)
      ? result.installedAddons.filter((x) => typeof x === 'string')
      : [];
    // The restored server is OWNED by the restoring admin unless a target owner was
    // explicitly supplied (mirrors createServer's optional ownerUid).
    const ownerUid = (typeof data.ownerUid === 'string' && data.ownerUid.trim())
      ? data.ownerUid.trim()
      : (request.auth && request.auth.uid) || null;

    // 2. Re-create the Firestore server doc (mirrors the App.jsx create path shape).
    try {
      await db.collection('omricraft/main/servers').doc(serverId).set({
        id: serverId,
        name,
        displayName: name,
        slug,
        type,
        version,
        gamePort: result.gamePort || null,
        rconPort: result.rconPort || null,
        address: result.address || `${slug}.omricraft.com`,
        publicHost: result.publicHost || `${slug}.omricraft.com`,
        installedAddons,
        ownerUid,
        status: 'stopped',
        restoredAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      // The VPS restore already succeeded — report the doc-write failure loudly but
      // do NOT claim success (the recycle-bin UI can retry / an admin can inspect).
      console.error('restoreServer: Firestore doc write failed for', serverId, e);
      return { success: false, error: 'Server restored on VPS but Firestore doc write failed: ' + (e?.message || String(e)) };
    }

    // 3. Re-install catalog addons the SAME way the create flow does. Route by id
    // prefix: m* = mods, d* = datapacks, t* = resourcepacks. p* plugins are already
    // restored from the archive's plugins/ dir → skip. Client-only ids (Sodium/etc.)
    // are absent from the server-side allowlists and are rejected by the install
    // endpoints; we catch per-addon and continue (skip-loud), never failing the whole
    // restore over one addon — the server is already up.
    const addonResults = [];
    for (const addonId of installedAddons) {
      try {
        let endpoint = null;
        let payload = null;
        if (/^m\d/.test(addonId)) {            // mod
          endpoint = '/install-mod';
          payload = { serverId, modId: addonId };
        } else if (/^d\d/.test(addonId)) {     // datapack
          endpoint = '/install-datapack-by-id';
          payload = { serverId, addonId };
        } else if (/^t\d/.test(addonId)) {     // resource pack (texture)
          endpoint = '/install-resourcepack';
          payload = { serverId, addonId };
        } else {
          // p* plugins come back from the archive; c_* custom/manual addons and any
          // client-only ids have no server install path → skip.
          continue;
        }
        const r = await callManagerApi(BASE_URL, API_KEY, 'POST', endpoint, payload);
        addonResults.push({ addonId, success: !!(r && r.success), error: (r && !r.success) ? r.error : undefined });
      } catch (e) {
        console.error('restoreServer: addon re-install failed for', addonId, e.message);
        addonResults.push({ addonId, success: false, error: e.message });
      }
    }

    return {
      success: true,
      id: serverId,
      serverId,
      slug,
      name,
      type,
      version,
      gamePort: result.gamePort || null,
      rconPort: result.rconPort || null,
      address: result.address || `${slug}.omricraft.com`,
      publicHost: result.publicHost || `${slug}.omricraft.com`,
      installedAddons,
      ownerUid,
      status: 'stopped',
      addonResults
    };
  }
);

// ---------------------------------------------------------------------------
// listServerBackups — recycle bin: lists SOFT-DELETE archives (deleted servers)
// from the VPS (Manager API GET /list-backups → backups/*.manifest.json). Distinct
// from listBackups (per-server manual world backups). Auth: any signed-in caller;
// admins see ALL archives, non-admins see only archives whose serverId is in the
// set of servers they may access (Firestore ownership via accessibleServerIds).
// Manifests do not yet carry ownerUid — D3 will wire richer ownership; for now the
// Firestore doc may already be gone (server was deleted), so a non-admin's set can
// be empty. That is correct/safe: they simply see nothing to restore.
// ---------------------------------------------------------------------------
exports.listServerBackups = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const result = await callManagerApi(BASE_URL, API_KEY, 'GET', '/list-backups', null);
      if (!result || !result.success) {
        return { success: false, error: (result && result.error) || 'list-backups failed' };
      }
      const all = Array.isArray(result.backups) ? result.backups : [];
      // Admin (accessibleServerIds → null) sees everything; others are filtered to
      // the serverIds they may access.
      const allowed = await accessibleServerIds(request);
      const backups = (allowed === null)
        ? all
        : all.filter((m) => m && allowed.has(m.serverId));
      return { success: true, backups };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// War Room / חמ"ל — getDiagnostics: runs the health scan on the VPS (Manager API
// GET /diagnostics, which returns ALL servers' issues) and returns the list of
// detected issues SCOPED to the caller. Read-only: no server state is changed.
//
// Security model (the whole point of this function):
//   - Requires an authenticated caller (rejects if no auth).
//   - scope param: 'mine' | 'all'. Admins (verified email in ADMIN_EMAILS) with
//     scope==='all' get EVERY server's issues; otherwise the result is filtered
//     to issues whose serverId is in the caller's accessible set, matching the
//     app's visibleServers rule (own server OR a legacy server with no ownerUid).
//   - Non-admins are ALWAYS forced to the scoped set regardless of `scope`.
//   The Manager API returns all servers; THIS function filters by accessibility.
// ---------------------------------------------------------------------------
// The set of serverIds that have a LIVE Firestore doc (the authoritative "active"
// server set the frontend reads). A server the panel deleted has NO doc here even
// if a stale servers.json entry or leftover directory lingers on the VPS — so we
// use this to drop diagnostics for servers that no longer exist (Part 1 safety-net:
// "a deleted server produces zero War-Room messages", including admin/all scope).
async function liveServerDocIds() {
  const ids = new Set();
  const snap = await db.collection('omricraft/main/servers').get();
  snap.forEach((doc) => ids.add(doc.id));
  return ids;
}

// The set of dismissed issueKeys for the given serverIds (or ALL when serverIds is
// null, used for admin/all scope). Each dismiss doc is keyed by serverId and holds
// { keys: [issueKey,...] }; an issue is hidden only while its EXACT key is present,
// so a genuinely new/different problem (different key) reappears. Reads in chunks of
// 10 (Firestore 'in' limit) to avoid N round-trips.
async function dismissedIssueKeys(serverIds) {
  const keys = new Set();
  const col = db.collection('omricraft/main/dismissedDiagnostics');
  if (serverIds === null) {
    const snap = await col.get();
    snap.forEach((doc) => {
      const arr = (doc.data() || {}).keys;
      if (Array.isArray(arr)) arr.forEach((k) => keys.add(k));
    });
    return keys;
  }
  const idList = Array.from(serverIds);
  for (let i = 0; i < idList.length; i += 10) {
    const chunk = idList.slice(i, i + 10);
    if (chunk.length === 0) continue;
    const snap = await col.where('__name__', 'in', chunk).get();
    snap.forEach((doc) => {
      const arr = (doc.data() || {}).keys;
      if (Array.isArray(arr)) arr.forEach((k) => keys.add(k));
    });
  }
  return keys;
}

exports.getDiagnostics = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    requireAuth(request);
    const { scope } = request.data || {};
    const admin = isAdminRequest(request);
    // Admin + scope:'all' => unrestricted. Everyone else => scoped to own servers.
    const wantAll = admin && scope === 'all';

    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      const res = await callManagerApi(BASE_URL, API_KEY, 'GET', '/diagnostics', null);
      if (!res || !res.success) return res;
      let allIssues = Array.isArray(res.issues) ? res.issues : [];

      // Part 1 safety-net: drop issues for servers with NO live Firestore doc. A
      // panel-deleted server may leave a stale servers.json row / leftover dir that
      // the VPS scan still flags; the panel reads servers only from Firestore, so a
      // missing doc == the server no longer exists == it must not appear in the חמ"ל.
      // Applies to EVERY scope, admins included.
      const liveIds = await liveServerDocIds();
      allIssues = allIssues.filter((iss) => iss && liveIds.has(iss.serverId));

      if (wantAll) {
        // Part 2: hide issues an admin has explicitly dismissed (by exact issueKey).
        const dismissed = await dismissedIssueKeys(null);
        const visible = allIssues.filter((iss) => !(iss.issueKey && dismissed.has(iss.issueKey)));
        return { ...res, issues: visible, scope: 'all' };
      }

      // Filter to the caller's accessible serverIds (own + legacy-unowned).
      const ids = await accessibleServerIds(request); // null = admin/all (won't happen here)
      const scoped = (ids === null)
        ? allIssues
        : allIssues.filter((iss) => iss && ids.has(iss.serverId));
      // Part 2: hide dismissed issues (by exact issueKey) for the in-scope servers.
      const scopeIds = ids === null ? null : ids;
      const dismissed = await dismissedIssueKeys(scopeIds);
      const visible = scoped.filter((iss) => !(iss.issueKey && dismissed.has(iss.issueKey)));
      return { ...res, issues: visible, scope: 'mine' };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// dismissDiagnostic (OWNER-OR-ADMIN) — manually HIDE one War-Room issue. Persists
// the issue's exact issueKey (content hash of serverId+category+signal) under
// omricraft/main/dismissedDiagnostics/{serverId}.keys[]. getDiagnostics filters out
// any issue whose issueKey is dismissed, so the message stays hidden across re-scans
// — but ONLY that exact problem: a genuinely new/different issue produces a different
// issueKey and reappears (we never suppress future problems). Cleared for a server on
// delete (cleanupDismissedDiagnostics) so restored/recreated ids start clean.
// ---------------------------------------------------------------------------
exports.dismissDiagnostic = onCall(
  { region: "us-central1", timeoutSeconds: 20 },
  async (request) => {
    const { serverId, issueKey } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!issueKey || typeof issueKey !== 'string' || !/^[a-f0-9]{8,40}$/.test(issueKey)) {
      return { success: false, error: 'Invalid issueKey' };
    }
    // Owner-or-admin: a non-admin may dismiss issues only on a server they own
    // (matches resetServerStatus/removeDatapack). Admin may dismiss on any server.
    await assertOwnerOrAdmin(request, serverId);
    try {
      const ref = db.collection('omricraft/main/dismissedDiagnostics').doc(serverId);
      await ref.set({
        keys: admin.firestore.FieldValue.arrayUnion(issueKey),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { success: true, serverId, issueKey };
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// Delete the dismissedDiagnostics doc for a server (best-effort). Called when a
// server is deleted so a later recreation/restore under the same id starts with a
// clean slate (no stale dismissals leaking onto a different server's real issues).
async function cleanupDismissedDiagnostics(serverId) {
  try {
    await db.collection('omricraft/main/dismissedDiagnostics').doc(serverId).delete();
  } catch (e) {
    console.error('cleanupDismissedDiagnostics failed for ' + serverId + ':', e.message);
  }
}

// ---------------------------------------------------------------------------
// resetServerStatus (OWNER-OR-ADMIN) — sets a stuck server's status to 'stopped'
// in servers.json via Manager API /reset-status. State mutation: the caller must
// be admin OR strictly own this server (Firestore ownerUid === uid; legacy/unowned
// does NOT count). The Manager API also refuses to reset a server that is actually
// running, so this is safe.
// ---------------------------------------------------------------------------
exports.resetServerStatus = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 20 },
  async (request) => {
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    await assertOwnerOrAdmin(request, serverId);
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
// removeDatapack (OWNER-OR-ADMIN) — deletes a single datapack zip from a server's
// world/datapacks/ via Manager API /remove-datapack (DESTRUCTIVE). State mutation:
// the caller must be admin OR strictly own this server (Firestore ownerUid === uid;
// legacy/unowned does NOT count). The Manager API enforces strict path-safety: file
// must be a plain basename strictly inside that server's datapacks dir. We
// re-validate the basename here too (defence in depth). On a running server the
// backend attempts a live RCON reload.
// ---------------------------------------------------------------------------
exports.removeDatapack = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    const { serverId, file } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    if (!file || typeof file !== 'string' || file.includes('/') || file.includes('\\') || file.includes('..')) {
      return { success: false, error: 'Invalid file' };
    }
    await assertOwnerOrAdmin(request, serverId);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/remove-datapack', { serverId, file });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// purgeServerBackup (OWNER-OR-ADMIN) — recycle-bin "🔥 מחק לצמיתות": PERMANENTLY
// delete ONE soft-delete archive (its <stem>.tar.gz + <stem>.manifest.json) via
// Manager API POST /delete-backup (DESTRUCTIVE, irreversible). The archive basename
// is "<serverId>-<epoch>.tar.gz"; we derive serverId by stripping the trailing
// "-<epoch>.tar.gz" and authorize with assertOwnerOrAdmin against THAT id, so a
// non-admin can only purge archives of a server they strictly own (its Firestore
// doc may still exist for delete_failed servers; a fully-gone doc → only an admin
// passes, matching restoreServer's fail-closed stance). The Manager API also
// enforces strict path-safety (basename-only, realpath inside the backups dir).
// ---------------------------------------------------------------------------
exports.purgeServerBackup = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 30 },
  async (request) => {
    requireAuth(request);
    const { archiveFile } = request.data || {};
    if (!archiveFile || typeof archiveFile !== 'string' ||
        archiveFile.includes('/') || archiveFile.includes('\\') ||
        archiveFile.includes('..') || !/\.tar\.gz$/.test(archiveFile)) {
      return { success: false, error: 'Invalid archiveFile' };
    }
    // Derive serverId from "<serverId>-<epoch>.tar.gz" (serverId may itself contain
    // '-', so strip only the trailing "-<digits>.tar.gz").
    const mm = archiveFile.match(/^([a-z0-9_-]+)-\d+\.tar\.gz$/);
    if (!mm) {
      return { success: false, error: 'Invalid archiveFile format' };
    }
    const serverId = mm[1];
    // Ownership check against the derived serverId. A non-admin whose owned server's
    // Firestore doc is already gone will be rejected here (fail-closed) — only admins
    // can purge archives of fully-deleted servers.
    await assertOwnerOrAdmin(request, serverId);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/delete-backup', { archiveFile });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// archiveIncompatibleFiles (OWNER-OR-ADMIN) — REVERSIBLE Phase 6b fix for the
// 'cross-family-files' diagnostic. After a server's TYPE is switched, .jar files
// from the old core can linger in the dir the new core ignores (plugins/*.jar on a
// mod core, mods/*.jar on a plugin core). This MOVES them (not deletes) into a
// sibling disabled-plugins/ or disabled-mods/ dir via Manager API
// /archive-incompatible. State mutation: the caller must be admin OR strictly own
// this server (Firestore ownerUid === uid; legacy/unowned does NOT count). The
// Manager API enforces strict path-safety + decides the dir from the server's core,
// so no file path is taken from the client.
// ---------------------------------------------------------------------------
exports.archiveIncompatibleFiles = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 60 },
  async (request) => {
    const { serverId } = request.data || {};
    if (!serverId || typeof serverId !== 'string' || !/^[a-z0-9_-]+$/.test(serverId)) {
      return { success: false, error: 'Invalid serverId' };
    }
    await assertOwnerOrAdmin(request, serverId);
    const BASE_URL = managerApiUrl.value().trim();
    const API_KEY  = managerApiKey.value().trim();
    try {
      return await callManagerApi(BASE_URL, API_KEY, 'POST', '/archive-incompatible', { serverId });
    } catch (error) {
      return { success: false, error: error?.message || String(error) };
    }
  }
);

// ---------------------------------------------------------------------------
// getPublicStats — PUBLIC (no assertAdmin) aggregate-only stats for the public
// landing page. Returns ONLY two numbers that are safe to expose to anyone:
//   serverCount  = how many servers exist
//   playersOnline = total players currently connected across all servers
// NO per-server names, IPs, ports or details ever leave this function. The
// manager-api key stays server-side (used via callManagerApi). On any failure
// we return zeros and never throw to the public caller (graceful degrade).
// ---------------------------------------------------------------------------
exports.getPublicStats = onCall(
  { region: "us-central1", secrets: [managerApiUrl, managerApiKey], timeoutSeconds: 15 },
  async () => {
    try {
      const BASE_URL = managerApiUrl.value().trim();
      const API_KEY  = managerApiKey.value().trim();
      // /players returns { success, servers: { id: { online, count } } } — same
      // shape getPlayersOnline consumes. We collapse it to aggregates only.
      const result = await callManagerApi(BASE_URL, API_KEY, 'GET', '/players', null);
      const servers = (result && result.success && result.servers) ? result.servers : {};
      const entries = Object.values(servers);
      const serverCount = entries.length;
      const playersOnline = entries.reduce(
        (sum, info) => sum + (info && Number.isFinite(info.count) ? info.count : 0), 0
      );
      return { success: true, serverCount, playersOnline };
    } catch (error) {
      // Never throw to the public caller — degrade to zeros.
      console.error('getPublicStats failed:', error);
      return { success: false, serverCount: 0, playersOnline: 0 };
    }
  }
);

// ---------------------------------------------------------------------------
// suggestModpack — ADMIN-only AI/heuristic Modpack Builder.
// Given a free-text theme, returns ~8-12 REAL Modrinth mods the admin can turn
// into a custom modpack. Two models:
//   'free' (default, NO key): theme → Modrinth category + query → real search.
//   'gemini' (optional key) : Gemini names ~10 mods → each VERIFIED on Modrinth.
// The Gemini path NEVER hard-fails: if the GEMINI_API_KEY secret is empty/unset,
// or any Gemini call errors, it falls back to the 'free' path and flags
// usedFallback:true so the UI can show an honest note.
// ---------------------------------------------------------------------------

// Map common theme keywords (he + en) to a Modrinth category facet. First match
// wins; null means "no category facet" (query-only search).
const THEME_CATEGORY_MAP = [
  { cat: 'technology',   words: ['tech', 'technology', 'machine', 'automation', 'industrial', 'factory', 'טכנולוגיה', 'מכונה', 'מכונות', 'תעשייה', 'אוטומציה'] },
  { cat: 'magic',        words: ['magic', 'wizard', 'spell', 'arcane', 'witch', 'קסם', 'מאגיה', 'כישוף', 'מכשפה'] },
  { cat: 'adventure',    words: ['adventure', 'rpg', 'quest', 'dungeon', 'explore', 'הרפתקה', 'הרפתקאות', 'מבוך', 'מבוכים', 'קווסט'] },
  { cat: 'optimization', words: ['performance', 'optimization', 'optimize', 'fps', 'lag', 'fast', 'ביצועים', 'אופטימיזציה', 'מהירות'] },
  { cat: 'food',         words: ['food', 'farming', 'cooking', 'crops', 'kitchen', 'אוכל', 'חקלאות', 'בישול', 'מטבח'] },
  { cat: 'decoration',   words: ['decoration', 'decor', 'furniture', 'build', 'building', 'cosmetic', 'עיצוב', 'ריהוט', 'בנייה', 'קישוט'] },
  { cat: 'mobs',         words: ['mob', 'mobs', 'creature', 'animal', 'monster', 'pet', 'יצורים', 'חיות', 'מפלצות', 'חיה'] },
  { cat: 'worldgen',     words: ['world', 'worldgen', 'biome', 'biomes', 'terrain', 'generation', 'עולם', 'ביום', 'ביומות', 'נוף'] },
  { cat: 'utility',      words: ['utility', 'tool', 'tools', 'quality of life', 'qol', 'helper', 'כלי', 'כלים', 'עזר', 'שירות'] },
];

// Pick the category facet for a theme (or null). Lowercase, keyword scan.
function categoryForTheme(theme) {
  const t = String(theme || '').toLowerCase();
  for (const { cat, words } of THEME_CATEGORY_MAP) {
    if (words.some(w => t.includes(w))) return cat;
  }
  return null;
}

// Non-throwing JSON GET (resolves null on any failure). Reused by both paths.
function getJsonSafe(url, headers) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OmriCraft-Panel/1.0', ...(headers || {}) } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
  });
}

// Trim a Modrinth description to a short, single-line blurb.
function shortDesc(s) {
  const txt = String(s || '').replace(/\s+/g, ' ').trim();
  return txt.length > 140 ? txt.slice(0, 137) + '…' : txt;
}

// Map a Modrinth search hit → our compact mod shape.
function mapModrinthHit(h) {
  const slug = h.slug || h.project_id;
  return {
    slug,
    title: h.title || slug,
    description: shortDesc(h.description),
    downloads: typeof h.downloads === 'number' ? h.downloads : 0,
    url: `https://modrinth.com/mod/${slug}`,
  };
}

// FREE path: build a Modrinth search from the theme (category facet + query) and
// return up to `limit` real mods. mcVersion is sanity-checked so we never inject
// a bad facet. Returns [] on any failure (caller decides what to do).
async function modrinthSearch(theme, mcVersion, limit) {
  const cat = categoryForTheme(theme);
  const facets = [['project_type:mod']];
  if (mcVersion && /^[0-9][0-9.]{1,12}$/.test(mcVersion)) facets.push([`versions:${mcVersion}`]);
  if (cat) facets.push([`categories:${cat}`]);
  const url = 'https://api.modrinth.com/v2/search'
    + `?query=${encodeURIComponent(String(theme || '').trim())}`
    + `&facets=${encodeURIComponent(JSON.stringify(facets))}`
    + '&index=downloads'
    + `&limit=${Math.max(1, Math.min(20, Number(limit) || 12))}`;
  const j = await getJsonSafe(url);
  const hits = Array.isArray(j?.hits) ? j.hits : [];
  return hits.map(mapModrinthHit);
}

// Verify ONE mod name on Modrinth (by query) → first hit or null. Used to keep
// only Gemini suggestions that resolve to a real project.
async function verifyModOnModrinth(name, mcVersion) {
  const facets = [['project_type:mod']];
  if (mcVersion && /^[0-9][0-9.]{1,12}$/.test(mcVersion)) facets.push([`versions:${mcVersion}`]);
  const url = 'https://api.modrinth.com/v2/search'
    + `?query=${encodeURIComponent(String(name || '').trim())}`
    + `&facets=${encodeURIComponent(JSON.stringify(facets))}`
    + '&index=relevance&limit=1';
  const j = await getJsonSafe(url);
  const hit = Array.isArray(j?.hits) && j.hits.length ? j.hits[0] : null;
  return hit ? mapModrinthHit(hit) : null;
}

// Ask Gemini for ~10 mod NAMES that fit the theme. Returns string[] (may be []).
// POSTs to the Generative Language API. Throws on transport/HTTP error so the
// caller's try/catch can fall back to free.
function geminiSuggestNames(apiKey, theme, mcVersion) {
  return new Promise((resolve, reject) => {
    const prompt = `List exactly 10 real Minecraft Java Edition mods (as published on Modrinth) `
      + `that fit this theme: "${String(theme || '').trim()}". Target Minecraft version ${mcVersion}. `
      + `Reply with ONLY the mod names, one per line, no numbering, no extra text.`;
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 20000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Gemini HTTP ${res.statusCode}`));
        }
        try {
          const j = JSON.parse(data);
          const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n') || '';
          const names = text.split('\n')
            .map(l => l.replace(/^[\s\d.)*-]+/, '').trim())
            .filter(Boolean)
            .slice(0, 12);
          resolve(names);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini request timed out')); });
    req.write(payload);
    req.end();
  });
}

exports.suggestModpack = onCall(
  { region: "us-central1", timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const { theme, model, mcVersion } = request.data || {};
    const cleanTheme = String(theme || '').trim();
    const ver = String(mcVersion || '1.21.11').trim();
    if (!cleanTheme) {
      throw new HttpsError('invalid-argument', 'theme is required');
    }

    // FREE path (also the universal fallback).
    const runFree = async () => {
      const mods = await modrinthSearch(cleanTheme, ver, 12);
      return { success: true, model: 'free', theme: cleanTheme, mcVersion: ver, mods };
    };

    if (String(model || 'free').toLowerCase() !== 'gemini') {
      return await runFree();
    }

    // GEMINI path — graceful: empty key → free fallback (no throw); any error → free.
    const key = readGeminiKey();
    if (!key) {
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'no-gemini-key' };
    }

    try {
      const names = await geminiSuggestNames(key, cleanTheme, ver);
      if (!names.length) {
        const fb = await runFree();
        return { ...fb, usedFallback: true, reason: 'gemini-empty' };
      }
      // Verify each name on Modrinth; keep only real, de-duplicated projects.
      const seen = new Set();
      const verified = [];
      for (const name of names) {
        const mod = await verifyModOnModrinth(name, ver);
        if (mod && !seen.has(mod.slug)) { seen.add(mod.slug); verified.push(mod); }
      }
      if (!verified.length) {
        const fb = await runFree();
        return { ...fb, usedFallback: true, reason: 'gemini-unverified' };
      }
      return { success: true, model: 'gemini', theme: cleanTheme, mcVersion: ver, mods: verified };
    } catch (error) {
      console.error('suggestModpack gemini path failed, falling back to free:', error);
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'gemini-error' };
    }
  }
);

// ---------------------------------------------------------------------------
// suggestDatapacks — ADMIN-only. Free, keyless Modrinth search for REAL datapacks
// matching a theme (mirrors suggestModpack but project_type:datapack). Returns up
// to 12 datapacks { slug, title, description, downloads, url }. The category facet
// reuse from suggestModpack does NOT apply (datapack categories differ), so this is
// a query-only search by theme + version facet. Never throws except on empty theme.
// ---------------------------------------------------------------------------
async function modrinthDatapackSearch(theme, mcVersion, limit) {
  const facets = [['project_type:datapack']];
  if (mcVersion && /^[0-9][0-9.]{1,12}$/.test(mcVersion)) facets.push([`versions:${mcVersion}`]);
  const url = 'https://api.modrinth.com/v2/search'
    + `?query=${encodeURIComponent(String(theme || '').trim())}`
    + `&facets=${encodeURIComponent(JSON.stringify(facets))}`
    + '&index=downloads'
    + `&limit=${Math.max(1, Math.min(12, Number(limit) || 12))}`;
  const j = await getJsonSafe(url);
  const hits = Array.isArray(j?.hits) ? j.hits : [];
  return hits.map(h => {
    const slug = h.slug || h.project_id;
    return {
      slug,
      title: h.title || slug,
      description: shortDesc(h.description),
      downloads: typeof h.downloads === 'number' ? h.downloads : 0,
      // datapacks live under /datapack/<slug> on Modrinth (not /mod/).
      url: `https://modrinth.com/datapack/${slug}`,
    };
  });
}

exports.suggestDatapacks = onCall(
  { region: "us-central1", timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const { theme, mcVersion } = request.data || {};
    const cleanTheme = String(theme || '').trim();
    const ver = String(mcVersion || '1.21.11').trim();
    if (!cleanTheme) {
      throw new HttpsError('invalid-argument', 'theme is required');
    }
    const datapacks = await modrinthDatapackSearch(cleanTheme, ver, 12);
    return { success: true, theme: cleanTheme, mcVersion: ver, datapacks };
  }
);

// ---------------------------------------------------------------------------
// generateDatapack — ADMIN-only. AI-generates a NEW, simple datapack from a prompt.
//   model 'free' (default): Pollinations TEXT (keyless free LLM).
//   model 'gemini'        : Gemini (gemini-2.5-flash) if key set, else free + flag.
// The LLM is asked for ONLY a JSON object { namespace, description, files[] }; we
// parse it defensively (tolerate code fences / leading prose). We then INJECT our
// OWN pack.mcmeta with the CORRECT datapack pack_format for mcVersion (the free
// model returns a wrong format like "12"; the real datapack format for 1.21.11 is
// 94, NOT the resource-pack 75) — any pack.mcmeta the LLM produced is dropped.
// Returns { success, namespace, description, files:[{path,content}], usedFallback?,
// reason? }. Download-only; the client zips it. Never throws except on empty prompt.
// ---------------------------------------------------------------------------

// Authoritative DATAPACK pack_format per MC version (source: misode/mcmeta
// summary/versions data_pack_version). DISTINCT from resource-pack formats.
// 1.21.11 => 94 (resource-pack would be 75 — the format the task warned about).
const DATAPACK_FORMATS = {
  '1.21.11': 94, '1.21.10': 88, '1.21.9': 88, '1.21.8': 81, '1.21.7': 81,
  '1.21.6': 80, '1.21.5': 71, '1.21.4': 61, '1.21.3': 57, '1.21.2': 57,
  '1.21.1': 48, '1.21': 48,
};
// Default to the panel's target version's datapack format when unknown.
const DEFAULT_DATAPACK_FORMAT = 94;

function datapackFormatFor(mcVersion) {
  return DATAPACK_FORMATS[String(mcVersion || '').trim()] || DEFAULT_DATAPACK_FORMAT;
}

// Build the strict instruction handed to either LLM.
function datapackInstruction(prompt, mcVersion) {
  return `You are a Minecraft Java Edition datapack generator. Output ONLY a single JSON object `
    + `(no markdown, no code fences, no prose) with EXACTLY this shape:\n`
    + `{ "namespace": "lowercase_id", "description": "one short line", `
    + `"files": [ { "path": "data/<namespace>/...", "content": "<full file text>" } ] }\n`
    + `Build a SIMPLE, VALID datapack for Minecraft ${mcVersion} matching: "${String(prompt || '').trim()}".\n`
    + `Favor robust, well-understood types: function files (data/<ns>/function/*.mcfunction), `
    + `recipes (data/<ns>/recipe/*.json), loot tables (data/<ns>/loot_table/*.json), and the load/tick `
    + `function tags (data/minecraft/tags/function/load.json and tick.json) when using functions. `
    + `Use the modern 1.21+ singular folder names (function, recipe, loot_table, tags/function). `
    + `Do NOT include a pack.mcmeta — it is added automatically. Keep it to a handful of files. `
    + `Every "content" must be a valid string (JSON files as compact JSON text).`;
}

// Defensive JSON extraction from an LLM reply: strip code fences, then take the
// first {...} balanced-ish span. Returns the parsed object or null.
function parseLlmJson(text) {
  let s = String(text || '').trim();
  // Strip ```json ... ``` or ``` ... ``` fences.
  s = s.replace(/^```[a-zA-Z]*\s*/m, '').replace(/```\s*$/m, '').trim();
  // Slice from the first { to the last } to drop any leading/trailing prose.
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b <= a) return null;
  const candidate = s.slice(a, b + 1);
  try { return JSON.parse(candidate); } catch { /* fall through */ }
  return null;
}

// Normalize the parsed object → a safe { namespace, description, files[] }.
// Drops any LLM-provided pack.mcmeta (we inject our own). Throws on no usable files.
function normalizeDatapack(obj, fallbackPrompt) {
  const o = obj && typeof obj === 'object' ? obj : {};
  let ns = String(o.namespace || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  if (!ns) ns = 'custom_' + slugify(fallbackPrompt).replace(/-/g, '_').slice(0, 16) || 'custom_pack';
  if (!ns) ns = 'custom_pack';
  const description = String(o.description || `AI datapack: ${String(fallbackPrompt || '').trim()}`).slice(0, 160);
  const rawFiles = Array.isArray(o.files) ? o.files : [];
  const files = [];
  for (const f of rawFiles) {
    if (!f || typeof f !== 'object') continue;
    let p = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
    // Drop any LLM pack.mcmeta — we inject our own with the correct format.
    if (!p || p.toLowerCase() === 'pack.mcmeta') continue;
    // Path-safety: no traversal, must live under data/ or the root namespace dir.
    if (p.includes('..')) continue;
    const content = typeof f.content === 'string'
      ? f.content
      : (f.content != null ? JSON.stringify(f.content) : '');
    if (!content) continue;
    files.push({ path: p, content });
    if (files.length >= 40) break;
  }
  return { namespace: ns, description, files };
}

// Ask Pollinations TEXT (free, keyless) for the datapack JSON. Returns the raw
// text, or null on failure. GET https://text.pollinations.ai/<urlencoded prompt>.
async function pollinationsDatapackText(prompt, mcVersion) {
  const url = 'https://text.pollinations.ai/'
    + encodeURIComponent(datapackInstruction(prompt, mcVersion));
  const r = await getBinarySafe(url);
  if (!r || !r.buffer.length) return null;
  return r.buffer.toString('utf8');
}

// Ask Gemini (gemini-2.5-flash) for the datapack JSON. Returns raw text. Throws on
// transport/HTTP/parse error so the caller's try/catch can fall back to free.
function geminiDatapackText(apiKey, prompt, mcVersion) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: datapackInstruction(prompt, mcVersion) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: 'application/json' },
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 40000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Gemini HTTP ${res.statusCode}`));
        }
        try {
          const j = JSON.parse(data);
          const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
          if (!text) return reject(new Error('Gemini returned no text'));
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini request timed out')); });
    req.write(payload);
    req.end();
  });
}

exports.generateDatapack = onCall(
  { region: "us-central1", timeoutSeconds: 90 },
  async (request) => {
    assertAdmin(request);
    const { prompt, model, mcVersion } = request.data || {};
    const cleanPrompt = String(prompt || '').trim();
    const ver = String(mcVersion || '1.21.11').trim();
    if (!cleanPrompt) {
      throw new HttpsError('invalid-argument', 'prompt is required');
    }
    const packFormat = datapackFormatFor(ver);

    // Build the final result from raw LLM text. We ALWAYS inject our own pack.mcmeta
    // with the correct datapack pack_format (never trust the model's value).
    const buildFromText = (text) => {
      const parsed = parseLlmJson(text);
      if (!parsed) return null;
      const { namespace, description, files } = normalizeDatapack(parsed, cleanPrompt);
      if (!files.length) return null;
      // Inject the authoritative pack.mcmeta FIRST so the client zips it verbatim.
      const mcmeta = {
        path: 'pack.mcmeta',
        content: JSON.stringify({
          pack: {
            pack_format: packFormat,
            supported_formats: { min_inclusive: packFormat, max_inclusive: packFormat },
            description: description || `OmriCraft AI datapack (${ver})`,
          },
        }, null, 2),
      };
      return { namespace, description, files: [mcmeta, ...files], packFormat, mcVersion: ver };
    };

    // FREE path (also the universal fallback).
    const runFree = async () => {
      const text = await pollinationsDatapackText(cleanPrompt, ver);
      const built = text ? buildFromText(text) : null;
      if (!built) {
        throw new HttpsError('unavailable', 'AI datapack service unavailable or returned invalid output, try again');
      }
      return { success: true, model: 'free', ...built };
    };

    if (String(model || 'free').toLowerCase() !== 'gemini') {
      return await runFree();
    }

    // GEMINI path — graceful: empty key → free fallback; any error/invalid → free.
    const key = readGeminiKey();
    if (!key) {
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'no-gemini-key' };
    }
    try {
      const text = await geminiDatapackText(key, cleanPrompt, ver);
      const built = buildFromText(text);
      if (!built) {
        const fb = await runFree();
        return { ...fb, usedFallback: true, reason: 'gemini-invalid' };
      }
      return { success: true, model: 'gemini', ...built };
    } catch (error) {
      console.error('generateDatapack gemini path failed, falling back to free:', error);
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'gemini-error' };
    }
  }
);

// ---------------------------------------------------------------------------
// generateTexture — ADMIN-only AI texture generator (MVP).
// Given a free-text prompt, returns a generated 256×256 image as a base64 data
// URL the admin downscales client-side to a 16×16 Minecraft texture. Two models:
//   'free' (default, NO key): server-side fetch from Pollinations (keyless).
//   'gemini' (optional key) : Imagen via the Generative Language API; on missing
//                             key OR any error → falls back to the 'free' path
//                             and flags usedFallback. Throws only on an empty
//                             prompt (invalid-argument) or when the image backend
//                             itself is unavailable (unavailable) — never for a
//                             Gemini miss, which always degrades to free.
// The prompt is always suffixed to bias toward a simple, centered pixel texture.
// ---------------------------------------------------------------------------

// Binary-safe HTTP(S) GET. Resolves { buffer, contentType } or null on any
// failure (non-2xx, transport error, timeout). Collects raw bytes (no utf-8
// decode) so image payloads survive intact.
function getBinarySafe(url) {
  return new Promise((resolve) => {
    let lib = https;
    try { lib = new URL(url).protocol === 'http:' ? http : https; } catch { /* default https */ }
    const req = lib.get(url, { headers: { 'User-Agent': 'OmriCraft-Panel/1.0' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return resolve(null);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: String(res.headers['content-type'] || 'image/jpeg'),
      }));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(30000, () => { req.destroy(); resolve(null); });
  });
}

// Compose the texture-biased prompt used by every path.
function texturePrompt(prompt) {
  return `${String(prompt || '').trim()}, minecraft texture, pixel art, simple, centered`;
}

// FREE path (also the universal fallback): fetch one image from Pollinations
// (keyless) and return it as a base64 data URL, or null on failure.
async function pollinationsTexture(prompt) {
  const url = 'https://image.pollinations.ai/prompt/'
    + encodeURIComponent(texturePrompt(prompt))
    + '?width=256&height=256&nologo=true';
  const r = await getBinarySafe(url);
  if (!r || !r.buffer.length) return null;
  const mime = r.contentType.split(';')[0].trim() || 'image/jpeg';
  return `data:${mime};base64,${r.buffer.toString('base64')}`;
}

// GEMINI path: POST the prompt to the Imagen endpoint and return the first
// generated image as a base64 data URL. Throws on transport/HTTP/parse error so
// the caller's try/catch can fall back to free.
function geminiTexture(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      instances: [{ prompt: texturePrompt(prompt) }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    });
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/imagen-3.0-generate-002:predict?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 40000,
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Imagen HTTP ${res.statusCode}`));
        }
        try {
          const j = JSON.parse(data);
          const pred = Array.isArray(j?.predictions) ? j.predictions[0] : null;
          const b64 = pred?.bytesBase64Encoded;
          const mime = pred?.mimeType || 'image/png';
          if (!b64) return reject(new Error('Imagen returned no image'));
          resolve(`data:${mime};base64,${b64}`);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Imagen request timed out')); });
    req.write(payload);
    req.end();
  });
}

exports.generateTexture = onCall(
  { region: "us-central1", timeoutSeconds: 60 },
  async (request) => {
    assertAdmin(request);
    const { prompt, model } = request.data || {};
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) {
      throw new HttpsError('invalid-argument', 'prompt is required');
    }

    // FREE path (also the universal fallback).
    const runFree = async () => {
      const image = await pollinationsTexture(cleanPrompt);
      if (!image) {
        throw new HttpsError('unavailable', 'Image service unavailable, try again');
      }
      return { success: true, image, model: 'free', prompt: cleanPrompt };
    };

    if (String(model || 'free').toLowerCase() !== 'gemini') {
      return await runFree();
    }

    // GEMINI path — graceful: empty key → free fallback (no throw); any error → free.
    const key = readGeminiKey();
    if (!key) {
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'no-gemini-key' };
    }
    try {
      const image = await geminiTexture(key, cleanPrompt);
      return { success: true, image, model: 'gemini', prompt: cleanPrompt };
    } catch (error) {
      console.error('generateTexture gemini path failed, falling back to free:', error);
      const fb = await runFree();
      return { ...fb, usedFallback: true, reason: 'gemini-error' };
    }
  }
);
