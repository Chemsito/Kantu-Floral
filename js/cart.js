/* =====================================================
   KANTU FLORAL
   cart.js
===================================================== */


/* =====================================================
   ESTADO DEL CARRITO
===================================================== */

let cart =
    JSON.parse(
        localStorage.getItem("kantuCart")
    ) || [];

/* =====================================================
   USUARIO ACTUAL
===================================================== */

async function getCurrentUser() {

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    return user;

}


/* =====================================================
   CARGAR CARRITO DESDE SUPABASE
===================================================== */

async function loadCartFromSupabase() {

    const user =
        await getCurrentUser();

    if (!user) return;

    const {
        data,
        error
    } = await supabaseClient
        .from("cart_items")
        .select(`
            product_id,
            quantity
        `)
        .eq(
            "user_id",
            user.id
        );

    if (error) {

        console.error(
            "Error cargando carrito:",
            error
        );

        return;

    }

    cart =
        data.map(item => ({
            id: item.product_id,
            quantity: item.quantity
        }));

    saveCart();

    updateCart();

}


/* =====================================================
   GUARDAR ITEM EN SUPABASE
===================================================== */

async function saveItemToSupabase(
    productId,
    quantity
) {

    const user =
        await getCurrentUser();

    if (!user) return;

    const {
        error
    } = await supabaseClient
        .from("cart_items")
        .upsert({
            user_id: user.id,
            product_id: productId,
            quantity: quantity
        });

    if (error) {

        console.error(
            "Error guardando carrito:",
            error
        );

    }

}


/* =====================================================
   ELIMINAR ITEM DE SUPABASE
===================================================== */

async function removeItemFromSupabase(
    productId
) {

    const user =
        await getCurrentUser();

    if (!user) return;

    const {
        error
    } = await supabaseClient
        .from("cart_items")
        .delete()
        .eq(
            "user_id",
            user.id
        )
        .eq(
            "product_id",
            productId
        );

    if (error) {

        console.error(
            "Error eliminando item:",
            error
        );

    }

}

/* =====================================================
   AGREGAR AL CARRITO
===================================================== */

function addToCart(productId) {

    const product =
        products.find(
            product =>
                product.id === productId
        );


    if (!product) return;


    const existing =
        cart.find(
            item =>
                item.id === productId
        );


    if (existing) {

        existing.quantity++;

    } else {

        cart.push({
            id: product.id,
            quantity: 1
        });

    }


saveCart();

updateCart();

const currentItem =
    cart.find(
        item =>
            item.id === productId
    );

saveItemToSupabase(
    productId,
    currentItem.quantity
);

showToast(
    `${product.name} fue agregado al carrito.`
);

}


/* =====================================================
   CAMBIAR CANTIDAD
===================================================== */

function changeQuantity(productId, amount) {

    const item =
        cart.find(
            item =>
                item.id === productId
        );


    if (!item) return;


    item.quantity += amount;


if (item.quantity <= 0) {

    cart =
        cart.filter(
            item =>
                item.id !== productId
        );

    removeItemFromSupabase(
        productId
    );

} else {

    saveItemToSupabase(
        productId,
        item.quantity
    );

}


    saveCart();

    updateCart();

}


/* =====================================================
   ELIMINAR DEL CARRITO
===================================================== */

function removeFromCart(productId) {

cart =
    cart.filter(
        item =>
            item.id !== productId
    );

removeItemFromSupabase(
    productId
);

saveCart();

updateCart();

}


/* =====================================================
   GUARDAR CARRITO
===================================================== */

function saveCart() {

    localStorage.setItem(
        "kantuCart",
        JSON.stringify(cart)
    );

}


/* =====================================================
   ACTUALIZAR CARRITO
===================================================== */

function updateCart() {

    const cartItems =
        document.getElementById("cartItems");

    const cartCount =
        document.getElementById("cartCount");

    const cartTotal =
        document.getElementById("cartTotal");


    if (!cartItems) return;


    const totalItems =
        cart.reduce(
            (total, item) =>
                total + item.quantity,
            0
        );


    cartCount.textContent =
        totalItems;


    if (cart.length === 0) {

        cartItems.innerHTML = `

            <div class="empty-cart">

                <span>🌷</span>

                <h3>
                    Tu carrito está vacío
                </h3>

                <p>
                    Agrega flores para comenzar.
                </p>

            </div>

        `;


        cartTotal.textContent =
            "S/ 0.00";


        return;

    }


    let total = 0;


    cartItems.innerHTML =
        cart.map(item => {

            const product =
                products.find(
                    product =>
                        product.id === item.id
                );


            if (!product) return "";


            const subtotal =
                product.price *
                item.quantity;


            total += subtotal;


            return `

                <div class="cart-item">

                    <img
                        src="${product.image}"
                        alt="${product.name}"
                    >

                    <div class="cart-item-info">

                        <h4>
                            ${product.name}
                        </h4>

                        <div class="cart-item-price">
                            S/ ${product.price.toFixed(2)}
                        </div>


                        <div class="quantity-controls">

                            <button
                                onclick="changeQuantity(${product.id}, -1)"
                            >
                                −
                            </button>

                            <span>
                                ${item.quantity}
                            </span>

                            <button
                                onclick="changeQuantity(${product.id}, 1)"
                            >
                                +
                            </button>

                        </div>

                    </div>


                    <button
                        class="remove-item"
                        onclick="removeFromCart(${product.id})"
                        title="Eliminar producto"
                    >
                        🗑
                    </button>

                </div>

            `;

        }).join("");


    cartTotal.textContent =
        `S/ ${total.toFixed(2)}`;

}


/* =====================================================
   ABRIR CARRITO
===================================================== */

function openCart() {

    const cartPanel =
        document.getElementById("cartPanel");


    if (cartPanel) {

        cartPanel.classList.add("show");

    }

}


/* =====================================================
   CERRAR CARRITO
===================================================== */

function closeCart() {

    const cartPanel =
        document.getElementById("cartPanel");


    if (cartPanel) {

        cartPanel.classList.remove("show");

    }

}


/* =====================================================
   CHECKOUT
===================================================== */

async function checkout() {

    if (cart.length === 0) {

        showToast(
            "Tu carrito está vacío."
        );

        return;

    }


    const {
        data: { user }
    } = await supabaseClient.auth.getUser();


    if (!user) {

        closeCart();

        openAuth("login");


        showToast(
            "Inicia sesión para continuar con tu compra."
        );


        return;

    }


    openCheckout(user);

}


/* =====================================================
   INICIALIZAR BOTÓN DEL CARRITO
===================================================== */

function initializeCart() {

    const cartButton =
        document.getElementById("cartButton");

    if (cartButton) {

        cartButton.addEventListener(
            "click",
            openCart
        );

    }

    updateCart();

    loadCartFromSupabase();

}