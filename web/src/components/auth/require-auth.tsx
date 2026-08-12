import { Button } from "antd";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useUserStore } from "@/stores/use-user-store";

export function RequireAuth() {
    const { t } = useTranslation();
    const location = useLocation();
    const status = useUserStore((state) => state.status);
    const initializeSession = useUserStore((state) => state.initializeSession);

    useEffect(() => {
        if (status === "loading") void initializeSession();
    }, [initializeSession, status]);

    if (status === "loading") {
        return (
            <div className="flex h-full items-center justify-center bg-background text-stone-500">
                <LoaderCircle className="size-5 animate-spin" aria-label={t("auth.loading")} />
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
                <div>
                    <h1 className="text-lg font-semibold text-foreground">{t("auth.backendUnavailable")}</h1>
                    <p className="mt-1 text-sm text-stone-500">{t("auth.backendUnavailableDescription")}</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} onClick={() => void initializeSession()}>
                    {t("auth.retry")}
                </Button>
            </div>
        );
    }

    if (status !== "authenticated") {
        return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
    }

    return <Outlet />;
}
