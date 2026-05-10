import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { google } from "googleapis";
import { validateOffer } from "../validators/offer-validator.js";
import { normalizeOffer } from "../normalizers/offer-normalizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const automationRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(automationRoot, "config", ".env"), quiet: true });

const DEFAULT_OUTPUT_FILE = path.join(automationRoot, "outputs", "products.json");
const DEFAULT_LOG_DIR = path.join(automationRoot, "logs");

const SHEET_COLUMNS = [
  "marketplace",
  "titulo",
  "categoria",
  "preco",
  "preco_anterior",
  "url_afiliado",
  "url_imagem",
  "disponibilidade",
  "prioridade",
  "status",
  "observacoes"
];

const REAL_SHEET_COLUMNS = [
  "envio_whatsapp",
  "link_produto_filiado",
  "plataforma",
  "nome_produto",
  "preco",
  "preco_promocional",
  "desconto_percentual",
  "imagem_url"
];

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function isRealSheetHeader(row) {
  const normalizedHeader = row.map(normalizeHeader);
  return REAL_SHEET_COLUMNS.every((column) => normalizedHeader.includes(column));
}

function buildRuntimeConfig() {
  return {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID || process.env.GOOGLE_SHEET_ID,
    range: process.env.GOOGLE_SHEETS_RANGE || process.env.GOOGLE_SHEET_RANGE || "Ofertas!A1:K",
    outputFile: path.resolve(automationRoot, process.env.OUTPUT_FILE || DEFAULT_OUTPUT_FILE),
    logDir: path.resolve(automationRoot, process.env.LOG_DIR || DEFAULT_LOG_DIR)
  };
}

function mapRowToOffer(row, rowNumber) {
  return SHEET_COLUMNS.reduce(
    (offer, column, index) => ({
      ...offer,
      [column]: row[index] ?? ""
    }),
    { source: "google-sheets", rowNumber }
  );
}

function mapRealSheetRowToOffer(row, rowNumber) {
  const rawOffer = REAL_SHEET_COLUMNS.reduce(
    (offer, column, index) => ({
      ...offer,
      [column]: row[index] ?? ""
    }),
    {}
  );

  return {
    marketplace: rawOffer.plataforma,
    titulo: rawOffer.nome_produto,
    categoria: rawOffer.plataforma,
    preco: rawOffer.preco_promocional || rawOffer.preco,
    preco_anterior: rawOffer.preco,
    url_afiliado: rawOffer.link_produto_filiado,
    url_imagem: rawOffer.imagem_url,
    disponibilidade: rawOffer.envio_whatsapp === "pendente" ? "pre-venda" : "disponivel",
    prioridade: "",
    status: rawOffer.envio_whatsapp,
    observacoes: rawOffer.desconto_percentual
      ? `desconto_percentual=${rawOffer.desconto_percentual}`
      : "",
    source: "google-sheets",
    rowNumber,
    raw: rawOffer
  };
}

async function readGoogleSheet({ spreadsheetId, range }) {
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEETS_ID environment variable.");
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  return response.data.values || [];
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeLog(logDir, event) {
  await fs.mkdir(logDir, { recursive: true });
  const filePath = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`;
  await fs.appendFile(filePath, line, "utf8");
}

function processRows(rows) {
  const dataRows = rows.slice(1);
  const mapper = isRealSheetHeader(rows[0] || []) ? mapRealSheetRowToOffer : mapRowToOffer;
  const offers = dataRows.map((row, index) => mapper(row, index + 2));

  const normalized = [];
  const rejected = [];

  for (const offer of offers) {
    const validation = validateOffer(offer);

    if (!validation.valid) {
      rejected.push({
        rowNumber: offer.rowNumber,
        marketplace: offer.marketplace,
        title: offer.titulo,
        errors: validation.errors
      });
      continue;
    }

    normalized.push(normalizeOffer(offer, validation));
  }

  const products = normalized.map(normalizeOfferForSite);

  return {
    products,
    metadata: {
      source: "google-sheets",
      totalRows: dataRows.length,
      acceptedCount: normalized.length,
      rejectedCount: rejected.length
    },
    rejected
  };
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "";
  const [integerPart, decimalPart] = value.toFixed(2).split(".");
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${formattedInteger},${decimalPart}`;
}

function formatDiscount(price, previousPrice) {
  if (!Number.isFinite(price) || !Number.isFinite(previousPrice) || previousPrice <= price) {
    return "";
  }

  const discount = Math.round(((previousPrice - price) / previousPrice) * 100);
  return discount > 0 ? `${discount}% OFF` : "";
}

function normalizeOfferForSite(offer) {
  return {
    name: offer.title,
    desc: offer.category || offer.metadata?.notes || "",
    oldPrice: formatPrice(offer.previousPrice),
    newPrice: formatPrice(offer.price),
    discount: formatDiscount(offer.price, offer.previousPrice),
    link: offer.affiliateUrl,
    image: offer.imageUrl,
    store: offer.metadata?.originalMarketplace || offer.marketplace
  };
}

async function main() {
  const config = buildRuntimeConfig();

  await writeLog(config.logDir, {
    level: "info",
    event: "ingest_started",
    range: config.range
  });

  try {
    const rows = await readGoogleSheet(config);
    const result = processRows(rows);

    await writeJsonFile(config.outputFile, result);
    await writeLog(config.logDir, {
      level: "info",
      event: "ingest_finished",
      totalRows: result.metadata.totalRows,
      acceptedCount: result.metadata.acceptedCount,
      rejectedCount: result.metadata.rejectedCount,
      outputFile: config.outputFile
    });

    console.log(`Ingest finished. Output written to ${config.outputFile}`);
  } catch (error) {
    await writeLog(config.logDir, {
      level: "error",
      event: "ingest_failed",
      message: error.message
    });

    console.error(`Ingest failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

export { mapRowToOffer, normalizeOfferForSite, processRows, readGoogleSheet };
