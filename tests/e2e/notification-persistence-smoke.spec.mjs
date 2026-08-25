import { test, expect } from "@playwright/test";

const USER_ID = "11111111-1111-4111-8111-111111111111";

test("product detail keeps the notification bell and authenticated reads persist after reload", async ({ page }) => {
    const storedReads = new Set();

    await page.route("**/auth/v1/**", async route => {
        const url = route.request().url();
        if (url.includes("/user")) {
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USER_ID, email: "cliente@example.com" }) });
        }
        return route.continue();
    });

    await page.route("**/rest/v1/customer_notification_reads**", async route => {
        const request = route.request();
        if (request.method() === "GET") {
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([...storedReads].map(notification_key => ({ notification_key }))) });
        }
        if (request.method() === "POST") {
            const payload = request.postDataJSON();
            const rows = Array.isArray(payload) ? payload : [payload];
            rows.forEach(row => storedReads.add(String(row.notification_key)));
            return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
        }
        return route.continue();
    });

    await page.route("**/rest/v1/rpc/get_customer_notification_feed", route => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
            { notification_key: "trend:1", kind: "trend", title: "Destacado", body: "Producto disponible", severity: "info", action_url: "producto.html?id=1", created_at: new Date().toISOString() },
            { notification_key: "promo:1", kind: "promotion", title: "Promoción", body: "Beneficio disponible", severity: "benefit", action_url: "#catalogo", created_at: new Date().toISOString() }
        ])
    }));

    await page.addInitScript(({ userId }) => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const url = String(input);
            if (url.includes("/auth/v1/token") || url.includes("/auth/v1/user")) return originalFetch(input, init);
            return originalFetch(input, init);
        };
        localStorage.setItem("sb-uzsbpgbsuetfqvdvvaiu-auth-token", JSON.stringify({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user: { id: userId, email: "cliente@example.com" }
        }));
    }, { userId: USER_ID });

    await page.goto("/producto.html?id=1");
    await expect(page.locator("#notificationButton")).toBeVisible();
    await page.locator("#notificationButton").click();
    await expect(page.locator("#notificationMarkAll")).toBeVisible();
    await page.locator("#notificationMarkAll").click();
    await expect.poll(() => storedReads.size).toBe(2);

    await page.reload();
    await page.locator("#notificationButton").click();
    await expect(page.locator(".kantu-notification-item.unread")).toHaveCount(0);
    await expect(page.locator("#notificationCount")).toBeHidden();
});
