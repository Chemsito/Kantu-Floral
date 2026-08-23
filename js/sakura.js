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
        // El bloque promocional anterior ya no forma parte de la experiencia.
        document.querySelector(".hero")?.remove();
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function createPetal() {
        const petal = document.createElement("span");
        petal.className = "sakura-petal";

        const direction = Math.random() > 0.5 ? 1 : -1;
        const sway = randomBetween(26, MOBILE.matches ? 72 : 130) * direction;
        const opposite = sway * -0.58;
        const size = randomBetween(MOBILE.matches ? 8 : 9, MOBILE.matches ? 15 : 18);
        const duration = randomBetween(MOBILE.matches ? 18 : 20, MOBILE.matches ? 31 : 36);

        petal.style.setProperty("--left", `${randomBetween(-3, 101).toFixed(2)}vw`);
        petal.style.setProperty("--size", `${size.toFixed(1)}px`);
        petal.style.setProperty("--opacity", randomBetween(0.34, 0.72).toFixed(2));
        petal.style.setProperty("--duration", `${duration.toFixed(2)}s`);
        petal.style.setProperty("--delay", `${(-randomBetween(0, duration)).toFixed(2)}s`);
        petal.style.setProperty("--x1", `${(sway * 0.42).toFixed(1)}px`);
        petal.style.setProperty("--x2", `${opposite.toFixed(1)}px`);
        petal.style.setProperty("--x3", `${(sway * 0.76).toFixed(1)}px`);
        petal.style.setProperty("--x4", `${(sway * 0.26).toFixed(1)}px`);
        petal.style.setProperty("--spin", `${Math.round(randomBetween(460, 820))}deg`);

        return petal;
    }

    function rebuildPetals(scene) {
        const layer = scene.querySelector(".sakura-petals");
        if (!layer) return;

        layer.replaceChildren();
        if (REDUCED_MOTION.matches) return;

        const count = MOBILE.matches ? 9 : 18;
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < count; index += 1) {
            fragment.appendChild(createPetal());
        }
        layer.appendChild(fragment);
    }

    function createSakuraScene() {
        if (document.getElementById("sakuraScene")) return;

        const scene = document.createElement("div");
        scene.id = "sakuraScene";
        scene.className = "sakura-scene";
        scene.setAttribute("aria-hidden", "true");
        scene.innerHTML = '<div class="sakura-static"></div><div class="sakura-petals"></div>';

        document.body.prepend(scene);
        rebuildPetals(scene);

        document.addEventListener("visibilitychange", () => {
            scene.classList.toggle("paused", document.hidden);
        });

        const rebuild = () => rebuildPetals(scene);
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
