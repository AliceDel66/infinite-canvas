import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";

import { createModelChannel, isUniArtCapabilityBaseUrl, stripChannelModelCapabilities, useConfigStore } from "@/stores/use-config-store";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { useUserStore } from "@/stores/use-user-store";
import { AccountDataImport } from "@/components/auth/account-data-import";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const handledConfigParams = useRef(false);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const initializeSession = useUserStore((state) => state.initializeSession);

    usePromptSourceScheduler();

    useEffect(() => {
        void initializeSession();
    }, [initializeSession]);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const baseUrl = searchParams.get("baseUrl") || searchParams.get("baseurl");
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        const firstChannel = config.channels[0];
        updateConfig(
            "channels",
            firstChannel
                ? config.channels.map((channel, index) =>
                      index === 0
                          ? createModelChannel({
                                ...channel,
                                ...(baseUrl ? { baseUrl, capabilityAdapter: isUniArtCapabilityBaseUrl(baseUrl) ? "uniart" : "auto" } : {}),
                                ...(apiKey ? { apiKey } : {}),
                                models:
                                    baseUrl && !isUniArtCapabilityBaseUrl(baseUrl)
                                        ? stripChannelModelCapabilities(channel.models)
                                        : channel.models,
                            })
                          : channel,
                  )
                : [createModelChannel({ id: "default", name: t("config.channels.defaultName"), baseUrl: baseUrl || undefined, apiKey: apiKey || "" })],
        );
        if (baseUrl) updateConfig("baseUrl", baseUrl);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
        message.success(t("config.importedDirectConfig"));
    }, [config.channels, message, openConfigDialog, t, updateConfig]);

    return (
        <>
            {children}
            <AccountDataImport />
        </>
    );
}
