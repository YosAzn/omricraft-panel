# Glass Dome — Proxy / Routing Model (Phase 2, LOCAL prep)

> **STATUS: local reviewable artifact. NOT deployed. The live Velocity
> (`/home/ubuntu/omricraft/velocity/velocity.toml`, bind :25565) is untouched.**
>
> Companion file: `velocity-glassdome.draft.toml` (a DRAFT proxy config, not live).
> Source of truth for the model: spec "Proxy / Domain / Public Route" + "שלב 2".

---

## 1. The routing model

Each Dome gets an isolated entry gate. The proxy hides the backend IP/ports and
lets the Dome move between GlassProfile Servers without the user's address changing.

```
publicHost  (e.g. shahar.<domain>)
     │
     ▼
Velocity proxy                         ← single public entry point
     │
     ▼
Route Resolver:  host → domeId → serverInstanceId
     │
     ▼
GPS backend  (e.g. gps-001 @ 127.0.0.1:25566)
     │
     ▼
GlassProfile Join Router → targetWorld  (e.g. world_dome_1001)
```

Two layers do the resolving:

| Layer | Where | Resolves | Phase |
|-------|-------|----------|-------|
| **host → backend** | Velocity (`forced-hosts`) | publicHost → GPS backend | Phase 2 (static, now) |
| **dome → targetWorld** | GlassProfile plugin on the backend, on `PlayerJoinEvent` | domeId → entryWorld + capabilities | Phase 7 |

In Phase 2 the "Route Resolver" is **static**: a flat `forced-hosts` table in
the proxy config, one line per dome. A dynamic Route Resolver (reading
`routes.json` live) comes later — Phase 2 only needs `routes.json` to exist and
the publicHost thinking to be in place, per the spec ("שלב 2").

---

## 2. How it maps to `routes.json`

`manager/routes.json` is the data model the proxy config is generated FROM.
Each route object maps 1:1 onto one `forced-hosts` line plus the backend's dome
routing. Field mapping:

| `routes.json` field | Role in routing | Where it lands |
|---------------------|-----------------|----------------|
| `host` | the publicHost the player types | `forced-hosts` key in velocity config |
| `proxyTarget` / `serverInstanceId` | which GPS backend | `forced-hosts` value + `[servers]` entry |
| `domeId` | which dome on that backend | passed to GlassProfile plugin (Phase 7) |
| `targetWorld` | world the player lands in | GlassProfile Join Router (Phase 7) |
| `entryMode` | e.g. `direct_world_join` | GlassProfile entry policy (Phase 7) |
| `status` | `active` / disabled | whether the route is emitted at all |

Example — the reference route from `DECISIONS.md`:

```json
{ "host": "shahar.<domain>", "domeId": "dome-1001",
  "serverInstanceId": "gps-001", "proxyTarget": "gps-001",
  "targetWorld": "world_dome_1001", "entryMode": "direct_world_join",
  "status": "active" }
```

becomes, in the proxy config:

```toml
[servers]
gps-001 = "127.0.0.1:25566"

[forced-hosts]
"shahar.<domain>" = ["gps-001"]
```

`sync-proxy-routes.sh` (Phase 4 stub) is the script that will, in a later phase,
read `routes.json` and regenerate the `[servers]` + `[forced-hosts]` blocks of
the Glass Dome proxy config — never the live one.

> NOTE: `manager/routes.json` currently starts **empty** (`{"routes": []}`).
> The placeholder `shahar` host in the draft toml is illustrative only and will
> be produced from `routes.json` once a real dome exists (Phase 6).

---

## 3. Wildcard / subdomain strategy

Per dome = per subdomain. Each Dome's `slug` becomes a label under one wildcard
DNS record, so new Domes need **no new DNS record** — only a new `forced-hosts`
line (which `sync-proxy-routes.sh` will generate).

```
DNS:   *.<domain>   A/CNAME  →  VPS public IP (151.145.94.177)
                                 (one wildcard record covers every dome)

Player → shahar.<domain> ─┐
Player → builder.<domain>─┼─► Velocity (one public port)
Player → trial.<domain>  ─┘     │
                                └─ forced-hosts matches the label → GPS backend
```

- One wildcard `*.<domain>` record points every subdomain at the proxy.
- `forced-hosts` keys must be **lowercase** (Velocity lowercases the incoming
  host before matching); enforce slug normalization when generating routes.
- The wildcard covers Domes that do not exist yet — DNS does not change per Dome.
- Reserved labels (e.g. `www`, `play`, `api`) should be excluded from the slug
  namespace so they can't collide with a dome.

---

## 4. ⚠️ OPEN DECISION — public domain (`.net` spec vs `.com` live)

**This is unresolved and must be decided before Phase 3.** The spec writes
`*.omricraft.net`, but the LIVE system (FLOW.md) uses `*.omricraft.com`
(`bbb` / `fffff` / `trial.omricraft.com` already route through the live proxy).
We need a domain + DNS decision; the draft config uses `<domain>` placeholders
until then.

### Option (a) — reuse a subdomain pattern on the existing `.com`  ✅ recommended
Use a namespaced pattern under the domain we already own, e.g.
`*.play.omricraft.com` (so `shahar.play.omricraft.com`) or `dome-*.omricraft.com`.

- **Pros:** no new domain, **no new cost**, no new registrar/DNS account. One new
  wildcard record (`*.play.omricraft.com`) on the existing zone. Cleanly separates
  Glass Dome hosts from the live `bbb/fffff/trial.omricraft.com` flat namespace,
  so no risk of colliding with existing live forced-hosts.
- **Cons:** longer hostnames (extra label); cosmetically less "clean" than a bare
  `slug.omricraft.net`.

### Option (b) — buy `omricraft.net`
Register `omricraft.net` and use `*.omricraft.net` exactly as the spec writes.

- **Pros:** matches the spec verbatim; shortest hostnames (`shahar.omricraft.net`);
  fully separate zone from the live `.com`.
- **Cons:** **new recurring cost** (domain registration/renewal); new DNS/zone
  setup; another domain to maintain and keep paid-up. Violates the simplicity /
  cost-first rule unless there's a product reason to want a distinct brand domain.

### Option (c) — share the live Velocity vs run a second proxy
Independent of which domain, decide whether Glass Dome routes go INTO the existing
live Velocity (:25565) or a second, separate proxy process.

- **Share the live proxy:** one public port, one config. **But** it means editing
  the live `velocity.toml` — higher blast radius; a bad reload affects the running
  `bbb/fffff/trial` servers. The draft here is deliberately a separate file to
  avoid this until decided.
- **Second proxy (what the draft assumes):** full isolation from the live system,
  zero risk to live servers, at the cost of a second port + process to run and a
  second config to keep in sync.

### Recommendation
**Option (a)** — reuse a subdomain on the existing `.com` (e.g. `*.play.omricraft.com`).
Simplest and cheapest: no new domain, no new cost, just one wildcard DNS record on
a zone we already control. For (c), starting with a **separate draft proxy** (as
modeled here) is the lower-risk default; revisit sharing the live proxy only once
manual routing is proven.

> **Decision owner: user.** This needs a DNS + cost decision before Phase 3
> (standing up the real second Paper server). Until then the draft config keeps
> `<domain>` / `.net` placeholders and is NOT deployed.
