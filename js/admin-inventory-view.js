/* Kantu Floral - navegación dedicada para historial de inventario */

(() => {
    const VIEW_NAME = "inventory";
    const VIEW_ID = "adminInventoryView";
    const MOUNT_ID = "adminInventoryMount";
    const CARD_ID = "inventoryLedgerCard";
    let observer = null;

    function el(id) {
        return document.getElementById(id);
    }

    function ensureInventoryView() {
        const content = el("adminContent");
        const nav = document.querySelector(".admin-nav");
        if (!content || !nav) return false;

        let view = el(VIEW_ID);
        if (!view) {
            view = document.createElement("section");
            view.id = VIEW_ID;
            view.className = "admin-view";
            view.hidden = true;
            view.innerHTML = `
                <div class="admin-section-heading">
                    <div>
                        <h3>Inventario</h3>
                        <p>Consulta el historial de cambios de stock de los productos.</p>
                    </div>
                </div>
                <div id="${MOUNT_ID}"></div>
            `;

            const productsView = el("adminProductsView");
            if (productsView) productsView.insertAdjacentElement("afterend", view);
            else content.appendChild(view);
        }

        let button = nav.querySelector(`[data-admin-view="${VIEW_NAME}"]`);
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "admin-nav-button";
            button.dataset.adminView = VIEW_NAME;
            button.textContent = "Inventario";

            const productsButton = nav.querySelector('[data-admin-view="products"]');
            if (productsButton) productsButton.insertAdjacentElement("afterend", button);
            else nav.appendChild(button);

            button.addEventListener("click", () => {
                if (typeof switchAdminView === "function") switchAdminView(VIEW_NAME);
                moveInventoryLedger();
                window.setTimeout(moveInventoryLedger, 0);
            });
        }

        moveInventoryLedger();
        return true;
    }

    function moveInventoryLedger() {
        const mount = el(MOUNT_ID);
        const card = el(CARD_ID);
        if (!mount || !card || card.parentElement === mount) return;
        mount.appendChild(card);
    }

    function installObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(() => {
            ensureInventoryView();
            moveInventoryLedger();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function initialize() {
        ensureInventoryView();
        installObserver();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }

    window.KantuAdminInventoryView = Object.freeze({
        refreshLayout() {
            ensureInventoryView();
            moveInventoryLedger();
        }
    });
})();
