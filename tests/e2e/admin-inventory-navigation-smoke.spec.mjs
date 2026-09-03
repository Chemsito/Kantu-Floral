import { test, expect } from "@playwright/test";

test.describe("Kantu Floral Admin inventory navigation", () => {
    test("Products and Inventory keep independent filter bars", async ({ page }) => {
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

        await expect(page.locator("#adminProductTools")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("#adminProductsView #adminProductTools")).toHaveCount(1);
        await expect(page.locator("#adminInventoryView #adminProductTools")).toHaveCount(0);
        await expect(page.locator("#adminInventoryView #adminInventoryTools")).toHaveCount(1);
        await expect(page.locator("#adminInventorySearch")).toHaveCount(1);
        await expect(page.locator("#adminInventoryCategoryFilter")).toHaveCount(1);
        await expect(page.locator("#adminInventoryFilterClear")).toHaveCount(1);

        await page.evaluate(() => {
            document.getElementById("inventoryLedgerCard")?.remove();
            const card = document.createElement("section");
            card.id = "inventoryLedgerCard";
            card.innerHTML = `
                <div class="inventory-ledger-heading"><h4>Historial de inventario</h4></div>
                <div id="inventoryLedgerList" class="inventory-ledger-list">
                    <div class="inventory-ledger-item" data-test-inventory-row="rosa"><div><strong>Rosa Premium</strong><div class="inventory-source">Aumento de stock</div></div><div><strong>+2</strong></div></div>
                    <div class="inventory-ledger-item" data-test-inventory-row="girasol"><div><strong>Girasol Sol</strong><div class="inventory-source">Disminución de stock</div></div><div><strong>-1</strong></div></div>
                </div>`;
            document.getElementById("adminProductsView")?.appendChild(card);
        });

        await expect(page.locator("#adminInventoryMount > #inventoryLedgerCard")).toHaveCount(1);
        await expect(page.locator("#adminProductsView #inventoryLedgerCard")).toHaveCount(0);

        await page.locator("#adminInventorySearch").fill("Rosa");
        await expect(page.locator('[data-test-inventory-row="rosa"]')).toBeVisible();
        await expect(page.locator('[data-test-inventory-row="girasol"]')).toBeHidden();
        await expect(page.locator("#adminInventoryFilterCount")).toContainText("1 de 2");

        await page.locator("#adminInventoryFilterClear").click();
        await expect(page.locator('[data-test-inventory-row="rosa"]')).toBeVisible();
        await expect(page.locator('[data-test-inventory-row="girasol"]')).toBeVisible();
        await expect(page.locator("#adminInventoryFilterCount")).toContainText("2 movimientos");

        expect(pageErrors).toEqual([]);
    });
});
