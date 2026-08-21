/* =====================================================
   KANTU FLORAL
   auth.js
   AUTENTICACIÓN REAL CON SUPABASE
===================================================== */


/* =====================================================
   ABRIR MODAL DE AUTENTICACIÓN
===================================================== */

function openAuth(type = "login") {

    const authModal =
        document.getElementById("authModal");

    if (!authModal) return;

    authModal.classList.add("show");

    switchAuth(type);
}


/* =====================================================
   CERRAR MODAL
===================================================== */

function closeAuth() {

    const authModal =
        document.getElementById("authModal");

    if (authModal) {

        authModal.classList.remove("show");

    }

}


/* =====================================================
   CAMBIAR ENTRE LOGIN / REGISTRO
===================================================== */

function switchAuth(type) {

    const loginForm =
        document.getElementById("loginForm");

    const registerForm =
        document.getElementById("registerForm");

    const forgotForm =
        document.getElementById("forgotForm");


    if (!loginForm ||
        !registerForm ||
        !forgotForm) {

        return;

    }


    loginForm.style.display =
        type === "login"
            ? "block"
            : "none";


    registerForm.style.display =
        type === "register"
            ? "block"
            : "none";


    forgotForm.style.display =
        type === "forgot"
            ? "block"
            : "none";

}


/* =====================================================
   REGISTRO REAL
===================================================== */

async function register(event) {

    event.preventDefault();


    const name =
        document
            .getElementById("registerName")
            .value
            .trim();


    const email =
        document
            .getElementById("registerEmail")
            .value
            .trim()
            .toLowerCase();


    const password =
        document
            .getElementById("registerPassword")
            .value;


    const confirmPassword =
        document
            .getElementById("registerConfirm")
            .value;


    /* ---------------------------------------------
       VALIDACIONES
    --------------------------------------------- */

    if (!name) {

        showToast(
            "Ingresa tu nombre."
        );

        return;

    }


    if (password.length < 6) {

        showToast(
            "La contraseña debe tener al menos 6 caracteres."
        );

        return;

    }


    if (password !== confirmPassword) {

        showToast(
            "Las contraseñas no coinciden."
        );

        return;

    }


    /* ---------------------------------------------
       REGISTRO EN SUPABASE
    --------------------------------------------- */

    const {
        data,
        error
    } = await supabaseClient.auth.signUp({

        email: email,

        password: password,

        options: {

            data: {

                full_name: name

            }

        }

    });


    /* ---------------------------------------------
       ERROR
    --------------------------------------------- */

    if (error) {

        console.error(
            "Error de registro:",
            error
        );


        showToast(
            error.message
        );


        return;

    }


    /* ---------------------------------------------
       REGISTRO CORRECTO
    --------------------------------------------- */

    console.log(
        "Usuario registrado:",
        data
    );


    closeAuth();


    showToast(
        "Cuenta creada. Revisa tu correo para confirmar tu cuenta. 📧"
    );

}


/* =====================================================
   LOGIN REAL
===================================================== */

async function login(event) {

    event.preventDefault();


    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim()
            .toLowerCase();


    const password =
        document
            .getElementById("loginPassword")
            .value;


    const {
        data,
        error
    } = await supabaseClient.auth
        .signInWithPassword({

            email: email,

            password: password

        });


    if (error) {

        console.error(
            "Error de login:",
            error
        );


        showToast(
            "Correo o contraseña incorrectos."
        );


        return;

    }


    console.log(
        "Sesión iniciada:",
        data
    );


    closeAuth();


    updateUserButton();


    showToast(
        "¡Bienvenido/a a Kantu Floral! 🌸"
    );

}


/* =====================================================
   RECUPERAR CONTRASEÑA
===================================================== */

function openForgotPassword() {

    switchAuth("forgot");

}


/* =====================================================
   ENVIAR CORREO DE RECUPERACIÓN
===================================================== */

async function recoverPassword(event) {

    event.preventDefault();

    const email =
        document
            .getElementById("recoveryEmail")
            .value
            .trim()
            .toLowerCase();

    const {
        error
    } =
        await supabaseClient.auth
            .resetPasswordForEmail(
                email,
                {
                    redirectTo:
                        window.location.origin +
                        "/reset-password.html"
                }
            );

    if (error) {

        console.error(error);

        showToast(
            error.message
        );

        return;

    }

    showToast(
        "Revisa tu correo para restablecer tu contraseña."
    );

    setTimeout(() => {

        switchAuth("login");

    }, 2500);

}


/* =====================================================
   CERRAR SESIÓN
===================================================== */

async function logout() {

    const {
        error
    } = await supabaseClient.auth.signOut();


    if (error) {

        console.error(
            "Error cerrando sesión:",
            error
        );


        showToast(
            "No se pudo cerrar la sesión."
        );


        return;

    }


    updateUserButton();


    showToast(
        "Sesión cerrada correctamente."
    );

}


/* =====================================================
   OBTENER USUARIO ACTUAL
===================================================== */

async function getCurrentUser() {

    const {
        data,
        error
    } = await supabaseClient.auth
        .getUser();


    if (error) {

        return null;

    }


    return data.user || null;

}


/* =====================================================
   ACTUALIZAR BOTÓN DE USUARIO
===================================================== */

async function updateUserButton() {

    const loginButton =
        document.getElementById(
            "loginButton"
        );


    if (!loginButton) return;


    const user =
        await getCurrentUser();


    if (!user) {

        loginButton.textContent =
            "Iniciar sesión";


        loginButton.onclick =
            () => openAuth("login");


        return;

    }


    const { data: profile } =
        await supabaseClient
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();


    const name =
        profile?.full_name ||
        user.user_metadata?.full_name;


    loginButton.textContent =
        name
            ? name.split(" ")[0]
            : "Mi cuenta";


    loginButton.onclick =
        () => openAccount();

}


/* =====================================================
   DETECTAR CAMBIOS DE SESIÓN
===================================================== */

function initializeAuthState() {

    supabaseClient.auth
        .onAuthStateChange(
            async (event, session) => {

                console.log(
                    "Cambio de autenticación:",
                    event
                );


                await updateUserButton();


                if (event === "SIGNED_IN") {

                    console.log(
                        "Usuario conectado:",
                        session?.user?.email
                    );

                }


                if (event === "SIGNED_OUT") {

                    if (typeof closeAccount === "function") {
                        closeAccount();
                    }

                    console.log(
                        "Usuario desconectado."
                    );

                }

            }
        );

}


/* =====================================================
   INICIALIZAR AUTENTICACIÓN
===================================================== */

function initializeAuth() {

    const loginButton =
        document.getElementById(
            "loginButton"
        );


    if (loginButton) {
        loginButton.onclick =
            () => openAuth("login");
    }


    const authModal =
        document.getElementById(
            "authModal"
        );


    if (authModal) {

        authModal.addEventListener(
            "click",
            event => {

                if (
                    event.target === authModal
                ) {

                    closeAuth();

                }

            }
        );

    }


    updateUserButton();

    initializeAuthState();

}

/* =====================================================
   LOGIN CON GOOGLE
===================================================== */

async function socialLogin(provider) {

    if (provider !== "Google") {

        showToast(
            "Este método de acceso todavía no está disponible."
        );

        return;

    }


    const {
        data,
        error
    } = await supabaseClient.auth.signInWithOAuth({

        provider: "google",

        options: {

            redirectTo:
                window.location.origin +
                "/index.html"

        }

    });


    if (error) {

        console.error(
            "Error al iniciar sesión con Google:",
            error
        );

        showToast(
            "No se pudo iniciar sesión con Google."
        );

    }

}
