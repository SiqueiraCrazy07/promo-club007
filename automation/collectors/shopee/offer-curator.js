const DEFAULT_BLOCKED_KEYWORDS = [
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

const DEFAULT_PREFERRED_KEYWORDS = [
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
  "ferramenta",
  "decoracao"
];

const DEFAULT_BLOCKED_PATTERNS = [
  /\b(?:hot|sexy|sensual)\b/i,
  /\b(?:cura|milagre|milagroso)\b/i,
  /\b(?:cassino|aposta|bet)\b/i,
  /\b(?:sem\s+garantia|primeira\s+linha|1\s+linha)\b/i
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

const PROMOTIONAL_TERMS = [
  "oferta",
  "promocao",
  "promo",
  "barato",
  "imperdivel",
  "liquidacao",
  "desconto",
  "gratis",
  "brinde"
];

const CATEGORY_RULES = [
  { category: "casa_cozinha", terms: ["cozinha", "organizador", "casa", "limpeza", "pote", "tapete", "garrafa"], reputation: 92 },
  { category: "beleza", terms: ["beleza", "skincare", "maquiagem", "escova", "secador"], reputation: 84 },
  { category: "eletronicos", terms: ["smart", "fone", "carregador", "cabo", "bluetooth", "usb", "led"], reputation: 72 },
  { category: "moda", terms: ["moda", "camiseta", "tenis", "bolsa", "relogio", "oculos"], reputation: 70 },
  { category: "infantil", terms: ["infantil", "crianca", "bebe", "brinquedo"], reputation: 78 },
  { category: "ferramentas", terms: ["ferramenta", "chave", "furadeira", "parafuso", "suporte"], reputation: 80 }
];

const CATEGORY_LIMITS = {
  eletronicos: 1,
  casa_cozinha: 2,
  beleza: 2,
  moda: 1,
  infantil: 1,
  ferramentas: 1,
  outros: 1
};

const DEFAULT_OPTIONS = {
  maxOffers: 5,
  minDiscountPercent: Number(process.env.SHOPEE_MIN_DISCOUNT_PERCENT || 5),
  minRating: Number(process.env.SHOPEE_MIN_RATING || 4.2),
  minSales: Number(process.env.SHOPEE_MIN_SALES || 1),
  minScore: Number(process.env.SHOPEE_MIN_SCORE || 45),
  minRealSavings: Number(process.env.SHOPEE_MIN_REAL_SAVINGS || 3),
  similarityThreshold: Number(process.env.SHOPEE_NAME_SIMILARITY_THRESHOLD || 0.86),
  blockedKeywords: parseEnvList("SHOPEE_BLOCKED_TERMS", DEFAULT_BLOCKED_KEYWORDS),
  preferredKeywords: parseEnvList("SHOPEE_PREFERRED_TERMS", DEFAULT_PREFERRED_KEYWORDS),
  blockedPatterns: DEFAULT_BLOCKED_PATTERNS
};

function parseEnvList(envName, fallback) {
  const raw = process.env[envName] || "";
  return raw
    ? raw.split(",").map((term) => normalizeText(term)).filter(Boolean)
    : fallback.map((term) => normalizeText(term));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
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

  const number = Number(`${sign}${normalized}`);
  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length >= 3));
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

function getOfferName(offer) {
  return String(offer.productName || offer.nome_produto || "").trim();
}

function getOfferLink(offer) {
  return String(offer.offerLink || offer.productLink || offer.link_produto_filiado || "").trim();
}

function getPromoPrice(offer) {
  return toNumber(offer.priceMin ?? offer.preco_promocional ?? offer.priceMax ?? offer.preco);
}

function getOriginalPrice(offer) {
  return toNumber(offer.priceMax ?? offer.preco ?? offer.priceMin ?? offer.preco_promocional);
}

function normalizeDiscount(value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return 0;
  return number > 1 && number <= 100 ? number : number * 100;
}

function getRealSavings(offer) {
  const originalPrice = getOriginalPrice(offer);
  const promoPrice = getPromoPrice(offer);
  if (!Number.isFinite(originalPrice) || !Number.isFinite(promoPrice)) return 0;
  return Math.max(0, originalPrice - promoPrice);
}

function getMatchedTerms(text, terms) {
  const normalized = normalizeText(text);
  return terms.filter((term) => normalized.includes(term));
}

function detectCategory(offer) {
  const text = `${getOfferName(offer)} ${offer.keyword || ""} ${offer.shopName || ""}`;
  const normalized = normalizeText(text);
  let best = { category: "outros", matches: [], reputation: 58 };

  for (const rule of CATEGORY_RULES) {
    const matches = rule.terms.filter((term) => normalized.includes(normalizeText(term)));
    if (matches.length > best.matches.length) {
      best = { category: rule.category, matches, reputation: rule.reputation };
    }
  }

  return best;
}

function getNameQuality(name) {
  const normalized = normalizeText(name);
  const tokens = normalized.split(" ").filter(Boolean);
  const uniqueTokens = new Set(tokens);
  const genericTokens = tokens.filter((token) => GENERIC_NAME_TERMS.includes(token));
  const promoTokens = tokens.filter((token) => PROMOTIONAL_TERMS.includes(token));
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

  if (promoTokens.length >= 3) {
    score -= 8;
    penalties.push("excesso_palavras_promocionais");
  }

  if (normalized.length < 18) {
    score -= 6;
    penalties.push("nome_pouco_informativo");
  }

  return {
    score: clamp(score, -18, 15),
    reasons,
    penalties,
    promoTokens
  };
}

function getImageQuality(offer) {
  const imageUrl = String(offer.imageUrl || offer.imagem_url || "").trim();
  if (!imageUrl) return { score: 0, reason: "sem_imagem" };
  if (imageUrl.startsWith("http")) return { score: 8, reason: "imagem_http_valida" };
  return { score: 3, reason: "imagem_url_incomum" };
}

function getSpamScore(offer, options) {
  const name = getOfferName(offer);
  const normalized = normalizeText(name);
  const promoMatches = PROMOTIONAL_TERMS.filter((term) => normalized.includes(term));
  const blockedKeywordMatches = getMatchedTerms(`${name} ${offer.keyword || ""}`, options.blockedKeywords);
  const blockedPatternMatches = options.blockedPatterns
    .filter((pattern) => pattern.test(name))
    .map((pattern) => pattern.toString());

  let score = promoMatches.length * 8 + blockedKeywordMatches.length * 35 + blockedPatternMatches.length * 45;
  if (normalized.length < 18) score += 10;
  if ((normalized.match(/\d/g) || []).length > 14) score += 10;

  return {
    score: clamp(score, 0, 100),
    promoMatches,
    blockedKeywordMatches,
    blockedPatternMatches
  };
}

function getReputationScore(offer, categoryInfo) {
  const rating = toNumber(offer.ratingStar);
  const sales = toNumber(offer.sales);
  const categoryBase = categoryInfo.reputation;
  const ratingScore = Number.isFinite(rating) && rating > 0 ? clamp((rating - 3.5) * 18, 0, 25) : 10;
  const salesScore = Number.isFinite(sales) ? clamp(Math.log10(sales + 1) * 8, 0, 25) : 8;
  return clamp(categoryBase * 0.5 + ratingScore + salesScore, 0, 100);
}

function getConversionScore(offer, details) {
  const promoPrice = details.promoPrice;
  const realSavings = details.realSavings;
  const discount = details.discountPercent;
  const commission = details.commission;
  const ticketScore = Number.isFinite(promoPrice) ? clamp(28 - Math.abs(promoPrice - 89) / 5, 0, 28) : 0;
  const savingsScore = clamp(realSavings, 0, 120) * 0.18;
  const discountScore = clamp(discount, 0, 60) * 0.35;
  const commissionScore = Number.isFinite(commission) ? clamp(commission * 120, 0, 12) : 0;
  return clamp(ticketScore + savingsScore + discountScore + commissionScore, 0, 100);
}

function getRepeatPenalty(offer, context = {}) {
  const name = getOfferName(offer);
  const historicalNames = context.historicalNames || [];
  const categoryCounts = context.categoryCounts || {};
  const category = context.category || "outros";
  const similarHistory = historicalNames.filter((existingName) => jaccardSimilarity(existingName, name) >= 0.74);
  const categoryCount = categoryCounts[category] || 0;

  return {
    score: clamp(similarHistory.length * 20 + Math.max(0, categoryCount - 1) * 12, 0, 60),
    similarHistoryCount: similarHistory.length,
    categoryCount
  };
}

function scoreOfferV2(offer, context = {}, inputOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...inputOptions };
  const name = getOfferName(offer);
  const link = getOfferLink(offer);
  const promoPrice = getPromoPrice(offer);
  const originalPrice = getOriginalPrice(offer);
  const realSavings = getRealSavings(offer);
  const discountPercent = normalizeDiscount(offer.priceDiscountRate || offer.desconto_percentual);
  const hasShopeeDiscountRate = discountPercent >= options.minDiscountPercent;
  const rating = toNumber(offer.ratingStar);
  const sales = toNumber(offer.sales);
  const commission = toNumber(offer.commissionRate);
  const categoryInfo = detectCategory(offer);
  const preferredMatches = getMatchedTerms(`${name} ${offer.keyword || ""}`, options.preferredKeywords);
  const nameQuality = getNameQuality(name);
  const imageQuality = getImageQuality(offer);
  const spam = getSpamScore(offer, options);
  const reputationScore = getReputationScore(offer, categoryInfo);
  const conversionScore = getConversionScore(offer, { promoPrice, realSavings, discountPercent, commission });
  const repeatPenalty = getRepeatPenalty(offer, { ...context, category: categoryInfo.category });

  const positives = {
    discountPercent: clamp(discountPercent, 0, 60) * 0.3,
    realSavings: clamp(realSavings, 0, 120) * 0.18,
    ticketMedio: Number.isFinite(promoPrice) ? clamp(18 - Math.abs(promoPrice - 89) / 8, 0, 18) : 0,
    rating: Number.isFinite(rating) ? clamp((rating - 3.8) * 12, 0, 15) : 0,
    sales: Number.isFinite(sales) ? clamp(Math.log10(sales + 1) * 8, 0, 24) : 0,
    commission: Number.isFinite(commission) ? clamp(commission * 140, 0, 12) : 0,
    categoryReputation: reputationScore * 0.18,
    viralPotential: clamp(preferredMatches.length * 4 + Math.min(sales || 0, 500) / 80, 0, 18),
    nameQuality: Math.max(0, nameQuality.score),
    imageQuality: imageQuality.score,
    conversionScore: conversionScore * 0.25
  };

  const penalties = {
    descontoFake: discountPercent >= 35 && realSavings < options.minRealSavings * 2 && !hasShopeeDiscountRate ? 22 : 0,
    precoArtificial: Number.isFinite(promoPrice) && promoPrice < 15 && discountPercent >= 30 ? 24 : 0,
    produtoMuitoBarato: Number.isFinite(promoPrice) && promoPrice < 10 ? 18 : 0,
    semEconomiaReal: realSavings < options.minRealSavings ? (hasShopeeDiscountRate ? 8 : 25) : 0,
    nomeRuim: nameQuality.score < 3 ? 12 : 0,
    excessoPromocional: nameQuality.penalties.includes("excesso_palavras_promocionais") ? 16 : 0,
    produtoSensivel: spam.blockedKeywordMatches.length || spam.blockedPatternMatches.length ? 100 : 0,
    repetitivo: repeatPenalty.score,
    spamCategoria: spam.score * 0.35,
    baixaPercepcaoValor: Number.isFinite(promoPrice) && promoPrice < 20 && realSavings < 8 ? 14 : 0,
    baixaReputacao: reputationScore < 55 ? 18 : 0,
    semImagem: imageQuality.score === 0 ? 30 : 0
  };

  const score = Math.round((sum(Object.values(positives)) - sum(Object.values(penalties))) * 100) / 100;
  const approvalReasons = [];
  const rejectionReasons = [];

  if (discountPercent >= options.minDiscountPercent) approvalReasons.push("desconto_relevante");
  if (hasShopeeDiscountRate && realSavings < options.minRealSavings) approvalReasons.push("desconto_shopee_valido");
  if (realSavings >= options.minRealSavings) approvalReasons.push("economia_real");
  if (conversionScore >= 45) approvalReasons.push("conversao_promissora");
  if (reputationScore >= 65) approvalReasons.push("reputacao_adequada");
  if (spam.score <= 25) approvalReasons.push("baixo_spam");
  if (preferredMatches.length) approvalReasons.push(`keywords_preferidas:${preferredMatches.join("|")}`);
  approvalReasons.push(...nameQuality.reasons, imageQuality.reason);

  for (const [reason, value] of Object.entries(penalties)) {
    if (value > 0) rejectionReasons.push(reason);
  }
  rejectionReasons.push(...nameQuality.penalties);

  return {
    qualityScore: score,
    score,
    category: categoryInfo.category,
    approvalReasons,
    rejectionReasons,
    positives,
    penalties,
    metrics: {
      discountPercent: Math.round(discountPercent * 100) / 100,
      realSavings: Math.round(realSavings * 100) / 100,
      promoPrice,
      originalPrice,
      ticketMedio: promoPrice,
      rating,
      sales,
      commission,
      hasImage: imageQuality.score > 0,
      nameQuality: nameQuality.score,
      imageQuality: imageQuality.score,
      preferredMatches,
      spamScore: spam.score,
      reputationScore: Math.round(reputationScore * 100) / 100,
      conversionScore: Math.round(conversionScore * 100) / 100,
      repeatPenalty: repeatPenalty.score,
      blockedKeywordMatches: spam.blockedKeywordMatches,
      blockedPatternMatches: spam.blockedPatternMatches
    },
    validBasics: {
      hasName: !!name,
      hasLink: !!link,
      hasPrice: Number.isFinite(promoPrice) && promoPrice > 0,
      hasImage: imageQuality.score > 0
    }
  };
}

