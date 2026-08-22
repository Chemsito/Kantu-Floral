/* KANTU FLORAL - MI CUENTA / MIS PEDIDOS */

const KANTU_ACCOUNT = window.KantuCore;
const accountStatusLabels = KANTU_ACCOUNT.orderStatusLabels;
const accountPaymentLabels = KANTU_ACCOUNT.paymentStatusLabels;
const accountPaymentMethods = KANTU_ACCOUNT.paymentMethodLabels;
const accountProofStatusLabels = KANTU_ACCOUNT.proofStatusLabels;
const accountElement = KANTU_ACCOUNT.element;
const escapeAccountHtml = KANTU_ACCOUNT.escapeHtml;
const formatAccountMoney = KANTU_ACCOUNT.formatMoney;
const formatAccountDate = KANTU_ACCOUNT.formatDate;
const shortOrderId = KANTU_ACCOUNT.shortId;

let accountUser = null;
let accountProfile = null;
let accountOrdersLoaded = false;
let accountOrders = [];

function ensureAccountCustomerExperienceStyles() {
    if (document.querySelector('link[data-kantu-customer-experience]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/customer-experience.css";
    link.dataset.kantuCustomerExperience = "true";
    document.head.appendChild(link);
}

function renderAccountDeliveryAddress(value, linkLabel = "Ver ubicación en Google Maps") {
    return KANTU_ACCOUNT.renderDeliveryAddress(value, linkLabel);
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

    const avatarUrl = profile?.avatar_url
        || user?.user_metadata?.avatar_url
        || user?.user_metadata?.picture;
    const name = profile?.full_name
        || user?.user_metadata?.full_name
        || user?.email
        || "K";

    avatar.innerHTML = avatarUrl
        ? `<img src="${escapeAccountHtml(avatarUrl)}" alt="Avatar de ${escapeAccountHtml(name)}">`
        : escapeAccountHtml(name.trim().charAt(0).toUpperCase() || "K");
}

function getOrderSubtotal(order, rows = []) {
    const stored = Number(order?.subtotal);
    if (Number.isFinite(stored) && stored >= 0) return stored;
    return rows.reduce((sum, item) =>
        sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);
}

function getOrderDeliveryFee(order) {
    const fee = Number(order?.delivery_fee);
    return Number.isFinite(fee) && fee >= 0 ? fee : 0;
}

function renderAccountPriceBreakdown(order, rows = []) {
    const subtotal = getOrderSubtotal(order, rows);
    const deliveryFee = getOrderDeliveryFee(order);
    const total = Number(order?.total) || (subtotal + deliveryFee);

    return `<div class="account-price-breakdown">
        <div><span>Productos</span><strong>${escapeAccountHtml(formatAccountMoney(subtotal))}</strong></div>
        <div><span>Delivery${order?.delivery_distance_km ? ` · ${escapeAccountHtml(Number(order.delivery_distance_km).toFixed(1))} km` : ""}</span><strong>${escapeAccountHtml(formatAccountMoney(deliveryFee))}</strong></div>
        <div class="total"><span>Total</span><strong>${escapeAccountHtml(formatAccountMoney(total))}</strong></div>
    </div>`;
}

async function openAccount() {
    const modal = accountElement("accountModal");
    if (!modal) return;

    ensureAccountCustomerExperienceStyles();

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

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", accountUser.id)
        .maybeSingle();

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

    const { data, error } = await supabaseClient
        .from("profiles")
        .update(changes)
        .eq("id", accountUser.id)
        .select()
        .maybeSingle();

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

    const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
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
        const deliveryFee = getOrderDeliveryFee(order);

        return `<article class="account-order-card">
            <div class="account-order-heading">
                <div>
                    <span class="account-order-label">Pedido</span>
                    <strong title="${escapeAccountHtml(order.id)}">#${escapeAccountHtml(shortOrderId(order.id))}</strong>
                </div>
                <span class="order-status status-${escapeAccountHtml(status)}">${escapeAccountHtml(label)}</span>
            </div>
            <div class="account-order-data">
                <p><span>Fecha</span>${escapeAccountHtml(formatAccountDate(order.created_at))}</p>
                <p><span>Total</span><strong>${escapeAccountHtml(formatAccountMoney(order.total))}</strong></p>
                <p><span>Delivery</span>${escapeAccountHtml(formatAccountMoney(deliveryFee))}${order.delivery_distance_km ? ` · ${escapeAccountHtml(Number(order.delivery_distance_km).toFixed(1))} km` : ""}</p>
                <p><span>Cliente</span>${escapeAccountHtml(order.customer_name || "No registrado")}</p>
                <p><span>Teléfono / WhatsApp</span>${escapeAccountHtml(order.customer_phone || "No registrado")}</p>
                <p class="account-order-address"><span>Ubicación de entrega</span>${renderAccountDeliveryAddress(order.delivery_address)}</p>
            </div>
            <div class="account-order-actions-row">
                <button type="button" class="account-detail-button" data-order-id="${escapeAccountHtml(order.id)}">Ver detalle</button>
                <button type="button" class="account-receipt-button" data-order-receipt="${escapeAccountHtml(order.id)}">Boleta / resumen</button>
            </div>
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

    const [itemsResult, proofResult] = await Promise.allSettled([
        KANTU_ACCOUNT.fetchOrderItemsWithProducts(orderId),
        KANTU_ACCOUNT.fetchLatestPaymentProof(orderId)
    ]);

    if (itemsResult.status === "rejected") {
        console.error("Error cargando detalle:", itemsResult.reason);
        detail.innerHTML = "";
        showAccountMessage("No pudimos cargar el detalle de este pedido.");
        return;
    }

    if (proofResult.status === "rejected") {
        console.error("Error cargando comprobante del pedido:", proofResult.reason);
    }

    const rows = itemsResult.value || [];
    const proof = proofResult.status === "fulfilled" ? proofResult.value : null;
    const order = accountOrders.find(row => String(row.id) === String(orderId)) || {};
    const paymentMethod = accountPaymentMethods[proof?.payment_method || order.payment_provider]
        || proof?.payment_method
        || order.payment_provider
        || "No seleccionado";
    const paymentStatus = accountPaymentLabels[order.payment_status]
        || order.payment_status
        || "Pendiente";

    const proofDetails = proof
        ? `<div class="account-payment-summary">
            <p><span>Método de pago</span><strong>${escapeAccountHtml(paymentMethod)}</strong></p>
            <p><span>Estado de pago</span><strong>${escapeAccountHtml(paymentStatus)}</strong></p>
            <p><span>Estado del comprobante</span><strong>${escapeAccountHtml(accountProofStatusLabels[proof.verification_status] || proof.verification_status)}</strong></p>
            <p><span>Fecha de subida</span>${escapeAccountHtml(formatAccountDate(proof.uploaded_at))}</p>
            ${proof.operation_number
                ? `<p><span>Número de operación</span>${escapeAccountHtml(proof.operation_number)}</p>`
                : ""}
            ${proof.verification_status === "rejected" && proof.verification_notes
                ? `<p class="account-payment-note"><span>Motivo del rechazo</span>${escapeAccountHtml(proof.verification_notes)}</p>`
                : ""}
        </div>`
        : `<div class="account-payment-summary">
            <p><span>Método de pago</span><strong>${escapeAccountHtml(paymentMethod)}</strong></p>
            <p><span>Estado de pago</span><strong>${escapeAccountHtml(paymentStatus)}</strong></p>
        </div>`;

    const hasActiveProof = proof && ["uploaded", "verifying", "needs_review"].includes(proof.verification_status);
    const canContinuePayment = order.status === "pendiente"
        && order.payment_status === "pending"
        && !hasActiveProof
        && proof?.verification_status !== "approved";

    const paymentAction = canContinuePayment
        ? `<div class="account-payment-action">
            <p>${proof?.verification_status === "rejected" ? "Puedes enviar un comprobante nuevo" : "Pago pendiente"}</p>
            <button type="button" class="btn btn-primary" data-continue-payment="${escapeAccountHtml(orderId)}"${proof?.verification_status === "rejected" ? ' data-retry-manual="true"' : ""}>
                ${proof?.verification_status === "rejected" ? "Subir nuevo comprobante" : "Continuar pago"}
            </button>
        </div>`
        : "";

    const customerState = typeof getCustomerOrderState === "function"
        ? getCustomerOrderState(order, proof)
        : { key: order.status || "pending", label: accountStatusLabels[order.status] || order.status };
    const tracker = typeof renderCustomerOrderTracker === "function"
        ? renderCustomerOrderTracker(order)
        : "";

    detail.innerHTML = `<h3>Detalle del pedido <span>#${escapeAccountHtml(shortOrderId(orderId))}</span></h3>
        <div class="account-order-main-state state-${escapeAccountHtml(customerState.key)}">${escapeAccountHtml(customerState.label)}</div>
        ${tracker}
        ${paymentAction}
        <div class="account-order-actions-row">
            <button type="button" class="account-receipt-button" data-order-receipt="${escapeAccountHtml(orderId)}">Ver / imprimir boleta</button>
        </div>
        <h4 class="account-detail-heading">Resumen de compra</h4>
        ${renderAccountPriceBreakdown(order, rows)}
        <h4 class="account-detail-heading">Productos</h4>
        ${rows.length
            ? `<div class="account-order-items">${rows.map(item => {
                const product = item.product || {};
                const quantity = Number(item.quantity) || 0;
                const unitPrice = Number(item.unit_price) || 0;
                const image = product.image
                    ? `<img src="${escapeAccountHtml(product.image)}" alt="${escapeAccountHtml(product.name || "Producto")}">`
                    : '<div class="account-product-placeholder">✿</div>';

                return `<article class="account-order-item">
                    ${image}
                    <div class="account-order-item-info">
                        <strong>${escapeAccountHtml(product.name || "Producto no disponible")}</strong>
                        <span>Cantidad: ${quantity}</span>
                        <span>Precio unitario: ${escapeAccountHtml(formatAccountMoney(unitPrice))}</span>
                    </div>
                    <strong class="account-item-subtotal">${escapeAccountHtml(formatAccountMoney(quantity * unitPrice))}</strong>
                </article>`;
            }).join("")}</div>`
            : '<div class="account-empty"><p>Este pedido no tiene productos disponibles.</p></div>'}
        <h4 class="account-detail-heading">Pago</h4>
        ${proofDetails}
        <h4 class="account-detail-heading">Entrega</h4>
        <div class="account-delivery-summary">
            <p><span>Cliente</span>${escapeAccountHtml(order.customer_name || "No registrado")}</p>
            <p><span>Teléfono / WhatsApp</span>${escapeAccountHtml(order.customer_phone || "No registrado")}</p>
            <p><span>Delivery</span>${escapeAccountHtml(formatAccountMoney(getOrderDeliveryFee(order)))}${order.delivery_distance_km ? ` · ${escapeAccountHtml(Number(order.delivery_distance_km).toFixed(1))} km` : ""}${order.estimated_delivery_minutes ? ` · ${escapeAccountHtml(order.estimated_delivery_minutes)} min aprox.` : ""}</p>
            <p><span>Ubicación</span>${renderAccountDeliveryAddress(order.delivery_address)}</p>
        </div>
        <p class="account-receipt-note">La “boleta / resumen” disponible aquí es un documento informativo del pedido. No reemplaza una boleta electrónica tributaria emitida mediante SUNAT.</p>`;
}

function buildReceiptHtml(order, rows) {
    const subtotal = getOrderSubtotal(order, rows);
    const deliveryFee = getOrderDeliveryFee(order);
    const total = Number(order.total) || (subtotal + deliveryFee);
    const paymentMethod = accountPaymentMethods[order.payment_provider]
        || order.payment_provider
        || "No registrado";
    const paymentStatus = accountPaymentLabels[order.payment_status]
        || order.payment_status
        || "Pendiente";
    const delivery = KANTU_ACCOUNT.parseDeliveryAddress(order.delivery_address);
    const receiptDate = order.paid_at || order.created_at;

    const itemRows = rows.map(item => {
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        const name = item.product?.name || "Producto";
        return `<tr>
            <td>${escapeAccountHtml(name)}</td>
            <td class="number">${quantity}</td>
            <td class="number">${escapeAccountHtml(formatAccountMoney(unitPrice))}</td>
            <td class="number">${escapeAccountHtml(formatAccountMoney(quantity * unitPrice))}</td>
        </tr>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pedido #${escapeAccountHtml(order.id)} | Kantu Floral</title>
<style>
    *{box-sizing:border-box}body{margin:0;background:#f6f2f0;color:#2f2a28;font-family:Arial,sans-serif;padding:24px}.receipt{max-width:760px;margin:auto;background:#fff;border:1px solid #e6deda;border-radius:18px;padding:32px;box-shadow:0 16px 40px rgba(50,30,30,.08)}.brand{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #8b2f45;padding-bottom:18px}.brand h1{margin:0;color:#8b2f45;font-family:Georgia,serif}.brand p{margin:5px 0 0;color:#776c67}.doc-title{text-align:right}.doc-title strong{display:block;font-size:18px}.doc-title span{color:#776c67;font-size:12px}.notice{margin:18px 0;padding:10px 12px;border-radius:10px;background:#fff5df;color:#745319;font-size:12px;line-height:1.45}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.meta div{padding:10px;border:1px solid #eee4e1;border-radius:10px}.meta span{display:block;color:#776c67;font-size:11px;margin-bottom:4px}.meta strong{font-size:13px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:10px 8px;border-bottom:1px solid #eee4e1;text-align:left;font-size:13px}th{color:#776c67;font-size:11px;text-transform:uppercase}.number{text-align:right}.totals{width:min(360px,100%);margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:8px 0}.totals .total{border-top:2px solid #8b2f45;margin-top:5px;padding-top:12px;color:#8b2f45;font-size:18px;font-weight:700}.delivery{margin-top:22px;padding:14px;background:#fff8f4;border-radius:12px}.delivery h3{margin:0 0 8px;font-size:14px}.delivery p{margin:4px 0;color:#5f5753;font-size:12px;line-height:1.45}.footer{text-align:center;margin-top:28px;padding-top:18px;border-top:1px solid #eee4e1;color:#776c67;font-size:12px;line-height:1.5}.actions{max-width:760px;margin:14px auto 0;display:flex;justify-content:flex-end}.actions button{border:0;border-radius:10px;background:#8b2f45;color:#fff;padding:11px 16px;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}.receipt{box-shadow:none;border:0;padding:0}.actions{display:none}}@media(max-width:600px){body{padding:10px}.receipt{padding:20px}.brand{flex-direction:column}.doc-title{text-align:left}.meta{grid-template-columns:1fr}th:nth-child(3),td:nth-child(3){display:none}}
</style>
</head>
<body>
<main class="receipt">
    <header class="brand">
        <div>
            <h1>Kantu Floral</h1>
            <p>Una marca de <strong>GRUPO TENNO</strong></p>
        </div>
        <div class="doc-title">
            <strong>BOLETA / RESUMEN DE COMPRA</strong>
            <span>Pedido #${escapeAccountHtml(shortOrderId(order.id))}</span>
        </div>
    </header>

    <div class="notice">Documento informativo del pedido para el cliente. No constituye una boleta electrónica tributaria ni reemplaza un comprobante emitido mediante SUNAT.</div>

    <section class="meta">
        <div><span>Fecha</span><strong>${escapeAccountHtml(formatAccountDate(receiptDate))}</strong></div>
        <div><span>Estado del pago</span><strong>${escapeAccountHtml(paymentStatus)}</strong></div>
        <div><span>Cliente</span><strong>${escapeAccountHtml(order.customer_name || accountProfile?.full_name || "Cliente Kantu")}</strong></div>
        <div><span>Método de pago</span><strong>${escapeAccountHtml(paymentMethod)}</strong></div>
    </section>

    <table>
        <thead><tr><th>Producto</th><th class="number">Cant.</th><th class="number">P. unit.</th><th class="number">Importe</th></tr></thead>
        <tbody>${itemRows || '<tr><td colspan="4">Sin productos disponibles.</td></tr>'}</tbody>
    </table>

    <section class="totals">
        <div><span>Subtotal productos</span><strong>${escapeAccountHtml(formatAccountMoney(subtotal))}</strong></div>
        <div><span>Delivery${order.delivery_distance_km ? ` (${escapeAccountHtml(Number(order.delivery_distance_km).toFixed(1))} km)` : ""}</span><strong>${escapeAccountHtml(formatAccountMoney(deliveryFee))}</strong></div>
        <div class="total"><span>Total</span><strong>${escapeAccountHtml(formatAccountMoney(total))}</strong></div>
    </section>

    <section class="delivery">
        <h3>Entrega</h3>
        ${order.customer_phone ? `<p><strong>Teléfono / WhatsApp:</strong> ${escapeAccountHtml(order.customer_phone)}</p>` : ""}
        ${delivery.reference ? `<p><strong>Referencia:</strong> ${escapeAccountHtml(delivery.reference)}</p>` : ""}
        ${order.estimated_delivery_minutes ? `<p><strong>Tiempo de reparto estimado al crear el pedido:</strong> ${escapeAccountHtml(order.estimated_delivery_minutes)} min aprox.</p>` : ""}
    </section>

    <footer class="footer">Gracias por confiar en Kantu Floral.<br>Kantu Floral · GRUPO TENNO</footer>
</main>
<div class="actions"><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button></div>
</body>
</html>`;
}

async function openOrderReceipt(orderId) {
    const order = accountOrders.find(row => String(row.id) === String(orderId));
    if (!order) {
        showAccountMessage("No encontramos ese pedido para generar el resumen.");
        return;
    }

    const receiptWindow = window.open("", "_blank", "width=820,height=900");
    if (!receiptWindow) {
        showAccountMessage("Tu navegador bloqueó la ventana de la boleta. Permite ventanas emergentes e inténtalo nuevamente.");
        return;
    }

    receiptWindow.document.write("<p style='font-family:Arial;padding:24px'>Preparando tu boleta / resumen...</p>");

    try {
        const rows = await KANTU_ACCOUNT.fetchOrderItemsWithProducts(orderId);
        receiptWindow.document.open();
        receiptWindow.document.write(buildReceiptHtml(order, rows || []));
        receiptWindow.document.close();
    } catch (error) {
        console.error("Error preparando boleta:", error);
        receiptWindow.document.open();
        receiptWindow.document.write("<p style='font-family:Arial;padding:24px'>No pudimos preparar el resumen de este pedido.</p>");
        receiptWindow.document.close();
    }
}

async function openAccountOrder(orderId) {
    await openAccount();
    if (!accountUser) return;

    accountOrdersLoaded = true;
    switchAccountTab("orders");
    await loadAccountOrders();

    if (orderId && accountOrders.some(order => String(order.id) === String(orderId))) {
        await openOrderDetail(orderId);
    }
}

function continueAccountOrderPayment(orderId, retryManual = false) {
    const order = accountOrders.find(row => String(row.id) === String(orderId));

    if (!order || order.status !== "pendiente" || order.payment_status !== "pending") {
        showAccountMessage("Este pedido ya no está disponible para continuar el pago.");
        return;
    }

    if (typeof openPaymentOptionsForOrder !== "function") {
        showAccountMessage("No pudimos abrir las opciones de pago.");
        return;
    }

    closeAccount();

    if (!openPaymentOptionsForOrder(order)) {
        showAccountMessage("No pudimos abrir las opciones de pago.");
        return;
    }

    if (retryManual) {
        window.setTimeout(() => accountElement("manualPaymentButton")?.click(), 0);
    }
}

function initializeAccount() {
    const modal = accountElement("accountModal");
    if (!modal) return;

    ensureAccountCustomerExperienceStyles();

    document.querySelectorAll("[data-account-tab]").forEach(button =>
        button.addEventListener("click", () => switchAccountTab(button.dataset.accountTab))
    );

    accountElement("accountProfileForm")?.addEventListener("submit", saveAccountProfile);
    accountElement("accountBackToOrders")?.addEventListener("click", () => switchAccountTab("orders"));

    accountElement("accountOrdersList")?.addEventListener("click", event => {
        const receiptButton = event.target.closest("[data-order-receipt]");
        if (receiptButton) {
            openOrderReceipt(receiptButton.dataset.orderReceipt);
            return;
        }
        const button = event.target.closest("[data-order-id]");
        if (button) openOrderDetail(button.dataset.orderId);
    });

    accountElement("accountOrderDetail")?.addEventListener("click", event => {
        const receiptButton = event.target.closest("[data-order-receipt]");
        if (receiptButton) {
            openOrderReceipt(receiptButton.dataset.orderReceipt);
            return;
        }

        const button = event.target.closest("[data-continue-payment]");
        if (button) {
            continueAccountOrderPayment(
                button.dataset.continuePayment,
                button.dataset.retryManual === "true"
            );
        }
    });

    accountElement("accountLogoutButton")?.addEventListener("click", () => logout());

    modal.addEventListener("click", event => {
        if (event.target === modal) closeAccount();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("show")) closeAccount();
    });
}

document.addEventListener("DOMContentLoaded", initializeAccount);
