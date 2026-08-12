import localforage from "localforage";

import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { DataImportDomain, DataImportFile, DataImportSnapshot } from "@/services/api/data-import";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";

type StoredLog = Record<string, unknown> & { id?: string };
type DomainSource = { domain: DataImportDomain; records: number; payload: unknown };

const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const storageKeyPattern = /^(image|video|audio|file|video-reference|audio-reference):/;
const redactedKeys = new Set(["apikey", "accesstoken", "refreshtoken", "password", "secret", "authorization"]);

export async function readLocalDataImportSnapshot(): Promise<DataImportSnapshot> {
    await Promise.all([waitForHydration(useCanvasStore), waitForHydration(useAssetStore)]);
    const [imageLogs, videoLogs] = await Promise.all([readStoredLogs(imageLogStore), readStoredLogs(videoLogStore)]);
    const sources: DomainSource[] = [
        { domain: "canvas", records: useCanvasStore.getState().projects.length, payload: { projects: useCanvasStore.getState().projects } },
        { domain: "assets", records: useAssetStore.getState().assets.length, payload: { assets: useAssetStore.getState().assets } },
        { domain: "image-workbench", records: imageLogs.length, payload: { logs: imageLogs } },
        { domain: "video-workbench", records: videoLogs.length, payload: { logs: videoLogs } },
    ];

    const files = new Map<string, DataImportFile>();
    let missingFiles = 0;
    const domains = [] as DataImportSnapshot["domains"];
    for (const source of sources) {
        const payload = sanitizeForCloud(source.payload);
        const descriptors: DataImportSnapshot["domains"][number]["files"] = [];
        for (const storageKey of collectStorageKeys(payload).sort()) {
            const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) {
                missingFiles += 1;
                continue;
            }
            const descriptor = { storageKey, mimeType: blob.type || "application/octet-stream", bytes: blob.size };
            descriptors.push(descriptor);
            if (!files.has(storageKey)) files.set(storageKey, { domain: source.domain, blob, ...descriptor });
        }
        domains.push({ domain: source.domain, records: source.records, payload, files: descriptors, bytes: descriptors.reduce((total, file) => total + file.bytes, 0) });
    }

    const uniqueFiles = [...files.values()].sort((a, b) => a.storageKey.localeCompare(b.storageKey));
    const sourceId = await sha256(
        JSON.stringify({
            version: 1,
            domains: domains.map(({ domain, payload, files: domainFiles }) => ({ domain, payload, files: domainFiles })),
        }),
    );
    return {
        sourceVersion: 1,
        sourceId,
        domains,
        files: uniqueFiles,
        totalRecords: domains.reduce((total, domain) => total + domain.records, 0),
        totalFiles: uniqueFiles.length,
        totalBytes: uniqueFiles.reduce((total, file) => total + file.bytes, 0),
        missingFiles,
    };
}

async function readStoredLogs(store: typeof imageLogStore) {
    const logs: StoredLog[] = [];
    await store.iterate<StoredLog, void>((value) => {
        if (value && typeof value === "object") logs.push(value);
    });
    return logs.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (typeof value === "string") {
        if (storageKeyPattern.test(value)) keys.add(value);
        return [...keys];
    }
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && storageKeyPattern.test(value.storageKey)) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function sanitizeForCloud<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (key, item) => {
            if (redactedKeys.has(key.toLowerCase())) return undefined;
            if (typeof item === "string" && item.startsWith("blob:")) return "";
            return item;
        }),
    ) as T;
}

function waitForHydration<T extends { hydrated: boolean }>(store: { getState: () => T; subscribe: (listener: (state: T) => void) => () => void }) {
    if (store.getState().hydrated) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsubscribe = store.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

async function sha256(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
