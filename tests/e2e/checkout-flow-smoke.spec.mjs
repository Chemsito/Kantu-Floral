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

        const initialState = await page.evaluate(() => ({
            toggleChecked: document.getElementById("checkoutDifferentRecipientToggle")?.checked,
            giftGridHidden: document.querySelector("#checkoutGiftSection .checkout-gift-grid")?.hidden,
            submitInstalled: typeof document.getElementById("checkoutForm")?.onsubmit === "function"
        }));
        expect(initialState).toEqual({
            toggleChecked: false,
            giftGridHidden: true,
            submitInstalled: true
        });

        const mirrored = await page.evaluate(() => {
            const name = document.getElementById("checkoutName");
            const phone = document.getElementById("checkoutPhone");
            name.value = "Cliente de prueba";
            phone.value = "999888777";
            name.dispatchEvent(new Event("input", { bubbles: true }));
            phone.dispatchEvent(new Event("input", { bubbles: true }));
            return {
                recipientName: document.getElementById("checkoutRecipientName")?.value,
                recipientPhone: document.getElementById("checkoutRecipientPhone")?.value
            };
        });
        expect(mirrored).toEqual({
            recipientName: "Cliente de prueba",
            recipientPhone: "999888777"
        });

        const toggledGridHidden = await page.evaluate(() => {
            const toggle = document.getElementById("checkoutDifferentRecipientToggle");
            toggle.checked = true;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
            return document.querySelector("#checkoutGiftSection .checkout-gift-grid")?.hidden;
        });
        expect(toggledGridHidden).toBe(false);

        await expect(page.locator("#confirmOrderButton")).toHaveText("Crear pedido y elegir pago");
        await expect(page.locator("#checkoutPaymentTrustNote")).toContainText("No se cobrará nada");
        expect(pageErrors).toEqual([]);
    });
});
