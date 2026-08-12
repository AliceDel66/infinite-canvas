import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export type AuthCapabilities = {
    emailPassword: boolean;
    registration: boolean;
    sub2api: boolean;
};

export const authClient = createAuthClient({
    baseURL: window.location.origin,
    basePath: "/api/auth",
    plugins: [genericOAuthClient()],
});

export type AuthSessionData = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>["data"]>;

export async function fetchAuthCapabilities(): Promise<AuthCapabilities> {
    const response = await fetch("/api/v1/auth/capabilities", { credentials: "include" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<AuthCapabilities>;
}
