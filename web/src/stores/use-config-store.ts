import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import i18n from "@/i18n";
import { modelCapabilityCatalogEntry, type ModelCapabilityAdapter } from "@/lib/model-capability-catalog";

export type ApiCallFormat = "openai" | "gemini" | "ark";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";
export type VideoReferenceMode = "text_to_video" | "image_to_video" | "image_reference" | "first_last_frames" | "omni_reference";
export type VideoCapabilityModeId = "text_to_video" | "image_to_video" | "image_reference" | "first_last_frame" | "omni_reference";
export type VideoCapability = {
    modes: Array<{ id: VideoCapabilityModeId; inputTypes: Array<"text" | "image" | "video" | "audio"> }>;
    resolutions?: string[];
    ratios?: string[];
    durations?: number[];
    defaultResolution?: string;
    defaultRatio?: string;
    defaultDuration?: number;
    maxReferenceImages?: number;
    maxReferenceVideos?: number;
    maxReferenceAudios?: number;
    supportsGenerateAudio?: boolean;
};
export type ImageCapability = {
    resolutions?: string[];
    supportsGeneration?: boolean;
    supportsEdit?: boolean;
};

export type ChannelModel = {
    name: string;
    capability: ModelCapability;
    videoCapability?: VideoCapability;
    imageCapability?: ImageCapability;
    script?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    capabilityAdapter: ModelCapabilityAdapter;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoReferenceMode: VideoReferenceMode;
    systemPrompt: string;
    reasoningEffort: ReasoningEffort;
    models: string[];
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "preferences" | "prompt-sources" | "webdav" | "local-storage";

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const DEFAULT_OPENAI_BASE_URL = "https://api.zgonline.top/";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: i18n.t("config.channels.defaultName"),
            baseUrl: DEFAULT_OPENAI_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            capabilityAdapter: "uniart",
            models: [
                { name: "gpt-image-2", capability: "image" },
                { name: "grok-imagine-video", capability: "video" },
                { name: "gpt-5.5", capability: "text" },
                { name: "gpt-4o-mini-tts", capability: "audio" },
            ],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::grok-imagine-video",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoReferenceMode: "image_reference",
    systemPrompt: "",
    reasoningEffort: "auto",
    models: ["default::gpt-image-2", "default::grok-imagine-video", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["seedance", "video", "sora", "veo", "kling", "wan", "hailuo"];
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return findChannelModel(config, value)?.model.capability;
}

export function videoCapabilityOf(config: AiConfig, value: string): VideoCapability | undefined {
    return findChannelModel(config, value)?.model.videoCapability;
}

export function imageCapabilityOf(config: AiConfig, value: string): ImageCapability | undefined {
    return findChannelModel(config, value)?.model.imageCapability;
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilityOf(config, value) === capability;
}

export function resolveModelForCapability(config: AiConfig, currentModel: string | undefined, capability: ModelCapability) {
    const defaultModel = capability === "image" ? config.imageModel : capability === "video" ? config.videoModel : capability === "audio" ? config.audioModel : config.textModel;
    const fallbackModel = capability === "image" ? defaultConfig.imageModel : capability === "video" ? defaultConfig.videoModel : capability === "audio" ? defaultConfig.audioModel : defaultConfig.textModel;
    if (currentModel && modelMatchesCapability(config, currentModel, capability)) return currentModel;
    if (defaultModel && modelMatchesCapability(config, defaultModel, capability)) return defaultModel;
    return fallbackModel;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === capability).map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string) {
    return findChannelModel(config, value)?.model.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        imageModel: normalizeModelOptionValue(config.imageModel || config.model, channels),
                        videoModel: normalizeModelOptionValue(config.videoModel, channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        reasoningEffort: config.reasoningEffort || "auto",
                        videoSeconds: config.videoSeconds || "6",
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoReferenceMode: config.videoReferenceMode || "image_reference",
                        canvasImageCount: config.canvasImageCount || "3",
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined, adapter: ModelCapabilityAdapter = "auto"): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const catalog = modelCapabilityCatalogEntry(adapter, name);
        const capability = catalog?.capability || (typeof item === "string" ? guessCapability(name) : item.capability || guessCapability(name));
        const script = typeof item === "string" ? undefined : item.script?.trim() || undefined;
        const storedVideoCapability = typeof item === "string" ? undefined : item.videoCapability;
        const storedImageCapability = typeof item === "string" ? undefined : item.imageCapability;
        const videoCapability = normalizeVideoCapability((catalog?.videoCapability || storedVideoCapability ? { ...catalog?.videoCapability, ...storedVideoCapability } : undefined) as VideoCapability | undefined);
        const imageCapability = normalizeImageCapability((catalog?.imageCapability || storedImageCapability ? { ...catalog?.imageCapability, ...storedImageCapability } : undefined) as ImageCapability | undefined);
        result.push({ name, capability, videoCapability, imageCapability, script });
    }
    return result;
}

export function stripChannelModelCapabilities(models: ChannelModel[]) {
    return models.map((model) => ({ name: model.name, capability: model.capability, script: model.script }));
}