function reject(reason, offer, qualityDetails) {
  const quality = qualityDetails || offer?.qualityScore || null;
  const metrics = quality?.metrics || {};

  return {
    reason,
    score: quality?.qualityScore ?? null,
    name: getOfferName(offer),
    link: getOfferLink(offer),
    keyword: offer.keyword,
    category: quality?.category || "outros",
    priceMin: offer.priceMin ?? offer.preco_promocional ?? null,
    priceMax: offer.priceMax ?? offer.preco ?? null,
    priceDiscountRate: offer.priceDiscountRate ?? offer.desconto_percentual ?? null,
    realSavings: metrics.realSavings ?? null,
    qualityScore: quality?.qualityScore ?? null,
    conversionScore: metrics.conversionScore ?? null,
    reputationScore: metrics.reputationScore ?? null,
    spamScore: metrics.spamScore ?? null,
    details: quality
  };
}

function passesQualityFilters(offer, context = {}, inputOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...inputOptions };
  const quality = scoreOfferV2(offer, context, options);
  offer.qualityScore = quality;

  if (!quality.validBasics.hasName) return { ok: false, reason: "missing_name", score: quality };
  if (!quality.validBasics.hasLink) return { ok: false, reason: "missing_affiliate_link", score: quality };
  if (!quality.validBasics.hasImage) return { ok: false, reason: "missing_image", score: quality };
  if (!quality.validBasics.hasPrice) return { ok: false, reason: "invalid_price", score: quality };
  if (quality.metrics.discountPercent < options.minDiscountPercent) return { ok: false, reason: "low_discount", score: quality };
  if (Number.isFinite(quality.metrics.rating) && quality.metrics.rating > 0 && quality.metrics.rating < options.minRating) {
    return { ok: false, reason: "low_rating", score: quality };
  }
  if (Number.isFinite(quality.metrics.sales) && quality.metrics.sales < options.minSales) {
    return { ok: false, reason: "low_sales", score: quality };
  }
  if (quality.metrics.blockedKeywordMatches.length || quality.metrics.blockedPatternMatches.length) {
    return { ok: false, reason: "blocked_terms", score: quality };
  }
  if (quality.qualityScore < options.minScore) return { ok: false, reason: "low_quality_score", score: quality };

  return { ok: true, reason: "curator_v2_passed", score: quality };
}

