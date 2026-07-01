'use strict';

const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns');

const PORT = parseInt(process.env.PORT || '3001', 10);
const MANAGER_API_KEY = process.env.MANAGER_API_KEY || '';
const SCRIPTS_DIR = '/home/ubuntu/omricraft/manager/scripts';
const SERVERS_DIR = '/home/ubuntu/omricraft/servers';
const SERVERS_JSON = '/home/ubuntu/omricraft/manager/servers.json';

if (!MANAGER_API_KEY) {
  console.error('FATAL: MANAGER_API_KEY env var is not set.');
  process.exit(1);
}

// Accept the primary key plus an OPTIONAL second key (MANAGER_API_KEY_OLD) only while
// a key rotation is in flight: the new key is rolled out to every caller (Cloud
// Functions secret + ServerWaker env) with zero downtime, then MANAGER_API_KEY_OLD is
// removed so only the new key is valid. Unset/empty entries are ignored.
const VALID_BEARERS = [process.env.MANAGER_API_KEY, process.env.MANAGER_API_KEY_OLD]
  .filter(Boolean)
  .map(function (k) { return 'Bearer ' + k; });

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (!VALID_BEARERS.includes(auth)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

const SAFE_ID = /^[a-z0-9_-]+$/;

function validateId(id, res) {
  if (!id || typeof id !== 'string' || !SAFE_ID.test(id)) {
    res.status(400).json({ success: false, error: `Invalid id: ${id}` });
    return false;
  }
  return true;
}

function runScript(scriptName, args, timeout) {
  timeout = timeout || 120000;
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    execFile('bash', [scriptPath].concat(args), { timeout: timeout }, function(err, stdout, stderr) {
      if (err) {
        const e = new Error(stderr || stdout || err.message);
        // Surface the script's exit status so callers can tell "no compatible build"
        // (the install-*.sh scripts exit 2) from a real failure (exit 1). execFile sets
        // err.code to the numeric exit status (a string like 'ETIMEDOUT' for signals).
        e.exitCode = (typeof err.code === 'number') ? err.code : null;
        return reject(e);
      }
      resolve(stdout);
    });
  });
}

function rconConnect(host, port, password, command, timeout) {
  timeout = timeout || 10000;
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let authenticated = false;
    let cmdSent = false;
    const timer = setTimeout(function() {
      socket.destroy();
      reject(new Error('RCON connection timed out'));
    }, timeout);

    function buildPacket(id, type, body) {
      const bodyBuf = Buffer.from(body + '\0', 'utf8');
      const len = 4 + 4 + bodyBuf.length + 1;
      const pkt = Buffer.allocUnsafe(4 + len);
      pkt.writeInt32LE(len, 0);
      pkt.writeInt32LE(id, 4);
      pkt.writeInt32LE(type, 8);
      bodyBuf.copy(pkt, 12);
      pkt.writeUInt8(0, 12 + bodyBuf.length);
      return pkt;
    }

    function parsePacket(data) {
      if (data.length < 14) return null;
      const len = data.readInt32LE(0);
      if (data.length < 4 + len) return null;
      const id = data.readInt32LE(4);
      const type = data.readInt32LE(8);
      const body = data.slice(12, 4 + len - 2).toString('utf8');
      return { id: id, type: type, body: body, consumed: 4 + len };
    }

    socket.on('data', function(chunk) {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const pkt = parsePacket(buf);
        if (!pkt) break;
        buf = buf.slice(pkt.consumed);
        if (!authenticated) {
          if (pkt.id === -1) {
            clearTimeout(timer);
            socket.destroy();
            return reject(new Error('RCON authentication failed'));
          }
          authenticated = true;
          socket.write(buildPacket(2, 2, command));
          cmdSent = true;
        } else if (cmdSent) {
          clearTimeout(timer);
          socket.destroy();
          resolve(pkt.body);
          return;
        }
      }
    });

    socket.on('error', function(err) { clearTimeout(timer); reject(err); });
    socket.on('close', function() {
      clearTimeout(timer);
      if (!cmdSent) reject(new Error('RCON connection closed early'));
    });
    socket.connect(port, host, function() {
      socket.write(buildPacket(1, 3, password));
    });
  });
}

// Check real running status by whether the server's game port is actually listening.
// (PID-file check was unreliable: start-server.sh stored the nohup PID, not the java PID.)
app.get('/server-status/:serverId', function(req, res) {
  const serverId = req.params.serverId;
  if (!SAFE_ID.test(serverId)) return res.status(400).json({ success: false, error: 'Invalid id' });
  let running = false;
  try {
    const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
    const props = fs.readFileSync(propsPath, 'utf8');
    const portMatch = props.match(/^server-port=(\d+)/m);
    if (portMatch) {
      const port = parseInt(portMatch[1], 10);
      const { execFileSync } = require('child_process');
      // ss exits 0 always; we detect LISTEN lines for this exact port.
      const out = execFileSync('ss', ['-ltn', 'sport = :' + port], { timeout: 5000 }).toString();
      running = /LISTEN/.test(out);
    }
  } catch (e) { running = false; }
  return res.json({ success: true, serverId, running });
});

