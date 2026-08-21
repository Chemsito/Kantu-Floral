/* KANTU FLORAL - MI CUENTA / MIS PEDIDOS */

const accountStatusLabels = {
    pendiente: "Pendiente", confirmado: "Confirmado", preparando: "Preparando",
    en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado"
};

let accountUser = null;
let accountProfile = null;
let accountOrdersLoaded = false;
let accountOrders = [];

const accountPaymentLabels = {
    pending: "Pendiente", approved: "Aprobado", rejected: "Rechazado"
};
const accountPaymentMethods = {
    mercadopago: "Mercado Pago", yape: "Yape / Plin", transferencia: "Transferencia bancaria"
};
const accountProofStatusLabels = {
    uploaded: "Comprobante recibido", verifying: "Estamos verificando tu pago",
    needs_review: "Tu comprobante requiere revisión", approved: "Pago aprobado",
    rejected: "Comprobante rechazado"
};

function accountElement(id) { return document.getElementById(id); }

function escapeAccountHtml(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function formatAccountMoney(value) {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })
        .format(Number(value) || 0);
}

function formatAccountDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function shortOrderId(id) {
    const value = String(id || "");
    return value.length > 12 ? value.slice(0, 8).toUpperCase() : value;
}

function showAccountMessage(message, type = "error") {
    const element = accountElement("accountMessage");
    if (!element) return;
    element.textContent = message;
    element.className = `account-message ${type}`;
    element.hidden = false;
}

function clearAccountMessage() {
    const element = accountElement("accountMessage");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
}

function renderAccountAvatar(profile, user) {
    const avatar = accountElement("accountAvatar");
    if (!avatar) return;
    const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
    const name = profile?.full_name || user?.user_metadata?.full_name || user?.email || "K";
    avatar.innerHTML = avatarUrl
        ? `<img src="${escapeAccountHtml(avatarUrl)}" alt="Avatar de ${escapeAccountHtml(name)}">`
        : escapeAccountHtml(name.trim().charAt(0).toUpperCase() || "K");
}

async function openAccount() {
    const modal = accountElement("accountModal");
    if (!modal) return;
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) {
        if (typeof openAuth === "function") openAuth("login");
        return;
    }
    accountUser = user;
    accountOrdersLoaded = false;
    modal.classList.add("show");
    document.body.classList.add("account-open");
    switchAccountTab("profile");
    await loadAccountProfile();
}

function closeAccount() {
    accountElement("accountModal")?.classList.remove("show");
    document.body.classList.remove("account-open");
    clearAccountMessage();
}

function switchAccountTab(tab) {
    const isProfile = tab === "profile";
    accountElement("accountProfileSection").hidden = !isProfile;
    accountElement("accountOrdersSection").hidden = isProfile;
    accountElement("accountOrderDetailSection").hidden = true;
    document.querySelectorAll("[data-account-tab]").forEach(button => {
        const active = button.dataset.accountTab === tab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
    });
    clearAccountMessage();
    if (!isProfile && !accountOrdersLoaded) loadAccountOrders();
}

async function loadAccountProfile() {
    const loading = accountElement("accountProfileLoading");
    const form = accountElement("accountProfileForm");
    loading.hidden = false;
    form.hidden = true;
    clearAccountMessage();
    const { data, error } = await supabaseClient.from("profiles").select("*")
        .eq("id", accountUser.id).maybeSingle();
    loading.hidden = true;
    if (error) {
        console.error("Error cargando perfil:", error);
        showAccountMessage("No pudimos cargar tu perfil. Inténtalo nuevamente.");
        return;
    }
    accountProfile = data || {};
    accountElement("accountFullName").value = accountProfile.full_name || accountUser.user_metadata?.full_name || "";
    accountElement("accountEmail").value = accountUser.email || accountProfile.email || "";
    accountElement("accountPhone").value = accountProfile.phone || "";
    accountElement("accountAddress").value = accountProfile.address || "";
    accountElement("accountDistrict").value = accountProfile.district || "";
    accountElement("accountCity").value = accountProfile.city || "";
    accountElement("accountHeaderEmail").textContent = accountUser.email || "";
    accountElement("accountAdminButton").hidden = accountProfile.role !== "admin";
    renderAccountAvatar(accountProfile, accountUser);
    form.hidden = false;
}

