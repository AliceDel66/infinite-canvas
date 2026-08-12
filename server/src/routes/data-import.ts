import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { fromNodeHeaders } from "better-auth/node";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { auth } from "../auth.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { dataImport, importDomains, type ImportDomain, userDataDomain, userFile } from "../db/schema.js";
import { deleteUserFile, getUserFile, uploadUserFile } from "../object-storage.js";

const domainSchema = z.enum(importDomains);
const storageKeySchema = z.string().min(1).max(512).regex(/^(image|video|audio|file|video-reference|audio-reference):/);
const fileDescriptorSchema = z.object({
    storageKey: storageKeySchema,
    mimeType: z.string().max(127).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
    bytes: z.number().int().positive(),
});
const summaryDomainSchema = z.object({
    domain: domainSchema,
    records: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
});
const startSchema = z.object({
    sourceVersion: z.literal(1),
    sourceId: z.string().regex(/^[a-f0-9]{64}$/),
    domains: z.array(summaryDomainSchema).length(importDomains.length),
    totalFiles: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative(),
});
const domainBodySchema = z.object({
    payload: z.unknown(),
    files: z.array(fileDescriptorSchema).max(20_000),
});

export async function registerDataImportRoutes(app: FastifyInstance) {
    app.get("/api/v1/data-import", async (request, reply) => {
        const userId = await requireUserId(request, reply);
        if (!userId) return;
        return getImportStatus(userId);
    });

    app.post("/api/v1/data-import/start", async (request, reply) => {
        const userId = await requireUserId(request, reply);
        if (!userId) return;
        const summary = startSchema.parse(request.body);
        validateSummary(summary);

        const existing = await findImport(userId);
        if (existing) {
            if (existing.status === "completed" || existing.sourceId === summary.sourceId) return getImportStatus(userId);
            return reply.code(409).send({ code: "IMPORT_ALREADY_STARTED", message: "此账户已有另一批本地数据正在导入，请回到原设备继续" });
        }

        await db
            .insert(dataImport)
            .values({ id: randomUUID(), userId, sourceVersion: summary.sourceVersion, sourceId: summary.sourceId, summary })
            .onConflictDoNothing({ target: dataImport.userId });
        const created = await findImport(userId);
        if (created?.sourceId !== summary.sourceId) return reply.code(409).send({ code: "IMPORT_ALREADY_STARTED", message: "此账户已有另一批本地数据正在导入，请回到原设备继续" });
        return reply.code(201).send(await getImportStatus(userId));
    });

    app.put<{ Params: { importId: string; domain: string } }>(
        "/api/v1/data-import/:importId/domains/:domain",
        { bodyLimit: config.importLimits.domainBytes },
        async (request, reply) => {
            const userId = await requireUserId(request, reply);
            if (!userId) return;
            const domain = domainSchema.parse(request.params.domain);
            const current = await requireOpenImport(userId, request.params.importId, reply);
            if (!current) return;
            const body = domainBodySchema.parse(request.body);
            validateFileDescriptors(body.files, current.summary.domains.find((item) => item.domain === domain));
            const checksum = createHash("sha256").update(JSON.stringify(body)).digest("hex");

            await db
                .insert(userDataDomain)
                .values({ id: randomUUID(), userId, importId: current.id, domain, payload: body.payload, files: body.files, checksum })
                .onConflictDoUpdate({
                    target: [userDataDomain.userId, userDataDomain.domain],
                    set: { importId: current.id, payload: body.payload, files: body.files, checksum, updatedAt: new Date() },
                });
            return { domain, checksum };
        },
    );

    app.post<{ Params: { importId: string }; Querystring: { domain?: string; storageKey?: string } }>(
        "/api/v1/data-import/:importId/files",
        { config: { rateLimit: { max: 3_000, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const userId = await requireUserId(request, reply);
            if (!userId) return;
            const current = await requireOpenImport(userId, request.params.importId, reply);
            if (!current) return;
            const domain = domainSchema.parse(request.query.domain);
            const storageKey = storageKeySchema.parse(request.query.storageKey);
            const [manifest] = await db
                .select({ files: userDataDomain.files })
                .from(userDataDomain)
                .where(and(eq(userDataDomain.userId, userId), eq(userDataDomain.importId, current.id), eq(userDataDomain.domain, domain)))
                .limit(1);
            const expected = manifest?.files.find((item) => item.storageKey === storageKey);
            if (!expected) return reply.code(409).send({ code: "FILE_NOT_DECLARED", message: "请先上传包含此文件的数据清单" });

            const part = await request.file();
            if (!part) return reply.code(400).send({ code: "FILE_REQUIRED", message: "请选择文件" });
            if (part.mimetype !== expected.mimeType) return reply.code(422).send({ code: "FILE_TYPE_MISMATCH", message: "文件类型与清单不一致" });

            const uploaded = await uploadUserFile({
                userId,
                storageKey,
                mimeType: expected.mimeType,
                body: part.file,
                maxBytes: Math.min(config.importLimits.fileBytes, expected.bytes),
            });
            if (part.file.truncated || uploaded.bytes !== expected.bytes) {
                await deleteUserFile(uploaded.objectKey);
                return reply.code(422).send({ code: "FILE_SIZE_MISMATCH", message: "文件大小与清单不一致" });
            }

            await db
                .insert(userFile)
                .values({ id: randomUUID(), userId, importId: current.id, domain, storageKey, mimeType: expected.mimeType, ...uploaded })
                .onConflictDoUpdate({
                    target: [userFile.userId, userFile.storageKey],
                    set: { importId: current.id, domain, mimeType: expected.mimeType, ...uploaded, updatedAt: new Date() },
                });
            return uploaded;
        },
    );

    app.post<{ Params: { importId: string } }>("/api/v1/data-import/:importId/complete", async (request, reply) => {
        const userId = await requireUserId(request, reply);
        if (!userId) return;
        const current = await findImport(userId);
        if (!current || current.id !== request.params.importId) return reply.code(404).send({ code: "IMPORT_NOT_FOUND", message: "未找到导入任务" });
        if (current.status === "completed") return getImportStatus(userId);

        await db.transaction(async (tx) => {
            const domains = await tx
                .select({ domain: userDataDomain.domain, files: userDataDomain.files })
                .from(userDataDomain)
                .where(and(eq(userDataDomain.userId, userId), eq(userDataDomain.importId, current.id)));
            if (domains.length !== importDomains.length || importDomains.some((domain) => !domains.some((item) => item.domain === domain))) {
                throw requestError(409, "IMPORT_INCOMPLETE", "本地数据清单尚未全部上传");
            }

            const declaredFiles = new Map<string, { mimeType: string; bytes: number }>();
            for (const item of domains) {
                for (const file of item.files) {
                    const previous = declaredFiles.get(file.storageKey);
                    if (previous && (previous.mimeType !== file.mimeType || previous.bytes !== file.bytes)) {
                        throw requestError(409, "FILE_DESCRIPTOR_CONFLICT", "同一本地文件在多个数据域中的描述不一致");
                    }
                    declaredFiles.set(file.storageKey, file);
                }
            }
            const files = await tx
                .select({ storageKey: userFile.storageKey })
                .from(userFile)
                .where(and(eq(userFile.userId, userId), eq(userFile.importId, current.id)));
            const uploadedKeys = new Set(files.map((file) => file.storageKey));
            const declaredBytes = [...declaredFiles.values()].reduce((total, file) => total + file.bytes, 0);
            if (declaredFiles.size !== current.summary.totalFiles || declaredBytes !== current.summary.totalBytes || [...declaredFiles.keys()].some((key) => !uploadedKeys.has(key))) {
                throw requestError(409, "IMPORT_INCOMPLETE", "本地媒体尚未全部上传");
            }

            await tx
                .update(dataImport)
                .set({ status: "completed", completedAt: new Date(), updatedAt: new Date(), error: null })
                .where(and(eq(dataImport.id, current.id), eq(dataImport.userId, userId)));
        });
        return getImportStatus(userId);
    });

    app.get<{ Params: { domain: string } }>("/api/v1/data/domains/:domain", async (request, reply) => {
        const userId = await requireUserId(request, reply);
        if (!userId) return;
        const domain = domainSchema.parse(request.params.domain);
        const [record] = await db
            .select({ payload: userDataDomain.payload, files: userDataDomain.files, checksum: userDataDomain.checksum, updatedAt: userDataDomain.updatedAt })
            .from(userDataDomain)
            .where(and(eq(userDataDomain.userId, userId), eq(userDataDomain.domain, domain)))
            .limit(1);
        if (!record) return reply.code(404).send({ code: "NOT_FOUND", message: "未找到该数据" });
        return { domain, ...record };
    });

    app.get<{ Params: { storageKey: string } }>("/api/v1/data/files/:storageKey", async (request, reply) => {
        const userId = await requireUserId(request, reply);
        if (!userId) return;
        const storageKey = storageKeySchema.parse(request.params.storageKey);
        const [record] = await db
            .select()
            .from(userFile)
            .where(and(eq(userFile.userId, userId), eq(userFile.storageKey, storageKey)))
            .limit(1);
        if (!record) return reply.code(404).send({ code: "NOT_FOUND", message: "未找到该文件" });
        const object = await getUserFile(record.objectKey);
        if (!object.Body) return reply.code(404).send({ code: "NOT_FOUND", message: "未找到该文件" });
        reply.type(record.mimeType).header("content-length", record.bytes).header("cache-control", "private, max-age=3600");
        if (!isSafeInlineMimeType(record.mimeType)) reply.header("content-disposition", "attachment");
        return reply.send(object.Body as Readable);
    });
}

async function requireUserId(request: FastifyRequest, reply: FastifyReply) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
        await reply.code(401).send({ code: "UNAUTHORIZED", message: "请先登录" });
        return null;
    }
    return session.user.id;
}

