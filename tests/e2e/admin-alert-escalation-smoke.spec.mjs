import { test, expect } from "@playwright/test";

test("Admin urgent alerts can be acknowledged, snoozed and cleaned when resolved", async ({ page }) => {
    await page.goto("/?admin=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.KantuAdminGrowth && window.supabaseClient), null, { timeout: 15000 });

    await page.evaluate(() => {
        localStorage.removeItem("kantu_admin_alert_state_v2");
        window.__kantuAdminAlertRows = [{
            alert_key: "test:urgent:order:991",
            severity: "urgent",
            title: "Pedido #991 requiere atención",
            body: "Pago confirmado y pendiente de revisión.",
            minutes_waiting: 7,
            action_view: "orders",
            entity_id: "991"
        }];
        const baseRpc = supabaseClient.rpc.bind(supabaseClient);
        supabaseClient.rpc = (name, ...args) => {
            if (name === "admin_operational_alerts") {
                return Promise.resolve({ data: window.__kantuAdminAlertRows, error: null });
            }
            return baseRpc(name, ...args);
        };
        document.getElementById("adminModal")?.classList.add("show");
        const content = document.getElementById("adminContent");
        const alertsView = document.getElementById("adminAlertsView");
        if (content) content.hidden = false;
        if (alertsView) alertsView.hidden = false;
    });

    await page.evaluate(() => window.KantuAdminGrowth.refreshAlerts());

    const card = page.locator('[data-alert-card-key="test:urgent:order:991"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("7 min pendiente");
    await expect(card).toContainText(/Sonido pendiente de activar|Próxima alarma|Alarma pendiente/);
    await expect(card.getByRole("button", { name: "Estoy atendiendo" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Silenciar 30 min" })).toBeVisible();

    await card.getByRole("button", { name: "Estoy atendiendo" }).click();
    await expect(card).toContainText("Atendiendo · alarma detenida");
    await expect(card.getByRole("button", { name: "Reactivar alarma" })).toBeVisible();

    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}"));
    expect(stored["test:urgent:order:991"].acknowledgedAt).toBeGreaterThan(0);

    await card.getByRole("button", { name: "Reactivar alarma" }).click();
    await expect(card.getByRole("button", { name: "Silenciar 30 min" })).toBeVisible();
    await card.getByRole("button", { name: "Silenciar 30 min" }).click();
    await expect(card).toContainText(/Silenciado · vuelve en 30 min|Silenciado · vuelve en 29 min/);

    const snoozeDelta = await page.evaluate(() => {
        const memory = JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}");
        return Number(memory["test:urgent:order:991"]?.snoozedUntil || 0) - Date.now();
    });
    expect(snoozeDelta).toBeGreaterThan(29 * 60_000);
    expect(snoozeDelta).toBeLessThanOrEqual(30 * 60_000);

    await page.evaluate(async () => {
        window.__kantuAdminAlertRows = [];
        await window.KantuAdminGrowth.refreshAlerts();
    });
    await expect(page.locator("#adminAlertsList")).toContainText("No hay incidencias operativas activas");

    stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}"));
    expect(stored["test:urgent:order:991"]).toBeUndefined();
});
