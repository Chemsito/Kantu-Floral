import { test, expect } from "@playwright/test";

test.describe("Kantu Floral public stabilization", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("mobile menu toggles exactly once per click and exposes state", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        const menu = page.locator(".mobile-menu");
        const nav = page.locator("header nav");
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute("aria-expanded", "false");

        await menu.click();
        await expect(menu).toHaveAttribute("aria-expanded", "true");
        await expect(nav).toHaveClass(/mobile-open/);

        await menu.click();
        await expect(menu).toHaveAttribute("aria-expanded", "false");
        await expect(nav).not.toHaveClass(/mobile-open/);
    });

    test("auth dialog manages focus and closes with Escape", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.locator("#loginButton").click();

        const modal = page.locator("#authModal");
        await expect(modal).toHaveClass(/show/);
        await expect(modal).toHaveAttribute("aria-hidden", "false");
        await expect(page.locator("#authModal .close-modal")).toBeFocused();

        await page.keyboard.press("Escape");
        await expect(modal).not.toHaveClass(/show/);
        await expect(modal).toHaveAttribute("aria-hidden", "true");
    });

    test("catalog controls initialize and favorite controls expose toggle semantics", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("#catalogTools")).toBeVisible({ timeout: 15000 });
        await expect(page.locator(".category-btn").first()).toHaveAttribute("aria-pressed", "true");

        const favorite = page.locator("#productsGrid .favorite").first();
        if (await favorite.count()) {
            await expect(favorite).toHaveAttribute("aria-pressed", /true|false/);
            await expect(favorite).toHaveAttribute("aria-label", /favoritos/i);
        }
    });
});
