import "dotenv/config";
import { z } from "zod";

const optionalUrl = z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : undefined), z.url().optional());
const optionalText = z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : undefined), z.string().optional());

const envSchema = z
    .object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        PORT: z.coerce.number().int().positive().default(3002),
        DATABASE_URL: z.url(),
        APP_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),
        BETTER_AUTH_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(32),
        S3_ENDPOINT: z.url(),
        S3_REGION: z.string().min(1).default("us-east-1"),
        S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
        S3_ACCESS_KEY_ID: z.string().min(3),
        S3_SECRET_ACCESS_KEY: z.string().min(8),
        S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
        IMPORT_MAX_DOMAIN_BYTES: z.coerce.number().int().positive().default(16 * 1024 * 1024),
        IMPORT_MAX_FILE_BYTES: z.coerce.number().int().positive().default(256 * 1024 * 1024),
        IMPORT_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024 * 1024),
        SUB2API_OIDC_DISCOVERY_URL: optionalUrl,
        SUB2API_CLIENT_ID: optionalText,
        SUB2API_CLIENT_SECRET: optionalText,
    })
    .superRefine((value, context) => {
        const configured = [value.SUB2API_OIDC_DISCOVERY_URL, value.SUB2API_CLIENT_ID, value.SUB2API_CLIENT_SECRET].filter(Boolean).length;
        if (configured !== 0 && configured !== 3) {
            context.addIssue({ code: "custom", path: ["SUB2API_OIDC_DISCOVERY_URL"], message: "Sub2API OIDC requires discovery URL, client ID, and client secret together" });
        }
    });

const env = envSchema.parse(process.env);

export const config = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    appOrigins: env.APP_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean),
    betterAuthUrl: env.BETTER_AUTH_URL.replace(/\/+$/, ""),
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    objectStorage: {
        endpoint: env.S3_ENDPOINT.replace(/\/+$/, ""),
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    },
    importLimits: {
        domainBytes: env.IMPORT_MAX_DOMAIN_BYTES,
        fileBytes: env.IMPORT_MAX_FILE_BYTES,
        totalBytes: env.IMPORT_MAX_TOTAL_BYTES,
    },
    sub2api:
        env.SUB2API_OIDC_DISCOVERY_URL && env.SUB2API_CLIENT_ID && env.SUB2API_CLIENT_SECRET
            ? {
                  discoveryUrl: env.SUB2API_OIDC_DISCOVERY_URL,
                  clientId: env.SUB2API_CLIENT_ID,
                  clientSecret: env.SUB2API_CLIENT_SECRET,
              }
            : null,
};
