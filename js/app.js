/* =====================================================
   KANTU FLORAL
   app.js
===================================================== */


/* =====================================================
   FAVORITOS
===================================================== */

let favorites =
    JSON.parse(
        localStorage.getItem("kantuFavorites")
    ) || [];


/* =====================================================
   FAVORITOS
===================================================== */

function toggleFavorite(productId) {

    if (favorites.includes(productId)) {

        favorites =
            favorites.filter(
                id =>
                    id !== productId
            );


        showToast(
            "Eliminado de favoritos."
        );

    } else {

        favorites.push(productId);


        showToast(
            "Agregado a favoritos ❤️"
        );

    }


    localStorage.setItem(
        "kantuFavorites",
        JSON.stringify(favorites)
    );


    renderProducts();

}


/* =====================================================
   BOTÓN FAVORITOS
===================================================== */

function initializeFavorites() {

    const favoritesButton =
        document.getElementById(
            "favoritesButton"
        );


    if (!favoritesButton) return;


    favoritesButton.addEventListener(
        "click",
        () => {

            if (favorites.length === 0) {

                showToast(
                    "Todavía no tienes favoritos."
                );

                return;

            }


            /*
             * Por ahora mostramos los productos
             * favoritos dentro del catálogo.
             */

            currentCategory = "todos";


            document
                .querySelectorAll(".category-btn")
                .forEach(button => {

                    button.classList.remove(
                        "active"
                    );

                });


            const allButton =
                document.querySelector(
                    '[data-category="todos"]'
                );


            if (allButton) {

                allButton.classList.add(
                    "active"
                );

            }


            const catalog =
                document.getElementById(
                    "catalogo"
                );


            if (catalog) {

                catalog.scrollIntoView({
                    behavior: "smooth"
                });

            }


            showFavoriteProducts();

        }
    );

}


/* =====================================================
   MOSTRAR FAVORITOS
===================================================== */

function showFavoriteProducts() {

    const productsGrid =
        document.getElementById(
            "productsGrid"
        );


    if (!productsGrid) return;


    const favoriteProducts =
        products.filter(
            product =>
                favorites.includes(
                    product.id
                )
        );


    if (favoriteProducts.length === 0) {

        renderProducts();

        return;

    }


    productsGrid.innerHTML =
        favoriteProducts.map(product => {

            return `

                <article class="product-card">

                    <div class="product-image">

                        <img
                            src="${product.image}"
                            alt="${product.name}"
                            loading="lazy"
                        >

                        <span class="product-tag">
                            Favorito
                        </span>

                        <button
                            class="favorite active"
                            onclick="toggleFavorite(${product.id})"
                        >
                            ♥
                        </button>

                    </div>


                    <div class="product-info">

                        <span class="product-category">
                            ${getCategoryName(product.category)}
                        </span>

                        <h3>
                            ${product.name}
                        </h3>

                        <p>
                            ${product.description}
                        </p>


                        <div class="product-bottom">

                            <span class="price">
                                S/ ${product.price.toFixed(2)}
                            </span>

                            <button
                                class="add-cart"
                                onclick="addToCart(${product.id})"
                            >
                                + Agregar
                            </button>

                        </div>

                    </div>

                </article>

            `;

        }).join("");

}


/* =====================================================
   TOAST
===================================================== */

let toastTimer;


function showToast(message) {

    const toast =
        document.getElementById("toast");


    if (!toast) return;


    clearTimeout(toastTimer);


    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    toastTimer =
        setTimeout(() => {

            toast.classList.remove(
                "show"
            );

        }, 3000);

}


/* =====================================================
   MENÚ MOBILE
===================================================== */

function initializeMobileMenu() {

    const mobileMenu =
        document.querySelector(
            ".mobile-menu"
        );


    const nav =
        document.querySelector(
            "nav"
        );


    if (!mobileMenu || !nav) return;


    mobileMenu.addEventListener(
        "click",
        () => {

            nav.classList.toggle(
                "mobile-open"
            );

        }
    );

}


/* =====================================================
   CERRAR MENÚ MOBILE AL SELECCIONAR
===================================================== */

function initializeMobileLinks() {

    const navLinks =
        document.querySelectorAll(
            "nav a"
        );


    const nav =
        document.querySelector(
            "nav"
        );


    navLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                if (nav) {

                    nav.classList.remove(
                        "mobile-open"
                    );

                }

            }
        );

    });

}


/* =====================================================
   INICIALIZACIÓN GENERAL
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        console.log(
            "🌸 Kantu Floral iniciado correctamente."
        );

        initializeCategories();

        initializeCart();

        initializeAuth();

        initializeFavorites();

        initializeMobileMenu();

        initializeMobileLinks();

        await loadProducts();

    }
);