import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { ZodError } from "zod";

import { auth } from "./auth.js";
import { config } from "./config.js";
import { db } from "./db/client.js";
import { checkObjectStorage, ensureObjectStorage } from "./object-storage.js";
import { registerDataImportRoutes } from "./routes/data-import.js";
import { registerVideoAssetRoutes } from "./routes/video-assets.js";

export async function createApp() {
    const app = Fastify({ logger: true, trustProxy: true, bodyLimit: 1024 * 1024 });

    await app.register(cors, {
        origin: config.appOrigins,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    });
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
    await app.register(multipart, {
        limits: { files: 1, fileSize: config.importLimits.fileBytes, fields: 0 },
    });
    await ensureObjectStorage();

    app.get("/api/v1/health", async () => {
        await db.execute(sql`select 1`);
        await checkObjectStorage();
        return { status: "ok" };
    });

    app.get("/api/v1/auth/capabilities", async () => ({
        emailPassword: true,
        registration: true,
        sub2api: Boolean(config.sub2api),
    }));

    app.get("/api/v1/me", async (request, reply) => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
        if (!session) return reply.code(401).send({ code: "UNAUTHORIZED", message: "请先登录" });
        return session;
    });

    await registerDataImportRoutes(app);
    await registerVideoAssetRoutes(app);

    app.route({
        method: ["GET", "POST"],
        url: "/api/auth/*",
        config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
        handler: async (request, reply) => forwardAuthRequest(request, reply),
    });

    app.setErrorHandler((error, _request, reply) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        app.log.error(normalized);
        if (reply.sent) return;
        const status = "statusCode" in normalized && typeof normalized.statusCode === "number" ? normalized.statusCode : undefined;
        const statusCode = normalized instanceof ZodError ? 400 : status && status >= 400 ? status : 500;
        reply.code(statusCode).send({
            code: statusCode < 500 ? ((normalized as Error & { code?: string }).code || "REQUEST_FAILED") : "INTERNAL_ERROR",
            message: normalized instanceof ZodError ? "请求数据格式不正确" : statusCode < 500 ? normalized.message : "服务暂时不可用",
        });
    });

    return app;
}

async function forwardAuthRequest(request: FastifyRequest, reply: FastifyReply) {
    const headers = fromNodeHeaders(request.headers);
    headers.delete("content-length");
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : encodeBody(request.body, request.headers["content-type"]);
    const authRequest = new Request(new URL(request.url, config.betterAuthUrl), {
        method: request.method,
        headers,
        body,
    });
    const response = await auth.handler(authRequest);

    reply.code(response.status);
    response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
    });
    const cookies = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
    if (cookies.length) reply.header("set-cookie", cookies);
    const responseBody = Buffer.from(await response.arrayBuffer());
    return reply.send(responseBody.length ? responseBody : null);
}

function encodeBody(body: unknown, contentType?: string) {
    if (body === undefined || body === null) return undefined;
    if (typeof body === "string") return body;
    if (body instanceof Uint8Array) return new Uint8Array(body).buffer;
    if (contentType?.includes("application/x-www-form-urlencoded")) {
        return new URLSearchParams(body as Record<string, string>).toString();
    }
    return JSON.stringify(body);
}
