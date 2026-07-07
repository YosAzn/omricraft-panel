# OmriCraft Monitoring (as code) — MANUAL VPS APPLY REQUIRED

Part of the **P0 verify-health safety net**. These files make a *stuck / crash-looping*
service (the 2nd class of outage) get **caught and shouted about**, instead of churning
silently behind "it's running".

> ⚠️ **NOT auto-deployed.** The Oracle CI (`.github/workflows/deploy-oracle.yml`) only
> rsyncs **`oracle/scripts/`** to the VPS. systemd units under `oracle/monitoring/` are
> **not** shipped — they must be copied and applied on the VPS **once, by hand** (they need
> `sudo` + `daemon-reload`, which a scripts-only deploy neither does nor should do).
>
> `oracle/scripts/health.sh` **is** shipped by CI (it lives in `oracle/scripts/`), but its
> **cron entry** and the **webhook secret** still need one-time manual setup on the VPS.

---

## What's here

| File | Kind | Purpose |
|------|------|---------|
| `omricraft-velocity.service.d/50-crash-guard.conf` | systemd drop-in | Bounds the proxy's `Restart=always` loop: **StartLimitIntervalSec=300 / StartLimitBurst=5** (give up after 5 fails in 5 min → unit goes `failed`, visible) + `OnFailure=` → notifier. Separate file from `oom.conf`, so it does **not** touch the existing `OOMScoreAdjust=-800`. |
| `omricraft-notify@.service` | systemd unit (templated) | The `OnFailure` handler. On any failure of a monitored unit it fires the webhook via `health.sh --notify` (one secret path, reused). |
| `../scripts/health.sh` | shell (shipped by CI) | Cron every 5 min: **TCP-probe `:25565` (velocity) and `:3001` (manager-api)**; on failure POST to `HEALTH_WEBHOOK_URL`. Also serves `--notify "<msg>"` for the unit above. |

Two halves, complementary:
- **systemd drop-in** → catches *crash-loops* (fails repeatedly, systemd can see it).
- **health.sh cron** → catches *up-but-not-listening / wedged* (systemd thinks it's fine, port is dead).

---

## One-time apply on the VPS

SSH in:
```
ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177
```

### 1. Webhook secret (NEVER commit the real URL)
Add your ntfy topic URL **or** a Discord webhook URL to the manager env file:
```bash
# /home/ubuntu/omricraft/manager/.env
echo 'HEALTH_WEBHOOK_URL=https://ntfy.sh/your-private-topic-here' >> /home/ubuntu/omricraft/manager/.env
```
(ntfy: install the app, subscribe to that topic. Discord: Server Settings → Integrations → Webhooks → copy URL.)
The repo only ever contains the placeholder `<NTFY_OR_DISCORD_WEBHOOK>`; the live URL lives **only** in `.env` on the box.

### 2. systemd crash-guard + notifier
`health.sh` arrives on the VPS automatically via the next `oracle/**` deploy (at
`/home/ubuntu/omricraft/manager/scripts/health.sh`). Copy the unit files from that
same scripts dir is **not** where they land — copy them from a checkout, or paste them.
Easiest is to scp this folder up, then:
```bash
# from a dir containing these two unit files (e.g. after: scp -r oracle/monitoring ubuntu@host:/tmp/):
sudo mkdir -p /etc/systemd/system/omricraft-velocity.service.d
sudo cp /tmp/monitoring/omricraft-velocity.service.d/50-crash-guard.conf \
        /etc/systemd/system/omricraft-velocity.service.d/
sudo cp /tmp/monitoring/omricraft-notify@.service /etc/systemd/system/
sudo systemctl daemon-reload
```
No restart needed — the limits and `OnFailure` take effect on the next start/failure.
Verify the merge (both `oom.conf` and the new drop-in should be listed):
```bash
systemctl cat omricraft-velocity.service
```

### 3. Cron for health.sh (5-minute TCP probe)
```bash
mkdir -p /home/ubuntu/omricraft/logs
( crontab -l 2>/dev/null; \
  echo '*/5 * * * * /home/ubuntu/omricraft/manager/scripts/health.sh >> /home/ubuntu/omricraft/logs/health.log 2>&1' \
) | crontab -
crontab -l   # confirm the line is present exactly once
```

---

## Test it

```bash
# health probe (should print OK for both ports if the stack is up):
/home/ubuntu/omricraft/manager/scripts/health.sh; echo "exit=$?"

# notify path (fires the webhook — you should get a push if HEALTH_WEBHOOK_URL is set):
/home/ubuntu/omricraft/manager/scripts/health.sh --notify "OmriCraft monitoring test"

# OnFailure unit (fires the webhook via the templated notifier):
sudo systemctl start omricraft-notify@test.service
journalctl -u omricraft-notify@test -n 20 --no-pager
```

---

## Rollback (full)

```bash
sudo rm -f /etc/systemd/system/omricraft-velocity.service.d/50-crash-guard.conf
sudo rm -f /etc/systemd/system/omricraft-notify@.service
sudo systemctl daemon-reload
# remove the cron line:
crontab -l 2>/dev/null | grep -v 'manager/scripts/health.sh' | crontab -
# (optional) drop the secret:
sed -i '/^HEALTH_WEBHOOK_URL=/d' /home/ubuntu/omricraft/manager/.env
```
`50-crash-guard.conf` is a separate drop-in from `oom.conf`, so removing it leaves the
OOM protection intact.
