/* Kantu Floral - restauración exacta del catálogo al volver desde detalle */

(() => {
    const RETURN_KEY = "kantuCatalogReturn:v2";
    const RESTORE_KEY = "kantuCatalogRestoreRequested:v2";
    const MAX_AGE_MS = 30 * 60 * 1000;
    let restoreTimer = null;

    function safeSessionGet(key) {
        try {
            return sessionStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function safeSessionSet(key, value) {
        try {
            sessionStorage.setItem(key, value);
        } catch {
            // Ignorar si el navegador bloquea sessionStorage.
        }
    }

    function safeSessionRemove(key) {
        try {
            sessionStorage.removeItem(key);
        } catch {
            // Ignorar si el navegador bloquea sessionStorage.
        }
    }

    function readSnapshot() {
        try {
            const raw = safeSessionGet(RETURN_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw);
            const timestamp = Number(value?.timestamp);
            const productId = Number(value?.productId);
            const scrollY = Number(value?.scrollY);
            const viewportTop = Number(value?.viewportTop);
            if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_AGE_MS) return null;
            if (!Number.isSafeInteger(productId) || productId <= 0) return null;
            return {
                productId,
                category: String(value?.category || "todos"),
                scrollY: Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0,
                viewportTop: Number.isFinite(viewportTop) ? viewportTop : 120,
                timestamp
            };
        } catch {
            return null;
        }
    }

    function rememberFromDetailLink(link) {
        const id = Number(new URL(link.href, window.location.href).searchParams.get("id"));
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const card = link.closest(".product-card");
        const activeCategory = document.querySelector(".category-btn.active")?.dataset.category || "todos";
        const snapshot = {
            productId: id,
            category: activeCategory,
            scrollY: Math.max(0, window.scrollY || 0),
            viewportTop: card?.getBoundingClientRect().top ?? 120,
            timestamp: Date.now()
        };
        safeSessionSet(RETURN_KEY, JSON.stringify(snapshot));
    }

    function restoreCategory(category) {
        if (!category || category === "todos") return;
        const button = [...document.querySelectorAll(".category-btn")]
            .find(candidate => candidate.dataset.category === category);
        if (button && !button.classList.contains("active")) button.click();
    }

    function findTargetCard(productId) {
        const links = [...document.querySelectorAll(".product-detail-link")];
        const link = links.find(candidate => {
            try {
                return Number(new URL(candidate.href, window.location.href).searchParams.get("id")) === productId;
            } catch {
                return false;
            }
        });
        return link?.closest(".product-card") || null;
    }

    function finishRestore(snapshot) {
        restoreCategory(snapshot.category);
        const target = findTargetCard(snapshot.productId);
        if (!target) return false;

        const currentTop = target.getBoundingClientRect().top;
        const targetY = Math.max(0, window.scrollY + currentTop - snapshot.viewportTop);
        window.scrollTo({ top: targetY, left: 0, behavior: "auto" });

        // Un segundo ajuste compensa imágenes/fuentes que terminen de asentarse justo después.
        requestAnimationFrame(() => {
            const card = findTargetCard(snapshot.productId);
            if (!card) return;
            const adjustedTop = card.getBoundingClientRect().top;
            const adjustedY = Math.max(0, window.scrollY + adjustedTop - snapshot.viewportTop);
            window.scrollTo({ top: adjustedY, left: 0, behavior: "auto" });
        });

        safeSessionRemove(RESTORE_KEY);
        return true;
    }

    function attemptRestore() {
        if (safeSessionGet(RESTORE_KEY) !== "1") return;
        const snapshot = readSnapshot();
        if (!snapshot) {
            safeSessionRemove(RESTORE_KEY);
            return;
        }

        const startedAt = Date.now();
        clearInterval(restoreTimer);
        restoreTimer = window.setInterval(() => {
            const grid = document.getElementById("productsGrid");
            const ready = grid && grid.querySelector(".product-card");
            if (ready && finishRestore(snapshot)) {
                clearInterval(restoreTimer);
                restoreTimer = null;
                return;
            }
            if (Date.now() - startedAt > 5000) {
                clearInterval(restoreTimer);
                restoreTimer = null;
                window.scrollTo({ top: snapshot.scrollY, left: 0, behavior: "auto" });
                safeSessionRemove(RESTORE_KEY);
            }
        }, 60);
    }

    document.addEventListener("click", event => {
        const link = event.target.closest?.(".product-detail-link");
        if (link) rememberFromDetailLink(link);
    }, true);

    window.addEventListener("pageshow", attemptRestore);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", attemptRestore, { once: true });
    } else {
        attemptRestore();
    }

    window.KantuCatalogPosition = Object.freeze({
        requestRestore() {
            safeSessionSet(RESTORE_KEY, "1");
        }
    });
})();
