/* =====================================================
   KANTU FLORAL
   admin-product-manager.js

   Compatibilidad temporal.
   La gestión de categorías, talla y nota vive en products.js.
   Además, este archivo carga mejoras ligeras del footer porque ya se
   ejecuta en toda la tienda sin duplicar la gestión de productos.
===================================================== */

(() => {
    window.KantuAdminProductManagerLoaded = true;

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

    function ensureFooterStyles() {
        if (document.getElementById("kantuFooterExperienceStyles")) return;

        const style = document.createElement("style");
        style.id = "kantuFooterExperienceStyles";
        style.textContent = `
            #contacto .footer-column a,
            #contacto .footer-link-button {
                appearance: none;
                border: 0;
                padding: 0;
                background: transparent;
                color: inherit;
                font: inherit;
                text-align: left;
                text-decoration: none;
                cursor: pointer;
            }

            #contacto .footer-column a:hover,
            #contacto .footer-link-button:hover,
            #contacto .footer-column a:focus-visible,
            #contacto .footer-link-button:focus-visible {
                color: #ffd3d9;
                text-decoration: underline;
                text-underline-offset: 3px;
            }

            #contacto .footer-shop-links {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px 18px;
            }

            #contacto .footer-help-links,
            #contacto .footer-contact-links {
                display: grid;
                gap: 9px;
            }

            #contacto .footer-link-button small {
                display: block;
                margin-top: 2px;
                color: rgba(255, 255, 255, .64);
                font-size: 11px;
                line-height: 1.35;
            }

            .footer-info-modal {
                max-width: 560px;
            }

            .footer-info-eyebrow {
                display: block;
                margin-bottom: 7px;
                color: #b33d5c;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: .09em;
                text-transform: uppercase;
            }

            .footer-info-content {
                margin-top: 18px;
                color: #5f5753;
                font-size: 14px;
                line-height: 1.6;
            }

            .footer-faq-list {
                display: grid;
                gap: 10px;
            }

            .footer-faq-list details,
            .footer-payment-list > div,
            .footer-info-stack {
                border: 1px solid #eadfe2;
                border-radius: 13px;
                background: #fffaf7;
            }

            .footer-faq-list details {
                padding: 12px 14px;
            }

            .footer-faq-list summary {
                color: #4b3336;
                font-weight: 700;
                cursor: pointer;
            }

            .footer-faq-list p,
            .footer-info-stack p {
                margin: 8px 0 0;
            }

            .footer-info-stack {
                padding: 14px;
            }

            .footer-info-stack p:first-child {
                margin-top: 0;
            }

            .footer-payment-list {
                display: grid;
                gap: 10px;
            }

            .footer-payment-list > div {
                padding: 13px 14px;
            }

            .footer-payment-list strong,
            .footer-payment-list span {
                display: block;
            }

            .footer-payment-list strong {
                color: #4b3336;
            }

            .footer-payment-list span {
                margin-top: 3px;
            }

            @media (max-width: 720px) {
                #contacto .footer-shop-links {
                    grid-template-columns: 1fr;
                }
            }
        `;
        document.head.appendChild(style);
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

        // Consistente con el resto de la experiencia: el fondo difuminado no
        // cierra la ventana ni borra lo que el cliente esté revisando.
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

    function initializeFooterExperience() {
        ensureFooterStyles();
        renderFooterExperience();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            // initializeCategories() también corre en DOMContentLoaded. Un turno
            // después garantiza que los filtros reales ya estén reconstruidos.
            window.setTimeout(initializeFooterExperience, 0);
        });
    } else {
        window.setTimeout(initializeFooterExperience, 0);
    }
})();
