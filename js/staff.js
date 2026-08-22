/* KANTU FLORAL - PORTAL OPERATIVO */

const KANTU_STAFF = window.KantuCore;
const staffElement = KANTU_STAFF.element;
const staffEscape = KANTU_STAFF.escapeHtml;
const staffMoney = KANTU_STAFF.formatMoney;
const staffShortId = KANTU_STAFF.shortId;

const STAFF_ROLE_LABELS = {
    admin: "Administrador",
    florist: "Florista",
    delivery: "Delivery",
    customer: "Cliente"
};

const STAFF_ACTION_ERRORS = {
    STAFF_PERMISSION_REQUIRED: "No tienes permisos para realizar esta acción.",
    FLORIST_PERMISSION_REQUIRED: "Esta acción corresponde a Florista o Administrador.",
    DELIVERY_PERMISSION_REQUIRED: "Esta acción corresponde a Delivery o Administrador.",
    ORDER_NOT_READY_FOR_PREPARATION: "Este pedido todavía no está listo para iniciar preparación.",
    ORDER_NOT_IN_PREPARATION: "Este pedido no está en preparación.",
    ORDER_NOT_READY_FOR_DELIVERY: "El pedido todavía no fue marcado como listo para delivery.",
    ORDER_NOT_IN_DELIVERY: "Este pedido no está en camino.",
    PAYMENT_NOT_APPROVED: "El pago de este pedido todavía no está aprobado.",
    ORDER_NOT_FOUND: "El pedido ya no está disponible."
};

let staffUser = null;
let staffProfile = null;
let staffOrders = [];
let staffRefreshTimer = null;
let staffClockTimer = null;
let staffBusy = false;

function withTimeout(promise, milliseconds, code = "TIMEOUT") {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error(code)), milliseconds);
        })
    ]);
}

function staffErrorText(error) {
    return KANTU_STAFF.errorText(error);
}

function staffActionError(error) {
    const text = staffErrorText(error);
    const key = Object.keys(STAFF_ACTION_ERRORS).find(code => text.includes(code));
    return key ? STAFF_ACTION_ERRORS[key] : "No pudimos actualizar el pedido.";
}

function showStaffMessage(message, type = "error") {
    const element = staffElement("staffMessage");
    if (!element) return;
    element.textContent = message;
    element.className = `staff-message ${type}`;
    element.hidden = false;
}

function clearStaffMessage() {
    const element = staffElement("staffMessage");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
}

function setAccessFailure(message) {
    staffElement("staffAccessLoader").hidden = true;
    staffElement("staffAccessTitle").textContent = "No pudimos verificar tu acceso";
    staffElement("staffAccessMessage").textContent = message;
    staffElement("staffRetryAccess").hidden = false;
}

function resetAccessView() {
    staffElement("staffAccess").hidden = false;
    staffElement("staffDenied").hidden = true;
    staffElement("staffApp").hidden = true;
    staffElement("staffAccessLoader").hidden = false;
    staffElement("staffAccessTitle").textContent = "Preparando tu panel";
    staffElement("staffAccessMessage").textContent = "Estamos verificando tu sesión y tus permisos.";
    staffElement("staffRetryAccess").hidden = true;
}

function showDenied(message) {
    staffElement("staffAccess").hidden = true;
    staffElement("staffApp").hidden = true;
    staffElement("staffDenied").hidden = false;
    if (message) staffElement("staffDeniedMessage").textContent = message;
}

function minutesBetween(start, end = Date.now()) {
    if (!start) return 0;
    const timestamp = new Date(start).getTime();
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(0, Math.floor((end - timestamp) / 60000));
}

