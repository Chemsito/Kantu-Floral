/* Kantu Floral - integridad de módulos dinámicos y restauración tras refresco */

(() => {
    const core = window.KantuCore;
    if (!core) return;

    let featuredSyncQueued = false;
    const adminProductFilterState = {
        category: "todos",
        search: ""
    };

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-runtime-integrity-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/runtime-integrity.css";
        link.dataset.kantuRuntimeIntegrityStyle = "true";
        document.head.appendChild(link);
    }

    function safeMoney(value) {
        return core.formatMoney(Number(value) || 0);
    }

    function ensureFeaturedStrip() {
        const catalog = el("catalogo");
        const categories = catalog?.querySelector(".categories");
        if (!catalog || !categories) return null;

        let strip = el("catalogFeaturedStrip");
        if (!strip) {
            strip = document.createElement("section");
            strip.id = "catalogFeaturedStrip";
            strip.className = "catalog-featured-strip";
            strip.hidden = true;
            categories.insertAdjacentElement("beforebegin", strip);
        }
        return strip;
    }

    function featuredLink(product, duplicate = false) {
        const id = Number(product.id);
        if (!Number.isSafeInteger(id) || id <= 0) return "";
        return `<a href="producto.html?id=${id}"${duplicate ? ' tabindex="-1"' : ""}>
            <span>${core.escapeHtml(product.name || "Producto")}</span>
            <strong>${core.escapeHtml(safeMoney(product.price))}</strong>
        </a>`;
    }

    function syncFeaturedStrip() {
        const strip = ensureFeaturedStrip();
        if (!strip || typeof products === "undefined" || !Array.isArray(products)) return;

        const featured = products
            .filter(product => product?.active !== false && product?.featured && Number(product?.stock) > 0);

        strip.hidden = featured.length === 0;
        if (!featured.length) {
            strip.innerHTML = "";
            return;
        }

        const primary = featured.map(product => featuredLink(product)).join("");
        const duplicate = featured.map(product => featuredLink(product, true)).join("");
        const duration = Math.max(28, featured.length * 5);

        strip.innerHTML = `<div class="catalog-featured-heading"><strong>Destacados por Kantu</strong></div>
            <div class="catalog-featured-items" aria-label="Productos destacados por Kantu">
                <div class="catalog-featured-track" style="--kantu-featured-duration:${duration}s">
                    <div class="catalog-featured-set">${primary}</div>
                    <div class="catalog-featured-set" aria-hidden="true">${duplicate}</div>
                </div>
            </div>`;
    }

    function queueFeaturedSync() {
        if (featuredSyncQueued) return;
        featuredSyncQueued = true;
        window.requestAnimationFrame(() => {
            featuredSyncQueued = false;
            syncFeaturedStrip();
        });
    }

    function observeCatalog() {
        const grid = el("productsGrid");
        if (grid) {
            new MutationObserver(queueFeaturedSync).observe(grid, {
                childList: true,
                subtree: false
            });
        }

        window.addEventListener("pageshow", queueFeaturedSync);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) queueFeaturedSync();
        });

        queueFeaturedSync();
    }

    function getActiveAccountTab() {
        return document.querySelector(".account-tabs [data-account-tab].active")?.dataset?.accountTab || "profile";
    }

    function enforceAccountSectionIsolation(tab = getActiveAccountTab()) {
        const occasions = el("accountOccasionsSection");
        if (!occasions) return;

        const showOccasions = tab === "occasions";
        occasions.hidden = !showOccasions;
        occasions.setAttribute("aria-hidden", String(!showOccasions));
    }

    function observeAccountTabs() {
        const modal = el("accountModal");
        if (!modal) return;

        modal.addEventListener("click", event => {
            const tab = event.target.closest("[data-account-tab]");
            if (!tab) return;
            queueMicrotask(() => enforceAccountSectionIsolation(tab.dataset.accountTab));
        }, true);

        new MutationObserver(() => {
            enforceAccountSectionIsolation();
        }).observe(modal, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"]
        });

        enforceAccountSectionIsolation();
    }

    function preventBackdropDismissal() {
        document.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const isProtectedBackdrop = target.matches(
                '.modal-overlay, .kantu-customization-overlay, [data-kantu-modal-backdrop="true"]'
            );
            if (!isProtectedBackdrop) return;

            // Los modales Kantu solo se cierran con sus controles explícitos.
            // El listener se ejecuta en captura para bloquear handlers antiguos
            // de cierre por backdrop sin interferir con botones dentro del modal.
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    }

    function normalizeAdminSearch(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function adminProductMatches(product) {
        const categoryMatch = adminProductFilterState.category === "todos"
            || product?.category === adminProductFilterState.category;
        if (!categoryMatch) return false;

        const query = normalizeAdminSearch(adminProductFilterState.search);
        if (!query) return true;

        const categoryName = typeof getCategoryName === "function"
            ? getCategoryName(product?.category)
            : product?.category;
        const haystack = normalizeAdminSearch([
            product?.name,
            product?.description,
            product?.note,
            product?.tag,
            categoryName
        ].filter(Boolean).join(" "));
        return haystack.includes(query);
    }

    function ensureAdminProductToolbar() {
        const view = el("adminProductsView");
        const list = el("adminProductsList");
        if (!view || !list) return null;

        let toolbar = el("adminProductTools");
        if (toolbar) return toolbar;

        const categories = Array.isArray(window.KantuProductConfig?.categories)
            ? window.KantuProductConfig.categories
            : [];
        toolbar = document.createElement("section");
        toolbar.id = "adminProductTools";
        toolbar.className = "admin-product-tools";
        toolbar.innerHTML = `
            <div class="admin-product-tools-main">
                <label class="admin-product-tool-search">
                    <span>Buscar producto</span>
                    <input id="adminProductSearch" type="search" autocomplete="off" placeholder="Nombre, etiqueta o nota…">
                </label>
                <label class="admin-product-tool-category">
                    <span>Categoría</span>
                    <select id="adminProductCategoryFilter">
                        <option value="todos">Todas las categorías</option>
                        ${categories.map(([value, label]) => `<option value="${core.escapeHtml(value)}">${core.escapeHtml(label)}</option>`).join("")}
                    </select>
                </label>
            </div>
            <div class="admin-product-tools-meta">
                <strong id="adminProductFilterCount">0 productos</strong>
                <button id="adminProductFilterClear" type="button">Limpiar filtros</button>
            </div>`;

        const ledger = el("inventoryLedgerCard");
        if (ledger) ledger.insertAdjacentElement("beforebegin", toolbar);
        else list.insertAdjacentElement("beforebegin", toolbar);

        el("adminProductSearch")?.addEventListener("input", event => {
            adminProductFilterState.search = event.target.value;
            if (typeof renderAdminProducts === "function") renderAdminProducts();
        });
        el("adminProductCategoryFilter")?.addEventListener("change", event => {
            adminProductFilterState.category = event.target.value || "todos";
            if (typeof renderAdminProducts === "function") renderAdminProducts();
        });
        el("adminProductFilterClear")?.addEventListener("click", () => {
            adminProductFilterState.search = "";
            adminProductFilterState.category = "todos";
            if (el("adminProductSearch")) el("adminProductSearch").value = "";
            if (el("adminProductCategoryFilter")) el("adminProductCategoryFilter").value = "todos";
            if (typeof renderAdminProducts === "function") renderAdminProducts();
        });

        return toolbar;
    }

    function updateAdminProductFilterMeta(visible, total) {
        const count = el("adminProductFilterCount");
        if (count) count.textContent = visible === total
            ? `${total} ${total === 1 ? "producto" : "productos"}`
            : `${visible} de ${total} productos`;

        const empty = el("adminProductsEmpty");
        if (empty) {
            empty.textContent = total > 0 && visible === 0
                ? "No hay productos que coincidan con estos filtros."
                : "No hay productos registrados.";
        }
    }

    function installAdminProductFilters() {
        ensureAdminProductToolbar();
        if (typeof renderAdminProducts !== "function" || renderAdminProducts.__kantuProductFilters) return;

        const baseRenderAdminProducts = renderAdminProducts;
        const filteredRenderer = function kantuFilteredAdminProducts(...args) {
            ensureAdminProductToolbar();
            if (typeof adminProducts === "undefined" || !Array.isArray(adminProducts)) {
                return baseRenderAdminProducts(...args);
            }

            const originalProducts = adminProducts;
            const filteredProducts = originalProducts.filter(adminProductMatches);
            adminProducts = filteredProducts;
            try {
                const result = baseRenderAdminProducts(...args);
                updateAdminProductFilterMeta(filteredProducts.length, originalProducts.length);
                return result;
            } finally {
                adminProducts = originalProducts;
            }
        };

        filteredRenderer.__kantuProductFilters = true;
        filteredRenderer.__kantuBaseRenderAdminProducts = baseRenderAdminProducts;
        renderAdminProducts = filteredRenderer;

        if (typeof adminProducts !== "undefined" && Array.isArray(adminProducts) && adminProducts.length) {
            renderAdminProducts();
        } else {
            updateAdminProductFilterMeta(0, 0);
        }
    }

    function observeAdminProductView() {
        installAdminProductFilters();
        const productsTab = document.querySelector('[data-admin-view="products"]');
        productsTab?.addEventListener("click", () => {
            window.setTimeout(() => {
                installAdminProductFilters();
                if (typeof renderAdminProducts === "function") renderAdminProducts();
            }, 0);
        });
    }

    function initialize() {
        ensureStyles();
        preventBackdropDismissal();
        observeCatalog();
        observeAccountTabs();
        observeAdminProductView();
    }

    window.KantuRuntimeIntegrity = Object.freeze({
        refreshFeatured: syncFeaturedStrip,
        enforceAccountSectionIsolation,
        refreshAdminProductFilters: () => {
            installAdminProductFilters();
            if (typeof renderAdminProducts === "function") renderAdminProducts();
        }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();