async function requireOpenImport(userId: string, importId: string, reply: FastifyReply) {
    const current = await findImport(userId);
    if (!current || current.id !== importId) {
        await reply.code(404).send({ code: "IMPORT_NOT_FOUND", message: "未找到导入任务" });
        return null;
    }
    if (current.status === "completed") {
        await reply.code(409).send({ code: "IMPORT_COMPLETED", message: "本地数据已导入" });
        return null;
    }
    return current;
}

async function findImport(userId: string) {
    const [record] = await db.select().from(dataImport).where(eq(dataImport.userId, userId)).limit(1);
    return record || null;
}

async function getImportStatus(userId: string) {
    const record = await findImport(userId);
    const limits = config.importLimits;
    if (!record) return { status: "not_started" as const, limits };
    const domains = await db
        .select({ domain: userDataDomain.domain })
        .from(userDataDomain)
        .where(and(eq(userDataDomain.userId, userId), eq(userDataDomain.importId, record.id)));
    const files = await db
        .select({ storageKey: userFile.storageKey })
        .from(userFile)
        .where(and(eq(userFile.userId, userId), eq(userFile.importId, record.id)));
    return { ...record, limits, uploadedDomains: domains.map((item) => item.domain), uploadedFiles: files.map((item) => item.storageKey) };
}

