/* Kantu Floral - detalle individual de producto */

(() => {
    const core = window.KantuCore;
    if (!core || typeof supabaseClient === "undefined") return;

    const categories = new Map([
        ["tulipanes", "Tulipanes"],
        ["girasoles", "Girasoles"],
        ["ramos", "Ramos"],
        ["rosas", "Rosas"],
        ["box", "Box"],
        ["canasta", "Canasta"],
        ["flores", "Flores"],
        ["complementos", "Complementos"],
        ["cajas", "Cajas"],
        ["ramos_buchones", "Ramos buchones"]
    ]);

    let product = null;

    function element(id) {
        return document.getElementById(id);
    }

    function setStatus(message, type = "") {
        const status = element("productDetailStatus");
        if (!status) return;
        status.textContent = message;
        status.className = `product-detail-status${type ? ` ${type}` : ""}`;
    }

    function setMeta(selector, content, attribute = "content") {
        const node = document.querySelector(selector);
        if (node) node.setAttribute(attribute, content);
    }

    function mainStoreUrl(action = "", hash = "") {
        const url = new URL("index.html", window.location.href);
        if (action) url.searchParams.set("kantu_open", action);
        if (hash) url.hash = hash.replace(/^#/, "");
        return url.href;
    }

    function navigateToMain(action = "", hash = "") {
        window.location.href = mainStoreUrl(action, hash);
    }

    function setDetailMobileMenuState(open) {
        const button = document.querySelector(".mobile-menu");
        const nav = element("siteNavigation");
        if (!button || !nav) return;
        nav.classList.toggle("mobile-open", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Cerrar menú de navegación" : "Abrir menú de navegación");
    }

    async function refreshDetailHeaderState() {
        const cartCount = element("cartCount");
        const loginButton = element("loginButton");
        const ordersButton = element("headerOrdersButton");

        try {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            const currentUser = error ? null : user;

            if (ordersButton) ordersButton.hidden = !currentUser;
            if (loginButton) loginButton.textContent = currentUser ? "Mi cuenta" : "Iniciar sesión";

            let quantity = 0;
            if (currentUser) {
                const [profileResult, cartResult] = await Promise.all([
                    supabaseClient.from("profiles").select("full_name").eq("id", currentUser.id).maybeSingle(),
                    supabaseClient.from("cart_items").select("quantity").eq("user_id", currentUser.id)
                ]);

                const name = profileResult.data?.full_name || currentUser.user_metadata?.full_name;
                if (loginButton && name) loginButton.textContent = name.split(" ")[0] || "Mi cuenta";
                if (!cartResult.error) {
                    quantity = (cartResult.data || []).reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
                }
            } else {
                quantity = readCart("kantuCart:guest")
                    .reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
            }

            if (cartCount) cartCount.textContent = String(quantity);
        } catch (error) {
            console.warn("No se pudo sincronizar la cabecera del detalle:", error);
            if (cartCount) {
                const quantity = readCart("kantuCart:guest")
                    .reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
                cartCount.textContent = String(quantity);
            }
        }
    }

    function initializeDetailHeader() {
        const mobileButton = document.querySelector(".mobile-menu");
        const nav = element("siteNavigation");
        if (mobileButton && nav) {
            mobileButton.addEventListener("click", () => {
                setDetailMobileMenuState(!nav.classList.contains("mobile-open"));
            });
            nav.querySelectorAll("a, button").forEach(item => {
                item.addEventListener("click", () => setDetailMobileMenuState(false));
            });
        }

        element("favoritesButton")?.addEventListener("click", () => navigateToMain("favorites", "catalogo"));
        element("cartButton")?.addEventListener("click", () => navigateToMain("cart", "catalogo"));
        element("loginButton")?.addEventListener("click", () => navigateToMain("account"));
        element("headerOrdersButton")?.addEventListener("click", () => navigateToMain("orders"));

        refreshDetailHeaderState();
        supabaseClient.auth.onAuthStateChange(() => {
            window.setTimeout(refreshDetailHeaderState, 0);
        });
    }

    function updateSeo(row) {
        const description = String(row.description || row.note || `Flores y regalos de Kantu Floral en Arequipa.`)
            .trim()
            .slice(0, 180);
        const canonical = new URL("producto.html", window.location.href);
        canonical.searchParams.set("id", String(row.id));
        const image = core.safeUrl(row.image);

        document.title = `${row.name} | Kantu Floral`;
        setMeta('meta[name="description"]', description);
        setMeta('meta[property="og:title"]', `${row.name} | Kantu Floral`);
        setMeta('meta[property="og:description"]', description);
        setMeta('meta[property="og:url"]', canonical.href);
        setMeta('meta[name="twitter:title"]', `${row.name} | Kantu Floral`);
        setMeta('meta[name="twitter:description"]', description);
        if (image) {
            setMeta('meta[property="og:image"]', image);
            setMeta('meta[name="twitter:image"]', image);
        }

        const canonicalLink = document.querySelector('link[rel="canonical"]');
        if (canonicalLink) canonicalLink.href = canonical.href;

        let schema = document.getElementById("productJsonLd");
        if (!schema) {
            schema = document.createElement("script");
            schema.type = "application/ld+json";
            schema.id = "productJsonLd";
            document.head.appendChild(schema);
        }

        schema.textContent = JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: row.name,
            description,
            image: image || undefined,
            category: categories.get(row.category) || row.category || undefined,
            brand: { "@type": "Brand", name: "Kantu Floral" },
            offers: {
                "@type": "Offer",
                url: canonical.href,
                priceCurrency: "PEN",
                price: Number(row.price || 0).toFixed(2),
                availability: Number(row.stock || 0) > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock"
            }
        });
    }

    function render(row) {
        const root = element("productDetailRoot");
        if (!root) return;

        const image = core.safeUrl(row.image);
        const stock = Math.max(0, Number(row.stock) || 0);
        const price = Number(row.price) || 0;
        const category = categories.get(row.category) || row.category || "Flores";

        root.innerHTML = `
            <div class="product-detail-layout">
                <div class="product-detail-media">
                    ${image
                        ? `<img src="${core.escapeHtml(image)}" alt="${core.escapeHtml(row.name || "Producto Kantu Floral")}">`
                        : '<div class="product-detail-placeholder" aria-hidden="true">✿</div>'}
                </div>

                <section class="product-detail-content">
                    ${row.tag ? `<span class="product-detail-tag">${core.escapeHtml(row.tag)}</span>` : ""}
                    <span class="product-detail-category">${core.escapeHtml(category)}</span>
                    <h1>${core.escapeHtml(row.name || "Producto Kantu Floral")}</h1>
                    <p class="product-detail-description">${core.escapeHtml(row.description || "Un detalle preparado por Kantu Floral para acompañar momentos especiales.")}</p>

                    <div class="product-detail-info-grid">
                        <div><span>Talla</span><strong>${core.escapeHtml(row.size || "M")}</strong></div>
                        <div><span>Disponibilidad</span><strong>${stock > 0 ? `${stock} disponible${stock === 1 ? "" : "s"}` : "Agotado"}</strong></div>
                    </div>

                    ${row.note ? `<div class="product-detail-note"><strong>Nota:</strong> ${core.escapeHtml(row.note)}</div>` : ""}

                    <div class="product-detail-price-row">
                        <strong class="product-detail-price">${core.escapeHtml(core.formatMoney(price))}</strong>
                        <span class="product-detail-stock${stock <= 0 ? " out" : ""}">${stock > 0 ? "Disponible" : "Agotado"}</span>
                    </div>

                    <div class="product-detail-actions">
                        <button id="productDetailAdd" type="button" class="product-detail-add" ${stock <= 0 ? "disabled" : ""}>
                            ${stock > 0 ? "Agregar al carrito" : "Producto agotado"}
                        </button>
                        <button id="productDetailShare" type="button" class="product-detail-share">Compartir</button>
                    </div>
                    <p id="productDetailStatus" class="product-detail-status" role="status" aria-live="polite"></p>

                    <div class="product-detail-next">
                        Al agregarlo, tu carrito seguirá disponible en la tienda principal. En checkout podrás indicar destinatario, mensaje para tarjeta y, cuando Kantu active horarios, programar la entrega.
                    </div>
                </section>
            </div>
        `;

        element("productDetailAdd")?.addEventListener("click", addProductToCart);
        element("productDetailShare")?.addEventListener("click", shareProduct);
        updateSeo(row);
    }

    function normalizeStoredCart(value) {
        if (!Array.isArray(value)) return [];
        const byId = new Map();
        value.forEach(item => {
            const id = Number(item?.id ?? item?.product_id);
            const quantity = Number(item?.quantity);
            if (!Number.isSafeInteger(id) || id <= 0) return;
            if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
            byId.set(id, Math.max(byId.get(id) || 0, quantity));
        });
        return [...byId.entries()].map(([id, quantity]) => ({ id, quantity }));
    }

    function readCart(key) {
        try {
            return normalizeStoredCart(JSON.parse(localStorage.getItem(key) || "[]"));
        } catch {
            return [];
        }
    }

    function writeCart(key, rows) {
        localStorage.setItem(key, JSON.stringify(normalizeStoredCart(rows)));
    }

    async function addProductToCart() {
        if (!product) return;
        const stock = Math.max(0, Number(product.stock) || 0);
        if (stock <= 0) return setStatus("Este producto está agotado.", "error");

        const button = element("productDetailAdd");
        if (button) {
            button.disabled = true;
            button.textContent = "Agregando...";
        }
        setStatus("Guardando en tu carrito...");

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const productId = Number(product.id);

            if (user) {
                const currentResult = await supabaseClient
                    .from("cart_items")
                    .select("quantity")
                    .eq("user_id", user.id)
                    .eq("product_id", productId)
                    .maybeSingle();

                if (currentResult.error) throw currentResult.error;
                const current = Math.max(0, Number(currentResult.data?.quantity) || 0);
                if (current >= stock) {
                    setStatus("Ya tienes en el carrito todas las unidades disponibles.", "error");
                    return;
                }

                const next = current + 1;
                const saveResult = await supabaseClient
                    .from("cart_items")
                    .upsert({ user_id: user.id, product_id: productId, quantity: next }, {
                        onConflict: "user_id,product_id"
                    });
                if (saveResult.error) throw saveResult.error;

                const localKey = `kantuCart:user:${user.id}`;
                const local = readCart(localKey);
                const item = local.find(row => row.id === productId);
                if (item) item.quantity = Math.max(item.quantity, next);
                else local.push({ id: productId, quantity: next });
                writeCart(localKey, local);
            } else {
                const key = "kantuCart:guest";
                const local = readCart(key);
                const item = local.find(row => row.id === productId);
                if (item && item.quantity >= stock) {
                    setStatus("Ya tienes en el carrito todas las unidades disponibles.", "error");
                    return;
                }
                if (item) item.quantity += 1;
                else local.push({ id: productId, quantity: 1 });
                writeCart(key, local);
            }

            await refreshDetailHeaderState();
            setStatus("✓ Producto agregado. Puedes abrir el carrito desde el menú superior.", "success");
        } catch (error) {
            console.error("Error agregando producto desde detalle:", error);
            setStatus("No pudimos agregarlo al carrito. Inténtalo nuevamente.", "error");
        } finally {
            if (button) {
                button.disabled = Math.max(0, Number(product.stock) || 0) <= 0;
                button.textContent = button.disabled ? "Producto agotado" : "Agregar al carrito";
            }
        }
    }

    async function copyShareLink(url) {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(url);
                return true;
            } catch {
                // Fallback para navegadores que exponen Clipboard API pero la bloquean.
            }
        }

        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        let copied = false;
        try {
            copied = document.execCommand("copy");
        } catch {
            copied = false;
        } finally {
            textarea.remove();
        }
        return copied;
    }

    function shouldUseNativeShare(shareData) {
        if (typeof navigator.share !== "function") return false;
        const touchDevice = navigator.maxTouchPoints > 0
            || window.matchMedia?.("(pointer: coarse)")?.matches === true;
        if (!touchDevice) return false;
        if (typeof navigator.canShare === "function" && !navigator.canShare(shareData)) return false;
        return true;
    }

    function flashShareButton(message) {
        const button = element("productDetailShare");
        if (!button) return;
        const original = button.textContent;
        button.textContent = message;
        button.disabled = true;
        window.setTimeout(() => {
            if (!button.isConnected) return;
            button.textContent = original || "Compartir";
            button.disabled = false;
        }, 1600);
    }

    async function shareProduct() {
        if (!product) return;
        const shareData = {
            title: `${product.name} | Kantu Floral`,
            text: `${product.name} — ${core.formatMoney(product.price)}`,
            url: window.location.href
        };

        if (shouldUseNativeShare(shareData)) {
            try {
                await navigator.share(shareData);
                setStatus("Producto compartido.", "success");
                return;
            } catch (error) {
                if (error?.name === "AbortError") return;
                console.warn("Share nativo no disponible; se copiará el enlace:", error);
            }
        }

        const copied = await copyShareLink(shareData.url);
        if (copied) {
            setStatus("✓ Enlace copiado al portapapeles para compartir.", "success");
            flashShareButton("Enlace copiado ✓");
            return;
        }

        setStatus("No pudimos copiar el enlace automáticamente. Puedes copiarlo desde la barra del navegador.", "error");
    }

    async function loadProduct() {
        const root = element("productDetailRoot");
        const params = new URLSearchParams(window.location.search);
        const id = Number(params.get("id"));

        if (!Number.isSafeInteger(id) || id <= 0) {
            document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex,follow");
            if (root) root.innerHTML = '<div class="product-detail-error"><div><strong>Producto no encontrado</strong><p>Regresa al catálogo para elegir un detalle disponible.</p></div></div>';
            return;
        }

        const { data, error } = await supabaseClient
            .from("products")
            .select("id, name, description, price, category, image, tag, size, note, stock, active")
            .eq("id", id)
            .eq("active", true)
            .maybeSingle();

        if (error || !data) {
            if (error) console.error("Error cargando producto:", error);
            document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex,follow");
            if (root) root.innerHTML = '<div class="product-detail-error"><div><strong>Producto no disponible</strong><p>Puede haber sido desactivado o ya no estar en el catálogo.</p></div></div>';
            return;
        }

        product = data;
        render(product);
    }

    async function initializeProductDetail() {
        initializeDetailHeader();
        await loadProduct();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeProductDetail, { once: true });
    } else {
        initializeProductDetail();
    }
})();
