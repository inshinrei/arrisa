import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig, devices} from "@playwright/test"

let repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export default defineConfig({
    testDir: ".",
    testMatch: "*.e2e.ts",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:5173",
        trace: "on-first-retry",
        ...devices["Desktop Chrome"],
        viewport: {width: 1280, height: 800},
    },
    webServer: {
        command: "ARRISA_E2E=1 pnpm playground -- --host 127.0.0.1 --strictPort --port 5173",
        cwd: repoRoot,
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {...process.env, ARRISA_E2E: "1"},
    },
})
