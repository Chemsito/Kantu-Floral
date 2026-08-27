import { test, expect } from "@playwright/test";

test("storefront exposes real help content and clean compact header controls", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("#ayuda-faq")).toBeVisible();
    await expect(page.locator("#ayuda-delivery")).toBeVisible();
    await expect(page.locator("#ayuda-pagos")).toBeVisible();

    await expect(page.locator('footer a[href="#ayuda-faq"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="#ayuda-delivery"]')).toHaveCount(1);
    await expect(page.locator('footer a[href="#ayuda-pagos"]')).toHaveCount(1);

    for (const selector of ["#favoritesButton", "#cartButton"]) {
        const control = page.locator(selector);
        await expect(control).not.toHaveAttribute("title", /.+/);
        await expect(control).not.toHaveAttribute("data-kantu-tooltip", /.+/);
        await expect(control.locator("svg.kantu-source-icon")).toHaveCount(1);
    }
});

test("password reset uses Kantu identity and verifies access before form use", async ({ page }) => {
    await page.goto("/reset-password.html");

    await expect(page.locator('link[rel="icon"][href="assets/brand/favicon.ico"]')).toHaveCount(1);
    await expect(page.locator(".reset-card")).toBeVisible();
    await expect(page.locator("#resetAccessState")).toContainText(/Verificando|enlace|sesión/i);
    await expect(page.locator('[data-password-toggle="newPassword"]')).toHaveCount(1);
    await expect(page.locator("#resetStrength")).toHaveCount(1);
    await expect(page.locator("#newPasswordForm")).toBeHidden();
});

test("staff mobile header keeps identity and actions readable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/staff.html");

    const header = page.locator(".staff-header");
    await expect(header).toBeVisible();
    await expect(page.locator(".staff-brand-mark img")).toHaveCount(1);

    const layout = await page.locator(".staff-header-actions").evaluate(node => ({
        display: getComputedStyle(node).display,
        width: node.getBoundingClientRect().width,
        viewport: window.innerWidth
    }));
    expect(layout.display).toBe("grid");
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);
});
