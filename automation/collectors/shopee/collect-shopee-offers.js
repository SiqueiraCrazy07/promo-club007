import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { google } from "googleapis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const automationRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(automationRoot, "config", ".env"), quiet: true });

const SHOPEE_ENDPOINT =
  process.env.SHOPEE_ENDPOINT || "https://open-api.affiliate.shopee.com.br/graphql";
const DEFAULT_KEYWORDS = [
  "casa",
  "cozinha",
  "organizador",
  "eletronicos",
  "beleza",
  "moda",
  "oferta"
];
const MAX_OFFERS_PER_RUN = Number(process.env.SHOPEE_MAX_OFFERS_PER_RUN || 5);
const SEARCH_LIMIT = Number(process.env.SHOPEE_SEARCH_LIMIT || 20);
const SEARCH_PAGE = Number(process.env.SHOPEE_SEARCH_PAGE || 1);
const RECENT_ROWS_LIMIT = Number(process.env.SHOPEE_RECENT_ROWS_LIMIT || 200);
const MIN_DISCOUNT_PERCENT = Number(process.env.SHOPEE_MIN_DISCOUNT_PERCENT || 5);
const MIN_RATING = Number(process.env.SHOPEE_MIN_RATING || 4.2);
const MIN_SALES = Number(process.env.SHOPEE_MIN_SALES || 1);
const SIMILARITY_THRESHOLD = Number(process.env.SHOPEE_NAME_SIMILARITY_THRESHOLD || 0.86);
const MIN_SCORE = Number(process.env.SHOPEE_MIN_SCORE || 45);
const MIN_REAL_SAVINGS = Number(process.env.SHOPEE_MIN_REAL_SAVINGS || 3);

const DEFAULT_BLOCKED_TERMS = [
  "adulto",
  "emagrecedor",
  "remedio",
  "medicamento",
  "anvisa",
  "cigarro",
  "vape",
  "arma",
  "faca",
  "replica",
  "cassino",
  "aposta",
  "pirata",
  "falsificado",
  "1 linha",
  "primeira linha",
  "sem garantia",
  "milagroso",
  "cura",
  "sexual",
  "erotico"
];

const DEFAULT_PREFERRED_TERMS = [
  "organizador",
  "cozinha",
  "casa",
  "limpeza",
  "smart",
  "carregador",
  "fone",
  "garrafa",
  "termica",
  "beleza",
  "skincare",
  "kit",
  "infantil",
  "utilidade",
  "oferta",
  "promo",
  "desconto"
];

const GENERIC_NAME_TERMS = [
  "produto",
  "oferta",
  "promocao",
  "barato",
  "novo",
  "top",
  "original",
  "generico",
  "diversos",
  "varios",
  "aleatorio"
];

const SHEET_COLUMNS = [
  "envio_whatsapp",
  "link_produto_filiado",
  "plataforma",
  "nome_produto",
  "preco",
  "preco_promocional",
  "desconto_percentual",
  "imagem_url"
];

const PRODUCT_OFFER_QUERY = `
  query ProductOffers($keyword: String, $page: Int, $limit: Int) {
    productOfferV2(
      keyword: $keyword,
      listType: 1,
      sortType: 5,
      page: $page,
      limit: $limit
    ) {
      nodes {
        itemId
        productName
        productLink
        offerLink
        imageUrl
        priceMin
        priceMax
        priceDiscountRate
        sales
        ratingStar
        commissionRate
        sellerCommissionRate
        shopeeCommissionRate
        commission
        shopId
        shopName
        shopType
        periodStartTime
        periodEndTime
      }
      pageInfo {
        page
        limit
        hasNextPage
      }
    }
  }
`;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getKeywords() {
  const raw = process.env.SHOPEE_KEYWORDS || "";
  return raw
    ? raw.split(",").map((keyword) => keyword.trim()).filter(Boolean)
    : DEFAULT_KEYWORDS;
}

function getTermList(envName, fallback) {
  const raw = process.env[envName] || "";
  return raw
    ? raw.split(",").map((term) => normalizeName(term)).filter(Boolean)
    : fallback.map((term) => normalizeName(term));
}

function stableStringifyPayload(query, variables) {
  return JSON.stringify({ query, variables });
}