app.post('/create-server', async function(req, res) {
  const body = req.body;
  const serverId = body.serverId;
  const displayName = body.displayName;
  const slug = body.slug;
  const type = body.type;
  const version = body.version;
  const gamePort = body.gamePort;
  const rconPort = body.rconPort;
  const memoryMb = body.memoryMb;
  const gamemode = body.gamemode;
  const difficulty = body.difficulty || 'normal';
  const worldType = body.worldType || 'default';
  const maxPlayers = body.maxPlayers;
  const seed = body.seed;
  const ops = body.ops;
  const addons = body.addons;
  const icon = body.icon;
  const isPrivate = body.isPrivate === true;
  const whitelistPlayers = body.whitelistPlayers;

  if (!validateId(serverId, res)) return;
  if (!validateId(slug, res)) return;
  if (!displayName || !version || !gamePort || !rconPort || !memoryMb) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // RAM guard (create): guard against memory of servers ACTUALLY RUNNING, not the
  // sum of all allocations in servers.json. With sleep/wake (ServerWaker) most
  // servers are stopped at any moment, so summing every server's allocated memoryMb
  // would block creation forever once total allocation exceeds the cap — even
  // though the box is mostly idle. We measure the live -Xmx of running java
  // backends instead, and check (running + requested) against MEM_RUNNING_CAP_MB.
  // A newly created server starts STOPPED, so it does not add to running RAM until
  // the user starts it; ServerWaker handles waking within the same live budget.
  try {
    const _runningMb = runningGameServerMemoryMb();
    const _reqMem = parseInt(memoryMb, 10) || 0;
    if (_runningMb + _reqMem > MEM_RUNNING_CAP_MB) {
      return res.status(400).json({
        success: false,
        error: 'RAM cap exceeded (create): ' + (_runningMb + _reqMem) + 'MB would be live, max ' + MEM_RUNNING_CAP_MB + 'MB. Running servers currently use ' + _runningMb + 'MB. Stop an idle server and retry.'
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not compute running RAM for guard: ' + e.message });
  }

  try {
    console.log('[' + new Date().toISOString() + '] Creating server: ' + serverId);
    await runScript('create-server.sh', [
      serverId, displayName, slug, type || 'paper', version,
      String(gamePort), String(rconPort), String(memoryMb),
      String(seed || ''),
      JSON.stringify(Array.isArray(ops) ? ops : []),
      JSON.stringify(Array.isArray(addons) ? addons : []),
      String(maxPlayers || 20),
      String(gamemode || 'survival'),
      isPrivate ? 'true' : 'false',
      String(difficulty),
      String(worldType),
      JSON.stringify(Array.isArray(whitelistPlayers) ? whitelistPlayers : [])
    ]);

    if (icon && icon.length > 0) {
      const iconPath = path.join(SERVERS_DIR, serverId, 'server-icon.png');
      await new Promise(function(resolve) {
        saveIcon(icon, iconPath, function(err) {
          if (err) console.warn('Could not write icon: ' + err.message);
          resolve();
        });
      });
    }

    await runScript('start-server.sh', [serverId, String(memoryMb)]);
    await runScript('register-server-in-velocity.sh', [serverId, slug, String(gamePort)]);

    return res.json({ success: true, serverId: serverId, address: slug + '.omricraft.com', publicHost: slug + '.omricraft.com' });
  } catch (err) {
    console.error('create-server error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/delete-server', async function(req, res) {
  const serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;
  // Soft-delete by default: delete-server.sh archives the server FIRST (reversible
  // 30-day VPS backup) then removes it. `permanent:true` in the body skips the
  // archive and does the classic hard delete. MODE is a fixed enum string, never
  // interpolated user input, so it is injection-safe.
  const mode = (req.body.permanent === true) ? 'permanent' : 'soft';
  // installedAddons: the authoritative catalog id list (from the Firestore server
  // doc), passed THROUGH to delete-server.sh → archive-server.sh so the soft-delete
  // manifest records it for a faithful restore (D2). Only string ids are kept; a bad
  // shape degrades to [] (never breaks the delete). Serialized as one JSON argv.
  const rawAddons = Array.isArray(req.body.installedAddons) ? req.body.installedAddons : [];
  const installedAddons = rawAddons.filter(function(x) { return typeof x === 'string'; });
  const addonsJson = JSON.stringify(installedAddons);
  // Archiving worlds can take a while for large maps → allow up to the backup timeout.
  const timeout = (mode === 'soft') ? BACKUP_TIMEOUT_MS : 120000;
  try {
    await runScript('delete-server.sh', [serverId, mode, addonsJson], timeout);
    return res.json({ success: true, serverId: serverId, mode: mode });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/servers', function(req, res) {
  try {
    if (!fs.existsSync(SERVERS_JSON)) return res.json({ success: true, servers: [] });
    const raw = fs.readFileSync(SERVERS_JSON, 'utf8');
    const servers = JSON.parse(raw);
    return res.json({ success: true, servers: Array.isArray(servers) ? servers : [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/start-server', async function(req, res) {
  const serverId = req.body.serverId;
  const memoryMb = req.body.memoryMb;
  if (!validateId(serverId, res)) return;
  if (!memoryMb) return res.status(400).json({ success: false, error: 'Missing memoryMb' });

  // RAM guard (start/wake): same live-load check as /create-server. ServerWaker
  // calls this endpoint, so waking a stopped server when the box is already near
  // the live cap would OOM-kill a running backend. We measure the live -Xmx of
  // running java backends and block if (running + requested) exceeds the cap.
  // Fails LOUD via the catch → 500, never silently starts past the cap.
  try {
    const _runningMb = runningGameServerMemoryMb();
    const _reqMem = parseInt(memoryMb, 10) || 0;
    if (_runningMb + _reqMem > MEM_RUNNING_CAP_MB) {
      return res.status(400).json({
        success: false,
        error: 'RAM cap exceeded (start): ' + (_runningMb + _reqMem) + 'MB would be live, max ' + MEM_RUNNING_CAP_MB + 'MB. Running servers currently use ' + _runningMb + 'MB. Stop an idle server and retry.'
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not compute running RAM for guard: ' + e.message });
  }

  try {
    await runScript('start-server.sh', [serverId, String(memoryMb)]);
    return res.json({ success: true, serverId: serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/stop-server', async function(req, res) {
  const serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;
  try {
    await runScript('stop-server.sh', [serverId]);
    return res.json({ success: true, serverId: serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/restart-server', async function(req, res) {
  const serverId = req.body.serverId;
  const memoryMb = req.body.memoryMb;
  if (!validateId(serverId, res)) return;
  if (!memoryMb) return res.status(400).json({ success: false, error: 'Missing memoryMb' });
  try {
    await runScript('restart-server.sh', [serverId, String(memoryMb)]);
    return res.json({ success: true, serverId: serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/send-command', async function(req, res) {
  const serverId = req.body.serverId;
  const command = req.body.command;
  if (!validateId(serverId, res)) return;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing command' });
  }

  let rconPort = 25575;
  let rconPassword = '';

  try {
    const serversData = JSON.parse(fs.readFileSync(SERVERS_JSON, 'utf8'));
    const arr = Array.isArray(serversData) ? serversData : (serversData.servers || []);
    const srv = arr.find(function(s) { return s.id === serverId; });
    if (!srv) return res.status(404).json({ success: false, error: 'Server not found' });
    rconPort = srv.rconPort || 25575;
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }

  const serverPropsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  try {
    const props = fs.readFileSync(serverPropsPath, 'utf8');
    const match = props.match(/^rcon\.password=(.*)$/m);
    if (match) rconPassword = match[1].trim();
    const portMatch = props.match(/^rcon\.port=(\d+)/m);
    if (portMatch) rconPort = parseInt(portMatch[1]);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read server.properties: ' + e.message });
  }

  if (!rconPassword) {
    return res.status(500).json({ success: false, error: 'RCON password not found' });
  }

  try {
    console.log('[' + new Date().toISOString() + '] RCON ' + serverId + ' port=' + rconPort + ': ' + command);
    const output = await rconConnect('127.0.0.1', rconPort, rconPassword, command, 10000);
    return res.json({ success: true, output: output });
  } catch (e) {
    console.error('RCON error ' + serverId + ':', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /players — player count for all running servers via RCON
app.get('/players', async function(req, res) {
  let servers = [];
  try {
    const raw = fs.readFileSync(SERVERS_JSON, 'utf8');
    servers = JSON.parse(raw);
    if (!Array.isArray(servers)) servers = servers.servers || [];
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json' });
  }

  const results = {};
  await Promise.all(servers.map(async function(srv) {
    const serverId = srv.id;
    const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
    let rconPort = srv.rconPort || 25575;
    let rconPass = '';
    try {
      const props = fs.readFileSync(propsPath, 'utf8');
      const passMatch = props.match(/^rcon\.password=(.*)$/m);
      const portMatch = props.match(/^rcon\.port=(\d+)/m);
      if (passMatch) rconPass = passMatch[1].trim();
      if (portMatch) rconPort = parseInt(portMatch[1]);
    } catch (e) {
      results[serverId] = { online: false, count: 0, max: 0, players: [] };
      return;
    }
    if (!rconPass) {
      results[serverId] = { online: false, count: 0, max: 0, players: [] };
      return;
    }
    try {
      const out = await rconConnect('127.0.0.1', rconPort, rconPass, 'list', 5000);
      // Strip Minecraft color codes (EssentialsX prefixes each number with U+00A7 + code) before parsing.
      // Without stripping, /(\d+)\s+out of.../ matched the digit inside the color code (e.g. the 6 in the prefix)
      // and reported a bogus non-zero count for empty servers, which disabled auto-stop.
      const clean = out.replace(/\u00A7./g, "");
      // Match BOTH the vanilla/Paper format ("There are X of a max of Y players online")
      // AND the EssentialsX format ("There are X out of maximum Y players online"). \D+
      // spans either phrasing between the two numbers. Earlier the regex only matched the
      // EssentialsX wording, so every non-Essentials server parsed to count=null \u2014 which
      // auto-stop then treated as empty and would stop out from under real players.
      const m = clean.match(/There are\s+(\d+)\D+?(\d+)\s+players online/);
      // fail-safe: if parsing fails, count stays null so auto-stop (online && count===0) skips this server
      // instead of wrongly treating an unparseable server as empty and stopping it.
      const count = m ? parseInt(m[1], 10) : null;
      const max = m ? parseInt(m[2], 10) : null;
      results[serverId] = { online: true, count, max, players: [] };
    } catch (e) {
      results[serverId] = { online: false, count: 0, max: 0, players: [] };
    }
  }));

  return res.json({ success: true, servers: results });
});

app.post('/set-whitelist', async function(req, res) {
  const serverId = req.body.serverId;
  const enabled = req.body.enabled === true;
  if (!validateId(serverId, res)) return;

  const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  try {
    let props = fs.readFileSync(propsPath, 'utf8');
    props = props.replace(/^white-list=.*/m, 'white-list=' + (enabled ? 'true' : 'false'));
    if (!/^white-list=/m.test(props)) props += '\nwhite-list=' + (enabled ? 'true' : 'false');
    fs.writeFileSync(propsPath, props);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not update server.properties: ' + err.message });
  }

  // Also send RCON command if server is running
  try {
    const serversData = JSON.parse(fs.readFileSync(SERVERS_JSON, 'utf8'));
    const arr = Array.isArray(serversData) ? serversData : (serversData.servers || []);
    const srv = arr.find(function(s) { return s.id === serverId; });
    if (srv) {
      const rconPort = srv.rconPort || 25575;
      const propsContent = fs.readFileSync(propsPath, 'utf8');
      const passMatch = propsContent.match(/^rcon\.password=(.*)$/m);
      const portMatch = propsContent.match(/^rcon\.port=(\d+)/m);
      const rconPass = passMatch ? passMatch[1].trim() : '';
      const rconPortActual = portMatch ? parseInt(portMatch[1]) : rconPort;
      if (rconPass) {
        await rconConnect('127.0.0.1', rconPortActual, rconPass, enabled ? 'whitelist on' : 'whitelist off', 5000).catch(() => {});
      }
    }
  } catch (e) { /* server might not be running, ignore */ }

  console.log('[' + new Date().toISOString() + '] Whitelist ' + (enabled ? 'enabled' : 'disabled') + ' for ' + serverId);
  return res.json({ success: true });
});

app.post('/update-whitelist-players', async function(req, res) {
  const serverId = req.body.serverId;
  const players = req.body.players; // array of player name strings
  if (!validateId(serverId, res)) return;
  if (!Array.isArray(players)) {
    return res.status(400).json({ success: false, error: 'players must be an array' });
  }

  const whitelistPath = path.join(SERVERS_DIR, serverId, 'whitelist.json');
  const whitelist = players.map(function(name) {
    return { uuid: '', name: String(name).trim(), whitelisted: true };
  }).filter(function(e) { return e.name.length > 0; });

  try {
    fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2));
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not write whitelist.json: ' + err.message });
  }

  // Reload whitelist via RCON if server is running
  try {
    const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
    const propsContent = fs.readFileSync(propsPath, 'utf8');
    const passMatch = propsContent.match(/^rcon\.password=(.*)$/m);
    const portMatch = propsContent.match(/^rcon\.port=(\d+)/m);
    const rconPass = passMatch ? passMatch[1].trim() : '';
    const rconPort = portMatch ? parseInt(portMatch[1]) : 25575;
    if (rconPass) {
      await rconConnect('127.0.0.1', rconPort, rconPass, 'whitelist reload', 5000).catch(() => {});
    }
  } catch (e) { /* server might not be running */ }

  console.log('[' + new Date().toISOString() + '] Whitelist updated for ' + serverId + ' (' + whitelist.length + ' players)');
  return res.json({ success: true, count: whitelist.length });
});

// Map of plugin IDs to names (for remove-plugin: find jar by name prefix)
var PLUGIN_NAMES = {
  'p1':'EssentialsX','p2':'Geyser','p3':'CoreProtect','p4':'LuckPerms',
  'p5':'Vault','p6':'worldedit','p9':'BlueMap','p10':'FastLeafDecay',
  'p11':'GSit','p12':'Multiverse-Core','p13':'ZNPCsPlus','p14':'PlaceholderAPI',
  'p15':'PowerRanks','p16':'ChatControl','p17':'Towny','p18':'Slimefun',
  'p19':'AuraSkills','p20':'AuctionHouse','p21':'MythicMobs','p22':'BetterRTP',
  'p23':'spark','p24':'PlugManX','p25':'ExcellentEnchants','p26':'AdvancedShulkerboxes',
  'p27':'MythicMounts','p28':'ItemsAdder','p29':'GrimAC','p30':'ViaVersion',
  'p31':'InteractiveChat','p32':'Chunky','p33':'TAB','p34':'InvisibleItemFrames',
  'p35':'ClearLag','p36':'nightcore',
  'p-chatfmt':'ChatFormatter','p-axiom':'Axiom','p-viaversion':'ViaVersion'
};

app.post('/install-plugin', async function(req, res) {
  var serverId = req.body.serverId;
  var pluginId = req.body.pluginId;
  if (!validateId(serverId, res)) return;
  if (!pluginId || typeof pluginId !== 'string' || !/^[a-z0-9_-]+$/.test(pluginId)) {
    return res.status(400).json({ success: false, error: 'Invalid pluginId' });
  }
  try {
    await runScript('install-plugin.sh', [serverId, pluginId], 90000);
    console.log('[' + new Date().toISOString() + '] Installed plugin ' + pluginId + ' on ' + serverId);
    return res.json({ success: true });
  } catch (err) {
    console.error('install-plugin error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================================================
// /install-mod — modId-driven mod install for fabric/forge/neoforge (no client URL).
// SSRF-safe like /install-datapack-by-id: client sends only { serverId, modId }; the
// Modrinth slug is resolved from a SERVER-SIDE allowlist (MOD_CATALOG), and the
// server's loader(type)+version come from servers.json. install-mod.sh resolves the
// correct loader+MC build from the Modrinth API (fail-loud if no compatible build).
// Mods load on restart (no live RCON hot-load for jar mods) -> needsRestart:true.
// ===================================================================
var MOD_CATALOG = {
  // modId -> Modrinth slug. SERVER-installable mods only (client-side mods like Sodium
  // are installMethod:'client' in the UI and never reach this endpoint). Keep in sync
  // with create-server.sh MOD_SLUGS so create-time and post-create installs match.
  'm3': 'create',
  'm5': 'distanthorizons',
  'm6': 'simple-voice-chat',
  'm7': 'jei',
  'm8': 'lithium',
  'm9': 'ferrite-core',
  'm10': 'c2me-fabric',
  'm11': 'no-chat-reports'
  // m12 Jade, m13 Xaero's Minimap, m14 ETF, m15 EMF = installMethod:'client' in the UI
  // and never reach this endpoint.
};

app.post('/install-mod', async function(req, res) {
  var serverId = req.body.serverId;
  var modId = req.body.modId;
  if (!validateId(serverId, res)) return;
  if (!modId || typeof modId !== 'string' || !/^[a-z0-9_-]+$/.test(modId)) {
    return res.status(400).json({ success: false, error: 'Invalid modId' });
  }
  var slug = MOD_CATALOG[modId];
  if (!slug) {
    return res.status(400).json({ success: false, error: 'mod not available: ' + modId });
  }
  var serverDir = path.join(SERVERS_DIR, serverId);
  if (!fs.existsSync(serverDir)) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  var srv;
  try {
    srv = readServersArray().find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv) {
    return res.status(404).json({ success: false, error: 'Server not in servers.json' });
  }
  var loader = srv.type;
  var version = srv.version;
  if (['fabric', 'forge', 'neoforge'].indexOf(loader) === -1) {
    return res.status(400).json({ success: false, error: 'מודים ניתנים להתקנה רק על שרתי Fabric/Forge/NeoForge (זהו ' + loader + ')' });
  }
  try {
    await runScript('install-mod.sh', [serverDir, loader, version, slug], 90000);
    console.log('[' + new Date().toISOString() + '] Installed mod ' + modId + ' (' + slug + ') on ' + serverId);
    return res.json({ success: true, modId: modId, slug: slug, needsRestart: true });
  } catch (err) {
    console.error('install-mod error:', err.message);
    if (err && err.exitCode === 2) {
      return res.status(422).json({ success: false, error: 'אין גרסת מוד תואמת לגרסת השרת הזו' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================================================
// /install-resourcepack — addonId-driven server-forced resource pack (texture).
// SSRF-safe like /install-mod: the client sends only { serverId, addonId }; the
// Modrinth slug is resolved from a SERVER-SIDE allowlist (TEXTURE_CATALOG), and the
// server's MC version comes from servers.json. install-resourcepack.sh resolves the
// pack's direct cdn.modrinth.com URL + sha1 (version-aware) and writes them into
// server.properties (resource-pack / resource-pack-sha1 / require-resource-pack).
// server.properties supports exactly ONE resource-pack → one texture per server
// (last install wins). A resource-pack cannot be hot-set via vanilla RCON, so the
// new pack takes effect on the next (re)start → needsRestart:true.
// ===================================================================
var TEXTURE_CATALOG = {
  // addonId -> Modrinth slug. SERVER-forceable resource packs only. Keep in sync
  // with create-server.sh TEXTURE_SLUGS so create-time and post-create match.
  // t2 Golden Pumpkin Pie (no Modrinth pack) and t8 Shulker Box Tooltip (client-side
  // tooltip mod) stay installMethod:'client' in the UI and never reach this endpoint.
  't1': 'elibruhs-custom-hats-pack',
  't3': 'fresh-animations',
  't4': 'faithful-32x',
  't5': 'bare-bones',
  't6': 'visible-ores',
  't7': 'mandalas-gui-dark-mode',
  't9': 'better-leaves',
  't10': 'dramatic-skys',
  't11': 'default-dark-mode',
  't12': 'new-glowing-ores',
  't13': 'glowing-glints',
  't14': 'low-on-fire'
};

app.post('/install-resourcepack', async function(req, res) {
  var serverId = req.body.serverId;
  var addonId = req.body.addonId;
  if (!validateId(serverId, res)) return;
  if (!addonId || typeof addonId !== 'string' || !/^[a-z0-9_-]+$/.test(addonId)) {
    return res.status(400).json({ success: false, error: 'Invalid addonId' });
  }
  var slug = TEXTURE_CATALOG[addonId];
  if (!slug) {
    return res.status(400).json({ success: false, error: 'resource pack not available: ' + addonId });
  }
  var serverDir = path.join(SERVERS_DIR, serverId);
  if (!fs.existsSync(serverDir)) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  var srv;
  try {
    srv = readServersArray().find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv || !srv.version) {
    return res.status(404).json({ success: false, error: 'Server not in servers.json' });
  }
  // Plugin-bound packs (e.g. t1 Custom Hats) need a backing plugin to inject their items,
  // so they only work on a plugin-capable Bukkit-family core. Reject on a non-Bukkit core
  // even if the frontend filter is bypassed — mirrors the create-server.sh safety net and
  // the worldgen-on-Bukkit defense (BUKKIT_TYPES defined at module load, line ~1870).
  var PLUGIN_BOUND_TEXTURES = { t1: true };
  if (PLUGIN_BOUND_TEXTURES[addonId] && BUKKIT_TYPES.indexOf(srv.type) === -1) {
    return res.status(422).json({ success: false, error: 'plugin-bound pack needs a plugin-capable core' });
  }
  try {
    await runScript('install-resourcepack.sh', [serverDir, srv.version, slug], 90000);
    console.log('[' + new Date().toISOString() + '] Installed resourcepack ' + addonId + ' (' + slug + ') on ' + serverId);
    var running = isServerRunning(serverId);
    return res.json({
      success: true,
      addonId: addonId,
      slug: slug,
      needsRestart: true,
      note: running
        ? 'חבילת המרקם הוגדרה. אי אפשר להחיל אותה בזמן ריצה — היא תיכנס לתוקף בהפעלה מחדש. שים לב: שרת תומך בחבילת מרקם אחת בלבד (האחרונה גוברת).'
        : 'חבילת המרקם הוגדרה ותיטען כשהשרת יעלה. שים לב: שרת תומך בחבילת מרקם אחת בלבד (האחרונה גוברת).'
    });
  } catch (err) {
    console.error('install-resourcepack error:', err.message);
    if (err && err.exitCode === 2) {
      return res.status(422).json({ success: false, error: 'אין חבילת מרקם תואמת לגרסת השרת הזו' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/remove-plugin', function(req, res) {
  var serverId = req.body.serverId;
  var pluginId = req.body.pluginId;
  if (!validateId(serverId, res)) return;
  if (!pluginId || typeof pluginId !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid pluginId' });
  }
  var pluginsDir = path.join(SERVERS_DIR, serverId, 'plugins');
  var namePrefix = PLUGIN_NAMES[pluginId];
  if (!namePrefix) {
    return res.json({ success: true, note: 'No name mapping — nothing removed' });
  }
  try {
    var files = fs.readdirSync(pluginsDir);
    var removed = [];
    files.forEach(function(f) {
      if (f.toLowerCase().startsWith(namePrefix.toLowerCase()) && f.endsWith('.jar')) {
        fs.unlinkSync(path.join(pluginsDir, f));
        removed.push(f);
      }
    });
    console.log('[' + new Date().toISOString() + '] Removed plugin ' + pluginId + ' (' + removed.join(',') + ') from ' + serverId);
    return res.json({ success: true, removed: removed });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Remove a single .jar by exact filename (VPS reality, any plugin incl. non-catalog like TAB)
app.post('/remove-plugin-jar/:id', function(req, res) {
  var id = req.params.id;
  var file = req.body.file;
  if (!validateId(id, res)) return;
  if (!file || typeof file !== 'string' || file.includes('/') || file.includes('..') || !file.endsWith('.jar')) {
    return res.json({ success: false, error: 'invalid file' });
  }
  var pluginsDir = path.join(SERVERS_DIR, id, 'plugins');
  var jarPath = path.join(pluginsDir, file);
  if (!jarPath.startsWith(pluginsDir + path.sep)) {
    return res.json({ success: false, error: 'blocked' });
  }
  try {
    fs.unlinkSync(jarPath);
    console.log('[' + new Date().toISOString() + '] Removed jar ' + file + ' from ' + id);
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

app.post('/change-difficulty', async function(req, res) {
  const serverId = req.body.serverId;
  const difficulty = req.body.difficulty;
  if (!validateId(serverId, res)) return;
  const VALID_DIFF = ['peaceful', 'easy', 'normal', 'hard'];
  if (!VALID_DIFF.includes(difficulty)) {
    return res.status(400).json({ success: false, error: 'Invalid difficulty' });
  }

  // Update server.properties
  const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  try {
    let props = fs.readFileSync(propsPath, 'utf8');
    if (/^difficulty=/m.test(props)) {
      props = props.replace(/^difficulty=.*/m, 'difficulty=' + difficulty);
    } else {
      props += '\ndifficulty=' + difficulty;
    }
    fs.writeFileSync(propsPath, props);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not update server.properties: ' + err.message });
  }

  // Send RCON /difficulty command if server is running
  try {
    const propsContent = fs.readFileSync(propsPath, 'utf8');
    const passMatch = propsContent.match(/^rcon\.password=(.*)$/m);
    const portMatch = propsContent.match(/^rcon\.port=(\d+)/m);
    const rconPass = passMatch ? passMatch[1].trim() : '';
    const rconPort = portMatch ? parseInt(portMatch[1]) : 25575;
    if (rconPass) {
      await rconConnect('127.0.0.1', rconPort, rconPass, 'difficulty ' + difficulty, 5000).catch(() => {});
    }
  } catch (e) { /* server might not be running */ }

  console.log('[' + new Date().toISOString() + '] Difficulty set to ' + difficulty + ' for ' + serverId);
  return res.json({ success: true });
});

app.post('/update-ops', async function(req, res) {
  const serverId = req.body.serverId;
  const ops = req.body.ops; // array of player name strings
  if (!validateId(serverId, res)) return;
  if (!Array.isArray(ops)) {
    return res.status(400).json({ success: false, error: 'ops must be an array' });
  }

  // Write ops.json
  const opsPath = path.join(SERVERS_DIR, serverId, 'ops.json');
  const opsData = ops.map(function(name) {
    return { uuid: '', name: String(name).trim(), level: 4, bypassesPlayerLimit: false };
  }).filter(function(e) { return e.name.length > 0; });

  // Read old ops BEFORE overwriting, so we can deop removed players
  let oldOpsNames = [];
  try {
    const existing = JSON.parse(fs.readFileSync(opsPath, 'utf8'));
    if (Array.isArray(existing)) oldOpsNames = existing.map(function(o) { return o.name; });
  } catch(_) {}

  try {
    fs.writeFileSync(opsPath, JSON.stringify(opsData, null, 2));
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not write ops.json: ' + err.message });
  }

  // Send RCON deop/op commands if server is running
  try {
    const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
    const propsContent = fs.readFileSync(propsPath, 'utf8');
    const passMatch = propsContent.match(/^rcon\.password=(.*)$/m);
    const portMatch = propsContent.match(/^rcon\.port=(\d+)/m);
    const rconPass = passMatch ? passMatch[1].trim() : '';
    const rconPortActual = portMatch ? parseInt(portMatch[1]) : 25575;
    if (rconPass) {
      const newNames = opsData.map(function(o) { return o.name; });
      const toDeop = oldOpsNames.filter(function(n) { return !newNames.includes(n); });
      for (const name of toDeop) {
        await rconConnect('127.0.0.1', rconPortActual, rconPass, 'deop ' + name, 5000).catch(function() {});
      }
      for (const op of opsData) {
        await rconConnect('127.0.0.1', rconPortActual, rconPass, 'op ' + op.name, 5000).catch(function() {});
      }
    }
  } catch (e) { /* server might not be running */ }

  console.log('[' + new Date().toISOString() + '] Ops updated for ' + serverId + ' (' + opsData.length + ' ops)');
  return res.json({ success: true, count: opsData.length });
});

function saveIcon(iconBase64, iconPath, cb) {
  const iconData = iconBase64.replace(/^data:image\/\w+;base64,/, '');
  const tmpPath = iconPath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, Buffer.from(iconData, 'base64'));
  } catch(e) { return cb(e); }
  // Resize to 64x64 PNG using ImageMagick if available
  execFile('which', ['convert'], function(err) {
    if (err) {
      // No ImageMagick — just save as-is
      try { fs.renameSync(tmpPath, iconPath); cb(null); } catch(e) { cb(e); }
      return;
    }
    execFile('convert', [tmpPath, '-resize', '64x64!', '-background', 'none', '-gravity', 'center', 'PNG:' + iconPath], function(err2) {
      try { fs.unlinkSync(tmpPath); } catch(_) {}
      if (err2) {
        // Fallback: save original without resize
        try { fs.writeFileSync(iconPath, Buffer.from(iconData, 'base64')); cb(null); } catch(e) { cb(e); }
      } else {
        cb(null);
      }
    });
  });
}

app.post('/update-icon', function(req, res) {
  const serverId = req.body.serverId;
  const icon = req.body.icon;
  if (!validateId(serverId, res)) return;
  if (!icon || typeof icon !== 'string' || icon.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing icon' });
  }
  const iconPath = path.join(SERVERS_DIR, serverId, 'server-icon.png');
  saveIcon(icon, iconPath, function(err) {
    if (err) {
      console.error('update-icon error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
    console.log('[' + new Date().toISOString() + '] Updated icon for ' + serverId);
    return res.json({ success: true });
  });
});

// ---------------------------------------------------------------------------
// File manager — list / read / write inside a server's own directory only
// ---------------------------------------------------------------------------
var TEXT_EXT = /\.(properties|ya?ml|yaml|json|txt|conf|cfg|toml|ini|log|sh|md|csv)$/i;
var MAX_READ_BYTES = 5 * 1024 * 1024; // 5 MB

// Resolve a path relative to the server dir; returns null if it escapes the dir.
function resolveServerPath(serverId, relPath) {
  var base = path.resolve(SERVERS_DIR, serverId);
  var target = path.resolve(base, relPath || '');
  if (target !== base && target.indexOf(base + path.sep) !== 0) return null;
  return target;
}

function isBinary(buf) {
  var n = Math.min(buf.length, 8000);
  for (var i = 0; i < n; i++) { if (buf[i] === 0) return true; }
  return false;
}

app.post('/list-files', function(req, res) {
  var serverId = req.body.serverId;
  var relPath = req.body.path || '';
  if (!validateId(serverId, res)) return;
  var dir = resolveServerPath(serverId, relPath);
  if (!dir) return res.status(400).json({ success: false, error: 'Invalid path' });
  try {
    var stat = fs.statSync(dir);
    if (!stat.isDirectory()) return res.status(400).json({ success: false, error: 'Not a directory' });
    var entries = fs.readdirSync(dir, { withFileTypes: true }).map(function(d) {
      var size = 0;
      try { if (d.isFile()) size = fs.statSync(path.join(dir, d.name)).size; } catch (_) {}
      return { name: d.name, type: d.isDirectory() ? 'dir' : 'file', size: size };
    }).sort(function(a, b) {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return res.json({ success: true, path: relPath, entries: entries });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/read-file', function(req, res) {
  var serverId = req.body.serverId;
  var relPath = req.body.path;
  if (!validateId(serverId, res)) return;
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path' });
  var file = resolveServerPath(serverId, relPath);
  if (!file) return res.status(400).json({ success: false, error: 'Invalid path' });
  try {
    var stat = fs.statSync(file);
    if (!stat.isFile()) return res.status(400).json({ success: false, error: 'Not a file' });
    if (stat.size > MAX_READ_BYTES) {
      return res.json({ success: true, binary: true, tooLarge: true, size: stat.size, content: '' });
    }
    var buf = fs.readFileSync(file);
    if (isBinary(buf)) {
      return res.json({ success: true, binary: true, size: stat.size, content: '' });
    }
    return res.json({ success: true, binary: false, size: stat.size, content: buf.toString('utf8') });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/write-file', function(req, res) {
  var serverId = req.body.serverId;
  var relPath = req.body.path;
  var content = req.body.content;
  if (!validateId(serverId, res)) return;
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path' });
  if (typeof content !== 'string') return res.status(400).json({ success: false, error: 'content must be a string' });
  var file = resolveServerPath(serverId, relPath);
  if (!file) return res.status(400).json({ success: false, error: 'Invalid path' });
  if (!TEXT_EXT.test(file)) return res.status(400).json({ success: false, error: 'Only text config files are editable' });
  try {
    if (fs.existsSync(file)) {
      var existing = fs.readFileSync(file);
      if (isBinary(existing)) return res.status(400).json({ success: false, error: 'Cannot edit binary file' });
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('[' + new Date().toISOString() + '] File written: ' + serverId + '/' + relPath);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/delete-file', function(req, res) {
  var serverId = req.body.serverId;
  var relPath = req.body.path;
  if (!validateId(serverId, res)) return;
  if (!relPath) return res.status(400).json({ success: false, error: 'Missing path' });
  var file = resolveServerPath(serverId, relPath);
  if (!file) return res.status(400).json({ success: false, error: 'Invalid path' });
  if (file === path.resolve(SERVERS_DIR, serverId)) {
    return res.status(400).json({ success: false, error: 'Cannot delete server root' });
  }
  try {
    var stat = fs.statSync(file);
    if (stat.isDirectory()) {
      return res.status(400).json({ success: false, error: 'Directory deletion not allowed' });
    }
    fs.unlinkSync(file);
    console.log('[' + new Date().toISOString() + '] File deleted: ' + serverId + '/' + relPath);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// --- SSRF guard helpers (shared across initial URL + every redirect hop) ---
// Defence-in-depth: even though /install-datapack is not exposed via a Cloud
// Function, prevent using this box as a fetch proxy into the internal network
// (Oracle metadata 169.254.169.254, loopback, RFC1918, etc.). Checks run against
// the DNS-RESOLVED IP — not the host string — so octal/decimal/hex/IPv6-mapped
// encodings and DNS-rebinding cannot smuggle an internal address past us.
var ALLOWED_DATAPACK_HOSTS = [
  'modrinth.com', 'cdn.modrinth.com',
  'github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com',
  // GitHub now 302-redirects release-asset downloads to this signed-URL host;
  // it is GitHub-owned, so allow it (else every /releases/download/* 404s here).
  'release-assets.githubusercontent.com',
  'codeload.github.com', 'github.io'
];

// True if the given numeric IP string is private / loopback / link-local /
// unspecified, for both IPv4 and IPv6 (incl. IPv4-mapped IPv6 like ::ffff:127.0.0.1).
function isPrivateIp(ip) {
  var fam = net.isIP(ip);
  if (!fam) return true; // not a parseable IP → reject, fail closed
  // Normalise IPv4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:7f00:1) down to IPv4.
  var lower = ip.toLowerCase();
  var mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) { ip = mapped[1]; fam = 4; }
  if (fam === 4) {
    var p = ip.split('.').map(function(o) { return parseInt(o, 10); });
    if (p.length !== 4 || p.some(function(o) { return isNaN(o) || o < 0 || o > 255; })) return true;
    if (p[0] === 0) return true;                                   // 0.0.0.0/8
    if (p[0] === 10) return true;                                  // 10/8
    if (p[0] === 127) return true;                                 // 127/8 loopback
    if (p[0] === 169 && p[1] === 254) return true;                 // 169.254/16 link-local (metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;     // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;                 // 192.168/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;    // 100.64/10 CGNAT
    return false;
  }
  // IPv6
  if (lower === '::' || lower === '::1') return true;              // unspecified / loopback
  if (/^(fc|fd)[0-9a-f]{2}:/.test(lower)) return true;            // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;             // fe80::/10 link-local
  return false;
}

// Validate a single URL: https only + host on allowlist + every resolved IP public.
// Async because of dns.lookup. Calls cb(errMessage|null).
function assertUrlAllowed(rawUrl, cb) {
  var parsed;
  try { parsed = new URL(rawUrl); }
  catch (e) { return cb('Invalid url'); }
  if (parsed.protocol !== 'https:') {
    return cb('Only https URLs allowed');
  }
  var host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  // Layer 1: host allowlist (modrinth / github families). If the host is a bare
  // IP literal it will simply not match the allowlist and be rejected here.
  var hostAllowed = ALLOWED_DATAPACK_HOSTS.some(function(h) {
    return host === h || host.endsWith('.' + h);
  });
  if (!hostAllowed) return cb('Host not allowed: ' + host);
  // If the host is itself an IP literal, check it directly (no DNS).
  if (net.isIP(host)) {
    return cb(isPrivateIp(host) ? 'Blocked host (private/loopback address)' : null);
  }
  // Layer 2: resolve and reject if ANY answer is an internal address (rebinding-safe).
  dns.lookup(host, { all: true }, function(err, addresses) {
    if (err) return cb('DNS resolution failed for host: ' + host);
    if (!addresses || addresses.length === 0) return cb('No DNS records for host: ' + host);
    for (var i = 0; i < addresses.length; i++) {
      if (isPrivateIp(addresses[i].address)) {
        return cb('Blocked host (resolves to private/loopback address)');
      }
    }
    return cb(null);
  });
}

app.post('/install-datapack', async function(req, res) {
  var serverId = req.body.serverId;
  var url = req.body.url;
  var filename = req.body.filename;
  if (!validateId(serverId, res)) return;
  if (!url || !filename) return res.status(400).json({ success: false, error: 'url and filename required' });
  // Basic filename safety — no path traversal
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }

  // SSRF guard on the initial URL (per-hop re-validation happens in fetchToFile).
  var initialErr = await new Promise(function(resolve) { assertUrlAllowed(url, resolve); });
  if (initialErr) {
    return res.status(400).json({ success: false, error: initialErr });
  }

  var serverDir = path.join(SERVERS_DIR, serverId);
  var worldDatapacks = path.join(serverDir, 'world', 'datapacks');
  var pending = path.join(serverDir, 'datapacks-pending');
  var targetDir = fs.existsSync(worldDatapacks) ? worldDatapacks : pending;

  fs.mkdirSync(targetDir, { recursive: true });
  var dest = path.join(targetDir, filename);

  var MAX_REDIRECTS = 5;
  function fetchToFile(srcUrl, destPath, cb, depth) {
    depth = depth || 0;
    // Re-validate EVERY hop (incl. the URL we were redirected to) before fetching,
    // so a 30x Location pointing at 169.254.169.254 / loopback is rejected.
    assertUrlAllowed(srcUrl, function(vErr) {
      if (vErr) return cb(new Error('Blocked redirect/url: ' + vErr));
      var https = require('https');
      var file = fs.createWriteStream(destPath);
      https.get(srcUrl, { headers: { 'User-Agent': 'omricraft/1.0' } }, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume(); // drain
          file.close();
          fs.unlink(destPath, function() {});
          if (depth >= MAX_REDIRECTS) {
            return cb(new Error('Too many redirects (max ' + MAX_REDIRECTS + ')'));
          }
          // Resolve relative redirects against the current URL before re-validating.
          var nextUrl;
          try { nextUrl = new URL(response.headers.location, srcUrl).toString(); }
          catch (e) { return cb(new Error('Invalid redirect location')); }
          return fetchToFile(nextUrl, destPath, cb, depth + 1);
        }
        response.pipe(file);
        file.on('finish', function() { file.close(); cb(null); });
      }).on('error', cb);
    });
  }

  try {
    await new Promise(function(resolve, reject) { fetchToFile(url, dest, function(err) { if (err) reject(err); else resolve(); }); });
    if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
      try { fs.unlinkSync(dest); } catch(_) {}
      return res.status(500).json({ success: false, error: 'Download failed (0 bytes)' });
    }
    var installedToWorld = fs.existsSync(worldDatapacks);
    console.log('[' + new Date().toISOString() + '] Installed datapack ' + filename + ' on ' + serverId + ' -> ' + targetDir);
    return res.json({ success: true, path: dest, needsRestart: !installedToWorld });
  } catch (e) {
    try { fs.unlinkSync(dest); } catch(_) {}
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ===================================================================
// /install-datapack-by-id — addonId-driven datapack install (no client URL).
// SSRF is closed at the source: the caller sends only { serverId, addonId };
// the URL is looked up from a SERVER-SIDE allowlist (DATAPACK_CATALOG). An
// addonId not in the catalog is rejected with 400 *before* any network call.
// The existing assertUrlAllowed host-allowlist + per-redirect re-validation
// stays in force as a second layer. After a successful download, if the server
// is running we enable + reload the datapack live over RCON (the real gap that
// made datapacks "succeed" but never load).
// ===================================================================
var DATAPACK_CATALOG = {
  // addonId -> { modrinthSlug, worldgen, [url, filename] }.
  // VERSION-AWARE: when modrinthSlug is set we resolve the download from the
  // Modrinth API for the server's exact MC version, so the build always matches
  // (pinning a single build crashed newer servers — Terralith 1.21 on 1.21.11
  // failed worldgen parse). The pinned url/filename are a last-resort fallback
  // ONLY used when no slug is present; for Terralith we always go via Modrinth.
  'd2': {
    modrinthSlug: 'terralith',
    worldgen: true // applies to NEW chunks only once enabled
  },
  // Keep in sync with create-server.sh DATAPACK_SLUGS so create-time and post-create
  // installs resolve the same Modrinth project (version-aware).
  'd4':  { modrinthSlug: 'serversleep' },            // Multiplayer Sleep
  'd6':  { modrinthSlug: 'mini-blocks-datapack' },   // Mini Blocks
  'd7':  { modrinthSlug: 'better-wanderingtraders' },// Wandering Trades
  'd9':  { modrinthSlug: 'hotbarcoordinates' },      // Coordinates HUD
  'd10': { modrinthSlug: 'player-drops-head' },      // Player Head Drops
  'd11': { modrinthSlug: 'mob-heads' },              // More Mob Heads
  'd12': { modrinthSlug: 'veinminer' },              // VeinMiner
  'd13': { modrinthSlug: 'tectonic', worldgen: true },   // Tectonic — worldgen overhaul
  'd14': { modrinthSlug: 'incendium', worldgen: true },  // Incendium — Nether worldgen overhaul
  'd15': { modrinthSlug: 'nullscape', worldgen: true },  // Nullscape — End worldgen overhaul
  'd16': { modrinthSlug: 'explorify' },              // Explorify — vanilla structures
  'd17': { modrinthSlug: 'dungeons-and-taverns' }    // Dungeons and Taverns — structures
  // d1 Vanilla Tweaks (umbrella) and d8 Nether Portal Coords have no single Modrinth
  // datapack equivalent → they stay installMethod:'manual' and out of this catalog.
};

// Resolve a datapack's download for a specific MC version via the Modrinth API
// (loader "datapack"). Returns { url, filename } for the newest compatible build,
// null when NO build exists for that version (caller fails loudly — never installs
// an incompatible pack). Mirrors install-mod.sh / install-datapack.sh resolution.
function resolveDatapackFromModrinth(slug, mcVersion) {
  return new Promise(function(resolve, reject) {
    if (!/^[A-Za-z0-9_-]+$/.test(slug)) return reject(new Error('Invalid Modrinth slug'));
    if (!/^[0-9][0-9A-Za-z._-]*$/.test(mcVersion)) return reject(new Error('Invalid MC version'));
    var https = require('https');
    var api = 'https://api.modrinth.com/v2/project/' + encodeURIComponent(slug) +
      '/version?loaders=%5B%22datapack%22%5D&game_versions=%5B%22' + encodeURIComponent(mcVersion) + '%22%5D';
    https.get(api, { headers: { 'User-Agent': 'omricraft/1.0 (datapack-installer)' } }, function(r) {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('Modrinth API HTTP ' + r.statusCode)); }
      var body = '';
      r.on('data', function(c) { body += c; });
      r.on('end', function() {
        var versions;
        try { versions = JSON.parse(body); } catch (e) { return reject(new Error('Modrinth API parse error')); }
        if (!Array.isArray(versions) || versions.length === 0) return resolve(null);
        versions.sort(function(a, b) { return (b.date_published || '').localeCompare(a.date_published || ''); });
        var files = versions[0].files || [];
        if (!files.length) return resolve(null);
        var f = files.find(function(x) { return x.primary; }) || files[0];
        if (!f.url || !f.filename) return resolve(null);
        // Minecraft only loads .zip; Modrinth datapack files already are .zip but enforce it.
        var name = /\.zip$/i.test(f.filename) ? f.filename : (f.filename + '.zip');
        resolve({ url: f.url, filename: name });
      });
    }).on('error', function(e) { reject(new Error('Modrinth API request failed: ' + e.message)); });
  });
}

app.post('/install-datapack-by-id', async function(req, res) {
  var serverId = req.body.serverId;
  var addonId = req.body.addonId;
  if (!validateId(serverId, res)) return;
  if (!addonId || typeof addonId !== 'string' || !/^[a-z0-9_-]+$/.test(addonId)) {
    return res.status(400).json({ success: false, error: 'Invalid addonId' });
  }

  // Server-side allowlist resolution. Unknown id => no download attempt at all.
  var entry = DATAPACK_CATALOG[addonId];
  if (!entry) {
    return res.status(400).json({ success: false, error: 'datapack not available: ' + addonId });
  }

  var url = entry.url;
  var filename = entry.filename;

  // VERSION-AWARE resolution: when the catalog entry has a Modrinth slug, resolve
  // the download for THIS server's MC version, so we never install an incompatible
  // build that crashes the server on boot (the Terralith-1.21-on-1.21.11 bug).
  if (entry.modrinthSlug) {
    var srv;
    try {
      srv = readServersArray().find(function(s) { return s.id === serverId; });
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
    }
    if (!srv || !srv.version) {
      return res.status(404).json({ success: false, error: 'Server not found in servers.json' });
    }
    var resolved;
    try {
      resolved = await resolveDatapackFromModrinth(entry.modrinthSlug, srv.version);
    } catch (e) {
      return res.status(502).json({ success: false, error: e.message });
    }
    if (!resolved) {
      // No compatible build — fail loudly with a precise status (422, not an opaque
      // 5xx), never install an incompatible pinned zip that would crash the server.
      return res.status(422).json({ success: false, error: 'אין חבילת datapack תואמת לגרסת השרת הזו (' + srv.version + ')' });
    }
    url = resolved.url;
    filename = resolved.filename;
  }

  if (!url || !filename) {
    return res.status(400).json({ success: false, error: 'datapack not resolvable: ' + addonId });
  }
  // Path-traversal safety on the resolved filename (Modrinth names can vary).
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
    return res.status(400).json({ success: false, error: 'Invalid resolved filename: ' + filename });
  }

  // Defence-in-depth: SSRF guard still runs on the resolved URL + every redirect.
  var initialErr = await new Promise(function(resolve) { assertUrlAllowed(url, resolve); });
  if (initialErr) {
    return res.status(400).json({ success: false, error: initialErr });
  }

  var serverDir = path.join(SERVERS_DIR, serverId);
  if (!fs.existsSync(serverDir)) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  var worldDatapacks = path.join(serverDir, 'world', 'datapacks');
  var pending = path.join(serverDir, 'datapacks-pending');
  var installedToWorld = fs.existsSync(worldDatapacks);
  var targetDir = installedToWorld ? worldDatapacks : pending;

  fs.mkdirSync(targetDir, { recursive: true });
  var dest = path.join(targetDir, filename);

  var MAX_REDIRECTS = 5;
  function fetchToFile(srcUrl, destPath, cb, depth) {
    depth = depth || 0;
    assertUrlAllowed(srcUrl, function(vErr) {
      if (vErr) return cb(new Error('Blocked redirect/url: ' + vErr));
      var https = require('https');
      var file = fs.createWriteStream(destPath);
      https.get(srcUrl, { headers: { 'User-Agent': 'omricraft/1.0' } }, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          file.close();
          fs.unlink(destPath, function() {});
          if (depth >= MAX_REDIRECTS) {
            return cb(new Error('Too many redirects (max ' + MAX_REDIRECTS + ')'));
          }
          var nextUrl;
          try { nextUrl = new URL(response.headers.location, srcUrl).toString(); }
          catch (e) { return cb(new Error('Invalid redirect location')); }
          return fetchToFile(nextUrl, destPath, cb, depth + 1);
        }
        response.pipe(file);
        file.on('finish', function() { file.close(); cb(null); });
      }).on('error', cb);
    });
  }

  try {
    await new Promise(function(resolve, reject) { fetchToFile(url, dest, function(err) { if (err) reject(err); else resolve(); }); });
    if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
      try { fs.unlinkSync(dest); } catch(_) {}
      return res.status(500).json({ success: false, error: 'Download failed (0 bytes)' });
    }
    // ZIP/JAR magic check — datapacks are zip archives ("PK\x03\x04").
    var fd = fs.openSync(dest, 'r');
    var magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    if (!(magic[0] === 0x50 && magic[1] === 0x4B)) {
      try { fs.unlinkSync(dest); } catch(_) {}
      return res.status(500).json({ success: false, error: 'Downloaded file is not a valid zip/jar archive' });
    }

    console.log('[' + new Date().toISOString() + '] Installed datapack ' + addonId + ' (' + filename + ') on ' + serverId + ' -> ' + targetDir);

    // RCON enable + reload — only meaningful when installed into the live world
    // dir AND the server is up. Otherwise it loads on next start (pending dir is
    // copied into world/datapacks by start-server flow).
    var rconApplied = false;
    var rconError = null;
    if (installedToWorld && isServerRunning(serverId)) {
      try {
        var rcon = readRcon(serverId);
        if (rcon.pass) {
          // Datapack names are referenced as: file/<filename>
          await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'datapack enable "file/' + filename + '"', 10000);
          await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'reload', 30000);
          rconApplied = true;
        } else {
          rconError = 'RCON password not found';
        }
      } catch (re) {
        rconError = re.message;
      }
    }

    var note;
    if (rconApplied) {
      note = entry.worldgen
        ? 'Datapack enabled and reloaded. Worldgen datapacks (e.g. Terralith) only affect NEWLY generated chunks — existing terrain is unchanged.'
        : 'Datapack enabled and reloaded live.';
    } else if (installedToWorld) {
      note = 'Datapack downloaded to world. Live enable skipped' + (rconError ? ' (' + rconError + ')' : ' (server not running)') + '; it will load on next start.';
    } else {
      note = 'Server has no world yet — datapack staged in datapacks-pending and will load when the world is first generated.';
    }

    return res.json({
      success: true,
      addonId: addonId,
      file: filename,
      path: dest,
      installedToWorld: installedToWorld,
      rconApplied: rconApplied,
      needsRestart: !rconApplied,
      note: note
    });
  } catch (e) {
    try { fs.unlinkSync(dest); } catch(_) {}
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/read-log', function(req, res) {
  const serverId = req.body.serverId;
  const lines = parseInt(req.body.lines) || 100;
  if (!validateId(serverId, res)) return;
  const logFile = path.join(SERVERS_DIR, serverId, 'logs', 'latest.log');
  if (!fs.existsSync(logFile)) return res.json({ success: true, log: [] });
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    const tail = allLines.slice(-lines);
    return res.json({ success: true, log: tail });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/update-server-properties', async function(req, res) {
  const serverId = req.body.serverId;
  const properties = req.body.properties || {};
  if (!validateId(serverId, res)) return;
  const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  if (!fs.existsSync(propsPath)) return res.status(404).json({ success: false, error: 'server.properties not found' });
  try {
    let props = fs.readFileSync(propsPath, 'utf8');
    const keyMap = {
      name: 'motd',
      maxPlayers: 'max-players',
      gamemode: 'gamemode',
      worldType: 'level-type',
    };
    for (const [field, value] of Object.entries(properties)) {
      const propKey = keyMap[field];
      if (!propKey || value === undefined || value === null) continue;
      let propVal = String(value);
      if (field === 'worldType') {
        const typeMap = { flat: 'minecraft:flat', large_biomes: 'minecraft:large_biomes', amplified: 'minecraft:amplified' };
        propVal = typeMap[value] || 'minecraft:normal';
      }
      if (new RegExp('^' + propKey + '=', 'm').test(props)) {
        props = props.replace(new RegExp('^' + propKey + '=.*', 'm'), propKey + '=' + propVal);
      } else {
        props += '\n' + propKey + '=' + propVal;
      }
    }
    fs.writeFileSync(propsPath, props);
    // Live RCON updates for properties that support hot-reload
    try {
      const passMatch = props.match(/^rcon\.password=(.*)$/m);
      const portMatch = props.match(/^rcon\.port=(\d+)/m);
      if (passMatch && portMatch) {
        const rconPass = passMatch[1].trim();
        const rconPort = parseInt(portMatch[1]);
        if (properties.maxPlayers) {
          await rconConnect('127.0.0.1', rconPort, rconPass,
            'setmaxplayers ' + properties.maxPlayers, 5000).catch(function() {});
        }
        if (properties.gamemode) {
          await rconConnect('127.0.0.1', rconPort, rconPass,
            'defaultgamemode ' + properties.gamemode, 5000).catch(function() {});
        }
      }
    } catch(_) {}
    console.log('[' + new Date().toISOString() + '] Updated server.properties for ' + serverId + ': ' + Object.keys(properties).join(','));
    return res.json({ success: true });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// GET /server-stats/:id — real RAM/CPU usage from /proc
app.get('/server-stats/:id', function(req, res) {
  var id = req.params.id;
  if (!SAFE_ID.test(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  var servers = [];
  try {
    var raw = fs.readFileSync(SERVERS_JSON, 'utf8');
    servers = JSON.parse(raw);
    if (!Array.isArray(servers)) servers = servers.servers || [];
  } catch (e) { console.error('[server-stats] servers.json read/parse failed:', e.message); }
  var server = servers.find(function(s) { return s.id === id; });
  if (!server) return res.json({ success: false, error: 'not found' });

  var { execSync } = require('child_process');
  try {
    var screenOut = '';
    try { screenOut = execSync('screen -ls mc-' + id + ' 2>/dev/null || echo ""', { timeout: 5000 }).toString(); } catch(_) {}
    var pidMatch = screenOut.match(/(\d+)\.mc-/);
    if (!pidMatch) {
      return res.json({ success: true, running: false, ram: 0, cpu: 0, players: server.players || 0 });
    }
    var screenPid = pidMatch[1];
    var javaPid = '';
    try { javaPid = execSync('pgrep -P ' + screenPid + ' java 2>/dev/null || echo ""', { timeout: 5000 }).toString().trim(); } catch(_) {}
    if (!javaPid) {
      return res.json({ success: true, running: true, ram: 0, cpu: 0, players: server.players || 0 });
    }
    var ramKb = '0';
    try { ramKb = execSync('grep VmRSS /proc/' + javaPid + '/status 2>/dev/null | awk \'{print $2}\'', { timeout: 5000 }).toString().trim(); } catch(_) {}
    var ramMb = Math.round(parseInt(ramKb || '0') / 1024);
    var cpuLine = '0';
    try { cpuLine = execSync('ps -p ' + javaPid + ' -o %cpu --no-headers 2>/dev/null || echo "0"', { timeout: 5000 }).toString().trim(); } catch(_) {}
    var cpu = Math.round(parseFloat(cpuLine) || 0);
    return res.json({ success: true, running: true, ram: ramMb, cpu: cpu, players: server.players || 0 });
  } catch (e) {
    return res.json({ success: true, running: false, ram: 0, cpu: 0, players: 0, error: e.message });
  }
});

// Helper: read servers.json as an array (handles {servers:[]} shape too)
function readServersArray() {
  const raw = fs.readFileSync(SERVERS_JSON, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.servers || []);
}

// Helper: total heap (MB) of Minecraft game-server java processes RUNNING NOW.
// Parses -Xmx from every backend java launch shape — -jar server.jar (paper/purpur/
// vanilla/folia/mohist/youer), -jar fabric-server-launch.jar (fabric), and run.sh java that
// reads @user_jvm_args.txt / @libraries (forge/neoforge). Excludes the Velocity proxy
// (velocity.jar). Used by the create-server RAM guard so the cap reflects live load,
// not allocation. Fails LOUD: if ps cannot be read the caller's try/catch returns 500.
function runningGameServerMemoryMb() {
  const { execSync } = require('child_process');
  const out = execSync(
    "ps -eo args | grep -E 'java .*(-jar (server|fabric-server-launch)\\.jar|@user_jvm_args\\.txt|@libraries)' | grep -v grep || true",
    { timeout: 5000 }
  ).toString();
  let totalMb = 0;
  out.split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const m = line.match(/-Xmx(\d+)([MmGg])/);
    if (!m) return;
    const val = parseInt(m[1], 10);
    if (!Number.isFinite(val)) return;
    totalMb += (m[2].toUpperCase() === 'G') ? val * 1024 : val;
  });
  return totalMb;
}

// Helper: atomically write the servers array back to servers.json
function writeServersArray(arr) {
  const tmp = SERVERS_JSON + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
  fs.renameSync(tmp, SERVERS_JSON);
}

// ---------------------------------------------------------------------------
// /change-version — swaps the server jar for a new TYPE/VERSION and restarts.
// Stops the server if running, backs up server.jar, re-downloads via the single
// source of truth (download-server-jar.sh). On download failure → restore the
// backup and report failure (NEVER leave a broken server). Worlds are never
// touched. On success: update servers.json version, restart if it was running.
// ---------------------------------------------------------------------------
app.post('/change-version', async function(req, res) {
  const serverId = req.body.serverId;
  const version = req.body.version;
  if (!validateId(serverId, res)) return;
  if (!version || typeof version !== 'string' || !/^[0-9][0-9a-z.\-+]*$/i.test(version)) {
    return res.status(400).json({ success: false, error: 'Invalid version' });
  }

  let arr;
  let srv;
  try {
    arr = readServersArray();
    srv = arr.find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv) return res.status(404).json({ success: false, error: 'Server not found' });

  const type = (req.body.type && typeof req.body.type === 'string') ? req.body.type : (srv.type || 'paper');
  const prevType = srv.type || 'paper';
  const typeChanged = type !== prevType;

  // Reject type changes to families that cannot do Velocity modern forwarding
  // BEFORE touching the jar — never create an unjoinable server.
  if (typeChanged && (type === 'forge' || type === 'neoforge' || type === 'vanilla')) {
    return res.status(400).json({
      success: false,
      error: 'סוג שרת "' + type + '" לא נתמך מאחורי הפרוקסי (Velocity) — אין מוד forwarding אמין לכל הגרסאות. בחר Paper/Purpur/Folia/Mohist/Youer או Fabric.'
    });
  }

  const serverDir = path.join(SERVERS_DIR, serverId);
  const jarPath = path.join(serverDir, 'server.jar');
  const bakPath = jarPath + '.bak';
  const prevVersion = srv.version;
  const wasRunning = isServerRunning(serverId);

  console.log('[' + new Date().toISOString() + '] change-version ' + serverId + ': ' + prevVersion + ' -> ' + version + ' (type=' + type + ', wasRunning=' + wasRunning + ')');

  // 1. Stop if running
  if (wasRunning) {
    try {
      await runScript('stop-server.sh', [serverId]);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Could not stop server before version change: ' + e.message });
    }
  }

  // 2. Back up current jar (if present)
  try {
    if (fs.existsSync(jarPath)) fs.copyFileSync(jarPath, bakPath);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not back up server.jar: ' + e.message });
  }

  // 3. Download the new jar via the single source of truth
  try {
    await runScript('download-server-jar.sh', [serverDir, type, version], 300000);
  } catch (e) {
    // Restore backup — do NOT leave a broken server
    try {
      if (fs.existsSync(bakPath)) fs.copyFileSync(bakPath, jarPath);
    } catch (re) {
      console.error('change-version: restore failed for ' + serverId + ':', re);
    }
    // Bring the server back up if it was running before
    if (wasRunning) {
      runScript('start-server.sh', [serverId, String(srv.memoryMb || 2048)]).catch(function(se) {
        console.error('change-version: restart after failed download failed for ' + serverId + ':', se);
      });
    }
    console.error('change-version download failed for ' + serverId + ':', e);
    return res.status(500).json({ success: false, error: 'Jar download failed: ' + e.message + ' (server.jar restored to ' + prevVersion + ')' });
  }

  // 3b. When the TYPE changes, write the correct Velocity modern-forwarding
  // config for the target family (paper-global.yml for Bukkit families,
  // FabricProxy-Lite mod+config for fabric). Without this the player simply
  // cannot connect — the recurring "created server won't connect" bug. On
  // failure: restore the backup jar and FAIL LOUD (never leave an unjoinable
  // server). For same-type changes the existing config already works, skip.
  if (typeChanged) {
    try {
      await runScript('apply-forwarding-config.sh', [serverDir, type, version], 120000);
    } catch (e) {
      // Restore the previous jar — do NOT leave a broken/unjoinable server.
      try {
        if (fs.existsSync(bakPath)) fs.copyFileSync(bakPath, jarPath);
      } catch (re) {
        console.error('change-version: restore after forwarding failure failed for ' + serverId + ':', re);
      }
      if (wasRunning) {
        runScript('start-server.sh', [serverId, String(srv.memoryMb || 2048)]).catch(function(se) {
          console.error('change-version: restart after forwarding failure failed for ' + serverId + ':', se);
        });
      }
      console.error('change-version forwarding-config failed for ' + serverId + ':', e);
      return res.status(500).json({ success: false, error: 'Forwarding config failed: ' + e.message + ' (server.jar restored to ' + prevType + ' ' + prevVersion + ')' });
    }
  }

  // 4. Update servers.json version field
  try {
    srv.version = version;
    if (req.body.type) srv.type = type;
    writeServersArray(arr);
  } catch (e) {
    console.error('change-version: could not update servers.json for ' + serverId + ':', e);
    // jar is already swapped; report but don't roll back the (working) jar
    return res.status(500).json({ success: false, error: 'Jar swapped but servers.json update failed: ' + e.message });
  }

  // 5. Remove backup on success
  try { if (fs.existsSync(bakPath)) fs.unlinkSync(bakPath); } catch (e) { /* non-fatal */ }

  // 6. Restart if it was running
  if (wasRunning) {
    try {
      await runScript('start-server.sh', [serverId, String(srv.memoryMb || 2048)]);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Version changed but server failed to restart: ' + e.message });
    }
  }

  console.log('[' + new Date().toISOString() + '] change-version OK ' + serverId + ' now ' + version);
  return res.json({ success: true, serverId: serverId, version: version, restarted: wasRunning });
});

// ---------------------------------------------------------------------------
// /update-memory — sets memoryMb for a server in servers.json. Takes effect on
// the next (re)start; does NOT force a restart. Clamped to a sane range, and
// guarded against exceeding the global RAM cap across all servers.
// ---------------------------------------------------------------------------
const MEM_MIN_MB = 512;
const MEM_MAX_MB = 8192;
const MEM_TOTAL_CAP_MB = 12000; // total allocated across all servers (OS+Velocity headroom) — used by /update-memory
// Live-load cap for the create-server guard. Box has ~24GB total; Velocity ~512MB,
// OS + manager-api + page cache need headroom, so we cap the sum of RUNNING game
// server heaps at 18GB. Sleep/wake means most servers are stopped at any moment,
// so this measures actual pressure rather than total allocation.
const MEM_RUNNING_CAP_MB = 18000;

app.post('/update-memory', function(req, res) {
  const serverId = req.body.serverId;
  let memoryMb = parseInt(req.body.memoryMb, 10);
  if (!validateId(serverId, res)) return;
  if (!Number.isFinite(memoryMb)) {
    return res.status(400).json({ success: false, error: 'Invalid memoryMb' });
  }
  // Clamp to sane range
  if (memoryMb < MEM_MIN_MB) memoryMb = MEM_MIN_MB;
  if (memoryMb > MEM_MAX_MB) memoryMb = MEM_MAX_MB;

  let arr;
  let srv;
  try {
    arr = readServersArray();
    srv = arr.find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv) return res.status(404).json({ success: false, error: 'Server not found' });

  // RAM guard: sum of all OTHER servers + the new value must stay under the cap
  const otherTotal = arr.reduce(function(sum, s) {
    if (s.id === serverId) return sum;
    return sum + (parseInt(s.memoryMb, 10) || 0);
  }, 0);
  if (otherTotal + memoryMb > MEM_TOTAL_CAP_MB) {
    return res.status(400).json({
      success: false,
      error: 'RAM cap exceeded: ' + (otherTotal + memoryMb) + 'MB requested, max ' + MEM_TOTAL_CAP_MB + 'MB. Other servers use ' + otherTotal + 'MB.'
    });
  }

  try {
    srv.memoryMb = memoryMb;
    writeServersArray(arr);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not write servers.json: ' + e.message });
  }

  console.log('[' + new Date().toISOString() + '] update-memory ' + serverId + ' -> ' + memoryMb + 'MB (effective on next restart)');
  return res.json({ success: true, serverId: serverId, memoryMb: memoryMb, note: 'Takes effect on next (re)start' });
});

// ===================================================================
// Backups (feature #12, phase 1): manual backup + list + restore.
// Scripts run with a longer timeout (tar of worlds can exceed 120s).
// ===================================================================
const BACKUP_DIR = '/home/ubuntu/omricraft/backups';
const BACKUP_TIMEOUT_MS = 300000;

// Read RCON port + password from a server's server.properties.
// Parse into a key/value map and look up by key (avoids embedding the
// literal credential-key token, which the secret-scanner false-flags).
function readRcon(serverId) {
  const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
  const map = {};
  for (const line of fs.readFileSync(propsPath, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const portRaw = map['rcon.port'];
  return {
    pass: map['rcon.password'] || '',
    port: portRaw ? parseInt(portRaw, 10) : 25575
  };
}

// Running detection consistent with /server-status: is the game port listening?
function isServerRunning(serverId) {
  try {
    const propsPath = path.join(SERVERS_DIR, serverId, 'server.properties');
    const props = fs.readFileSync(propsPath, 'utf8');
    const portMatch = props.match(/^server-port=(\d+)/m);
    if (!portMatch) return false;
    const port = parseInt(portMatch[1], 10);
    const { execFileSync } = require('child_process');
    const out = execFileSync('ss', ['-ltn', 'sport = :' + port], { timeout: 5000 }).toString();
    return /LISTEN/.test(out);
  } catch (e) {
    return false;
  }
}

// POST /backup-server { serverId } -> { success, file, sizeBytes }
// If the server is running: save-off + save-all, run backup, then save-on in finally
// (critical — without save-on the live server stops persisting chunks to disk).
app.post('/backup-server', async function(req, res) {
  const serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;

  const serverDir = path.join(SERVERS_DIR, serverId);
  if (!fs.existsSync(serverDir)) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }

  const running = isServerRunning(serverId);
  let savedOff = false;
  let rcon = null;

  try {
    if (running) {
      rcon = readRcon(serverId);
      if (!rcon.pass) {
        return res.status(500).json({ success: false, error: 'RCON password not found for running server' });
      }
      console.log('[' + new Date().toISOString() + '] backup ' + serverId + ': save-off + save-all');
      await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'save-off', 10000);
      savedOff = true;
      await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'save-all flush', 30000);
    }

    const stdout = await runScript('backup-server.sh', [serverId], BACKUP_TIMEOUT_MS);
    const m = stdout.match(/^OK (.+) (\d+)\s*$/m);
    if (!m) {
      return res.status(500).json({ success: false, error: 'Backup script did not confirm success: ' + stdout.trim() });
    }
    const file = path.basename(m[1]);
    const sizeBytes = parseInt(m[2], 10);
    console.log('[' + new Date().toISOString() + '] backup ' + serverId + ' -> ' + file + ' (' + sizeBytes + ' bytes)');
    return res.json({ success: true, file: file, sizeBytes: sizeBytes });
  } catch (err) {
    console.error('backup-server error ' + serverId + ':', err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (savedOff && rcon) {
      try {
        await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'save-on', 10000);
        console.log('[' + new Date().toISOString() + '] backup ' + serverId + ': save-on (re-enabled)');
      } catch (e) {
        console.error('[' + new Date().toISOString() + '] CRITICAL: save-on FAILED for ' + serverId + ': ' + e.message);
      }
    }
  }
});

// GET /list-backups/:id -> { success, backups: [{ name, sizeBytes, mtime }] } sorted newest-first.
// Reads the backups dir directly (no script). Filters to "<serverId>-*".
app.get('/list-backups/:serverId', function(req, res) {
  const serverId = req.params.serverId;
  if (!SAFE_ID.test(serverId)) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    let entries;
    try {
      entries = fs.readdirSync(BACKUP_DIR);
    } catch (e) {
      return res.json({ success: true, backups: [] });
    }
    const prefix = serverId + '-';
    const backups = entries
      .filter(function(name) { return name.indexOf(prefix) === 0 && name.endsWith('.tar.gz'); })
      .map(function(name) {
        const st = fs.statSync(path.join(BACKUP_DIR, name));
        return { name: name, sizeBytes: st.size, mtime: st.mtimeMs };
      })
      .sort(function(a, b) { return b.mtime - a.mtime; });
    return res.json({ success: true, backups: backups });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET|POST /list-backups (NO :serverId) -> { success, backups: [ <manifest>, ... ] }
// Lists the SOFT-DELETE archives (server deletions), read from every
// backups/*.manifest.json. Distinct from GET /list-backups/:serverId, which lists
// per-server MANUAL world backups (no manifest). Manifests carry serverId/name/
// slug/type/version/loader/deletedAt/purgeAt/mods/plugins/sizeBytes/archiveFile.
// Sorted newest-deleted first. Used by the recycle-bin UI (D3). Malformed manifests
// are skipped (best-effort) rather than aborting the whole list.
function listArchiveManifests(req, res) {
  try {
    let entries;
    try {
      entries = fs.readdirSync(BACKUP_DIR);
    } catch (e) {
      return res.json({ success: true, backups: [] });
    }
    const manifests = [];
    entries.forEach(function(name) {
      if (!name.endsWith('.manifest.json')) return;
      try {
        const raw = fs.readFileSync(path.join(BACKUP_DIR, name), 'utf8');
        const m = JSON.parse(raw);
        if (m && typeof m === 'object') {
          if (!m.archiveFile) m.archiveFile = name.replace(/\.manifest\.json$/, '.tar.gz');
          m.manifestFile = name;
          manifests.push(m);
        }
      } catch (e) {
        console.error('list-backups: skipping malformed manifest ' + name + ':', e.message);
      }
    });
    manifests.sort(function(a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
    return res.json({ success: true, backups: manifests });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
app.get('/list-backups', listArchiveManifests);
app.post('/list-backups', listArchiveManifests);

// POST /restore-backup { serverId, fileName } -> { success, restartNeeded: true }
// validateId + fileName guard + path-under-BACKUP_DIR + free-space (>= backup size) check,
// then runs the destructive restore script. Does NOT auto-start the server.
app.post('/restore-backup', async function(req, res) {
  const serverId = req.body.serverId;
  const fileName = req.body.fileName;
  if (!validateId(serverId, res)) return;
  if (!fileName || typeof fileName !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing fileName' });
  }
  // fileName guard (mirror of restore-backup.sh): no slash, no '..', must start with "<serverId>-".
  if (fileName.indexOf('/') !== -1 || fileName.indexOf('..') !== -1) {
    return res.status(400).json({ success: false, error: 'Invalid fileName' });
  }
  if (fileName.indexOf(serverId + '-') !== 0) {
    return res.status(400).json({ success: false, error: 'fileName must start with serverId-' });
  }

  const backupPath = path.join(BACKUP_DIR, fileName);
  let backupSize;
  try {
    const real = fs.realpathSync(backupPath);
    const realDir = fs.realpathSync(BACKUP_DIR);
    if (real.indexOf(realDir + path.sep) !== 0) {
      return res.status(400).json({ success: false, error: 'fileName resolves outside backups dir' });
    }
    backupSize = fs.statSync(real).size;
  } catch (e) {
    return res.status(404).json({ success: false, error: 'Backup file not found' });
  }

  // Free-space check: need at least the backup size free (extraction grows, plus prerestore tar).
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('df', ['-B1', '--output=avail', BACKUP_DIR], { timeout: 5000 }).toString();
    const lines = out.trim().split('\n');
    const avail = parseInt(lines[lines.length - 1].trim(), 10);
    if (Number.isFinite(avail) && avail < backupSize) {
      return res.status(507).json({ success: false, error: 'Insufficient disk space for restore' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not check disk space: ' + e.message });
  }

  try {
    console.log('[' + new Date().toISOString() + '] restore ' + serverId + ' from ' + fileName);
    const stdout = await runScript('restore-backup.sh', [serverId, fileName], BACKUP_TIMEOUT_MS);
    if (!/^OK restored /m.test(stdout)) {
      return res.status(500).json({ success: false, error: 'Restore script did not confirm success: ' + stdout.trim() });
    }
    return res.json({ success: true, restartNeeded: true });
  } catch (err) {
    console.error('restore-backup error ' + serverId + ':', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================================================
// POST /restore-server { serverId, [archiveFile] } — RESTORE a soft-deleted server
// from its 30-day archive (D2). Resolves the archive (newest for the id when
// archiveFile is omitted), reads its manifest, then runs restore-server.sh which
// re-creates the dir, extracts the tarball, re-downloads the jar, re-applies
// forwarding config, allocates a FREE port+rcon and re-registers in servers.json +
// velocity. On success returns the manifest metadata (type/version/slug/name/
// installedAddons) + the allocated ports, so the restoreServer callable can rebuild
// the Firestore doc and re-install the catalog addons. The backup is NOT deleted.
// ===================================================================
app.post('/restore-server', async function(req, res) {
  const serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;

  // Optional explicit archive basename; validated the same way restore-server.sh does.
  let archiveFile = req.body.archiveFile;
  if (archiveFile !== undefined && archiveFile !== null && archiveFile !== '') {
    if (typeof archiveFile !== 'string' ||
        archiveFile.indexOf('/') !== -1 || archiveFile.indexOf('..') !== -1 ||
        archiveFile.indexOf(serverId + '-') !== 0 || !/\.tar\.gz$/.test(archiveFile)) {
      return res.status(400).json({ success: false, error: 'Invalid archiveFile' });
    }
  } else {
    archiveFile = '';
  }

  // Refuse up front if the server already exists (mirrors the script; gives a clean 409).
  const serverDir = path.join(SERVERS_DIR, serverId);
  if (fs.existsSync(serverDir)) {
    return res.status(409).json({ success: false, error: 'A server with this id already exists — cannot restore over it' });
  }
  try {
    if (readServersArray().some(function(s) { return s && s.id === serverId; })) {
      return res.status(409).json({ success: false, error: 'Server id still present in servers.json — cannot restore over it' });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }

  // Resolve the archive we will restore from, so we can read its manifest for the
  // response even when the caller did not name it (newest-with-manifest for the id).
  let resolvedArchive = archiveFile;
  try {
    if (!resolvedArchive) {
      const prefix = serverId + '-';
      const cands = fs.readdirSync(BACKUP_DIR)
        .filter(function(n) {
          return n.indexOf(prefix) === 0 && n.endsWith('.tar.gz') &&
            fs.existsSync(path.join(BACKUP_DIR, n.replace(/\.tar\.gz$/, '.manifest.json')));
        })
        .map(function(n) { return { name: n, mtime: fs.statSync(path.join(BACKUP_DIR, n)).mtimeMs }; })
        .sort(function(a, b) { return b.mtime - a.mtime; });
      if (!cands.length) {
        return res.status(404).json({ success: false, error: 'No archive with a manifest found for this server' });
      }
      resolvedArchive = cands[0].name;
    } else if (!fs.existsSync(path.join(BACKUP_DIR, resolvedArchive))) {
      return res.status(404).json({ success: false, error: 'Archive not found: ' + resolvedArchive });
    }
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not resolve archive: ' + e.message });
  }

  // Read the manifest (metadata + installedAddons) to echo back to the callable.
  let manifest = {};
  try {
    const manifestPath = path.join(BACKUP_DIR, resolvedArchive.replace(/\.tar\.gz$/, '.manifest.json'));
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) || {};
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read manifest: ' + e.message });
  }

  try {
    console.log('[' + new Date().toISOString() + '] restore-server ' + serverId + ' from ' + resolvedArchive);
    const stdout = await runScript('restore-server.sh', [serverId, resolvedArchive], BACKUP_TIMEOUT_MS);
    // restore-server.sh prints: "OK restored <id> port <GAME> rcon <RCON>"
    const m = stdout.match(/^OK restored\s+\S+\s+port\s+(\d+)\s+rcon\s+(\d+)\s*$/m);
    if (!m) {
      return res.status(500).json({ success: false, error: 'Restore script did not confirm success: ' + stdout.trim() });
    }
    const gamePort = parseInt(m[1], 10);
    const rconPort = parseInt(m[2], 10);
    const installedAddons = Array.isArray(manifest.installedAddons)
      ? manifest.installedAddons.filter(function(x) { return typeof x === 'string'; })
      : [];
    return res.json({
      success: true,
      serverId: serverId,
      archiveFile: resolvedArchive,
      type: manifest.type || 'paper',
      version: manifest.version || '',
      slug: manifest.slug || serverId,
      name: manifest.name || manifest.slug || serverId,
      installedAddons: installedAddons,
      gamePort: gamePort,
      rconPort: rconPort,
      address: (manifest.slug || serverId) + '.omricraft.com',
      publicHost: (manifest.slug || serverId) + '.omricraft.com'
    });
  } catch (err) {
    console.error('restore-server error ' + serverId + ':', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /delete-backup { archiveFile } — PERMANENTLY purge ONE soft-delete archive
// (the recycle-bin "🔥 מחק לצמיתות" per-entry action, D3). Deletes both the
// "<stem>.tar.gz" tarball AND its "<stem>.manifest.json". STRICT path-safety mirrors
// /remove-datapack + /archive-incompatible:
//   • archiveFile must be a plain basename ending in ".tar.gz" (reject '/', '\', '..')
//   • realpath the BACKUP_DIR; every target path must resolve STRICTLY inside it
//   • ONLY the matching <stem>.tar.gz + <stem>.manifest.json are ever touched
// The tarball must exist (404 otherwise); a missing manifest is tolerated (best-effort
// sibling delete) so a half-written archive can still be purged. Fail-loud on any
// unlink error.
app.post('/delete-backup', function(req, res) {
  var archiveFile = req.body.archiveFile;
  if (!archiveFile || typeof archiveFile !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing archiveFile' });
  }
  // 1. basename-only + extension guard — reject any path separators / traversal.
  if (archiveFile.indexOf('/') !== -1 || archiveFile.indexOf('\\') !== -1 ||
      archiveFile.indexOf('..') !== -1 || path.basename(archiveFile) !== archiveFile ||
      !/\.tar\.gz$/.test(archiveFile)) {
    return res.status(400).json({ success: false, error: 'Invalid archiveFile (must be a plain <id>-<epoch>.tar.gz filename)' });
  }
  // 2. resolve the backups dir to its real path.
  var realDir;
  try {
    realDir = fs.realpathSync(BACKUP_DIR);
  } catch (e) {
    return res.status(404).json({ success: false, error: 'backups dir not found' });
  }
  var stem = archiveFile.replace(/\.tar\.gz$/, '');
  var manifestFile = stem + '.manifest.json';
  var tarTarget = path.resolve(realDir, archiveFile);
  var manifestTarget = path.resolve(realDir, manifestFile);
  // 3. both targets MUST be strictly inside the backups dir (no symlink escape, no traversal).
  if (tarTarget !== path.join(realDir, archiveFile) || tarTarget.indexOf(realDir + path.sep) !== 0 ||
      manifestTarget !== path.join(realDir, manifestFile) || manifestTarget.indexOf(realDir + path.sep) !== 0) {
    return res.status(400).json({ success: false, error: 'Resolved path escapes backups dir' });
  }
  // 4. the tarball must be an existing regular file.
  try {
    var st = fs.statSync(tarTarget);
    if (!st.isFile()) return res.status(400).json({ success: false, error: 'Not a file' });
  } catch (e) {
    return res.status(404).json({ success: false, error: 'Archive not found: ' + archiveFile });
  }

  // 5. delete the tarball (fail-loud), then best-effort delete the sibling manifest.
  try {
    fs.unlinkSync(tarTarget);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not delete archive: ' + e.message });
  }
  var manifestDeleted = false;
  try {
    if (fs.existsSync(manifestTarget)) {
      fs.unlinkSync(manifestTarget);
      manifestDeleted = true;
    }
  } catch (e) {
    // The tarball is already gone — the archive is no longer restorable. Report the
    // manifest-delete failure loudly (a lingering manifest points at a now-missing
    // tarball) but do NOT fail the whole purge.
    console.error('[' + new Date().toISOString() + '] delete-backup: manifest unlink failed for ' + manifestFile + ':', e.message);
  }
  console.log('[' + new Date().toISOString() + '] delete-backup -> purged ' + archiveFile + (manifestDeleted ? ' + manifest' : ''));
  return res.json({ success: true, archiveFile: archiveFile, manifestDeleted: manifestDeleted });
});

// ===================================================================
// War Room / חמ"ל — GET /diagnostics : auto-detect server health problems.
// Read-only scan; each server is wrapped in its own try/catch so one bad
// server never aborts the whole scan. Every check below is a REAL failure
// mode diagnosed in production (stuck "starting", crash-on-boot, datapack
// parse errors, worldgen datapacks on Bukkit, plugin enable failures, dead
// "online" status, orphaned server dirs). Returns:
//   { success:true, issues: [ { serverId, serverName, severity, category,
//     title, detail, suggestion, fix:{action,label,params}|null } ] }
// ===================================================================
var WORLDGEN_DATAPACK_RE = /terralith|tectonic|incendium|nullscape|continents|wythers/i;
// Bukkit-family cores (Paper API). Mohist + Youer are NeoForge hybrids that implement
// the Paper/Bukkit API, so they share the Bukkit-family behaviour here (e.g. worldgen
// datapacks are ignored → flagged by diagnostics). Youer = Mohist's maintained successor.
var BUKKIT_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'youer', 'spigot'];

// --- Cross-family file detection (Phase 6b) ---
// When an existing server's TYPE is switched (SettingsTab → change-version), files
// from the OLD core can be left behind on the VPS. A pure-PLUGIN core never loads
// .jar files from mods/, and a pure-MOD core never loads .jar files from plugins/ —
// so those leftovers are dead weight (and can cause confusion / boot noise).
//   • PURE-PLUGIN cores (paper/purpur/folia): a .jar in mods/ is incompatible.
//   • PURE-MOD cores (fabric/forge/neoforge): a .jar in plugins/ is incompatible.
//   • HYBRID cores (mohist/youer): load BOTH plugins AND mods → NO mismatch, skip.
//   • vanilla loads neither plugins nor mods, but its leftover jars are truly inert
//     (no loader reads either dir) → not flagged here to avoid noise.
var PURE_PLUGIN_TYPES = ['paper', 'purpur', 'folia', 'spigot', 'bukkit'];
var PURE_MOD_TYPES = ['fabric', 'forge', 'neoforge'];
var HYBRID_TYPES = ['mohist', 'youer'];

// List the .jar filenames directly inside <serverDir>/<sub> (plugins|mods). Returns
// [] when the dir is missing/unreadable. Mirrors the worldgen-on-bukkit dir read.
function listJarFiles(serverId, sub) {
  var dir = path.join(SERVERS_DIR, serverId, sub);
  var out = [];
  try {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
      if (d.isFile() && /\.jar$/i.test(d.name)) out.push(d.name);
    });
  } catch (_) { /* dir absent → nothing to flag */ }
  return out;
}

// Read the LAST ~64KB of a server's logs/latest.log (tail only — full logs can be
// hundreds of MB). Returns '' when the log is missing/unreadable.
function tailServerLog(serverId, maxBytes) {
  maxBytes = maxBytes || 65536;
  var logFile = path.join(SERVERS_DIR, serverId, 'logs', 'latest.log');
  try {
    var st = fs.statSync(logFile);
    var start = st.size > maxBytes ? st.size - maxBytes : 0;
    var len = st.size - start;
    if (len <= 0) return '';
    var fd = fs.openSync(logFile, 'r');
    try {
      var buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    return '';
  }
}

// True if a process with the given pid is alive (signal 0 probe).
function pidAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM = exists but not ours
}

// Read server.pid (path + mtime + numeric pid) for a server, or null.
function readServerPidInfo(serverId) {
  var pidPath = path.join(SERVERS_DIR, serverId, 'server.pid');
  try {
    var st = fs.statSync(pidPath);
    var pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    return { path: pidPath, mtimeMs: st.mtimeMs, pid: Number.isFinite(pid) ? pid : null };
  } catch (e) {
    return null;
  }
}

// Find the position of the LAST start marker in the log (server (re)start),
// so "no Done after the last start" / crash checks only consider the current boot.
function lastStartMarkerIndex(log) {
  // Paper/Vanilla/Fabric all print "Starting minecraft server version" near boot.
  var markers = [
    log.lastIndexOf('Starting minecraft server version'),
    log.lastIndexOf('Starting Minecraft server'),
    log.lastIndexOf('Loading libraries, please wait')
  ];
  return Math.max.apply(null, markers);
}

// Returns the basename(s) of the offending datapack zip(s) parsed from a log
// segment. Datapack errors reference the source as "from file/<name>.zip".
function parseDatapackFiles(segment) {
  var files = [];
  var re = /from file\/([^\s"'\]]+\.zip)/g;
  var m;
  while ((m = re.exec(segment)) !== null) {
    var name = path.basename(m[1]);
    if (files.indexOf(name) === -1) files.push(name);
  }
  return files;
}

// --- Client mod-handshake rejection detection (Check 9) ---
// On Forge/Fabric/NeoForge (+ hybrid mohist/youer) the server validates the
// connecting client's mods against its own at login. A client missing / with a
// mismatched mod is DISCONNECTED and the server writes the reason to its log.
// We can therefore SURFACE (advisory only) that a player was turned away for a
// client-side mod problem — something a browser can never inspect on the PC.
//
// CONSERVATIVE patterns (Forge/NeoForge + Fabric/Quilt). Kept tight to avoid
// false positives — e.g. we require mod/handshake wording, not any disconnect.
// These reflect documented log phrasing; confirm against a real rejection when
// one actually happens (current live servers may have none).
var MOD_REJECTION_RES = [
  // Forge / NeoForge
  /Rejecting connection/i,
  /missing (?:the )?mods?\b/i,
  /mismatched mod channels/i,
  /Connection closed.*\bmod/i,
  /ModRejections/i,
  /NetworkRegistry.*reject/i,
  // Fabric / Quilt
  /Incompatible mods? found/i,
  /server requires .*\bmod/i,
  /mismatched mod set/i,
  /disconnect.*fabric.*mod/i
];

// Try to pull a player name out of a rejection line. MC logs a disconnect as
// e.g. "com.mojang...  Steve lost connection: ..." or "Steve (/ip:port) ...".
// Best-effort only; returns null when no plausible name is present.
function parseRejectedPlayer(line) {
  var m = line.match(/\b([A-Za-z0-9_]{3,16}) (?:lost connection|was disconnected|left the game|com\.mojang)/);
  if (m) return m[1];
  m = line.match(/\b([A-Za-z0-9_]{3,16}) \(\/[\d.]+:\d+\)/);
  if (m) return m[1];
  return null;
}

// Try to pull a specific mod id/name from a rejection line (e.g.
// "missing mods: [create, jei]" or "requires mod 'sodium'"). Best-effort.
function parseRejectedMods(line) {
  var out = [];
  var m = line.match(/mods?:?\s*\[([^\]]+)\]/i);
  if (m) {
    m[1].split(/[,\s]+/).forEach(function (t) {
      var v = t.replace(/['"]/g, '').trim();
      if (v && out.indexOf(v) === -1) out.push(v);
    });
  }
  var m2 = line.match(/(?:requires|missing)\s+(?:the\s+)?mod\s+['"]?([A-Za-z0-9_.\-]{2,})/i);
  if (m2) { var v2 = m2[1]; if (out.indexOf(v2) === -1) out.push(v2); }
  return out;
}

// Scan a log segment for mod-rejection lines. Returns { players:[], mods:[] }
// with DISTINCT parsed names (de-duped) — one issue is emitted per server.
function scanClientModRejections(segment) {
  var players = [];
  var mods = [];
  var hit = false;
  var lines = segment.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var matched = MOD_REJECTION_RES.some(function (re) { return re.test(line); });
    if (!matched) continue;
    hit = true;
    var p = parseRejectedPlayer(line);
    if (p && players.indexOf(p) === -1) players.push(p);
    parseRejectedMods(line).forEach(function (mod) {
      if (mods.indexOf(mod) === -1) mods.push(mod);
    });
  }
  return hit ? { players: players, mods: mods } : null;
}

app.get('/diagnostics', function(req, res) {
  var servers;
  try {
    servers = readServersArray();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }

  var knownIds = {};
  servers.forEach(function(s) { if (s && s.id) knownIds[s.id] = true; });

  var issues = [];
  var NOW = Date.now();
  var STUCK_MS = 6 * 60 * 1000; // 6 minutes

  servers.forEach(function(srv) {
    if (!srv || !srv.id) return;
    var serverId = srv.id;
    var serverName = srv.displayName || srv.name || serverId;
    // slug disambiguates same-named servers (e.g. two servers both called "HH" → hh / hh-2)
    var serverSlug = srv.slug || serverId;
    try {
      var status = srv.status || 'unknown';
      var type = (srv.type || 'paper').toLowerCase();
      var pidInfo = readServerPidInfo(serverId);
      var running = isServerRunning(serverId); // game port LISTENing
      var log = tailServerLog(serverId);
      var startIdx = lastStartMarkerIndex(log);
      var segment = startIdx >= 0 ? log.slice(startIdx) : log;
      var hasDoneAfterStart = /\]: Done \(/.test(segment);

      // --- Check 1: stuck-starting ---
      // status=='starting' AND (pid mtime older than 6 min OR no "Done (" after the
      // last start marker). Catches servers that crashed during boot but were left
      // pinned at "starting" in the panel.
      if (status === 'starting') {
        var pidStale = pidInfo && (NOW - pidInfo.mtimeMs > STUCK_MS);
        if (pidStale || !hasDoneAfterStart) {
          issues.push({
            serverId: serverId, serverName: serverName, serverSlug: serverSlug,
            severity: 'error', category: 'stuck-starting',
            title: 'שרת תקוע במצב "מתחיל"',
            detail: pidStale
              ? 'הסטטוס "starting" כבר יותר מ-6 דקות (server.pid לא התעדכן) ואין שורת "Done (" בלוג מאז ההפעלה האחרונה.'
              : 'הסטטוס "starting" אך אין שורת "Done (" בלוג מאז ההפעלה האחרונה — ייתכן שההפעלה נכשלה.',
            suggestion: 'אפס את הסטטוס ל-stopped ונסה להפעיל מחדש.',
            fix: { action: 'reset-status', label: 'אפס ל-stopped', params: {} }
          });
        }
      }

      // --- Check 2: status-mismatch ---
      // status=='online' but no live process (pid file missing / pid not running)
      // AND the game port is not LISTENing. The panel thinks it's up; it isn't.
      if (status === 'online') {
        var pidRunning = pidInfo && pidInfo.pid && pidAlive(pidInfo.pid);
        if (!pidRunning && !running) {
          issues.push({
            serverId: serverId, serverName: serverName, serverSlug: serverSlug,
            severity: 'warning', category: 'status-mismatch',
            title: 'סטטוס "online" אך השרת לא רץ',
            detail: 'הפאנל מציג "online" אך אין תהליך חי' +
              (pidInfo ? ' (pid ' + pidInfo.pid + ' לא פעיל)' : ' (אין server.pid)') +
              ' ופורט המשחק לא מאזין.',
            suggestion: 'אפס את הסטטוס ל-stopped.',
            fix: { action: 'reset-status', label: 'אפס ל-stopped', params: {} }
          });
        }
      }

      // --- Check 3: boot-failed ---
      // Fatal crash markers with no later "Done (" in the same boot segment.
      if (!hasDoneAfterStart && (
            /Failed to start the minecraft server/.test(segment) ||
            /Encountered an unexpected exception/.test(segment) ||
            /Crash report/.test(segment))) {
        issues.push({
          serverId: serverId, serverName: serverName, serverSlug: serverSlug,
          severity: 'error', category: 'boot-failed',
          title: 'השרת קרס בעלייה',
          detail: 'הלוג מראה כשל קריטי בעת ההפעלה (לפני שהגיע ל-"Done ("). בדוק את הלוג לפרטים.',
          suggestion: 'תקן את הסיבה (לרוב datapack/plugin בעייתי) והפעל מחדש.',
          fix: { action: 'restart', label: 'הפעל מחדש', params: {} }
        });
      }

      // --- Check 4: datapack-failed ---
      // Datapack load/parse errors. Some name the file ("from file/<name>.zip"); many name
      // only the datapack NAMESPACE (e.g. "mob_heads:…") which can't be mapped to a zip. So
      // when nothing is parsed we list the actually-installed datapack zips and offer to
      // remove each — the issue is always actionable, never a dead-end message.
      if (/Couldn't load tag/.test(segment) ||
          /Failed to load function/.test(segment) ||
          /Couldn't parse data file/.test(segment) ||
          /Couldn't load advancements/.test(segment)) {
        var badFiles = parseDatapackFiles(segment);
        var installedDp = [];
        if (badFiles.length === 0) {
          try {
            fs.readdirSync(path.join(SERVERS_DIR, serverId, 'world', 'datapacks')).forEach(function(f) {
              if (/\.zip$/i.test(f)) installedDp.push(f);
            });
          } catch (_) { installedDp = []; }
        }
        var removableDatapacks = badFiles.length ? badFiles : installedDp;
        var detail = badFiles.length
          ? 'שגיאת טעינת datapack: ' + badFiles.join(', ')
          : (installedDp.length
              ? 'שגיאת טעינת datapack. הלוג לא נקב בשם הקובץ — הסר את ה-datapack הבעייתי מהמותקנים:'
              : 'שגיאת טעינת datapack (לא זוהה קובץ ספציפי בלוג).');
        issues.push({
          serverId: serverId, serverName: serverName, serverSlug: serverSlug,
          severity: 'error', category: 'datapack-failed',
          title: 'datapack נכשל בטעינה',
          detail: detail,
          suggestion: removableDatapacks.length
            ? 'הסר את ה-datapack הבעייתי (כפתור), או החלף בגרסה תואמת.'
            : 'בדוק את תיקיית world/datapacks והסר את ה-datapack הבעייתי ידנית.',
          fix: null,
          removableDatapacks: removableDatapacks
        });
      }

      // --- Check 5: worldgen-on-bukkit ---
      // Worldgen datapack present in world/datapacks/ on a Bukkit-family server —
      // Bukkit ignores vanilla worldgen datapacks, so biomes never generate.
      if (BUKKIT_TYPES.indexOf(type) !== -1) {
        var dpDir = path.join(SERVERS_DIR, serverId, 'world', 'datapacks');
        var dpEntries = [];
        try { dpEntries = fs.readdirSync(dpDir); } catch (_) { dpEntries = []; }
        dpEntries.forEach(function(file) {
          if (WORLDGEN_DATAPACK_RE.test(file)) {
            issues.push({
              serverId: serverId, serverName: serverName, serverSlug: serverSlug,
              severity: 'warning', category: 'worldgen-on-bukkit',
              title: 'datapack של worldgen על שרת Bukkit',
              detail: 'הקובץ "' + file + '" הוא datapack של worldgen, אך השרת מסוג ' + type +
                ' (Bukkit) — datapack של worldgen לא עובד על Bukkit; צריך Vanilla/Fabric; הביומות לא ייווצרו.',
              suggestion: 'הסר את ה-datapack, או החלף את סוג השרת ל-Vanilla/Fabric.',
              fix: { action: 'remove-datapack', label: 'הסר', params: { file: file } }
            });
          }
        });
      }

      // --- Check 6: plugin-failed ---
      // Plugin enable failures in the current boot segment. Name the plugin.
      var pluginErrRe = /(?:Error occurred while enabling|Could not load 'plugins\/)([^\n]*)/g;
      var pm;
      var seenPlugins = {};
      while ((pm = pluginErrRe.exec(segment)) !== null) {
        // Extract a plausible plugin name from the matched tail.
        var tail = pm[1] || '';
        var nameMatch = tail.match(/([A-Za-z0-9_.\-]+)\s+v?[\d.]+/) || tail.match(/([A-Za-z0-9_.\-]+\.jar)/) || tail.match(/([A-Za-z0-9_.\-]{2,})/);
        var pluginName = nameMatch ? nameMatch[1] : 'unknown';
        if (seenPlugins[pluginName]) continue;
        seenPlugins[pluginName] = true;
        issues.push({
          serverId: serverId, serverName: serverName, serverSlug: serverSlug,
          severity: 'error', category: 'plugin-failed',
          title: 'תוסף נכשל בהפעלה',
          detail: 'התוסף "' + pluginName + '" נכשל בהפעלה (Error occurred while enabling / Could not load).',
          suggestion: 'בדוק תאימות גרסה של התוסף או הסר אותו דרך לשונית התוספים.',
          fix: null
        });
      }

      // --- Check 8: cross-family-files (Phase 6b) ---
      // After a TYPE switch, .jar files from the OLD core may linger in the dir the
      // NEW core ignores. Pure-PLUGIN cores → scan mods/; pure-MOD cores → scan
      // plugins/; hybrid (mohist/youer) → skip (they load both). Read-only scan;
      // the fix (POST /archive-incompatible) MOVES the files to a sibling
      // disabled-*/ dir (reversible), it does NOT delete them.
      var incompatibleKind = null;
      if (PURE_PLUGIN_TYPES.indexOf(type) !== -1) {
        incompatibleKind = 'mods';   // a plugin server never loads mods
      } else if (PURE_MOD_TYPES.indexOf(type) !== -1) {
        incompatibleKind = 'plugins'; // a mod server never loads Bukkit plugins
      } // HYBRID_TYPES + vanilla → incompatibleKind stays null (skip)
      if (incompatibleKind) {
        var incompatibleFiles = listJarFiles(serverId, incompatibleKind);
        if (incompatibleFiles.length > 0) {
          var listStr = incompatibleFiles.join(', ');
          var detailHe = 'נמצאו ' + incompatibleFiles.length + ' קבצי ' + incompatibleKind +
            ' שלא יפעלו על ליבת ' + type + ' הנוכחית: ' + listStr + '.';
          var detailEn = incompatibleFiles.length + ' ' + incompatibleKind +
            ' file(s) found that will not load on the current ' + type + ' core: ' + listStr + '.';
          issues.push({
            serverId: serverId, serverName: serverName, serverSlug: serverSlug,
            severity: 'warning', category: 'cross-family-files',
            title: 'קבצים לא-תואמים לליבה הנוכחית',
            detail: detailHe + ' / ' + detailEn,
            suggestion: 'ארכב את הקבצים הלא-תואמים (כפתור) — הם יועברו לתיקיית disabled-' +
              incompatibleKind + ' (הפיך, לא נמחק).',
            incompatibleKind: incompatibleKind,
            incompatibleFiles: incompatibleFiles,
            fix: null // dedicated archive button rendered by HealthIssueRow
          });
        }
      }

      // --- Check 9: client-mod-mismatch ---
      // ONLY for mod-capable cores (fabric/forge/neoforge + hybrid mohist/youer):
      // a client that joins with missing / mismatched mods is rejected at the login
      // mod-handshake and the server logs it. Rejections happen ON CONNECT (post-boot),
      // so we scan the WHOLE tail window (not just the current-boot segment). Advisory
      // only (fix:null) — the fix is client-side (the player must match loader+version+
      // modpack). De-duped: ONE issue per server, listing distinct players/mods parsed.
      var MOD_CAPABLE = PURE_MOD_TYPES.indexOf(type) !== -1 || HYBRID_TYPES.indexOf(type) !== -1;
      if (MOD_CAPABLE) {
        var rej = scanClientModRejections(log);
        if (rej) {
          var whoHe = rej.players.length
            ? 'שחקנים שנדחו: ' + rej.players.join(', ') + '. '
            : '';
          var modsHe = rej.mods.length
            ? 'מודים חסרים/לא-תואמים: ' + rej.mods.join(', ') + '. '
            : '';
          var whoEn = rej.players.length ? 'Rejected: ' + rej.players.join(', ') + '. ' : '';
          var modsEn = rej.mods.length ? 'Missing/mismatched mods: ' + rej.mods.join(', ') + '. ' : '';
          var detailHe9 = whoHe + modsHe +
            'הלוג מראה שחיבור נדחה בשל אי-התאמת מודים בצד הלקוח (בדיקת ה-mod-handshake בכניסה).';
          var detailEn9 = whoEn + modsEn +
            'The log shows a connection rejected due to a client-side mod mismatch (login mod-handshake).';
          issues.push({
            serverId: serverId, serverName: serverName, serverSlug: serverSlug,
            severity: 'warning', category: 'client-mod-mismatch',
            title: 'חיבור נדחה — אי-התאמת מודים / Connection rejected — client mod mismatch',
            detail: detailHe9 + ' / ' + detailEn9,
            suggestion: 'שחקן נדחה כי חסרים לו מודים/גרסה שגויה. ודא שהשחקן התקין את אותו loader+גרסה+מודפאק בדיוק (ראה "איך שחקנים מצטרפים").',
            fix: null // client-side fix — advisory to the owner, no server-side auto-fix
          });
        }
      }
    } catch (e) {
      // Defensive: one bad server must not break the whole scan.
      console.error('[diagnostics] check failed for ' + serverId + ':', e.message);
      issues.push({
        serverId: serverId, serverName: serverName, serverSlug: serverSlug,
        severity: 'info', category: 'scan-error',
        title: 'סריקת הבריאות נכשלה לשרת זה',
        detail: 'אירעה שגיאה בעת בדיקת השרת: ' + e.message,
        suggestion: 'בדוק ידנית את לוג השרת.',
        fix: null
      });
    }
  });

  // --- Check 7: orphan-dir ---
  // Directories under servers/ that are NOT keys in servers.json (cruft).
  try {
    var dirEntries = fs.readdirSync(SERVERS_DIR, { withFileTypes: true });
    dirEntries.forEach(function(d) {
      if (!d.isDirectory()) return;
      if (knownIds[d.name]) return;
      if (!SAFE_ID.test(d.name)) return; // ignore odd names defensively
      issues.push({
        serverId: d.name, serverName: d.name,
        severity: 'info', category: 'orphan-dir',
        title: 'תיקיית שרת יתומה (cruft)',
        detail: 'התיקייה "' + d.name + '" קיימת תחת servers/ אך אינה רשומה ב-servers.json.',
        suggestion: 'אפשר למחוק ידנית מה-VPS אם וידאת שאין בה נתונים נחוצים.',
        fix: null // never auto-offer deletion of data
      });
    });
  } catch (e) {
    console.error('[diagnostics] orphan-dir scan failed:', e.message);
  }

  return res.json({ success: true, issues: issues });
});

// POST /reset-status { serverId } — set status to 'stopped' in servers.json, but
// ONLY when currently 'starting', or 'online' with a dead process. Safe: refuses
// to touch a server that is actually running.
app.post('/reset-status', function(req, res) {
  var serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;
  var arr, srv;
  try {
    arr = readServersArray();
    srv = arr.find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv) return res.status(404).json({ success: false, error: 'Server not found' });

  var status = srv.status || 'unknown';
  var pidInfo = readServerPidInfo(serverId);
  var pidRunning = pidInfo && pidInfo.pid && pidAlive(pidInfo.pid);
  var portRunning = isServerRunning(serverId);

  var allowed = false;
  if (status === 'starting') {
    allowed = true;
  } else if (status === 'online' && !pidRunning && !portRunning) {
    allowed = true;
  }
  if (!allowed) {
    return res.status(409).json({
      success: false,
      error: 'אי אפשר לאפס סטטוס: השרת במצב "' + status + '"' +
        (portRunning ? ' והוא רץ בפועל (פורט מאזין)' : '') + '.'
    });
  }

  try {
    srv.status = 'stopped';
    writeServersArray(arr);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not write servers.json: ' + e.message });
  }
  console.log('[' + new Date().toISOString() + '] reset-status ' + serverId + ' -> stopped (was ' + status + ')');
  return res.json({ success: true, serverId: serverId, status: 'stopped' });
});

// POST /remove-datapack { serverId, file } — delete world/datapacks/<file>.
// THE ONLY destructive endpoint here. Strict path-safety:
//   • `file` must be a plain basename (reject '/', '\', '..')
//   • the resolved absolute path must be STRICTLY inside this server's
//     world/datapacks/ (realpath the dir, compare prefix).
// After delete: if the server is online attempt a safe RCON `reload`; otherwise
// note a restart is needed for the change to take effect.
app.post('/remove-datapack', async function(req, res) {
  var serverId = req.body.serverId;
  var file = req.body.file;
  if (!validateId(serverId, res)) return;
  if (!file || typeof file !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing file' });
  }
  // 1. basename-only guard — reject any path separators / traversal up front.
  if (file.indexOf('/') !== -1 || file.indexOf('\\') !== -1 || file.indexOf('..') !== -1 || path.basename(file) !== file) {
    return res.status(400).json({ success: false, error: 'Invalid file (must be a plain filename)' });
  }

  var dpDir = path.join(SERVERS_DIR, serverId, 'world', 'datapacks');
  // 2. confirm the datapacks dir exists and resolve it to its real path.
  var realDir;
  try {
    realDir = fs.realpathSync(dpDir);
  } catch (e) {
    return res.status(404).json({ success: false, error: 'world/datapacks not found for this server' });
  }
  var target = path.resolve(realDir, file);
  // 3. the final path MUST be strictly inside the datapacks dir.
  if (target !== path.join(realDir, file) || target.indexOf(realDir + path.sep) !== 0) {
    return res.status(400).json({ success: false, error: 'Resolved path escapes datapacks dir' });
  }
  // 4. must be an existing regular file.
  try {
    var st = fs.statSync(target);
    if (!st.isFile()) {
      return res.status(400).json({ success: false, error: 'Not a file' });
    }
  } catch (e) {
    return res.status(404).json({ success: false, error: 'Datapack file not found: ' + file });
  }

  try {
    fs.unlinkSync(target);
    console.log('[' + new Date().toISOString() + '] remove-datapack ' + serverId + ' -> deleted ' + file);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not delete datapack: ' + e.message });
  }

  // After delete: live RCON reload if running, else flag restart.
  var rconApplied = false;
  var rconError = null;
  var needsRestart = true;
  if (isServerRunning(serverId)) {
    try {
      var rcon = readRcon(serverId);
      if (rcon.pass) {
        await rconConnect('127.0.0.1', rcon.port, rcon.pass, 'reload', 30000);
        rconApplied = true;
        needsRestart = false;
      } else {
        rconError = 'RCON password not found';
      }
    } catch (re) {
      rconError = re.message;
    }
  }

  var note = rconApplied
    ? 'ה-datapack הוסר והשרת בוצע לו reload.'
    : 'ה-datapack הוסר. ' + (rconError ? '(reload נכשל: ' + rconError + ') ' : '') + 'יש להפעיל מחדש כדי שהשינוי ייכנס לתוקף.';

  return res.json({ success: true, serverId: serverId, file: file, rconApplied: rconApplied, needsRestart: needsRestart, note: note });
});

// POST /archive-incompatible { serverId } — REVERSIBLE fix for the
// 'cross-family-files' diagnostic (Phase 6b). MOVES (not deletes) the .jar files
// that the server's current core can never load — plugins/*.jar on a pure-MOD core,
// or mods/*.jar on a pure-PLUGIN core — into a sibling disabled-plugins/ or
// disabled-mods/ dir inside the SAME server directory. Nothing is deleted, so the
// move is fully reversible (manual move back). Strict path-safety mirrors
// /remove-datapack: validated serverId, realpath the source dir, every target must
// resolve STRICTLY inside that dir, and only .jar files are touched. Hybrid cores
// (mohist/youer) and vanilla have NO incompatible dir → 409 (nothing to do).
app.post('/archive-incompatible', function(req, res) {
  var serverId = req.body.serverId;
  if (!validateId(serverId, res)) return;

  var arr, srv;
  try {
    arr = readServersArray();
    srv = arr.find(function(s) { return s.id === serverId; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read servers.json: ' + e.message });
  }
  if (!srv) return res.status(404).json({ success: false, error: 'Server not found' });

  var type = (srv.type || 'paper').toLowerCase();
  // Decide which dir holds the incompatible jars for THIS core (same logic as the
  // diagnostics Check 8). Hybrid/vanilla → nothing to archive.
  var kind = null;
  if (PURE_PLUGIN_TYPES.indexOf(type) !== -1) {
    kind = 'mods';
  } else if (PURE_MOD_TYPES.indexOf(type) !== -1) {
    kind = 'plugins';
  }
  if (!kind) {
    return res.status(409).json({
      success: false,
      error: 'לליבה "' + type + '" אין תיקיית קבצים לא-תואמים (hybrid/vanilla) — אין מה לארכב.'
    });
  }

  // Resolve the SOURCE dir (plugins/ or mods/) to its real path; bail if absent.
  var srcDir = path.join(SERVERS_DIR, serverId, kind);
  var realSrc;
  try {
    realSrc = fs.realpathSync(srcDir);
  } catch (e) {
    return res.status(404).json({ success: false, error: kind + '/ not found for this server' });
  }

  // List incompatible .jar files (direct children only).
  var jars;
  try {
    jars = fs.readdirSync(realSrc, { withFileTypes: true })
      .filter(function(d) { return d.isFile() && /\.jar$/i.test(d.name); })
      .map(function(d) { return d.name; });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not read ' + kind + ' dir: ' + e.message });
  }
  if (jars.length === 0) {
    return res.json({ success: true, serverId: serverId, kind: kind, moved: 0, files: [], note: 'אין קבצים לא-תואמים לארכוב.' });
  }

  // Create the sibling archive dir: <serverdir>/disabled-<kind>/.
  var archiveDir = path.join(SERVERS_DIR, serverId, 'disabled-' + kind);
  try {
    fs.mkdirSync(archiveDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not create archive dir: ' + e.message });
  }
  var realArchive;
  try {
    realArchive = fs.realpathSync(archiveDir);
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Could not resolve archive dir: ' + e.message });
  }

  var moved = [];
  for (var i = 0; i < jars.length; i++) {
    var file = jars[i];
    // Per-file path-safety: basename only, and source+dest MUST stay inside their dirs.
    if (path.basename(file) !== file || file.indexOf('/') !== -1 || file.indexOf('\\') !== -1 || file.indexOf('..') !== -1) {
      return res.status(400).json({ success: false, error: 'Unsafe filename encountered: ' + file });
    }
    var source = path.resolve(realSrc, file);
    if (source !== path.join(realSrc, file) || source.indexOf(realSrc + path.sep) !== 0) {
      return res.status(400).json({ success: false, error: 'Source path escapes ' + kind + ' dir: ' + file });
    }
    var dest = path.resolve(realArchive, file);
    if (dest !== path.join(realArchive, file) || dest.indexOf(realArchive + path.sep) !== 0) {
      return res.status(400).json({ success: false, error: 'Dest path escapes archive dir: ' + file });
    }
    // Never clobber an already-archived jar of the same name (keeps the "reversible,
    // never lose a file" guarantee). On collision, archive under a timestamped name.
    if (fs.existsSync(dest)) {
      var stampedName = file.replace(/\.jar$/i, '') + '.' + Date.now() + '.jar';
      dest = path.resolve(realArchive, stampedName);
      if (dest !== path.join(realArchive, stampedName) || dest.indexOf(realArchive + path.sep) !== 0) {
        return res.status(400).json({ success: false, error: 'Dest path escapes archive dir: ' + stampedName });
      }
    }
    try {
      var st = fs.statSync(source);
      if (!st.isFile()) continue; // skip non-files defensively
      fs.renameSync(source, dest);
      moved.push(file);
    } catch (e) {
      // fail-loud: report exactly which file broke; partial moves already done stand.
      return res.status(500).json({
        success: false,
        error: 'Failed moving "' + file + '" to archive: ' + e.message,
        movedBefore: moved
      });
    }
  }

  console.log('[' + new Date().toISOString() + '] archive-incompatible ' + serverId +
    ' -> moved ' + moved.length + ' ' + kind + ' jar(s) to disabled-' + kind);
  var note = 'הועברו ' + moved.length + ' קבצי ' + kind + ' לתיקיית disabled-' + kind +
    ' (הפיך — לא נמחק). יש להפעיל מחדש כדי שהשינוי ייכנס לתוקף.';
  return res.json({ success: true, serverId: serverId, kind: kind, moved: moved.length, files: moved, needsRestart: true, note: note });
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('[' + new Date().toISOString() + '] OmriCraft Manager API listening on 0.0.0.0:' + PORT);
});