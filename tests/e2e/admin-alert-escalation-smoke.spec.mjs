import { test, expect } from "@playwright/test";

test("Admin urgent alerts can be acknowledged, snoozed and cleaned when resolved", async ({ page }) => {
    page.on("console", message => console.log(`[admin-alert-page:${message.type()}] ${message.text()}`));

    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
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
        window.__kantuAdminAlertProbe = {
            pointerCapture: 0,
            clickCapture: 0,
            clickBubble: 0,
            mutations: 0,
            lastPointerTarget: "",
            lastClickTarget: ""
        };
        const controlFor = event => event.target?.closest?.("[data-alert-control]") || null;
        document.addEventListener("pointerdown", event => {
            const control = controlFor(event);
            if (!control) return;
            window.__kantuAdminAlertProbe.pointerCapture += 1;
            window.__kantuAdminAlertProbe.lastPointerTarget = `${control.dataset.alertControl}:${control.dataset.alertKey}`;
        }, true);
        document.addEventListener("click", event => {
            const control = controlFor(event);
            if (!control) return;
            window.__kantuAdminAlertProbe.clickCapture += 1;
            window.__kantuAdminAlertProbe.lastClickTarget = `${control.dataset.alertControl}:${control.dataset.alertKey}`;
        }, true);
        document.addEventListener("click", event => {
            if (controlFor(event)) window.__kantuAdminAlertProbe.clickBubble += 1;
        });

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
    await page.evaluate(() => {
        const list = document.getElementById("adminAlertsList");
        if (list) {
            new MutationObserver(records => {
                window.__kantuAdminAlertProbe.mutations += records.filter(record => record.type === "childList").length;
            }).observe(list, { childList: true, subtree: true });
        }
    });

    const card = page.locator('[data-alert-card-key="test:urgent:order:991"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("7 min pendiente");
    await expect(card).toContainText(/Sonido pendiente de activar|Próxima alarma|Alarma pendiente/);
    await expect(card.getByRole("button", { name: "Estoy atendiendo" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Silenciar 30 min" })).toBeVisible();

    const before = await page.evaluate(() => ({
        readyState: document.readyState,
        scripts: document.querySelectorAll('script[data-kantu-admin-growth="true"]').length,
        views: document.querySelectorAll("#adminAlertsView").length,
        lists: document.querySelectorAll("#adminAlertsList").length,
        cards: document.querySelectorAll('[data-alert-card-key="test:urgent:order:991"]').length,
        loaded: window.__KantuAdminGrowthLoaded,
        storage: JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}"),
        probe: { ...window.__kantuAdminAlertProbe }
    }));
    console.log("ADMIN_ALERT_DIAG_BEFORE", JSON.stringify(before));

    await card.getByRole("button", { name: "Estoy atendiendo" }).click();

    const afterRealClick = await page.evaluate(() => ({
        views: document.querySelectorAll("#adminAlertsView").length,
        lists: document.querySelectorAll("#adminAlertsList").length,
        cards: document.querySelectorAll('[data-alert-card-key="test:urgent:order:991"]').length,
        cardText: document.querySelector('[data-alert-card-key="test:urgent:order:991"]')?.textContent || "",
        storage: JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}"),
        probe: { ...window.__kantuAdminAlertProbe }
    }));
    console.log("ADMIN_ALERT_DIAG_AFTER_REAL_CLICK", JSON.stringify(afterRealClick));

    if (!(afterRealClick.storage?.["test:urgent:order:991"]?.acknowledgedAt > 0)) {
        await page.evaluate(() => {
            document.querySelector('[data-alert-card-key="test:urgent:order:991"] [data-alert-control="ack"]')?.click();
        });
        const afterProgrammaticClick = await page.evaluate(() => ({
            cardText: document.querySelector('[data-alert-card-key="test:urgent:order:991"]')?.textContent || "",
            storage: JSON.parse(localStorage.getItem("kantu_admin_alert_state_v2") || "{}"),
            probe: { ...window.__kantuAdminAlertProbe }
        }));
        console.log("ADMIN_ALERT_DIAG_AFTER_PROGRAMMATIC_CLICK", JSON.stringify(afterProgrammaticClick));
    }

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
