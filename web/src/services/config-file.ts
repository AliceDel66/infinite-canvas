import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { createModelChannel, defaultConfig, modelOptionName, modelOptionsFromChannels, normalizeChannelModels, normalizeModelOptionValue, useConfigStore, type AiConfig, type WebdavSyncConfig } from "@/stores/use-config-store";
import { usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
        schedule: PromptSourceSchedule;
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources, schedule } = usePromptSourceStore.getState();
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config, webdav, promptSources: { sources, schedule } };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    const channels = (Array.isArray(data.config.channels) ? data.config.channels : []).map((channel) => createModelChannel(channel));
    const normalizedChannels = channels.length
        ? channels
        : [
              createModelChannel({
                  id: "default",
                  name: i18n.t("config.channels.defaultName"),
                  baseUrl: data.config.baseUrl || defaultConfig.baseUrl,
                  apiKey: data.config.apiKey || "",
                  apiFormat: data.config.apiFormat || defaultConfig.apiFormat,
                  models: normalizeChannelModels([data.config.model, data.config.imageModel, data.config.videoModel, data.config.textModel, data.config.audioModel].map(modelOptionName)),
              }),
          ];
    const config = {
        ...defaultConfig,
        ...data.config,
        channels: normalizedChannels,
        models: modelOptionsFromChannels(normalizedChannels),
        videoReferenceMode: data.config.videoReferenceMode || defaultConfig.videoReferenceMode,
        imageModel: normalizeModelOptionValue(data.config.imageModel || data.config.model, normalizedChannels),
        videoModel: normalizeModelOptionValue(data.config.videoModel, normalizedChannels),
        textModel: normalizeModelOptionValue(data.config.textModel || data.config.model, normalizedChannels),
        audioModel: normalizeModelOptionValue(data.config.audioModel || defaultConfig.audioModel, normalizedChannels),
    };
    useConfigStore.setState({ config, webdav: data.webdav });
    usePromptSourceStore.setState(data.promptSources);
}
