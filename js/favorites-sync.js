/* Kantu Floral - favoritos locales + sincronización privada por cuenta */

(() => {
    if (typeof supabaseClient === "undefined") return;

    const GUEST_STORAGE_KEY = "kantuFavorites";
    let activeUserId = null;
    let operationQueue = Promise.resolve();
    let originalToggleFavorite = null;

    function normalizeIds(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values
            .map(Number)
            .filter(id => Number.isSafeInteger(id) && id > 0))];
    }

    function readGuestFavorites() {
        try {
            return normalizeIds(JSON.parse(localStorage.getItem(GUEST_STORAGE_KEY) || "[]"));
        } catch {
            localStorage.removeItem(GUEST_STORAGE_KEY);
            return [];
        }
    }

    function writeGuestFavorites(ids) {
        const values = normalizeIds(ids);
        if (values.length) localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(values));
        else localStorage.removeItem(GUEST_STORAGE_KEY);
    }

    function ensureStyles() {
        if (document.querySelector('link[href="css/favorites.css"]')) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/favorites.css";
        link.dataset.kantuFavoritesStyle = "true";
        document.head.appendChild(link);
    }

    function updateFavoritesButton() {
        const button = document.getElementById("favoritesButton");
        if (!button || typeof favorites === "undefined") return;

        let count = button.querySelector("[data-favorites-count]");
        if (!count) {
            count = document.createElement("span");
            count.dataset.favoritesCount = "true";
            count.className = "favorites-count";
            count.setAttribute("aria-hidden", "true");
            button.appendChild(count);
        }

        const total = normalizeIds(favorites).length;
        count.textContent = String(total);
        count.hidden = total === 0;
        button.classList.toggle("has-favorites", total > 0);
        button.setAttribute(
            "aria-label",
            total === 0
                ? "Ver productos favoritos"
                : `Ver productos favoritos, ${total} ${total === 1 ? "guardado" : "guardados"}`
        );
        button.title = activeUserId
            ? "Favoritos sincronizados con tu cuenta"
            : "Favoritos guardados en este navegador";
    }

    function applyFavorites(ids, { render = true } = {}) {
        if (typeof favorites === "undefined") return;
        favorites = normalizeIds(ids);
        updateFavoritesButton();
        if (render && typeof renderProducts === "function") renderProducts();
    }

    async function fetchRemoteFavorites(userId) {
        const { data, error } = await supabaseClient
            .from("customer_favorites")
            .select("product_id")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return normalizeIds((data || []).map(row => row.product_id));
    }

    async function claimGuestFavorites(userId, guestIds) {
        const rows = normalizeIds(guestIds).map(productId => ({
            user_id: userId,
            product_id: productId
        }));
        if (!rows.length) return;

        const { error } = await supabaseClient
            .from("customer_favorites")
            .upsert(rows, {
                onConflict: "user_id,product_id",
                ignoreDuplicates: true
            });
        if (error) throw error;
    }

    async function synchronizeSignedInFavorites(user) {
        if (!user?.id) return;
        activeUserId = user.id;
        const guestIds = readGuestFavorites();

        try {
            const remoteIds = await fetchRemoteFavorites(user.id);
            const merged = normalizeIds([...remoteIds, ...guestIds]);

            if (guestIds.length) {
                await claimGuestFavorites(user.id, guestIds);
                writeGuestFavorites([]);
            }

            applyFavorites(merged);
        } catch (error) {
            console.error("No se pudieron sincronizar los favoritos:", error);
            // Si la cuenta no pudo leerse, no reemplazamos la lista visible con datos inciertos.
            updateFavoritesButton();
            if (typeof showToast === "function") {
                showToast("No pudimos sincronizar tus favoritos. Reintentaremos al recuperar conexión.");
            }
        }
    }

    function switchToGuestFavorites() {
        activeUserId = null;
        applyFavorites(readGuestFavorites());
    }

    async function persistAuthenticatedToggle(productId) {
        const id = Number(productId);
        if (!activeUserId || !Number.isSafeInteger(id) || id <= 0 || typeof favorites === "undefined") return;

        const before = normalizeIds(favorites);
        const adding = !before.includes(id);
        const after = adding
            ? normalizeIds([...before, id])
            : before.filter(currentId => currentId !== id);

        applyFavorites(after);

        let error = null;
        if (adding) {
            ({ error } = await supabaseClient
                .from("customer_favorites")
                .insert({ user_id: activeUserId, product_id: id }));

            // Un favorito ya existente equivale al estado deseado.
            if (error?.code === "23505") error = null;
        } else {
            ({ error } = await supabaseClient
                .from("customer_favorites")
                .delete()
                .eq("user_id", activeUserId)
                .eq("product_id", id));
        }

        if (error) {
            console.error("No se pudo guardar el favorito:", error);
            applyFavorites(before);
            if (typeof showToast === "function") {
                showToast("No pudimos guardar ese favorito. Revisa tu conexión e inténtalo otra vez.");
            }
            return;
        }

        if (typeof showToast === "function") {
            showToast(adding ? "Guardado en tus favoritos ❤️" : "Eliminado de tus favoritos.");
        }
    }

    function installToggleAdapter() {
        if (typeof window.toggleFavorite !== "function") return false;
        if (window.toggleFavorite.dataset?.kantuFavoriteSync === "true") return true;

        originalToggleFavorite = window.toggleFavorite;
        const syncedToggleFavorite = function syncedToggleFavorite(productId) {
            if (!activeUserId) {
                originalToggleFavorite(productId);
                writeGuestFavorites(typeof favorites === "undefined" ? [] : favorites);
                updateFavoritesButton();
                return;
            }

            operationQueue = operationQueue
                .then(() => persistAuthenticatedToggle(productId))
                .catch(error => {
                    console.error("Error en la cola de favoritos:", error);
                });
        };
        syncedToggleFavorite.dataset = { kantuFavoriteSync: "true" };
        window.toggleFavorite = syncedToggleFavorite;
        return true;
    }

    async function initializeSession() {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.error("No se pudo leer la sesión para favoritos:", error);
            switchToGuestFavorites();
            return;
        }

        const user = data?.session?.user || null;
        if (user) await synchronizeSignedInFavorites(user);
        else switchToGuestFavorites();
    }

    function initialize() {
        ensureStyles();
        installToggleAdapter();
        updateFavoritesButton();

        initializeSession();

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            window.setTimeout(() => {
                if (session?.user) {
                    operationQueue = operationQueue.then(() => synchronizeSignedInFavorites(session.user));
                } else {
                    operationQueue = operationQueue.then(() => switchToGuestFavorites());
                }
            }, 0);
        });
    }

    window.KantuFavoritesSync = Object.freeze({
        refresh: async () => {
            const { data } = await supabaseClient.auth.getSession();
            if (data?.session?.user) return synchronizeSignedInFavorites(data.session.user);
            switchToGuestFavorites();
            return null;
        },
        isAccountBacked: () => Boolean(activeUserId)
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
