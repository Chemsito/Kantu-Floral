/* =====================================================
   KANTU FLORAL
   cart.js
   Carrito local + Supabase con sincronización verificable
===================================================== */

const KANTU_CART = window.KantuCore;
const CART_GUEST_KEY = "kantuCart:guest";
const CART_LEGACY_KEY = "kantuCart";
const CART_LEGACY_GUEST_MARKER = "kantuCart:guest:migratedLegacy";

let activeCartStorageKey = CART_GUEST_KEY;
let cartLoadPromise = null;
let cartSyncState = "idle";

function normalizeCartRows(rows) {
    if (!Array.isArray(rows)) return [];

    const byId = new Map();
    rows.forEach(row => {
        const id = Number(row?.id ?? row?.product_id);
        const quantity = Number(row?.quantity);
        if (!Number.isSafeInteger(id) || id <= 0) return;
        if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
        byId.set(id, Math.max(byId.get(id) || 0, quantity));
    });

    return [...byId.entries()].map(([id, quantity]) => ({ id, quantity }));
}

function cloneCart(rows = cart) {
    return normalizeCartRows(rows).map(item => ({ ...item }));
}

function readStoredCart(key) {
    try {
        return normalizeCartRows(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
        localStorage.removeItem(key);
        return [];
    }
}

function migrateLegacyCart() {
    const legacy = readStoredCart(CART_LEGACY_KEY);

    if (legacy.length && !localStorage.getItem(CART_GUEST_KEY)) {
        localStorage.setItem(CART_GUEST_KEY, JSON.stringify(legacy));
        localStorage.setItem(CART_LEGACY_GUEST_MARKER, "1");
    }

    localStorage.removeItem(CART_LEGACY_KEY);
    return readStoredCart(CART_GUEST_KEY);
}

let cart = migrateLegacyCart();

async function getCartCurrentUser() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    return error ? null : user;
}

function getUserCartKey(userId) {
    return `kantuCart:user:${String(userId)}`;
}

function setCartStorageScope(userId = null) {
    activeCartStorageKey = userId ? getUserCartKey(userId) : CART_GUEST_KEY;
}

function markGuestCartAsCurrent() {
    if (activeCartStorageKey === CART_GUEST_KEY) {
        localStorage.removeItem(CART_LEGACY_GUEST_MARKER);
    }
}

function ensureCartSyncStatus() {
    const panel = document.getElementById("cartPanel");
    if (!panel) return null;

    let status = document.getElementById("cartSyncStatus");
    if (status) return status;

    status = document.createElement("p");
    status.id = "cartSyncStatus";
    status.className = "cart-sync-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;

    const header = panel.querySelector(".cart-header");
    if (header) header.insertAdjacentElement("afterend", status);
    else panel.prepend(status);
    return status;
}

function setCartSyncState(state, message = "") {
    cartSyncState = state;
    const status = ensureCartSyncStatus();
    if (!status) return;

    status.className = `cart-sync-status ${state}`;
    status.textContent = message;
    status.hidden = !message;
}

function mergeAuthenticatedCart(remoteRows, localRows, guestRows, guestCameFromLegacy = false) {
    const merged = new Map();

    [...normalizeCartRows(remoteRows), ...normalizeCartRows(localRows)].forEach(item => {
        merged.set(item.id, Math.max(merged.get(item.id) || 0, item.quantity));
    });

    normalizeCartRows(guestRows).forEach(item => {
        const existing = merged.get(item.id) || 0;
        merged.set(
            item.id,
            guestCameFromLegacy ? Math.max(existing, item.quantity) : existing + item.quantity
        );
    });

    return [...merged.entries()].map(([id, quantity]) => ({ id, quantity }));
}

