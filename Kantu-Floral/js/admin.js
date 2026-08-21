/* KANTU FLORAL - PANEL ADMINISTRADOR */

const ADMIN_STATUSES = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"];
const ADMIN_CATEGORIES = ["ramos", "arreglos", "rosas", "especiales"];
const ADMIN_STATUS_LABELS = {
    pendiente: "Pendiente", confirmado: "Confirmado", preparando: "Preparando",
    en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado"
};
const ADMIN_ALLOWED_TRANSITIONS = {
    pendiente: ["confirmado", "cancelado"],
    confirmado: ["preparando", "cancelado"],
    preparando: ["en_camino", "cancelado"],
    en_camino: ["entregado"],
    entregado: [],
    cancelado: []
};
const ADMIN_STATUS_ERROR_MESSAGES = {
    AUTHENTICATION_REQUIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
    ADMIN_PERMISSION_REQUIRED: "No tienes permisos para actualizar pedidos.",
    ORDER_ID_REQUIRED: "El pedido no tiene un identificador válido.",
    ORDER_NOT_FOUND: "El pedido ya no existe o no está disponible.",
    INVALID_ORDER_STATUS: "El estado seleccionado no es válido.",
    INVALID_CURRENT_ORDER_STATUS: "El pedido tiene un estado actual no reconocido.",
    INVALID_STATUS_TRANSITION: "Ese cambio de estado no está permitido.",
    ORDER_ITEMS_EMPTY: "El pedido no contiene productos y no puede procesarse.",
    ORDER_PRODUCT_NOT_FOUND: "Uno de los productos del pedido ya no existe.",
    INSUFFICIENT_STOCK: "No hay stock suficiente para confirmar este pedido."
};

let adminOrders = [];
let adminProducts = [];
let adminAuthorizedUser = null;

function adminElement(id) { return document.getElementById(id); }

function adminEscape(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function adminMoney(value) {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value) || 0);
}

function adminDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function adminShortId(id) {
    const value = String(id || "");
    return value.length > 12 ? value.slice(0, 8).toUpperCase() : value;
}

function getAdminStatusErrorMessage(error) {
    const errorText = [error?.message, error?.details, error?.hint]
        .filter(Boolean)
        .join(" ")
        .toUpperCase();
    const errorKey = Object.keys(ADMIN_STATUS_ERROR_MESSAGES)
        .find(key => errorText.includes(key));
    return errorKey
        ? ADMIN_STATUS_ERROR_MESSAGES[errorKey]
        : "No pudimos actualizar el estado del pedido.";
}

function showAdminMessage(message, type = "error") {
    const element = adminElement("adminMessage");
    element.textContent = message;
    element.className = `admin-message ${type}`;
    element.hidden = false;
}

function clearAdminMessage() {
    const element = adminElement("adminMessage");
    element.hidden = true;
    element.textContent = "";
}

async function verifyAdminAccess() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return null;
    const { data: profile, error } = await supabaseClient.from("profiles")
        .select("role").eq("id", user.id).maybeSingle();
    if (error || profile?.role !== "admin") return null;
    return user;
}

async function openAdmin() {
    const modal = adminElement("adminModal");
    modal.classList.add("show");
    document.body.classList.add("admin-open");
    adminElement("adminContent").hidden = true;
    adminElement("adminAccessLoading").hidden = false;
    clearAdminMessage();

    adminAuthorizedUser = await verifyAdminAccess();
    adminElement("adminAccessLoading").hidden = true;

    if (!adminAuthorizedUser) {
        showAdminMessage("No tienes permisos para acceder a esta sección.");
        return;
    }

    if (typeof closeAccount === "function") closeAccount();
    document.body.classList.add("admin-open");
    adminElement("adminContent").hidden = false;
    switchAdminView("dashboard");
}

function closeAdmin() {
    adminElement("adminModal")?.classList.remove("show");
    document.body.classList.remove("admin-open");
    adminAuthorizedUser = null;
    clearAdminMessage();
}

function hideAdminViews() {
    document.querySelectorAll(".admin-view").forEach(view => { view.hidden = true; });
}

