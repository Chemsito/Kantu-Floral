import { test, expect } from "@playwright/test";

test.describe("Kantu Floral editable checkout review", () => {
    test("removes products in place and closes checkout when the order becomes empty", async ({ page }) => {
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        await page.goto("/index.html");
        await expect(page.locator("script[data-kantu-checkout-review-editing='true']")).toHaveCount(1);
        await page.waitForFunction(() => typeof products !== "undefined" && Array.isArray(products) && products.length >= 2);

        await page.evaluate(() => {
            const available = products.filter(product => product?.active !== false && Number(product?.stock) > 0).slice(0, 2);
            cart = available.map(product => ({ id: Number(product.id), quantity: 1 }));
            saveCart();
            updateCart();
            document.getElementById("checkoutModal")?.classList.add("show");
            renderCheckoutSummary();
        });

        const removeButtons = page.locator("#checkoutSummary [data-checkout-remove-product]");
        await expect(removeButtons).toHaveCount(2);

        await removeButtons.first().click();
        await expect(page.locator("#checkoutSummary [data-checkout-remove-product]")).toHaveCount(1);
        await expect(page.locator("#checkoutModal")).toHaveClass(/show/);

        await page.locator("#checkoutSummary [data-checkout-remove-product]").click();
        await expect(page.locator("#checkoutModal")).not.toHaveClass(/show/);

        const modalControlState = await page.evaluate(() => {
            const closeButton = document.querySelector("#checkoutModal .modal > .close-modal");
            const modal = document.querySelector("#checkoutModal .modal");
            return {
                closePosition: closeButton ? getComputedStyle(closeButton).position : "",
                scrollbarColor: modal ? getComputedStyle(modal).scrollbarColor : ""
            };
        });

        expect(modalControlState.closePosition).toBe("sticky");
        expect(modalControlState.scrollbarColor).not.toBe("auto");
        expect(pageErrors).toEqual([]);
    });
});
