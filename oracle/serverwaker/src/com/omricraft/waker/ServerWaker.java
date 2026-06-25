package com.omricraft.waker;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.player.ServerPreConnectEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.ProxyServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.logging.Logger;

@Plugin(id = "serverwaker", name = "ServerWaker", version = "1.0.0")
public class ServerWaker {

    // Config comes from the ENVIRONMENT — never hard-code the API key (a compiled-in
    // literal ships the secret inside the jar AND the git repo). start-velocity.sh
    // sources .env and exports MANAGER_API_KEY (and optionally MANAGER_API_URL) so the
    // Velocity JVM — and therefore this plugin — inherits them. Rotating the key is then
    // just editing .env; no rebuild.
    private static final String API_URL =
            System.getenv("MANAGER_API_URL") != null ? System.getenv("MANAGER_API_URL")
                                                      : "http://127.0.0.1:3001";
    private static final String API_KEY = System.getenv("MANAGER_API_KEY");
    private static final int TIMEOUT = 3000;

    private final ProxyServer proxy;
    private final Logger log;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    @Inject
    public ServerWaker(ProxyServer proxy, Logger log) {
        this.proxy = proxy;
        this.log = log;
        if (API_KEY == null || API_KEY.isBlank()) {
            log.severe("[ServerWaker] MANAGER_API_KEY env var is NOT set — wake requests "
                     + "will be rejected (401). Set it in start-velocity.sh (source .env + export).");
        }
        log.info("[ServerWaker] Loaded - auto-start enabled (api key from env: "
               + (API_KEY != null && !API_KEY.isBlank() ? "present" : "MISSING") + ")");
    }

    @Subscribe
    public void onServerPreConnect(ServerPreConnectEvent event) {
        var target = event.getOriginalServer();
        if (target == null) return;

        var addr = (InetSocketAddress) target.getServerInfo().getAddress();
        if (isAlive(addr.getHostName(), addr.getPort())) return;

        String serverId = target.getServerInfo().getName();
        log.info("[ServerWaker] " + serverId + " is offline - starting...");

        event.setResult(ServerPreConnectEvent.ServerResult.denied());
        event.getPlayer().disconnect(
            Component.text()
                .append(Component.text("OmriCraft\n", NamedTextColor.GREEN))
                .append(Component.text("Server is starting up...\n", NamedTextColor.YELLOW))
                .append(Component.text("Please wait ~30 seconds and reconnect.", NamedTextColor.WHITE))
                .build()
        );

        proxy.getScheduler().buildTask(this, () -> wakeServer(serverId)).schedule();
    }

    private boolean isAlive(String host, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), TIMEOUT);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private void wakeServer(String serverId) {
        try {
            String body = "{\"serverId\":\"" + serverId + "\",\"memoryMb\":2048}";
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(API_URL + "/start-server"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + API_KEY)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(45))
                .build();
            var resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            log.info("[ServerWaker] Start resp: " + resp.statusCode());
        } catch (Exception e) {
            log.warning("[ServerWaker] Failed to start " + serverId + ": " + e.getMessage());
        }
    }
}