async function syncCartRowsToSupabase(user, rows) {
    if (!user) return true;
    if (!rows.length) return true;

    const payload = rows.map(item => ({
        user_id: user.id,
        product_id: item.id,
        quantity: item.quantity
    }));

    setCartSyncState("syncing", "Sincronizando carrito...");
    const { error } = await supabaseClient
        .from("cart_items")
        .upsert(payload, { onConflict: "user_id,product_id" });

    if (error) {
        console.error("Error sincronizando carrito:", error);
        setCartSyncState("error", "No pudimos sincronizar tu carrito. Revisa tu conexión e inténtalo otra vez.");
        return false;
    }

    setCartSyncState("synced", "Carrito sincronizado.");
    window.setTimeout(() => {
        if (cartSyncState === "synced") setCartSyncState("idle");
    }, 1400);
    return true;
}

/* =====================================================
   CARGAR / RECONCILIAR CARRITO
===================================================== */

async function performCartLoad() {
    const user = await getCartCurrentUser();

    if (!user) {
        setCartStorageScope();
        cart = readStoredCart(CART_GUEST_KEY);
        saveCart({ preserveLegacyMarker: true });
        setCartSyncState("idle");
        updateCart();
        return true;
    }

    setCartStorageScope(user.id);
    setCartSyncState("syncing", "Cargando tu carrito...");

    const { data, error } = await supabaseClient
        .from("cart_items")
        .select("product_id, quantity")
        .eq("user_id", user.id);

    if (error) {
        console.error("Error cargando carrito:", error);
        cart = readStoredCart(activeCartStorageKey);
        setCartSyncState("error", "No pudimos verificar tu carrito guardado. Revisa tu conexión.");
        updateCart();
        return false;
    }

    const userLocalCart = readStoredCart(activeCartStorageKey);
    const guestCart = readStoredCart(CART_GUEST_KEY);
    const guestCameFromLegacy = localStorage.getItem(CART_LEGACY_GUEST_MARKER) === "1";

    cart = mergeAuthenticatedCart(
        data || [],
        userLocalCart,
        guestCart,
        guestCameFromLegacy
    );

    const synced = await syncCartRowsToSupabase(user, cart);
    saveCart();

    if (synced && guestCart.length) {
        localStorage.removeItem(CART_GUEST_KEY);
        localStorage.removeItem(CART_LEGACY_GUEST_MARKER);
    }

    updateCart();
    return synced;
}

async function loadCartFromSupabase() {
    if (!cartLoadPromise) {
        cartLoadPromise = performCartLoad().finally(() => {
            cartLoadPromise = null;
        });
    }

    const synced = await cartLoadPromise;

    const user = await getCartCurrentUser();
    const expectedKey = user ? getUserCartKey(user.id) : CART_GUEST_KEY;
    if (activeCartStorageKey !== expectedKey && !cartLoadPromise) {
        return loadCartFromSupabase();
    }

    return synced;
}

async function ensureCartSessionReady() {
    const user = await getCartCurrentUser();
    const expectedKey = user ? getUserCartKey(user.id) : CART_GUEST_KEY;

    if (activeCartStorageKey !== expectedKey || cartLoadPromise) {
        await loadCartFromSupabase();
    }

    return getCartCurrentUser();
}

/* =====================================================
   PERSISTENCIA REMOTA
===================================================== */

async function saveItemToSupabase(productId, quantity, user = null) {
    const currentUser = user || await getCartCurrentUser();
    if (!currentUser) return true;

    setCartStorageScope(currentUser.id);
    setCartSyncState("syncing", "Guardando cambio...");

    const { error } = await supabaseClient
        .from("cart_items")
        .upsert({
            user_id: currentUser.id,
            product_id: productId,
            quantity
        }, { onConflict: "user_id,product_id" });

    if (error) {
        console.error("Error guardando carrito:", error);
        setCartSyncState("error", "No pudimos guardar el cambio del carrito.");
        return false;
    }

    setCartSyncState("synced", "Cambio guardado.");
    window.setTimeout(() => {
        if (cartSyncState === "synced") setCartSyncState("idle");
    }, 1200);
    return true;
}