function switchAdminView(view) {
    if (!adminAuthorizedUser) return;
    hideAdminViews();
    document.querySelectorAll("[data-admin-view]").forEach(button =>
        button.classList.toggle("active", button.dataset.adminView === view));
    const target = adminElement(`admin${view.charAt(0).toUpperCase()}${view.slice(1)}View`);
    if (target) target.hidden = false;
    clearAdminMessage();
    if (view === "dashboard") loadAdminDashboard();
    if (view === "orders") loadAdminOrders();
    if (view === "products") loadAdminProducts();
}

async function loadAdminDashboard() {
    const loading = adminElement("adminDashboardLoading");
    const grid = adminElement("adminStatsGrid");
    loading.hidden = false;
    grid.innerHTML = "";
    const [ordersResult, productsResult] = await Promise.all([
        supabaseClient.from("orders").select("status, total"),
        supabaseClient.from("products").select("active, stock")
    ]);
    loading.hidden = true;
    if (ordersResult.error || productsResult.error) {
        console.error("Error cargando dashboard:", ordersResult.error || productsResult.error);
        showAdminMessage("No pudimos cargar las estadísticas del panel.");
        return;
    }
    const orders = ordersResult.data || [];
    const productRows = productsResult.data || [];
    const stats = [
        ["Total de pedidos", orders.length, "all"],
        ...ADMIN_STATUSES.map(status => [ADMIN_STATUS_LABELS[status], orders.filter(order => order.status === status).length, status]),
        ["Ventas no canceladas", adminMoney(orders.filter(order => order.status !== "cancelado").reduce((sum, order) => sum + (Number(order.total) || 0), 0)), "sales"],
        ["Productos activos", productRows.filter(product => product.active).length, "products"],
        ["Stock bajo", productRows.filter(product => Number(product.stock) <= 5).length, "stock"]
    ];
    grid.innerHTML = stats.map(([label, value, kind]) => `<article class="admin-stat-card stat-${kind}">
        <span>${adminEscape(label)}</span><strong>${adminEscape(value)}</strong></article>`).join("");
}

async function loadAdminOrders() {
    const loading = adminElement("adminOrdersLoading");
    loading.hidden = false;
    adminElement("adminOrdersList").innerHTML = "";
    adminElement("adminOrdersEmpty").hidden = true;
    const { data, error } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false });
    loading.hidden = true;
    if (error) {
        console.error("Error cargando pedidos admin:", error);
        showAdminMessage("No pudimos cargar los pedidos.");
        return;
    }
    adminOrders = data || [];
    renderAdminOrders();
}

function renderAdminOrders() {
    const filter = adminElement("adminOrderFilter").value;
    const search = adminElement("adminOrderSearch").value.trim().toLowerCase();
    const filtered = adminOrders.filter(order => {
        const matchesStatus = filter === "todos" || order.status === filter;
        const haystack = `${order.id || ""} ${order.customer_name || ""} ${order.customer_phone || ""}`.toLowerCase();
        return matchesStatus && (!search || haystack.includes(search));
    });
    adminElement("adminOrdersEmpty").hidden = filtered.length > 0;
    adminElement("adminOrdersList").innerHTML = filtered.map(order => {
        const transitions = ADMIN_ALLOWED_TRANSITIONS[order.status] || [];
        const statusControl = transitions.length
            ? `<label>Cambiar estado <select data-admin-status-id="${adminEscape(order.id)}" data-previous-status="${adminEscape(order.status)}">
                <option value="" selected disabled>Seleccionar...</option>
                ${transitions.map(status => `<option value="${status}">${ADMIN_STATUS_LABELS[status]}</option>`).join("")}
               </select></label>`
            : `<label class="admin-terminal-status">Estado terminal
                <select disabled aria-label="Estado terminal: ${adminEscape(ADMIN_STATUS_LABELS[order.status] || order.status)}">
                    <option>${adminEscape(ADMIN_STATUS_LABELS[order.status] || order.status)}</option>
                </select>
               </label>`;
        return `<article class="admin-order-card">
        <div class="admin-order-top"><div><small>Pedido</small><strong title="${adminEscape(order.id)}">#${adminEscape(adminShortId(order.id))}</strong></div>
        <span class="order-status status-${adminEscape(order.status)}">${adminEscape(ADMIN_STATUS_LABELS[order.status] || order.status)}</span></div>
        <div class="admin-order-grid"><p><span>Fecha</span>${adminEscape(adminDate(order.created_at))}</p>
        <p><span>Cliente</span>${adminEscape(order.customer_name || "No registrado")}</p>
        <p><span>Teléfono</span>${adminEscape(order.customer_phone || "No registrado")}</p>
        <p><span>Total</span><strong>${adminEscape(adminMoney(order.total))}</strong></p>
        <p class="admin-wide"><span>Dirección</span>${adminEscape(order.delivery_address || "No registrada")}</p></div>
        <div class="admin-order-actions">${statusControl}<button type="button" class="admin-link" data-admin-order-detail="${adminEscape(order.id)}">Ver detalle</button></div>
    </article>`;
    }).join("");
}

