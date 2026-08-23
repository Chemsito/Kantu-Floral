/* KANTU FLORAL - ESCENA SAKURA ROBUSTA */

(() => {
    const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
    const MOBILE = window.matchMedia("(max-width: 720px)");
    const SAKURA_VERSION = "20260823-1149";

    function ensureSakuraStyles() {
        let link = document.querySelector('link[data-kantu-sakura-style="true"]');
        if (!link) {
            link = document.createElement("link");
            link.rel = "stylesheet";
            link.dataset.kantuSakuraStyle = "true";
            document.head.appendChild(link);
        }
        link.href = `css/sakura.css?v=${SAKURA_VERSION}`;
    }

    function removeLegacyHeroPromo() {
        document.querySelector(".hero")?.remove();
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function getMotionProfile() {
        const reduced = REDUCED_MOTION.matches;
        const mobile = MOBILE.matches;

        if (reduced) {
            return {
                count: mobile ? 10 : 16,
                minSize: mobile ? 11 : 13,
                maxSize: mobile ? 17 : 21,
                minDuration: 30,
                maxDuration: 44,
                minOpacity: 0.48,
                maxOpacity: 0.68,
                maxSway: mobile ? 50 : 78,
                minSpin: 120,
                maxSpin: 240
            };
        }

        return {
            count: mobile ? 32 : 60,
            minSize: mobile ? 12 : 14,
            maxSize: mobile ? 20 : 26,
            minDuration: mobile ? 13.5 : 12.5,
            maxDuration: mobile ? 22 : 21,
            minOpacity: 0.56,
            maxOpacity: 0.88,
            maxSway: mobile ? 95 : 175,
            minSpin: 420,
            maxSpin: 860
        };
    }

    function buildPetal(profile) {
        const petal = document.createElement("span");
        petal.className = "sakura-petal";

        const direction = Math.random() > 0.5 ? 1 : -1;
        const sway = randomBetween(28, profile.maxSway) * direction;
        const opposite = sway * -0.62;
        const size = randomBetween(profile.minSize, profile.maxSize);
        const duration = randomBetween(profile.minDuration, profile.maxDuration);
        const opacity = randomBetween(profile.minOpacity, profile.maxOpacity);
        const left = randomBetween(-2, 100);
        const spin = randomBetween(profile.minSpin, profile.maxSpin) * direction;
        const delay = randomBetween(0, duration);

        Object.assign(petal.style, {
            left: `${left.toFixed(2)}vw`,
            width: `${size.toFixed(1)}px`,
            height: `${(size * 1.34).toFixed(1)}px`,
            opacity: opacity.toFixed(2)
        });

        petal.dataset.durationMs = String(Math.round(duration * 1000));
        petal.dataset.delayMs = String(Math.round(delay * 1000));
        petal.dataset.x1 = String((sway * 0.42).toFixed(1));
        petal.dataset.x2 = String(opposite.toFixed(1));
        petal.dataset.x3 = String((sway * 0.82).toFixed(1));
        petal.dataset.x4 = String((sway * 0.28).toFixed(1));
        petal.dataset.spin = String(Math.round(spin));

        return petal;
    }

    function animatePetal(petal) {
        const duration = Number(petal.dataset.durationMs) || 20000;
        const delay = Number(petal.dataset.delayMs) || 0;
        const x1 = Number(petal.dataset.x1) || 0;
        const x2 = Number(petal.dataset.x2) || 0;
        const x3 = Number(petal.dataset.x3) || 0;
        const x4 = Number(petal.dataset.x4) || 0;
        const spin = Number(petal.dataset.spin) || 540;

        if (typeof petal.animate === "function") {
            petal.style.animation = "none";
            petal.animate([
                { transform: "translate3d(0, -8vh, 0) rotate(0deg)", offset: 0 },
                { transform: `translate3d(${x1}px, 24vh, 0) rotate(${spin * 0.22}deg)`, offset: 0.24 },
                { transform: `translate3d(${x2}px, 56vh, 0) rotate(${spin * 0.48}deg)`, offset: 0.52 },
                { transform: `translate3d(${x3}px, 86vh, 0) rotate(${spin * 0.76}deg)`, offset: 0.78 },
                { transform: `translate3d(${x4}px, 116vh, 0) rotate(${spin}deg)`, offset: 1 }
            ], {
                duration,
                iterations: Infinity,
                easing: "linear",
                delay: -delay
            });
            return;
        }

        petal.classList.add("sakura-css-fallback");
        petal.style.setProperty("--left", petal.style.left);
        petal.style.setProperty("--size", petal.style.width);
        petal.style.setProperty("--opacity", petal.style.opacity);
        petal.style.setProperty("--duration", `${duration / 1000}s`);
        petal.style.setProperty("--delay", `${-delay / 1000}s`);
        petal.style.setProperty("--x1", `${x1}px`);
        petal.style.setProperty("--x2", `${x2}px`);
        petal.style.setProperty("--x3", `${x3}px`);
        petal.style.setProperty("--x4", `${x4}px`);
        petal.style.setProperty("--spin", `${spin}deg`);
    }

    function rebuildPetals(overlay) {
        const layer = overlay.querySelector(".sakura-petals");
        if (!layer) return;

        layer.getAnimations?.().forEach(animation => animation.cancel());
        layer.replaceChildren();

        const profile = getMotionProfile();
        const fragment = document.createDocumentFragment();
        const petals = [];

        for (let index = 0; index < profile.count; index += 1) {
            const petal = buildPetal(profile);
            petals.push(petal);
            fragment.appendChild(petal);
        }

        layer.appendChild(fragment);
        petals.forEach(animatePetal);
        overlay.dataset.petalCount = String(petals.length);
        overlay.dataset.reducedMotion = String(REDUCED_MOTION.matches);

        // Autocomprobación: nunca dejar la capa vacía silenciosamente.
        window.setTimeout(() => {
            if (layer.querySelectorAll(".sakura-petal").length > 0) return;
            const emergencyProfile = { ...profile, count: MOBILE.matches ? 12 : 20 };
            for (let index = 0; index < emergencyProfile.count; index += 1) {
                const petal = buildPetal(emergencyProfile);
                layer.appendChild(petal);
                animatePetal(petal);
            }
            overlay.dataset.petalCount = String(layer.querySelectorAll(".sakura-petal").length);
        }, 500);
    }

    function syncAnimationPause(overlay) {
        const animations = overlay.getAnimations?.({ subtree: true }) || [];
        if (document.hidden) animations.forEach(animation => animation.pause());
        else animations.forEach(animation => animation.play());
        overlay.classList.toggle("paused", document.hidden);
    }

    function createSakuraScene() {
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
        overlay.dataset.version = SAKURA_VERSION;
        overlay.innerHTML = '<div class="sakura-petals"></div>';

        document.body.prepend(background);
        document.body.appendChild(overlay);
        rebuildPetals(overlay);

        document.addEventListener("visibilitychange", () => syncAnimationPause(overlay));

        const rebuild = () => rebuildPetals(overlay);
        MOBILE.addEventListener?.("change", rebuild);
        REDUCED_MOTION.addEventListener?.("change", rebuild);

        window.KantuSakuraDebug = () => ({
            version: SAKURA_VERSION,
            petalCount: overlay.querySelectorAll(".sakura-petal").length,
            reducedMotion: REDUCED_MOTION.matches,
            mobile: MOBILE.matches,
            overlayDisplay: getComputedStyle(overlay).display,
            overlayZIndex: getComputedStyle(overlay).zIndex
        });
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
