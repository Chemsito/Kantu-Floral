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
    FLORIST_PERMISSION_REQUIRED: "Esta acción corresponde al equipo de floristas.",
    DELIVERY_PERMISSION_REQUIRED: "Esta acción corresponde al equipo de delivery.",
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

function computePreparationEtas(orders) {
    const queue = orders
        .filter(order => ["confirmado", "preparando"].includes(order.status) && !order.ready_for_delivery_at)
        .sort((a, b) => (Number(a.queue_position) || 9999) - (Number(b.queue_position) || 9999));

    let cursor = Date.now();
    queue.forEach(order => {
        let readyAt;
        if (order.prep_started_at) {
            readyAt = new Date(order.prep_started_at).getTime() + (30 * 60000);
            readyAt = Math.max(cursor, readyAt);
        } else {
            readyAt = cursor + (30 * 60000);
        }
        order._estimatedReadyAt = readyAt;
        cursor = readyAt;
    });
}

function roleCanFlorist() {
    return ["admin", "florist"].includes(staffProfile?.role);
}

function roleCanDelivery() {
    return ["admin", "delivery"].includes(staffProfile?.role);
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

function renderOrderActions(order) {
    const actions = [];

    if (roleCanFlorist() && order.status === "confirmado") {
        actions.push(`<button type="button" class="staff-action-button" data-staff-action="start_preparation" data-order-id="${staffEscape(order.order_id)}">Empezar preparación</button>`);
    }
    if (roleCanFlorist() && order.status === "preparando" && !order.ready_for_delivery_at) {
        actions.push(`<button type="button" class="staff-action-button" data-staff-action="mark_ready" data-order-id="${staffEscape(order.order_id)}">Marcar listo para delivery</button>`);
    }
    if (roleCanDelivery() && order.status === "preparando" && order.ready_for_delivery_at) {
        actions.push(`<button type="button" class="staff-action-button delivery" data-staff-action="start_delivery" data-order-id="${staffEscape(order.order_id)}">Iniciar reparto</button>`);
    }
    if (roleCanDelivery() && order.status === "en_camino") {
        actions.push(`<button type="button" class="staff-action-button delivery" data-staff-action="mark_delivered" data-order-id="${staffEscape(order.order_id)}">Marcar entregado</button>`);
    }

    return actions.join("");
}

function renderStaffOrders() {
    computePreparationEtas(staffOrders);
    const container = staffElement("staffOrders");
    const empty = staffElement("staffOrdersEmpty");
    if (!container || !empty) return;

    empty.hidden = staffOrders.length > 0;
    container.innerHTML = staffOrders.map(order => {
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
                            <span>Cliente esperando</span>
                            <strong class="staff-waiting${urgent ? " urgent" : ""}" data-waiting-since="${staffEscape(order.paid_at || "")}">${staffEscape(formatWaiting(order.paid_at))}</strong>
                        </div>
                        <div class="staff-metric">
                            <span>Cola / listo estimado</span>
                            <strong>${order.queue_position ? `#${staffEscape(order.queue_position)} · ${staffEscape(eta)}` : staffEscape(eta)}</strong>
                        </div>
                        <div class="staff-metric">
                            <span>Delivery</span>
                            <strong>${staffEscape(Number(order.delivery_distance_km || 0).toFixed(1))} km · ${staffEscape(order.estimated_delivery_minutes || "—")} min</strong>
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
                        <span>Total / delivery</span>
                        <strong>${staffEscape(staffMoney(order.total))} · ${staffEscape(staffMoney(order.delivery_fee))} delivery</strong>
                    </div>
                    ${order.customer_name ? `<div class="staff-info-box"><span>Cliente</span><strong>${staffEscape(order.customer_name)}</strong>${order.customer_phone ? `<a href="https://wa.me/${staffEscape(String(order.customer_phone).replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">WhatsApp: ${staffEscape(order.customer_phone)}</a>` : ""}</div>` : ""}
                    ${mapsUrl ? `<div class="staff-info-box"><span>Ubicación</span><strong>${staffEscape(Number(order.delivery_distance_km || 0).toFixed(1))} km aprox.</strong><a href="${staffEscape(mapsUrl)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>${reference ? `<small>Referencia: ${staffEscape(reference)}</small>` : ""}</div>` : ""}
                    <div class="staff-actions">${renderOrderActions(order)}</div>
                </aside>
            </div>
        </article>`;
    }).join("");

    renderStaffStats();
}

function renderStaffStats() {
    const stats = staffElement("staffStats");
    if (!stats) return;
    const production = staffOrders.filter(order => ["confirmado", "preparando"].includes(order.status) && !order.ready_for_delivery_at).length;
    const ready = staffOrders.filter(order => order.ready_for_delivery_at && order.status === "preparando").length;
    const onWay = staffOrders.filter(order => order.status === "en_camino").length;
    const longest = staffOrders.reduce((max, order) => Math.max(max, minutesBetween(order.paid_at)), 0);

    stats.innerHTML = [
        ["En preparación / cola", production],
        ["Listos para delivery", ready],
        ["En camino", onWay],
        ["Mayor espera", `${longest} min`]
    ].map(([label, value]) => `<div class="staff-stat"><span>${staffEscape(label)}</span><strong>${staffEscape(value)}</strong></div>`).join("");
}

async function loadStaffOrders({ silent = false } = {}) {
    if (staffBusy) return;
    const loading = staffElement("staffOrdersLoading");
    if (!silent && loading) loading.hidden = false;

    const { data, error } = await supabaseClient.rpc("staff_get_orders");
    if (loading) loading.hidden = true;

    if (error) {
        console.error("Error cargando pedidos del staff:", error);
        showStaffMessage("No pudimos cargar la cola de pedidos.");
        return;
    }

    staffOrders = data || [];
    clearStaffMessage();
    renderStaffOrders();
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

    const { error } = await supabaseClient.rpc("staff_update_order_operation", {
        p_order_id: String(orderId),
        p_action: action
    });

    staffBusy = false;
    if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || "Actualizar";
    }

    if (error) {
        console.error("Error actualizando operación:", error);
        showStaffMessage(staffActionError(error));
        return;
    }

    await loadStaffOrders();
    showStaffMessage("Pedido actualizado correctamente.", "success");
}

function renderTeam(rows) {
    const container = staffElement("staffTeam");
    if (!container) return;
    container.innerHTML = rows.map(person => `<div class="staff-team-row">
        <div>
            <strong>${staffEscape(person.full_name || person.email || "Usuario")}</strong>
            <span>${staffEscape(person.email || "Sin correo")} · ${staffEscape(person.user_id)}</span>
        </div>
        <select data-team-user="${staffEscape(person.user_id)}" aria-label="Rol de ${staffEscape(person.full_name || person.email || "usuario")}"${person.user_id === staffUser?.id ? " disabled" : ""}>
            ${["customer", "florist", "delivery", "admin"].map(role => `<option value="${role}"${person.role === role ? " selected" : ""}>${STAFF_ROLE_LABELS[role]}</option>`).join("")}
        </select>
    </div>`).join("");
}

async function loadTeam() {
    if (staffProfile?.role !== "admin") return;
    const loading = staffElement("staffTeamLoading");
    if (loading) loading.hidden = false;
    const { data, error } = await supabaseClient.rpc("admin_list_team");
    if (loading) loading.hidden = true;
    if (error) {
        console.error("Error cargando personal:", error);
        showStaffMessage("No pudimos cargar el personal.");
        return;
    }
    renderTeam(data || []);
}

async function changeTeamRole(select) {
    const userId = select.dataset.teamUser;
    const role = select.value;
    select.disabled = true;
    const { error } = await supabaseClient.rpc("admin_set_profile_role", {
        p_user_id: userId,
        p_role: role
    });
    select.disabled = false;
    if (error) {
        console.error("Error cambiando rol:", error);
        showStaffMessage("No pudimos cambiar el rol de este usuario.");
        await loadTeam();
        return;
    }
    showStaffMessage(`Rol actualizado a ${STAFF_ROLE_LABELS[role]}.`, "success");
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
        const minutes = minutesBetween(element.dataset.waitingSince);
        element.classList.toggle("urgent", minutes >= 60);
    });
}

function configureRoleUI() {
    const role = staffProfile?.role;
    staffElement("staffIdentity").textContent = `${staffProfile?.full_name || staffUser?.email || "Equipo"} · ${STAFF_ROLE_LABELS[role] || role}`;
    staffElement("staffRoleEyebrow").textContent = STAFF_ROLE_LABELS[role] || "Equipo Kantu";

    if (role === "florist") {
        staffElement("staffTitle").textContent = "Cola de preparación";
        staffElement("staffSubtitle").textContent = "Cada pedido reserva 30 minutos de armado. Empieza siempre por el primero de la cola.";
    } else if (role === "delivery") {
        staffElement("staffTitle").textContent = "Repartos listos";
        staffElement("staffSubtitle").textContent = "Recoge los pedidos listos y abre la ubicación del cliente directamente en Google Maps.";
    } else {
        staffElement("staffTitle").textContent = "Operaciones en vivo";
        staffElement("staffSubtitle").textContent = "Supervisa preparación, espera del cliente y reparto desde un solo lugar.";
    }

    const team = staffElement("staffTeamSection");
    if (team) team.hidden = role !== "admin";
}

async function initializeStaff() {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
        staffElement("staffAccess").hidden = true;
        staffElement("staffDenied").hidden = false;
        return;
    }

    staffUser = user;
    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profile || !["admin", "florist", "delivery"].includes(profile.role)) {
        staffElement("staffAccess").hidden = true;
        staffElement("staffDenied").hidden = false;
        return;
    }

    staffProfile = profile;
    staffElement("staffAccess").hidden = true;
    staffElement("staffApp").hidden = false;
    configureRoleUI();
    updateLiveClock();
    await loadStaffOrders();
    if (profile.role === "admin") await loadTeam();

    staffRefreshTimer = window.setInterval(() => loadStaffOrders({ silent: true }), 10000);
    staffClockTimer = window.setInterval(updateLiveClock, 1000);
}

staffElement("staffOrders")?.addEventListener("click", event => {
    const button = event.target.closest("[data-staff-action]");
    if (button) runStaffAction(button.dataset.orderId, button.dataset.staffAction, button);
});

staffElement("staffTeam")?.addEventListener("change", event => {
    if (event.target.matches("[data-team-user]")) changeTeamRole(event.target);
});

staffElement("staffRefresh")?.addEventListener("click", () => loadStaffOrders());
staffElement("staffTeamRefresh")?.addEventListener("click", loadTeam);
staffElement("staffLogout")?.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
});

window.addEventListener("beforeunload", () => {
    if (staffRefreshTimer) clearInterval(staffRefreshTimer);
    if (staffClockTimer) clearInterval(staffClockTimer);
});

document.addEventListener("DOMContentLoaded", initializeStaff);
