import { test, expect } from "@playwright/test";

test.describe("Kantu Floral scheduled operations", () => {
    test("admin delivery agenda sidecar initializes safely", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-scheduled-operations='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("link[data-kantu-scheduled-operations-style='true']")).toHaveCount(1);
        await expect(page.locator("#adminDeliveryAgendaCard")).toHaveCount(1);

        const apiReady = await page.evaluate(() => Boolean(
            window.KantuScheduledOperations
            && typeof window.KantuScheduledOperations.refreshAdminAgenda === "function"
            && typeof window.KantuScheduledOperations.refreshStaff === "function"
        ));
        expect(apiReady).toBe(true);
        expect(pageErrors).toEqual([]);
    });

    test("staff portal loads scheduled operations without JavaScript errors", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        await expect(page.locator("script[src='js/scheduled-operations.js']")).toHaveCount(1);
        await expect(page.locator("link[href='css/scheduled-operations.css']")).toHaveCount(1);
        expect(pageErrors).toEqual([]);
    });
});
