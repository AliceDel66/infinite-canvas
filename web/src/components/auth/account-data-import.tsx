import { useEffect, useState } from "react";
import { Alert, App, Modal, Progress, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { getDataImportStatus, uploadDataImport, type DataImportProgress, type DataImportSnapshot } from "@/services/api/data-import";
import { readLocalDataImportSnapshot } from "@/services/local-data-import";
import { useUserStore } from "@/stores/use-user-store";

type ViewState = "idle" | "ready" | "importing" | "error";

export function AccountDataImport() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const user = useUserStore((state) => state.user);
    const status = useUserStore((state) => state.status);
    const [view, setView] = useState<ViewState>("idle");
    const [snapshot, setSnapshot] = useState<DataImportSnapshot | null>(null);
    const [progress, setProgress] = useState<DataImportProgress | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (status !== "authenticated" || !user) {
            setView("idle");
            setSnapshot(null);
            return;
        }
        const dismissedKey = `infinite-canvas:data-import-dismissed:${user.id}`;
        if (sessionStorage.getItem(dismissedKey)) return;
        let active = true;
        void Promise.all([getDataImportStatus(), readLocalDataImportSnapshot()])
            .then(([remote, local]) => {
                if (!active || remote.status === "completed" || (local.totalRecords === 0 && local.totalFiles === 0)) return;
                setSnapshot(local);
                setView("ready");
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [status, user]);

    const dismiss = () => {
        if (user) sessionStorage.setItem(`infinite-canvas:data-import-dismissed:${user.id}`, "1");
        setView("idle");
    };

    const start = async () => {
        if (!snapshot) return;
        setView("importing");
        setError("");
        try {
            await uploadDataImport(snapshot, setProgress);
            setView("idle");
            message.success(t("dataImport.completed"));
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setView("error");
        }
    };

    const percent = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;
    const progressLabel = progress ? t(`dataImport.progress.${progress.stage}`, { current: progress.current, total: progress.total }) : "";

    return (
        <Modal
            open={view !== "idle"}
            title={t("dataImport.title")}
            okText={view === "error" ? t("dataImport.retry") : t("dataImport.confirm")}
            cancelText={t("dataImport.later")}
            confirmLoading={view === "importing"}
            cancelButtonProps={{ disabled: view === "importing" }}
            closable={view !== "importing"}
            maskClosable={false}
            onCancel={dismiss}
            onOk={() => void start()}
        >
            <Space direction="vertical" size={16} className="w-full">
                {snapshot ? (
                    <Typography.Text>
                        {t("dataImport.summary", {
                            records: snapshot.totalRecords,
                            files: snapshot.totalFiles,
                            size: formatBytes(snapshot.totalBytes),
                        })}
                    </Typography.Text>
                ) : null}
                <Alert type="info" showIcon message={t("dataImport.scope")} />
                {snapshot?.missingFiles ? <Alert type="warning" showIcon message={t("dataImport.missingFiles", { count: snapshot.missingFiles })} /> : null}
                {view === "importing" ? <Progress percent={percent} status="active" format={() => progressLabel} /> : null}
                {view === "error" ? <Alert type="error" showIcon message={t("dataImport.failed")} description={error} /> : null}
            </Space>
        </Modal>
    );
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