function buildShopeeHeaders(payload) {
  const appId = requiredEnv("SHOPEE_APP_ID");
  const secret = requiredEnv("SHOPEE_SECRET");
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `${appId}${timestamp}${payload}${secret}`;
  const signature = crypto.createHash("sha256").update(signatureBase).digest("hex");

  return {
    "Content-Type": "application/json",
    Authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
  };
}

async function shopeeGraphql(query, variables) {
  const payload = stableStringifyPayload(query, variables);
  const response = await fetch(SHOPEE_ENDPOINT, {
    method: "POST",
    headers: buildShopeeHeaders(payload),
    body: payload
  });

  const body = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Shopee API returned non-JSON response (${response.status}): ${body.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`Shopee API HTTP ${response.status}: ${JSON.stringify(parsed)}`);
  }

  if (Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error(`Shopee API GraphQL errors: ${JSON.stringify(parsed.errors)}`);
  }

  return parsed.data;
}

async function fetchOffersForKeyword(keyword) {
  const data = await shopeeGraphql(PRODUCT_OFFER_QUERY, {
    keyword,
    page: SEARCH_PAGE,
    limit: SEARCH_LIMIT
  });

  const connection = data?.productOfferV2 || {};
  return (connection.nodes || []).map((offer) => ({
    ...offer,
    keyword,
    pageInfo: connection.pageInfo || null
  }));
}

async function fetchShopeeOffers(keywords) {
  const batches = [];
  for (const keyword of keywords) {
    console.log(`[shopee] fetching keyword="${keyword}" page=${SEARCH_PAGE} limit=${SEARCH_LIMIT}`);
    const offers = await fetchOffersForKeyword(keyword);
    console.log(`[shopee] keyword="${keyword}" returned=${offers.length}`);
    batches.push(...offers);
  }
  return batches;
}

function toNumber(value) {
  const raw = String(value ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;

  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/-/g, "");
  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");
  let normalized = unsigned;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandSeparator = decimalSeparator === "." ? "," : ".";
    normalized = unsigned
      .replaceAll(thousandSeparator, "")
      .replace(decimalSeparator, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const separator = lastDot >= 0 ? "." : ",";
    const separatorIndex = lastDot >= 0 ? lastDot : lastComma;
    const separatorCount = (unsigned.match(new RegExp(`\\${separator}`, "g")) || []).length;
    const decimalDigits = unsigned.length - separatorIndex - 1;

    if (separatorCount > 1) {
      normalized = unsigned.replaceAll(separator, "");
    } else if (decimalDigits === 3 && unsigned.slice(0, separatorIndex).length <= 3) {
      normalized = unsigned.replace(separator, "");
    } else {
      normalized = unsigned.replace(separator, ".");
    }
  }

  normalized = `${sign}${normalized}`;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function normalizeDiscount(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 && number <= 100 ? number : number * 100;
}

function getPromoPrice(offer) {
  return toNumber(offer.priceMin ?? offer.priceMax);
}

function getOriginalPrice(offer) {
  return toNumber(offer.priceMax ?? offer.priceMin);
}

function getRealSavings(offer) {
  const originalPrice = getOriginalPrice(offer);
  const promoPrice = getPromoPrice(offer);
  if (!Number.isFinite(originalPrice) || !Number.isFinite(promoPrice)) return 0;
  return Math.max(0, originalPrice - promoPrice);
}

function formatPrice(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(number);
}

function formatPercent(value) {
  const discount = Math.round(normalizeDiscount(value));
  return discount > 0 ? `${discount}% OFF` : "";
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((token) => token.length >= 3)
  );
}

function getMatchedTerms(text, terms) {
  const normalizedText = normalizeName(text);
  return terms.filter((term) => normalizedText.includes(term));
}

function getNameQuality(name) {
  const normalized = normalizeName(name);
  const tokens = normalized.split(" ").filter(Boolean);
  const uniqueTokens = new Set(tokens);
  const genericTokens = tokens.filter((token) => GENERIC_NAME_TERMS.includes(token));
  const digitCount = (normalized.match(/\d/g) || []).length;

  let score = 0;
  const reasons = [];
  const penalties = [];

  if (tokens.length >= 4) {
    score += 8;
    reasons.push("nome_descritivo");
  } else {
    penalties.push("nome_curto");
  }

  if (uniqueTokens.size >= Math.min(tokens.length, 4)) {
    score += 4;
  } else {
    penalties.push("nome_repetitivo");
  }

  if (digitCount <= 12) {
    score += 3;
  } else {
    penalties.push("nome_com_numeros_excessivos");
  }

  if (genericTokens.length) {
    score -= genericTokens.length * 4;
    penalties.push("nome_generico");
  }

  if (normalized.length < 18) {
    score -= 6;
    penalties.push("nome_pouco_informativo");
  }

  return {
    score: clamp(score, -12, 15),
    reasons,
    penalties
  };
}

function jaccardSimilarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  return intersection / new Set([...left, ...right]).size;
}

function getOfferLink(offer) {
  return String(offer.offerLink || offer.productLink || "").trim();
}

function getOfferName(offer) {
  return String(offer.productName || "").trim();
}

function reject(reason, offer) {
  return {
    reason,
    score: offer?.qualityScore?.score ?? null,
    name: getOfferName(offer),
    link: getOfferLink(offer),
    keyword: offer.keyword,
    details: offer?.qualityScore || null
  };
}

function scoreOfferV2(offer, options = {}) {
  const name = getOfferName(offer);
  const textForTerms = `${name} ${offer.keyword || ""} ${offer.shopName || ""}`;
  const promoPrice = getPromoPrice(offer);
  const originalPrice = getOriginalPrice(offer);
  const realSavings = getRealSavings(offer);
  const discount = normalizeDiscount(offer.priceDiscountRate);
  const rating = toNumber(offer.ratingStar);
  const sales = toNumber(offer.sales);
  const commission = toNumber(offer.commissionRate);
  const imageUrl = String(offer.imageUrl || "").trim();
  const blockedTerms = options.blockedTerms || getTermList("SHOPEE_BLOCKED_TERMS", DEFAULT_BLOCKED_TERMS);
  const preferredTerms = options.preferredTerms || getTermList("SHOPEE_PREFERRED_TERMS", DEFAULT_PREFERRED_TERMS);
  const matchedBlockedTerms = getMatchedTerms(textForTerms, blockedTerms);
  const matchedPreferredTerms = getMatchedTerms(textForTerms, preferredTerms);
  const nameQuality = getNameQuality(name);

  const positive = {
    discount: clamp(discount, 0, 60) * 0.55,
    realSavings: clamp(realSavings, 0, 120) * 0.28,
    promoPrice: Number.isFinite(promoPrice) ? clamp(18 - Math.abs(promoPrice - 89) / 8, 0, 18) : 0,
    sales: Number.isFinite(sales) ? clamp(Math.log10(sales + 1) * 8, 0, 24) : 0,
    rating: Number.isFinite(rating) ? clamp((rating - 3.8) * 12, 0, 15) : 0,
    commission: Number.isFinite(commission) ? clamp(commission * 140, 0, 12) : 0,
    image: imageUrl ? 6 : 0,
    nameQuality: Math.max(0, nameQuality.score),
    category: clamp(matchedPreferredTerms.length * 5, 0, 15)
  };

  const penalties = {
    blockedTerms: matchedBlockedTerms.length ? 100 : 0,
    lowPriceArtificialDiscount: Number.isFinite(promoPrice) && promoPrice < 15 && discount >= 35 ? 22 : 0,
    noRealSavings: realSavings < MIN_REAL_SAVINGS ? 20 : 0,
    sensitiveProduct: matchedBlockedTerms.length ? 40 : 0,
    lowReputation: Number.isFinite(rating) && rating > 0 && rating < MIN_RATING ? 25 : 0,
    lowSales: Number.isFinite(sales) && sales < MIN_SALES ? 12 : 0,
    genericName: nameQuality.penalties.includes("nome_generico") ? 12 : 0,
    poorName: nameQuality.score < 3 ? 10 : 0,
    missingImage: imageUrl ? 0 : 25
  };

  const positiveScore = sum(Object.values(positive));
  const penaltyScore = sum(Object.values(penalties));
  const score = Math.round((positiveScore - penaltyScore) * 100) / 100;
  const approvalReasons = [];
  const rejectionReasons = [];

  if (discount >= MIN_DISCOUNT_PERCENT) approvalReasons.push("desconto_relevante");
  if (realSavings >= MIN_REAL_SAVINGS) approvalReasons.push("economia_real");
  if (Number.isFinite(promoPrice) && promoPrice >= 15 && promoPrice <= 250) approvalReasons.push("preco_convertivel");
  if (Number.isFinite(sales) && sales >= MIN_SALES) approvalReasons.push("vendas_validas");
  if (Number.isFinite(rating) && rating >= MIN_RATING) approvalReasons.push("boa_avaliacao");
  if (Number.isFinite(commission) && commission > 0) approvalReasons.push("comissao_presente");
  if (imageUrl) approvalReasons.push("imagem_presente");
  approvalReasons.push(...nameQuality.reasons);
  if (matchedPreferredTerms.length) approvalReasons.push(`termos_preferidos:${matchedPreferredTerms.join("|")}`);

  for (const [reason, value] of Object.entries(penalties)) {
    if (value > 0) rejectionReasons.push(reason);
  }
  rejectionReasons.push(...nameQuality.penalties);
  if (matchedBlockedTerms.length) rejectionReasons.push(`termos_bloqueados:${matchedBlockedTerms.join("|")}`);

  return {
    score,
    positive,
    penalties,
    approvalReasons,
    rejectionReasons,
    metrics: {
      discountPercent: Math.round(discount * 100) / 100,
      realSavings: Math.round(realSavings * 100) / 100,
      promoPrice,
      originalPrice,
      sales,
      rating,
      commission,
      hasImage: !!imageUrl,
      matchedPreferredTerms,
      matchedBlockedTerms,
      nameQuality: nameQuality.score
    }
  };
}