export function normalizeVideoCapability(value: VideoCapability | undefined): VideoCapability | undefined {
    const allowedModes = new Set<VideoCapabilityModeId>(["text_to_video", "image_to_video", "image_reference", "first_last_frame", "omni_reference"]);
    const allowedInputs = new Set<"text" | "image" | "video" | "audio">(["text", "image", "video", "audio"]);
    const modes = (Array.isArray(value?.modes) ? value.modes : [])
        .filter((mode) => allowedModes.has(mode.id))
        .map((mode) => ({ id: mode.id, inputTypes: Array.from(new Set((Array.isArray(mode.inputTypes) ? mode.inputTypes : []).filter((input) => allowedInputs.has(input)))) }));
    if (!modes.length) return undefined;
    const resolutions = normalizeCapabilityStrings(value?.resolutions, true);
    const ratios = normalizeCapabilityStrings(value?.ratios);
    const durations = Array.from(new Set((Array.isArray(value?.durations) ? value.durations : []).map(Number).filter((item) => Number.isInteger(item) && item > 0))).sort((left, right) => left - right);
    const defaultResolution = resolutions.find((item) => item === value?.defaultResolution?.trim().toLowerCase());
    const defaultRatio = ratios.find((item) => item === value?.defaultRatio?.trim());
    const defaultDuration = durations.includes(Number(value?.defaultDuration)) ? Number(value?.defaultDuration) : undefined;
    const maxReferenceImages = normalizePositiveInteger(value?.maxReferenceImages);
    const maxReferenceVideos = normalizePositiveInteger(value?.maxReferenceVideos);
    const maxReferenceAudios = normalizePositiveInteger(value?.maxReferenceAudios);
    return {
        modes,
        ...(resolutions.length ? { resolutions } : {}),
        ...(ratios.length ? { ratios } : {}),
        ...(durations.length ? { durations } : {}),
        ...(defaultResolution ? { defaultResolution } : {}),
        ...(defaultRatio ? { defaultRatio } : {}),
        ...(defaultDuration ? { defaultDuration } : {}),
        ...(maxReferenceImages ? { maxReferenceImages } : {}),
        ...(maxReferenceVideos ? { maxReferenceVideos } : {}),
        ...(maxReferenceAudios ? { maxReferenceAudios } : {}),
        ...(typeof value?.supportsGenerateAudio === "boolean" ? { supportsGenerateAudio: value.supportsGenerateAudio } : {}),
    };
}

export function normalizeImageCapability(value: ImageCapability | undefined): ImageCapability | undefined {
    if (!value) return undefined;
    const resolutions = normalizeCapabilityStrings(value.resolutions, true);
    const supportsGeneration = typeof value.supportsGeneration === "boolean" ? value.supportsGeneration : undefined;
    const supportsEdit = typeof value.supportsEdit === "boolean" ? value.supportsEdit : undefined;
    if (!resolutions.length && supportsGeneration === undefined && supportsEdit === undefined) return undefined;
    return {
        ...(resolutions.length ? { resolutions } : {}),
        ...(supportsGeneration !== undefined ? { supportsGeneration } : {}),
        ...(supportsEdit !== undefined ? { supportsEdit } : {}),
    };
}

function normalizeCapabilityStrings(values: string[] | undefined, lowercase = false) {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean).map((item) => (lowercase ? item.toLowerCase() : item))));
}

function normalizePositiveInteger(value: unknown) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    const baseUrl = channel?.baseUrl?.trim() || defaultBaseUrlForApiFormat(apiFormat);
    const ownCapabilityEndpoint = isUniArtManagedBaseUrl(baseUrl);
    const capabilityAdapter = ownCapabilityEndpoint && channel?.capabilityAdapter !== "auto" ? "uniart" : "auto";
    const models = channel?.capabilityAdapter === "uniart" && !ownCapabilityEndpoint ? stripChannelModelCapabilities(normalizeChannelModels(channel.models)) : channel?.models;
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || i18n.t("config.channels.newName"),
        baseUrl,
        apiKey: channel?.apiKey || "",
        apiFormat,
        capabilityAdapter,
        models: normalizeChannelModels(models, capabilityAdapter),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: i18n.t("config.channels.defaultName"), baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName).map((name) => ({ name, capability: guessCapability(name) })) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? i18n.t("config.channels.defaultName") : i18n.t("config.channels.indexedName", { index: index + 1 })),
            models: normalizeChannelModels(channel.models),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: i18n.t("config.channels.defaultName"),
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName)),
            }),
        );
    }
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    if (apiFormat === "ark") return ARK_BASE_URL;
    return DEFAULT_OPENAI_BASE_URL;
}

function isUniArtManagedBaseUrl(baseUrl: string) {
    try {
        return new URL(baseUrl).hostname.toLowerCase() === "api.zgonline.top";
    } catch {
        return false;
    }
}

export function isUniArtCapabilityBaseUrl(baseUrl: string) {
    return isUniArtManagedBaseUrl(baseUrl);
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" || apiFormat === "ark" ? apiFormat : "openai";
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
