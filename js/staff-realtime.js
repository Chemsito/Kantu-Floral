/* KANTU FLORAL - ACTUALIZACION REALTIME DEL PORTAL STAFF */

(() => {
    const STAFF_FALLBACK_REFRESH_INTERVAL = 60000;
    const STAFF_REALTIME_DEBOUNCE = 180;

    let staffRealtimeChannel = null;
    let refreshDebounceTimer = null;
    let started = false;

    function scheduleStaffRefresh() {
        if (refreshDebounceTimer) window.clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = window.setTimeout(() => {
            refreshDebounceTimer = null;
            if (typeof loadStaffOrders === "function") {
                loadStaffOrders({ silent: true });
            }
        }, STAFF_REALTIME_DEBOUNCE);
    }

    function replaceFastPollingWithFallback() {
        if (typeof staffRefreshTimer === "undefined") return;
        if (staffRefreshTimer) window.clearInterval(staffRefreshTimer);
        staffRefreshTimer = window.setInterval(() => {
            if (typeof loadStaffOrders === "function") {
                loadStaffOrders({ silent: true });
            }
        }, STAFF_FALLBACK_REFRESH_INTERVAL);
    }

    function startStaffRealtime() {
        if (started || typeof supabaseClient === "undefined") return;
        if (typeof staffProfile === "undefined" || !staffProfile) return;

        started = true;
        replaceFastPollingWithFallback();

        staffRealtimeChannel = supabaseClient
            .channel("kantu-staff-orders")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "orders"
            }, scheduleStaffRefresh)
            .subscribe(status => {
                if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
                    console.warn("Realtime del portal operativo no está disponible; se mantiene el refresco de respaldo.");
                }
            });
    }

    function stopStaffRealtime() {
        started = false;
        if (refreshDebounceTimer) window.clearTimeout(refreshDebounceTimer);
        refreshDebounceTimer = null;

        if (staffRealtimeChannel && typeof supabaseClient !== "undefined") {
            supabaseClient.removeChannel(staffRealtimeChannel);
        }
        staffRealtimeChannel = null;
    }

    function observeStaffReady() {
        const app = document.getElementById("staffApp");
        if (!app) return;

        const tryStart = () => {
            if (!app.hidden) startStaffRealtime();
        };

        tryStart();
        const observer = new MutationObserver(tryStart);
        observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });

        window.addEventListener("beforeunload", () => {
            observer.disconnect();
            stopStaffRealtime();
        }, { once: true });
    }

    document.addEventListener("DOMContentLoaded", observeStaffReady);
})();
