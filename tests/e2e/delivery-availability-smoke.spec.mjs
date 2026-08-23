import { test, expect } from "@playwright/test";

test.describe("Kantu Floral delivery availability", () => {
    test("advanced delivery controls initialize without changing business defaults", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-delivery-availability='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("link[data-kantu-delivery-availability-style='true']")).toHaveCount(1);
        await expect(page.locator("#checkoutRequestedDate")).toHaveAttribute("data-delivery-availability-bound", "true");
        await expect(page.locator("#adminDeliveryAvailability")).toHaveCount(1);
        await expect(page.locator("#adminDeliveryBlackoutDates")).toHaveCount(1);
        await expect(page.locator("#adminDeliveryAvailabilitySave")).toHaveCount(1);

        const apiReady = await page.evaluate(() => Boolean(
            window.KantuDeliveryAvailability
            && typeof window.KantuDeliveryAvailability.refreshCheckout === "function"
            && typeof window.KantuDeliveryAvailability.refreshAdmin === "function"
        ));
        expect(apiReady).toBe(true);
        expect(pageErrors).toEqual([]);
    });
});
