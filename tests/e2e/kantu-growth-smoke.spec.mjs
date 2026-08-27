import { test, expect } from "@playwright/test";

test("cliente ve campana, Kantu Match principal-only y Libro de Reclamaciones", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.KantuGrowth) && Boolean(window.KantuMatchV2) && Boolean(window.KantuHeaderControls), null, { timeout: 15000 });

    const favorites = page.locator("#favoritesButton");
    const cart = page.locator("#cartButton");
    const bell = page.locator("#notificationButton");
    await expect(bell).toHaveCount(1);
    await expect(favorites).not.toHaveAttribute("title", /.+/);
    await expect(cart).not.toHaveAttribute("title", /.+/);
    await expect(bell).not.toHaveAttribute("title", /.+/);
    await expect(favorites).not.toHaveAttribute("data-kantu-tooltip", /.+/);
    await expect(cart).not.toHaveAttribute("data-kantu-tooltip", /.+/);
    await expect(bell).not.toHaveAttribute("data-kantu-tooltip", /.+/);

    await bell.click();
    await expect(page.locator("#notificationPanel")).toBeVisible();
    await page.locator("#notificationClose").click();
    await expect(page.locator("#notificationPanel")).toBeHidden();

    await page.evaluate(() => {
        products = [
            { id: 910000, name: "Topper exacto que nunca debe salir", price: 15, stock: 50, active: true, category: "complementos", featured: true, recommendation_priority: 10, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] },
            { id: 910001, name: "Ramo romántico prioritario", price: 89, stock: 8, active: true, category: "rosas", featured: true, recommendation_priority: 10, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] },
            { id: 910002, name: "Ramo romántico secundario", price: 79, stock: 6, active: true, category: "ramos", featured: false, recommendation_priority: 2, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] },
            { id: 910003, name: "Ramo sin stock", price: 59, stock: 0, active: true, category: "girasoles", featured: false, recommendation_priority: 9, recommendation_audiences: ["pareja"], recommendation_occasions: ["aniversario"], recommendation_styles: ["romantico"] }
        ];
    });

    await page.locator("#kantuMatchButton").click();
    await expect(page.locator("#kantuMatchModal")).toHaveClass(/show/);
    await expect(page.locator('.kantu-match-modal[data-kantu-match-v2="true"]')).toHaveCount(1);

    await expect(page.locator('input[name="matchAudience"][value="hermano"]')).toHaveCount(1);
    await expect(page.locator('input[name="matchAudience"][value="novio"]')).toHaveCount(1);
    await expect(page.locator('input[name="matchOccasion"][value="graduacion"]')).toHaveCount(1);
    await expect(page.locator('input[name="matchOccasion"][value="dia_padre"]')).toHaveCount(1);
    await expect(page.locator('input[name="matchOccasion"][value="dia_madre"]')).toHaveCount(1);
    await expect(page.locator('input[name="matchStyle"][value="lujoso"]')).toHaveCount(1);

    await page.locator('label:has(input[name="matchAudience"][value="pareja"])').click();
    await page.locator('label:has(input[name="matchOccasion"][value="aniversario"])').click();
    await page.locator('label:has(input[name="matchStyle"][value="romantico"])').click();
    await page.locator('label:has(input[name="matchBudget"][value="100"])').click();

    await page.locator("#kantuMatchForm").evaluate(form => form.requestSubmit());
    await expect(page.locator("#kantuMatchResults")).toBeVisible();
    await expect(page.locator(".kantu-match-card").first()).toContainText("Ramo romántico prioritario");
    await expect(page.locator("#kantuMatchResults")).not.toContainText("Topper exacto que nunca debe salir");
    await expect(page.locator("#kantuMatchResults")).not.toContainText("Ramo sin stock");
    await expect(page.locator('.kantu-match-card[data-kantu-match-category="complementos"]')).toHaveCount(0);
    await expect(page.locator('.kantu-match-card[data-kantu-match-primary="true"]')).toHaveCount(2);

    const fallback = await page.evaluate(() => window.KantuMatchV2.findMatches({
        audience: "companero",
        occasion: "graduacion",
        style: "moderno",
        budget: 60
    }, [
        { id: 920001, name: "Globo barato", price: 7, stock: 30, active: true, category: "complementos", recommendation_priority: 10 },
        { id: 920002, name: "Ramo principal fuera de presupuesto", price: 220, stock: 2, active: true, category: "ramos", featured: true, recommendation_priority: 4 },
        { id: 920003, name: "Ramo inactivo", price: 50, stock: 2, active: false, category: "ramos", featured: true, recommendation_priority: 10 }
    ]).map(product => ({ id: product.id, category: product.category })));
    expect(fallback).toEqual([{ id: 920002, category: "ramos" }]);

    const modal = page.locator(".kantu-match-modal");
    const close = page.locator("#kantuMatchClose");
    await expect(page.locator(".kantu-match-sticky-close")).toHaveCSS("position", "sticky");
    await expect(close).toBeVisible();
    await expect(close).toHaveCSS("width", "48px");
    await modal.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(100);
    const closeGeometry = await page.evaluate(() => {
        const modalElement = document.querySelector(".kantu-match-modal");
        const closeElement = document.getElementById("kantuMatchClose");
        const modalRect = modalElement.getBoundingClientRect();
        const closeRect = closeElement.getBoundingClientRect();
        return {
            modalTop: modalRect.top,
            modalBottom: modalRect.bottom,
            closeTop: closeRect.top,
            closeBottom: closeRect.bottom
        };
    });
    expect(closeGeometry.closeTop).toBeGreaterThanOrEqual(closeGeometry.modalTop - 2);
    expect(closeGeometry.closeBottom).toBeLessThanOrEqual(closeGeometry.modalBottom + 2);

    await close.click();
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
