import axios from "axios";

import { readImageMeta } from "@/lib/image-utils";

export type UploadedVideoReferenceAsset = {
    url: string;
    bytes: number;
    mimeType: string;
    width?: number;
    height?: number;
    durationMs?: number;
};

export async function uploadVideoReferenceAsset(file: File, signal?: AbortSignal): Promise<UploadedVideoReferenceAsset> {
    const form = new FormData();
    form.append("file", file, file.name || "reference-asset");
    const response = await axios.post<{ path?: string }>("/api/video-assets", form, { signal });
    if (!response.data.path) throw new Error("临时素材服务没有返回访问地址");
    const url = new URL(response.data.path, window.location.origin).toString();
    const metadata = file.type.startsWith("image/") ? await readImageFileMeta(file) : file.type.startsWith("video/") ? await readVideoMeta(file) : file.type.startsWith("audio/") ? await readAudioMeta(file) : {};
    return { url, bytes: file.size, mimeType: file.type || "application/octet-stream", ...metadata };
}

export function isVideoReferenceAssetUrl(value: string, currentOrigin = typeof window === "undefined" ? "" : window.location.origin) {
    if (!value || !currentOrigin) return false;
    try {
        const url = new URL(value, currentOrigin);
        return url.origin === currentOrigin && /^\/video-assets\/\d{10}-[0-9a-f]{64}\.[a-z0-9]+$/i.test(url.pathname);
    } catch {
        return false;
    }
}

async function readImageFileMeta(file: File) {
    const url = URL.createObjectURL(file);
    try {
        return await readImageMeta(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

function readVideoMeta(file: File) {
    return readMediaMeta(document.createElement("video"), file).then((metadata) => ({ width: metadata.width || 1280, height: metadata.height || 720, durationMs: metadata.durationMs }));
}

function readAudioMeta(file: File) {
    return readMediaMeta(document.createElement("audio"), file).then((metadata) => ({ durationMs: metadata.durationMs }));
}

function readMediaMeta(element: HTMLVideoElement | HTMLAudioElement, file: File) {
    return new Promise<{ width?: number; height?: number; durationMs?: number }>((resolve) => {
        const url = URL.createObjectURL(file);
        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            const video = element instanceof HTMLVideoElement ? element : undefined;
            resolve({ width: video?.videoWidth, height: video?.videoHeight, durationMs: Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : undefined });
            URL.revokeObjectURL(url);
        };
        const timeout = window.setTimeout(done, 5000);
        element.onloadedmetadata = done;
        element.onerror = done;
        element.src = url;
    });
}
