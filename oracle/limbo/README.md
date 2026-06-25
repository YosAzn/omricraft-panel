# Seamless wake — NanoLimbo + VelocityLimboHandler + ServerWaker

When a player connects to a **stopped** backend they are no longer kicked. They drop
into a NanoLimbo holding world ("waking your server up…") while the backend boots, then
are **transferred in automatically** — no kick, no manual reconnect.

## Who does what

```
Player → <slug>.omricraft.com (forced-host → a stopped backend)
  │  ServerPreConnectEvent
  ▼
ServerWaker (oracle/serverwaker/):  backend socket dead?
   ├─ event.setResult(allowed(limbo))   ← HOLD: send to NanoLimbo (no kick)
   └─ POST /start-server                ← START: boot the real backend
  │  player lands on limbo → ServerPostConnectEvent
  ▼
VelocityLimboHandler:  resolves intended target (forced-host) → adds to its QUEUE
  │  every task-interval (3s): pings the target
  ▼
VelocityLimboHandler:  ping ok → TRANSFER player limbo → real backend (seamless)
```

VLH is **reactive only** (it queues/transfers, never starts a backend and never moves
the *first* player into limbo). ServerWaker owns HOLD + START; VLH owns QUEUE + TRANSFER.
A live backend → ServerWaker early-returns (isAlive) → normal routing, untouched.

## Components (all verified compatible with Velocity 3.4.0-SNAPSHOT / protocol 774 / aarch64)

| Component | Version | Where |
|---|---|---|
| NanoLimbo | v1.12.0 | `/home/ubuntu/omricraft/limbo/NanoLimbo.jar` (systemd `omricraft-limbo`, binds `127.0.0.1:25564`, localhost-only) |
| VelocityLimboHandler | v1.8.3 | `velocity/plugins/velocity-limbo-handler-1.8.3+108.jar` |
| ServerWaker (modified) | 1.0.0 | `velocity/plugins/serverwaker-1.0.0.jar` (source: `oracle/serverwaker/`) |

Jars are git-ignored build/download artifacts. Tracked here: `settings.yml` (NanoLimbo),
`omricraft-limbo.service` (systemd unit), `vlh-config.yml` (VLH config reference), and the
ServerWaker source in `oracle/serverwaker/`.

## Deploy (manual — not in the oracle CI rsync; like ServerWaker)

1. `mkdir -p /home/ubuntu/omricraft/limbo`; download `NanoLimbo.jar` (NanoLimbo v1.12.0 release).
2. Copy `settings.yml` here; copy the proxy secret so `@forwarding.secret` resolves:
   `cp velocity/forwarding.secret limbo/forwarding.secret && chmod 600 limbo/forwarding.secret`.
3. Install `omricraft-limbo.service` → `/etc/systemd/system/`, `daemon-reload`, `enable --now`.
4. Drop the VLH jar into `velocity/plugins/`; add `limbo = "127.0.0.1:25564"` to velocity.toml `[servers]`.
5. Pre-set VLH `config.yml` `direct-connect-server: limbo` (default `lobby` self-destructs — there is no lobby).
6. Build + deploy the modified ServerWaker (see `oracle/serverwaker/BUILD.md`).
7. `sudo systemctl restart omricraft-velocity`.

## Verify

- Server-side: `systemctl is-active omricraft-limbo omricraft-velocity` both active; `ss -ltn` shows
  `127.0.0.1:25564` + `:25565`; velocity log has `Loaded plugin velocity-limbo-handler 1.8.3`,
  `Queue Enabled: true`, and **no** `Server "lobby" is invalid … will not function` line; backend
  count in `[servers]` unchanged.
- In-game (needs a real MC 1.21.11 client): connect to a **stopped** server's forced-host → you land
  in the limbo void ("waking…") instead of being kicked, and within ~30–60s are moved into the real
  world automatically. Connecting to an already-running server goes straight there.

## Rollback (back to kick-and-reconnect)

```bash
cp velocity/velocity.toml.bak-prelimbo-<ts> velocity/velocity.toml
rm velocity/plugins/velocity-limbo-handler-1.8.3+108.jar
cp velocity/plugins/serverwaker-1.0.0.jar.bak-prelimbo velocity/plugins/serverwaker-1.0.0.jar
sudo systemctl restart omricraft-velocity
sudo systemctl disable --now omricraft-limbo
```
Nothing here touches the 11 backends, their ports, the manager-api, the forwarding secret, or DNS.
NanoLimbo is localhost-only → no firewall/DNS change.
