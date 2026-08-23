/* KANTU FLORAL - SUBIDA DE IMAGENES DE PRODUCTO */

(() => {
    const PRODUCT_IMAGE_BUCKET = "product-images";
    const PRODUCT_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
    const PRODUCT_IMAGE_MIME_TYPES = Object.freeze({
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
    });

    function adminImageElement(id) {
        return document.getElementById(id);
    }

    function ensureProductImageUploadField() {
        const imageUrlInput = adminImageElement("adminProductImage");
        const imageUrlGroup = imageUrlInput?.closest(".form-group");
        if (!imageUrlInput || !imageUrlGroup || adminImageElement("adminProductUploadGroup")) return;

        const group = document.createElement("div");
        group.id = "adminProductUploadGroup";
        group.className = "form-group admin-field-wide admin-product-upload-group";
        group.innerHTML = `
            <label for="adminProductUploadFile">Subir imagen del producto</label>
            <div class="admin-product-upload-actions">
                <input
                    id="adminProductUploadFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    aria-describedby="adminProductUploadHelp adminProductUploadStatus"
                >
                <button id="adminProductUploadButton" type="button" class="btn btn-light">Subir imagen</button>
            </div>
            <small id="adminProductUploadHelp">JPG, PNG o WebP. Máximo 5 MB. La URL pública se completará automáticamente.</small>
            <p id="adminProductUploadStatus" class="admin-product-upload-status" role="status" aria-live="polite"></p>
            <div id="adminProductUploadPreviewWrap" class="admin-product-upload-preview" hidden>
                <img id="adminProductUploadPreview" alt="Vista previa de la imagen del producto">
            </div>
        `;

        imageUrlGroup.insertAdjacentElement("afterend", group);

        const fileInput = adminImageElement("adminProductUploadFile");
        const uploadButton = adminImageElement("adminProductUploadButton");
        uploadButton?.addEventListener("click", () => uploadProductImage(fileInput?.files?.[0]));
        fileInput?.addEventListener("change", () => {
            setUploadStatus("");
            if (fileInput.files?.[0]) previewLocalFile(fileInput.files[0]);
        });
        imageUrlInput.addEventListener("input", updateProductImagePreviewFromUrl);

        const formView = adminImageElement("adminProductFormView");
        if (formView) {
            new MutationObserver(() => {
                if (!formView.hidden) {
                    resetUploadSelection();
                    updateProductImagePreviewFromUrl();
                }
            }).observe(formView, { attributes: true, attributeFilter: ["hidden"] });
        }

        updateProductImagePreviewFromUrl();
    }

    function setUploadStatus(message, type = "") {
        const status = adminImageElement("adminProductUploadStatus");
        if (!status) return;
        status.textContent = message;
        status.className = `admin-product-upload-status${type ? ` ${type}` : ""}`;
    }

    function resetUploadSelection() {
        const fileInput = adminImageElement("adminProductUploadFile");
        const uploadButton = adminImageElement("adminProductUploadButton");
        if (fileInput) fileInput.value = "";
        if (uploadButton) {
            uploadButton.disabled = false;
            uploadButton.textContent = "Subir imagen";
        }
        setUploadStatus("");
    }

    function validateProductImage(file) {
        if (!file) return "Selecciona una imagen antes de subirla.";
        if (!PRODUCT_IMAGE_MIME_TYPES[file.type]) return "La imagen debe ser JPG, PNG o WebP.";
        if (file.size <= 0) return "El archivo seleccionado está vacío.";
        if (file.size > PRODUCT_IMAGE_MAX_SIZE) return "La imagen no puede superar los 5 MB.";
        return null;
    }

    function createProductImagePath(file) {
        const extension = PRODUCT_IMAGE_MIME_TYPES[file.type];
        const unique = globalThis.crypto?.randomUUID?.()
            || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return `catalog/${unique}.${extension}`;
    }

    function previewLocalFile(file) {
        const wrap = adminImageElement("adminProductUploadPreviewWrap");
        const image = adminImageElement("adminProductUploadPreview");
        if (!wrap || !image || !file) return;

        const localUrl = URL.createObjectURL(file);
        const previousLocalUrl = image.dataset.localUrl;
        if (previousLocalUrl) URL.revokeObjectURL(previousLocalUrl);

        image.dataset.localUrl = localUrl;
        image.src = localUrl;
        wrap.hidden = false;
    }

    function updateProductImagePreviewFromUrl() {
        const wrap = adminImageElement("adminProductUploadPreviewWrap");
        const image = adminImageElement("adminProductUploadPreview");
        const input = adminImageElement("adminProductImage");
        if (!wrap || !image || !input) return;

        const safeUrl = window.KantuCore?.safeUrl?.(input.value) || "";
        if (!safeUrl) {
            if (!image.dataset.localUrl) wrap.hidden = true;
            return;
        }

        const previousLocalUrl = image.dataset.localUrl;
        if (previousLocalUrl) {
            URL.revokeObjectURL(previousLocalUrl);
            delete image.dataset.localUrl;
        }

        image.src = safeUrl;
        wrap.hidden = false;
    }

    async function uploadProductImage(file) {
        const validationError = validateProductImage(file);
        if (validationError) {
            setUploadStatus(validationError, "error");
            return;
        }

        const button = adminImageElement("adminProductUploadButton");
        const imageUrlInput = adminImageElement("adminProductImage");
        if (!button || !imageUrlInput || typeof supabaseClient === "undefined") return;

        button.disabled = true;
        button.textContent = "Subiendo...";
        setUploadStatus("Subiendo imagen de forma segura...", "info");

        try {
            const path = createProductImagePath(file);
            const { error } = await supabaseClient.storage
                .from(PRODUCT_IMAGE_BUCKET)
                .upload(path, file, {
                    cacheControl: "31536000",
                    upsert: false,
                    contentType: file.type
                });

            if (error) throw error;

            const { data } = supabaseClient.storage
                .from(PRODUCT_IMAGE_BUCKET)
                .getPublicUrl(path);
            const publicUrl = window.KantuCore?.safeUrl?.(data?.publicUrl) || "";
            if (!publicUrl) throw new Error("INVALID_PRODUCT_IMAGE_PUBLIC_URL");

            imageUrlInput.value = publicUrl;
            imageUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
            imageUrlInput.dispatchEvent(new Event("change", { bubbles: true }));
            setUploadStatus("Imagen subida. Guarda el producto para conservar esta URL en el catálogo.", "success");
        } catch (error) {
            console.error("No se pudo subir la imagen del producto:", error);
            setUploadStatus("No pudimos subir la imagen. Verifica tu sesión de administrador e inténtalo nuevamente.", "error");
        } finally {
            button.disabled = false;
            button.textContent = "Subir imagen";
        }
    }

    document.addEventListener("DOMContentLoaded", ensureProductImageUploadField);
})();
