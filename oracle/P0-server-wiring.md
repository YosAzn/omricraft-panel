# P0 Server-Wiring — call `verify-health.sh` after every addon install (documented patch)

> **This is a PATCH SPEC, not applied code.** `oracle/manager-api/server.js` has the
> user's uncommitted work, so this branch does **not** edit it. Apply these edits by hand
> (or in a follow-up commit that owns server.js). Every edit is a **point insert**: it adds a
> post-install verify + fail-loud rollback, and **replaces only the single success-return**
> of each install endpoint. Nothing else is removed. (READ-before-EDIT; no wholesale rewrite.)

## Why
MINECRAFT_RULES.md **Rule 0**: an addon can install cleanly and still crash the server on
boot (`mob-heads` v4.7.1 declared 1.21.11, passed every jar check, crashed loading a dialog
API). Today the install endpoints return `success:true` the instant the download+jar-check
passes — they never boot the server to see if it actually works. This patch makes each one:

1. run its existing `install-*.sh` (unchanged), then
2. call **`verify-health.sh SERVER_ID`** (boots/reloads + scans `latest.log` — Rule 0), and
3. **on a dirty/failed boot**: move the just-installed addon to a `*-removed/` sibling
   (**Rule 6 — reversible**) and return **HTTP 422** `{ error: "<addon> not compatible with <mcVersion>" }`
   instead of `success:true`.

**Reference implementation = the `/install-datapack-by-id` path** (server.js ~1319–1480): it
already does version-aware resolve + 422-on-incompatible + RCON reload. This patch brings the
same discipline (plus the boot **verify**) to `/install-plugin`, `/install-mod`, and
`/install-resourcepack`, and adds the verify step to the datapack path too.

`verify-health.sh` exit codes (see the script header): **0** clean · **1** dirty log · **2**
never booted · **3** usage/env. Treat **non-zero ⇒ not compatible** (1/2 = the addon broke the
boot; 3 = we could not verify → do not claim success).

---

## Step 0 — add ONE shared helper (once, near the other helpers, e.g. after `runScript`, ~line 67)

This wraps verify-health.sh and the reversible move, so each endpoint stays ~3 lines.
`VERIFY_SKIP` lets ops disable the boot-verify globally in an emergency (fails open loudly).

```js
// --- P0 Rule-0 post-install verify (boot smoke-test) --------------------------
// Runs verify-health.sh for one server. Resolves { ok, code, output }.
//   ok:true  => boot/reload clean (exit 0).
//   ok:false => code 1 dirty log / 2 never booted / 3 env; output has offending lines.
// Bounded to ~4 min so a cold Purpur worldgen can finish (start-server + boot-wait).
function verifyHealth(serverId) {
  if (process.env.VERIFY_SKIP === '1') {
    console.warn('[' + new Date().toISOString() + '] VERIFY_SKIP=1 — skipping Rule-0 boot verify for ' + serverId);
    return Promise.resolve({ ok: true, code: 0, output: 'skipped (VERIFY_SKIP=1)' });
  }
  return runScript('verify-health.sh', [serverId], 260000)
    .then(function(stdout) { return { ok: true, code: 0, output: stdout }; })
    .catch(function(err) {
      return { ok: false, code: (typeof err.exitCode === 'number' ? err.exitCode : 1), output: err.message };
    });
}

// Reversibly retire a just-installed addon file: move plugins/mods/<jar> ->
// plugins-removed/ (Rule 6 — never hard-delete on a verify failure; keep it so the
// user can inspect / an operator can re-enable). Best-effort: never throws.
function retireAddonFile(serverId, subdir, filename) {
  try {
    if (!filename) return null;
    var live = path.join(SERVERS_DIR, serverId, subdir, filename);
    if (!fs.existsSync(live)) return null;
    var graveyard = path.join(SERVERS_DIR, serverId, subdir + '-removed');
    fs.mkdirSync(graveyard, { recursive: true });
    var dest = path.join(graveyard, filename);
    fs.renameSync(live, dest);
    console.log('[' + new Date().toISOString() + '] retired incompatible addon ' + filename + ' -> ' + subdir + '-removed/ on ' + serverId);
    return dest;
  } catch (e) {
    console.error('retireAddonFile failed (' + filename + '):', e.message);
    return null;
  }
}

// Parse "installed at <path>" that install-plugin.sh / install-mod.sh print, to learn
// the exact filename we just dropped (so we can retire precisely on failure).
function installedFilename(scriptStdout) {
  if (!scriptStdout) return null;
  var m = String(scriptStdout).match(/installed at .*[\/\\]([^\/\\\s]+)\s*$/m);
  return m ? m[1] : null;
}
```

> `retireAddonFile` uses the SAME dir layout the code already knows: plugins in
> `plugins/` (see `/remove-plugin`, server.js ~698) and mods in `mods/` (install-mod.sh
> line 4). The `*-removed/` sibling mirrors what we did by hand for Mob-Heads on gd-3.

---

