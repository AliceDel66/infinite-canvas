import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { config } from "../config.js";
import { appSchema } from "./schema.js";

export const databaseClient = postgres(config.databaseUrl, {
    max: config.nodeEnv === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
});

export const db = drizzle(databaseClient, { schema: appSchema });
