import { test, expect } from "@playwright/test";

test.describe("Kantu Floral brand experience", () => {
    test("uses Kantu icons, tooltips, dialogs and header polish", async ({ page }) => {
        await page.goto("/index.html");
        await expect(page.locator("link[data-kantu-brand-experience='true']")).toHaveCount(1);

        const favorites = page.locator("#favoritesButton");
        await expect(favorites.locator("svg.kantu-icon")).toHaveCount(1);
        await expect(favorites).not.toHaveAttribute("title", /.+/);
        await expect(favorites).toHaveAttribute("data-kantu-tooltip", "Favoritos");

        await page.evaluate(() => {
            window.__kantuDialogResult = null;
            window.KantuDialog.confirm({
                title: "Prueba Kantu",
                message: "Confirmación visual",
                tone: "danger"
            }).then(result => {
                window.__kantuDialogResult = result;
            });
        });
        await expect(page.locator("#kantuDialogOverlay")).toBeVisible();
        await expect(page.locator("#kantuDialogTitle")).toHaveText("Prueba Kantu");
        await page.locator(".kantu-dialog-cancel").click();
        await expect.poll(() => page.evaluate(() => window.__kantuDialogResult)).toBe(false);

        await page.evaluate(() => window.scrollTo(0, 100));
        await expect(page.locator(".site-header")).toHaveClass(/kantu-scrolled/);
    });

    test("brands Leaflet controls and exposes accessible labels", async ({ page }) => {
        await page.goto("/index.html");
        await page.evaluate(() => {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = `
                <div id="fakeLeaflet" class="leaflet-container">
                    <div class="leaflet-control-zoom">
                        <a class="leaflet-control-zoom-in">+</a>
                        <a class="leaflet-control-zoom-out">−</a>
                    </div>
                </div>`;
            document.body.appendChild(wrapper);
            window.KantuBrandUi.refresh();
        });

        await expect(page.locator(".leaflet-control-zoom-in")).toHaveAttribute("aria-label", "Acercar mapa");
        await expect(page.locator(".leaflet-control-zoom-out")).toHaveAttribute("aria-label", "Alejar mapa");
        const radius = await page.locator(".leaflet-control-zoom").evaluate(node => getComputedStyle(node).borderRadius);
        expect(parseFloat(radius)).toBeGreaterThanOrEqual(10);
    });

    test("adds the real large plush to gift upsells without truncating its name", async ({ page }) => {
        await page.goto("/index.html");
        await page.evaluate(() => {
            products = [
                {
                    id: 72,
                    name: "Peluche hipoalergénico grande",
                    price: 109,
                    stock: 10,
                    active: true,
                    category: "complementos",
                    image: "assets/catalog/blume-2026/086.webp"
                }
            ];
            let list = document.getElementById("checkoutUpsellList");
            if (!list) {
                list = document.createElement("div");
                list.id = "checkoutUpsellList";
                list.className = "checkout-upsell-list";
                document.body.appendChild(list);
            } else {
                list.innerHTML = "";
            }
            window.KantuBrandUi.refreshGiftUpsell();
        });

        const card = page.locator('[data-kantu-priority-upsell="72"]');
        await expect(card).toHaveCount(1);
        await expect(card.locator("strong")).toHaveText("Peluche hipoalergénico grande");
        await expect(card).toContainText("S/ 109.00");
        const textStyle = await card.locator("strong").evaluate(node => ({
            whiteSpace: getComputedStyle(node).whiteSpace,
            overflow: getComputedStyle(node).overflow,
            textOverflow: getComputedStyle(node).textOverflow
        }));
        expect(textStyle.whiteSpace).toBe("normal");
        expect(textStyle.textOverflow).not.toBe("ellipsis");
    });

    test("provides a sticky mobile checkout action synced to the real total", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/index.html");
        await expect(page.locator("#kantuCheckoutMobileBar")).toHaveCount(1);

        await page.evaluate(() => {
            document.getElementById("checkoutTotal").textContent = "S/ 134.00";
            document.getElementById("checkoutModal").classList.add("show");
        });
        await expect(page.locator("#kantuCheckoutMobileBar")).toBeVisible();
        await expect(page.locator(".kantu-checkout-mobile-total strong")).toHaveText("S/ 134.00");
        const position = await page.locator("#kantuCheckoutMobileBar").evaluate(node => getComputedStyle(node).position);
        expect(position).toBe("fixed");
    });

    test("shares central brand tokens with product detail and Staff", async ({ page }) => {
        await page.goto("/producto.html?id=1");
        await expect(page.locator("link[data-kantu-brand-experience='true']")).toHaveCount(1);
        let radius = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-radius-lg").trim());
        expect(radius).toBe("22px");

        await page.goto("/staff.html");
        await expect(page.locator("link[data-kantu-brand-experience='true']")).toHaveCount(1);
        radius = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--kantu-radius-lg").trim());
        expect(radius).toBe("22px");
    });
});
