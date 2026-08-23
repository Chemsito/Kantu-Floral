import { test, expect } from "@playwright/test";

test.describe("Kantu Floral guest checkout", () => {
    test("loads guest checkout without exposing the bearer token through its public API", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/index.html");

        await expect(page.locator("script[data-kantu-guest-checkout='true']")).toHaveCount(1);
        await expect(page.locator("link[data-kantu-guest-checkout-style='true']")).toHaveCount(1);
        await expect(page.locator("#guestCheckoutBanner")).toHaveCount(1);
        await expect(page.locator("#guestCheckoutBanner")).toBeHidden();
        await expect(page.locator("#guestOrderResume")).toHaveCount(1);

        const apiReady = await page.evaluate(() => ({
            available: Boolean(window.KantuGuestCheckout),
            active: window.KantuGuestCheckout?.isActive?.(),
            stored: window.KantuGuestCheckout?.storedOrders?.()
        }));
        expect(apiReady.available).toBe(true);
        expect(apiReady.active).toBe(false);
        expect(apiReady.stored).toEqual([]);

        const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await page.evaluate(expiry => {
            localStorage.setItem("kantuGuestOrders:v1", JSON.stringify([{
                order_id: "987654",
                guest_token: "A".repeat(43),
                access_expires_at: expiry,
                total: 125.5,
                created_at: new Date().toISOString()
            }]));
        }, future);

        await page.reload();
        await expect(page.locator("script[data-kantu-guest-checkout='true']")).toHaveCount(1);
        await expect(page.locator("#guestOrderResume")).toBeVisible();
        await expect(page.locator("#guestOrderResumeLabel")).toHaveText("Pedido #987654");

        const exposed = await page.evaluate(() => window.KantuGuestCheckout.storedOrders());
        expect(exposed).toHaveLength(1);
        expect(exposed[0].order_id).toBe("987654");
        expect(exposed[0]).not.toHaveProperty("guest_token");
        expect(pageErrors).toEqual([]);
    });
});
