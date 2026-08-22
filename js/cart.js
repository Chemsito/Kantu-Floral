/* =====================================================
   KANTU FLORAL
   cart.js
===================================================== */

const KANTU_CART = window.KantuCore;
const CART_GUEST_KEY = "kantuCart:guest";
const CART_LEGACY_KEY = "kantuCart";
let activeCartStorageKey = CART_GUEST_KEY;

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

function readStoredCart(key) {
    try {
        return normalizeCartRows(JSON.parse(localStorage.getItem(key) || "[]"));
    } catch {
        localStorage.removeItem(key);
        return [];
    }
}

function migrateLegacyCart() {
    if (!localStorage.getItem(CART_GUEST_KEY) && localStorage.getItem(CART_LEGACY_KEY)) {
        localStorage.setItem(CART_GUEST_KEY, localStorage.getItem(CART_LEGACY_KEY));
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

function mergeAuthenticatedCart(remoteRows, localRows, guestRows) {
    const merged = new Map();

    // Remoto y caché del mismo usuario representan el mismo carrito: conservar
    // la mayor cantidad evita duplicarlo al reconciliar dos copias.
    [...normalizeCartRows(remoteRows), ...normalizeCartRows(localRows)].forEach(item => {
        merged.set(item.id, Math.max(merged.get(item.id) || 0, item.quantity));
    });

    // El carrito invitado sí representa productos añadidos antes de iniciar sesión.
    normalizeCartRows(guestRows).forEach(item => {
        merged.set(item.id, (merged.get(item.id) || 0) + item.quantity);
    });

    return [...merged.entries()].map(([id, quantity]) => ({ id, quantity }));
}

async function syncCartRowsToSupabase(user, rows) {
    if (!user || !rows.length) return true;

    const payload = rows.map(item => ({
        user_id: user.id,
        product_id: item.id,
        quantity: item.quantity
    }));

    const { error } = await supabaseClient
        .from("cart_items")
        .upsert(payload, { onConflict: "user_id,product_id" });

    if (error) {
        console.error("Error sincronizando carrito:", error);
        return false;
    }

    return true;
}

/* =====================================================
   CARGAR / RECONCILIAR CARRITO
===================================================== */

async function loadCartFromSupabase() {
    const user = await getCartCurrentUser();

    if (!user) {
        setCartStorageScope();
        cart = readStoredCart(CART_GUEST_KEY);
        saveCart();
        updateCart();
        return;
    }

    setCartStorageScope(user.id);

    const { data, error } = await supabaseClient
        .from("cart_items")
        .select("product_id, quantity")
        .eq("user_id", user.id);

    if (error) {
        console.error("Error cargando carrito:", error);
        cart = readStoredCart(activeCartStorageKey);
        updateCart();
        return;
    }

    const userLocalCart = readStoredCart(activeCartStorageKey);
    const guestCart = readStoredCart(CART_GUEST_KEY);
    cart = mergeAuthenticatedCart(data || [], userLocalCart, guestCart);

    const synced = await syncCartRowsToSupabase(user, cart);
    saveCart();

    if (synced && guestCart.length) {
        localStorage.removeItem(CART_GUEST_KEY);
    }

    updateCart();
}

/* =====================================================
   PERSISTENCIA REMOTA
===================================================== */

async function saveItemToSupabase(productId, quantity) {
    const user = await getCartCurrentUser();
    if (!user) return;

    setCartStorageScope(user.id);

    const { error } = await supabaseClient
        .from("cart_items")
        .upsert({
            user_id: user.id,
            product_id: productId,
            quantity
        }, { onConflict: "user_id,product_id" });

    if (error) console.error("Error guardando carrito:", error);
}

async function removeItemFromSupabase(productId) {
    const user = await getCartCurrentUser();
    if (!user) return;

    const { error } = await supabaseClient
        .from("cart_items")
        .delete()
        .eq("user_id", user.id)
        .eq("product_id", productId);

    if (error) console.error("Error eliminando item:", error);
}

/* =====================================================
   OPERACIONES DEL CARRITO
===================================================== */

function addToCart(productId) {
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

    if (existing) existing.quantity += 1;
    else cart.push({ id, quantity: 1 });

    saveCart();
    updateCart();

    const currentItem = cart.find(item => item.id === id);
    saveItemToSupabase(id, currentItem.quantity);
    showToast(`${product.name} fue agregado al carrito.`);
}

function changeQuantity(productId, amount) {
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

    item.quantity = nextQuantity;

    if (item.quantity <= 0) {
        cart = cart.filter(row => row.id !== id);
        removeItemFromSupabase(id);
    } else {
        saveItemToSupabase(id, item.quantity);
    }

    saveCart();
    updateCart();
}

function removeFromCart(productId) {
    const id = Number(productId);
    cart = cart.filter(item => item.id !== id);
    removeItemFromSupabase(id);
    saveCart();
    updateCart();
}

function saveCart() {
    localStorage.setItem(activeCartStorageKey, JSON.stringify(normalizeCartRows(cart)));
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
    if (checkoutButton) checkoutButton.hidden = false;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <span>🌷</span>
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
                    <div class="quantity-controls">
                        <button onclick="changeQuantity(${item.id}, -1)" aria-label="Disminuir cantidad">−</button>
                        <span>${item.quantity}</span>
                        <button onclick="changeQuantity(${item.id}, 1)" aria-label="Aumentar cantidad">+</button>
                    </div>
                </div>
                <button class="remove-item" onclick="removeFromCart(${item.id})" title="Eliminar producto">🗑</button>
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
    if (cart.length === 0 && typeof renderActiveOrderInCart === "function") {
        if (!renderActiveOrderInCart()) updateCart();
    } else {
        updateCart();
    }
}

function closeCart() {
    document.getElementById("cartPanel")?.classList.remove("show");
}

async function checkout() {
    if (cart.length === 0) {
        showToast("Tu carrito está vacío.");
        return;
    }

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        closeCart();
        openAuth("login");
        showToast("Inicia sesión para continuar con tu compra.");
        return;
    }

    openCheckout(user);
}

function initializeCart() {
    document.getElementById("cartButton")?.addEventListener("click", openCart);
    updateCart();
    loadCartFromSupabase();
}
