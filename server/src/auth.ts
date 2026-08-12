import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

import { config } from "./config.js";
import { db } from "./db/client.js";
import { authSchema } from "./db/schema.js";

const oauthProviders = config.sub2api
    ? [
          {
              providerId: "sub2api",
              discoveryUrl: config.sub2api.discoveryUrl,
              clientId: config.sub2api.clientId,
              clientSecret: config.sub2api.clientSecret,
              scopes: ["openid", "profile", "email"],
              pkce: true,
              requireIssuerValidation: true,
          },
      ]
    : [];

export const auth = betterAuth({
    appName: "Infinite Canvas",
    baseURL: config.betterAuthUrl,
    basePath: "/api/auth",
    secret: config.betterAuthSecret,
    trustedOrigins: config.appOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        maxPasswordLength: 128,
    },
    account: {
        accountLinking: {
            enabled: true,
            disableImplicitLinking: true,
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: { enabled: false },
    },
    advanced: {
        defaultCookieAttributes: {
            httpOnly: true,
            secure: config.betterAuthUrl.startsWith("https://"),
            sameSite: "lax",
            path: "/",
        },
    },
    plugins: oauthProviders.length ? [genericOAuth({ config: oauthProviders })] : [],
});
