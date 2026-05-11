import {
  filterAndRankOffers,
  formatPrice,
  offerToSheetRow,
  scoreOfferV2,
  toNumber
} from "./collect-shopee-offers.js";

function assert(name, condition) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`OK: ${name}`);
}

assert("29.95 -> 29.95", toNumber("29.95") === 29.95);
assert("29,95 -> 29.95", toNumber("29,95") === 29.95);
assert("1,299.90 -> 1299.90", toNumber("1,299.90") === 1299.9);
assert("1.299,90 -> 1299.90", toNumber("1.299,90") === 1299.9);
assert("formatPrice decimal US", formatPrice("29.95").includes("29,95"));
assert("formatPrice decimal BR", formatPrice("29,95").includes("29,95"));
assert("formatPrice mixed US", formatPrice("1,299.90").includes("1.299,90"));
assert("formatPrice mixed BR", formatPrice("1.299,90").includes("1.299,90"));

const goodOffer = {
  productName: "Organizador de Cozinha Multiuso com Divisorias",
  offerLink: "https://s.shopee.com.br/organizador",
  imageUrl: "https://cf.shopee.com.br/file/organizador",
  priceMin: "29.95",
  priceMax: "59.90",
  priceDiscountRate: "0.50",
  ratingStar: "4.8",
  sales: "350",
  commissionRate: "0.04",
  keyword: "cozinha"
};

const expensiveOffer = {
  ...goodOffer,
  productName: "Kit Smart Casa Completa com Sensor",
  offerLink: "https://s.shopee.com.br/smart",
  priceMin: "1,299.90",
  priceMax: "1.999,90",
  priceDiscountRate: "0.35",
  sales: "800",
  keyword: "smart"
};

const weakOffer = {
  ...goodOffer,
  productName: "Produto Oferta Top",
  offerLink: "https://s.shopee.com.br/fraco",
  priceMin: "29,95",
  priceMax: "30,95",
  priceDiscountRate: "0.05",
  sales: "2"
};

const goodScore = scoreOfferV2(goodOffer);
const weakScore = scoreOfferV2(weakOffer);

assert("score usa preco promocional correto", goodScore.metrics.promoPrice === 29.95);
assert("score usa economia real correta", goodScore.metrics.realSavings === 29.95);
assert("score bom supera fraco", goodScore.score > weakScore.score);

const ranked = filterAndRankOffers([weakOffer, expensiveOffer, goodOffer]);
assert("ranking aprova ofertas validas", ranked.approved.length >= 2);
assert("ranking ordena por score", ranked.approved[0].qualityScore.score >= ranked.approved[1].qualityScore.score);

const row = offerToSheetRow(goodOffer);
assert("append row mantem 8 colunas", row.length === 8);
assert("append row status pendente", row[0] === "pendente");
assert("append row preco normal", row[4].includes("59,90"));
assert("append row preco promocional normal", row[5].includes("29,95"));
