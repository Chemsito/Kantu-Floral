/* Kantu Floral - abre el Panel administrador en una pestaña dedicada */

(() => {
    const isStandaloneAdmin = new URLSearchParams(window.location.search).get("admin") === "1";

    function storeUrl() {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        url.pathname = url.pathname.replace(/[^/]*$/, "index.html");
        return url.href;
    }

    function adminUrl() {
        const url = new URL(storeUrl());
        url.searchParams.set("admin", "1");
        return url.href;
    }

    function installOpenInNewTab() {
        const button = document.getElementById("accountAdminButton");
        if (!button || button.dataset.kantuStandaloneBound === "true") return;
        button.dataset.kantuStandaloneBound = "true";
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            const opened = window.open(adminUrl(), "kantu-admin", "noopener");
            if (!opened && typeof showAccountMessage === "function") {
                showAccountMessage("Tu navegador bloqueó la pestaña del panel. Permite ventanas emergentes e inténtalo nuevamente.");
                return;
            }
            if (typeof closeAccount === "function") closeAccount();
        }, true);
    }

    function installStandaloneAdmin() {
        if (!isStandaloneAdmin) return;
        document.body.classList.add("admin-standalone-mode");
        document.title = "Panel administrador | Kantu Floral";

        const close = document.getElementById("adminCloseButton");
        close?.addEventListener("click", event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            window.close();
            window.setTimeout(() => {
                if (!window.closed) window.location.href = storeUrl();
            }, 80);
        }, true);

        window.setTimeout(() => {
            if (typeof openAdmin === "function") openAdmin();
        }, 0);
    }

    function initialize() {
        installOpenInNewTab();
        installStandaloneAdmin();
    }

    window.KantuAdminStandalone = Object.freeze({ isStandaloneAdmin, adminUrl, storeUrl });

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
