import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const baseUrl = (process.env.BASE_URL || "https://canvas.zgonline.top").replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
const suffix = `${Date.now()}-${process.pid}`;
const password = `Verify-${randomBytes(12).toString("hex")}`;
const emails = [`codex-import-${suffix}@invalid.local`, `codex-isolation-${suffix}@invalid.local`];
const payload = new TextEncoder().encode("hello world\n");
const storageKey = `image:codex-verify-${suffix}`;

async function register(email) {
    const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ name: "Codex Verify", email, password }),
    });
    assert.equal(response.status, 200, `registration failed: ${response.status} ${await response.text()}`);
    const setCookies = response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
    const cookie = setCookies.filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
    assert.ok(cookie, "registration did not return a session cookie");
    return cookie;
}

async function request(path, cookie, init = {}) {
    return fetch(`${baseUrl}${path}`, { ...init, headers: { origin, cookie, ...init.headers } });
}

async function jsonRequest(path, cookie, init = {}) {
    const response = await request(path, cookie, init);
    const body = await response.json().catch(() => null);
    assert.ok(response.ok, `${path} failed: ${response.status} ${JSON.stringify(body)}`);
    return body;
}

const ownerCookie = await register(emails[0]);
const initial = await jsonRequest("/api/v1/data-import", ownerCookie);
assert.equal(initial.status, "not_started");

const sourceId = createHash("sha256").update(suffix).digest("hex");
const summary = {
    sourceVersion: 1,
    sourceId,
    domains: [
        { domain: "canvas", records: 1, files: 1, bytes: payload.byteLength },
        { domain: "assets", records: 0, files: 0, bytes: 0 },
        { domain: "image-workbench", records: 0, files: 0, bytes: 0 },
        { domain: "video-workbench", records: 0, files: 0, bytes: 0 },
    ],
    totalFiles: 1,
    totalBytes: payload.byteLength,
};
const started = await jsonRequest("/api/v1/data-import/start", ownerCookie, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(summary),
});
assert.equal(started.status, "uploading");

const descriptor = { storageKey, mimeType: "text/plain", bytes: payload.byteLength };
const domains = [
    ["canvas", { payload: { projects: [{ id: "verify-project", storageKey }] }, files: [descriptor] }],
    ["assets", { payload: { assets: [] }, files: [] }],
    ["image-workbench", { payload: { logs: [] }, files: [] }],
    ["video-workbench", { payload: { logs: [] }, files: [] }],
];
for (const [domain, body] of domains) {
    await jsonRequest(`/api/v1/data-import/${started.id}/domains/${domain}`, ownerCookie, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

const form = new FormData();
form.append("file", new Blob([payload], { type: "text/plain" }), "payload.txt");
await jsonRequest(`/api/v1/data-import/${started.id}/files?domain=canvas&storageKey=${encodeURIComponent(storageKey)}`, ownerCookie, { method: "POST", body: form });

const completed = await jsonRequest(`/api/v1/data-import/${started.id}/complete`, ownerCookie, { method: "POST" });
assert.equal(completed.status, "completed");
const repeated = await jsonRequest(`/api/v1/data-import/${started.id}/complete`, ownerCookie, { method: "POST" });
assert.equal(repeated.status, "completed");

const download = await request(`/api/v1/data/files/${encodeURIComponent(storageKey)}`, ownerCookie);
assert.equal(download.status, 200);
assert.deepEqual(new Uint8Array(await download.arrayBuffer()), payload);

const otherCookie = await register(emails[1]);
const isolated = await request(`/api/v1/data/files/${encodeURIComponent(storageKey)}`, otherCookie);
assert.equal(isolated.status, 404);

console.log(JSON.stringify({ signup: 200, import: completed.status, idempotentComplete: repeated.status, ownerDownload: "match", crossUser: isolated.status, importId: started.id, storageKey, emails }));
