/* KANTU FLORAL - PAGOS MANUALES YAPE / TRANSFERENCIA */

const MANUAL_PAYMENT_BUCKET = "payment-proofs";
const MANUAL_PAYMENT_MAX_SIZE = 5 * 1024 * 1024;
const MANUAL_PAYMENT_MIME_TYPES = ["image/jpeg", "image/png"];
const MANUAL_PAYMENT_EXTENSIONS = ["jpg", "jpeg", "png"];
const MANUAL_PAYMENT_POLL_INTERVAL = 5000;

// Completar únicamente con los datos oficiales del negocio.
const manualPaymentInstructions = {
    yape: "Configura aquí el número o nombre oficial de Yape de Kantu Floral.",
    transferencia: "Configura aquí la cuenta bancaria oficial de Kantu Floral."
};

const manualProofStatusLabels = {
    uploaded: "Comprobante recibido",
    verifying: "Estamos verificando tu pago",
    needs_review: "Tu comprobante requiere revisión",
    approved: "Pago aprobado",
    rejected: "Comprobante rechazado"
};

let manualPaymentOrder = null;
let manualPaymentPollId = null;
let manualPaymentPolling = false;

function manualElement(id) { return document.getElementById(id); }

function setManualPaymentOrder(orderId, total) {
    manualPaymentOrder = { id: String(orderId), total: Number(total) };
    const button = manualElement("manualPaymentButton");
    if (button) button.hidden = false;
}

function resetManualPayment() {
    stopManualPaymentPolling();
    manualPaymentOrder = null;
    manualElement("manualPaymentForm")?.reset();
    if (manualElement("manualPaymentPanel")) manualElement("manualPaymentPanel").hidden = true;
    if (manualElement("manualPaymentButton")) manualElement("manualPaymentButton").hidden = true;
    if (manualElement("manualPaymentMessage")) manualElement("manualPaymentMessage").hidden = true;
    if (manualElement("manualPaymentStatus")) manualElement("manualPaymentStatus").hidden = true;
}

function showManualPaymentPanel() {
    if (!manualPaymentOrder) return;
    manualElement("manualPaymentPanel").hidden = false;
    manualElement("manualPaymentButton").hidden = true;
    manualElement("manualPaymentOrder").textContent = `Pedido #${manualPaymentOrder.id}`;
    manualElement("manualPaymentTotal").textContent = new Intl.NumberFormat("es-PE", {
        style: "currency", currency: "PEN"
    }).format(manualPaymentOrder.total);
    updateManualPaymentInstructions();
    clearManualPaymentMessage();
}

function updateManualPaymentInstructions() {
    const method = manualElement("manualPaymentMethod")?.value || "yape";
    manualElement("manualPaymentInstructionsTitle").textContent = method === "yape"
        ? "Paga mediante Yape"
        : "Realiza una transferencia";
    manualElement("manualPaymentInstructions").textContent = manualPaymentInstructions[method];
}

function showManualPaymentMessage(message, type = "error") {
    const element = manualElement("manualPaymentMessage");
    element.textContent = message;
    element.className = `checkout-message manual-payment-message ${type}`;
    element.hidden = false;
}

function clearManualPaymentMessage() {
    const element = manualElement("manualPaymentMessage");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
}

function validateManualPaymentFile(file) {
    if (!file) return "Selecciona una imagen del comprobante.";
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!MANUAL_PAYMENT_MIME_TYPES.includes(file.type)) return "El archivo debe ser JPG, JPEG o PNG.";
    if (!MANUAL_PAYMENT_EXTENSIONS.includes(extension)) return "La extensión del archivo debe ser JPG, JPEG o PNG.";
    if (file.size > MANUAL_PAYMENT_MAX_SIZE) return "El comprobante no puede superar los 5 MB.";
    if (file.size <= 0) return "El archivo seleccionado está vacío.";
    return null;
}

function safeManualPaymentFilename(file) {
    const extension = file.name.split(".").pop().toLowerCase();
    const uniquePart = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `comprobante-${uniquePart}.${extension}`;
}

