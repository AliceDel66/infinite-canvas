import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";

import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";

import { auth } from "../auth.js";
import { deleteTemporaryVideoAsset, getTemporaryVideoAsset, uploadTemporaryVideoAsset } from "../object-storage.js";

const assetPattern = /^(\d{10})-[0-9a-f]{64}\.(?:jpg|png|webp|gif|mp4|mov|webm|mp3|wav|m4a)$/;
const ttlSeconds = 24 * 60 * 60;

export async function registerVideoAssetRoutes(app: FastifyInstance) {
    app.post("/api/video-assets", { config: { rateLimit: { max: 120, timeWindow: "1 hour" } } }, async (request, reply) => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (!session) return reply.code(401).send({ code: "UNAUTHORIZED", message: "请先登录" });
        const part = await request.file();
        if (!part) return reply.code(400).send({ code: "FILE_REQUIRED", message: "请选择参考素材" });
        const rule = mediaRule(part.mimetype, part.filename);
        if (!rule) return reply.code(415).send({ code: "UNSUPPORTED_MEDIA", message: "仅支持常用图片、视频和音频格式" });
        const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
        const assetId = `${expiresAt}-${randomBytes(32).toString("hex")}.${rule.extension}`;
        try {
            await uploadTemporaryVideoAsset({ assetId, mimeType: rule.mimeType, body: part.file, maxBytes: rule.maxBytes });
        } catch (error) {
            await deleteTemporaryVideoAsset(assetId).catch(() => undefined);
            throw error;
        }
        if (part.file.truncated) {
            await deleteTemporaryVideoAsset(assetId);
            return reply.code(413).send({ code: "FILE_TOO_LARGE", message: "参考素材超过大小限制" });
        }
        return { id: assetId, path: `/video-assets/${assetId}`, expires_at: expiresAt };
    });

    app.get<{ Params: { assetId: string } }>("/video-assets/:assetId", async (request, reply) => {
        const assetId = request.params.assetId;
        const match = assetId.match(assetPattern);
        if (!match) return reply.code(404).send();
        const expiresAt = Number(match[1]);
        if (expiresAt <= Math.floor(Date.now() / 1000)) {
            await deleteTemporaryVideoAsset(assetId).catch(() => undefined);
            return reply.code(404).send();
        }
        try {
            const object = await getTemporaryVideoAsset(assetId, request.headers.range);
            if (!object.Body) return reply.code(404).send();
            reply.header("content-type", object.ContentType || mediaRuleFromExtension(assetId));
            reply.header("cache-control", `public, max-age=${expiresAt - Math.floor(Date.now() / 1000)}`);
            reply.header("x-content-type-options", "nosniff");
            reply.header("accept-ranges", "bytes");
            if (object.ContentLength !== undefined) reply.header("content-length", object.ContentLength);
            if (object.ContentRange) reply.header("content-range", object.ContentRange).code(206);
            return reply.send(object.Body as Readable);
        } catch (error) {
            if (objectStatus(error) === 404) return reply.code(404).send();
            throw error;
        }
    });
}

function mediaRule(mimeType: string, filename: string) {
    const normalized = mimeType.toLowerCase().split(";", 1)[0];
    const rules: Record<string, { extension: string; maxBytes: number; mimeType: string }> = {
        "image/jpeg": { extension: "jpg", maxBytes: 30 * 1024 * 1024, mimeType: "image/jpeg" },
        "image/png": { extension: "png", maxBytes: 30 * 1024 * 1024, mimeType: "image/png" },
        "image/webp": { extension: "webp", maxBytes: 30 * 1024 * 1024, mimeType: "image/webp" },
        "image/gif": { extension: "gif", maxBytes: 30 * 1024 * 1024, mimeType: "image/gif" },
        "video/mp4": { extension: "mp4", maxBytes: 200 * 1024 * 1024, mimeType: "video/mp4" },
        "video/quicktime": { extension: "mov", maxBytes: 200 * 1024 * 1024, mimeType: "video/quicktime" },
        "video/webm": { extension: "webm", maxBytes: 200 * 1024 * 1024, mimeType: "video/webm" },
        "audio/mpeg": { extension: "mp3", maxBytes: 15 * 1024 * 1024, mimeType: "audio/mpeg" },
        "audio/wav": { extension: "wav", maxBytes: 15 * 1024 * 1024, mimeType: "audio/wav" },
        "audio/x-wav": { extension: "wav", maxBytes: 15 * 1024 * 1024, mimeType: "audio/wav" },
        "audio/mp4": { extension: "m4a", maxBytes: 15 * 1024 * 1024, mimeType: "audio/mp4" },
    };
    if (rules[normalized]) return rules[normalized];
    const extension = filename.toLowerCase().split(".").at(-1) || "";
    return Object.values(rules).find((rule) => rule.extension === extension);
}

function mediaRuleFromExtension(assetId: string) {
    const extension = assetId.split(".").at(-1);
    return extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : extension === "mov" ? "video/quicktime" : extension === "webm" ? "video/webm" : extension === "mp3" ? "audio/mpeg" : extension === "wav" ? "audio/wav" : extension === "m4a" ? "audio/mp4" : "video/mp4";
}

function objectStatus(error: unknown) {
    if (!error || typeof error !== "object" || !("$metadata" in error)) return undefined;
    return (error.$metadata as { httpStatusCode?: number }).httpStatusCode;
}