async function saveAccountProfile(event) {
    event.preventDefault();
    clearAccountMessage();
    const fullName = accountElement("accountFullName").value.trim();
    if (!fullName) return showAccountMessage("Ingresa tu nombre completo.");
    const button = accountElement("accountSaveButton");
    button.disabled = true;
    button.textContent = "Guardando...";
    const changes = {
        full_name: fullName,
        phone: accountElement("accountPhone").value.trim() || null,
        address: accountElement("accountAddress").value.trim() || null,
        district: accountElement("accountDistrict").value.trim() || null,
        city: accountElement("accountCity").value.trim() || null
    };
    const { data, error } = await supabaseClient.from("profiles").update(changes)
        .eq("id", accountUser.id).select().maybeSingle();
    button.disabled = false;
    button.textContent = "Guardar cambios";
    if (error) {
        console.error("Error actualizando perfil:", error);
        showAccountMessage("No pudimos guardar tus cambios. Revisa los datos e inténtalo otra vez.");
        return;
    }
    accountProfile = data || { ...accountProfile, ...changes };
    renderAccountAvatar(accountProfile, accountUser);
    showAccountMessage("Tus datos se guardaron correctamente.", "success");
    if (typeof updateUserButton === "function") updateUserButton();
}

async function loadAccountOrders() {
    const loading = accountElement("accountOrdersLoading");
    const empty = accountElement("accountOrdersEmpty");
    const list = accountElement("accountOrdersList");
    loading.hidden = false;
    empty.hidden = true;
    list.innerHTML = "";
    clearAccountMessage();
    const { data, error } = await supabaseClient.from("orders").select("*")
        .eq("user_id", accountUser.id)
        .order("created_at", { ascending: false });
    loading.hidden = true;
    if (error) {
        console.error("Error cargando pedidos:", error);
        showAccountMessage("No pudimos cargar tus pedidos. Inténtalo nuevamente.");
        return;
    }
    accountOrdersLoaded = true;
    const orders = data || [];
    accountOrders = orders;
    empty.hidden = orders.length > 0;
    list.innerHTML = orders.map(order => {
        const status = order.status || "pendiente";
        const label = accountStatusLabels[status] || status;
        return `<article class="account-order-card">
            <div class="account-order-heading"><div><span class="account-order-label">Pedido</span>
            <strong title="${escapeAccountHtml(order.id)}">#${escapeAccountHtml(shortOrderId(order.id))}</strong></div>
            <span class="order-status status-${escapeAccountHtml(status)}">${escapeAccountHtml(label)}</span></div>
            <div class="account-order-data">
            <p><span>Fecha</span>${escapeAccountHtml(formatAccountDate(order.created_at))}</p>
            <p><span>Total</span><strong>${escapeAccountHtml(formatAccountMoney(order.total))}</strong></p>
            <p><span>Cliente</span>${escapeAccountHtml(order.customer_name || "No registrado")}</p>
            <p><span>Teléfono</span>${escapeAccountHtml(order.customer_phone || "No registrado")}</p>
            <p class="account-order-address"><span>Dirección</span>${escapeAccountHtml(order.delivery_address || "No registrada")}</p></div>
            <button type="button" class="account-detail-button" data-order-id="${escapeAccountHtml(order.id)}">Ver detalle</button>
        </article>`;
    }).join("");
}

