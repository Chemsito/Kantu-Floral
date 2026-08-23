import { test, expect } from "@playwright/test";

test.describe("Kantu Floral favorites synchronization", () => {
    test("anonymous favorites remain local and expose a readable count", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.addInitScript(() => {
            localStorage.setItem("kantuFavorites", JSON.stringify([1, 2]));
        });

        await page.goto("/index.html");

        await expect(page.locator("script[data-kantu-favorites-sync='true']")).toHaveCount(1);
        await expect(page.locator("link[href='css/favorites.css']")).toHaveCount(1);

        const count = page.locator("#favoritesButton [data-favorites-count]");
        await expect(count).toHaveText("2");
        await expect(count).toBeVisible();
        await expect(page.locator("#favoritesButton")).toHaveAttribute("aria-label", /2 guardados/);

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kantuFavorites") || "[]"));
        expect(stored).toEqual([1, 2]);
        expect(pageErrors).toEqual([]);
    });
});
