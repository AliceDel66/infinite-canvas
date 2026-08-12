export type ModelCapabilityAdapter = "auto" | "uniart";

export type CatalogVideoCapability = {
    modes: Array<{ id: string; inputTypes: string[] }>;
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

export type CatalogImageCapability = {
    resolutions?: string[];
    supportsGeneration?: boolean;
    supportsEdit?: boolean;
};

export type ModelCapabilityCatalogEntry = {
    capability: "image" | "video" | "text" | "audio";
    videoCapability?: CatalogVideoCapability;
    imageCapability?: CatalogImageCapability;
};

const seedanceModes = [
    { id: "text_to_video", inputTypes: ["text"] },
    { id: "image_to_video", inputTypes: ["text", "image"] },
    { id: "image_reference", inputTypes: ["text", "image"] },
    { id: "first_last_frame", inputTypes: ["text", "image"] },
    { id: "omni_reference", inputTypes: ["text", "image", "video", "audio"] },
];
const seedanceRatios = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const seedanceDurations = Array.from({ length: 12 }, (_, index) => index + 4);

function seedanceVideoCapability(
    value: Omit<CatalogVideoCapability, "modes" | "ratios" | "durations"> & { ratios?: string[]; durations?: number[] } = {},
): CatalogVideoCapability {
    return {
        modes: seedanceModes,
        ...(value.resolutions ? { resolutions: value.resolutions } : {}),
        ...(value.ratios === undefined ? {} : { ratios: value.ratios }),
        ...(value.durations === undefined ? {} : { durations: value.durations }),
        ...value,
    };
}

const imageCapability: CatalogImageCapability = {
    resolutions: ["1k", "2k", "4k"],
    supportsGeneration: true,
    supportsEdit: true,
};

// Snapshot supplied by the UniArt capability endpoint. It is only applied to
// channels whose adapter is explicitly set to "uniart"; ordinary Sub2API
// channels never read this table even when they expose a model with the same ID.
const uniArtCatalog: Record<string, ModelCapabilityCatalogEntry> = {
    "gpt-image-2": { capability: "image", imageCapability },
    "gpt-image-2-special": { capability: "image", imageCapability },
    "nano-banana-2-special": { capability: "image", imageCapability },
    "minimax-h3-vip": {
        capability: "video",
        videoCapability: {
            modes: [
                { id: "text_to_video", inputTypes: ["text"] },
                { id: "image_to_video", inputTypes: ["text", "image"] },
                { id: "omni_reference", inputTypes: ["text", "image", "audio"] },
            ],
            resolutions: ["2k"],
            ratios: ["auto", "1:1", "16:9", "9:16", "3:4", "4:3", "21:9"],
            durations: Array.from({ length: 11 }, (_, index) => index + 5),
            defaultResolution: "2k",
            defaultRatio: "16:9",
            defaultDuration: 15,
            supportsGenerateAudio: false,
        },
    },
    "seedance-2.0-fast-vip": {
        capability: "video",
        videoCapability: seedanceVideoCapability({ resolutions: ["480p", "720p"], ratios: seedanceRatios, durations: seedanceDurations, defaultResolution: "720p", defaultRatio: "16:9", defaultDuration: 15, maxReferenceImages: 9, maxReferenceVideos: 3, maxReferenceAudios: 3, supportsGenerateAudio: true }),
    },
    "seedance-2.0-mini-special": { capability: "video", videoCapability: seedanceVideoCapability() },
    "seedance-2.0-vip": {
        capability: "video",
        videoCapability: seedanceVideoCapability({ resolutions: ["480p", "720p", "1080p"], ratios: seedanceRatios, durations: seedanceDurations, defaultResolution: "720p", defaultRatio: "16:9", defaultDuration: 15, maxReferenceImages: 9, maxReferenceVideos: 3, maxReferenceAudios: 3, supportsGenerateAudio: true }),
    },
    "seedance-2.0-fast-discount": {
        capability: "video",
        videoCapability: seedanceVideoCapability({ resolutions: ["480p", "720p"], ratios: seedanceRatios, durations: seedanceDurations, maxReferenceImages: 4, maxReferenceVideos: 3, maxReferenceAudios: 1 }),
    },
    "seedance-2.0-fast-special": { capability: "video", videoCapability: seedanceVideoCapability() },
    "seedance-2.0-discount": {
        capability: "video",
        videoCapability: seedanceVideoCapability({ resolutions: ["480p", "720p"], ratios: seedanceRatios, durations: seedanceDurations, maxReferenceImages: 4, maxReferenceVideos: 3, maxReferenceAudios: 1, supportsGenerateAudio: true }),
    },
    "seedance-2.0-special": {
        capability: "video",
        videoCapability: seedanceVideoCapability({ resolutions: ["480p", "720p", "1080p"], ratios: seedanceRatios, durations: seedanceDurations, maxReferenceImages: 9, maxReferenceVideos: 3, maxReferenceAudios: 3, supportsGenerateAudio: true }),
    },
    "seedance-2.5-discount": { capability: "video", videoCapability: seedanceVideoCapability() },
    "seedance-2.5-vip": { capability: "video", videoCapability: seedanceVideoCapability() },
};

export function modelCapabilityCatalogEntry(adapter: ModelCapabilityAdapter, modelName: string) {
    if (adapter !== "uniart") return undefined;
    return uniArtCatalog[modelName.trim().toLowerCase()];
}
