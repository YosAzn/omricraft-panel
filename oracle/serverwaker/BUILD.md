# ServerWaker (Velocity plugin)

Wakes a stopped backend when a player connects: denies the pre-connect, shows a
"starting…" message, and POSTs to the manager-api `/start-server` to boot it.

## Security: the API key is NOT in the source or the jar

`ServerWaker` reads the manager-api bearer token from the **`MANAGER_API_KEY`
environment variable** (and optionally `MANAGER_API_URL`). It is never hard-coded.
`start-velocity.sh` sources `/home/ubuntu/omricraft/manager/.env` and exports it so
the Velocity JVM — and therefore this plugin — inherits it. Rotating the key is just
editing `.env` and restarting Velocity; no rebuild.

> Do NOT commit a built jar that embeds a key. The jar is a build artifact and is
> git-ignored; only this source is tracked.

## Build (on the VPS — has JDK 25 + velocity.jar on the classpath)

```bash
SW=/home/ubuntu/omricraft/build/serverwaker
JDK=/home/ubuntu/jdk-25/bin
CP=/home/ubuntu/omricraft/velocity/velocity.jar      # bundles the Velocity API + guice + adventure

rm -rf "$SW/out-new" && mkdir -p "$SW/out-new"
"$JDK/javac" -cp "$CP" -d "$SW/out-new" "$SW/src/com/omricraft/waker/ServerWaker.java"
cp "$SW/out/velocity-plugin.json" "$SW/out-new/velocity-plugin.json"   # plugin descriptor (id/name/main)
( cd "$SW/out-new" && "$JDK/jar" cf "$SW/serverwaker-1.0.0.jar" com velocity-plugin.json )
```

## Deploy

```bash
cp "$SW/serverwaker-1.0.0.jar" /home/ubuntu/omricraft/velocity/plugins/serverwaker-1.0.0.jar
sudo systemctl restart omricraft-velocity
# verify: the velocity log shows "[ServerWaker] Loaded ... (api key from env: present)"
```

`velocity-plugin.json` (jar root):

```json
{ "id": "serverwaker", "name": "ServerWaker", "version": "1.0.0",
  "description": "Auto-start offline backends when a player connects",
  "main": "com.omricraft.waker.ServerWaker" }
```
