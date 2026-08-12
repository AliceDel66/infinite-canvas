import crypto from "node:crypto";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const baseUrl = (process.env.BASE_URL || "https://canvas.zgonline.top").replace(/\/$/, "");
const outputDir = process.env.SCREENSHOT_DIR || "/tmp/infinite-canvas-qa";
const browser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
await context.addInitScript(() => localStorage.setItem("infinite-canvas:locale", "zh-CN"));
const page = await context.newPage();
page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(baseUrl + "/register", { waitUntil: "networkidle" });
await page.screenshot({ path: outputDir + "/register-desktop.png", fullPage: true });
await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("infinite-canvas");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const project = {
        id: "playwright-import",
        title: "浏览器迁移验收",
        createdAt: now,
        updatedAt: now,
        nodes: [],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
    };
    await new Promise((resolve, reject) => {
        const transaction = db.transaction("app_state", "readwrite");
        transaction.objectStore("app_state").put(JSON.stringify({ state: { projects: [project] }, version: 0 }), "infinite-canvas:canvas_store");
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
    });
    db.close();
});
await page.reload({ waitUntil: "networkidle" });

const suffix = String(Date.now()) + "-" + String(process.pid);
const email = "codex-browser-" + suffix + "@invalid.local";
const password = "Browser-" + crypto.randomBytes(12).toString("hex");
await page.getByLabel("昵称").fill("Browser Verify");
await page.getByLabel("邮箱").fill(email);
await page.getByLabel("密码", { exact: true }).fill(password);
await page.getByLabel("确认密码").fill(password);
await page.getByRole("button", { name: "创建账户" }).click();
await page.getByText("同步本机数据到账户").waitFor({ state: "visible", timeout: 20_000 });
await page.screenshot({ path: outputDir + "/import-modal-desktop.png", fullPage: true });
const summary = await page.getByText(/检测到 1 条本地记录/).textContent();
await page.getByRole("button", { name: "开始导入" }).click();
await page.getByText("同步本机数据到账户").waitFor({ state: "hidden", timeout: 20_000 });
await page.screenshot({ path: outputDir + "/canvas-after-import.png", fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
await mobile.addInitScript(() => localStorage.setItem("infinite-canvas:locale", "zh-CN"));
const mobilePage = await mobile.newPage();
mobilePage.on("console", (message) => {
    if (message.type() === "error") errors.push("mobile: " + message.text());
});
await mobilePage.goto(baseUrl + "/register", { waitUntil: "networkidle" });
await mobilePage.screenshot({ path: outputDir + "/register-mobile.png", fullPage: true });
const mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

console.log(JSON.stringify({ email, summary, desktopUrl: page.url(), consoleErrors: errors, mobileOverflow }));
await mobile.close();
await context.close();
await browser.close();
