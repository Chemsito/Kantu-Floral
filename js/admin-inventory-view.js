/* Kantu Floral - navegación y filtros dedicados para historial de inventario */

(() => {
    const VIEW_NAME = "inventory";
    const VIEW_ID = "adminInventoryView";
    const MOUNT_ID = "adminInventoryMount";
    const CARD_ID = "inventoryLedgerCard";
    const inventoryFilterState = {
        category: "todos",
        search: ""
    };
    const inventoryCategoryByName = new Map();
    let categoryMapLoading = null;
    let observer = null;

    function el(id) {
        return document.getElementById(id);
    }

    function normalize(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function categoriesMarkup() {
        const categories = Array.isArray(window.KantuProductConfig?.categories)
            ? window.KantuProductConfig.categories
            : [];
        return categories
            .map(([value, label]) => `<option value="${String(value).replace(/"/g, "&quot;")}">${String(label).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</option>`)
            .join("");
    }

    function ensureInventoryToolbar(view) {
        let toolbar = el("adminInventoryTools");
        if (toolbar) return toolbar;

        toolbar = document.createElement("section");
        toolbar.id = "adminInventoryTools";
        toolbar.className = "admin-product-tools";
        toolbar.innerHTML = `
            <div class="admin-product-tools-main">
                <label class="admin-product-tool-search">
                    <span>Buscar producto</span>
                    <input id="adminInventorySearch" type="search" autocomplete="off" placeholder="Producto o movimiento…">
                </label>
                <label class="admin-product-tool-category">
                    <span>Categoría</span>
                    <select id="adminInventoryCategoryFilter">
                        <option value="todos">Todas las categorías</option>
                        ${categoriesMarkup()}
                    </select>
                </label>
            </div>
            <div class="admin-product-tools-meta">
                <strong id="adminInventoryFilterCount">0 movimientos</strong>
                <button id="adminInventoryFilterClear" type="button">Limpiar filtros</button>
            </div>`;

        const mount = el(MOUNT_ID);
        if (mount) mount.insertAdjacentElement("beforebegin", toolbar);
        else view.appendChild(toolbar);

        el("adminInventorySearch")?.addEventListener("input", event => {
            inventoryFilterState.search = event.target.value;
            applyInventoryFilters();
        });
        el("adminInventoryCategoryFilter")?.addEventListener("change", async event => {
            inventoryFilterState.category = event.target.value || "todos";
            await loadInventoryCategoryMap();
            applyInventoryFilters();
        });
        el("adminInventoryFilterClear")?.addEventListener("click", () => {
            inventoryFilterState.search = "";
            inventoryFilterState.category = "todos";
            if (el("adminInventorySearch")) el("adminInventorySearch").value = "";
            if (el("adminInventoryCategoryFilter")) el("adminInventoryCategoryFilter").value = "todos";
            applyInventoryFilters();
        });

        return toolbar;
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

        ensureInventoryToolbar(view);

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
                loadInventoryCategoryMap();
                window.setTimeout(() => {
                    moveInventoryLedger();
                    el("inventoryLedgerRefresh")?.click();
                    window.setTimeout(applyInventoryFilters, 0);
                }, 0);
            });
        }

        moveInventoryLedger();
        ensureProductToolbarPlacement();
        return true;
    }

    function ensureProductToolbarPlacement() {
        const productsView = el("adminProductsView");
        const list = el("adminProductsList");
        const toolbar = el("adminProductTools");
        if (!productsView || !list || !toolbar) return;
        if (toolbar.parentElement !== productsView || toolbar.nextElementSibling !== list) {
            list.insertAdjacentElement("beforebegin", toolbar);
        }
    }

    function moveInventoryLedger() {
        const mount = el(MOUNT_ID);
        const card = el(CARD_ID);
        if (!mount || !card || card.parentElement === mount) return;
        mount.appendChild(card);
    }

    function productCategoryFromGlobals(productName) {
        const normalizedName = normalize(productName);
        const collections = [];
        if (typeof adminProducts !== "undefined" && Array.isArray(adminProducts)) collections.push(adminProducts);
        if (typeof products !== "undefined" && Array.isArray(products)) collections.push(products);

        for (const collection of collections) {
            const product = collection.find(item => normalize(item?.name) === normalizedName);
            if (product?.category) return product.category;
        }
        return "";
    }

    async function loadInventoryCategoryMap() {
        if (inventoryCategoryByName.size) return inventoryCategoryByName;
        if (categoryMapLoading) return categoryMapLoading;
        if (typeof supabaseClient === "undefined") return inventoryCategoryByName;

        categoryMapLoading = (async () => {
            const { data, error } = await supabaseClient
                .from("products")
                .select("name, category");
            if (!error) {
                (data || []).forEach(product => {
                    const key = normalize(product?.name);
                    if (key && product?.category) inventoryCategoryByName.set(key, product.category);
                });
            }
            return inventoryCategoryByName;
        })().finally(() => {
            categoryMapLoading = null;
        });
        return categoryMapLoading;
    }

    function applyInventoryFilters() {
        const list = el("inventoryLedgerList");
        const count = el("adminInventoryFilterCount");
        if (!list) {
            if (count) count.textContent = "0 movimientos";
            return;
        }

        const rows = [...list.querySelectorAll(".inventory-ledger-item")];
        const query = normalize(inventoryFilterState.search);
        let visible = 0;

        rows.forEach(row => {
            const name = row.querySelector("div > strong")?.textContent || "";
            const category = inventoryCategoryByName.get(normalize(name)) || productCategoryFromGlobals(name);
            const categoryMatches = inventoryFilterState.category === "todos"
                || category === inventoryFilterState.category;
            const textMatches = !query || normalize(row.textContent).includes(query);
            const matches = categoryMatches && textMatches;
            row.hidden = !matches;
            if (matches) visible += 1;
        });

        if (count) {
            count.textContent = visible === rows.length
                ? `${rows.length} ${rows.length === 1 ? "movimiento" : "movimientos"}`
                : `${visible} de ${rows.length} movimientos`;
        }
    }

    function installObserver() {
        if (observer || !document.body) return;
        observer = new MutationObserver(() => {
            ensureInventoryView();
            moveInventoryLedger();
            ensureProductToolbarPlacement();
            applyInventoryFilters();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function initialize() {
        ensureInventoryView();
        installObserver();
        applyInventoryFilters();
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
            ensureProductToolbarPlacement();
            applyInventoryFilters();
        }
    });
})();
