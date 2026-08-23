import { test, expect } from "@playwright/test";

test.describe("Kantu Floral coupons", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("coupon checkout and admin controls initialize without exposing a fake promotion", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/", { waitUntil: "domcontentloaded" });

        await expect(page.locator("script[data-kantu-coupons='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("script[data-kantu-admin-coupons='true']")).toHaveCount(1, { timeout: 15000 });
        await expect(page.locator("#checkoutCouponSection")).toHaveCount(1);
        await expect(page.locator("#checkoutCouponCode")).toHaveAttribute("maxlength", "32");
        await expect(page.locator("[data-admin-view='coupons']")).toHaveCount(1);
        await expect(page.locator("#adminCouponsView")).toHaveCount(1);
        await expect(page.locator("#adminCouponCode")).toHaveValue("");
        expect(pageErrors).toEqual([]);
    });
});
