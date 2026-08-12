import { migrate } from "drizzle-orm/postgres-js/migrator";

import { databaseClient, db } from "./db/client.js";

await migrate(db, { migrationsFolder: "drizzle" });
await databaseClient.end({ timeout: 5 });