async function updateAdminOrderStatus(select) {
    const orderId = select.dataset.adminStatusId;
    const newStatus = select.value;
    const order = adminOrders.find(row => String(row.id) === String(orderId));
    const allowedTransitions = ADMIN_ALLOWED_TRANSITIONS[order?.status] || [];
    if (!order || !allowedTransitions.includes(newStatus)) {
        select.value = "";
        showAdminMessage("El cambio de estado solicitado no es válido.");
        return;
    }
    const previousStatus = order.status;
    select.disabled = true;
    clearAdminMessage();

    try {
        const { data, error } = await supabaseClient.rpc(
            "update_order_status",
            {
                p_order_id: String(orderId),
                p_new_status: newStatus
            }
        );

        if (error) {
            console.error("Error actualizando estado mediante RPC:", error);
            select.value = "";
            showAdminMessage(getAdminStatusErrorMessage(error));
            return;
        }

        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.order_id || !result.old_status || !result.new_status) {
            select.value = "";
            showAdminMessage("La actualización no devolvió un resultado válido.");
            return;
        }

        order.status = result.new_status;
        renderAdminOrders();

        const refreshTasks = [
            loadAdminOrders(),
            loadAdminDashboard(),
            loadAdminProducts()
        ];
        if (typeof loadProducts === "function") refreshTasks.push(loadProducts());
        await Promise.allSettled(refreshTasks);

        showAdminMessage(
            `Pedido actualizado de ${ADMIN_STATUS_LABELS[result.old_status] || result.old_status} a ${ADMIN_STATUS_LABELS[result.new_status] || result.new_status}.`,
            "success"
        );
    } catch (error) {
        console.error("Error inesperado actualizando estado:", error);
        order.status = previousStatus;
        select.value = "";
        renderAdminOrders();
        showAdminMessage("No pudimos actualizar el estado del pedido.");
    } finally {
        if (select.isConnected) select.disabled = false;
    }
}

async function openAdminOrderDetail(orderId) {
    hideAdminViews();
    const view = adminElement("adminOrderDetailView");
    const detail = adminElement("adminOrderDetail");
    view.hidden = false;
    detail.innerHTML = '<div class="admin-loader">Cargando detalle...</div>';
    const { data: items, error } = await supabaseClient.from("order_items").select("*").eq("order_id", orderId);
    if (error) {
        console.error("Error cargando detalle admin:", error);
        detail.innerHTML = "";
        showAdminMessage("No pudimos cargar el detalle del pedido.");
        return;
    }
    const productIds = [...new Set((items || []).map(item => item.product_id).filter(Boolean))];
    let productMap = new Map();
    if (productIds.length) {
        const result = await supabaseClient.from("products").select("id, name, image").in("id", productIds);
        if (result.error) console.error("Error cargando productos del detalle:", result.error);
        productMap = new Map((result.data || []).map(product => [String(product.id), product]));
    }
    detail.innerHTML = `<h3>Detalle del pedido #${adminEscape(adminShortId(orderId))}</h3><div class="admin-detail-items">
        ${(items || []).map(item => {
            const product = productMap.get(String(item.product_id)) || {};
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const image = product.image ? `<img src="${adminEscape(product.image)}" alt="${adminEscape(product.name || "Producto")}">` : '<div class="admin-image-placeholder">✿</div>';
            return `<article class="admin-detail-item">${image}<div><strong>${adminEscape(product.name || "Producto no disponible")}</strong>
                <span>Cantidad: ${quantity}</span><span>Precio histórico: ${adminEscape(adminMoney(unitPrice))}</span></div>
                <strong>${adminEscape(adminMoney(quantity * unitPrice))}</strong></article>`;
        }).join("") || '<div class="admin-empty">Este pedido no tiene productos.</div>'}</div>`;
}

