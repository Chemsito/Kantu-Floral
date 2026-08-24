/* Kantu Floral - creación invitada atómica cuando hay personalizaciones */

(() => {
    if (typeof supabaseClient === "undefined" || !supabaseClient?.functions?.invoke) return;
    if (supabaseClient.functions.invoke.__kantuGuestCustomizationRouter) return;

    const previousInvoke = supabaseClient.functions.invoke.bind(supabaseClient.functions);

    const routedInvoke = async function guestCustomizationRouter(functionName, options = {}) {
        if (functionName === "guest-checkout" && options?.body?.action === "create") {
            const customizations = window.KantuProductCustomizations?.payload?.() || {};
            const body = { ...options.body, customizations };
            return previousInvoke("guest-order-create", { ...options, body });
        }
        return previousInvoke(functionName, options);
    };

    routedInvoke.__kantuGuestCustomizationRouter = true;
    supabaseClient.functions.invoke = routedInvoke;
})();