function formatWaiting(start) {
    const minutes = minutesBetween(start);
    if (minutes < 1) return "Ahora";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} h ${rest} min`;
}

function formatClockTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-PE", {
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formatDateTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-PE", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}

function roleCanFlorist() {
    return ["admin", "florist"].includes(staffProfile?.role);
}

function roleCanDelivery() {
    return ["admin", "delivery"].includes(staffProfile?.role);
}

function getPreparationOrders() {
    return staffOrders.filter(order =>
        order.status === "confirmado"
        || (order.status === "preparando" && !order.ready_for_delivery_at)
    );
}

function getDeliveryOrders() {
    return staffOrders.filter(order =>
        (order.status === "preparando" && Boolean(order.ready_for_delivery_at))
        || order.status === "en_camino"
        || order.status === "entregado"
    );
}

function computePreparationEtas(orders) {
    const queue = [...orders].sort((a, b) =>
        (Number(a.queue_position) || 9999) - (Number(b.queue_position) || 9999)
    );

    let cursor = Date.now();
    queue.forEach(order => {
        let readyAt;
        if (order.prep_started_at) {
            readyAt = Math.max(
                cursor,
                new Date(order.prep_started_at).getTime() + (30 * 60000)
            );
        } else {
            readyAt = cursor + (30 * 60000);
        }
        order._estimatedReadyAt = readyAt;
        cursor = readyAt;
    });
}

function getOrderStatus(order) {
    if (order.status === "entregado") return { label: "Entregado", className: "ready" };
    if (order.status === "en_camino") return { label: "En camino", className: "delivery" };
    if (order.ready_for_delivery_at) return { label: "Listo para delivery", className: "ready" };
    if (order.status === "preparando") return { label: "Preparando", className: "" };
    return { label: "En cola", className: "" };
}

function getGoogleMapsUrl(address) {
    return KANTU_STAFF.parseDeliveryAddress(address).mapsUrl || "";
}

function renderPreparationActions(order) {
    if (!roleCanFlorist()) return "";

    if (order.status === "confirmado") {
        return `<button type="button" class="staff-action-button" data-staff-action="start_preparation" data-order-id="${staffEscape(order.order_id)}">Empezar preparación</button>`;
    }

    if (order.status === "preparando" && !order.ready_for_delivery_at) {
        return `<button type="button" class="staff-action-button" data-staff-action="mark_ready" data-order-id="${staffEscape(order.order_id)}">Listo para delivery</button>`;
    }

    return "";
}

function renderDeliveryActions(order) {
    if (!roleCanDelivery()) return "";

    if (order.status === "preparando" && order.ready_for_delivery_at) {
        return `<button type="button" class="staff-action-button delivery" data-staff-action="start_delivery" data-order-id="${staffEscape(order.order_id)}">Iniciar reparto</button>`;
    }

    if (order.status === "en_camino") {
        return `<button type="button" class="staff-action-button delivery" data-staff-action="mark_delivered" data-order-id="${staffEscape(order.order_id)}">Marcar entregado</button>`;
    }

    return "";
}

function renderOrderCard(order, mode) {
    const status = getOrderStatus(order);
    const waitingMinutes = minutesBetween(order.paid_at);
    const urgent = waitingMinutes >= 60 && order.status !== "entregado";
    const mapsUrl = getGoogleMapsUrl(order.delivery_address);
    const items = Array.isArray(order.items) ? order.items : [];
    const reference = KANTU_STAFF.parseDeliveryAddress(order.delivery_address).reference;
    const eta = order._estimatedReadyAt
        ? `${formatClockTime(order._estimatedReadyAt)} · faltan aprox. ${Math.max(0, Math.ceil((order._estimatedReadyAt - Date.now()) / 60000))} min`
        : order.ready_for_delivery_at
            ? `Listo desde ${formatClockTime(order.ready_for_delivery_at)}`
            : "—";
    const actions = mode === "preparation"
        ? renderPreparationActions(order)
        : renderDeliveryActions(order);

    return `<article class="staff-order-card${urgent ? " urgent" : ""}">
        <div class="staff-order-top">
            <div class="staff-order-id">
                <small>Pedido</small>
                <strong>#${staffEscape(staffShortId(order.order_id))}</strong>
            </div>
            <span class="staff-status ${status.className}">${staffEscape(status.label)}</span>
        </div>
        <div class="staff-order-body">
            <div>
                <div class="staff-order-metrics">
                    <div class="staff-metric">
                        <span>Cliente esperando desde el pago</span>
                        <strong class="staff-waiting${urgent ? " urgent" : ""}" data-waiting-since="${staffEscape(order.paid_at || "")}">${staffEscape(formatWaiting(order.paid_at))}</strong>
                    </div>
                    <div class="staff-metric">
                        <span>${mode === "preparation" ? "Cola / listo estimado" : "Tiempo de reparto"}</span>
                        <strong>${mode === "preparation"
                            ? (order.queue_position ? `#${staffEscape(order.queue_position)} · ${staffEscape(eta)}` : staffEscape(eta))
                            : `${staffEscape(order.estimated_delivery_minutes || "—")} min aprox.`}</strong>
                    </div>
                    <div class="staff-metric">
                        <span>Distancia / delivery cobrado</span>
                        <strong>${staffEscape(Number(order.delivery_distance_km || 0).toFixed(1))} km · ${staffEscape(staffMoney(order.delivery_fee))}</strong>
                    </div>
                </div>

                <div class="staff-items">
                    ${items.map(item => {
                        const image = item.image
                            ? `<img src="${staffEscape(item.image)}" alt="${staffEscape(item.name || "Producto")}">`
                            : '<div class="staff-item-placeholder">✿</div>';
                        return `<div class="staff-item">
                            ${image}
                            <div><strong>${staffEscape(item.name || "Producto")}</strong><small>Cantidad: ${staffEscape(item.quantity || 0)}</small></div>
                            <strong>${staffEscape(staffMoney((Number(item.unit_price) || 0) * (Number(item.quantity) || 0)))}</strong>
                        </div>`;
                    }).join("") || '<div class="staff-info-box">No hay productos disponibles para mostrar.</div>'}
                </div>
            </div>

            <aside class="staff-side">
                <div class="staff-info-box">
                    <span>Pago recibido</span>
                    <strong>${staffEscape(formatDateTime(order.paid_at))}</strong>
                </div>
                <div class="staff-info-box">
                    <span>Total del pedido</span>
                    <strong>${staffEscape(staffMoney(order.total))}</strong>
                    <small>Incluye ${staffEscape(staffMoney(order.delivery_fee))} de delivery.</small>
                </div>
                ${order.customer_name ? `<div class="staff-info-box"><span>Cliente</span><strong>${staffEscape(order.customer_name)}</strong>${order.customer_phone ? `<a href="https://wa.me/${staffEscape(String(order.customer_phone).replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">WhatsApp: ${staffEscape(order.customer_phone)}</a>` : ""}</div>` : ""}
                ${mapsUrl ? `<div class="staff-info-box"><span>Ubicación de entrega</span><strong>${staffEscape(Number(order.delivery_distance_km || 0).toFixed(1))} km aprox.</strong><a href="${staffEscape(mapsUrl)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>${reference ? `<small>Referencia: ${staffEscape(reference)}</small>` : ""}</div>` : ""}
                ${actions ? `<div class="staff-actions">${actions}</div>` : ""}
            </aside>
        </div>
    </article>`;
}

function renderStaffOrders() {
    const preparation = getPreparationOrders();
    const delivery = getDeliveryOrders();
    computePreparationEtas(preparation);

    const preparationContainer = staffElement("staffPreparationOrders");
    const deliveryContainer = staffElement("staffDeliveryOrders");
    const preparationEmpty = staffElement("staffPreparationEmpty");
    const deliveryEmpty = staffElement("staffDeliveryEmpty");

    if (preparationContainer) {
        preparationContainer.innerHTML = preparation.map(order => renderOrderCard(order, "preparation")).join("");
    }
    if (deliveryContainer) {
        deliveryContainer.innerHTML = delivery.map(order => renderOrderCard(order, "delivery")).join("");
    }
    if (preparationEmpty) preparationEmpty.hidden = preparation.length > 0;
    if (deliveryEmpty) deliveryEmpty.hidden = delivery.length > 0;

    renderStaffStats(preparation, delivery);
}

function renderStaffStats(preparation = getPreparationOrders(), delivery = getDeliveryOrders()) {
    const stats = staffElement("staffStats");
    if (!stats) return;

    const ready = delivery.filter(order => order.status === "preparando").length;
    const onWay = delivery.filter(order => order.status === "en_camino").length;
    const active = [...preparation, ...delivery].filter(order => order.status !== "entregado");
    const longest = active.reduce((max, order) => Math.max(max, minutesBetween(order.paid_at)), 0);

    stats.innerHTML = [
        ["En preparación / cola", preparation.length],
        ["Listos para delivery", ready],
        ["En camino", onWay],
        ["Mayor espera", `${longest} min`]
    ].map(([label, value]) => `<div class="staff-stat"><span>${staffEscape(label)}</span><strong>${staffEscape(value)}</strong></div>`).join("");
}

async function loadStaffOrders({ silent = false } = {}) {
    if (staffBusy) return;

    const prepLoading = staffElement("staffPreparationLoading");
    const deliveryLoading = staffElement("staffDeliveryLoading");
    if (!silent) {
        if (prepLoading) prepLoading.hidden = false;
        if (deliveryLoading) deliveryLoading.hidden = false;
    }

    try {
        const { data, error } = await withTimeout(
            supabaseClient.rpc("staff_get_orders"),
            10000,
            "STAFF_ORDERS_TIMEOUT"
        );

        if (error) throw error;
        staffOrders = data || [];
        clearStaffMessage();
        renderStaffOrders();
    } catch (error) {
        console.error("Error cargando pedidos del staff:", error);
        showStaffMessage("No pudimos cargar las operaciones. Usa Actualizar para reintentar.");
    } finally {
        if (prepLoading) prepLoading.hidden = true;
        if (deliveryLoading) deliveryLoading.hidden = true;
    }
}

async function runStaffAction(orderId, action, button) {
    if (staffBusy) return;
    staffBusy = true;

    if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = "Actualizando...";
    }
    clearStaffMessage();

    try {
        const { error } = await withTimeout(
            supabaseClient.rpc("staff_update_order_operation", {
                p_order_id: String(orderId),
                p_action: action
            }),
            10000,
            "STAFF_ACTION_TIMEOUT"
        );

        if (error) throw error;
        await loadStaffOrders();
        showStaffMessage("Pedido actualizado correctamente.", "success");
    } catch (error) {
        console.error("Error actualizando operación:", error);
        showStaffMessage(staffActionError(error));
    } finally {
        staffBusy = false;
        if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "Actualizar";
        }
    }
}

function renderTeam(rows) {
    const container = staffElement("staffTeam");
    const empty = staffElement("staffTeamEmpty");
    if (!container || !empty) return;

    empty.hidden = rows.length > 0;
    container.innerHTML = rows.map(person => `<div class="staff-team-row">
        <div>
            <strong>${staffEscape(person.full_name || person.email || "Usuario")}</strong>
            <span>${staffEscape(person.email || "Sin correo")}</span>
        </div>
        <select data-team-user="${staffEscape(person.user_id)}" aria-label="Rol de ${staffEscape(person.full_name || person.email || "usuario")}"${person.user_id === staffUser?.id ? " disabled" : ""}>
            ${["customer", "florist", "delivery", "admin"].map(role => `<option value="${role}"${person.role === role ? " selected" : ""}>${STAFF_ROLE_LABELS[role]}</option>`).join("")}
        </select>
    </div>`).join("");
}

async function searchTeamMember(event) {
    event?.preventDefault();
    if (staffProfile?.role !== "admin") return;

    const email = staffElement("staffTeamEmail")?.value.trim();
    const loading = staffElement("staffTeamLoading");
    const button = staffElement("staffTeamSearchButton");
    const container = staffElement("staffTeam");
    const empty = staffElement("staffTeamEmpty");

    if (!email) return;
    if (loading) loading.hidden = false;
    if (button) button.disabled = true;
    if (container) container.innerHTML = "";
    if (empty) empty.hidden = true;

    try {
        const { data, error } = await withTimeout(
            supabaseClient.rpc("admin_find_team_member", { p_email: email }),
            10000,
            "TEAM_SEARCH_TIMEOUT"
        );
        if (error) throw error;
        renderTeam(data || []);
    } catch (error) {
        console.error("Error buscando personal:", error);
        const errorText = staffErrorText(error);
        showStaffMessage(
            errorText.includes("VALID_EMAIL_REQUIRED")
                ? "Ingresa un correo válido para buscar al trabajador."
                : "No pudimos buscar ese usuario. Inténtalo nuevamente."
        );
    } finally {
        if (loading) loading.hidden = true;
        if (button) button.disabled = false;
    }
}

async function changeTeamRole(select) {
    const userId = select.dataset.teamUser;
    const role = select.value;
    select.disabled = true;

    try {
        const { error } = await withTimeout(
            supabaseClient.rpc("admin_set_profile_role", {
                p_user_id: userId,
                p_role: role
            }),
            10000,
            "ROLE_UPDATE_TIMEOUT"
        );
        if (error) throw error;
        showStaffMessage(`Rol actualizado a ${STAFF_ROLE_LABELS[role]}.`, "success");
    } catch (error) {
        console.error("Error cambiando rol:", error);
        showStaffMessage("No pudimos cambiar el rol de este usuario.");
        await searchTeamMember();
    } finally {
        select.disabled = false;
    }
}

function updateLiveClock() {
    const clock = staffElement("staffClock");
    if (clock) {
        clock.textContent = new Intl.DateTimeFormat("es-PE", {
            weekday: "long",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }).format(new Date());
    }

    document.querySelectorAll("[data-waiting-since]").forEach(element => {
        element.textContent = formatWaiting(element.dataset.waitingSince);
        element.classList.toggle("urgent", minutesBetween(element.dataset.waitingSince) >= 60);
    });
}

function configureRoleUI() {
    const role = staffProfile?.role;
    staffElement("staffIdentity").textContent = `${staffProfile?.full_name || staffUser?.email || "Equipo"} · ${STAFF_ROLE_LABELS[role] || role}`;
    staffElement("staffRoleEyebrow").textContent = STAFF_ROLE_LABELS[role] || "Equipo Kantu";

    if (role === "florist") {
        staffElement("staffTitle").textContent = "Cola de preparación";
        staffElement("staffSubtitle").textContent = "Cada pedido reserva 30 minutos. Los botones de preparación son exclusivos de Florista y Administrador.";
    } else if (role === "delivery") {
        staffElement("staffTitle").textContent = "Repartos listos";
        staffElement("staffSubtitle").textContent = "Aquí verás únicamente pedidos listos para recoger, en camino y entregados recientemente.";
    } else {
        staffElement("staffTitle").textContent = "Operaciones en vivo";
        staffElement("staffSubtitle").textContent = "Como administrador puedes supervisar por separado la cola de Floristería y la vista de Delivery.";
    }

    staffElement("staffPreparationSection").hidden = role === "delivery";
    staffElement("staffDeliverySection").hidden = role === "florist";
    staffElement("staffTeamSection").hidden = role !== "admin";
}

function clearStaffTimers() {
    if (staffRefreshTimer) clearInterval(staffRefreshTimer);
    if (staffClockTimer) clearInterval(staffClockTimer);
    staffRefreshTimer = null;
    staffClockTimer = null;
}

async function initializeStaff() {
    resetAccessView();
    clearStaffTimers();

    try {
        const sessionResult = await withTimeout(
            supabaseClient.auth.getSession(),
            5000,
            "SESSION_TIMEOUT"
        );
        const session = sessionResult?.data?.session;

        if (!session) {
            showDenied("Inicia sesión en Kantu Floral con una cuenta de Florista, Delivery o Administrador.");
            return;
        }

        const userResult = await withTimeout(
            supabaseClient.auth.getUser(),
            8000,
            "USER_TIMEOUT"
        );
        const user = userResult?.data?.user;
        if (userResult?.error || !user) {
            showDenied("Tu sesión no es válida. Vuelve a iniciar sesión desde la tienda.");
            return;
        }

        staffUser = user;
        const profileResult = await withTimeout(
            supabaseClient
                .from("profiles")
                .select("full_name, role")
                .eq("id", user.id)
                .maybeSingle(),
            8000,
            "PROFILE_TIMEOUT"
        );

        if (profileResult.error) throw profileResult.error;
        const profile = profileResult.data;

        if (!profile || !["admin", "florist", "delivery"].includes(profile.role)) {
            showDenied("Tu cuenta existe, pero todavía no tiene un rol operativo asignado.");
            return;
        }

        staffProfile = profile;
        staffElement("staffAccess").hidden = true;
        staffElement("staffDenied").hidden = true;
        staffElement("staffApp").hidden = false;
        configureRoleUI();
        updateLiveClock();
        await loadStaffOrders();

        staffRefreshTimer = window.setInterval(() => loadStaffOrders({ silent: true }), 10000);
        staffClockTimer = window.setInterval(updateLiveClock, 1000);
    } catch (error) {
        console.error("No se pudo inicializar el portal operativo:", error);
        setAccessFailure("La verificación tardó demasiado o hubo un problema de conexión. Ya no se quedará cargando indefinidamente: puedes reintentar aquí.");
    }
}

staffElement("staffPreparationOrders")?.addEventListener("click", event => {
    const button = event.target.closest("[data-staff-action]");
    if (button) runStaffAction(button.dataset.orderId, button.dataset.staffAction, button);
});

staffElement("staffDeliveryOrders")?.addEventListener("click", event => {
    const button = event.target.closest("[data-staff-action]");
    if (button) runStaffAction(button.dataset.orderId, button.dataset.staffAction, button);
});

staffElement("staffTeam")?.addEventListener("change", event => {
    if (event.target.matches("[data-team-user]")) changeTeamRole(event.target);
});

staffElement("staffTeamSearchForm")?.addEventListener("submit", searchTeamMember);
staffElement("staffRefresh")?.addEventListener("click", () => loadStaffOrders());
staffElement("staffRetryAccess")?.addEventListener("click", initializeStaff);
staffElement("staffLogout")?.addEventListener("click", async () => {
    clearStaffTimers();
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
});

supabaseClient.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
        clearStaffTimers();
        window.location.href = "index.html";
    }
});

window.addEventListener("beforeunload", clearStaffTimers);
document.addEventListener("DOMContentLoaded", initializeStaff);
