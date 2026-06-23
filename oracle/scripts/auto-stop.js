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
      const prev = state[sid] || { emptyCount: 0 };
      const emptyCount = prev.emptyCount + 1;
      newState[sid] = { emptyCount };
      console.log('[auto-stop] ' + sid + ': empty count=' + emptyCount + '/' + THRESHOLD);

      if (emptyCount >= THRESHOLD) {
        console.log('[auto-stop] Stopping ' + sid + '...');
        try {
          await apiCall('POST', '/stop-server', { serverId: sid });
          newState[sid] = { emptyCount: 0 };
          console.log('[auto-stop] ' + sid + ' stopped OK');
        } catch (e) {
          console.error('[auto-stop] Stop failed:', e.message);
        }
      }
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
}

main().catch(e => { console.error('[auto-stop] Fatal:', e.message); process.exit(1); });
