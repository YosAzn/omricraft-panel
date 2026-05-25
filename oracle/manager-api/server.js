'use strict';

const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3001', 10);
const MANAGER_API_KEY = process.env.MANAGER_API_KEY || '';
const SCRIPTS_DIR = '/home/ubuntu/omricraft/manager/scripts';
const SERVERS_JSON = '/home/ubuntu/omricraft/manager/servers.json';

if (!MANAGER_API_KEY) {
  console.error('FATAL: MANAGER_API_KEY env var is not set.');
  process.exit(1);
}

const app = express();
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${MANAGER_API_KEY}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

// Validate SERVER_ID / SLUG
const SAFE_ID = /^[a-z0-9_-]+$/;

function validateId(id, res) {
  if (!id || typeof id !== 'string' || !SAFE_ID.test(id)) {
    res.status(400).json({ success: false, error: `Invalid id: ${id}` });
    return false;
  }
  return true;
}

// Run a script with args
function runScript(scriptName, args, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    execFile('bash', [scriptPath, ...args], { timeout }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || stdout || err.message));
      }
      resolve(stdout);
    });
  });
}

// POST /create-server
app.post('/create-server', async (req, res) => {
  const { serverId, displayName, slug, type, version, gamePort, rconPort, memoryMb } = req.body;

  if (!validateId(serverId, res)) return;
  if (!validateId(slug, res)) return;
  if (!displayName || !version || !gamePort || !rconPort || !memoryMb) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    console.log(`[${new Date().toISOString()}] Creating server: ${serverId}`);
    await runScript('create-server.sh', [serverId, displayName, slug, type || 'paper', version, String(gamePort), String(rconPort), String(memoryMb)]);
    await runScript('start-server.sh', [serverId, String(memoryMb)]);

    // Wait a moment then register (server may still be starting but Velocity routing can be set)
    await runScript('register-server-in-velocity.sh', [serverId, slug, String(gamePort)]);

    return res.json({
      success: true,
      serverId,
      address: `${slug}.omricraft.com`,
      publicHost: `${slug}.omricraft.com`
    });
  } catch (err) {
    console.error(`create-server error:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /delete-server
app.post('/delete-server', async (req, res) => {
  const { serverId } = req.body;
  if (!validateId(serverId, res)) return;

  try {
    console.log(`[${new Date().toISOString()}] Deleting server: ${serverId}`);
    await runScript('delete-server.sh', [serverId]);
    return res.json({ success: true, serverId });
  } catch (err) {
    console.error(`delete-server error:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /servers
app.get('/servers', (req, res) => {
  try {
    if (!fs.existsSync(SERVERS_JSON)) {
      return res.json({ success: true, servers: [] });
    }
    const raw = fs.readFileSync(SERVERS_JSON, 'utf8');
    const servers = JSON.parse(raw);
    return res.json({ success: true, servers: Array.isArray(servers) ? servers : [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /start-server
app.post('/start-server', async (req, res) => {
  const { serverId, memoryMb } = req.body;
  if (!validateId(serverId, res)) return;
  if (!memoryMb) return res.status(400).json({ success: false, error: 'Missing memoryMb' });

  try {
    await runScript('start-server.sh', [serverId, String(memoryMb)]);
    return res.json({ success: true, serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /stop-server
app.post('/stop-server', async (req, res) => {
  const { serverId } = req.body;
  if (!validateId(serverId, res)) return;

  try {
    await runScript('stop-server.sh', [serverId]);
    return res.json({ success: true, serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /restart-server
app.post('/restart-server', async (req, res) => {
  const { serverId, memoryMb } = req.body;
  if (!validateId(serverId, res)) return;
  if (!memoryMb) return res.status(400).json({ success: false, error: 'Missing memoryMb' });

  try {
    await runScript('restart-server.sh', [serverId, String(memoryMb)]);
    return res.json({ success: true, serverId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[${new Date().toISOString()}] OmriCraft Manager API listening on 127.0.0.1:${PORT}`);
});
