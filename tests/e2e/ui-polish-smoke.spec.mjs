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

    test("loads the same visual system on product detail", async ({ page }) => {
        await page.goto("/producto.html?id=1");
        await expect(page.locator("link[data-kantu-ui-polish='true']")).toHaveCount(1);
        const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-control-accent").trim());
        expect(accent).toBe("#a92f50");
    });

    test("shares the visual system with staff through customization styles", async ({ page }) => {
        await page.goto("/staff.html");
        const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-control-accent").trim());
        expect(accent).toBe("#a92f50");
    });
});