function offerLogItem(offer) {
  const quality = offer.qualityScore || scoreOfferV2(offer);
  return {
    nome_produto: getOfferName(offer),
    link_produto_filiado: getOfferLink(offer),
    keyword: offer.keyword,
    categoria: quality.category,
    scoreFinal: quality.qualityScore,
    qualityScore: quality.qualityScore,
    economiaReal: quality.metrics.realSavings,
    scoreConversao: quality.metrics.conversionScore,
    scoreReputacao: quality.metrics.reputationScore,
    scoreSpam: quality.metrics.spamScore,
    motivosAprovacao: quality.approvalReasons,
    motivosRejeicao: quality.rejectionReasons,
    scoreDetalhado: {
      positivos: quality.positives,
      penalidades: quality.penalties,
      metricas: quality.metrics
    }
  };
}

function dedupeIncomingOffers(offers, options = DEFAULT_OPTIONS) {
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

    const similarName = seenNames.find((existingName) => jaccardSimilarity(existingName, name) >= options.similarityThreshold);
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

function balanceCategories(offers, maxOffers = DEFAULT_OPTIONS.maxOffers) {
  const selected = [];
  const overflow = [];
  const categoryCounts = {};

  for (const offer of offers) {
    const category = offer.qualityScore?.category || "outros";
    const limit = CATEGORY_LIMITS[category] || 1;
    const count = categoryCounts[category] || 0;

    if (selected.length < maxOffers && count < limit) {
      selected.push(offer);
      categoryCounts[category] = count + 1;
    } else {
      overflow.push(offer);
    }
  }

  for (const offer of overflow) {
    if (selected.length >= maxOffers) break;
    selected.push(offer);
  }

  return {
    selected,
    categoryCounts: selected.reduce((acc, offer) => {
      const category = offer.qualityScore?.category || "outros";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {})
  };
}

function curateOffers(offers, inputOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...inputOptions };
  const accepted = [];
  const rejected = [];
  const candidates = [];
  const categoryCounts = {};
  const historicalNames = inputOptions.historicalNames || [];

  for (const offer of offers) {
    const category = detectCategory(offer).category;
    const quality = passesQualityFilters(offer, { categoryCounts, historicalNames }, options);
    candidates.push(offerLogItem(offer));

    if (!quality.ok) {
      rejected.push(reject(quality.reason, offer, quality.score));
      continue;
    }

    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    accepted.push(offer);
  }

  const deduped = dedupeIncomingOffers(accepted, options);
  const ranked = deduped.unique.sort((a, b) => b.qualityScore.qualityScore - a.qualityScore.qualityScore);
  const balanced = balanceCategories(ranked, options.maxOffers);

  return {
    approved: ranked,
    selected: balanced.selected,
    rejected: [...rejected, ...deduped.rejected],
    candidates: candidates.sort((a, b) => b.scoreFinal - a.scoreFinal),
    top20Candidates: candidates.sort((a, b) => b.scoreFinal - a.scoreFinal).slice(0, 20),
    balance: {
      categoryCounts: balanced.categoryCounts,
      maxOffers: options.maxOffers
    }
  };
}

export {
  balanceCategories,
  curateOffers,
  dedupeIncomingOffers,
  detectCategory,
  getOfferLink,
  getOfferName,
  getPromoPrice,
  getRealSavings,
  jaccardSimilarity,
  normalizeDiscount,
  offerLogItem,
  passesQualityFilters,
  scoreOfferV2,
  toNumber
};
