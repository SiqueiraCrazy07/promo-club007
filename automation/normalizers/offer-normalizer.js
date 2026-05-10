import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCurrency } from "../validators/offer-validator.js";

const __filename = fileURLToPath(import.meta.url);

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createOfferId(offer) {
  const fingerprint = [
    offer.marketplace,
    offer.titulo,
    offer.url_afiliado
  ].map(cleanText).join("|");

  return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}

function normalizePriority(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function normalizeStatus(value) {
  const status = cleanText(value).toLowerCase();
  return status || "active";
}

function normalizeOffer(offer, validation = { warnings: [], parsed: {} }) {
  const marketplace = normalizeSlug(offer.marketplace);
  const title = cleanText(offer.titulo);
  const category = cleanText(offer.categoria);
  const price = validation.parsed?.price ?? parseCurrency(offer.preco);
  const previousPrice = validation.parsed?.previousPrice ?? parseCurrency(offer.preco_anterior);

  return {
    id: createOfferId(offer),
    marketplace,
    title,
    category,
    price,
    previousPrice,
    currency: "BRL",
    affiliateUrl: cleanText(offer.url_afiliado),
    imageUrl: cleanText(offer.url_imagem),
    availability: cleanText(offer.disponibilidade).toLowerCase(),
    priority: normalizePriority(offer.prioridade),
    status: normalizeStatus(offer.status),
    source: {
      type: offer.source || "unknown",
      rowNumber: offer.rowNumber || null
    },
    validation: {
      warnings: validation.warnings || []
    },
    metadata: {
      originalMarketplace: cleanText(offer.marketplace),
      notes: cleanText(offer.observacoes)
    },
    updatedAt: new Date().toISOString()
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const sampleOffer = {
    marketplace: "Marketplace Exemplo",
    titulo: "Produto exemplo",
    categoria: "Casa",
    preco: "99,90",
    preco_anterior: "129,90",
    url_afiliado: "https://example.com/oferta",
    url_imagem: "https://example.com/imagem.jpg",
    disponibilidade: "disponivel",
    prioridade: "1",
    status: "active",
    source: "local-sample",
    rowNumber: 2
  };

  console.log(JSON.stringify(normalizeOffer(sampleOffer), null, 2));
}

export { createOfferId, normalizeOffer, normalizeSlug };