function passesQualityFilters(offer) {
  const name = getOfferName(offer);
  const link = getOfferLink(offer);
  const imageUrl = String(offer.imageUrl || "").trim();
  const price = getPromoPrice(offer);
  const discount = normalizeDiscount(offer.priceDiscountRate);
  const rating = toNumber(offer.ratingStar);
  const sales = toNumber(offer.sales);
  const qualityScore = scoreOfferV2(offer);
  offer.qualityScore = qualityScore;

  if (!name) return { ok: false, reason: "missing_name" };
  if (!link) return { ok: false, reason: "missing_affiliate_link" };
  if (!imageUrl) return { ok: false, reason: "missing_image" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "invalid_price" };
  if (discount < MIN_DISCOUNT_PERCENT) return { ok: false, reason: "low_discount" };
  if (Number.isFinite(rating) && rating > 0 && rating < MIN_RATING) return { ok: false, reason: "low_rating" };
  if (Number.isFinite(sales) && sales < MIN_SALES) return { ok: false, reason: "low_sales" };
  if (qualityScore.metrics.matchedBlockedTerms.length) return { ok: false, reason: "blocked_terms" };
  if (qualityScore.metrics.realSavings < MIN_REAL_SAVINGS) return { ok: false, reason: "no_real_savings" };
  if (qualityScore.score < MIN_SCORE) return { ok: false, reason: "low_quality_score" };

  return { ok: true, reason: "quality_score_passed", score: qualityScore };
}

function dedupeIncomingOffers(offers) {
  const seenLinks = new Set();
  const seenNames = [];
  const unique = [];
  const rejected = [];

  for (const offer of offers) {
    const link = getOfferLink(offer);
    const name = getOfferName(offer);

    if (seenLinks.has(link)) {
      rejected.push(reject("duplicate_in_api_link", offer));
      continue;
    }

    const similarName = seenNames.find((existingName) => jaccardSimilarity(existingName, name) >= SIMILARITY_THRESHOLD);
    if (similarName) {
      rejected.push(reject("duplicate_in_api_similar_name", offer));
      continue;
    }

    seenLinks.add(link);
    seenNames.push(name);
    unique.push(offer);
  }

  return { unique, rejected };
}

function offerLogItem(offer) {
  const qualityScore = offer.qualityScore || scoreOfferV2(offer);
  return {
    nome_produto: getOfferName(offer),
    link_produto_filiado: getOfferLink(offer),
    keyword: offer.keyword,
    scoreFinal: qualityScore.score,
    motivosAprovacao: qualityScore.approvalReasons,
    motivosRejeicao: qualityScore.rejectionReasons,
    metricas: qualityScore.metrics
  };
}

function filterAndRankOffers(offers) {
  const accepted = [];
  const rejected = [];
  const candidates = [];

  for (const offer of offers) {
    const quality = passesQualityFilters(offer);
    candidates.push(offerLogItem(offer));
    if (!quality.ok) {
      rejected.push(reject(quality.reason, offer));
      continue;
    }
    accepted.push(offer);
  }

  const deduped = dedupeIncomingOffers(accepted);
  return {
    approved: deduped.unique.sort((a, b) => b.qualityScore.score - a.qualityScore.score),
    rejected: [...rejected, ...deduped.rejected],
    candidates: candidates.sort((a, b) => b.scoreFinal - a.scoreFinal)
  };
}

