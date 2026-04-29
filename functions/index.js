const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { Rcon } = require("rcon-client");

const rconPassword = defineSecret("RCON_PASSWORD");

exports.sendMcCommand = onCall(
    {
        region: "us-central1",
        secrets: [rconPassword],
        timeoutSeconds: 60,
    },
    async (request) => {
        const host = "151.145.94.177";
        const port = 25575;
        const password = rconPassword.value();

        const command = request.data?.command;

        console.log(`RCON request received: host=${host} port=${port} command=${command}`);

        if (!command || typeof command !== "string") {
            return {
                success: false,
                error: "אין פקודת RCON תקינה",
            };
        }

        try {
            const rcon = await Rcon.connect({
                host,
                port,
                password,
                timeout: 15000,
            });

            const response = await rcon.send(command);
            await rcon.end();

            console.log(`RCON response: ${response}`);

            return {
                success: true,
                output: response || "",
            };
        } catch (error) {
            console.error("RCON Error:", error);

            return {
                success: false,
                error: error?.message || String(error),
            };
        }
    }
);