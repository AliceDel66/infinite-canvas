import { create } from "zustand";

import { authClient, fetchAuthCapabilities, type AuthCapabilities, type AuthSessionData } from "@/services/api/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
export type AuthUser = AuthSessionData["user"];

type UserStore = {
    user: AuthUser | null;
    status: AuthStatus;
    capabilities: AuthCapabilities;
    error: string;
    initializeSession: () => Promise<void>;
    refreshSession: () => Promise<void>;
    clearSession: () => void;
};

const defaultCapabilities: AuthCapabilities = { emailPassword: true, registration: true, sub2api: false };
let initialization: Promise<void> | null = null;

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    status: "loading",
    capabilities: defaultCapabilities,
    error: "",
    initializeSession: async () => {
        if (initialization) return initialization;
        set({ status: "loading", error: "" });
        initialization = Promise.all([authClient.getSession(), fetchAuthCapabilities()])
            .then(([session, capabilities]) => {
                if (session.error) throw new Error(session.error.message || "Session unavailable");
                set({
                    user: session.data?.user || null,
                    status: session.data?.user ? "authenticated" : "unauthenticated",
                    capabilities,
                    error: "",
                });
            })
            .catch((error) => set({ user: null, status: "error", error: error instanceof Error ? error.message : String(error) }))
            .finally(() => {
                initialization = null;
            });
        return initialization;
    },
    refreshSession: async () => {
        const session = await authClient.getSession({ query: { disableCookieCache: true } });
        if (session.error) throw new Error(session.error.message || "Session unavailable");
        set({ user: session.data?.user || null, status: session.data?.user ? "authenticated" : "unauthenticated", error: "" });
    },
    clearSession: () => set({ user: null, status: "unauthenticated", error: "" }),
}));
