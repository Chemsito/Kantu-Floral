/* Kantu Floral - puente de navegación entre páginas secundarias y la tienda principal */

(() => {
    function consumeRequestedAction() {
        const url = new URL(window.location.href);
        const action = url.searchParams.get("kantu_open");
        if (!action) return null;

        url.searchParams.delete("kantu_open");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        return action;
    }

    function triggerAction(action) {
        const selectors = {
            favorites: "#favoritesButton",
            cart: "#cartButton",
            account: "#loginButton",
            orders: "#headerOrdersButton"
        };
        const selector = selectors[action];
        if (!selector) return false;

        const target = document.querySelector(selector);
        if (!(target instanceof HTMLElement)) return false;
        target.click();
        return true;
    }

    function initializeNavigationBridge() {
        const action = consumeRequestedAction();
        if (!action) return;

        let attempts = 0;
        const tryOpen = () => {
            attempts += 1;
            if (triggerAction(action) || attempts >= 12) return;
            window.setTimeout(tryOpen, 150);
        };

        window.setTimeout(tryOpen, 0);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeNavigationBridge, { once: true });
    } else {
        initializeNavigationBridge();
    }
})();
