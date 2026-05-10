import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const automationRoot = path.resolve(__dirname, "..");

const DEFAULT_INPUT_FILE = path.join(automationRoot, "outputs", "products.json");
const DEFAULT_CACHE_FILE = path.join(automationRoot, "cache", "offers-cache.json");
const DEFAULT_LOG_DIR = path.join(automationRoot, "logs");

const REQUIRED_OFFER_FIELDS = [
  "id",
  "marketplace",
  "title",
  "price",
  "currency",
  "affiliateUrl",
  "imageUrl",
  "availability",
  "status",
  "updatedAt"
];

function buildRuntimeConfig() {
  return {
    inputFile: path.resolve(automationRoot, process.env.PUBLISH_INPUT_FILE || DEFAULT_INPUT_FILE),
    cacheFile: path.resolve(automationRoot, process.env.PUBLISH_CACHE_FILE || DEFAULT_CACHE_FILE),
    logDir: path.resolve(automationRoot, process.env.LOG_DIR || DEFAULT_LOG_DIR)
  };
}

async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
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

function validateNormalizedOutput(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Normalized output must be an object."] };
  }

  if (!data.metadata || typeof data.metadata !== "object") {
    errors.push("metadata is required.");
  }

  if (!Array.isArray(data.offers)) {
    errors.push("offers must be an array.");
  }

  if (!Array.isArray(data.rejected)) {
    errors.push("rejected must be an array.");
  }

  for (const [index, offer] of (data.offers || []).entries()) {
    for (const field of REQUIRED_OFFER_FIELDS) {
      if (offer[field] === undefined || offer[field] === null || offer[field] === "") {
        errors.push(`offers[${index}].${field} is required.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function groupOffersByMarketplace(offers) {
  return offers.reduce((groups, offer) => {
    const marketplace = offer.marketplace || "unknown";
    return {
      ...groups,
      [marketplace]: [...(groups[marketplace] || []), offer.id]
    };
  }, {});
}

function buildIncrementalSummary(currentOffers, previousCache) {
  const previousOffers = new Map((previousCache?.offers || []).map((offer) => [offer.id, offer]));
  const currentOfferIds = new Set(currentOffers.map((offer) => offer.id));

  const added = [];
  const updated = [];

  for (const offer of currentOffers) {
    const previousOffer = previousOffers.get(offer.id);

    if (!previousOffer) {
      added.push(offer.id);
      continue;
    }

    if (JSON.stringify(previousOffer) !== JSON.stringify(offer)) {
      updated.push(offer.id);
    }
  }

  const removed = [...previousOffers.keys()].filter((offerId) => !currentOfferIds.has(offerId));

  return {
    added,
    updated,
    removed,
    addedCount: added.length,
    updatedCount: updated.length,
    removedCount: removed.length
  };
}

function buildPublishPayload(normalizedOutput, previousCache = null) {
  const offers = [...normalizedOutput.offers].sort((a, b) => {
    const priorityDiff = (a.priority || 100) - (b.priority || 100);
    return priorityDiff !== 0 ? priorityDiff : a.title.localeCompare(b.title);
  });

  const marketplaces = [...new Set(offers.map((offer) => offer.marketplace))].sort();
  const offersByMarketplace = groupOffersByMarketplace(offers);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      type: normalizedOutput.metadata?.source || "unknown",
      processedAt: normalizedOutput.metadata?.processedAt || null
    },
    summary: {
      totalOffers: offers.length,
      rejectedCount: normalizedOutput.rejected?.length || 0,
      marketplaces
    },
    sync: {
      mode: "full",
      incrementalReady: true,
      changes: buildIncrementalSummary(offers, previousCache)
    },
    offersByMarketplace,
    offers,
    apiPayload: {
      offers,
      marketplaces,
      generatedAt: new Date().toISOString()
    }
  };
}

async function readPreviousCache(cacheFile) {
  try {
    return await readJsonFile(cacheFile);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function publishSiteOffers(config = buildRuntimeConfig()) {
  await writeLog(config.logDir, {
    level: "info",
    event: "publish_started",
    inputFile: config.inputFile,
    cacheFile: config.cacheFile
  });

  try {
    const normalizedOutput = await readJsonFile(config.inputFile);
    const validation = validateNormalizedOutput(normalizedOutput);

    if (!validation.valid) {
      throw new Error(`Invalid normalized output: ${validation.errors.join(" | ")}`);
    }

    const previousCache = await readPreviousCache(config.cacheFile);
    const payload = buildPublishPayload(normalizedOutput, previousCache);

    await writeJsonFile(config.cacheFile, payload);
    await writeLog(config.logDir, {
      level: "info",
      event: "publish_finished",
      totalOffers: payload.summary.totalOffers,
      rejectedCount: payload.summary.rejectedCount,
      marketplaces: payload.summary.marketplaces,
      addedCount: payload.sync.changes.addedCount,
      updatedCount: payload.sync.changes.updatedCount,
      removedCount: payload.sync.changes.removedCount
    });

    console.log(`Publish payload written to ${config.cacheFile}`);
    return payload;
  } catch (error) {
    await writeLog(config.logDir, {
      level: "error",
      event: "publish_failed",
      message: error.message
    });

    console.error(`Publish failed: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  publishSiteOffers();
}

export {
  buildPublishPayload,
  publishSiteOffers,
  validateNormalizedOutput
};
