import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 30_000,
    expect: { timeout: 7_500 },
    fullyParallel: false,
    retries: 1,
    reporter: "line",
    use: {
        baseURL: "http://127.0.0.1:4173",
        browserName: "chromium",
        headless: true,
        trace: "retain-on-failure"
    }
});
