/* =====================================================
   KANTU FLORAL
   auth.js
   AUTENTICACIÓN REAL CON SUPABASE
===================================================== */

const KANTU_MIN_PASSWORD_LENGTH = 8;

function getAppUrl(path = "") {
    const isGitHubPages = window.location.hostname.endsWith(".github.io");
    const baseUrl = isGitHubPages
        ? `${window.location.origin}/Kantu-Floral/`
        : `${window.location.origin}/`;
    const normalizedPath = String(path).replace(/^\/+/, "");
    return new URL(normalizedPath, baseUrl).href;
}

function openAuth(type = "login") {
    const authModal = document.getElementById("authModal");
    if (!authModal) return;
    authModal.classList.add("show");
    switchAuth(type);
}

function closeAuth() {
    document.getElementById("authModal")?.classList.remove("show");
}

function switchAuth(type) {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const forgotForm = document.getElementById("forgotForm");
    if (!loginForm || !registerForm || !forgotForm) return;

    loginForm.style.display = type === "login" ? "block" : "none";
    registerForm.style.display = type === "register" ? "block" : "none";
    forgotForm.style.display = type === "forgot" ? "block" : "none";
}

async function register(event) {
    event.preventDefault();

    const name = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim().toLowerCase();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("registerConfirm").value;

    if (!name) {
        showToast("Ingresa tu nombre.");
        return;
    }

    if (password.length < KANTU_MIN_PASSWORD_LENGTH) {
        showToast(`La contraseña debe tener al menos ${KANTU_MIN_PASSWORD_LENGTH} caracteres.`);
        return;
    }

    if (password !== confirmPassword) {
        showToast("Las contraseñas no coinciden.");
        return;
    }

    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
    });

    if (error) {
        console.error("Error de registro:", error);
        showToast(error.message);
        return;
    }

    closeAuth();
    showToast("Cuenta creada. Revisa tu correo para confirmar tu cuenta. 📧");
}

async function login(event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        console.error("Error de login:", error);
        showToast("Correo o contraseña incorrectos.");
        return;
    }

    closeAuth();
    await updateUserButton();
    showToast("¡Bienvenido/a a Kantu Floral! 🌸");
}

function openForgotPassword() {
    switchAuth("forgot");
}

async function recoverPassword(event) {
    event.preventDefault();
    const email = document.getElementById("recoveryEmail").value.trim().toLowerCase();

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: getAppUrl("reset-password.html")
    });

    if (error) {
        console.error("Error solicitando recuperación:", error);
        showToast("No pudimos enviar el correo de recuperación.");
        return;
    }

    showToast("Revisa tu correo para restablecer tu contraseña.");
    setTimeout(() => switchAuth("login"), 2500);
}

async function logout() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Error cerrando sesión:", error);
        showToast("No se pudo cerrar la sesión.");
        return;
    }

    await updateUserButton();
    showToast("Sesión cerrada correctamente.");
}

async function getCurrentUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) return null;
    return data.user || null;
}

async function updateUserButton() {
    const loginButton = document.getElementById("loginButton");
    if (!loginButton) return;

    const user = await getCurrentUser();
    if (!user) {
        loginButton.textContent = "Iniciar sesión";
        loginButton.onclick = () => openAuth("login");
        return;
    }

    const { data: profile } = await supabaseClient
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

    const name = profile?.full_name || user.user_metadata?.full_name;
    loginButton.textContent = name ? name.split(" ")[0] : "Mi cuenta";
    loginButton.onclick = () => openAccount();
}

function initializeAuthState() {
    supabaseClient.auth.onAuthStateChange(async event => {
        await updateUserButton();

        if (["SIGNED_IN", "SIGNED_OUT"].includes(event) && typeof loadCartFromSupabase === "function") {
            await loadCartFromSupabase();
        }

        if (event === "SIGNED_OUT" && typeof closeAccount === "function") {
            closeAccount();
        }
    });
}

function configurePasswordInputs() {
    const password = document.getElementById("registerPassword");
    const confirmation = document.getElementById("registerConfirm");

    if (password) {
        password.minLength = KANTU_MIN_PASSWORD_LENGTH;
        password.placeholder = `Mínimo ${KANTU_MIN_PASSWORD_LENGTH} caracteres`;
        password.autocomplete = "new-password";
    }

    if (confirmation) {
        confirmation.minLength = KANTU_MIN_PASSWORD_LENGTH;
        confirmation.autocomplete = "new-password";
    }
}

function initializeAuth() {
    const loginButton = document.getElementById("loginButton");
    if (loginButton) loginButton.onclick = () => openAuth("login");

    const authModal = document.getElementById("authModal");
    if (authModal) {
        authModal.addEventListener("click", event => {
            if (event.target === authModal) closeAuth();
        });
    }

    configurePasswordInputs();
    updateUserButton();
    initializeAuthState();
}

async function socialLogin(provider) {
    if (provider !== "Google") {
        showToast("Este método de acceso todavía no está disponible.");
        return;
    }

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getAppUrl("index.html") }
    });

    if (error) {
        console.error("Error al iniciar sesión con Google:", error);
        showToast("No se pudo iniciar sesión con Google.");
    }
}
