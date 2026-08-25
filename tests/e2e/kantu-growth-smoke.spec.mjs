import { test, expect } from "@playwright/test";

test("cliente ve campana, Kantu Match y Libro de Reclamaciones", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.KantuGrowth), null, { timeout: 15000 });

    const bell = page.locator("#notificationButton");
    await expect(bell).toHaveCount(1);
    await bell.click();
    await expect(page.locator("#notificationPanel")).toBeVisible();
    await page.locator("#notificationClose").click();
    await expect(page.locator("#notificationPanel")).toBeHidden();

    await page.evaluate(() => {
        products = [
            { id: 910001, name: "Ramo romántico prioritario", price: 89, stock: 8, active: true, category: "rosas", featured: true, recommendation_priority: 10, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] },
            { id: 910002, name: "Ramo romántico secundario", price: 79, stock: 6, active: true, category: "ramos", featured: false, recommendation_priority: 2, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] },
            { id: 910003, name: "Opción alegre", price: 59, stock: 5, active: true, category: "girasoles", featured: false, recommendation_priority: 0, recommendation_audiences: [], recommendation_occasions: [], recommendation_styles: [] }
        ];
    });

    await page.locator("#kantuMatchButton").click();
    await expect(page.locator("#kantuMatchModal")).toHaveClass(/show/);

    // El cliente selecciona las tarjetas visibles; los radios quedan dentro del label estilizado.
    await page.locator('label:has(input[name="matchAudience"][value="pareja"])').click();
    await page.locator('label:has(input[name="matchOccasion"][value="aniversario"])').click();
    await page.locator('label:has(input[name="matchStyle"][value="romantico"])').click();
    await page.locator('label:has(input[name="matchBudget"][value="100"])').click();

    await expect(page.locator('input[name="matchAudience"][value="pareja"]')).toBeChecked();
    await expect(page.locator('input[name="matchOccasion"][value="aniversario"]')).toBeChecked();
    await expect(page.locator('input[name="matchStyle"][value="romantico"]')).toBeChecked();
    await expect(page.locator('input[name="matchBudget"][value="100"]')).toBeChecked();

    await page.locator("#kantuMatchForm").evaluate(form => form.requestSubmit());
    await expect(page.locator("#kantuMatchResults")).toBeVisible();
    await expect(page.locator(".kantu-match-card").first()).toContainText("Ramo romántico prioritario");

    await page.locator("#kantuMatchClose").click();
    await page.waitForSelector("[data-open-claims]", { state: "attached", timeout: 15000 });
    await page.locator("[data-open-claims]").click();
    await expect(page.locator("#claimsModal")).toHaveClass(/show/);
    await expect(page.locator("#claimsForm [name='detail']")).toHaveCount(1);
    await expect(page.locator("#claimsForm [name='requested_action']")).toHaveCount(1);
});

test("Admin dedicado y controles comerciales se preparan sin tocar la tienda", async ({ page }) => {
    await page.goto("/?admin=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.KantuAdminGrowth) && Boolean(window.KantuAdminStandalone), null, { timeout: 15000 });

    await expect(page.locator("body")).toHaveClass(/admin-standalone-mode/);
    await expect(page).toHaveTitle(/Panel administrador/);
    await expect(page.locator('[data-admin-view="alerts"]')).toHaveCount(1);
    await expect(page.locator('[data-admin-view="claims"]')).toHaveCount(1);
    await expect(page.locator("#adminAlertBell")).toHaveCount(1);
    await expect(page.locator("#adminRecommendationFields")).toHaveCount(1);
    await expect(page.locator("#adminRecommendationPriority")).toHaveAttribute("max", "10");
});
