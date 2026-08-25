/* =====================================================
   KANTU FLORAL — UI POLISH + BRAND EXPERIENCE
   - Selects accesibles personalizados
   - Diálogos, tooltips, iconografía y toasts Kantu
   - Skeletons, estados, mapa, header y checkout móvil
   - Consolidación visual compartida entre tienda, Admin y Staff
===================================================== */

(() => {
    const STYLE_KEY = "data-kantu-ui-polish-select";
    const BRAND_STYLE_KEY = "data-kantu-brand-experience";
    const selectValueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    const selectIndexDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
    const core = window.KantuCore;

    function ensureStyle(href, attribute) {
        if (document.querySelector(`link[${attribute}="true"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute(attribute, "true");
        document.head.appendChild(link);
    }

    function ensureStyles() {
        ensureStyle("css/ui-polish-select.css", STYLE_KEY);
        ensureStyle("css/brand-experience.css", BRAND_STYLE_KEY);
    }

    function escapeHtml(value) {
        if (core?.escapeHtml) return core.escapeHtml(value);
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function safeUrl(value) {
        if (core?.safeUrl) return core.safeUrl(value);
        try {
            const url = new URL(String(value || ""), location.href);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch {
            return "";
        }
    }

    function money(value) {
        if (core?.formatMoney) return core.formatMoney(Number(value) || 0);
        return `S/ ${(Number(value) || 0).toFixed(2)}`;
    }

    /* =====================================================
       SELECT SYSTEM
    ===================================================== */

    function optionLabel(option) {
        return String(option?.textContent || "").trim();
    }

    function closeSelect(shell, focusTrigger = false) {
        if (!shell) return;
        shell.classList.remove("is-open");
        const trigger = shell.querySelector(".kantu-select-trigger");
        trigger?.setAttribute("aria-expanded", "false");
        if (focusTrigger) trigger?.focus();
    }

    function closeOthers(except = null) {
        document.querySelectorAll(".kantu-select-shell.is-open").forEach(shell => {
            if (shell !== except) closeSelect(shell);
        });
    }

    function syncSelect(select, shell) {
        if (!select?.isConnected || !shell?.isConnected) return;
        const trigger = shell.querySelector(".kantu-select-trigger");
        const label = shell.querySelector(".kantu-select-value");
        const selectedOption = select.options[select.selectedIndex];
        if (label) label.textContent = optionLabel(selectedOption) || "Seleccionar";
        if (trigger) trigger.disabled = select.disabled;

        shell.querySelectorAll(".kantu-select-option").forEach((button, index) => {
            const option = select.options[index];
            const isSelected = Boolean(option?.selected);
            button.classList.toggle("is-selected", isSelected);
            button.setAttribute("aria-selected", String(isSelected));
            button.disabled = Boolean(option?.disabled);
        });
    }

    function installProgrammaticSync(select, shell) {
        if (select.dataset.kantuSelectProgrammaticSync === "true") return;

        if (selectValueDescriptor?.get && selectValueDescriptor?.set) {
            Object.defineProperty(select, "value", {
                configurable: true,
                get() {
                    return selectValueDescriptor.get.call(this);
                },
                set(nextValue) {
                    selectValueDescriptor.set.call(this, nextValue);
                    queueMicrotask(() => syncSelect(this, shell));
                }
            });
        }

        if (selectIndexDescriptor?.get && selectIndexDescriptor?.set) {
            Object.defineProperty(select, "selectedIndex", {
                configurable: true,
                get() {
                    return selectIndexDescriptor.get.call(this);
                },
                set(nextIndex) {
                    selectIndexDescriptor.set.call(this, nextIndex);
                    queueMicrotask(() => syncSelect(this, shell));
                }
            });
        }

        select.dataset.kantuSelectProgrammaticSync = "true";
    }

    function rebuildMenu(select, shell, menu) {
        menu.replaceChildren();
        [...select.options].forEach((option, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "kantu-select-option";
            button.setAttribute("role", "option");
            button.dataset.optionIndex = String(index);
            button.textContent = optionLabel(option);
            button.disabled = option.disabled;
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                if (option.disabled) return;
                select.selectedIndex = index;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                syncSelect(select, shell);
                closeSelect(shell, true);
            });
            menu.appendChild(button);
        });
    }

    function buildSelect(select) {
        if (!(select instanceof HTMLSelectElement)) return;
        if (select.multiple || Number(select.size) > 1 || select.dataset.kantuSelectEnhanced === "true") return;
        if (select.closest(".kantu-select-shell")) return;

        const shell = document.createElement("div");
        shell.className = "kantu-select-shell";
        shell.dataset.kantuSelectFor = select.id || "";

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "kantu-select-trigger";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const triggerValue = document.createElement("span");
        triggerValue.className = "kantu-select-value";
        const chevron = document.createElement("span");
        chevron.className = "kantu-select-chevron";
        chevron.setAttribute("aria-hidden", "true");
        trigger.append(triggerValue, chevron);

        const menu = document.createElement("div");
        menu.className = "kantu-select-menu";
        menu.setAttribute("role", "listbox");
        menu.tabIndex = -1;

        const label = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
        const containingLabel = select.closest("label");
        const accessibleName = String(
            label?.textContent || containingLabel?.querySelector(":scope > span")?.textContent || select.getAttribute("aria-label") || "Seleccionar opción"
        ).trim();
        trigger.setAttribute("aria-label", accessibleName);

        select.parentNode.insertBefore(shell, select);
        shell.append(select, trigger, menu);
        select.classList.add("kantu-native-select");
        select.dataset.kantuSelectEnhanced = "true";

        rebuildMenu(select, shell, menu);
        installProgrammaticSync(select, shell);

        trigger.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            if (select.disabled) return;
            syncSelect(select, shell);
            const willOpen = !shell.classList.contains("is-open");
            closeOthers(shell);
            shell.classList.toggle("is-open", willOpen);
            trigger.setAttribute("aria-expanded", String(willOpen));
            if (willOpen) {
                const selected = menu.querySelector(".is-selected") || menu.querySelector(".kantu-select-option:not(:disabled)");
                menu.querySelectorAll(".kantu-select-option").forEach(node => node.classList.remove("is-active"));
                selected?.classList.add("is-active");
            }
        });

        trigger.addEventListener("keydown", event => {
            const options = [...menu.querySelectorAll(".kantu-select-option:not(:disabled)")];
            if (!options.length) return;

            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                if (!shell.classList.contains("is-open")) {
                    closeOthers(shell);
                    shell.classList.add("is-open");
                    trigger.setAttribute("aria-expanded", "true");
                }
                let currentIndex = options.findIndex(node => node.classList.contains("is-active"));
                if (event.key === "Home") currentIndex = 0;
                else if (event.key === "End") currentIndex = options.length - 1;
                else if (event.key === "ArrowDown") currentIndex = Math.min(options.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
                else currentIndex = Math.max(0, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
                options.forEach(node => node.classList.remove("is-active"));
                options[currentIndex]?.classList.add("is-active");
                options[currentIndex]?.scrollIntoView({ block: "nearest" });
                return;
            }

            if ((event.key === "Enter" || event.key === " ") && shell.classList.contains("is-open")) {
                event.preventDefault();
                const active = menu.querySelector(".kantu-select-option.is-active") || menu.querySelector(".kantu-select-option.is-selected");
                active?.click();
                return;
            }

            if (event.key === "Escape" && shell.classList.contains("is-open")) {
                event.preventDefault();
                closeSelect(shell, true);
            }
        });

        select.addEventListener("change", () => syncSelect(select, shell));
        select.addEventListener("input", () => syncSelect(select, shell));
        select.addEventListener("focus", () => trigger.focus());

        const observer = new MutationObserver(() => {
            if (![...select.options].length) return;
            if (menu.children.length !== select.options.length) rebuildMenu(select, shell, menu);
            syncSelect(select, shell);
        });
        observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected", "label"] });

        syncSelect(select, shell);
    }

    function enhanceAll(root = document) {
        root.querySelectorAll?.("select:not([multiple])").forEach(buildSelect);
    }

    /* =====================================================
       ICONS
    ===================================================== */

    const ICONS = Object.freeze({
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
        cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        close: '<path d="M6 6l12 12M18 6 6 18"/>',
        arrowUp: '<path d="m6 10 6-6 6 6M12 4v16"/>',
        truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
        flower: '<circle cx="12" cy="12" r="2"/><path d="M12 10c-3-1-4-5-1-6 3-1 4 3 2 6M14 12c1-3 5-4 6-1 1 3-3 4-6 2M12 14c3 1 4 5 1 6-3 1-4-3-2-6M10 12c-1 3-5 4-6 1-1-3 3-4 6-2"/>',
        card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4"/>',
        lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v4M12 17h.01"/>',
        error: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'
    });

    function icon(name) {
        const body = ICONS[name] || ICONS.info;
        return `<svg class="kantu-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
    }

    function enhanceIcons(root = document) {
        const favorites = root.querySelector?.("#favoritesButton") || (root.id === "favoritesButton" ? root : null);
        if (favorites && favorites.dataset.kantuIconReady !== "true") {
            favorites.innerHTML = icon("heart");
            favorites.dataset.kantuIconReady = "true";
        }

        const cartButton = root.querySelector?.("#cartButton") || (root.id === "cartButton" ? root : null);
        if (cartButton && cartButton.dataset.kantuIconReady !== "true") {
            const decorative = cartButton.querySelector("span[aria-hidden='true']");
            if (decorative) decorative.innerHTML = icon("cart");
            cartButton.dataset.kantuIconReady = "true";
        }

        root.querySelectorAll?.(".mobile-menu").forEach(button => {
            if (button.dataset.kantuIconReady === "true") return;
            const decorative = button.querySelector("span[aria-hidden='true']");
            if (decorative) decorative.innerHTML = icon("menu");
            button.dataset.kantuIconReady = "true";
        });

        root.querySelectorAll?.(".close-modal, .kantu-customization-close").forEach(button => {
            if (button.dataset.kantuIconReady === "true") return;
            button.innerHTML = icon("close");
            button.dataset.kantuIconReady = "true";
        });

        root.querySelectorAll?.(".scroll-top-button").forEach(button => {
            if (button.dataset.kantuIconReady === "true") return;
            button.innerHTML = icon("arrowUp");
            button.dataset.kantuIconReady = "true";
        });

        root.querySelectorAll?.(".feature-icon").forEach(node => {
            if (node.dataset.kantuIconReady === "true") return;
            const text = node.textContent.trim();
            const name = text.includes("🚚") ? "truck" : text.includes("💌") ? "card" : "flower";
            node.innerHTML = icon(name);
            node.dataset.kantuIconReady = "true";
        });

        root.querySelectorAll?.(".staff-access-icon").forEach(node => {
            if (node.dataset.kantuIconReady === "true") return;
            node.innerHTML = icon("lock");
            node.dataset.kantuIconReady = "true";
        });
    }

    /* =====================================================
       TOOLTIPS
    ===================================================== */

    function enhanceTooltips(root = document) {
        const candidates = [];
        if (root instanceof Element && root.hasAttribute("title")) candidates.push(root);
        root.querySelectorAll?.("[title]").forEach(node => candidates.push(node));

        candidates.forEach(node => {
            if (node.hasAttribute("data-kantu-keep-native-title")) return;
            const title = String(node.getAttribute("title") || "").trim();
            if (!title) return;
            node.dataset.kantuTooltip = title;
            node.removeAttribute("title");
            if (!node.getAttribute("aria-label") && ["BUTTON", "A"].includes(node.tagName)) {
                node.setAttribute("aria-label", title);
            }
        });
    }

    /* =====================================================
       DIALOG SYSTEM + native-confirm adapters
    ===================================================== */

    let dialogResolver = null;
    let dialogReturnFocus = null;
    let approvedNativeConfirms = 0;
    let approvedNativeConfirmTimer = null;
    const nativeConfirm = window.confirm.bind(window);

    function ensureDialog() {
        let overlay = document.getElementById("kantuDialogOverlay");
        if (overlay) return overlay;

        overlay = document.createElement("div");
        overlay.id = "kantuDialogOverlay";
        overlay.className = "kantu-dialog-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <section class="kantu-dialog" role="alertdialog" aria-modal="true" aria-labelledby="kantuDialogTitle" aria-describedby="kantuDialogMessage">
                <div class="kantu-dialog-icon">${icon("warning")}</div>
                <h3 id="kantuDialogTitle"></h3>
                <p id="kantuDialogMessage"></p>
                <div class="kantu-dialog-actions">
                    <button type="button" class="kantu-dialog-cancel">Cancelar</button>
                    <button type="button" class="kantu-dialog-confirm">Continuar</button>
                </div>
            </section>
        `;
        document.body.appendChild(overlay);

        const resolve = value => {
            if (!dialogResolver) return;
            const resolver = dialogResolver;
            dialogResolver = null;
            overlay.hidden = true;
            document.body.classList.remove("kantu-dialog-open");
            resolver(Boolean(value));
            if (dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
            dialogReturnFocus = null;
        };

        overlay.querySelector(".kantu-dialog-cancel")?.addEventListener("click", () => resolve(false));
        overlay.querySelector(".kantu-dialog-confirm")?.addEventListener("click", () => resolve(true));
        overlay.addEventListener("click", event => {
            if (event.target === overlay) resolve(false);
        });
        document.addEventListener("keydown", event => {
            if (overlay.hidden || !dialogResolver) return;
            if (event.key === "Escape") {
                event.preventDefault();
                resolve(false);
                return;
            }
            if (event.key !== "Tab") return;
            const focusables = [...overlay.querySelectorAll("button:not(:disabled)")];
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        return overlay;
    }

    function confirmDialog({
        title = "Confirmar acción",
        message = "¿Deseas continuar?",
        confirmText = "Continuar",
        cancelText = "Cancelar",
        tone = "default"
    } = {}) {
        const overlay = ensureDialog();
        if (dialogResolver) dialogResolver(false);
        dialogReturnFocus = document.activeElement;
        const dialog = overlay.querySelector(".kantu-dialog");
        dialog.className = `kantu-dialog${tone === "danger" ? " danger" : ""}`;
        overlay.querySelector("#kantuDialogTitle").textContent = title;
        overlay.querySelector("#kantuDialogMessage").textContent = message;
        overlay.querySelector(".kantu-dialog-confirm").textContent = confirmText;
        overlay.querySelector(".kantu-dialog-cancel").textContent = cancelText;
        overlay.hidden = false;
        document.body.classList.add("kantu-dialog-open");
        window.setTimeout(() => overlay.querySelector(".kantu-dialog-cancel")?.focus(), 0);
        return new Promise(resolve => {
            dialogResolver = resolve;
        });
    }

    function approveNextNativeConfirm() {
        approvedNativeConfirms += 1;
        clearTimeout(approvedNativeConfirmTimer);
        approvedNativeConfirmTimer = window.setTimeout(() => {
            approvedNativeConfirms = 0;
        }, 15000);
    }

    const confirmProxy = message => {
        if (approvedNativeConfirms > 0) {
            approvedNativeConfirms -= 1;
            return true;
        }
        return nativeConfirm(message);
    };
    confirmProxy.__kantuProxy = true;
    window.confirm = confirmProxy;

    async function interceptNativeConfirmClick(event) {
        const target = event.target.closest?.("[data-admin-delete-product], [data-occasion-delete]");
        if (!target) return;
        if (target.dataset.kantuDialogBypass === "true") {
            delete target.dataset.kantuDialogBypass;
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const isProduct = target.hasAttribute("data-admin-delete-product");
        const card = target.closest(".admin-product-card, .occasion-reminder-card");
        const name = String(
            card?.querySelector("h4, h3, .admin-product-info strong, .occasion-reminder-main strong")?.textContent || ""
        ).trim();
        const approved = await confirmDialog({
            title: isProduct ? "Revisar eliminación de producto" : "Eliminar fecha importante",
            message: isProduct
                ? `${name ? `“${name}”. ` : ""}Kantu conservará el historial de pedidos y, cuando corresponda, desactivará el producto en lugar de borrar registros históricos.`
                : `¿Quieres eliminar${name ? ` “${name}”` : " esta fecha"}? Esta acción no se puede deshacer.`,
            confirmText: isProduct ? "Continuar" : "Eliminar",
            tone: "danger"
        });
        if (!approved) return;

        approveNextNativeConfirm();
        target.dataset.kantuDialogBypass = "true";
        target.click();
    }

    /* =====================================================
       TOASTS
    ===================================================== */

    function ensureToastStack() {
        let stack = document.getElementById("kantuToastStack");
        if (stack) return stack;
        stack = document.createElement("div");
        stack.id = "kantuToastStack";
        stack.className = "kantu-toast-stack";
        stack.setAttribute("aria-live", "polite");
        stack.setAttribute("aria-atomic", "false");
        document.body.appendChild(stack);
        return stack;
    }

    function toastIcon(type) {
        if (type === "success") return "check";
        if (type === "error") return "error";
        if (type === "warning") return "warning";
        return "info";
    }

    function inferToastType(message) {
        const value = String(message || "").toLowerCase();
        if (/(error|no pudimos|no se pudo|fall[oó]|agotado)/.test(value)) return "error";
        if (/(cuidado|atenci[oó]n|pendiente)/.test(value)) return "warning";
        if (/(agregado|guardad|actualizad|eliminado|correctamente|listo|aprobado)/.test(value)) return "success";
        return "info";
    }

    function showBrandToast(message, type = null, { duration = 3600 } = {}) {
        const text = String(message || "").trim();
        if (!text) return null;
        const resolvedType = type || inferToastType(text);
        const stack = ensureToastStack();
        const card = document.createElement("div");
        card.className = `kantu-toast-card ${resolvedType}`;
        card.setAttribute("role", resolvedType === "error" ? "alert" : "status");
        card.innerHTML = `
            <span class="kantu-toast-icon">${icon(toastIcon(resolvedType))}</span>
            <span class="kantu-toast-message">${escapeHtml(text)}</span>
            <button type="button" class="kantu-toast-close" aria-label="Cerrar notificación">${icon("close")}</button>
        `;
        stack.appendChild(card);
        const remove = () => card.remove();
        card.querySelector(".kantu-toast-close")?.addEventListener("click", remove);
        window.setTimeout(remove, duration);
        return card;
    }

    function installToastAdapter() {
        if (window.showToast?.__kantuBrandToast === true) return;
        const branded = (message, type) => showBrandToast(message, type);
        branded.__kantuBrandToast = true;
        window.showToast = branded;
    }

    /* =====================================================
       SKELETONS + STATES
    ===================================================== */

    function installCatalogSkeleton() {
        const grid = document.getElementById("productsGrid");
        if (!grid || grid.children.length || grid.dataset.kantuSkeletonReady === "true") return;
        grid.dataset.kantuSkeletonReady = "true";
        grid.innerHTML = Array.from({ length: 4 }, () => `
            <article class="kantu-product-skeleton" aria-hidden="true">
                <div class="kantu-skeleton-media"></div>
                <div class="kantu-skeleton-body">
                    <span class="kantu-skeleton-line short"></span>
                    <span class="kantu-skeleton-line wide"></span>
                    <span class="kantu-skeleton-line medium"></span>
                </div>
            </article>
        `).join("");
    }

    function decorateLoadingAndStates(root = document) {
        root.querySelectorAll?.(".admin-loader, .account-loading, .product-detail-loading, .staff-loading-row").forEach(node => {
            node.classList.add("kantu-loading-state");
        });
        root.querySelectorAll?.(".staff-empty, .occasion-reminder-empty, .commerce-empty, [id$='Empty']").forEach(node => {
            if (node instanceof HTMLElement) node.classList.add("kantu-state");
        });
    }

    /* =====================================================
       MAP
    ===================================================== */

    function enhanceLeaflet(root = document) {
        root.querySelectorAll?.(".leaflet-control-zoom-in").forEach(node => node.setAttribute("aria-label", "Acercar mapa"));
        root.querySelectorAll?.(".leaflet-control-zoom-out").forEach(node => node.setAttribute("aria-label", "Alejar mapa"));
        root.querySelectorAll?.(".leaflet-container").forEach(node => {
            if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", "Mapa de ubicación de entrega");
        });
    }

    /* =====================================================
       HEADER ACTIVE STATE
    ===================================================== */

    function syncHeaderScroll() {
        document.querySelectorAll(".site-header").forEach(header => {
            header.classList.toggle("kantu-scrolled", window.scrollY > 24);
        });
    }

    function setCurrentNavigation(sectionId) {
        document.querySelectorAll(".site-header nav a").forEach(link => {
            const href = link.getAttribute("href") || "";
            const normalized = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
            const current = Boolean(sectionId && normalized === sectionId);
            link.classList.toggle("kantu-current", current);
            if (current) link.setAttribute("aria-current", "true");
            else link.removeAttribute("aria-current");
        });
    }

    function initializeHeaderNavigation() {
        syncHeaderScroll();
        window.addEventListener("scroll", syncHeaderScroll, { passive: true });

        if (document.body.classList.contains("product-detail-page")) {
            const catalog = document.querySelector('.site-header nav a[href*="#catalogo"]');
            catalog?.classList.add("kantu-current");
            catalog?.setAttribute("aria-current", "page");
            return;
        }

        const sections = ["inicio", "catalogo", "nosotros", "contacto"]
            .map(id => document.getElementById(id))
            .filter(Boolean);
        if (!sections.length || typeof IntersectionObserver === "undefined") return;

        const visible = new Map();
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => visible.set(entry.target.id, entry.intersectionRatio));
            const current = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
            if (current?.[1] > 0) setCurrentNavigation(current[0]);
        }, { rootMargin: "-25% 0px -55% 0px", threshold: [0, .2, .5, .8] });
        sections.forEach(section => observer.observe(section));
    }

    /* =====================================================
       CHECKOUT MOBILE BAR
    ===================================================== */

    function ensureCheckoutMobileBar() {
        const overlay = document.getElementById("checkoutModal");
        const modal = overlay?.querySelector(".checkout-modal, .modal");
        const sourceButton = document.getElementById("confirmOrderButton");
        const sourceTotal = document.getElementById("checkoutTotal");
        if (!overlay || !modal || !sourceButton || !sourceTotal) return null;

        let bar = document.getElementById("kantuCheckoutMobileBar");
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "kantuCheckoutMobileBar";
            bar.className = "kantu-checkout-mobile-bar";
            bar.innerHTML = `
                <div class="kantu-checkout-mobile-total"><small>Total</small><strong></strong></div>
                <button type="button" class="kantu-checkout-mobile-action">Crear pedido</button>
            `;
            modal.appendChild(bar);
            bar.querySelector(".kantu-checkout-mobile-action")?.addEventListener("click", () => sourceButton.click());
        }

        const sync = () => {
            const action = bar.querySelector(".kantu-checkout-mobile-action");
            const total = bar.querySelector(".kantu-checkout-mobile-total strong");
            const nextTotal = sourceTotal.textContent || "S/ 0.00";
            const nextLabel = sourceButton.disabled ? "Procesando..." : "Crear pedido";
            if (total && total.textContent !== nextTotal) total.textContent = nextTotal;
            if (action) {
                if (action.disabled !== sourceButton.disabled) action.disabled = sourceButton.disabled;
                if (action.textContent !== nextLabel) action.textContent = nextLabel;
            }
        };
        sync();

        if (bar.dataset.kantuSyncReady !== "true") {
            bar.dataset.kantuSyncReady = "true";
            new MutationObserver(sync).observe(sourceTotal, { childList: true, subtree: true, characterData: true });
            new MutationObserver(sync).observe(sourceButton, { attributes: true, childList: true, subtree: true, attributeFilter: ["disabled"] });
        }
        return bar;
    }

    /* =====================================================
       GIFT UPSELL: real Peluche grande + complete names
    ===================================================== */

    const LARGE_PLUSH_NAME = "Peluche hipoalergénico grande";
    const MEDIUM_PLUSH_NAME = "Peluche hipoalergénico mediano";

    function globalProducts() {
        try {
            return typeof products !== "undefined" && Array.isArray(products) ? products : [];
        } catch {
            return [];
        }
    }

    function globalCartQuantity(productId) {
        try {
            if (typeof cart === "undefined" || !Array.isArray(cart)) return 0;
            return Number(cart.find(item => Number(item.id) === Number(productId))?.quantity) || 0;
        } catch {
            return 0;
        }
    }

    function buildUpsellCard(product) {
        const article = document.createElement("article");
        article.className = "checkout-upsell-item kantu-priority-upsell";
        article.dataset.kantuPriorityUpsell = String(product.id);
        const image = safeUrl(product.image);
        const quantity = globalCartQuantity(product.id);
        const stock = Math.max(0, Number(product.stock) || 0);
        const atLimit = quantity >= stock;
        article.innerHTML = `
            ${image
                ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name || "Complemento")}" loading="lazy">`
                : '<div class="checkout-upsell-placeholder" aria-hidden="true">✿</div>'}
            <div class="checkout-upsell-info">
                <strong>${escapeHtml(product.name || "Complemento")}</strong>
                <span>${escapeHtml(money(product.price))}</span>
                <button type="button" class="checkout-upsell-add" data-upsell-product="${Number(product.id)}" ${atLimit ? "disabled" : ""}>
                    ${atLimit ? `En carrito (${quantity})` : quantity ? `Agregar otro (${quantity})` : "Agregar"}
                </button>
            </div>
        `;
        return article;
    }

    function refreshGiftUpsell() {
        const list = document.getElementById("checkoutUpsellList");
        if (!list) return false;
        const available = globalProducts();
        const product = available.find(row => String(row?.name || "") === LARGE_PLUSH_NAME
            && row?.active !== false && Number(row?.stock) > 0);
        if (!product) return false;

        const existing = list.querySelector(`[data-upsell-product="${Number(product.id)}"]`);
        if (existing) return true;

        const card = buildUpsellCard(product);
        const medium = available.find(row => String(row?.name || "") === MEDIUM_PLUSH_NAME);
        const mediumButton = medium ? list.querySelector(`[data-upsell-product="${Number(medium.id)}"]`) : null;
        const mediumCard = mediumButton?.closest(".checkout-upsell-item");
        if (mediumCard) mediumCard.insertAdjacentElement("afterend", card);
        else list.appendChild(card);
        return true;
    }

    /* =====================================================
       GLOBAL OBSERVER / INITIALIZATION
    ===================================================== */

    function enhanceBrandNode(root = document) {
        enhanceTooltips(root);
        enhanceIcons(root);
        decorateLoadingAndStates(root);
        enhanceLeaflet(root);
        ensureCheckoutMobileBar();
        refreshGiftUpsell();
    }

    ensureStyles();
    enhanceAll();
    enhanceBrandNode();
    installCatalogSkeleton();
    installToastAdapter();
    initializeHeaderNavigation();
    document.addEventListener("click", interceptNativeConfirmClick, true);

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                if (node.matches("select:not([multiple])")) buildSelect(node);
                enhanceAll(node);
                enhanceBrandNode(node);
            });
        });
        refreshGiftUpsell();
        ensureCheckoutMobileBar();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("click", event => {
        const shell = event.target.closest?.(".kantu-select-shell");
        closeOthers(shell || null);
    }, true);

    window.setTimeout(() => {
        enhanceBrandNode();
        refreshGiftUpsell();
        ensureCheckoutMobileBar();
    }, 450);
    window.setTimeout(() => {
        enhanceBrandNode();
        refreshGiftUpsell();
    }, 1400);

    window.KantuDialog = Object.freeze({ confirm: confirmDialog });
    window.KantuToast = Object.freeze({ show: showBrandToast });
    window.KantuBrandUi = Object.freeze({
        refresh: () => enhanceBrandNode(),
        refreshGiftUpsell,
        ensureCheckoutMobileBar,
        icon
    });
    window.KantuUiPolish = {
        enhanceSelect: buildSelect,
        enhanceAll,
        syncSelect,
        closeAll: () => closeOthers()
    };
})();
