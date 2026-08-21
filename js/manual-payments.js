/* KANTU FLORAL - PAGOS MANUALES YAPE / TRANSFERENCIA */

const MANUAL_PAYMENT_BUCKET = "payment-proofs";
const MANUAL_PAYMENT_MAX_SIZE = 5 * 1024 * 1024;
const MANUAL_PAYMENT_MIME_TYPES = ["image/jpeg", "image/png"];
const MANUAL_PAYMENT_EXTENSIONS = ["jpg", "jpeg", "png"];
const MANUAL_PAYMENT_POLL_INTERVAL = 5000;

const manualPaymentInstructions = {
    yape: {
        title: "Yape / Plin",
        accountHolder: "JHONNE DIAZ",
        accountNumber: "+51 967 539 019",
        qrUrl: "https://i.postimg.cc/C1RQRqCh/QR-AARON-DIAZ.jpg",
        message: "Escanea el QR o realiza el pago al número indicado mediante Yape o Plin. Verifica que al pagar figure JHONNE DIAZ y luego sube tu comprobante."
    },
    transferencia: {
        title: "Transferencia bancaria",
        message: "Selecciona un banco, realiza la transferencia y luego sube tu comprobante."
    }
};

const manualBankAccounts = {
    bcp: { name: "BCP", accountLabel: "Cuenta Soles", account: "21576039072038", cci: "00221517603907203829" },
    bbva: { name: "BBVA", accountLabel: "Cuenta Soles", account: "0011-0814-0274244793", cci: "01181400027424479317" },
    interbank: { name: "Interbank", accountLabel: "Cuenta Simple Soles", account: "898 3423653800", cci: "00389801342365380042" }
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
let selectedManualBank = "bcp";

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
    const methodInput = manualElement("manualPaymentMethod");
    if (methodInput) methodInput.value = "yape";
    selectedManualBank = "bcp";
    updateManualPaymentInstructions();
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
    const configuration = manualPaymentInstructions[method];
    const isYape = method === "yape";
    manualElement("manualPaymentInstructionsTitle").textContent = configuration.title;
    manualElement("manualPaymentInstructions").textContent = configuration.message;
    manualElement("manualYapeDetails").hidden = !isYape;
    manualElement("manualPaymentQr").hidden = !isYape;
    manualElement("manualBankPanel").hidden = isYape;
    document.querySelectorAll("[data-manual-method]").forEach(button => {
        const active = button.dataset.manualMethod === method;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    if (isYape) {
        manualElement("manualYapeHolder").textContent = configuration.accountHolder;
        manualElement("manualYapeNumber").textContent = configuration.accountNumber;
        const qrImage = manualElement("manualPaymentQrImage");
        qrImage.src = configuration.qrUrl;
        qrImage.alt = `QR de Yape / Plin de ${configuration.accountHolder}`;
    }
    if (!isYape) renderManualBank();
}

function selectManualPaymentMethod(method) {
    if (!manualPaymentInstructions[method]) return;
    manualElement("manualPaymentMethod").value = method;
    updateManualPaymentInstructions();
}

function selectManualBank(bank) {
    if (!manualBankAccounts[bank]) return;
    selectedManualBank = bank;
    renderManualBank();
}

function renderManualBank() {
    const bank = manualBankAccounts[selectedManualBank];
    manualElement("manualBankName").textContent = bank.name;
    manualElement("manualBankAccountLabel").textContent = bank.accountLabel;
    manualElement("manualBankAccount").textContent = bank.account;
    manualElement("manualBankCci").textContent = bank.cci;
    document.querySelectorAll("[data-manual-bank]").forEach(button => {
        const active = button.dataset.manualBank === selectedManualBank;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

async function copyManualPaymentValue(button) {
    const source = manualElement(button.dataset.copySource);
    const value = source?.textContent.trim();
    if (!value) return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
        } else {
            const input = document.createElement("textarea");
            input.value = value;
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            input.remove();
        }
        const original = button.textContent;
        button.textContent = "Copiado";
        button.classList.add("copied");
        window.setTimeout(() => {
            button.textContent = original;
            button.classList.remove("copied");
        }, 1400);
    } catch (error) {
        console.error("No se pudo copiar el dato de pago:", error);
        showManualPaymentMessage("No pudimos copiar el dato. Puedes seleccionarlo manualmente.");
    }
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
    manualElement("manualPaymentPanel").addEventListener("click", event => {
        const methodButton = event.target.closest("[data-manual-method]");
        const bankButton = event.target.closest("[data-manual-bank]");
        const copyButton = event.target.closest("[data-copy-source]");
        if (methodButton) selectManualPaymentMethod(methodButton.dataset.manualMethod);
        if (bankButton) selectManualBank(bankButton.dataset.manualBank);
        if (copyButton) copyManualPaymentValue(copyButton);
    });
    form.addEventListener("submit", submitManualPaymentProof);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && manualPaymentPollId) pollManualPaymentStatus();
    });
}

document.addEventListener("DOMContentLoaded", initializeManualPayments);
