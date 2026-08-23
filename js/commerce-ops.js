/* Kantu Floral - complementos, destacados e inteligencia operativa */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    let overviewLoading = null;
    let upsellBusy = false;
    const sourceLabels = Object.freeze({
        product_created: "Producto creado",
        stock_increase: "Aumento de stock",
        stock_decrease: "Disminución de stock",
        admin_adjustment: "Ajuste administrativo (histórico)",
        paid_order: "Pedido pagado (histórico)",
        system_adjustment: "Ajuste del sistema"
    });

    function el(id) {
        return document.getElementById(id);
    }

    function ensureStyles() {
        if (document.querySelector('link[data-kantu-commerce-ops-style="true"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/commerce-ops.css";
        link.dataset.kantuCommerceOpsStyle = "true";
        document.head.appendChild(link);
    }

    function safeMoney(value) {
        return core.formatMoney(Number(value) || 0);
    }

    function currentCartQuantity(productId) {
        if (typeof cart === "undefined" || !Array.isArray(cart)) return 0;
        return Number(cart.find(item => Number(item.id) === Number(productId))?.quantity) || 0;
    }

    function getComplementProducts() {
        if (typeof products === "undefined" || !Array.isArray(products)) return [];
        return products
            .filter(product => product?.active !== false)
            .filter(product => product?.category === "complementos")
            .filter(product => Number(product?.stock) > 0)
            .slice()
            .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))
                || (Number(b.units_sold) || 0) - (Number(a.units_sold) || 0)
                || Number(a.id) - Number(b.id))
            .slice(0, 4);
    }

    function ensureUpsellSection() {
        const form = el("checkoutForm");
        const summary = form?.querySelector(".checkout-summary");
        if (!form || !summary) return null;

        let section = el("checkoutUpsellSection");
        if (!section) {
            section = document.createElement("section");
            section.id = "checkoutUpsellSection";
            section.className = "checkout-upsell-section";
            section.innerHTML = `
                <div class="checkout-upsell-heading">
                    <div>
                        <strong>Completa tu regalo</strong>
                        <small>Complementos reales del catálogo, sin paquetes ni precios inventados.</small>
                    </div>
                </div>
                <div id="checkoutUpsellList" class="checkout-upsell-list"></div>
            `;
            summary.insertAdjacentElement("beforebegin", section);
            section.addEventListener("click", handleUpsellClick);
        }
        return section;
    }

    function renderUpsells() {
        const section = ensureUpsellSection();
        const list = el("checkoutUpsellList");
        if (!section || !list) return;

        const complements = getComplementProducts();
        section.hidden = complements.length === 0;
        if (!complements.length) {
            list.innerHTML = "";
            return;
        }

        list.innerHTML = complements.map(product => {
            const id = Number(product.id);
            const image = core.safeUrl(product.image);
            const quantity = currentCartQuantity(id);
            const stock = Math.max(0, Number(product.stock) || 0);
            const atLimit = quantity >= stock;
            return `<article class="checkout-upsell-item">
                ${image
                    ? `<img src="${core.escapeHtml(image)}" alt="${core.escapeHtml(product.name || "Complemento")}" loading="lazy">`
                    : '<div class="checkout-upsell-placeholder" aria-hidden="true">✿</div>'}
                <div class="checkout-upsell-info">
                    <strong>${core.escapeHtml(product.name || "Complemento")}</strong>
                    <span>${core.escapeHtml(safeMoney(product.price))}</span>
                    <button type="button" class="checkout-upsell-add" data-upsell-product="${id}" ${atLimit ? "disabled" : ""}>
                        ${atLimit ? `En carrito (${quantity})` : quantity ? `Agregar otro (${quantity})` : "Agregar"}
                    </button>
                </div>
            </article>`;
        }).join("");
    }

    async function handleUpsellClick(event) {
        const button = event.target.closest("[data-upsell-product]");
        if (!button || upsellBusy || typeof addToCart !== "function") return;
        const productId = Number(button.dataset.upsellProduct);
        if (!Number.isSafeInteger(productId) || productId <= 0) return;

        upsellBusy = true;
        button.disabled = true;
        button.textContent = "Agregando...";
        try {
            await addToCart(productId);
            if (typeof renderCheckoutSummary === "function") renderCheckoutSummary();
            renderUpsells();
        } finally {
            upsellBusy = false;
            if (button.isConnected) button.disabled = false;
        }
    }

    function ensureFeaturedStrip() {
        const catalog = el("catalogo");
        if (!catalog || el("catalogFeaturedStrip")) return;
        const categories = catalog.querySelector(".categories");
        if (!categories) return;
        const strip = document.createElement("section");
        strip.id = "catalogFeaturedStrip";
        strip.className = "catalog-featured-strip";
        strip.hidden = true;
        categories.insertAdjacentElement("beforebegin", strip);
    }

    function renderFeaturedStrip() {
        ensureFeaturedStrip();
        const strip = el("catalogFeaturedStrip");
        if (!strip || typeof products === "undefined" || !Array.isArray(products)) return;
        const featured = products
            .filter(product => product?.active !== false && product?.featured && Number(product?.stock) > 0)
            .slice(0, 6);

        strip.hidden = featured.length === 0;
        if (!featured.length) {
            strip.innerHTML = "";
            return;
        }

        strip.innerHTML = `<div class="catalog-featured-heading"><strong>Destacados por Kantu</strong><span>Selección manual del equipo</span></div>
            <div class="catalog-featured-items">
                ${featured.map(product => `<a href="producto.html?id=${Number(product.id)}">
                    <span>${core.escapeHtml(product.name || "Producto")}</span>
                    <strong>${core.escapeHtml(safeMoney(product.price))}</strong>
                </a>`).join("")}
            </div>`;
    }

    function ensureAdminOverview() {
        const dashboard = el("adminDashboardView");
        const stats = el("adminStatsGrid");
        if (!dashboard || !stats) return null;
        let card = el("commerceOverviewCard");
        if (card) return card;

        card = document.createElement("section");
        card.id = "commerceOverviewCard";
        card.className = "commerce-overview-card";
        card.innerHTML = `
            <h4>Ventas y atención operativa</h4>
            <p>Solo considera ventas con pago aprobado. Aquí también aparecen incidencias que requieren revisión.</p>
            <div id="commerceOverviewContent"><div class="admin-loader">Cargando métricas comerciales...</div></div>
        `;
        stats.insertAdjacentElement("afterend", card);
        return card;
    }

    function attentionClass(kind) {
        if (kind === "paid_order_not_confirmed") return "urgent";
        if (kind === "manual_payment_review") return "warning";
        return "";
    }

    function renderOverview(data) {
        const container = el("commerceOverviewContent");
        if (!container) return;
        const metrics = data?.metrics || {};
        const attention = Array.isArray(data?.attention) ? data.attention : [];
        const topProducts = Array.isArray(data?.top_products) ? data.top_products : [];

        const metricRows = [
            ["Ventas hoy", safeMoney(metrics.sales_today)],
            ["Ventas 30 días", safeMoney(metrics.sales_30d)],
            ["Ticket promedio 30d", safeMoney(metrics.average_ticket_30d)],
            ["Pedidos pagados 30d", Number(metrics.paid_orders_30d) || 0],
            ["Pagos por revisar", Number(metrics.manual_review_count) || 0],
            ["Stock bajo", Number(metrics.low_stock_count) || 0],
            ["Sin stock", Number(metrics.out_of_stock_count) || 0],
            ["Prep. promedio 30d", `${Number(metrics.avg_prep_minutes_30d) || 0} min`],
            ["Delivery promedio 30d", `${Number(metrics.avg_delivery_minutes_30d) || 0} min`]
        ];

        container.innerHTML = `
            <div class="commerce-metrics-grid">
                ${metricRows.map(([label, value]) => `<div class="commerce-metric"><span>${core.escapeHtml(label)}</span><strong>${core.escapeHtml(value)}</strong></div>`).join("")}
            </div>
            <div class="commerce-columns">
                <section class="commerce-panel">
                    <h5>Requieren atención</h5>
                    <div class="commerce-attention-list">
                        ${attention.length
                            ? attention.map(item => `<div class="commerce-attention-item ${attentionClass(item.kind)}"><span>${core.escapeHtml(item.title || item.kind)}</span><small>${core.escapeHtml(core.formatDate(item.created_at))}</small></div>`).join("")
                            : '<p class="commerce-empty">No hay incidencias operativas detectadas.</p>'}
                    </div>
                </section>
                <section class="commerce-panel">
                    <h5>Productos con más unidades vendidas</h5>
                    <div class="commerce-top-list">
                        ${topProducts.length
                            ? topProducts.map(product => `<div class="commerce-top-item"><span>${core.escapeHtml(product.name || "Producto")}</span><strong>${Number(product.units_sold) || 0} u.</strong></div>`).join("")
                            : '<p class="commerce-empty">Todavía no hay ventas suficientes para ranking.</p>'}
                    </div>
                </section>
            </div>
        `;
    }

    async function loadAdminOverview({ force = false } = {}) {
        if (!ensureAdminOverview()) return;
        if (overviewLoading && !force) return overviewLoading;
        overviewLoading = (async () => {
            const { data, error } = await supabaseClient.rpc("admin_commerce_overview");
            if (error) {
                console.error("Error cargando overview comercial:", error);
                const content = el("commerceOverviewContent");
                if (content) content.innerHTML = '<p class="commerce-empty">No pudimos cargar las métricas comerciales.</p>';
                return null;
            }
            renderOverview(data || {});
            renderInventoryRows(data?.recent_inventory || []);
            return data;
        })().finally(() => {
            overviewLoading = null;
        });
        return overviewLoading;
    }

    function ensureInventoryLedger() {
        const view = el("adminProductsView");
        const list = el("adminProductsList");
        if (!view || !list) return null;
        let card = el("inventoryLedgerCard");
        if (card) return card;

        card = document.createElement("section");
        card.id = "inventoryLedgerCard";
        card.className = "inventory-ledger-card";
        card.innerHTML = `
            <div class="inventory-ledger-heading">
                <div><h4>Historial de inventario</h4><p>Cada cambio de stock queda registrado con saldo anterior y nuevo.</p></div>
                <button id="inventoryLedgerRefresh" type="button" class="admin-refresh">Actualizar</button>
            </div>
            <div id="inventoryLedgerList" class="inventory-ledger-list"><div class="admin-loader">Cargando movimientos...</div></div>
        `;
        list.insertAdjacentElement("beforebegin", card);
        el("inventoryLedgerRefresh")?.addEventListener("click", () => loadInventoryLedger());
        return card;
    }

    function renderInventoryRows(rows) {
        ensureInventoryLedger();
        const list = el("inventoryLedgerList");
        if (!list) return;
        const values = Array.isArray(rows) ? rows : [];
        list.innerHTML = values.length
            ? values.map(row => {
                const delta = Number(row.quantity_delta) || 0;
                return `<div class="inventory-ledger-item">
                    <div><strong>${core.escapeHtml(row.product_name || `Producto #${row.product_id}`)}</strong><div class="inventory-source">${core.escapeHtml(sourceLabels[row.source] || row.source || "Movimiento")} · ${core.escapeHtml(core.formatDate(row.created_at))}</div></div>
                    <div><strong class="${delta > 0 ? "positive" : "negative"}">${delta > 0 ? "+" : ""}${delta}</strong><div class="inventory-source">${Number(row.balance_before) || 0} → ${Number(row.balance_after) || 0}</div></div>
                </div>`;
            }).join("")
            : '<p class="commerce-empty">Aún no hay movimientos registrados desde la activación del historial.</p>';
    }

    async function loadInventoryLedger() {
        ensureInventoryLedger();
        const list = el("inventoryLedgerList");
        if (list) list.innerHTML = '<div class="admin-loader">Cargando movimientos...</div>';
        const { data, error } = await supabaseClient
            .from("inventory_movements")
            .select("id, product_id, product_name, quantity_delta, balance_before, balance_after, source, created_at")
            .order("created_at", { ascending: false })
            .limit(50);
        if (error) {
            if (list) list.innerHTML = '<p class="commerce-empty">No pudimos cargar el historial de inventario.</p>';
            return;
        }
        renderInventoryRows(data || []);
    }

    function decorateAdminProducts() {
        const list = el("adminProductsList");
        if (!list || typeof adminProducts === "undefined" || !Array.isArray(adminProducts)) return;

        list.querySelectorAll(".admin-product-card").forEach(card => {
            const edit = card.querySelector("[data-admin-edit-product]");
            const id = Number(edit?.dataset?.adminEditProduct);
            const product = adminProducts.find(row => Number(row.id) === id);
            const actions = card.querySelector(".admin-product-actions");
            if (!product || !actions || actions.querySelector("[data-admin-featured-product]")) return;

            const button = document.createElement("button");
            button.type = "button";
            button.className = `admin-featured-toggle${product.featured ? " active" : ""}`;
            button.dataset.adminFeaturedProduct = String(id);
            button.setAttribute("aria-pressed", String(Boolean(product.featured)));
            button.textContent = product.featured ? "★ Destacado" : "☆ Destacar";
            actions.prepend(button);

            if (product.featured) {
                const badges = card.querySelector(".admin-product-badges");
                if (badges && !badges.querySelector("[data-featured-badge]")) {
                    badges.insertAdjacentHTML("afterbegin", '<span data-featured-badge="true">★ Destacado</span>');
                }
            }
        });
    }

    async function toggleFeatured(button) {
        const id = Number(button.dataset.adminFeaturedProduct);
        if (!Number.isSafeInteger(id) || id <= 0 || typeof adminProducts === "undefined") return;
        const product = adminProducts.find(row => Number(row.id) === id);
        if (!product) return;
        const next = !Boolean(product.featured);
        button.disabled = true;

        const { error } = await supabaseClient.from("products").update({ featured: next }).eq("id", id);
        button.disabled = false;
        if (error) {
            if (typeof showAdminMessage === "function") showAdminMessage("No pudimos cambiar el producto destacado.");
            return;
        }
        product.featured = next;
        if (typeof loadAdminProducts === "function") await loadAdminProducts();
        if (typeof loadProducts === "function") await loadProducts();
        renderFeaturedStrip();
        if (typeof showAdminMessage === "function") showAdminMessage(next ? "Producto marcado como destacado." : "Producto retirado de destacados.", "success");
    }

    function observeAdminProducts() {
        const list = el("adminProductsList");
        if (!list) return;
        list.addEventListener("click", event => {
            const button = event.target.closest("[data-admin-featured-product]");
            if (button) toggleFeatured(button);
        });
        new MutationObserver(() => decorateAdminProducts()).observe(list, { childList: true, subtree: true });
        decorateAdminProducts();
    }

    function watchViews() {
        document.querySelector('[data-admin-view="dashboard"]')?.addEventListener("click", () => window.setTimeout(() => loadAdminOverview({ force: true }), 0));
        document.querySelector('[data-admin-view="products"]')?.addEventListener("click", () => window.setTimeout(() => loadInventoryLedger(), 0));
        document.querySelector('[data-admin-refresh="dashboard"]')?.addEventListener("click", () => window.setTimeout(() => loadAdminOverview({ force: true }), 0));

        const modal = el("adminModal");
        if (modal) {
            new MutationObserver(() => {
                if (modal.classList.contains("show")) window.setTimeout(() => loadAdminOverview({ force: true }), 250);
            }).observe(modal, { attributes: true, attributeFilter: ["class"] });
        }

        const checkout = el("checkoutModal");
        if (checkout) {
            new MutationObserver(() => {
                if (checkout.classList.contains("show")) window.setTimeout(renderUpsells, 100);
            }).observe(checkout, { attributes: true, attributeFilter: ["class"] });
        }
    }

    function initialize() {
        ensureStyles();
        ensureUpsellSection();
        ensureAdminOverview();
        ensureInventoryLedger();
        ensureFeaturedStrip();
        observeAdminProducts();
        watchViews();
        renderUpsells();
        renderFeaturedStrip();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
