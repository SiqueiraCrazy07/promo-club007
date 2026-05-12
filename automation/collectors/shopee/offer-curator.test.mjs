import {
  balanceCategories,
  curateOffers,
  detectCategory,
  passesQualityFilters,
  scoreOfferV2
} from "./offer-curator.js";

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`OK: ${name}`);
}

function offer(overrides = {}) {
  return {
    productName: "Organizador de Cozinha Multiuso com Divisorias",
    offerLink: "https://s.shopee.com.br/base",
    imageUrl: "https://cf.shopee.com.br/file/base",
    priceMin: "39.90",
    priceMax: "79.90",
    priceDiscountRate: "0.50",
    ratingStar: "4.8",
    sales: "420",
    commissionRate: "0.04",
    keyword: "cozinha",
    ...overrides
  };
}

const strong = offer();
const cheapFake = offer({
  productName: "Produto Oferta Top Barato",
  offerLink: "https://s.shopee.com.br/cheap",
  priceMin: "4.99",
  priceMax: "5.50",
  priceDiscountRate: "0.50",
  sales: "20"
});
const sensitive = offer({
  productName: "Produto Milagroso Emagrecedor",
  offerLink: "https://s.shopee.com.br/sensitive"
});
const equalPriceWithDiscount = offer({
  productName: "Organizador Cozinha Prateleira Multiuso Resistente",
  offerLink: "https://s.shopee.com.br/equal-price",
  priceMin: "29.95",
  priceMax: "29.95",
  priceDiscountRate: "0.50",
  sales: "380"
});
const smallSavingsHighDiscount = offer({
  productName: "Kit Limpeza Cozinha Multiuso com Escova",
  offerLink: "https://s.shopee.com.br/small-savings",
  priceMin: "29.95",
  priceMax: "31.95",
  priceDiscountRate: "0.50",
  sales: "420"
});
const electronicA = offer({
  productName: "Fone Bluetooth Smart Promo",
  offerLink: "https://s.shopee.com.br/fone-a",
  keyword: "eletronicos",
  priceMin: "49.90",
  priceMax: "89.90"
});
const electronicB = offer({
  productName: "Carregador USB Smart Rapido",
  offerLink: "https://s.shopee.com.br/fone-b",
  keyword: "eletronicos",
  priceMin: "39.90",
  priceMax: "79.90"
});

const strongScore = scoreOfferV2(strong);
const cheapScore = scoreOfferV2(cheapFake);

assert("score final existe", typeof strongScore.qualityScore === "number");
assert("score detalha conversao", typeof strongScore.metrics.conversionScore === "number");
assert("score detalha reputacao", typeof strongScore.metrics.reputationScore === "number");
assert("score detalha spam", typeof strongScore.metrics.spamScore === "number");
assert("oferta forte supera fake barato", strongScore.qualityScore > cheapScore.qualityScore);
assert("categoria detectada", detectCategory(strong).category === "casa_cozinha");
assert("oferta forte passa", passesQualityFilters(strong).ok);
assert("produto sensivel rejeita", passesQualityFilters(sensitive).reason === "blocked_terms");

const equalPriceResult = passesQualityFilters(equalPriceWithDiscount);
const equalPriceScore = scoreOfferV2(equalPriceWithDiscount);
assert("priceMin igual priceMax nao rejeita por no_real_savings", equalPriceResult.reason !== "no_real_savings");
assert("priceMin igual priceMax com discountRate valido passa", equalPriceResult.ok);
assert("priceMin igual priceMax registra economia zero", equalPriceScore.metrics.realSavings === 0);
assert("economia zero vira penalidade de score", equalPriceScore.penalties.semEconomiaReal > 0);
assert("discountRate valido gera motivo de aprovacao", equalPriceScore.approvalReasons.includes("desconto_shopee_valido"));

const smallSavingsResult = passesQualityFilters(smallSavingsHighDiscount);
const smallSavingsScore = scoreOfferV2(smallSavingsHighDiscount);
assert("economia pequena com desconto alto nao rejeita por no_real_savings", smallSavingsResult.reason !== "no_real_savings");
assert("economia pequena com desconto alto passa", smallSavingsResult.ok);
assert("economia pequena mantem score positivo", smallSavingsScore.qualityScore >= 45);

const curated = curateOffers([
  strong,
  cheapFake,
  sensitive,
  electronicA,
  electronicB,
  offer({
    productName: "Kit Potes Cozinha Organizador Multiuso",
    offerLink: "https://s.shopee.com.br/potes"
  })
]);

assert("curadoria retorna top 20 candidatos", curated.top20Candidates.length > 0);
assert("curadoria registra rejeicoes", curated.rejected.length >= 2);
assert("rejeitado detalha priceMin", Object.prototype.hasOwnProperty.call(curated.rejected[0], "priceMin"));
assert("rejeitado detalha priceMax", Object.prototype.hasOwnProperty.call(curated.rejected[0], "priceMax"));
assert("rejeitado detalha priceDiscountRate", Object.prototype.hasOwnProperty.call(curated.rejected[0], "priceDiscountRate"));
assert("rejeitado detalha qualityScore", Object.prototype.hasOwnProperty.call(curated.rejected[0], "qualityScore"));
assert("rejeitado detalha conversionScore", Object.prototype.hasOwnProperty.call(curated.rejected[0], "conversionScore"));
assert("rejeitado detalha reputationScore", Object.prototype.hasOwnProperty.call(curated.rejected[0], "reputationScore"));
assert("rejeitado detalha spamScore", Object.prototype.hasOwnProperty.call(curated.rejected[0], "spamScore"));
assert("curadoria aprova ofertas", curated.approved.length >= 2);
assert("curadoria limita selecionados", curated.selected.length <= 5);
assert("selecionados tem score detalhado", curated.selected.every((item) => item.qualityScore?.qualityScore !== undefined));
assert("log candidato tem categoria", curated.top20Candidates.every((item) => item.categoria));
assert("log candidato tem economia real", curated.top20Candidates.every((item) => typeof item.economiaReal === "number"));

const balanced = balanceCategories([strong, electronicA, electronicB], 2);
assert("balanceamento limita total", balanced.selected.length === 2);
assert("balanceamento evita duplicar eletronicos quando possivel", balanced.selected.filter((item) => item.qualityScore?.category === "eletronicos").length <= 1);
