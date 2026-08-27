/* Kantu Floral — recuperación segura de contraseña */

(() => {
    const MIN_PASSWORD_LENGTH = 8;
    const form = document.getElementById("newPasswordForm");
    const accessState = document.getElementById("resetAccessState");
    const message = document.getElementById("resetMessage");
    const password = document.getElementById("newPassword");
    const confirmation = document.getElementById("confirmNewPassword");
    const submit = document.getElementById("resetSubmit");
    const strength = document.getElementById("resetStrength");
    const strengthLabel = document.getElementById("resetStrengthLabel");

    if (!form || !accessState || !message || !password || !confirmation || !submit) return;

    function setAccess(text, type = "") {
        accessState.textContent = text;
        accessState.className = `reset-access-state${type ? ` ${type}` : ""}`;
    }

    function setMessage(text, type = "") {
        message.textContent = text;
        message.className = `reset-message${type ? ` ${type}` : ""}`;
    }

    function showForm() {
        form.hidden = false;
        setAccess("Enlace verificado. Ya puedes crear una nueva contraseña.", "success");
        password.focus();
    }

    function showExpired() {
        form.hidden = true;
        setAccess("Este enlace ya no es válido o expiró. Solicita uno nuevo desde Iniciar sesión → ¿Olvidaste tu contraseña?", "error");
    }

    function passwordStrength(value) {
        const text = String(value || "");
        if (!text) return { key: "", label: "Usa al menos 8 caracteres." };
        let score = 0;
        if (text.length >= MIN_PASSWORD_LENGTH) score += 1;
        if (text.length >= 12) score += 1;
        if (/[a-z]/.test(text) && /[A-Z]/.test(text)) score += 1;
        if (/\d/.test(text)) score += 1;
        if (/[^A-Za-z0-9]/.test(text)) score += 1;
        if (score >= 4) return { key: "strong", label: "Fortaleza: alta" };
        if (score >= 2) return { key: "medium", label: "Fortaleza: media" };
        return { key: "weak", label: "Fortaleza: baja" };
    }

    function refreshStrength() {
        if (!strength || !strengthLabel) return;
        const result = passwordStrength(password.value);
        strength.dataset.strength = result.key;
        strengthLabel.textContent = result.label;
    }

    function installVisibilityToggles() {
        document.querySelectorAll("[data-password-toggle]").forEach(button => {
            button.addEventListener("click", () => {
                const input = document.getElementById(button.dataset.passwordToggle || "");
                if (!(input instanceof HTMLInputElement)) return;
                const reveal = input.type === "password";
                input.type = reveal ? "text" : "password";
                button.textContent = reveal ? "Ocultar" : "Mostrar";
                button.setAttribute("aria-pressed", String(reveal));
            });
        });
    }

    async function verifyRecoveryAccess() {
        setAccess("Verificando el enlace de recuperación…");

        const current = await supabaseClient.auth.getSession();
        if (current.data?.session) {
            showForm();
            return;
        }

        let resolved = false;
        const { data: subscriptionData } = supabaseClient.auth.onAuthStateChange((event, session) => {
            if (resolved || !session) return;
            if (["PASSWORD_RECOVERY", "SIGNED_IN"].includes(event)) {
                resolved = true;
                subscriptionData?.subscription?.unsubscribe();
                showForm();
            }
        });

        window.setTimeout(async () => {
            if (resolved) return;
            const retry = await supabaseClient.auth.getSession();
            if (retry.data?.session) {
                resolved = true;
                subscriptionData?.subscription?.unsubscribe();
                showForm();
                return;
            }
            resolved = true;
            subscriptionData?.subscription?.unsubscribe();
            showExpired();
        }, 2200);
    }

    password.addEventListener("input", refreshStrength);
    installVisibilityToggles();
    refreshStrength();

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const nextPassword = password.value;
        const confirmationValue = confirmation.value;

        if (nextPassword.length < MIN_PASSWORD_LENGTH) {
            setMessage(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`, "error");
            password.focus();
            return;
        }

        if (nextPassword !== confirmationValue) {
            setMessage("Las contraseñas no coinciden.", "error");
            confirmation.focus();
            return;
        }

        submit.disabled = true;
        submit.textContent = "Cambiando contraseña…";
        setMessage("Actualizando tu contraseña…");

        try {
            const { error } = await supabaseClient.auth.updateUser({ password: nextPassword });
            if (error) throw error;

            form.reset();
            refreshStrength();
            form.hidden = true;
            setAccess("Contraseña actualizada correctamente. Te llevaremos a Kantu Floral.", "success");
            setMessage("Cambio completado.", "success");
            window.setTimeout(() => { window.location.href = "index.html"; }, 1800);
        } catch (error) {
            console.error("Error actualizando contraseña:", error);
            setMessage("No se pudo actualizar la contraseña. Solicita un nuevo enlace si este ya expiró.", "error");
            submit.disabled = false;
            submit.textContent = "Cambiar contraseña";
        }
    });

    verifyRecoveryAccess().catch(error => {
        console.error("Error verificando recuperación:", error);
        showExpired();
    });
})();
