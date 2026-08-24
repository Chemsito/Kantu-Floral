/* Kantu Floral - integridad de módulos dinámicos y restauración tras refresco */

(() => {
    const core = window.KantuCore;
    if (!core) return;

    let featuredSyncQueued = false;

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

    function syncFeaturedStrip() {
        const strip = ensureFeaturedStrip();
        if (!strip || typeof products === "undefined" || !Array.isArray(products)) return;

        const featured = products
            .filter(product => product?.active !== false && product?.featured && Number(product?.stock) > 0)
            .slice(0, 6);

        strip.hidden = featured.length === 0;
        if (!featured.length) {
            strip.innerHTML = "";
            return;
        }

        strip.innerHTML = `<div class="catalog-featured-heading"><strong>Destacados por Kantu</strong></div>
            <div class="catalog-featured-items">
                ${featured.map(product => `<a href="producto.html?id=${Number(product.id)}">
                    <span>${core.escapeHtml(product.name || "Producto")}</span>
                    <strong>${core.escapeHtml(safeMoney(product.price))}</strong>
                </a>`).join("")}
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

    function initialize() {
        ensureStyles();
        observeCatalog();
        observeAccountTabs();
    }

    window.KantuRuntimeIntegrity = Object.freeze({
        refreshFeatured: syncFeaturedStrip,
        enforceAccountSectionIsolation
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
