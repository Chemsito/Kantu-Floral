import { test, expect } from "@playwright/test";

test.describe("Kantu Floral occasion reminders", () => {
    test("private occasion reminder experience initializes without seeded dates", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-occasion-reminders='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("link[data-kantu-occasion-reminders-style='true']")).toHaveCount(1);
        await expect(page.locator('[data-account-tab="occasions"]')).toHaveCount(1);
        await expect(page.locator("#accountOccasionsSection")).toHaveCount(1);
        await expect(page.locator("#occasionReminderForm")).toHaveCount(1);
        await expect(page.locator("#occasionReminderMonth option")).toHaveCount(12);
        await expect(page.locator("#accountOccasionsSection")).toContainText("no enviará WhatsApp ni correo automáticamente");
        await expect(page.locator(".occasion-reminder-card")).toHaveCount(0);

        const apiReady = await page.evaluate(() => Boolean(
            window.KantuOccasionReminders
            && typeof window.KantuOccasionReminders.refresh === "function"
            && typeof window.KantuOccasionReminders.open === "function"
        ));
        expect(apiReady).toBe(true);
        expect(pageErrors).toEqual([]);
    });
});
