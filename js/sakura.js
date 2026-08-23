/* KANTU FLORAL - ESCENA SAKURA LIGERA */

(() => {
    const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
    const MOBILE = window.matchMedia("(max-width: 720px)");

    function ensureSakuraStyles() {
        if (document.querySelector('link[data-kantu-sakura-style="true"]')) return;

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "css/sakura.css";
        link.dataset.kantuSakuraStyle = "true";
        document.head.appendChild(link);
    }

    function removeLegacyHeroPromo() {
        document.querySelector(".hero")?.remove();
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function createPetal() {
        const petal = document.createElement("span");
        petal.className = "sakura-petal";

        const direction = Math.random() > 0.5 ? 1 : -1;
        const sway = randomBetween(30, MOBILE.matches ? 82 : 150) * direction;
        const opposite = sway * -0.58;
        const size = randomBetween(MOBILE.matches ? 9 : 11, MOBILE.matches ? 17 : 22);
        const duration = randomBetween(MOBILE.matches ? 17 : 18, MOBILE.matches ? 28 : 31);

        petal.style.setProperty("--left", `${randomBetween(-3, 101).toFixed(2)}vw`);
        petal.style.setProperty("--size", `${size.toFixed(1)}px`);
        petal.style.setProperty("--opacity", randomBetween(0.46, 0.82).toFixed(2));
        petal.style.setProperty("--duration", `${duration.toFixed(2)}s`);
        petal.style.setProperty("--delay", `${(-randomBetween(0, duration)).toFixed(2)}s`);
        petal.style.setProperty("--x1", `${(sway * 0.42).toFixed(1)}px`);
        petal.style.setProperty("--x2", `${opposite.toFixed(1)}px`);
        petal.style.setProperty("--x3", `${(sway * 0.76).toFixed(1)}px`);
        petal.style.setProperty("--x4", `${(sway * 0.26).toFixed(1)}px`);
        petal.style.setProperty("--spin", `${Math.round(randomBetween(500, 900))}deg`);

        return petal;
    }

    function rebuildPetals(overlay) {
        const layer = overlay.querySelector(".sakura-petals");
        if (!layer) return;

        layer.replaceChildren();
        if (REDUCED_MOTION.matches) return;

        const count = MOBILE.matches ? 12 : 24;
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < count; index += 1) {
            fragment.appendChild(createPetal());
        }
        layer.appendChild(fragment);
    }

    function createSakuraScene() {
        if (document.getElementById("sakuraBackground") && document.getElementById("sakuraPetalsOverlay")) return;

        // Limpia la implementación anterior si quedó viva por caché/navegación parcial.
        document.getElementById("sakuraScene")?.remove();
        document.getElementById("sakuraBackground")?.remove();
        document.getElementById("sakuraPetalsOverlay")?.remove();

        const background = document.createElement("div");
        background.id = "sakuraBackground";
        background.className = "sakura-background";
        background.setAttribute("aria-hidden", "true");
        background.innerHTML = '<div class="sakura-static"></div>';

        const overlay = document.createElement("div");
        overlay.id = "sakuraPetalsOverlay";
        overlay.className = "sakura-petals-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = '<div class="sakura-petals"></div>';

        document.body.prepend(background);
        document.body.appendChild(overlay);
        rebuildPetals(overlay);

        document.addEventListener("visibilitychange", () => {
            overlay.classList.toggle("paused", document.hidden);
        });

        const rebuild = () => rebuildPetals(overlay);
        MOBILE.addEventListener?.("change", rebuild);
        REDUCED_MOTION.addEventListener?.("change", rebuild);
    }

    function initializeSakuraExperience() {
        ensureSakuraStyles();
        removeLegacyHeroPromo();
        createSakuraScene();
    }

    ensureSakuraStyles();
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeSakuraExperience, { once: true });
    } else {
        initializeSakuraExperience();
    }
})();
