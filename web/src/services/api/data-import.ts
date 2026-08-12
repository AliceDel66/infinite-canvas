export type DataImportDomain = "canvas" | "assets" | "image-workbench" | "video-workbench";

export type DataImportFile = {
    domain: DataImportDomain;
    storageKey: string;
    mimeType: string;
    bytes: number;
    blob: Blob;
};

export type DataImportSnapshot = {
    sourceVersion: 1;
    sourceId: string;
    domains: Array<{
        domain: DataImportDomain;
        records: number;
        bytes: number;
        payload: unknown;
        files: Array<Omit<DataImportFile, "domain" | "blob">>;
    }>;
    files: DataImportFile[];
    totalRecords: number;
    totalFiles: number;
    totalBytes: number;
    missingFiles: number;
};

export type DataImportStatus =
    | { status: "not_started"; limits: ImportLimits }
    | {
          id: string;
          status: "uploading" | "completed" | "failed";
          sourceId: string;
          uploadedDomains: DataImportDomain[];
          uploadedFiles: string[];
          limits: ImportLimits;
      };

type ImportLimits = { domainBytes: number; fileBytes: number; totalBytes: number };
export type DataImportProgress = { stage: "domains" | "files" | "complete"; current: number; total: number };

export function getDataImportStatus() {
    return requestJson<DataImportStatus>("/api/v1/data-import");
}

export async function uploadDataImport(snapshot: DataImportSnapshot, onProgress?: (progress: DataImportProgress) => void) {
    const status = await requestJson<DataImportStatus>("/api/v1/data-import/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            sourceVersion: snapshot.sourceVersion,
            sourceId: snapshot.sourceId,
            domains: snapshot.domains.map(({ domain, records, files, bytes }) => ({ domain, records, files: files.length, bytes })),
            totalFiles: snapshot.totalFiles,
            totalBytes: snapshot.totalBytes,
        }),
    });
    if (status.status === "not_started") throw new Error("导入任务创建失败");
    if (status.status === "completed") return status;

    let domainIndex = 0;
    for (const domain of snapshot.domains) {
        if (!status.uploadedDomains.includes(domain.domain)) {
            await requestJson(`/api/v1/data-import/${status.id}/domains/${domain.domain}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ payload: domain.payload, files: domain.files }),
            });
        }
        domainIndex += 1;
        onProgress?.({ stage: "domains", current: domainIndex, total: snapshot.domains.length });
    }

    const pendingFiles = snapshot.files.filter((file) => !status.uploadedFiles.includes(file.storageKey));
    let uploaded = snapshot.files.length - pendingFiles.length;
    onProgress?.({ stage: "files", current: uploaded, total: snapshot.files.length });
    await runWithConcurrency(pendingFiles, 2, async (file) => {
        const form = new FormData();
        form.append("file", file.blob, "local-data");
        await requestJson(`/api/v1/data-import/${status.id}/files?domain=${encodeURIComponent(file.domain)}&storageKey=${encodeURIComponent(file.storageKey)}`, {
            method: "POST",
            body: form,
        });
        uploaded += 1;
        onProgress?.({ stage: "files", current: uploaded, total: snapshot.files.length });
    });

    onProgress?.({ stage: "complete", current: 0, total: 1 });
    const completed = await requestJson<DataImportStatus>(`/api/v1/data-import/${status.id}/complete`, { method: "POST" });
    onProgress?.({ stage: "complete", current: 1, total: 1 });
    return completed;
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, credentials: "include" });
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    return data as T;
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    let nextIndex = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) await worker(items[nextIndex++]);
        }),
    );
}
