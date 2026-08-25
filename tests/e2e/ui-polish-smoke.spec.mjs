import { test, expect } from "@playwright/test";

test.describe("Kantu Floral global UI polish", () => {
    test("styles native controls consistently in the storefront", async ({ page }) => {
        await page.goto("/index.html");
        await expect(page.locator("link[data-kantu-ui-polish='true']")).toHaveCount(1);

        const styles = await page.locator("#adminOrderFilter").evaluate(element => {
            const computed = getComputedStyle(element);
            return {
                appearance: computed.appearance,
                borderRadius: computed.borderRadius,
                minHeight: computed.minHeight,
                backgroundImage: computed.backgroundImage
            };
        });

        expect(styles.appearance).toBe("none");
        expect(parseFloat(styles.borderRadius)).toBeGreaterThanOrEqual(10);
        expect(parseFloat(styles.minHeight)).toBeGreaterThanOrEqual(44);
        expect(styles.backgroundImage).not.toBe("none");

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
