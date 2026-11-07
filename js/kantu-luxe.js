/* =====================================================
   KANTU FLORAL
   kantu-luxe.js
   Experiencia visual 2026: orden de estilos, portada,
   ocasiones, animaciones de entrada y contacto rápido.
===================================================== */

(() => {
    if (window.KantuLuxe) return;

    const WHATSAPP_URL = "https://wa.me/51967539019";
    const isStandaloneAdmin = new URLSearchParams(window.location.search).get("admin") === "1";
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    /* Los módulos existentes inyectan sus hojas de estilo en tiempo de
       ejecución; la capa Luxe debe quedar siempre al final de <head>.
       Se mueven las hojas nuevas antes de Luxe (nunca Luxe en sí), porque
       re-insertar un <link> ya cargado lo desconecta un instante y provoca
       un parpadeo visible. */
    const LUXE_SELECTOR = "link[data-kantu-luxe], link[data-kantu-luxe-admin]";

    function isForeignStylesheet(node) {
        return node.nodeType === 1
            && (node.tagName === "STYLE" || (node.tagName === "LINK" && node.rel === "stylesheet"))
            && !node.matches(LUXE_SELECTOR);
    }

    function keepLuxeStylesLast() {
        const head = document.head;
        const placeBeforeLuxe = node => {
            const firstLuxe = head.querySelector(LUXE_SELECTOR);
            if (!firstLuxe || !node.isConnected || node.parentNode !== head) return;
            if (firstLuxe.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) {
                head.insertBefore(node, firstLuxe);
            }
        };

        new MutationObserver(mutations => {
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (isForeignStylesheet(node)) placeBeforeLuxe(node);
            }));
        }).observe(head, { childList: true });

        [...head.children].filter(isForeignStylesheet).forEach(placeBeforeLuxe);
    }

    function initializeHeaderState() {
        const header = document.querySelector(".site-header");
        if (!header) return;
        const update = () => header.classList.toggle("kf-scrolled", window.scrollY > 12);
        window.addEventListener("scroll", update, { passive: true });
        update();
    }

    function activateCategory(category) {
        const button = document.querySelector(`.category-btn[data-category="${CSS.escape(category)}"]`)
            || document.querySelector('.category-btn[data-category="todos"]');
        button?.click();
        document.getElementById("catalogo")?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }

    function initializeOccasions() {
        document.addEventListener("click", event => {
            const occasion = event.target.closest("[data-kf-category]");
            if (occasion) {
                event.preventDefault();
                activateCategory(occasion.dataset.kfCategory);
                return;
            }

            const match = event.target.closest("[data-kf-open-match]");
            if (match) {
                event.preventDefault();
                if (window.KantuGrowth?.openMatch) window.KantuGrowth.openMatch();
                else document.getElementById("kantuMatchButton")?.click();
                if (!document.getElementById("kantuMatchButton")) activateCategory("todos");
            }
        });
    }

    function initializeProductCount() {
        const target = document.querySelector("[data-kf-product-count]");
        if (!target) return;
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            const list = typeof products !== "undefined" && Array.isArray(products) ? products : null;
            if (list && list.length) {
                const visible = list.filter(product => product.active !== false).length;
                target.textContent = visible >= 10 ? `${Math.floor(visible / 10) * 10}+` : String(visible);
                window.clearInterval(timer);
            } else if (attempts > 40) {
                window.clearInterval(timer);
            }
        }, 250);
    }

    function initializeReveal() {
        const selectors = [
            ".kf-trust-item",
            ".kf-section-head",
            ".kf-occasion",
            ".kf-step",
            ".kf-story-media",
            ".kf-story-copy",
            ".store-help-card",
            ".kf-faq details"
        ];
        const nodes = document.querySelectorAll(selectors.join(","));
        if (!("IntersectionObserver" in window) || prefersReducedMotion) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("kf-visible");
                observer.unobserve(entry.target);
            });
        }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });

        nodes.forEach((node, index) => {
            node.classList.add("kf-reveal");
            node.style.transitionDelay = `${(index % 4) * 70}ms`;
            observer.observe(node);
        });
    }

    function initializeAnnouncement() {
        const track = document.querySelector(".kf-announce-track");
        if (!track || track.dataset.kfLooped === "true") return;
        track.dataset.kfLooped = "true";
        const separator = document.createElement("span");
        separator.setAttribute("aria-hidden", "true");
        separator.className = "kf-announce-loop-sep";
        separator.textContent = "✦";
        track.appendChild(separator);
        [...track.children].forEach(child => {
            const clone = child.cloneNode(true);
            clone.setAttribute("aria-hidden", "true");
            clone.classList.add("kf-announce-clone");
            track.appendChild(clone);
        });
    }

    function initializeWhatsapp() {
        if (isStandaloneAdmin || !document.querySelector(".site-header") || document.querySelector(".kf-whatsapp")) return;
        const link = document.createElement("a");
        link.className = "kf-whatsapp";
        link.href = WHATSAPP_URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", "Escríbenos por WhatsApp");
        link.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>
            <span>¿Te ayudamos?</span>
        `;
        document.body.appendChild(link);
    }

    const BELL_SVG = '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';

    function refineHeaderIcons() {
        const apply = () => {
            document.querySelectorAll(".kantu-bell").forEach(bell => {
                if (bell.dataset.kfIcon === "true") return;
                bell.dataset.kfIcon = "true";
                bell.innerHTML = BELL_SVG;
            });
        };
        apply();
        const actions = document.querySelector(".site-header .header-actions");
        if (actions) new MutationObserver(apply).observe(actions, { childList: true, subtree: true });
    }

    function initialize() {
        keepLuxeStylesLast();
        refineHeaderIcons();
        if (isStandaloneAdmin) return;
        initializeHeaderState();
        initializeOccasions();
        initializeProductCount();
        initializeAnnouncement();
        initializeReveal();
        initializeWhatsapp();
    }

    window.KantuLuxe = Object.freeze({ activateCategory });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