async function submitManualPaymentProof(event) {
    event.preventDefault();
    if (!manualPaymentOrder) return showManualPaymentMessage("No encontramos el pedido para registrar el pago.");

    clearManualPaymentMessage();
    const file = manualElement("manualPaymentFile").files?.[0];
    const fileError = validateManualPaymentFile(file);
    if (fileError) return showManualPaymentMessage(fileError);

    const method = manualElement("manualPaymentMethod").value;
    const operationNumber = manualElement("manualOperationNumber").value.trim();
    const button = manualElement("manualPaymentSubmit");
    button.disabled = true;
    button.textContent = "Enviando comprobante...";

    let storagePath = null;
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("AUTHENTICATION_REQUIRED");

        storagePath = `${user.id}/${manualPaymentOrder.id}/${safeManualPaymentFilename(file)}`;
        const upload = await supabaseClient.storage.from(MANUAL_PAYMENT_BUCKET)
            .upload(storagePath, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (upload.error) throw upload.error;

        const insert = await supabaseClient.from("payment_proofs").insert({
            order_id: manualPaymentOrder.id,
            user_id: user.id,
            payment_method: method,
            amount: manualPaymentOrder.total,
            storage_path: storagePath,
            operation_number: operationNumber || null,
            verification_status: "uploaded"
        }).select("id, verification_status, uploaded_at").single();

        if (insert.error) {
            const cleanup = await supabaseClient.storage.from(MANUAL_PAYMENT_BUCKET).remove([storagePath]);
            if (cleanup.error) console.warn("No se pudo eliminar el comprobante huérfano:", cleanup.error);
            throw insert.error;
        }

        showManualPaymentMessage("Comprobante recibido. Estamos verificando tu pago.", "success");
        renderManualPaymentStatus(insert.data, { status: "pendiente", payment_status: "pending" });
        manualElement("manualPaymentForm").hidden = true;
        startManualPaymentPolling();
    } catch (error) {
        console.error("Error registrando comprobante:", error);
        const expired = String(error?.message || "").includes("AUTHENTICATION_REQUIRED");
        showManualPaymentMessage(expired
            ? "Tu sesión expiró. Inicia sesión nuevamente para enviar el comprobante."
            : "No pudimos registrar tu comprobante. Revisa el archivo e inténtalo nuevamente.");
    } finally {
        button.disabled = false;
        button.textContent = "Enviar comprobante";
    }
}

async function pollManualPaymentStatus() {
    if (!manualPaymentOrder || manualPaymentPolling) return;
    manualPaymentPolling = true;
    try {
        const [proofResult, orderResult] = await Promise.all([
            supabaseClient.from("payment_proofs")
                .select("id, verification_status, verification_notes, uploaded_at, operation_number, payment_method")
                .eq("order_id", manualPaymentOrder.id)
                .order("uploaded_at", { ascending: false }).limit(1).maybeSingle(),
            supabaseClient.from("orders").select("status, payment_status")
                .eq("id", manualPaymentOrder.id).maybeSingle()
        ]);
        if (proofResult.error || orderResult.error) throw proofResult.error || orderResult.error;
        if (!proofResult.data) return;
        renderManualPaymentStatus(proofResult.data, orderResult.data);
        if (proofResult.data.verification_status === "approved") stopManualPaymentPolling();
        if (proofResult.data.verification_status === "rejected") {
            stopManualPaymentPolling();
            manualElement("manualPaymentForm").hidden = false;
            manualElement("manualPaymentFile").value = "";
        }
    } catch (error) {
        console.error("Error consultando estado del comprobante:", error);
    } finally {
        manualPaymentPolling = false;
    }
}

function renderManualPaymentStatus(proof, order) {
    const status = proof.verification_status || "uploaded";
    const element = manualElement("manualPaymentStatus");
    const note = status === "rejected" && proof.verification_notes
        ? `<p><strong>Motivo:</strong> ${escapeManualHtml(proof.verification_notes)}</p>` : "";
    const confirmed = status === "approved"
        ? `<p>Pedido confirmado · Pago aprobado · Estado: ${escapeManualHtml(order?.status || "confirmado")}</p>` : "";
    element.className = `manual-payment-status proof-${status}`;
    element.innerHTML = `<strong>${escapeManualHtml(manualProofStatusLabels[status] || status)}</strong>${confirmed}${note}`;
    element.hidden = false;
}

function escapeManualHtml(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function startManualPaymentPolling() {
    stopManualPaymentPolling();
    pollManualPaymentStatus();
    manualPaymentPollId = window.setInterval(pollManualPaymentStatus, MANUAL_PAYMENT_POLL_INTERVAL);
}

function stopManualPaymentPolling() {
    if (manualPaymentPollId) window.clearInterval(manualPaymentPollId);
    manualPaymentPollId = null;
}

function initializeManualPayments() {
    const form = manualElement("manualPaymentForm");
    if (!form) return;
    manualElement("manualPaymentButton").addEventListener("click", showManualPaymentPanel);
    manualElement("manualPaymentMethod").addEventListener("change", updateManualPaymentInstructions);
    form.addEventListener("submit", submitManualPaymentProof);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && manualPaymentPollId) pollManualPaymentStatus();
    });
}

document.addEventListener("DOMContentLoaded", initializeManualPayments);