## Edit 1 — `/install-plugin`  (server.js **524–539**)

**Reason:** plugins hot-load on `reload`; a bad one throws on enable. Verify catches it.

**BEFORE** (lines 531–538 — the whole `try { … }` body):
```js
  try {
    await runScript('install-plugin.sh', [serverId, pluginId], 90000);
    console.log('[' + new Date().toISOString() + '] Installed plugin ' + pluginId + ' on ' + serverId);
    return res.json({ success: true });
  } catch (err) {
    console.error('install-plugin error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
```

**AFTER** (replace exactly those 8 lines):
```js
  try {
    var _out = await runScript('install-plugin.sh', [serverId, pluginId], 90000);
    console.log('[' + new Date().toISOString() + '] Installed plugin ' + pluginId + ' on ' + serverId + ' — verifying (Rule 0)');
    // Rule 0 — prove it boots/reloads clean before we call it a success.
    var _v = await verifyHealth(serverId);
    if (!_v.ok) {
      var _mv = srvVersion(serverId);
      retireAddonFile(serverId, 'plugins', installedFilename(_out));  // Rule 6 — reversible
      console.error('install-plugin VERIFY FAILED (' + pluginId + ', code ' + _v.code + '): ' + String(_v.output).slice(0, 500));
      return res.status(422).json({ success: false, error: pluginId + ' not compatible with ' + _mv, verify: { code: _v.code } });
    }
    return res.json({ success: true, verified: true });
  } catch (err) {
    console.error('install-plugin error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
```

> `srvVersion(serverId)` = tiny reader added in Edit 4 (returns the server's MC version, or
> `"this version"` if unknown) — used only to phrase the 422 message.

---

## Edit 2 — `/install-mod`  (server.js **565–605**)

**Reason:** jar mods load on **restart**, not reload — so `verify-health.sh` must actually
(re)start the server here. It does: if the server is down it runs `start-server.sh` and waits;
if up, the mod isn't live until restart, so pass `RESTART=1` (below) to force a clean cycle.

The existing endpoint already returns **422 on exit-code 2** ("no compatible build") — keep
that. Add the boot-verify after a successful install.

**BEFORE** (lines 594–604 — the `try { … } catch { … }`):
```js
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
```

**AFTER** (replace exactly those 11 lines):
```js
  try {
    var _out = await runScript('install-mod.sh', [serverDir, loader, version, slug], 90000);
    console.log('[' + new Date().toISOString() + '] Installed mod ' + modId + ' (' + slug + ') on ' + serverId + ' — verifying (Rule 0)');
    // Mods only load on (re)start; verify-health.sh restarts a running server (RESTART=1)
    // or cold-starts a stopped one, then scans the boot log.
    var _v = await verifyHealthRestart(serverId);
    if (!_v.ok) {
      retireAddonFile(serverId, 'mods', installedFilename(_out));  // Rule 6 — reversible
      console.error('install-mod VERIFY FAILED (' + modId + '/' + slug + ', code ' + _v.code + '): ' + String(_v.output).slice(0, 500));
      return res.status(422).json({ success: false, error: slug + ' not compatible with ' + version, verify: { code: _v.code } });
    }
    return res.json({ success: true, modId: modId, slug: slug, needsRestart: false, verified: true });
  } catch (err) {
    console.error('install-mod error:', err.message);
    if (err && err.exitCode === 2) {
      return res.status(422).json({ success: false, error: 'אין גרסת מוד תואמת לגרסת השרת הזו' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
```

> `verifyHealthRestart` = same as `verifyHealth` but sets `RESTART=1` for the script (see
> the tiny variant in Edit 4). It forces a stop→start so a newly-dropped jar mod is actually
> loaded before we scan the log — otherwise a running server would pass without loading the mod.

---

## Edit 3 — `/install-resourcepack`  (server.js **637–689**)

**Special case — do NOT boot-verify.** A resource pack is written into `server.properties`
(`resource-pack` / `-sha1`), is **client-side**, and by MINECRAFT_RULES **Rule 5** must not
change server behavior — it only affects what the *player* downloads on join. Booting proves
nothing about a texture pack and would waste a cold-start. So here the "verify" is a
**properties sanity check**, not a boot. The endpoint already returns 422 on exit-code 2
(no compatible pack) — that stays. Add a cheap post-write assertion.

**BEFORE** (lines 669–688 — the `try { … } catch { … }`):
```js
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
```

**AFTER** — add ONLY the sanity assertion between the `runScript` line and the log line
(insert after the existing `await runScript('install-resourcepack.sh', …)` at line 670);
leave the rest of the block unchanged:
```js
    await runScript('install-resourcepack.sh', [serverDir, srv.version, slug], 90000);
    // Rule 5 — client-side pack: no boot-verify. Assert the URL actually landed in
    // server.properties (fail loud if the script "succeeded" but wrote nothing).
    var _props = fs.readFileSync(path.join(serverDir, 'server.properties'), 'utf8');
    if (!/^resource-pack=\S+/m.test(_props)) {
      return res.status(422).json({ success: false, error: slug + ' not compatible with ' + srv.version + ' (resource-pack not set)' });
    }
```

