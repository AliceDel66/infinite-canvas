import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { BrandMark } from "@/components/brand/brand-mark";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { navigationTools } from "@/constant/navigation-tools";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

export default function IndexPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [primaryTool] = navigationTools;
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : i18n.t("home.promptError")))
            .finally(() => setLoading(false));
    }, [message]);

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e7e5e4_1px,transparent_1px)] [background-size:18px_18px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.14)_1px,transparent_1px)] dark:text-stone-100">
            <section className="relative mx-auto max-w-7xl overflow-hidden px-4 sm:px-6">
                <div className="relative flex min-h-[390px] flex-col items-center justify-center border-b border-stone-200 py-12 text-center dark:border-stone-800">
                    <BrandMark className="size-14" />
                    <div className="mt-5 flex items-center gap-3 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                        <span className="h-px w-7 bg-[#ff5d4a]" />
                        <span>{t("home.eyebrow")}</span>
                        <span className="h-px w-7 bg-[#20aa9a]" />
                    </div>
                    <h1 className="mt-4 max-w-4xl text-balance text-6xl font-semibold sm:text-7xl">{t("meta.title")}</h1>
                    <p className="mt-5 max-w-2xl text-balance text-base leading-7 text-stone-500 sm:text-lg sm:leading-8 dark:text-stone-400">{t("home.description")}</p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.start")}
                        </Button>
                        <Button size="large" onClick={() => navigate("/canvas")}>
                            {t("home.openCanvas")}
                        </Button>
                    </div>
                </div>

                <nav className="hide-scrollbar flex overflow-x-auto border-b border-stone-200 dark:border-stone-800" aria-label={t("topNav.menu")}>
                    {navigationTools.map((tool) => {
                        const Icon = tool.icon;
                        return (
                            <button key={tool.slug} type="button" onClick={() => navigate(`/${tool.slug}`)} className="flex h-16 min-w-36 flex-1 items-center justify-center gap-2 border-r border-stone-200 px-4 text-sm font-medium text-stone-500 transition hover:bg-black/[0.03] hover:text-stone-950 last:border-r-0 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-white/[0.04] dark:hover:text-stone-100">
                                <Icon className="size-4" />
                                <span>{t(`navigation.${tool.slug}`)}</span>
                            </button>
                        );
                    })}
                </nav>

                <section className="relative mx-auto mb-20 max-w-6xl pt-10">
                    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-2xl">
                            <div className="text-xs font-semibold text-[#20aa9a]">{t("home.showcaseEyebrow")}</div>
                            <h2 className="mt-2 text-2xl font-semibold text-stone-950 sm:text-3xl dark:text-stone-100">{t("home.showcaseTitle")}</h2>
                            <p className="mt-2 text-sm leading-6 text-stone-500 sm:text-base sm:leading-7 dark:text-stone-400">{t("home.showcaseDescription")}</p>
                        </div>
                        <Button type="link" onClick={() => navigate("/prompts")} className="w-fit px-0" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            {t("home.viewPrompts")}
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {loading
                            ? Array.from({ length: 6 }, (_, index) => <div key={index} className={cn("animate-pulse rounded-md border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900", index === 0 && "md:col-span-2 md:row-span-2", index === 3 && "md:col-span-2")} />)
                            : null}
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-md border border-stone-200 bg-stone-100 text-left dark:border-stone-800 dark:bg-stone-900",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {promptShowcase.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
