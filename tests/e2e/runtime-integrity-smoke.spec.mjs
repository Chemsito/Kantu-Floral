import { test, expect } from "@playwright/test";

test("destacados reaparece cuando los productos llegan después del render inicial", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.KantuRuntimeIntegrity));

    await page.evaluate(() => {
        products = [{
            id: 990001,
            name: "Producto destacado de prueba",
            price: 89,
            stock: 5,
            active: true,
            featured: true
        }];
        document.getElementById("productsGrid").innerHTML = '<article class="product-card">render tardío</article>';
    });

    const strip = page.locator("#catalogFeaturedStrip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Destacados por Kantu");
    await expect(strip).toContainText("Producto destacado de prueba");
    await expect(strip).not.toContainText("Selección manual del equipo");
});

test("Fechas importantes nunca se filtra dentro de Mis pedidos", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.KantuRuntimeIntegrity));
    await page.waitForSelector('[data-account-tab="occasions"]', { state: "attached" });

    await page.evaluate(() => switchAccountTab("occasions"));
    const occasions = page.locator("#accountOccasionsSection");
    await expect(occasions).not.toHaveAttribute("hidden", "");

    await page.evaluate(() => switchAccountTab("orders"));
    await expect(occasions).toHaveAttribute("hidden", "");
    await expect(occasions).toHaveCSS("display", "none");
});
