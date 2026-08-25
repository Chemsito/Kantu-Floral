/* =====================================================
   KANTU FLORAL — UI POLISH INTERACTIONS
   Customiza select simples sin alterar su valor/formulario real.
===================================================== */

(() => {
    const STYLE_KEY = "data-kantu-ui-polish-select";
    const selectValueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    const selectIndexDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");

    function ensureStyles() {
        if (document.querySelector(`link[${STYLE_KEY}="true"]`)) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/ui-polish-select.css";
        link.setAttribute(STYLE_KEY, "true");
        document.head.appendChild(link);
    }

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
            if (menu.children.length !== select.options.length) {
                rebuildMenu(select, shell, menu);
            }
            syncSelect(select, shell);
        });
        observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected", "label"] });

        syncSelect(select, shell);
    }

    function enhanceAll(root = document) {
        root.querySelectorAll?.("select:not([multiple])").forEach(buildSelect);
    }

    ensureStyles();
    enhanceAll();

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                if (node.matches("select:not([multiple])")) buildSelect(node);
                enhanceAll(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener("click", event => {
        const shell = event.target.closest?.(".kantu-select-shell");
        closeOthers(shell || null);
    }, true);

    window.KantuUiPolish = {
        enhanceSelect: buildSelect,
        enhanceAll,
        syncSelect,
        closeAll: () => closeOthers()
    };
})();
