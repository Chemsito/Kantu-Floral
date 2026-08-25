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
const customerUxCss = read("css/customer-ux.css");
const experienceLoader = read("js/experience-loader.js");

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

assert(brandCss.includes(".site-header"), "Brand header rules must be scoped to .site-header");
assert(!brandCss.includes("HERO DE MARCA"), "Obsolete brand hero CSS must be removed");
assert(!brandCss.includes("707398768_122100348543339245"), "Obsolete brand hero image must be removed");
assert(brandCss.includes("display: none !important"), "First-paint guard must hide the legacy hero before runtime cleanup");
assert(!customerUxCss.includes("El bloque promocional del hero"), "Late customer-UX hero hide must be removed");
assert(experienceLoader.includes("function removeLegacyHero"), "Experience loader must remove the legacy hero from the runtime DOM");
assert(experienceLoader.includes('body:not(.product-detail-page) > main > .hero'), "Legacy hero cleanup must be storefront-scoped");

console.log("Brand experience contracts OK");
