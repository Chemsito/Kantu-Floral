import { test, expect } from "@playwright/test";

test.describe("Kantu Floral Admin controls", () => {
    test("product visibility is a fully clickable accessible toggle", async ({ page }) => {
        await page.goto("/index.html", { waitUntil: "domcontentloaded" });

        await page.evaluate(() => {
            document.getElementById("adminModal")?.classList.add("show");
            const content = document.getElementById("adminContent");
            const formView = document.getElementById("adminProductFormView");
            if (content) content.hidden = false;
            if (formView) formView.hidden = false;
        });

        const input = page.locator("#adminProductActive");
        const toggle = page.locator(".admin-checkbox:has(#adminProductActive)");

        await expect(input).toBeChecked();
        await toggle.click({ position: { x: 130, y: 30 } });
        await expect(input).not.toBeChecked();
        await toggle.click({ position: { x: 130, y: 30 } });
        await expect(input).toBeChecked();

        await input.focus();
        await page.keyboard.press("Space");
        await expect(input).not.toBeChecked();

        const geometry = await toggle.evaluate(node => {
            const inputNode = node.querySelector("#adminProductActive");
            const labelRect = node.getBoundingClientRect();
            const inputRect = inputNode.getBoundingClientRect();
            return {
                labelHeight: labelRect.height,
                inputWidth: inputRect.width,
                inputHeight: inputRect.height,
                cursor: getComputedStyle(node).cursor
            };
        });
        expect(geometry.labelHeight).toBeGreaterThanOrEqual(60);
        expect(geometry.inputWidth).toBeGreaterThan(100);
        expect(geometry.inputHeight).toBeGreaterThanOrEqual(60);
        expect(geometry.cursor).toBe("pointer");
    });

    test("payment filters behave like compact selectable chips", async ({ page }) => {
        await page.goto("/index.html", { waitUntil: "domcontentloaded" });

        await page.evaluate(() => {
            document.getElementById("adminModal")?.classList.add("show");
            const content = document.getElementById("adminContent");
            const view = document.getElementById("adminPaymentsView");
            if (content) content.hidden = false;
            if (view) view.hidden = false;
        });

        const received = page.locator('#adminPaymentFilters input[value="uploaded"]');
        const chip = page.locator('#adminPaymentFilters label:has(input[value="uploaded"])');
        await expect(received).toBeChecked();

        const before = await chip.evaluate(node => ({
            height: node.getBoundingClientRect().height,
            inputMinHeight: getComputedStyle(node.querySelector("input")).minHeight,
            inputWidth: node.querySelector("input").getBoundingClientRect().width
        }));
        expect(before.height).toBeLessThan(55);
        expect(before.inputMinHeight).not.toBe("44px");
        expect(before.inputWidth).toBeLessThanOrEqual(2);

        await chip.click();
        await expect(received).not.toBeChecked();
        await chip.click();
        await expect(received).toBeChecked();
    });

    test("Admin alert bell is larger and sits clear to the left of close", async ({ page }) => {
        await page.goto("/?admin=1", { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean(document.getElementById("adminAlertBell")), null, { timeout: 15000 });

        const bell = page.locator("#adminAlertBell");
        const close = page.locator("#adminCloseButton");
        const bellBox = await bell.boundingBox();
        const closeBox = await close.boundingBox();

        expect(bellBox).not.toBeNull();
        expect(closeBox).not.toBeNull();
        expect(bellBox.width).toBeGreaterThanOrEqual(48);
        expect(bellBox.x + bellBox.width).toBeLessThan(closeBox.x);
    });
});
