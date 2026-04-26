const { onCall } = require("firebase-functions/v2/https");
const { Rcon } = require("rcon-client");        

exports.sendMcCommand = onCall({ region: "us-central1" }, async (request) => {
    // פרטי השרת באורקל
    const host = "151.145.94.177";
    const port = 25575;
    const password = "Yosi&TheWeb";

    try {
        const rcon = await Rcon.connect({ host, port, password });
        // הפקודה מגיעה מהאתר
        const response = await rcon.send(request.data.command);
        await rcon.end();
        return { success: true, output: response };
    } catch (error) {
        console.error("RCON Error:", error);
        return { success: false, error: error.message };
    }
});