---

## Edit 4 — datapack path + the two tiny readers/variants

### 4a. `/install-datapack-by-id` — add the boot-verify (server.js ~1466, the success `return res.json`)

The datapack path already does version-aware 422 and RCON reload. Add Rule-0 verify **only
when it installed into a LIVE world and the server is up** (a pending/no-world install has
nothing to boot yet — the pending pack is verified on the next real start). Insert right
before the final `return res.json({ success:true, … })` (line ~1466):

```js
    // Rule 0 — if we enabled it live, prove the reload didn't break the boot.
    if (installedToWorld && isServerRunning(serverId)) {
      var _v = await verifyHealth(serverId);
      if (!_v.ok) {
        try {
          var _grave = path.join(serverDir, 'world', 'datapacks-removed');
          fs.mkdirSync(_grave, { recursive: true });
          fs.renameSync(dest, path.join(_grave, filename));   // Rule 6 — reversible
          var _rc = readRcon(serverId);
          if (_rc.pass) { await rconConnect('127.0.0.1', _rc.port, _rc.pass, 'reload', 30000); }
        } catch (_e) { console.error('datapack retire failed:', _e.message); }
        return res.status(422).json({ success: false, error: filename + ' not compatible with ' + srvVersion(serverId), verify: { code: _v.code } });
      }
    }
```

> This is exactly the mob-heads scenario: the pack enables, `reload` runs, the log shows a
> load failure → we move it to `world/datapacks-removed/`, `reload` again to unload it, and
> return 422 instead of `success:true`.

### 4b. Two tiny helpers (add once, next to Step-0 helpers)

```js
// MC version of a server for 422 phrasing — never throws.
function srvVersion(serverId) {
  try {
    var s = readServersArray().find(function(x) { return x.id === serverId; });
    return (s && s.version) ? s.version : 'this version';
  } catch (e) { return 'this version'; }
}

// verifyHealth variant that forces a full restart (for jar mods that only load on start).
function verifyHealthRestart(serverId) {
  if (process.env.VERIFY_SKIP === '1') return Promise.resolve({ ok: true, code: 0, output: 'skipped' });
  return runScript('verify-health.sh', [serverId], 300000, { RESTART: '1' })
    .then(function(stdout) { return { ok: true, code: 0, output: stdout }; })
    .catch(function(err) { return { ok: false, code: (typeof err.exitCode === 'number' ? err.exitCode : 1), output: err.message }; });
}
```

> **`runScript` signature note:** the current `runScript(scriptName, args, timeout)`
> (server.js 51) has **no env-passing arg**. `verifyHealthRestart` needs one, so also make
> this **one-line, additive** change to `runScript` (does not alter existing behavior — the
> 4th arg is optional):
>
> ```js
> // line 51:  function runScript(scriptName, args, timeout) {
> function runScript(scriptName, args, timeout, extraEnv) {
> // line 55:  execFile('bash', [scriptPath].concat(args), { timeout: timeout }, function(...) {
>   execFile('bash', [scriptPath].concat(args),
>     { timeout: timeout, env: extraEnv ? Object.assign({}, process.env, extraEnv) : process.env },
>     function(err, stdout, stderr) {
> ```
>
> And add `RESTART` handling to **`verify-health.sh`** (small, optional — if you prefer not to
> touch runScript, skip the RESTART env and instead have `/install-mod` call
> `runScript('restart-server.sh', [serverId, String(srv.memoryMb||2048)])` *before*
> `verifyHealth(serverId)`; either path forces the mod to load before the scan).

---

## Behavior summary (after applying)

| Endpoint | verify kind | on failure | HTTP | reversible move |
|---|---|---|---|---|
| `/install-plugin` | reload + log scan | retire jar | **422** | `plugins-removed/` |
| `/install-mod` | restart + log scan | retire jar | **422** | `mods-removed/` |
| `/install-resourcepack` | properties assert (Rule 5, no boot) | — | **422** if unset | n/a (properties) |
| `/install-datapack-by-id` | reload + log scan (live only) | unload + retire zip | **422** | `world/datapacks-removed/` |

All four now return **422 `{ error: "<addon> not compatible with <mcVersion>" }`** on a
Rule-0 failure instead of a false `success:true`. Frontend note: `src/lib/api.js` /
`HealthIssueRow.jsx` (user's files — not touched here) should surface a 422 from these as
"addon incompatible, auto-removed" rather than a generic error.

## Test after applying (on the VPS, throwaway server only)
```bash
# clean addon should stay installed and return success:true, verified:true
curl -s -X POST 127.0.0.1:3001/install-plugin -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' -d '{"serverId":"<throwaway>","pluginId":"p1"}'
# a known-bad datapack (d11/mob-heads) on a live 1.21.11 world should return 422 + land in world/datapacks-removed/
```
