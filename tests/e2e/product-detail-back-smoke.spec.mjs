import { test, expect } from "@playwright/test";

test("detalle de producto ofrece volver al catálogo", async ({ page }) => {
    await page.goto("/producto.html");

    const back = page.getByRole("button", { name: "Volver a la posición anterior del catálogo" });
    await expect(back).toBeVisible();
    await back.click();

    await expect(page).toHaveURL(/\/index\.html#catalogo$/);
});
