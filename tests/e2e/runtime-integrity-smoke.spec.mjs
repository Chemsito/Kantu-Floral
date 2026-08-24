import { test, expect } from "@playwright/test";

test("destacados reaparece con todos los productos y cinta infinita", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.KantuRuntimeIntegrity));

    await page.evaluate(() => {
        products = Array.from({ length: 8 }, (_, index) => ({
            id: 990001 + index,
            name: `Destacado ${index + 1}`,
            price: 50 + index,
            stock: 5,
            active: true,
            featured: true
        }));
        document.getElementById("productsGrid").innerHTML = '<article class="product-card">render tardío</article>';
    });

    const strip = page.locator("#catalogFeaturedStrip");
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Destacados por Kantu");
    await expect(strip).not.toContainText("Selección manual del equipo");
    await expect(strip.locator(".catalog-featured-set").first().locator("a")).toHaveCount(8);
    await expect(strip.locator('.catalog-featured-set[aria-hidden="true"] a')).toHaveCount(8);
    await expect(strip.locator('.catalog-featured-set[aria-hidden="true"] a').first()).toHaveAttribute("tabindex", "-1");

    const animationName = await strip.locator(".catalog-featured-track").evaluate(node => getComputedStyle(node).animationName);
    expect(animationName).toContain("kantu-featured-marquee-right");
});

test("el fondo difuminado no cierra los modales", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.KantuRuntimeIntegrity));

    await page.evaluate(() => openAuth("login"));
    const modal = page.locator("#authModal");
    await expect(modal).toHaveClass(/show/);

    await modal.click({ position: { x: 3, y: 3 } });
    await expect(modal).toHaveClass(/show/);

    await page.locator("#authModal .close-modal").click();
    await expect(modal).not.toHaveClass(/show/);
});

test("Admin Productos filtra por categoría y búsqueda sin recorrer toda la lista", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.KantuRuntimeIntegrity));

    await page.evaluate(() => {
        adminProducts = [
            { id: 880001, name: "Ramo Aurora", category: "ramos", price: 79, stock: 10, active: true, size: "M", tag: "Kantu" },
            { id: 880002, name: "Rosa Premium", category: "rosas", price: 89, stock: 8, active: true, size: "M", tag: "Kantu" },
            { id: 880003, name: "Ramo Sol", category: "ramos", price: 69, stock: 7, active: true, size: "M", tag: "Kantu" }
        ];
        window.KantuRuntimeIntegrity.refreshAdminProductFilters();
    });

    await expect(page.locator("#adminProductTools")).toHaveCount(1);
    await expect(page.locator("#adminProductsList .admin-product-card")).toHaveCount(3);

    await page.evaluate(() => {
        const category = document.getElementById("adminProductCategoryFilter");
        category.value = "rosas";
        category.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#adminProductsList .admin-product-card")).toHaveCount(1);
    await expect(page.locator("#adminProductsList")).toContainText("Rosa Premium");

    await page.evaluate(() => {
        const category = document.getElementById("adminProductCategoryFilter");
        category.value = "todos";
        category.dispatchEvent(new Event("change", { bubbles: true }));
        const search = document.getElementById("adminProductSearch");
        search.value = "sol";
        search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#adminProductsList .admin-product-card")).toHaveCount(1);
    await expect(page.locator("#adminProductsList")).toContainText("Ramo Sol");
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
