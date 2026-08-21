/* =====================================================
   KANTU FLORAL
   products.js
   Catálogo conectado a Supabase
===================================================== */

let products = [];

let currentCategory = "todos";


/* =====================================================
   CATEGORÍAS
===================================================== */

function getCategoryName(category) {

    const categories = {

        ramos: "Ramos",

        arreglos: "Arreglos",

        rosas: "Rosas",

        especiales: "Especiales"

    };

    return categories[category] || category;
}


/* =====================================================
   CARGAR PRODUCTOS DESDE SUPABASE
===================================================== */

async function loadProducts() {

    try {

        const { data, error } =
            await supabaseClient
                .from("products")
                .select("*")
                .eq("active", true)
                .order("id", {
                    ascending: true
                });


        if (error) {

            console.error(
                "Error cargando productos:",
                error
            );

            showToast(
                "No se pudieron cargar los productos."
            );

            return;

        }


        products = data || [];


        renderProducts();

if (typeof updateCart === "function") {
    updateCart();
}

    } catch (error) {

        console.error(error);

        showToast(
            "Ocurrió un error al cargar el catálogo."
        );

    }

}


/* =====================================================
   RENDERIZAR PRODUCTOS
===================================================== */

function renderProducts() {

    const productsGrid =
        document.getElementById("productsGrid");


    if (!productsGrid) return;


    const filteredProducts =
        currentCategory === "todos"

            ? products

            : products.filter(
                product =>
                    product.category === currentCategory
            );


    if (filteredProducts.length === 0) {

        productsGrid.innerHTML = `

            <div style="
                grid-column: 1 / -1;
                text-align: center;
                padding: 50px;
            ">

                <h3>
                    No encontramos productos.
                </h3>

                <p>
                    Prueba otra categoría.
                </p>

            </div>

        `;

        return;

    }


    productsGrid.innerHTML =
        filteredProducts
            .map(product => {

                const isFavorite =
                    typeof favorites !== "undefined" &&
                    favorites.includes(product.id);


                return `

                    <article class="product-card">

                        <div class="product-image">

                            <img
                                src="${product.image}"
                                alt="${product.name}"
                                loading="lazy"
                            >

                            <span class="product-tag">
                                ${product.tag || ""}
                            </span>


                            <button
                                class="favorite ${
                                    isFavorite
                                        ? "active"
                                        : ""
                                }"
                                onclick="toggleFavorite(${product.id})"
                                aria-label="Agregar a favoritos"
                            >
                                ${
                                    isFavorite
                                        ? "♥"
                                        : "♡"
                                }
                            </button>

                        </div>


                        <div class="product-info">

                            <span class="product-category">
                                ${getCategoryName(
                                    product.category
                                )}
                            </span>


                            <h3>
                                ${product.name}
                            </h3>


                            <p>
                                ${product.description || ""}
                            </p>


                            <div class="product-bottom">

                                <span class="price">
                                    S/
                                    ${Number(
                                        product.price
                                    ).toFixed(2)}
                                </span>


                                <button
                                    class="add-cart"
                                    onclick="addToCart(${product.id})"
                                    ${
                                        product.stock <= 0
                                            ? "disabled"
                                            : ""
                                    }
                                >

                                    ${
                                        product.stock > 0
                                            ? "+ Agregar"
                                            : "Agotado"
                                    }

                                </button>

                            </div>

                        </div>

                    </article>

                `;

            })
            .join("");

}


/* =====================================================
   FILTROS
===================================================== */

function initializeCategories() {

    const categoryButtons =
        document.querySelectorAll(
            ".category-btn"
        );


    categoryButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                categoryButtons.forEach(
                    btn =>
                        btn.classList.remove(
                            "active"
                        )
                );


                button.classList.add(
                    "active"
                );


                currentCategory =
                    button.dataset.category;


                renderProducts();

            }
        );

    });

}