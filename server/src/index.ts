import { createApp } from "./app.js";
import { config } from "./config.js";
import { databaseClient } from "./db/client.js";

const app = await createApp();

const close = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await databaseClient.end({ timeout: 5 });
    process.exit(0);
};

process.on("SIGINT", () => void close("SIGINT"));
process.on("SIGTERM", () => void close("SIGTERM"));

await app.listen({ host: "0.0.0.0", port: config.port });
