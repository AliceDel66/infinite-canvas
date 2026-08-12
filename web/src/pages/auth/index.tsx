import { Alert, Button, Divider, Form, Input, Segmented } from "antd";
import { KeyRound, LockKeyhole, LogIn, Mail, Moon, Sun, UserPlus, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { BrandMark } from "@/components/brand/brand-mark";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { canvasThemes } from "@/lib/canvas-theme";
import { authClient } from "@/services/api/auth";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type AuthMode = "login" | "register";
type AuthForm = { name?: string; email: string; password: string; confirmPassword?: string };

export default function AuthPage({ mode }: { mode: AuthMode }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [form] = Form.useForm<AuthForm>();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const status = useUserStore((state) => state.status);
    const capabilities = useUserStore((state) => state.capabilities);
    const refreshSession = useUserStore((state) => state.refreshSession);
    const canvasTheme = canvasThemes[theme];
    const redirectPath = useMemo(() => {
        const from = (location.state as { from?: string } | null)?.from;
        return from?.startsWith("/") && !from.startsWith("//") ? from : "/canvas";
    }, [location.state]);

    useEffect(() => {
        if (status === "authenticated") navigate(redirectPath, { replace: true });
    }, [navigate, redirectPath, status]);

    const switchMode = (next: AuthMode) => {
        setError("");
        form.resetFields();
        navigate(next === "login" ? "/login" : "/register", { replace: true, state: location.state });
    };

    const authErrorMessage = (reason: unknown) => {
        const fallback = t(mode === "login" ? "auth.loginFailed" : "auth.registerFailed");
        const message = reason instanceof Error ? reason.message : "";
        if (/invalid email or password|invalid credentials/i.test(message)) return t("auth.invalidCredentials");
        if (/user already exists|already registered/i.test(message)) return t("auth.accountExists");
        return message || fallback;
    };

    const submit = async (values: AuthForm) => {
        if (mode === "register" && values.password !== values.confirmPassword) {
            setError(t("auth.passwordMismatch"));
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            const result =
                mode === "login"
                    ? await authClient.signIn.email({ email: values.email, password: values.password })
                    : await authClient.signUp.email({ name: values.name!.trim(), email: values.email, password: values.password });
            if (result.error) throw new Error(result.error.message || t(mode === "login" ? "auth.loginFailed" : "auth.registerFailed"));
            await refreshSession();
            navigate(redirectPath, { replace: true });
        } catch (reason) {
            setError(authErrorMessage(reason));
        } finally {
            setSubmitting(false);
        }
    };

    const signInWithSub2api = async () => {
        setError("");
        try {
            const result = await authClient.signIn.oauth2({ providerId: "sub2api", callbackURL: redirectPath });
            if (result.error) throw new Error(result.error.message || t("auth.sub2apiFailed"));
            const redirectUrl = result.data && typeof result.data === "object" && "url" in result.data && typeof result.data.url === "string" ? result.data.url : "";
            if (!redirectUrl) throw new Error(t("auth.sub2apiFailed"));
            const target = new URL(redirectUrl, window.location.origin);
            const localHttp = target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
            if (target.protocol !== "https:" && !localHttp) throw new Error(t("auth.sub2apiFailed"));
            window.location.assign(target.href);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t("auth.sub2apiFailed"));
        }
    };

    return (
        <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12" style={{ backgroundColor: canvasTheme.canvas.background, color: canvasTheme.node.text }}>
            <div
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{ backgroundImage: `radial-gradient(${canvasTheme.canvas.dot} 1px, transparent 1px)`, backgroundSize: "18px 18px" }}
            />
            <AnimatedThemeToggler
                theme={theme}
                onThemeChange={setTheme}
                className="absolute right-5 top-5 z-10 inline-flex size-9 items-center justify-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
            >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </AnimatedThemeToggler>

            <section className="relative z-10 w-full max-w-[440px]">
                <Link to="/" className="mx-auto mb-8 flex w-fit items-center gap-2.5 text-current transition hover:opacity-70">
                    <BrandMark className="size-8" />
                    <span className="text-xl font-semibold">{t("meta.title")}</span>
                </Link>

                <div className="overflow-hidden rounded-lg border shadow-sm" style={{ backgroundColor: canvasTheme.node.panel, borderColor: canvasTheme.node.stroke }}>
                    <div className="grid h-1 grid-cols-2" aria-hidden>
                        <span className="bg-[#ff5d4a]" />
                        <span className="bg-[#20aa9a]" />
                    </div>
                    <div className="p-6 sm:p-7">
                        <h1 className="text-2xl font-semibold">{t(mode === "login" ? "auth.loginTitle" : "auth.registerTitle")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t(mode === "login" ? "auth.loginDescription" : "auth.registerDescription")}</p>
                        <Segmented<AuthMode>
                            block
                            className="mt-5"
                            value={mode}
                            options={[
                                { label: t("auth.login"), value: "login" },
                                { label: t("auth.register"), value: "register" },
                            ]}
                            onChange={switchMode}
                        />

                        {error ? <Alert className="mt-4" type="error" showIcon title={error} /> : null}

                        <Form form={form} layout="vertical" className="mt-5" requiredMark={false} onFinish={submit}>
                            {mode === "register" ? (
                                <Form.Item name="name" label={t("auth.name")} rules={[{ required: true, message: t("auth.nameRequired") }, { max: 60 }]}>
                                    <Input autoComplete="name" prefix={<UserRound className="size-4 text-stone-400" />} placeholder={t("auth.namePlaceholder")} />
                                </Form.Item>
                            ) : null}
                            <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, message: t("auth.emailRequired") }, { type: "email", message: t("auth.emailInvalid") }]}>
                                <Input autoComplete="email" prefix={<Mail className="size-4 text-stone-400" />} placeholder="name@example.com" />
                            </Form.Item>
                            <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, message: t("auth.passwordRequired") }, { min: 8, message: t("auth.passwordLength") }]}>
                                <Input.Password autoComplete={mode === "login" ? "current-password" : "new-password"} prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.passwordPlaceholder")} />
                            </Form.Item>
                            {mode === "register" ? (
                                <Form.Item name="confirmPassword" label={t("auth.confirmPassword")} rules={[{ required: true, message: t("auth.confirmPasswordRequired") }]}>
                                    <Input.Password autoComplete="new-password" prefix={<LockKeyhole className="size-4 text-stone-400" />} placeholder={t("auth.confirmPasswordPlaceholder")} />
                                </Form.Item>
                            ) : null}
                            <Button className="mt-1" block type="primary" htmlType="submit" loading={submitting} icon={mode === "login" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}>
                                {t(mode === "login" ? "auth.loginAction" : "auth.registerAction")}
                            </Button>
                        </Form>

                        {capabilities.sub2api ? (
                            <>
                                <Divider plain>{t("auth.or")}</Divider>
                                <Button block icon={<KeyRound className="size-4" />} onClick={() => void signInWithSub2api()}>
                                    {t("auth.sub2api")}
                                </Button>
                            </>
                        ) : mode === "login" ? (
                            <div className="mt-6 flex gap-3 border-t pt-5 text-xs leading-5 text-stone-500 dark:text-stone-400" style={{ borderColor: canvasTheme.node.stroke }}>
                                <KeyRound className="mt-0.5 size-4 shrink-0 text-[#20aa9a]" />
                                <span>{t("auth.accountBoundary")}</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </section>
        </main>
    );
}
