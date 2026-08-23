import { test, expect } from "@playwright/test";

test.describe("Kantu Floral simplified checkout", () => {
    test("organizes checkout progressively without replacing secure order submission", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/index.html");

        await expect(page.locator("script[data-kantu-checkout-flow='true']")).toHaveCount(1);
        await expect(page.locator("link[href='css/checkout-flow.css']")).toHaveCount(1);
        await expect(page.locator("#checkoutFlowProgress > li")).toHaveCount(4);
        await expect(page.locator("#checkoutBuyerFlowSection")).toHaveCount(1);
        await expect(page.locator("#checkoutGiftSection")).toHaveCount(1);
        await expect(page.locator("#checkoutDeliveryFlowSection")).toHaveCount(1);
        await expect(page.locator("#checkoutReviewFlowSection")).toHaveCount(1);

        const toggle = page.locator("#checkoutDifferentRecipientToggle");
        await expect(toggle).toHaveCount(1);
        await expect(toggle).not.toBeChecked();

        const initialGridHidden = await page.locator("#checkoutGiftSection .checkout-gift-grid").evaluate(node => node.hidden);
        expect(initialGridHidden).toBe(true);

        await page.locator("#checkoutName").fill("Cliente de prueba");
        await page.locator("#checkoutPhone").fill("999888777");
        await page.waitForTimeout(50);

        await expect(page.locator("#checkoutRecipientName")).toHaveValue("Cliente de prueba");
        await expect(page.locator("#checkoutRecipientPhone")).toHaveValue("999888777");

        await toggle.check();
        const toggledGridHidden = await page.locator("#checkoutGiftSection .checkout-gift-grid").evaluate(node => node.hidden);
        expect(toggledGridHidden).toBe(false);

        await expect(page.locator("#confirmOrderButton")).toHaveText("Crear pedido y elegir pago");
        await expect(page.locator("#checkoutPaymentTrustNote")).toContainText("No se cobrará nada");

        const onSubmitInstalled = await page.locator("#checkoutForm").evaluate(form => typeof form.onsubmit === "function");
        expect(onSubmitInstalled).toBe(true);
        expect(pageErrors).toEqual([]);
    });
});