async function removeItemFromSupabase(productId, user = null) {
    const currentUser = user || await getCartCurrentUser();
    if (!currentUser) return true;

    setCartSyncState("syncing", "Guardando cambio...");
    const { error } = await supabaseClient
        .from("cart_items")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("product_id", productId);

    if (error) {
        console.error("Error eliminando item:", error);
        setCartSyncState("error", "No pudimos guardar el cambio del carrito.");
        return false;
    }

    setCartSyncState("synced", "Cambio guardado.");
    window.setTimeout(() => {
        if (cartSyncState === "synced") setCartSyncState("idle");
    }, 1200);
    return true;
}

function rollbackCart(previousCart, message) {
    cart = cloneCart(previousCart);
    saveCart();
    updateCart();
    showToast(message);
}

/* =====================================================
   OPERACIONES DEL CARRITO
===================================================== */

async function addToCart(productId) {
    const user = await ensureCartSessionReady();
    const product = products.find(row => Number(row.id) === Number(productId));
    if (!product) return;

    const stock = Math.max(0, Number(product.stock) || 0);
    if (stock <= 0) {
        showToast("Este producto está agotado.");
        return;
    }

    const id = Number(product.id);
    const existing = cart.find(item => item.id === id);

    if (existing && existing.quantity >= stock) {
        showToast("No hay más unidades disponibles de este producto.");
        return;
    }

    const previousCart = cloneCart();
    if (existing) existing.quantity += 1;
    else cart.push({ id, quantity: 1 });

    markGuestCartAsCurrent();
    saveCart();
    updateCart();

    const currentItem = cart.find(item => item.id === id);
    if (user) {
        const persisted = await saveItemToSupabase(id, currentItem.quantity, user);
        if (!persisted) {
            rollbackCart(previousCart, "No pudimos agregar el producto porque el carrito no se sincronizó.");
            return;
        }
    }

    showToast(`${product.name} fue agregado al carrito.`);
}

async function changeQuantity(productId, amount) {
    const user = await ensureCartSessionReady();
    const id = Number(productId);
    const item = cart.find(row => row.id === id);
    if (!item) return;

    const product = products.find(row => Number(row.id) === id);
    const stock = Math.max(0, Number(product?.stock) || 0);
    const nextQuantity = item.quantity + Number(amount || 0);

    if (nextQuantity > stock) {
        showToast("No hay más unidades disponibles de este producto.");
        return;
    }

    const previousCart = cloneCart();
    item.quantity = nextQuantity;
    markGuestCartAsCurrent();

    let persisted = true;
    if (item.quantity <= 0) {
        cart = cart.filter(row => row.id !== id);
        if (user) persisted = await removeItemFromSupabase(id, user);
    } else if (user) {
        persisted = await saveItemToSupabase(id, item.quantity, user);
    }

    if (!persisted) {
        rollbackCart(previousCart, "No pudimos actualizar la cantidad porque el carrito no se sincronizó.");
        return;
    }

    saveCart();
    updateCart();
}

async function removeFromCart(productId) {
    const user = await ensureCartSessionReady();
    const id = Number(productId);
    const previousCart = cloneCart();

    cart = cart.filter(item => item.id !== id);
    markGuestCartAsCurrent();
    saveCart();
    updateCart();

    if (user) {
        const persisted = await removeItemFromSupabase(id, user);
        if (!persisted) {
            rollbackCart(previousCart, "No pudimos eliminar el producto porque el carrito no se sincronizó.");
        }
    }
}

function saveCart({ preserveLegacyMarker = false } = {}) {
    localStorage.setItem(activeCartStorageKey, JSON.stringify(normalizeCartRows(cart)));
    if (!preserveLegacyMarker) markGuestCartAsCurrent();
}

/* =====================================================
   RENDER
===================================================== */

