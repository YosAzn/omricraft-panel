'use strict';

const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const PORT = parseInt(process.env.PORT || '3001', 10);
const MANAGER_API_KEY = process.env.MANAGER_API_KEY || '';
const SCRIPTS_DIR = '/home/ubuntu/omricraft/manager/scripts';
const SERVERS_DIR = '/home/ubuntu/omricraft/servers';
const SERVERS_JSON = '/home/ubuntu/omricraft/manager/servers.json';

if (!MANAGER_API_KEY) {
  console.error('FATAL: MANAGER_API_KEY env var is not set.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${MANAGER_API_KEY}`) {
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
      if (err) return reject(new Error(stderr || stdout || err.message));
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

// Check real running status by PID file
app.get('/server-status/:serverId', function(req, res) {
  const serverId = req.params.serverId;
  if (!SAFE_ID.test(serverId)) return res.status(400).json({ success: false, error: 'Invalid id' });
  const pidFile = path.join(SERVERS_DIR, serverId, 'server.pid');
  let running = false;
  try {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    if (pid) { process.kill(parseInt(pid), 0); running = true; }
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
  const maxPlayers = body.maxPlayers;
  const seed = body.seed;
  const ops = body.ops;
  const addons = body.addons;
  const icon = body.icon;
  const isPrivate = body.isPrivate === true;

  if (!validateId(serverId, res)) return;
  if (!validateId(slug, res)) return;
  if (!displayName || !version || !gamePort || !rconPort || !memoryMb) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
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
      isPrivate ? 'true' : 'false'
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
  try {
    await runScript('delete-server.sh', [serverId]);
    return res.json({ success: true, serverId: serverId });
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

app.listen(PORT, '0.0.0.0', function() {
  console.log('[' + new Date().toISOString() + '] OmriCraft Manager API listening on 0.0.0.0:' + PORT);
});