async function loadAdminProducts() {
    const loading = adminElement("adminProductsLoading");
    loading.hidden = false;
    adminElement("adminProductsList").innerHTML = "";
    const { data, error } = await supabaseClient.from("products").select("*").order("id", { ascending: true });
    loading.hidden = true;
    if (error) {
        console.error("Error cargando productos admin:", error);
        showAdminMessage("No pudimos cargar los productos.");
        return;
    }
    adminProducts = data || [];
    renderAdminProducts();
}

function renderAdminProducts() {
    adminElement("adminProductsEmpty").hidden = adminProducts.length > 0;
    adminElement("adminProductsList").innerHTML = adminProducts.map(product => {
        const stock = Number(product.stock) || 0;
        const stockClass = stock === 0 ? "empty" : stock <= 5 ? "low" : "available";
        const stockLabel = stock === 0 ? "Agotado" : stock <= 5 ? "Stock bajo" : "Disponible";
        const image = product.image ? `<img src="${adminEscape(product.image)}" alt="${adminEscape(product.name)}">` : '<div class="admin-image-placeholder">✿</div>';
        return `<article class="admin-product-card">${image}<div class="admin-product-info"><div><span>${adminEscape(product.category)}</span>
            <h4>${adminEscape(product.name)}</h4></div><p>${adminEscape(adminMoney(product.price))} · Stock: ${stock}</p>
            <div class="admin-product-badges"><span class="stock-${stockClass}">${stockLabel}</span>
            <span>${product.active ? "Activo" : "Inactivo"}</span>${product.tag ? `<span>${adminEscape(product.tag)}</span>` : ""}</div></div>
            <div class="admin-product-actions"><button type="button" data-admin-edit-product="${adminEscape(product.id)}">Editar</button>
            <button type="button" class="danger" data-admin-delete-product="${adminEscape(product.id)}">Eliminar</button></div></article>`;
    }).join("");
}

function openAdminProductForm(product = null) {
    hideAdminViews();
    adminElement("adminProductFormView").hidden = false;
    adminElement("adminProductForm").reset();
    adminElement("adminProductFormTitle").textContent = product ? "Editar producto" : "Nuevo producto";
    adminElement("adminProductId").value = product?.id ?? "";
    adminElement("adminProductName").value = product?.name || "";
    adminElement("adminProductDescription").value = product?.description || "";
    adminElement("adminProductPrice").value = product?.price ?? "";
    adminElement("adminProductStock").value = product?.stock ?? 0;
    adminElement("adminProductCategory").value = product?.category || "ramos";
    adminElement("adminProductImage").value = product?.image || "";
    adminElement("adminProductTag").value = product?.tag || "";
    adminElement("adminProductActive").checked = product ? Boolean(product.active) : true;
    clearAdminMessage();
}