function getGoogleCredentials() {
  const raw = requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON.");
  }
}

function createSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: getGoogleCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

function getSheetConfig() {
  return {
    spreadsheetId: requiredEnv("GOOGLE_SHEET_ID"),
    sheetName: requiredEnv("GOOGLE_SHEET_NAME")
  };
}

async function readExistingRows(sheets, config) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A:H`
  });
  return response.data.values || [];
}

function readExistingOffers(rows) {
  const dataRows = rows.slice(1);
  const recentRows = dataRows.slice(Math.max(0, dataRows.length - RECENT_ROWS_LIMIT));

  return {
    existingLinks: new Set(dataRows.map((row) => String(row[1] || "").trim()).filter(Boolean)),
    recentNames: recentRows.map((row) => String(row[3] || "").trim()).filter(Boolean)
  };
}

function rejectExistingDuplicates(offers, existing) {
  const approved = [];
  const rejected = [];

  for (const offer of offers) {
    const link = getOfferLink(offer);
    const name = getOfferName(offer);

    if (existing.existingLinks.has(link)) {
      rejected.push(reject("duplicate_sheet_link", offer));
      continue;
    }

    const similarName = existing.recentNames.find(
      (existingName) => jaccardSimilarity(existingName, name) >= SIMILARITY_THRESHOLD
    );
    if (similarName) {
      rejected.push(reject("duplicate_sheet_similar_name", offer));
      continue;
    }

    approved.push(offer);
  }

  return { approved, rejected };
}

function offerToSheetRow(offer) {
  return [
    "pendente",
    getOfferLink(offer),
    "Shopee",
    getOfferName(offer),
    formatPrice(offer.priceMax || offer.priceMin),
    formatPrice(offer.priceMin || offer.priceMax),
    formatPercent(offer.priceDiscountRate),
    String(offer.imageUrl || "").trim()
  ];
}

async function appendOffers(sheets, config, offers) {
  if (!offers.length) return 0;

  const rows = offers.map(offerToSheetRow);
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A:H`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows
    }
  });

  return response.data.updates?.updatedRows || rows.length;
}

function countRejectionReasons(rejected) {
  return rejected.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});
}

function logSummary(summary) {
  console.log("[shopee] collection summary");
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const keywords = getKeywords();
  const sheets = createSheetsClient();
  const sheetConfig = getSheetConfig();

  console.log(`[shopee] collector started keywords=${keywords.join(",")}`);

  const rawOffers = await fetchShopeeOffers(keywords);
  const qualityResult = filterAndRankOffers(rawOffers);
  const existingRows = await readExistingRows(sheets, sheetConfig);
  const existing = readExistingOffers(existingRows);
  const duplicateResult = rejectExistingDuplicates(qualityResult.approved, existing);
  const selected = duplicateResult.approved.slice(0, MAX_OFFERS_PER_RUN);
  const insertedRows = await appendOffers(sheets, sheetConfig, selected);
  const rejected = [...qualityResult.rejected, ...duplicateResult.rejected];

  logSummary({
    totalBuscado: rawOffers.length,
    totalAprovadoQualidade: qualityResult.approved.length,
    totalAprovadoFinal: duplicateResult.approved.length,
    totalSelecionado: selected.length,
    totalRejeitado: rejected.length,
    motivosRejeicao: countRejectionReasons(rejected),
    top10CandidatosAntesDoCorte: qualityResult.candidates.slice(0, 10),
    linhasAdicionadasPlanilha: insertedRows,
    planilha: {
      sheetName: sheetConfig.sheetName,
      columns: SHEET_COLUMNS
    },
    selecionados: selected.map(offerLogItem),
    rejeitados: rejected.map((item) => ({
      motivo: item.reason,
      scoreFinal: item.score,
      nome_produto: item.name,
      link_produto_filiado: item.link,
      keyword: item.keyword,
      detalhes: item.details
    }))
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`[shopee] collector failed: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  dedupeIncomingOffers,
  filterAndRankOffers,
  jaccardSimilarity,
  offerToSheetRow,
  passesQualityFilters,
  scoreOfferV2,
  formatPrice,
  stableStringifyPayload,
  toNumber
};
