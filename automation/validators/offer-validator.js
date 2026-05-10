import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const REQUIRED_FIELDS = [
  "marketplace",
  "titulo",
  "categoria",
  "preco",
  "url_afiliado",
  "url_imagem",
  "disponibilidade"
];

const VALID_AVAILABILITY = new Set(["disponivel", "indisponivel", "promocao", "pre-venda"]);

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function parseCurrency(value) {
  if (isBlank(value)) {
    return null;
  }

  const rawValue = String(value)
    .replace(/\s/g, "")
    .replace("R$", "");

  const normalized = rawValue.includes(",")
    ? rawValue.replace(/\./g, "").replace(",", ".")
    : rawValue;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateOffer(offer) {
  const errors = [];
  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    if (isBlank(offer[field])) {
      errors.push({
        field,
        code: "required",
        message: `${field} is required.`
      });
    }
  }

  const price = parseCurrency(offer.preco);
  if (price === null || price <= 0) {
    errors.push({
      field: "preco",
      code: "invalid_price",
      message: "preco must be a positive number."
    });
  }

  const previousPrice = parseCurrency(offer.preco_anterior);
  if (!isBlank(offer.preco_anterior) && previousPrice === null) {
    warnings.push({
      field: "preco_anterior",
      code: "invalid_previous_price",
      message: "preco_anterior could not be parsed and will be ignored."
    });
  }

  if (!isBlank(offer.url_afiliado) && !isValidUrl(offer.url_afiliado)) {
    errors.push({
      field: "url_afiliado",
      code: "invalid_url",
      message: "url_afiliado must be a valid http or https URL."
    });
  }

  if (!isBlank(offer.url_imagem) && !isValidUrl(offer.url_imagem)) {
    errors.push({
      field: "url_imagem",
      code: "invalid_url",
      message: "url_imagem must be a valid http or https URL."
    });
  }

  const availability = String(offer.disponibilidade || "").trim().toLowerCase();
  if (!isBlank(offer.disponibilidade) && !VALID_AVAILABILITY.has(availability)) {
    warnings.push({
      field: "disponibilidade",
      code: "unknown_availability",
      message: "disponibilidade is not in the recommended list."
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsed: {
      price,
      previousPrice
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const sampleOffer = {
    marketplace: "exemplo",
    titulo: "Produto exemplo",
    categoria: "Casa",
    preco: "99,90",
    url_afiliado: "https://example.com/oferta",
    url_imagem: "https://example.com/imagem.jpg",
    disponibilidade: "disponivel"
  };

  console.log(JSON.stringify(validateOffer(sampleOffer), null, 2));
}

export { parseCurrency, validateOffer };
