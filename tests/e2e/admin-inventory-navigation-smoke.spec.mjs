import { test, expect } from "@playwright/test";

test.describe("Kantu Floral Admin inventory navigation", () => {
    test("inventory history has its own tab next to products and leaves Products clean", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-admin-inventory-view='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator('[data-admin-view="inventory"]')).toHaveCount(1);
        await expect(page.locator("#adminInventoryView")).toHaveCount(1);
        await expect(page.locator("#adminInventoryView")).toContainText("Inventario");

        const adjacentToProducts = await page.evaluate(() => {
            const products = document.querySelector('[data-admin-view="products"]');
            return products?.nextElementSibling?.getAttribute("data-admin-view") === "inventory";
        });
        expect(adjacentToProducts).toBe(true);

        await page.evaluate(() => {
            document.getElementById("inventoryLedgerCard")?.remove();
            const card = document.createElement("section");
            card.id = "inventoryLedgerCard";
            card.textContent = "Historial de inventario";
            document.getElementById("adminProductsView")?.appendChild(card);
        });

        await expect(page.locator("#adminInventoryMount > #inventoryLedgerCard")).toHaveCount(1);
        await expect(page.locator("#adminProductsView #inventoryLedgerCard")).toHaveCount(0);
        expect(pageErrors).toEqual([]);
    });
});