function readAdminProductForm() {
    const name = adminElement("adminProductName").value.trim();
    const description = adminElement("adminProductDescription").value.trim();
    const price = Number(adminElement("adminProductPrice").value);
    const stock = Number(adminElement("adminProductStock").value);
    const category = adminElement("adminProductCategory").value;
    const image = adminElement("adminProductImage").value.trim();
    const tag = adminElement("adminProductTag").value.trim();
    if (!name) throw new Error("El nombre es obligatorio.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("El precio debe ser mayor que cero.");
    if (!Number.isInteger(stock) || stock < 0) throw new Error("El stock debe ser un número entero mayor o igual que cero.");
    if (!ADMIN_CATEGORIES.includes(category)) throw new Error("Selecciona una categoría válida.");
    return { name, description: description || null, price, category, image: image || null, tag: tag || null, stock, active: adminElement("adminProductActive").checked };
}

async function saveAdminProduct(event) {
    event.preventDefault();
    let payload;
    try { payload = readAdminProductForm(); } catch (error) { showAdminMessage(error.message); return; }
    const id = adminElement("adminProductId").value;
    const button = adminElement("adminProductSaveButton");
    button.disabled = true;
    button.textContent = "Guardando...";
    const query = id
        ? supabaseClient.from("products").update(payload).eq("id", id)
        : supabaseClient.from("products").insert(payload);
    const { error } = await query;
    button.disabled = false;
    button.textContent = "Guardar producto";
    if (error) {
        console.error("Error guardando producto:", error);
        showAdminMessage("No pudimos guardar el producto. Revisa los datos.");
        return;
    }
    if (typeof loadProducts === "function") await loadProducts();
    switchAdminView("products");
    showAdminMessage(id ? "Producto actualizado correctamente." : "Producto creado correctamente.", "success");
}

async function deleteAdminProduct(productId) {
    const product = adminProducts.find(row => String(row.id) === String(productId));
    if (!product) return;
    const history = await supabaseClient.from("order_items").select("product_id").eq("product_id", productId).limit(1);
    if (history.error) {
        console.error("Error comprobando historial:", history.error);
        showAdminMessage("No pudimos comprobar el historial del producto; no se eliminó.");
        return;
    }
    if ((history.data || []).length) {
        if (!confirm(`“${product.name}” tiene pedidos históricos y no puede eliminarse. ¿Deseas desactivarlo?`)) return;
        const { error } = await supabaseClient.from("products").update({ active: false }).eq("id", productId);
        if (error) { showAdminMessage("No pudimos desactivar el producto."); return; }
        showAdminMessage("Producto desactivado para conservar el historial.", "success");
    } else {
        if (!confirm(`¿Eliminar definitivamente “${product.name}”? Esta acción no se puede deshacer.`)) return;
        const { error } = await supabaseClient.from("products").delete().eq("id", productId);
        if (error) { showAdminMessage("No pudimos eliminar el producto."); return; }
        showAdminMessage("Producto eliminado correctamente.", "success");
    }
    if (typeof loadProducts === "function") await loadProducts();
    await loadAdminProducts();
}

function initializeAdmin() {
    const modal = adminElement("adminModal");
    if (!modal) return;
    adminElement("accountAdminButton").addEventListener("click", openAdmin);
    adminElement("adminCloseButton").addEventListener("click", closeAdmin);
    document.querySelectorAll("[data-admin-view]").forEach(button =>
        button.addEventListener("click", () => switchAdminView(button.dataset.adminView)));
    document.querySelectorAll("[data-admin-refresh]").forEach(button =>
        button.addEventListener("click", () => button.dataset.adminRefresh === "dashboard" ? loadAdminDashboard() : loadAdminOrders()));
    adminElement("adminOrderSearch").addEventListener("input", renderAdminOrders);
    adminElement("adminOrderFilter").addEventListener("change", renderAdminOrders);
    adminElement("adminOrdersList").addEventListener("change", event => {
        if (event.target.matches("[data-admin-status-id]")) updateAdminOrderStatus(event.target);
    });
    adminElement("adminOrdersList").addEventListener("click", event => {
        const button = event.target.closest("[data-admin-order-detail]");
        if (button) openAdminOrderDetail(button.dataset.adminOrderDetail);
    });
    adminElement("adminBackToOrders").addEventListener("click", () => switchAdminView("orders"));
    adminElement("adminNewProductButton").addEventListener("click", () => openAdminProductForm());
    adminElement("adminProductsList").addEventListener("click", event => {
        const edit = event.target.closest("[data-admin-edit-product]");
        const remove = event.target.closest("[data-admin-delete-product]");
        if (edit) openAdminProductForm(adminProducts.find(row => String(row.id) === edit.dataset.adminEditProduct));
        if (remove) deleteAdminProduct(remove.dataset.adminDeleteProduct);
    });
    adminElement("adminProductForm").addEventListener("submit", saveAdminProduct);
    adminElement("adminProductCancelButton").addEventListener("click", () => switchAdminView("products"));
    adminElement("adminBackToProducts").addEventListener("click", () => switchAdminView("products"));
    modal.addEventListener("click", event => { if (event.target === modal) closeAdmin(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.classList.contains("show")) closeAdmin(); });
    supabaseClient.auth.onAuthStateChange(event => {
        if (event === "SIGNED_OUT" && modal.classList.contains("show")) closeAdmin();
    });
}

document.addEventListener("DOMContentLoaded", initializeAdmin);