function updateCart() {
    const cartItems = document.getElementById("cartItems");
    const cartCount = document.getElementById("cartCount");
    const cartTotal = document.getElementById("cartTotal");
    const checkoutButton = document.getElementById("cartCheckoutButton");

    if (!cartItems || !cartCount || !cartTotal) return;

    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    cartCount.textContent = totalItems;
    cartCount.setAttribute("aria-label", `${totalItems} productos en el carrito`);
    if (checkoutButton) checkoutButton.hidden = false;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <span aria-hidden="true">🌷</span>
                <h3>Tu carrito está vacío</h3>
                <p>Agrega flores para comenzar.</p>
            </div>
        `;
        cartTotal.textContent = "S/ 0.00";
        if (typeof updateActiveOrderCartPresentation === "function") {
            updateActiveOrderCartPresentation();
        }
        return;
    }

    let total = 0;

    cartItems.innerHTML = cart.map(item => {
        const product = products.find(row => Number(row.id) === item.id);
        if (!product) return "";

        const price = Number(product.price) || 0;
        const subtotal = price * item.quantity;
        total += subtotal;
        const safeImage = KANTU_CART.safeUrl(product.image);
        const imageMarkup = safeImage
            ? `<img src="${KANTU_CART.escapeHtml(safeImage)}" alt="${KANTU_CART.escapeHtml(product.name || "Producto")}">`
            : '<div class="cart-item-image-placeholder" aria-hidden="true">✿</div>';

        return `
            <div class="cart-item">
                ${imageMarkup}
                <div class="cart-item-info">
                    <h4>${KANTU_CART.escapeHtml(product.name || "Producto")}</h4>
                    <div class="cart-item-price">S/ ${price.toFixed(2)}</div>
                    <div class="quantity-controls" aria-label="Cantidad de ${KANTU_CART.escapeHtml(product.name || "producto")}">
                        <button type="button" onclick="changeQuantity(${item.id}, -1)" aria-label="Disminuir cantidad">−</button>
                        <span aria-live="polite">${item.quantity}</span>
                        <button type="button" onclick="changeQuantity(${item.id}, 1)" aria-label="Aumentar cantidad">+</button>
                    </div>
                </div>
                <button type="button" class="remove-item" onclick="removeFromCart(${item.id})" aria-label="Eliminar ${KANTU_CART.escapeHtml(product.name || "producto")}">🗑</button>
            </div>
        `;
    }).join("");

    cartTotal.textContent = `S/ ${total.toFixed(2)}`;
    if (typeof updateActiveOrderCartPresentation === "function") {
        updateActiveOrderCartPresentation();
    }
}

function openCart() {
    const cartPanel = document.getElementById("cartPanel");
    if (!cartPanel) return;

    cartPanel.classList.add("show");
    cartPanel.setAttribute("aria-hidden", "false");
    if (cart.length === 0 && typeof renderActiveOrderInCart === "function") {
        if (!renderActiveOrderInCart()) updateCart();
    } else {
        updateCart();
    }
}

function closeCart() {
    const panel = document.getElementById("cartPanel");
    panel?.classList.remove("show");
    panel?.setAttribute("aria-hidden", "true");
}

async function checkout() {
    const user = await ensureCartSessionReady();

    if (cart.length === 0) {
        showToast("Tu carrito está vacío.");
        return;
    }

    if (!user) {
        closeCart();
        openAuth("login");
        showToast("Inicia sesión para continuar con tu compra.");
        return;
    }

    if (cartSyncState === "error") {
        const recovered = await loadCartFromSupabase();
        if (!recovered || cartSyncState === "error") {
            showToast("No podemos iniciar el pedido hasta sincronizar tu carrito. Revisa tu conexión.");
            return;
        }
    }

    openCheckout(user);
}

function initializeCart() {
    const panel = document.getElementById("cartPanel");
    panel?.setAttribute("role", "dialog");
    panel?.setAttribute("aria-modal", "true");
    panel?.setAttribute("aria-label", "Carrito de compras");
    panel?.setAttribute("aria-hidden", "true");

    document.getElementById("cartButton")?.addEventListener("click", openCart);
    ensureCartSyncStatus();
    updateCart();
    loadCartFromSupabase();
}
