import { createHash } from "node:crypto";
import { Transform, type Readable } from "node:stream";

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

import { config } from "./config.js";

const client = new S3Client({
    endpoint: config.objectStorage.endpoint,
    region: config.objectStorage.region,
    forcePathStyle: config.objectStorage.forcePathStyle,
    credentials: {
        accessKeyId: config.objectStorage.accessKeyId,
        secretAccessKey: config.objectStorage.secretAccessKey,
    },
});

export async function ensureObjectStorage() {
    try {
        await client.send(new HeadBucketCommand({ Bucket: config.objectStorage.bucket }));
    } catch (error) {
        const status = objectStatus(error);
        const name = error instanceof Error ? error.name : "";
        if (status !== 404 && name !== "NotFound" && name !== "NoSuchBucket") throw error;
        await client.send(new CreateBucketCommand({ Bucket: config.objectStorage.bucket }));
    }
}

export async function checkObjectStorage() {
    await client.send(new HeadBucketCommand({ Bucket: config.objectStorage.bucket }));
}

export async function uploadUserFile(input: { userId: string; storageKey: string; mimeType: string; body: Readable; maxBytes: number }) {
    return uploadObject({ objectKey: objectKeyFor(input.userId, input.storageKey), mimeType: input.mimeType, body: input.body, maxBytes: input.maxBytes });
}

export function getUserFile(objectKey: string) {
    return client.send(new GetObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }));
}

export function deleteUserFile(objectKey: string) {
    return client.send(new DeleteObjectCommand({ Bucket: config.objectStorage.bucket, Key: objectKey }));
}

export async function uploadTemporaryVideoAsset(input: { assetId: string; mimeType: string; body: Readable; maxBytes: number }) {
    return uploadObject({ objectKey: temporaryVideoAssetKey(input.assetId), mimeType: input.mimeType, body: input.body, maxBytes: input.maxBytes });
}

export function getTemporaryVideoAsset(assetId: string, range?: string) {
    return client.send(new GetObjectCommand({ Bucket: config.objectStorage.bucket, Key: temporaryVideoAssetKey(assetId), ...(range ? { Range: range } : {}) }));
}

export function deleteTemporaryVideoAsset(assetId: string) {
    return client.send(new DeleteObjectCommand({ Bucket: config.objectStorage.bucket, Key: temporaryVideoAssetKey(assetId) }));
}

async function uploadObject(input: { objectKey: string; mimeType: string; body: Readable; maxBytes: number }) {
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > input.maxBytes) return callback(new UploadLimitError(input.maxBytes));
            hash.update(chunk);
            callback(null, chunk);
        },
    });
    input.body.pipe(meter);
    try {
        await new Upload({
            client,
            params: { Bucket: config.objectStorage.bucket, Key: input.objectKey, Body: meter, ContentType: input.mimeType },
            queueSize: 3,
            partSize: 5 * 1024 * 1024,
            leavePartsOnError: false,
        }).done();
    } catch (error) {
        input.body.destroy();
        throw error;
    }
    return { objectKey: input.objectKey, bytes, sha256: hash.digest("hex") };
}

function objectKeyFor(userId: string, storageKey: string) {
    const owner = createHash("sha256").update(userId).digest("hex").slice(0, 32);
    const file = createHash("sha256").update(storageKey).digest("hex");
    return `users/${owner}/files/${file}`;
}

function temporaryVideoAssetKey(assetId: string) {
    return `temporary/video-assets/${assetId}`;
}

function objectStatus(error: unknown) {
    if (!error || typeof error !== "object" || !("$metadata" in error)) return undefined;
    return (error.$metadata as { httpStatusCode?: number }).httpStatusCode;
}

class UploadLimitError extends Error {
    statusCode = 413;

    constructor(maxBytes: number) {
        super(`文件超过 ${Math.floor(maxBytes / 1024 / 1024)} MB 限制`);
        this.name = "UploadLimitError";
    }
}
