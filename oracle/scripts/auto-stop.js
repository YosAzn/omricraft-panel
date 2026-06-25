#!/usr/bin/env node
/**
 * auto-stop.js — כיבוי שרתים ריקים אוטומטית
 * רץ כל 3 דקות (cron). אחרי 2 בדיקות רצופות = 6 דקות → כיבוי.
 */
const http = require('http');
const fs   = require('fs');

const API_KEY    = process.env.MANAGER_API_KEY;
if (!API_KEY) { console.error("[auto-stop] MANAGER_API_KEY missing from env"); process.exit(1); }
const STATE_FILE = '/tmp/omricraft-empty-state.json';
const THRESHOLD  = 2; // בדיקות עוקבות לפני כיבוי
// Start grace: never auto-stop a server within this window of it starting, even if
// empty. Lets players actually join, and — critically for seamless-wake — keeps a
// just-woken backend alive while the player is still held in the NanoLimbo world
// waiting for VelocityLimboHandler to transfer them in. Without this, a freshly-woken
// empty backend gets stopped out from under the transfer (the "started then stopped
// after a few seconds" bug).
const GRACE_MS    = 10 * 60 * 1000;
const SERVERS_DIR = '/home/ubuntu/omricraft/servers';

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Milliseconds since the server started, from its pid-file mtime (start-server.sh
// writes/reconciles server.pid at boot; stop-server.sh removes it). Infinity if
// unknown, so a server is never spared from a stop by accident.
function serverUptimeMs(sid) {
  try { return Date.now() - fs.statSync(SERVERS_DIR + '/' + sid + '/server.pid').mtimeMs; }
  catch { return Infinity; }
}

// verifyStopped: after a stop call, re-query /players and confirm the server
// is no longer online. Returns true if confirmed down, false if still up.
// Loud (console.error) on failure so a regression in churn surfaces immediately.
async function verifyStopped(sid) {
  await sleep(4000); // give graceful shutdown a moment
  let players;
  try { players = await apiCall('GET', '/players'); }
  catch (e) { console.error('[auto-stop] verify: /players unreachable for ' + sid + ': ' + e.message); return false; }
  const info = (players && players.servers) ? players.servers[sid] : undefined;
  if (info && info.online) {
    console.error('[auto-stop] VERIFY FAILED: ' + sid + ' STILL ONLINE after stop — stop-server did not kill it. Investigate.');
    return false;
  }
  return true;
}

async function main() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}

  let players;
  try { players = await apiCall('GET', '/players'); }
  catch (e) { console.error('[auto-stop] API unreachable:', e.message); process.exit(0); }

  if (!players.success || !players.servers) { process.exit(0); }

  const newState = {};

  for (const [sid, info] of Object.entries(players.servers)) {
    if (!info.online) { newState[sid] = { emptyCount: 0 }; continue; }

    if (info.count > 0) {
      newState[sid] = { emptyCount: 0 };
      console.log('[auto-stop] ' + sid + ': ' + info.count + ' players online — skip');
    } else {
      // Within the start grace window: never count/stop, even if empty.
      const upMs = serverUptimeMs(sid);
      if (upMs < GRACE_MS) {
        newState[sid] = { emptyCount: 0 };
        console.log('[auto-stop] ' + sid + ': empty but within start grace (' + Math.round(upMs / 1000) + 's < ' + (GRACE_MS / 60000) + 'min) — skip');
        continue;
      }
      const prev = state[sid] || { emptyCount: 0 };
      const emptyCount = prev.emptyCount + 1;
      newState[sid] = { emptyCount };
      console.log('[auto-stop] ' + sid + ': empty count=' + emptyCount + '/' + THRESHOLD);

      if (emptyCount >= THRESHOLD) {
        console.log('[auto-stop] Stopping ' + sid + '...');
        try {
          await apiCall('POST', '/stop-server', { serverId: sid });
          const ok = await verifyStopped(sid);
          if (ok) {
            newState[sid] = { emptyCount: 0 };
            console.log('[auto-stop] ' + sid + ' stopped OK (verified down)');
          } else {
            // Do NOT reset emptyCount — keep it at/above threshold so the next
            // cycle retries the stop instead of silently dropping it.
            newState[sid] = { emptyCount };
            console.error('[auto-stop] ' + sid + ' stop NOT verified — will retry next cycle');
          }
        } catch (e) {
          newState[sid] = { emptyCount };
          console.error('[auto-stop] Stop failed:', e.message);
        }
      }
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
}

main().catch(e => { console.error('[auto-stop] Fatal:', e.message); process.exit(1); });
