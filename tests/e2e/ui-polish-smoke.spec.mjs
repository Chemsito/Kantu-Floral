import { test, expect } from "@playwright/test";

test.describe("Kantu Floral global UI polish", () => {
    test("replaces catalog native dropdowns with Kantu menus", async ({ page }) => {
        await page.goto("/index.html");
        await expect(page.locator("link[data-kantu-ui-polish='true']")).toHaveCount(1);
        await expect(page.locator("script[data-kantu-ui-polish-script='true']")).toHaveCount(1);
        await expect(page.locator("#catalogSort")).toHaveCount(1);

        const shell = page.locator(".kantu-select-shell", { has: page.locator("#catalogSort") });
        await expect(shell).toHaveCount(1);
        const trigger = shell.locator(".kantu-select-trigger");
        await expect(trigger).toContainText("Recomendados");

        await trigger.click();
        await expect(shell).toHaveClass(/is-open/);
        await expect(shell.locator(".kantu-select-option")).toHaveCount(6);
        await shell.locator(".kantu-select-option", { hasText: "Más pedidos" }).click();
        await expect(page.locator("#catalogSort")).toHaveValue("popular");
        await expect(trigger).toContainText("Más pedidos");

        await page.locator("#catalogReset").click();
        await expect(page.locator("#catalogSort")).toHaveValue("recommended");
        await expect(trigger).toContainText("Recomendados");

        const triggerStyles = await trigger.evaluate(element => {
            const computed = getComputedStyle(element);
            return {
                radius: computed.borderRadius,
                height: computed.minHeight,
                background: computed.backgroundColor
            };
        });
        expect(parseFloat(triggerStyles.radius)).toBeGreaterThanOrEqual(10);
        expect(parseFloat(triggerStyles.height)).toBeGreaterThanOrEqual(44);

        const checkboxAppearance = await page.locator("#adminPaymentsView input[type='checkbox']").first().evaluate(element => getComputedStyle(element).appearance);
        expect(checkboxAppearance).toBe("none");
    });

    test("keeps catalog dropdown above category chips on mobile", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/index.html");

        const shell = page.locator(".kantu-select-shell", { has: page.locator("#catalogSort") });
        const trigger = shell.locator(".kantu-select-trigger");
        const menu = shell.locator(".kantu-select-menu");

        await trigger.click();
        await expect(shell).toHaveClass(/is-open/);
        await expect(menu).toBeVisible();

        const stacking = await page.evaluate(() => {
            const tools = document.querySelector("#catalogo .catalog-tools");
            const categories = document.querySelector("#catalogo .categories");
            const openMenu = document.querySelector("#catalogo .kantu-select-shell.is-open .kantu-select-menu");
            return {
                tools: Number.parseInt(getComputedStyle(tools).zIndex, 10) || 0,
                categories: Number.parseInt(getComputedStyle(categories).zIndex, 10) || 0,
                menu: Number.parseInt(getComputedStyle(openMenu).zIndex, 10) || 0
            };
        });

        expect(stacking.tools).toBeGreaterThan(stacking.categories);
        expect(stacking.menu).toBeGreaterThan(1000);
    });

    test("loads the same visual system on product detail", async ({ page }) => {
        await page.goto("/producto.html?id=1");
        await expect(page.locator("link[data-kantu-ui-polish='true']")).toHaveCount(1);
        const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-control-accent").trim());
        expect(accent).toBe("#a92f50");
    });

    test("shares the visual system with staff", async ({ page }) => {
        await page.goto("/staff.html");
        await expect(page.locator("link[data-kantu-ui-polish='true']")).toHaveCount(1);
        const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-control-accent").trim());
        expect(accent).toBe("#a92f50");
    });
});