async function openOrderDetail(orderId) {
    accountElement("accountOrdersSection").hidden = true;
    const detailSection = accountElement("accountOrderDetailSection");
    const detail = accountElement("accountOrderDetail");
    detailSection.hidden = false;
    detail.innerHTML = '<div class="account-loading">Cargando el detalle...</div>';
    clearAccountMessage();
    const [itemsResult, proofResult] = await Promise.all([
        supabaseClient.from("order_items").select("*").eq("order_id", orderId),
        supabaseClient.from("payment_proofs")
            .select("payment_method, verification_status, verification_notes, uploaded_at, operation_number")
            .eq("order_id", orderId).order("uploaded_at", { ascending: false }).limit(1).maybeSingle()
    ]);
    if (itemsResult.error) {
        console.error("Error cargando detalle:", itemsResult.error);
        detail.innerHTML = "";
        showAccountMessage("No pudimos cargar el detalle de este pedido.");
        return;
    }
    if (proofResult.error) console.error("Error cargando comprobante del pedido:", proofResult.error);
    const items = itemsResult.data;
    const productIds = [...new Set((items || []).map(item => item.product_id).filter(Boolean))];
    let productsById = new Map();
    if (productIds.length) {
        const { data: rows, error: productsError } = await supabaseClient.from("products")
            .select("id, name, image").in("id", productIds);
        if (productsError) console.error("Error cargando productos del pedido:", productsError);
        productsById = new Map((rows || []).map(product => [String(product.id), product]));
    }
    const rows = items || [];
    const order = accountOrders.find(row => String(row.id) === String(orderId)) || {};
    const proof = proofResult.data;
    const paymentMethod = accountPaymentMethods[proof?.payment_method || order.payment_provider]
        || proof?.payment_method || order.payment_provider || "No seleccionado";
    const paymentStatus = accountPaymentLabels[order.payment_status] || order.payment_status || "Pendiente";
    const proofDetails = proof ? `<div class="account-payment-summary">
        <p><span>Método de pago</span><strong>${escapeAccountHtml(paymentMethod)}</strong></p>
        <p><span>Estado de pago</span><strong>${escapeAccountHtml(paymentStatus)}</strong></p>
        <p><span>Estado del comprobante</span><strong>${escapeAccountHtml(accountProofStatusLabels[proof.verification_status] || proof.verification_status)}</strong></p>
        <p><span>Fecha de subida</span>${escapeAccountHtml(formatAccountDate(proof.uploaded_at))}</p>
        ${proof.operation_number ? `<p><span>Número de operación</span>${escapeAccountHtml(proof.operation_number)}</p>` : ""}
        ${proof.verification_status === "rejected" && proof.verification_notes ? `<p class="account-payment-note"><span>Motivo del rechazo</span>${escapeAccountHtml(proof.verification_notes)}</p>` : ""}
    </div>` : `<div class="account-payment-summary"><p><span>Método de pago</span><strong>${escapeAccountHtml(paymentMethod)}</strong></p>
        <p><span>Estado de pago</span><strong>${escapeAccountHtml(paymentStatus)}</strong></p></div>`;
    detail.innerHTML = `<h3>Detalle del pedido <span>#${escapeAccountHtml(shortOrderId(orderId))}</span></h3>
        ${proofDetails}
        ${rows.length ? `<div class="account-order-items">${rows.map(item => {
            const product = productsById.get(String(item.product_id)) || {};
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const image = product.image
                ? `<img src="${escapeAccountHtml(product.image)}" alt="${escapeAccountHtml(product.name || "Producto")}">`
                : '<div class="account-product-placeholder">✿</div>';
            return `<article class="account-order-item">${image}<div class="account-order-item-info">
                <strong>${escapeAccountHtml(product.name || "Producto no disponible")}</strong><span>Cantidad: ${quantity}</span>
                <span>Precio unitario: ${escapeAccountHtml(formatAccountMoney(unitPrice))}</span></div>
                <strong class="account-item-subtotal">${escapeAccountHtml(formatAccountMoney(quantity * unitPrice))}</strong></article>`;
        }).join("")}</div>` : '<div class="account-empty"><p>Este pedido no tiene productos disponibles.</p></div>'}`;
}

function initializeAccount() {
    const modal = accountElement("accountModal");
    if (!modal) return;
    document.querySelectorAll("[data-account-tab]").forEach(button =>
        button.addEventListener("click", () => switchAccountTab(button.dataset.accountTab)));
    accountElement("accountProfileForm").addEventListener("submit", saveAccountProfile);
    accountElement("accountBackToOrders").addEventListener("click", () => switchAccountTab("orders"));
    accountElement("accountOrdersList").addEventListener("click", event => {
        const button = event.target.closest("[data-order-id]");
        if (button) openOrderDetail(button.dataset.orderId);
    });
    accountElement("accountLogoutButton").addEventListener("click", () => logout());
    modal.addEventListener("click", event => { if (event.target === modal) closeAccount(); });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("show")) closeAccount();
    });
}

document.addEventListener("DOMContentLoaded", initializeAccount);
