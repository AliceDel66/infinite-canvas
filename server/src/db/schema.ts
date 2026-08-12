import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const user = pgTable(
    "users",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        email: text("email").notNull(),
        emailVerified: boolean("email_verified").notNull().default(false),
        image: text("image"),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const session = pgTable(
    "sessions",
    {
        id: text("id").primaryKey(),
        expiresAt: timestampColumn("expires_at").notNull(),
        token: text("token").notNull(),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
    },
    (table) => [uniqueIndex("sessions_token_unique").on(table.token), index("sessions_user_id_index").on(table.userId)],
);

export const account = pgTable(
    "accounts",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestampColumn("access_token_expires_at"),
        refreshTokenExpiresAt: timestampColumn("refresh_token_expires_at"),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId), index("accounts_user_id_index").on(table.userId)],
);

export const verification = pgTable(
    "verifications",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestampColumn("expires_at").notNull(),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [index("verifications_identifier_index").on(table.identifier)],
);

export const importDomains = ["canvas", "assets", "image-workbench", "video-workbench"] as const;
export type ImportDomain = (typeof importDomains)[number];
export type ImportStatus = "uploading" | "completed" | "failed";
export type ImportFileDescriptor = { storageKey: string; mimeType: string; bytes: number };
export type ImportDomainSummary = { domain: ImportDomain; records: number; files: number; bytes: number };
export type ImportSummary = { domains: ImportDomainSummary[]; totalFiles: number; totalBytes: number };

export const dataImport = pgTable(
    "data_imports",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        status: text("status").$type<ImportStatus>().notNull().default("uploading"),
        sourceVersion: integer("source_version").notNull().default(1),
        sourceId: text("source_id").notNull(),
        summary: jsonb("summary").$type<ImportSummary>().notNull(),
        error: text("error"),
        startedAt: timestampColumn("started_at").notNull().defaultNow(),
        completedAt: timestampColumn("completed_at"),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("data_imports_user_unique").on(table.userId), index("data_imports_status_index").on(table.status)],
);

export const userDataDomain = pgTable(
    "user_data_domains",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        importId: text("import_id")
            .notNull()
            .references(() => dataImport.id, { onDelete: "cascade" }),
        domain: text("domain").$type<ImportDomain>().notNull(),
        payload: jsonb("payload").$type<unknown>().notNull(),
        files: jsonb("files").$type<ImportFileDescriptor[]>().notNull(),
        checksum: text("checksum").notNull(),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("user_data_domains_user_domain_unique").on(table.userId, table.domain), index("user_data_domains_import_id_index").on(table.importId)],
);

export const userFile = pgTable(
    "user_files",
    {
        id: text("id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        importId: text("import_id")
            .notNull()
            .references(() => dataImport.id, { onDelete: "cascade" }),
        domain: text("domain").$type<ImportDomain>().notNull(),
        storageKey: text("storage_key").notNull(),
        objectKey: text("object_key").notNull(),
        mimeType: text("mime_type").notNull(),
        bytes: bigint("bytes", { mode: "number" }).notNull(),
        sha256: text("sha256").notNull(),
        createdAt: timestampColumn("created_at").notNull().defaultNow(),
        updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("user_files_user_storage_key_unique").on(table.userId, table.storageKey),
        uniqueIndex("user_files_object_key_unique").on(table.objectKey),
        index("user_files_import_id_index").on(table.importId),
    ],
);

export const authSchema = { user, session, account, verification };
export const appSchema = { ...authSchema, dataImport, userDataDomain, userFile };