function validateSummary(summary: z.infer<typeof startSchema>) {
    const domains = new Set(summary.domains.map((item) => item.domain));
    if (domains.size !== importDomains.length || importDomains.some((domain) => !domains.has(domain))) throw requestError(400, "INVALID_SUMMARY", "导入摘要缺少数据域");
    if (summary.totalBytes > config.importLimits.totalBytes) throw requestError(413, "IMPORT_TOO_LARGE", "本地媒体总量超过导入限制");
}

function validateFileDescriptors(files: z.infer<typeof fileDescriptorSchema>[], expected?: { files: number; bytes: number }) {
    if (new Set(files.map((item) => item.storageKey)).size !== files.length) throw requestError(400, "DUPLICATE_FILE", "数据清单包含重复文件");
    if (files.some((item) => item.bytes > config.importLimits.fileBytes)) throw requestError(413, "FILE_TOO_LARGE", "单个文件超过导入限制");
    const bytes = files.reduce((total, item) => total + item.bytes, 0);
    if (!expected || expected.files !== files.length || expected.bytes !== bytes) throw requestError(400, "INVALID_SUMMARY", "数据清单与导入摘要不一致");
}

function requestError(statusCode: number, code: string, message: string) {
    return Object.assign(new Error(message), { statusCode, code });
}

function isSafeInlineMimeType(mimeType: string) {
    return /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm))$/i.test(mimeType);
}
