import { test, expect } from "@playwright/test";

test.describe("Kantu Floral product detail navigation", () => {
    test("uses the same primary header options as the storefront", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/producto.html");

        await expect(page.locator("header.site-header")).toHaveCount(1);
        await expect(page.locator("#siteNavigation a")).toHaveText([
            "Inicio",
            "Catálogo",
            "Nosotros",
            "Contacto"
        ]);
        await expect(page.locator("#favoritesButton")).toHaveCount(1);
        await expect(page.locator("#cartButton")).toHaveCount(1);
        await expect(page.locator("#loginButton")).toHaveCount(1);
        await expect(page.locator(".mobile-menu")).toHaveCount(1);
        await expect(page.locator(".product-page-header")).toHaveCount(0);
        expect(pageErrors).toEqual([]);
    });

    test("can hand the cart action back to the storefront", async ({ page }) => {
        await page.goto("/index.html?kantu_open=cart");
        await expect(page.locator("#cartPanel")).toHaveClass(/show/);
        await expect(page).not.toHaveURL(/kantu_open=/);
    });
});
