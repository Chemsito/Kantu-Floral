import fs from "node:fs";

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const js = read("js/ui-polish.js");
const css = read("css/brand-experience.css");
const brandCss = read("css/brand.css");
const stylesCss = read("css/styles.css");
const mobileCss = read("css/mobile.css");
const customerUxJs = read("js/customer-ux.js");
const appJs = read("js/app.js");
const experienceLoader = read("js/experience-loader.js");
const indexHtml = read("index.html");
const productHtml = read("producto.html");

const jsContracts = [
    ["KantuDialog", "custom dialog API"],
    ["data-admin-delete-product", "Admin native-confirm adapter"],
    ["data-occasion-delete", "occasion native-confirm adapter"],
    ["dataset.kantuTooltip", "tooltip migration"],
    ["enhanceLeaflet", "Leaflet integration"],
    ["installCatalogSkeleton", "catalog skeleton"],
    ["ensureCheckoutMobileBar", "mobile checkout bar"],
    ["total.textContent !== nextTotal", "mobile checkout DOM write guard"],
    ["action.textContent !== nextLabel", "mobile checkout label write guard"],
    ["showBrandToast", "toast system"],
    ["initializeHeaderNavigation", "header active state"],
    ["Peluche hipoalergénico grande", "large plush real-catalog lookup"],
    ["refreshGiftUpsell", "gift upsell refresh"],
    ["enhanceIcons", "icon system"]
];

for (const [needle, label] of jsContracts) {
    assert(js.includes(needle), `Missing ${label}: ${needle}`);
}

const cssContracts = [
    ["--kantu-space-1", "spacing tokens"],
    ["--kantu-radius-lg", "radius tokens"],
    ["--kantu-motion-base", "motion tokens"],
    [".kantu-dialog-overlay", "dialog styling"],
    ["[data-kantu-tooltip]", "tooltip styling"],
    [".leaflet-control-zoom", "map styling"],
    [".kantu-product-skeleton", "skeleton styling"],
    [".product-card", "product card polish"],
    [".checkout-upsell-info strong", "upsell product-name styling"],
    ["white-space: normal !important", "full upsell/product names"],
    [".kantu-checkout-mobile-bar", "mobile checkout sticky action"],
    [".admin-product-card", "Admin polish"],
    [".staff-section", "Staff polish"],
    [".kantu-toast-stack", "toast styling"],
    [".site-header.kantu-scrolled", "header polish"],
    ["prefers-reduced-motion", "accessible motion fallback"]
];

for (const [needle, label] of cssContracts) {
    assert(css.includes(needle), `Missing ${label}: ${needle}`);
}

assert(indexHtml.includes('<main id="inicio">'), "Storefront needs a stable #inicio anchor without a hero wrapper");
assert(!indexHtml.includes('<section class="hero"'), "Legacy hero must not exist in index.html");
assert(!indexHtml.includes("Haz que cada momento florezca."), "Legacy hero copy must not remain in source");
assert(indexHtml.includes('data-kantu-ui-polish="true"'), "UI polish CSS must be available before first paint");
assert(indexHtml.includes('data-kantu-ui-polish-select="true"'), "Select CSS must be available before first paint");
assert(indexHtml.includes('data-kantu-brand-experience="true"'), "Brand experience CSS must be available before first paint");
assert(indexHtml.includes('data-kantu-customer-ux-style="true"'), "Customer UX CSS must be declarative");
assert(indexHtml.includes('data-kantu-runtime-integrity-style="true"'), "Runtime integrity CSS must be declarative");
assert(productHtml.includes('data-kantu-brand-experience="true"'), "Product detail must preload brand experience CSS");

assert(brandCss.includes(".site-header"), "Brand header rules must be scoped to .site-header");
assert(!brandCss.includes("HERO DE MARCA"), "Obsolete brand hero CSS must be removed");
assert(!brandCss.includes("707398768_122100348543339245"), "Obsolete brand hero image must be removed");
assert(!brandCss.includes(".hero {"), "Transitional hero guard must be removed after source cleanup");
assert(!stylesCss.includes("images.unsplash.com/photo-1490750967868-88aa4486c946"), "Old Unsplash hero image must be removed");
assert(!stylesCss.includes(".hero-content"), "Legacy base hero styles must be removed");
assert(!mobileCss.includes(".hero-content"), "Legacy mobile hero styles must be removed");
assert(!customerUxJs.includes("syncHeroForSession"), "Dead hero session logic must be removed");
assert(!customerUxJs.includes("initializeHeroSessionBehavior"), "Dead hero session initializer must be removed");
assert(!appJs.includes("loadKantuBrandIdentity"), "Runtime brand metadata duplication must be removed");
assert(!appJs.includes("ensureSeoMetadata"), "Runtime SEO metadata duplication must be removed");
assert(!experienceLoader.includes("removeLegacyHero"), "Runtime hero remover must disappear once source is clean");
assert(!experienceLoader.includes("loadStyleOnce"), "Core visual CSS should no longer be injected by experience-loader");

console.log("Brand experience and legacy cleanup contracts OK");
