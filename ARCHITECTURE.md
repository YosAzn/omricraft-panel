# OmriCraft — Architecture Reference

> This file is the single source of truth for Copilot and all squad agents.
> Read this before touching any file in this repo.

---

## Project Overview

Minecraft hosting panel — users create independent Paper servers via a React website.
Each server gets its own subdomain routed through Velocity.

**Live URLs:**
- Website: https://omricraft.com (GitHub Pages)
- Minecraft proxy: 151.145.94.177:25565 (Velocity)

---

## Stack

| Layer | Tech | Location |
|-------|------|----------|
| Frontend | React + Vite + Tailwind + Lucide | `src/` |
| Auth / DB | Firebase Auth + Firestore | `omricraft-74735` project |
| Backend functions | Firebase Functions v2 (Node.js) | `functions/` |
| Minecraft proxy | Velocity 3.3 | Oracle: `/home/ubuntu/omricraft/velocity/` |
| Game servers | Paper (independent instances) | Oracle: `/home/ubuntu/omricraft/servers/` |
| Manager API | Express.js on port 3001 | Oracle: `/home/ubuntu/omricraft/manager/manager-api/` |
| Scripts | Bash | `oracle/scripts/` → deployed to Oracle |

---

## Oracle Server Structure

```
/home/ubuntu/omricraft/
├── velocity/
│   ├── velocity.jar
│   ├── velocity.toml        ← routing config (servers + forced-hosts)
│   ├── forwarding.secret    ← shared with all Paper backends
│   ├── velocity.pid
│   └── logs/console.log
├── manager/
│   ├── servers.json         ← single source of truth for all servers
│   ├── .env                 ← MANAGER_API_KEY
│   ├── scripts/             ← bash scripts (deployed from oracle/scripts/)
│   └── manager-api/         ← Express API (deployed from oracle/manager-api/)
├── templates/
│   └── paper/server.jar     ← base Paper jar copied for each new server
└── servers/
    └── server-<timestamp>/  ← one folder per server
        ├── server.jar
        ├── server.properties
        ├── eula.txt
        ├── config/paper-global.yml
        ├── server.pid
        └── logs/console.log
```

---

## DNS

| Record | Host | Value | Purpose |
|--------|------|-------|---------|
| A | `@` | `185.199.108-111.153` (×4) | omricraft.com → GitHub Pages |
| CNAME | `www` | `yosazn.github.io` | www redirect |
| A | `*` | `151.145.94.177` | `<slug>.omricraft.com` → Velocity |

---

## Server Lifecycle

```
User clicks "Create Server"
  → Firebase Function createServer()
    → GET http://localhost:3001/servers (find free port, start 25566+)
    → POST http://localhost:3001/create-server
      → create-server.sh   (creates folder, server.properties, paper-global.yml)
      → start-server.sh    (nohup java, saves PID)
      → register-server-in-velocity.sh (edits velocity.toml, restarts Velocity)
    → setDoc Firestore servers/<id>
  → Website shows <slug>.omricraft.com

User clicks "Delete Server"
  → Firebase Function deleteServer()
    → POST http://localhost:3001/delete-server
      → delete-server.sh (stop, remove from velocity.toml, rm -rf folder, update servers.json)
    → deleteDoc Firestore servers/<id>
```

---

## servers.json Schema

```json
[
  {
    "id": "server-1748000000000",
    "displayName": "שרת של עומרי",
    "slug": "shrt-shl-avmri",
    "type": "paper",
    "version": "1.21.1",
    "gamePort": 25566,
    "rconPort": 25576,
    "memoryMb": 2048,
    "path": "/home/ubuntu/omricraft/servers/server-1748000000000",
    "publicHost": "shrt-shl-avmri.omricraft.com",
    "address": "shrt-shl-avmri.omricraft.com",
    "backendAddress": "127.0.0.1:25566",
    "status": "starting"
  }
]
```

---

## Firestore Schema

Collection: `omricraft/main/servers` (shared across all devices — NOT per-user UID)

```
omricraft/main/servers/<id>: {
  id, displayName, slug,
  address,        // <slug>.omricraft.com
  publicHost,     // same
  gamePort, rconPort, backendAddress,
  version, memoryMb, gamemode, ops, maxPlayers,
  status,         // starting | online | offline | deleting | failed
  installedAddons: [],
  createdAt, players, needsRestart
}
```

---

## Firebase Functions

File: `functions/index.js`

| Function | Secrets |
|----------|---------|
| `createServer` | MANAGER_API_URL, MANAGER_API_KEY |
| `deleteServer` | MANAGER_API_URL, MANAGER_API_KEY |
| `startServer` | MANAGER_API_URL, MANAGER_API_KEY |
| `stopServer` | MANAGER_API_URL, MANAGER_API_KEY |
| `getServerStatus` | MANAGER_API_URL, MANAGER_API_KEY |
| `sendMcCommand` | MANAGER_API_URL, MANAGER_API_KEY |
| `installPlugin` | MANAGER_API_URL, MANAGER_API_KEY |
| `updateServerIcon` | MANAGER_API_URL, MANAGER_API_KEY |
| `setServerPrivacy` | MANAGER_API_URL, MANAGER_API_KEY |
| `updateWhitelistPlayers` | MANAGER_API_URL, MANAGER_API_KEY |
| `updateServerOps` | MANAGER_API_URL, MANAGER_API_KEY |
| `getPaperVersions` | — (public PaperMC API proxy) |

Manager API URL: `http://151.145.94.177:3001` (listens on `0.0.0.0:3001`, secured by API key header)

---

## Key Rules (always follow)

1. **Never expose gamePort or backendAddress to the UI** — user sees only `<slug>.omricraft.com`
2. **SERVER_ID and SLUG must match** `^[a-z0-9_-]+$`
3. **Delete safety**: only delete inside `/home/ubuntu/omricraft/servers/<SERVER_ID>`
4. **online-mode=false** on all Paper servers (Velocity handles auth)
5. **forwarding.secret** must match between Velocity and all Paper backends
6. **Manager API listens on 0.0.0.0:3001** — secured by `Authorization: Bearer <KEY>` header
7. **Port allocation**: start at 25566, RCON = gamePort + 10

---

## GitHub

- Repo: `YosAzn/omricraft-panel`
- Branch: `main` → auto-deploys to GitHub Pages (GitHub Actions)
- Oracle deploy: GitHub Actions on push to main (SSH)
- Firebase Functions: auto-deploy on push to main (GitHub Actions)
- Oracle scripts: auto-deploy on push to main (GitHub Actions via SSH)
- Local repo: `C:\Users\yosij\omricraft-panel` (single source of truth)
- SSH key: `D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key`

## Known Fixes Applied (June 2026)

- **Firestore path**: changed from `users/{uid}/servers` → `omricraft/main/servers` (shared)
- **Velocity restart bug**: `stop-velocity.sh` now uses `pkill -f velocity.jar` to kill ALL instances
- **Plugin downloads**: `wget` now uses `-L` flag to follow redirects (modrinth, etc.)
- **Delete All button**: dashboard has bulk-delete for clean resets
