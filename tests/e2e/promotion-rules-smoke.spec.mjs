import { test, expect } from "@playwright/test";

test.describe("Kantu Floral advanced promotion rules", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("advanced promotion controls initialize without fake codes", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-promotion-rules='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("#adminPromotionRulesGroup")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("#adminPromotionMaxRedemptions")).toHaveAttribute("min", "1");
        await expect(page.locator("#adminPromotionPerUserLimit")).toHaveAttribute("min", "1");
        await expect(page.locator("#adminPromotionTargetProducts")).toHaveAttribute("multiple", "");
        await expect(page.locator("#adminPromotionTargetCategories")).toHaveAttribute("multiple", "");
        await expect(page.locator("#adminPromotionCode")).toHaveValue("");
        expect(pageErrors).toEqual([]);
    });
});
