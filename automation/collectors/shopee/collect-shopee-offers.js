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
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDiscount(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 && number <= 100 ? number : number * 100;
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
    name: getOfferName(offer),
    link: getOfferLink(offer),
    keyword: offer.keyword
  };
}

function passesQualityFilters(offer) {
  const name = getOfferName(offer);
  const link = getOfferLink(offer);
  const imageUrl = String(offer.imageUrl || "").trim();
  const price = toNumber(offer.priceMin ?? offer.priceMax);
  const discount = normalizeDiscount(offer.priceDiscountRate);
  const rating = toNumber(offer.ratingStar);
  const sales = toNumber(offer.sales);

  if (!name) return { ok: false, reason: "missing_name" };
  if (!link) return { ok: false, reason: "missing_affiliate_link" };
  if (!imageUrl) return { ok: false, reason: "missing_image" };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: "invalid_price" };
  if (discount < MIN_DISCOUNT_PERCENT) return { ok: false, reason: "low_discount" };
  if (Number.isFinite(rating) && rating > 0 && rating < MIN_RATING) return { ok: false, reason: "low_rating" };
  if (Number.isFinite(sales) && sales < MIN_SALES) return { ok: false, reason: "low_sales" };

  return { ok: true, reason: null };
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

function scoreOffer(offer) {
  const discount = normalizeDiscount(offer.priceDiscountRate);
  const rating = toNumber(offer.ratingStar) || 0;
  const sales = toNumber(offer.sales) || 0;
  const commission = toNumber(offer.commissionRate) || 0;
  return discount * 5 + rating * 3 + Math.min(sales, 1000) / 20 + commission * 100;
}

function filterAndRankOffers(offers) {
  const accepted = [];
  const rejected = [];

  for (const offer of offers) {
    const quality = passesQualityFilters(offer);
    if (!quality.ok) {
      rejected.push(reject(quality.reason, offer));
      continue;
    }
    accepted.push(offer);
  }

  const deduped = dedupeIncomingOffers(accepted);
  return {
    approved: deduped.unique.sort((a, b) => scoreOffer(b) - scoreOffer(a)),
    rejected: [...rejected, ...deduped.rejected]
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
    linhasAdicionadasPlanilha: insertedRows,
    planilha: {
      sheetName: sheetConfig.sheetName,
      columns: SHEET_COLUMNS
    },
    selecionados: selected.map((offer) => ({
      nome_produto: getOfferName(offer),
      link_produto_filiado: getOfferLink(offer),
      desconto_percentual: formatPercent(offer.priceDiscountRate),
      keyword: offer.keyword
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
  stableStringifyPayload
};
