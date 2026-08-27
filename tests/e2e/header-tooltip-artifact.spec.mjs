import { test, expect } from "@playwright/test";

test("header compacto nunca muestra tooltips oscuros recortados", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.KantuHeaderControls) && Boolean(document.getElementById("notificationButton")), null, { timeout: 15000 });

    const ids = ["favoritesButton", "cartButton", "notificationButton"];
    for (const id of ids) {
        const control = page.locator(`#${id}`);
        await expect(control).toHaveCount(1);
        await expect(control).not.toHaveAttribute("title", /.+/);
        await expect(control).not.toHaveAttribute("data-kantu-tooltip", /.+/);
    }

    // Reproduce la carrera que originó el artefacto: una capa tardía vuelve a
    // asignar title/data-kantu-tooltip después de que el header ya cargó.
    await page.evaluate(() => {
        const favorites = document.getElementById("favoritesButton");
        const cart = document.getElementById("cartButton");
        const bell = document.getElementById("notificationButton");
        favorites?.setAttribute("title", "Favoritos tardío");
        cart?.setAttribute("data-kantu-tooltip", "Carrito tardío");
        bell?.setAttribute("title", "Notificaciones tardío");
    });

    await page.waitForTimeout(50);

    for (const id of ids) {
        const control = page.locator(`#${id}`);
        await expect(control).not.toHaveAttribute("title", /.+/);
        await expect(control).not.toHaveAttribute("data-kantu-tooltip", /.+/);
        await control.hover();
        const pseudo = await control.evaluate(node => ({
            beforeContent: getComputedStyle(node, "::before").content,
            afterContent: getComputedStyle(node, "::after").content,
            beforeVisibility: getComputedStyle(node, "::before").visibility,
            afterVisibility: getComputedStyle(node, "::after").visibility
        }));
        expect(["none", '""']).toContain(pseudo.beforeContent);
        expect(["none", '""']).toContain(pseudo.afterContent);
    }
});
