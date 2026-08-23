import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const flow = read("js/checkout-flow.js");
const loader = read("js/experience-loader.js");
const gifting = read("js/checkout-gifting.js");
const orders = read("js/orders.js");
const css = read("css/checkout-flow.css");

assert(flow.includes("checkoutFlowProgress"), "checkout progress indicator is missing");
assert(flow.includes("checkoutBuyerFlowSection"), "buyer section is missing");
assert(flow.includes("checkoutDifferentRecipientToggle"), "recipient simplification control is missing");
assert(flow.includes("checkoutDeliveryFlowSection"), "delivery section is missing");
assert(flow.includes("checkoutReviewFlowSection"), "review section is missing");
assert(flow.includes("No se cobrará nada al pulsar este botón"), "payment trust note is missing");
assert(flow.includes("Crear pedido y elegir pago"), "checkout CTA must distinguish order creation from payment");
assert(flow.includes("normalizeSchedulePlacement"), "late schedule initialization must remain supported");
assert(flow.includes("MutationObserver"), "checkout flow must tolerate dynamic sidecars");

assert(loader.includes('loadScriptOnce("js/checkout-flow.js"'), "experience loader must load checkout-flow.js");
assert(gifting.includes("form.onsubmit = submitGiftOrder"), "gift-aware server-side order submission must remain authoritative");
assert(orders.includes('supabaseClient.rpc("quote_delivery_fee"'), "server-side delivery quote must remain intact");
assert(orders.includes("currentDeliveryQuote.service_available"), "checkout must still require a valid delivery quote");
assert(css.includes("#checkoutForm.checkout-simplified"), "simplified checkout layout is missing");
assert(css.includes("@media (max-width: 760px)"), "simplified checkout needs a mobile layout");

console.log("Checkout simplification contracts OK");
