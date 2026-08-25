/* =====================================================
   KANTU FLORAL - CUSTOMER UX PACK
   - Footer útil y conectado al catálogo
   - Búsqueda, colección y orden del catálogo
   - Botón flotante para volver arriba
   - Boleta disponible solo con pago aprobado
===================================================== */

(() => {
    const UX = window.KantuCore;
    const catalogState = {
        search: "",
        sort: "recommended",
        source: "all"
    };
    const productPopularity = new Map();

    const FOOTER_CATEGORIES = Object.freeze([
        ["tulipanes", "Tulipanes"],
        ["girasoles", "Girasoles"],
        ["ramos", "Ramos"],
        ["rosas", "Rosas"],
        ["box", "Box"],
        ["canasta", "Canasta"],
        ["flores", "Flores"],
        ["complementos", "Complementos"],
        ["cajas", "Cajas"],
        ["ramos_buchones", "Ramos buchones"]
    ]);

    const FOOTER_HELP = Object.freeze({
        faq: {
            eyebrow: "Ayuda Kantu Floral",
            title: "Preguntas frecuentes",
            content: `
                <div class="footer-faq-list">
                    <details open>
                        <summary>¿Cómo hago un pedido?</summary>
                        <p>Elige tus flores, agrégalas al carrito, completa los datos de entrega y selecciona la ubicación exacta en el mapa. Después de confirmar el pedido podrás elegir cómo pagarlo.</p>
                    </details>
                    <details>
                        <summary>¿Cuánto demora la entrega?</summary>
                        <p>Como referencia, el delivery demora aproximadamente 1 hora desde que el pedido queda confirmado para preparación. El tiempo real puede variar según distancia, tráfico y demanda del momento.</p>
                    </details>
                    <details>
                        <summary>¿Cómo puedo seguir mi pedido?</summary>
                        <p>Después de iniciar sesión puedes usar “Mi pedido” o “Mis pedidos” para revisar el estado: pago, confirmado, preparando, en camino y entregado.</p>
                    </details>
                    <details>
                        <summary>¿Puedo cancelar un pedido?</summary>
                        <p>Sí, mientras el pedido siga pendiente y todavía no hayas iniciado ningún pago. Si ya comenzaste el pago, contáctanos por WhatsApp para revisar el caso.</p>
                    </details>
                </div>
            `
        },
        delivery: {
            eyebrow: "Delivery floral",
            title: "Entrega en aproximadamente 1 hora",
            content: `
                <div class="footer-info-stack">
                    <p><strong>Tiempo de referencia:</strong> aproximadamente 1 hora desde que el pedido queda confirmado para preparación.</p>
                    <p>Antes de pagar, la tienda calcula el costo de delivery según la ubicación que selecciones en el mapa y te muestra el total completo.</p>
                    <p>La estimación puede variar por distancia, tráfico, clima o alta demanda. Puedes seguir el avance de tu pedido desde “Mi pedido”.</p>
                </div>
            `
        },
        payments: {
            eyebrow: "Pagos",
            title: "Métodos de pago disponibles",
            content: `
                <div class="footer-payment-list">
                    <div><strong>Mercado Pago</strong><span>Pago online mediante Checkout Pro.</span></div>
                    <div><strong>Yape / Plin</strong><span>Envía tu comprobante desde la misma plataforma para verificación.</span></div>
                    <div><strong>Transferencia bancaria</strong><span>Selecciona el banco disponible y sube tu comprobante para revisión.</span></div>
                </div>
            `
        }
    });

    function normalizeSearch(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function sourceMatches(product) {
        const tag = String(product?.tag || "");
        if (catalogState.source === "florever") return tag === "Florever Perú";
        if (catalogState.source === "blume") return tag === "Catálogo BLUME 2026";
        if (catalogState.source === "kantu") {
            return tag !== "Florever Perú" && tag !== "Catálogo BLUME 2026";
        }
        return true;
    }

    function productMatchesSearch(product) {
        const query = normalizeSearch(catalogState.search);
        if (!query) return true;

        const categoryName = typeof getCategoryName === "function"
            ? getCategoryName(product?.category)
            : product?.category;
        const searchable = normalizeSearch([
            product?.name,
            product?.description,
            product?.note,
            product?.tag,
            categoryName,
            product?.size
        ].filter(Boolean).join(" "));

        return searchable.includes(query);
    }

    function popularityFor(product) {
        return productPopularity.get(Number(product?.id)) || {
            paid_order_count: 0,
            units_sold: 0
        };
    }

    function compareCatalogProducts(a, b) {
        const stockA = Math.max(0, Number(a?.stock) || 0);
        const stockB = Math.max(0, Number(b?.stock) || 0);
        if ((stockA > 0) !== (stockB > 0)) return stockA > 0 ? -1 : 1;

        switch (catalogState.sort) {
            case "price_asc":
                return (Number(a?.price) || 0) - (Number(b?.price) || 0)
                    || Number(a?.id) - Number(b?.id);
            case "price_desc":
                return (Number(b?.price) || 0) - (Number(a?.price) || 0)
                    || Number(a?.id) - Number(b?.id);
            case "popular": {
                const popA = popularityFor(a);
                const popB = popularityFor(b);
                return Number(popB.paid_order_count) - Number(popA.paid_order_count)
                    || Number(popB.units_sold) - Number(popA.units_sold)
                    || Number(a?.id) - Number(b?.id);
            }
            case "name":
                return String(a?.name || "").localeCompare(String(b?.name || ""), "es", { sensitivity: "base" });
            case "recent":
                return Number(b?.id) - Number(a?.id);
            default:
                return Number(a?.id) - Number(b?.id);
        }
    }

    function updateCatalogResultCount(count) {
        const element = document.getElementById("catalogResultCount");
        if (!element) return;
        element.textContent = `${count} ${count === 1 ? "producto" : "productos"}`;
    }

    function installCatalogRenderer() {
        if (typeof renderProducts !== "function" || renderProducts.__kantuAdvancedCatalog) return;

        const baseRenderProducts = renderProducts;
        const advancedRenderProducts = function advancedRenderProducts() {
            if (typeof products === "undefined" || !Array.isArray(products)) {
                return baseRenderProducts();
            }

            const originalProducts = products;
            const filtered = originalProducts
                .filter(productMatchesSearch)
                .filter(sourceMatches)
                .slice()
                .sort(compareCatalogProducts);

            const visibleCount = currentCategory === "todos"
                ? filtered.length
                : filtered.filter(product => product.category === currentCategory).length;

            products = filtered;
            try {
                baseRenderProducts();
                updateCatalogResultCount(visibleCount);
            } finally {
                products = originalProducts;
            }
        };

        advancedRenderProducts.__kantuAdvancedCatalog = true;
        advancedRenderProducts.__kantuBaseRenderProducts = baseRenderProducts;
        renderProducts = advancedRenderProducts;
    }

    function renderCatalogToolbar() {
        const catalog = document.getElementById("catalogo");
        const categories = catalog?.querySelector(".categories");
        if (!catalog || !categories || document.getElementById("catalogTools")) return;

        const tools = document.createElement("div");
        tools.id = "catalogTools";
        tools.className = "catalog-tools";
        tools.innerHTML = `
            <label class="catalog-tool">
                <span>Buscar</span>
                <div class="catalog-search-wrap">
                    <span class="catalog-search-icon" aria-hidden="true">⌕</span>
                    <input id="catalogSearch" type="search" autocomplete="off" placeholder="Buscar rosas, tulipanes, box...">
                </div>
            </label>
            <label class="catalog-tool">
                <span>Ordenar por</span>
                <select id="catalogSort">
                    <option value="recommended">Recomendados</option>
                    <option value="popular">Más pedidos</option>
                    <option value="price_asc">Precio: menor a mayor</option>
                    <option value="price_desc">Precio: mayor a menor</option>
                    <option value="name">Nombre A–Z</option>
                    <option value="recent">Más recientes</option>
                </select>
            </label>
            <label class="catalog-tool">
                <span>Colección</span>
                <select id="catalogSource">
                    <option value="all">Todas</option>
                    <option value="florever">Florever Perú</option>
                    <option value="blume">BLUME 2026</option>
                    <option value="kantu">Kantu Floral</option>
                </select>
            </label>
            <div class="catalog-tool-actions">
                <span class="catalog-result-count" id="catalogResultCount"></span>
                <button type="button" class="catalog-reset-button" id="catalogReset">Limpiar</button>
            </div>
        `;
        categories.insertAdjacentElement("beforebegin", tools);

        const search = document.getElementById("catalogSearch");
        const sort = document.getElementById("catalogSort");
        const source = document.getElementById("catalogSource");
        const reset = document.getElementById("catalogReset");

        search?.addEventListener("input", () => {
            catalogState.search = search.value;
            renderProducts();
        });
        sort?.addEventListener("change", () => {
            catalogState.sort = sort.value;
            renderProducts();
        });
        source?.addEventListener("change", () => {
            catalogState.source = source.value;
            renderProducts();
        });
        reset?.addEventListener("click", () => {
            catalogState.search = "";
            catalogState.sort = "recommended";
            catalogState.source = "all";
            if (search) search.value = "";
            if (sort) sort.value = "recommended";
            if (source) source.value = "all";
            renderProducts();
        });
    }

    async function loadProductPopularity() {
        if (!window.supabaseClient?.rpc) return;

        const { data, error } = await supabaseClient.rpc("get_product_catalog_popularity");
        if (error) {
            console.error("No se pudieron cargar estadísticas de popularidad:", error);
            return;
        }

        productPopularity.clear();
        (data || []).forEach(row => {
            const id = Number(row.product_id);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            productPopularity.set(id, {
                paid_order_count: Number(row.paid_order_count) || 0,
                units_sold: Number(row.units_sold) || 0
            });
        });

        if (catalogState.sort === "popular" && typeof renderProducts === "function") {
            renderProducts();
        }
    }

    function initializeScrollTopButton() {
        if (document.getElementById("scrollTopButton")) return;

        const button = document.createElement("button");
        button.id = "scrollTopButton";
        button.className = "scroll-top-button";
        button.type = "button";
        button.setAttribute("aria-label", "Volver al inicio");
        button.title = "Volver arriba";
        button.textContent = "↑";
        button.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
        document.body.appendChild(button);

        let scheduled = false;
        const syncVisibility = () => {
            scheduled = false;
            button.classList.toggle("visible", window.scrollY > 650);
        };
        window.addEventListener("scroll", () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(syncVisibility);
        }, { passive: true });
        syncVisibility();
    }

    function isReceiptReady(order) {
        return Boolean(order)
            && order.payment_status === "approved"
            && order.status !== "cancelado";
    }

    function removeUnavailableReceiptButtons() {
        if (typeof accountOrders === "undefined" || !Array.isArray(accountOrders)) return;

        document.querySelectorAll("[data-order-receipt]").forEach(button => {
            const order = accountOrders.find(row => String(row.id) === String(button.dataset.orderReceipt));
            if (!isReceiptReady(order)) button.remove();
        });
    }

    function showReceiptPendingNote(orderId) {
        if (typeof accountOrders === "undefined" || !Array.isArray(accountOrders)) return;
        const order = accountOrders.find(row => String(row.id) === String(orderId));
        if (isReceiptReady(order)) return;

        const detail = document.getElementById("accountOrderDetail");
        if (!detail || detail.querySelector(".receipt-pending-note")) return;

        const actions = detail.querySelector(".account-order-actions-row");
        const note = document.createElement("p");
        note.className = "receipt-pending-note";
        note.textContent = "La boleta / resumen estará disponible cuando el pago haya sido confirmado.";
        if (actions) actions.insertAdjacentElement("afterend", note);
        else detail.prepend(note);
    }

    function installReceiptPaymentGate() {
        if (typeof loadAccountOrders === "function" && !loadAccountOrders.__kantuReceiptGate) {
            const baseLoadAccountOrders = loadAccountOrders;
            loadAccountOrders = async function receiptGatedLoadAccountOrders(...args) {
                const result = await baseLoadAccountOrders(...args);
                removeUnavailableReceiptButtons();
                return result;
            };
            loadAccountOrders.__kantuReceiptGate = true;
        }

        if (typeof openOrderDetail === "function" && !openOrderDetail.__kantuReceiptGate) {
            const baseOpenOrderDetail = openOrderDetail;
            openOrderDetail = async function receiptGatedOpenOrderDetail(orderId, ...args) {
                const result = await baseOpenOrderDetail(orderId, ...args);
                removeUnavailableReceiptButtons();
                showReceiptPendingNote(orderId);
                return result;
            };
            openOrderDetail.__kantuReceiptGate = true;
        }

        if (typeof openOrderReceipt === "function" && !openOrderReceipt.__kantuReceiptGate) {
            const baseOpenOrderReceipt = openOrderReceipt;
            openOrderReceipt = async function receiptGatedOpenOrderReceipt(orderId, ...args) {
                const order = typeof accountOrders !== "undefined"
                    ? accountOrders.find(row => String(row.id) === String(orderId))
                    : null;
                if (!isReceiptReady(order)) {
                    if (typeof showAccountMessage === "function") {
                        showAccountMessage("La boleta / resumen estará disponible cuando el pago haya sido confirmado.");
                    } else if (typeof showToast === "function") {
                        showToast("La boleta estará disponible después de confirmar el pago.");
                    }
                    return;
                }
                return baseOpenOrderReceipt(orderId, ...args);
            };
            openOrderReceipt.__kantuReceiptGate = true;
        }
    }

    function getOrCreateFooterInfoModal() {
        let overlay = document.getElementById("footerInfoModal");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "footerInfoModal";
        overlay.className = "modal-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "footerInfoTitle");
        overlay.innerHTML = `
            <div class="modal footer-info-modal">
                <button type="button" class="close-modal" id="footerInfoClose" aria-label="Cerrar información">×</button>
                <span class="footer-info-eyebrow" id="footerInfoEyebrow"></span>
                <h2 id="footerInfoTitle"></h2>
                <div class="footer-info-content" id="footerInfoContent"></div>
            </div>
        `;
        overlay.querySelector("#footerInfoClose")?.addEventListener("click", () => {
            overlay.classList.remove("show");
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    function openFooterHelp(topic) {
        const info = FOOTER_HELP[topic];
        if (!info) return;

        const overlay = getOrCreateFooterInfoModal();
        const eyebrow = overlay.querySelector("#footerInfoEyebrow");
        const title = overlay.querySelector("#footerInfoTitle");
        const content = overlay.querySelector("#footerInfoContent");
        if (eyebrow) eyebrow.textContent = info.eyebrow;
        if (title) title.textContent = info.title;
        if (content) content.innerHTML = info.content;
        overlay.classList.add("show");
        overlay.querySelector("#footerInfoClose")?.focus();
    }

    function activateFooterCategory(category) {
        const button = document.querySelector(`.category-btn[data-category="${category}"]`);
        if (button) button.click();
        document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderFooterExperience() {
        const footerContent = document.querySelector("#contacto .footer-content");
        if (!footerContent || footerContent.dataset.kantuEnhanced === "true") return;

        const categoryLinks = FOOTER_CATEGORIES.map(([value, label]) => `
            <button type="button" class="footer-link-button" data-footer-category="${value}">${label}</button>
        `).join("");

        footerContent.innerHTML = `
            <div class="footer-column">
                <div class="footer-logo">Kantu Floral ✿</div>
                <p>Flores que transmiten emociones. Creamos arreglos florales para convertir momentos especiales en recuerdos inolvidables.</p>
            </div>
            <div class="footer-column">
                <h4>Comprar</h4>
                <div class="footer-shop-links">${categoryLinks}</div>
            </div>
            <div class="footer-column">
                <h4>Ayuda</h4>
                <div class="footer-help-links">
                    <button type="button" class="footer-link-button" data-footer-help="faq">Preguntas frecuentes</button>
                    <button type="button" class="footer-link-button" data-footer-help="delivery">
                        Delivery
                        <small>Aproximadamente 1 hora</small>
                    </button>
                    <button type="button" class="footer-link-button" data-footer-help="payments">
                        Métodos de pago
                        <small>Mercado Pago · Yape/Plin · Transferencia</small>
                    </button>
                </div>
            </div>
            <div class="footer-column">
                <h4>Contacto</h4>
                <div class="footer-contact-links">
                    <a href="https://wa.me/51967539019" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <a href="https://www.facebook.com/profile.php?id=61590177373176" target="_blank" rel="noopener noreferrer">Facebook</a>
                </div>
            </div>
        `;

        footerContent.dataset.kantuEnhanced = "true";
        footerContent.addEventListener("click", event => {
            const categoryButton = event.target.closest("[data-footer-category]");
            if (categoryButton) {
                activateFooterCategory(categoryButton.dataset.footerCategory);
                return;
            }

            const helpButton = event.target.closest("[data-footer-help]");
            if (helpButton) openFooterHelp(helpButton.dataset.footerHelp);
        });
    }

    function initializeCustomerUxPack() {
        installCatalogRenderer();
        renderCatalogToolbar();
        initializeScrollTopButton();
        installReceiptPaymentGate();
        renderFooterExperience();
        loadProductPopularity();
        if (typeof renderProducts === "function") renderProducts();
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            window.setTimeout(initializeCustomerUxPack, 0);
        });
    } else {
        window.setTimeout(initializeCustomerUxPack, 0);
    }
})();
