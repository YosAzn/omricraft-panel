# GlassProfile / Glass Dome — Build Tracker

> **STATUS: Foundation scaffolded locally; NOT deployed to VPS. Namespace + repo CONFIRMED. Phase 2 in progress (local prep).**
>
> Local root: `D:\Apps Webs\OmriCraft-Panel\glassprofile\` (OUTSIDE `oracle/` → does NOT auto-deploy).
> VPS root (CONFIRMED): `GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"` — nested inside the live omricraft area, parallel to the running servers, NOT touching them. Repo: stay in `omricraft-panel` under `glassprofile/`. See `DECISIONS.md` sec.6 (RESOLVED).

---

## Phase checklist (0–11)

- [x] **Phase 0 — Freeze prototype + lock decisions.**
  Formal defs (Dome, GlassProfile Server, CapacityStatus, Route, Cluster, Addon),
  website→cluster mapping, namespace OPEN DECISION. → `DECISIONS.md`.

- [x] **Phase 1 — Directory structure + empty registry skeleton.**
  `manager/scripts/`, `proxy/routes/`, `shared-addons/{plugins,mods,datapacks,resource-packs,modpacks}/`, `servers/` (all with `.gitkeep`).

- [~] **Phase 2 — Minimal proxy from the start.** IN PROGRESS (local prep).
  Velocity entry point + wildcard subdomain strategy; static routing; DRAFT config + routing doc prepared LOCALLY (not deployed, live velocity.toml untouched):
  `proxy/velocity-glassdome.draft.toml`, `proxy/ROUTING.md`.
  Contains an OPEN DECISION on the public domain (`.net` spec vs live `.com`) — see ROUTING.md; needs a DNS/cost decision before Phase 3. No auto-website wiring until manual routing is tested.

- [ ] **Phase 3 — Create a second independent Minecraft server manually.** TODO.
  Prove a 2nd Paper server can run on a separate port under `$GLASS_ROOT/servers/gps-001`, independent of the live system; confirm Java process + port reachable.

- [x] **Phase 4 — create/start/stop/restart/delete scripts.**
  `create-profile-server.sh`, `start-server.sh` (no double-start), `stop-server.sh` (single-pid/RCON, never killall), `restart-server.sh`, `delete-server.sh` (strict path validation), `create-dome.sh` (metadata only), `sync-proxy-routes.sh` (stub).

- [x] **Phase 5 — clusters.json + addons.json (+ empty registry).**
  6 clusters; addons catalog with full metadata (glassprofile, luckperms, multiverse-core, essentials, worldedit, worldguard, sample resource_pack). `servers/domes/routes.json` start empty.

- [ ] **Phase 6 — Basic create-dome for Paper/Vanilla-like.** TODO.
  Extend `create-dome.sh` to actually create `targetWorld` via internal Multiverse (PaperWorldAdapter) and merge into `domes.json` + `routes.json`.

- [ ] **Phase 7 — GlassProfile Plugin MVP.** TODO.
  Per-Dome capability enforcement plugin on Paper: `domes.yml`, Join Router → targetWorld, Command Gate, World Access Gate, basic LuckPerms contexts, admin commands, clear logs.

- [ ] **Phase 8 — Basic Placement Engine.** TODO.
  Resolve cluster → find compatible open GPS OR create new GPS; static addon union; restart-aware MVP rule (no live mutation if missing addon needs restart). vanilla-like-paper + paper first.

- [ ] **Phase 9 — Connect the frontend.** TODO.
  Website sends `createDome`/`createServer` to Manager (never `mv create`); Manager returns domeId/publicHost/status/cluster/serverInstanceId; show stable address, not IP/port. Safe delete flow.

- [ ] **Phase 10 — Purpur, Resource Packs, Multi-World.** TODO.
  Add Purpur button; resource_pack at server/cluster level first; Multi-World Server as a separate `sealed_recommended` product; panel UI for world creation instead of raw Multiverse.

- [ ] **Phase 11 — Fabric/Forge clusters.** TODO.
  Bring Fabric/Forge through the cluster model (NOT via Multiverse); mostly sealed/dedicated; treat modpack as a full runtime profile; dedicated/sealed on high clientImpact/risk.

---

## Hard safety rules carried into every script
- `set -euo pipefail` + single `GLASS_ROOT` variable at top of each script.
- SERVER_ID/DOME_ID validation: reject empty / `..` / `/` / absolute paths.
- `delete-server.sh`: literal AND canonical (`pwd -P`) prefix check on `$GLASS_ROOT/servers/`; dry-run unless `--yes`.
- `stop-server.sh`: stop a single recorded PID only — never `pkill`/`killall java`.
- No secrets in code (placeholders: `CHANGE_ME`). No `git add .`. No auto-deploy.

## Next concrete step (when user is ready)
1. ✅ Namespace CONFIRMED: `GLASS_ROOT=/home/ubuntu/omricraft/glassprofile`. Repo CONFIRMED: `omricraft-panel/glassprofile/`.
2. ⏳ Phase 2 local prep done (`proxy/velocity-glassdome.draft.toml`, `proxy/ROUTING.md`). **Decide the public domain** (ROUTING.md OPEN DECISION — recommend reusing a subdomain on the existing `.com`) before Phase 3.
3. **Phase 3** (stand up a second independent Paper server manually under `$GLASS_ROOT/servers/gps-001`,
   verify Java process + port) — manually on the VPS, after copying these files there deliberately.
   ⚠️ Phase 3 is NOT an unattended background task: requires the user present, namespace + domain confirmed,
   and step-by-step execution with one verification command per step (per spec חלק ז).
