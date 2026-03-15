import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import Database from "better-sqlite3";
import { getPostgresPool, isPostgresConfigured } from "./db/postgres/client.mjs";
import { buildSynthesisConfig, runSynthesis, toSynthesisSignals } from "./synthesisOrchestrator.mjs";
import { initRuntimeStore, readRuntimeStore, resetRuntimeStore, writeRuntimeStore } from "./runtimeStore.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const parseDotenvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);
  const parsed = {};
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
};

// Mirror Vite's mode=config env behavior for the Node API process.
const envFromConfig = {
  ...parseDotenvFile(path.resolve(rootDir, ".env.config")),
  ...parseDotenvFile(path.resolve(rootDir, ".env.config.local")),
};
for (const [key, value] of Object.entries(envFromConfig)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const port = Number(process.env.API_PORT ?? 8794);
const isVercelRuntime = String(process.env.VERCEL ?? "").toLowerCase() === "1" || String(process.env.VERCEL ?? "").toLowerCase() === "true";
const defaultDbPath = isVercelRuntime ? "/tmp/app.db" : "db/app.db";
const defaultRuntimeStorePath = isVercelRuntime ? "/tmp/flat-runtime-store.json" : "db/flat-runtime-store.json";
const dbPath = path.resolve(rootDir, process.env.FEEDBACK_DB_PATH ?? defaultDbPath);
const serverSeedDir = path.resolve(rootDir, "src/state/seeds");
const runtimeStorePath = path.resolve(rootDir, process.env.FLAT_RUNTIME_STORE_PATH ?? defaultRuntimeStorePath);
const parseDbEngine = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "postgres" ? "postgres" : "sqlite";
};
const dbEngine = parseDbEngine(process.env.FEEDBACK_DB_ENGINE);
const parseDataSourceMode = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "db" || normalized === "database" ? "db" : "flat";
};
const dataSourceMode = parseDataSourceMode(
  process.env.FEEDBACK_DATA_SOURCE ?? process.env.DATA_SOURCE ?? process.env.VITE_DATA_SOURCE,
);
const useDbDataSource = dataSourceMode === "db";
const usePostgresDb = useDbDataSource && dbEngine === "postgres";
const synthesisConfig = buildSynthesisConfig(process.env);

if (dbEngine === "postgres") {
  if (!isPostgresConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[api] FEEDBACK_DB_ENGINE=postgres but POSTGRES_URL is not configured yet.");
  } else {
    // eslint-disable-next-line no-console
    console.info("[api] FEEDBACK_DB_ENGINE=postgres detected. Postgres-backed handlers enabled for DB mode.");
  }
}

const withPostgresClient = async (work) => {
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
};

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
initRuntimeStore(runtimeStorePath);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const nowIso = () => new Date().toISOString();
const quoteIdentifier = (value) => `"${String(value).replace(/"/g, "\"\"")}"`;
const loadJsonSeed = (filename) => {
  const filePath = path.join(serverSeedDir, filename);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[api] failed to load seed file ${filePath}`, error);
    return [];
  }
};
const LEGACY_APP_TO_LABEL = {
  "digital-experience": "Digital Experience",
  origination: "Origination",
  "credit-risk": "Credit & Risk",
  servicing: "Servicing",
  "monitoring-controls": "Monitoring & Controls",
  "syndication-complex-lending": "Syndication / Complex Lending",
  "analytics-inquiry": "Analytics & Inquiry",
  "platform-services": "Platform Services",
};

const appLabelFromId = (appId) => LEGACY_APP_TO_LABEL[String(appId)] ?? String(appId ?? "Unspecified");

const normalizeRole = (value) => {
  const role = String(value ?? "unspecified").toLowerCase().trim();
  if (["ops", "eng", "product", "finance", "exec", "unspecified"].includes(role)) return role;
  return "unspecified";
};

const getFlatCoreSeeds = () => ({
  appAreas: loadJsonSeed("appAreas.seed.json"),
  products: loadJsonSeed("products.seed.json"),
  productFeatures: loadJsonSeed("productFeatures.seed.json"),
  screenLibrary: loadJsonSeed("screenLibrary.seed.json"),
  cardSortConcepts: loadJsonSeed("cardSortConcepts.seed.json"),
  categories: loadJsonSeed("categories.seed.json"),
  subcategories: loadJsonSeed("subcategories.seed.json"),
  institutionProfiles: loadJsonSeed("institutionProfiles.seed.json"),
  productFeatureCategories: loadJsonSeed("productFeatureCategories.seed.json"),
});

const getFlatSignalSeeds = () => ({
  featureRequests: loadJsonSeed("featureRequests.seed.json"),
  kudos: loadJsonSeed("kudos.seed.json"),
  screenFeedback: loadJsonSeed("screenFeedback.seed.json"),
});

const mergeFeatureRequestsWithVoteIncrements = (seedRows, runtimeStore) => {
  const increments = runtimeStore.featureRequestVoteIncrements ?? {};
  const merged = [...seedRows, ...(Array.isArray(runtimeStore.featureRequests) ? runtimeStore.featureRequests : [])]
    .map((row, index) => {
      const id = String(row.id ?? `fr-runtime-${index + 1}`);
      const addedVotes = Number(increments[id] ?? 0);
      return {
        ...row,
        id,
        votes: Math.max(0, Number(row.votes ?? 0) + Math.max(0, addedVotes)),
      };
    });
  return merged;
};

const buildFlatMergedSignals = () => {
  const runtimeStore = readRuntimeStore(runtimeStorePath);
  const signalSeeds = getFlatSignalSeeds();
  return {
    featureRequests: mergeFeatureRequestsWithVoteIncrements(signalSeeds.featureRequests, runtimeStore),
    screenFeedback: [...signalSeeds.screenFeedback, ...(Array.isArray(runtimeStore.screenFeedback) ? runtimeStore.screenFeedback : [])],
    kudos: [...signalSeeds.kudos, ...(Array.isArray(runtimeStore.kudos) ? runtimeStore.kudos : [])],
    cardSortResults: Array.isArray(runtimeStore.cardSortResults) ? runtimeStore.cardSortResults : [],
  };
};

const getFlatFeatureRequestVoteCount = (featureRequestId) => {
  const idAsString = String(featureRequestId ?? "");
  const mergedSignals = buildFlatMergedSignals();
  const row = mergedSignals.featureRequests.find((request) => String(request.id) === idAsString);
  return Math.max(0, Number(row?.votes ?? 0));
};
const CATEGORY_DESCRIPTIONS = {
  Lending: "Lending Product Ecosystem",
};
const SUBCATEGORY_NAME_OVERRIDES = {
  "Origination Solutions": "Origination",
  "Servicing Solutions": "Servicing",
  "Specialty Lending Solutions": "Specialty Lending",
};
const ERD_TABLES = [
  "categories",
  "subcategories",
  "products",
  "features",
  "screens",
  "feature_areas",
  "feature_requests",
  "feature_request_votes",
  "feedback",
  "kudos",
];

const findExistingTableName = (logicalName) => {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND lower(name) = lower(?)
    LIMIT 1
  `).get(logicalName);
  return row?.name ?? null;
};

const getTableColumns = (tableName) => {
  if (!tableName) return [];
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => String(row.name));
};

const ensureExpectedTableShape = (logicalName, expectedColumns) => {
  const existingName = findExistingTableName(logicalName);
  if (!existingName) return;
  const columns = new Set(getTableColumns(existingName));
  const hasExpectedShape = expectedColumns.every((column) => columns.has(column));
  if (hasExpectedShape) return;
  const renamed = `${existingName}_legacy_${Date.now()}`;
  db.exec(`ALTER TABLE ${quoteIdentifier(existingName)} RENAME TO ${quoteIdentifier(renamed)};`);
  // eslint-disable-next-line no-console
  console.warn(`[api] archived legacy table ${existingName} -> ${renamed}`);
};

const renameColumnIfExists = (tableName, from, to) => {
  const existingName = findExistingTableName(tableName);
  if (!existingName) return;
  const columns = new Set(getTableColumns(existingName));
  if (!columns.has(from) || columns.has(to)) return;
  db.exec(`ALTER TABLE ${quoteIdentifier(existingName)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)};`);
};

[
  ["categories", "CategoryID", "CATEGORY_ID"],
  ["categories", "CategoryName", "CATEGORY_NAME"],
  ["categories", "Description", "DESCRIPTION"],
  ["subcategories", "SubcategoryID", "SUBCATEGORY_ID"],
  ["subcategories", "CategoryID", "CATEGORY_ID"],
  ["subcategories", "SubcategoryName", "SUBCATEGORY_NAME"],
  ["subcategories", "Description", "DESCRIPTION"],
  ["products", "ProductID", "PRODUCT_ID"],
  ["products", "SubcategoryID", "SUBCATEGORY_ID"],
  ["products", "ProductName", "PRODUCT_NAME"],
  ["products", "Description", "DESCRIPTION"],
  ["products", "ProductStatus", "PRODUCT_STATUS"],
  ["products", "LegacyProductCode", "LEGACY_PRODUCT_CODE"],
  ["features", "FeatureID", "FEATURE_ID"],
  ["features", "ProductID", "PRODUCT_ID"],
  ["features", "FeatureName", "FEATURE_NAME"],
  ["features", "FeatureDescription", "FEATURE_DESCRIPTION"],
  ["features", "FeatureStatus", "FEATURE_STATUS"],
  ["features", "ModuleName", "MODULE_NAME"],
  ["features", "LegacyFeatureCode", "LEGACY_FEATURE_CODE"],
  ["screens", "ScreenID", "SCREEN_ID"],
  ["screens", "ProductID", "PRODUCT_ID"],
  ["screens", "ScreenName", "SCREEN_NAME"],
  ["screens", "ScreenCategory", "SCREEN_CATEGORY"],
  ["screens", "ScreenDescription", "SCREEN_DESCRIPTION"],
  ["screens", "LegacyScreenCode", "LEGACY_SCREEN_CODE"],
  ["feature_requests", "FeatureRequestID", "FEATURE_REQUEST_ID"],
  ["feature_requests", "ProductID", "PRODUCT_ID"],
  ["feature_requests", "ConvertedFeatureID", "CONVERTED_FEATURE_ID"],
  ["feature_requests", "Title", "TITLE"],
  ["feature_requests", "Description", "DESCRIPTION"],
  ["feature_requests", "WorkflowContext", "WORKFLOW_CONTEXT"],
  ["feature_requests", "Status", "STATUS"],
  ["feature_requests", "CreatedAt", "CREATED_AT"],
  ["feature_requests", "LegacyRequestCode", "LEGACY_REQUEST_CODE"],
  ["feature_requests", "AppArea", "APP_AREA"],
  ["feature_requests", "ScreenID", "SCREEN_ID"],
  ["feature_requests", "ScreenName", "SCREEN_NAME"],
  ["feature_requests", "Origin", "ORIGIN"],
  ["feature_request_votes", "VoteID", "VOTE_ID"],
  ["feature_request_votes", "FeatureRequestID", "FEATURE_REQUEST_ID"],
  ["feature_request_votes", "SessionID", "SESSION_ID"],
  ["feature_request_votes", "VoteValue", "VOTE_VALUE"],
  ["feature_request_votes", "CreatedAt", "CREATED_AT"],
  ["feedback", "FeedbackID", "FEEDBACK_ID"],
  ["feedback", "ProductID", "PRODUCT_ID"],
  ["feedback", "FeatureID", "FEATURE_ID"],
  ["feedback", "ScreenID", "SCREEN_ID"],
  ["feedback", "FeedbackType", "FEEDBACK_TYPE"],
  ["feedback", "FeedbackText", "FEEDBACK_TEXT"],
  ["feedback", "Role", "ROLE"],
  ["feedback", "CreatedAt", "CREATED_AT"],
  ["feedback", "AppArea", "APP_AREA"],
  ["feedback", "ScreenName", "SCREEN_NAME"],
  ["kudos", "KudosID", "KUDOS_ID"],
  ["kudos", "ProductID", "PRODUCT_ID"],
  ["kudos", "FeatureID", "FEATURE_ID"],
  ["kudos", "ScreenID", "SCREEN_ID"],
  ["kudos", "QuoteText", "QUOTE_TEXT"],
  ["kudos", "Role", "ROLE"],
  ["kudos", "ConsentPublic", "CONSENT_PUBLIC"],
  ["kudos", "CreatedAt", "CREATED_AT"],
  ["kudos", "AppArea", "APP_AREA"],
  ["kudos", "ScreenName", "SCREEN_NAME"],
].forEach(([tableName, from, to]) => renameColumnIfExists(tableName, from, to));

[
  ["categories", ["CATEGORY_ID", "CATEGORY_NAME", "DESCRIPTION"]],
  ["subcategories", ["SUBCATEGORY_ID", "CATEGORY_ID", "SUBCATEGORY_NAME", "DESCRIPTION"]],
  ["products", ["PRODUCT_ID", "SUBCATEGORY_ID", "PRODUCT_NAME", "DESCRIPTION", "PRODUCT_STATUS", "LEGACY_PRODUCT_CODE"]],
  ["features", ["FEATURE_ID", "PRODUCT_ID", "FEATURE_NAME", "FEATURE_DESCRIPTION", "FEATURE_STATUS", "MODULE_NAME", "LEGACY_FEATURE_CODE"]],
  ["screens", ["SCREEN_ID", "PRODUCT_ID", "SCREEN_NAME", "SCREEN_CATEGORY", "SCREEN_DESCRIPTION", "LEGACY_SCREEN_CODE"]],
  ["feature_areas", ["FEATURE_AREA_ID", "FEATURE_AREA_NAME", "PRODUCT_ID"]],
  ["feature_requests", ["FEATURE_REQUEST_ID", "PRODUCT_ID", "CONVERTED_FEATURE_ID", "TITLE", "DESCRIPTION", "WORKFLOW_CONTEXT", "STATUS", "CREATED_AT"]],
  ["feature_request_votes", ["VOTE_ID", "FEATURE_REQUEST_ID", "SESSION_ID", "VOTE_VALUE", "CREATED_AT"]],
  ["feedback", ["FEEDBACK_ID", "PRODUCT_ID", "FEATURE_ID", "SCREEN_ID", "FEEDBACK_TYPE", "FEEDBACK_TEXT", "ROLE", "CREATED_AT"]],
  ["kudos", ["KUDOS_ID", "PRODUCT_ID", "FEATURE_ID", "SCREEN_ID", "QUOTE_TEXT", "ROLE", "CONSENT_PUBLIC", "CREATED_AT"]],
].forEach(([tableName, expectedColumns]) => ensureExpectedTableShape(tableName, expectedColumns));

db.transaction(() => {
  db.pragma("foreign_keys = OFF");
  const existing = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
  `).all().map((row) => String(row.name));
  const keep = new Set(ERD_TABLES.map((name) => name.toLowerCase()));
  for (const tableName of existing) {
    if (keep.has(tableName.toLowerCase())) {
      continue;
    }
    db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)};`);
    // eslint-disable-next-line no-console
    console.warn(`[api] dropped non-ERD table ${tableName}`);
  }
  db.pragma("foreign_keys = ON");
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    CATEGORY_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    CATEGORY_NAME TEXT NOT NULL UNIQUE,
    DESCRIPTION TEXT
  );

  CREATE TABLE IF NOT EXISTS subcategories (
    SUBCATEGORY_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    CATEGORY_ID INTEGER NOT NULL,
    SUBCATEGORY_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    UNIQUE (CATEGORY_ID, SUBCATEGORY_NAME),
    FOREIGN KEY (CATEGORY_ID) REFERENCES categories(CATEGORY_ID)
  );

  CREATE TABLE IF NOT EXISTS products (
    PRODUCT_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    SUBCATEGORY_ID INTEGER NOT NULL,
    PRODUCT_NAME TEXT NOT NULL,
    DESCRIPTION TEXT,
    PRODUCT_STATUS TEXT NOT NULL DEFAULT 'active',
    LEGACY_PRODUCT_CODE TEXT UNIQUE,
    UNIQUE (SUBCATEGORY_ID, PRODUCT_NAME),
    FOREIGN KEY (SUBCATEGORY_ID) REFERENCES subcategories(SUBCATEGORY_ID)
  );

  CREATE TABLE IF NOT EXISTS features (
    FEATURE_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_NAME TEXT NOT NULL,
    FEATURE_DESCRIPTION TEXT,
    FEATURE_STATUS TEXT,
    MODULE_NAME TEXT,
    LEGACY_FEATURE_CODE TEXT UNIQUE,
    UNIQUE (PRODUCT_ID, FEATURE_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS screens (
    SCREEN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    SCREEN_NAME TEXT NOT NULL,
    SCREEN_CATEGORY TEXT,
    SCREEN_DESCRIPTION TEXT,
    LEGACY_SCREEN_CODE TEXT UNIQUE,
    UNIQUE (PRODUCT_ID, SCREEN_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_areas (
    FEATURE_AREA_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    FEATURE_AREA_NAME TEXT NOT NULL,
    PRODUCT_ID INTEGER NOT NULL,
    UNIQUE (PRODUCT_ID, FEATURE_AREA_NAME),
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_requests (
    FEATURE_REQUEST_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    CONVERTED_FEATURE_ID INTEGER,
    TITLE TEXT NOT NULL,
    DESCRIPTION TEXT,
    WORKFLOW_CONTEXT TEXT,
    STATUS TEXT NOT NULL DEFAULT 'open',
    CREATED_AT TEXT NOT NULL,
    LEGACY_REQUEST_CODE TEXT UNIQUE,
    APP_AREA TEXT,
    SCREEN_ID INTEGER,
    SCREEN_NAME TEXT,
    ORIGIN TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (CONVERTED_FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE TABLE IF NOT EXISTS feature_request_votes (
    VOTE_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    FEATURE_REQUEST_ID INTEGER NOT NULL,
    SESSION_ID TEXT NOT NULL,
    VOTE_VALUE INTEGER NOT NULL CHECK (VOTE_VALUE IN (-1, 1)),
    CREATED_AT TEXT NOT NULL,
    FOREIGN KEY (FEATURE_REQUEST_ID) REFERENCES feature_requests(FEATURE_REQUEST_ID)
  );

  CREATE TABLE IF NOT EXISTS feedback (
    FEEDBACK_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_ID INTEGER,
    SCREEN_ID INTEGER,
    FEEDBACK_TYPE TEXT NOT NULL CHECK (FEEDBACK_TYPE IN ('issue','suggestion','missing','works-well')),
    FEEDBACK_TEXT TEXT,
    ROLE TEXT NOT NULL DEFAULT 'unspecified',
    CREATED_AT TEXT NOT NULL,
    APP_AREA TEXT,
    SCREEN_NAME TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE TABLE IF NOT EXISTS kudos (
    KUDOS_ID INTEGER PRIMARY KEY AUTOINCREMENT,
    PRODUCT_ID INTEGER NOT NULL,
    FEATURE_ID INTEGER,
    SCREEN_ID INTEGER,
    QUOTE_TEXT TEXT NOT NULL,
    ROLE TEXT NOT NULL,
    CONSENT_PUBLIC INTEGER NOT NULL DEFAULT 0,
    CREATED_AT TEXT NOT NULL,
    APP_AREA TEXT,
    SCREEN_NAME TEXT,
    FOREIGN KEY (PRODUCT_ID) REFERENCES products(PRODUCT_ID),
    FOREIGN KEY (FEATURE_ID) REFERENCES features(FEATURE_ID),
    FOREIGN KEY (SCREEN_ID) REFERENCES screens(SCREEN_ID)
  );

  CREATE INDEX IF NOT EXISTS idx_features_product ON features(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_screens_product ON screens(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_feature_areas_product ON feature_areas(PRODUCT_ID);
  CREATE INDEX IF NOT EXISTS idx_feature_requests_product_created ON feature_requests(PRODUCT_ID, CREATED_AT);
  CREATE INDEX IF NOT EXISTS idx_feature_request_votes_request ON feature_request_votes(FEATURE_REQUEST_ID);
  CREATE INDEX IF NOT EXISTS idx_feedback_product_feature_screen_created ON feedback(PRODUCT_ID, FEATURE_ID, SCREEN_ID, CREATED_AT);
  CREATE INDEX IF NOT EXISTS idx_kudos_product_feature_screen_created ON kudos(PRODUCT_ID, FEATURE_ID, SCREEN_ID, CREATED_AT);
`);

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
};

const toAppArea = (value) => {
  if (value === "Digital Experience") return "digital-experience";
  if (value === "Origination") return "origination";
  if (value === "Credit & Risk" || value === "Customer Risk & Credit") return "credit-risk";
  if (value === "Servicing" || value === "SBA & Re-Amort, Servicing") return "servicing";
  if (value === "Monitoring & Controls") return "monitoring-controls";
  if (value === "Syndication / Complex Lending" || value === "Syndication") return "syndication-complex-lending";
  if (value === "Analytics & Inquiry") return "analytics-inquiry";
  return "platform-services";
};

const resolveProductByLegacyCode = db.prepare("SELECT PRODUCT_ID AS ProductID FROM products WHERE LEGACY_PRODUCT_CODE = ?");
const resolveFeatureByLegacyCode = db.prepare("SELECT FEATURE_ID AS FeatureID, PRODUCT_ID AS ProductID, FEATURE_NAME AS FeatureName, MODULE_NAME AS ModuleName FROM features WHERE LEGACY_FEATURE_CODE = ?");
const resolveScreenByLegacyCode = db.prepare("SELECT SCREEN_ID AS ScreenID, PRODUCT_ID AS ProductID, SCREEN_NAME AS ScreenName, SCREEN_CATEGORY AS ScreenCategory FROM screens WHERE LEGACY_SCREEN_CODE = ?");
const resolveFeatureByName = db.prepare("SELECT FEATURE_ID AS FeatureID, PRODUCT_ID AS ProductID, FEATURE_NAME AS FeatureName, MODULE_NAME AS ModuleName FROM features WHERE lower(FEATURE_NAME) = lower(?)");
const resolveScreenByName = db.prepare("SELECT SCREEN_ID AS ScreenID, PRODUCT_ID AS ProductID, SCREEN_NAME AS ScreenName, SCREEN_CATEGORY AS ScreenCategory FROM screens WHERE lower(SCREEN_NAME) = lower(?)");

const buildAdminTablesDb = () => {
  const tableNames = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all()
    .map((row) => String(row.name))
    .filter((name) => ERD_TABLES.includes(name.toLowerCase()));

  return tableNames.map((tableName) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => String(row.name));
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all();
    return { id: tableName, label: tableName, columns, rows };
  });
};

const bootstrapPayloadDb = () => {
  const products = db.prepare(`
    SELECT p.PRODUCT_ID AS id, p.PRODUCT_NAME AS name, p.PRODUCT_STATUS AS status, p.DESCRIPTION AS description,
      p.LEGACY_PRODUCT_CODE AS legacyProductCode, s.SUBCATEGORY_NAME AS subcategory, c.CATEGORY_NAME AS category
    FROM products p
    JOIN subcategories s ON s.SUBCATEGORY_ID = p.SUBCATEGORY_ID
    JOIN categories c ON c.CATEGORY_ID = s.CATEGORY_ID
    ORDER BY p.PRODUCT_ID
  `).all();

  const features = db.prepare(`
    SELECT f.FEATURE_ID AS id, f.PRODUCT_ID AS productId, f.FEATURE_NAME AS name, f.FEATURE_DESCRIPTION AS description,
      f.FEATURE_STATUS AS status, f.MODULE_NAME AS moduleName, f.LEGACY_FEATURE_CODE AS legacyFeatureCode
    FROM features f
    ORDER BY f.FEATURE_ID
  `).all();

  const screens = db.prepare(`
    SELECT s.SCREEN_ID AS id, s.PRODUCT_ID AS productId, s.SCREEN_NAME AS name, s.SCREEN_CATEGORY AS screenCategory,
      s.SCREEN_DESCRIPTION AS description, s.LEGACY_SCREEN_CODE AS legacyScreenCode
    FROM screens s
    ORDER BY s.SCREEN_ID
  `).all();

  const featureRequests = db.prepare(`
    SELECT fr.FEATURE_REQUEST_ID AS id, fr.PRODUCT_ID AS productId, fr.CONVERTED_FEATURE_ID AS convertedFeatureId,
      fr.SCREEN_ID AS screenId, fr.SCREEN_NAME AS screenName, fr.APP_AREA AS app, fr.TITLE AS title, fr.DESCRIPTION AS description,
      fr.WORKFLOW_CONTEXT AS workflowContext, fr.STATUS AS status, fr.CREATED_AT AS createdAt, fr.LEGACY_REQUEST_CODE AS legacyRequestCode,
      fr.ORIGIN AS origin, COALESCE(SUM(frv.VOTE_VALUE), 0) AS votes
    FROM feature_requests fr
    LEFT JOIN feature_request_votes frv ON frv.FEATURE_REQUEST_ID = fr.FEATURE_REQUEST_ID
    GROUP BY fr.FEATURE_REQUEST_ID
    ORDER BY fr.CREATED_AT DESC
  `).all();

  const feedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, PRODUCT_ID AS productId, FEATURE_ID AS featureId, SCREEN_ID AS screenId, APP_AREA AS app,
      SCREEN_NAME AS screenName, FEEDBACK_TYPE AS type, FEEDBACK_TEXT AS text, ROLE AS role, CREATED_AT AS createdAt
    FROM feedback ORDER BY CREATED_AT DESC
  `).all();

  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, PRODUCT_ID AS productId, FEATURE_ID AS featureId, SCREEN_ID AS screenId, APP_AREA AS app,
      SCREEN_NAME AS screenName, QUOTE_TEXT AS text, ROLE AS role, CONSENT_PUBLIC AS consentPublic, CREATED_AT AS createdAt
    FROM kudos ORDER BY CREATED_AT DESC
  `).all();

  const tables = buildAdminTablesDb();

  return { products, features, screens, featureRequests, screenFeedback: feedback, kudosQuotes: kudos, appAreas: [], cardSortConcepts: [], adminTables: tables };
};

const buildAdminTablesPostgres = async () =>
  withPostgresClient(async (client) => {
    const names = (
      await client.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`,
      )
    ).rows
      .map((row) => String(row.table_name))
      .filter((name) => ERD_TABLES.includes(name.toLowerCase()));

    const tables = [];
    for (const tableName of names) {
      const columnRows = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );
      const rowData = await client.query(`SELECT * FROM ${tableName}`);
      tables.push({
        id: tableName,
        label: tableName,
        columns: columnRows.rows.map((row) => String(row.column_name)),
        rows: rowData.rows,
      });
    }
    return tables;
  });

const bootstrapPayloadPostgres = async () =>
  withPostgresClient(async (client) => {
    const products = (
      await client.query(`
        SELECT p.product_id AS id, p.product_name AS name, p.product_status AS status, p.description AS description,
          p.legacy_product_code AS "legacyProductCode", s.subcategory_name AS subcategory, c.category_name AS category
        FROM products p
        JOIN subcategories s ON s.subcategory_id = p.subcategory_id
        JOIN categories c ON c.category_id = s.category_id
        ORDER BY p.product_id
      `)
    ).rows;

    const features = (
      await client.query(`
        SELECT f.feature_id AS id, f.product_id AS "productId", f.feature_name AS name, f.feature_description AS description,
          f.feature_status AS status, f.module_name AS "moduleName", f.legacy_feature_code AS "legacyFeatureCode"
        FROM features f
        ORDER BY f.feature_id
      `)
    ).rows;

    const screens = (
      await client.query(`
        SELECT s.screen_id AS id, s.product_id AS "productId", s.screen_name AS name, s.screen_category AS "screenCategory",
          s.screen_description AS description, s.legacy_screen_code AS "legacyScreenCode"
        FROM screens s
        ORDER BY s.screen_id
      `)
    ).rows;

    const featureRequests = (
      await client.query(`
        SELECT fr.feature_request_id AS id, fr.product_id AS "productId", fr.converted_feature_id AS "convertedFeatureId",
          fr.screen_id AS "screenId", fr.screen_name AS "screenName", fr.app_area AS app, fr.title AS title, fr.description AS description,
          fr.workflow_context AS "workflowContext", fr.status AS status, fr.created_at AS "createdAt", fr.legacy_request_code AS "legacyRequestCode",
          fr.origin AS origin, COALESCE(SUM(frv.vote_value), 0) AS votes
        FROM feature_requests fr
        LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.feature_request_id
        GROUP BY fr.feature_request_id
        ORDER BY fr.created_at DESC
      `)
    ).rows;

    const screenFeedback = (
      await client.query(`
        SELECT feedback_id AS id, product_id AS "productId", feature_id AS "featureId", screen_id AS "screenId", app_area AS app,
          screen_name AS "screenName", feedback_type AS type, feedback_text AS text, role AS role, created_at AS "createdAt"
        FROM feedback
        ORDER BY created_at DESC
      `)
    ).rows;

    const kudosQuotes = (
      await client.query(`
        SELECT kudos_id AS id, product_id AS "productId", feature_id AS "featureId", screen_id AS "screenId", app_area AS app,
          screen_name AS "screenName", quote_text AS text, role AS role, consent_public AS "consentPublic", created_at AS "createdAt"
        FROM kudos
        ORDER BY created_at DESC
      `)
    ).rows;

    const adminTables = await buildAdminTablesPostgres();
    return { products, features, screens, featureRequests, screenFeedback, kudosQuotes, appAreas: [], cardSortConcepts: [], adminTables };
  });

const toFlatBootstrap = () => {
  const core = getFlatCoreSeeds();
  const merged = buildFlatMergedSignals();
  const productIdByLegacy = new Map();
  const products = core.products.map((row, index) => {
    const id = index + 1;
    productIdByLegacy.set(String(row.id), id);
    return {
      id,
      name: String(row.name ?? ""),
      status: "active",
      description: String(row.name ?? ""),
      legacyProductCode: String(row.id ?? ""),
      category: String(row.category ?? ""),
      subcategory: String(row.subcategory ?? ""),
    };
  });

  const categoryLabelById = new Map(
    core.productFeatureCategories.map((row) => [String(row.id ?? ""), String(row.category ?? "Platform Services")]),
  );
  const features = core.productFeatures.map((row, index) => ({
    id: index + 1,
    productId: productIdByLegacy.get(String(row.product_id ?? "")) ?? products[0]?.id ?? 1,
    name: String(row.name ?? ""),
    description: String(row.description ?? `Capture feedback for ${String(row.name ?? "")}.`),
    status: String(row.status ?? "planned"),
    moduleName: categoryLabelById.get(String(row.feature_category_id ?? "")) ?? "Platform Services",
    legacyFeatureCode: String(row.id ?? ""),
  }));

  const featureByName = new Map(features.map((row) => [row.name.toLowerCase(), row]));
  // Use product feature rows as canonical screen list so PRD-005 retains full 51 features.
  const screenRows = core.productFeatures.length > 0 ? core.productFeatures : core.screenLibrary;
  const screens = screenRows.map((row, index) => {
    const name = String(row.name ?? "");
    const matchedFeature = featureByName.get(name.toLowerCase());
    const app = row.app ?? toAppArea(matchedFeature?.moduleName ?? "Platform Services");
    return {
      id: index + 1,
      productId: matchedFeature?.productId ?? products[0]?.id ?? 1,
      name,
      screenCategory: app,
      description: String(row.description ?? ""),
      legacyScreenCode: String(row.id ?? `screen-${index + 1}`),
    };
  });

  const screenByLegacy = new Map(screens.map((screen) => [String(screen.legacyScreenCode), screen]));
  const screenByName = new Map(screens.map((screen) => [String(screen.name).toLowerCase(), screen]));

  const resolveScreen = (screenId, screenName) => {
    if (screenId != null) {
      const byLegacy = screenByLegacy.get(String(screenId));
      if (byLegacy) return byLegacy;
      const byId = screens.find((screen) => Number(screen.id) === Number(screenId));
      if (byId) return byId;
    }
    if (screenName) {
      return screenByName.get(String(screenName).toLowerCase());
    }
    return screens[0];
  };

  const featureRequests = merged.featureRequests.map((row, index) => {
    const screen = resolveScreen(row.screenId, row.screenName);
    return {
      id: String(row.id ?? `fr-${index + 1}`),
      productId: screen?.productId ?? products[0]?.id ?? 1,
      convertedFeatureId: null,
      screenId: screen?.id,
      screenName: screen?.name ?? String(row.screenName ?? ""),
      app: row.app ?? screen?.screenCategory ?? "servicing",
      title: String(row.title ?? ""),
      description: String(row.description ?? row.title ?? ""),
      workflowContext: row.workflowContext ?? null,
      status: String(row.status ?? "open"),
      createdAt: String(row.createdAt ?? nowIso()),
      legacyRequestCode: String(row.id ?? ""),
      origin: String(row.origin ?? "kiosk"),
      votes: Math.max(0, Number(row.votes ?? 0)),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const screenFeedback = merged.screenFeedback.map((row, index) => {
    const screen = resolveScreen(row.screenId, row.screenName);
    return {
      id: String(row.id ?? `sfb-${index + 1}`),
      productId: screen?.productId ?? products[0]?.id ?? 1,
      featureId: featureByName.get(String(screen?.name ?? row.screenName ?? "").toLowerCase())?.id,
      screenId: screen?.id,
      app: row.app ?? screen?.screenCategory ?? "servicing",
      screenName: screen?.name ?? String(row.screenName ?? ""),
      type: String(row.type ?? "suggestion"),
      text: row.text == null ? null : String(row.text),
      role: normalizeRole(row.role),
      createdAt: String(row.createdAt ?? nowIso()),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const kudosQuotes = merged.kudos.map((row, index) => {
    const screen = resolveScreen(row.screenId, row.screenName);
    return {
      id: String(row.id ?? `kd-${index + 1}`),
      productId: screen?.productId ?? products[0]?.id ?? 1,
      featureId: featureByName.get(String(screen?.name ?? row.screenName ?? "").toLowerCase())?.id,
      screenId: screen?.id,
      app: row.app ?? screen?.screenCategory ?? "servicing",
      screenName: screen?.name ?? String(row.screenName ?? ""),
      text: String(row.text ?? ""),
      role: normalizeRole(row.role),
      consentPublic: Boolean(row.consentPublic ?? row.isPublicSafe),
      createdAt: String(row.createdAt ?? nowIso()),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const adminTables = [
    { id: "categories", label: "categories", columns: Object.keys(core.categories[0] ?? {}), rows: core.categories },
    { id: "subcategories", label: "subcategories", columns: Object.keys(core.subcategories[0] ?? {}), rows: core.subcategories },
    { id: "products", label: "products", columns: Object.keys(core.products[0] ?? {}), rows: core.products },
    { id: "institution_profiles", label: "institution_profiles", columns: Object.keys(core.institutionProfiles[0] ?? {}), rows: core.institutionProfiles },
    { id: "product_feature_categories", label: "product_feature_categories", columns: Object.keys(core.productFeatureCategories[0] ?? {}), rows: core.productFeatureCategories },
    { id: "product_features", label: "product_features", columns: Object.keys(core.productFeatures[0] ?? {}), rows: core.productFeatures },
    { id: "feature_requests", label: "feature_requests", columns: Object.keys(featureRequests[0] ?? {}), rows: featureRequests },
    { id: "kudos", label: "kudos", columns: Object.keys(kudosQuotes[0] ?? {}), rows: kudosQuotes },
    { id: "screen_feedback", label: "screen_feedback", columns: Object.keys(screenFeedback[0] ?? {}), rows: screenFeedback },
  ];

  return {
    appAreas: core.appAreas,
    cardSortConcepts: core.cardSortConcepts,
    products,
    features,
    screens,
    featureRequests,
    screenFeedback,
    kudosQuotes,
    adminTables,
  };
};

const buildAdminTables = async () => {
  if (!useDbDataSource) return toFlatBootstrap().adminTables;
  if (usePostgresDb) return buildAdminTablesPostgres();
  return buildAdminTablesDb();
};
const bootstrapPayload = async () => {
  if (!useDbDataSource) return toFlatBootstrap();
  if (usePostgresDb) return bootstrapPayloadPostgres();
  return bootstrapPayloadDb();
};

const reseed = (payload) => {
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  const screenLibrary = Array.isArray(payload.screenLibrary) ? payload.screenLibrary : [];
  const featureRequests = Array.isArray(payload.featureRequests) && payload.featureRequests.length > 0
    ? payload.featureRequests
    : loadJsonSeed("featureRequests.seed.json");
  const kudosQuotes = Array.isArray(payload.kudosQuotes) && payload.kudosQuotes.length > 0
    ? payload.kudosQuotes
    : loadJsonSeed("kudos.seed.json");
  const screenFeedback = Array.isArray(payload.screenFeedback) && payload.screenFeedback.length > 0
    ? payload.screenFeedback
    : loadJsonSeed("screenFeedback.seed.json");

  const findRows = (id) => tables.find((table) => table.id === id)?.rows ?? [];
  const productsRows = findRows("products");
  const productFeaturesRows = findRows("product_features");
  const productFeatureCategoriesRows = findRows("product_feature_categories");

  const categoryById = new Map(productFeatureCategoriesRows.map((row) => [String(row.id), String(row.category)]));

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM feature_request_votes;
      DELETE FROM feature_requests;
      DELETE FROM feature_areas;
      DELETE FROM feedback;
      DELETE FROM kudos;
      DELETE FROM screens;
      DELETE FROM features;
      DELETE FROM products;
      DELETE FROM subcategories;
      DELETE FROM categories;
      DELETE FROM sqlite_sequence;
    `);

    const insertCategory = db.prepare("INSERT INTO categories (CATEGORY_NAME, DESCRIPTION) VALUES (?, ?)");
    const insertSubcategory = db.prepare("INSERT INTO subcategories (CATEGORY_ID, SUBCATEGORY_NAME, DESCRIPTION) VALUES (?, ?, ?)");
    const insertProduct = db.prepare("INSERT INTO products (SUBCATEGORY_ID, PRODUCT_NAME, DESCRIPTION, PRODUCT_STATUS, LEGACY_PRODUCT_CODE) VALUES (?, ?, ?, ?, ?)");
    const insertFeature = db.prepare("INSERT INTO features (PRODUCT_ID, FEATURE_NAME, FEATURE_DESCRIPTION, FEATURE_STATUS, MODULE_NAME, LEGACY_FEATURE_CODE) VALUES (?, ?, ?, ?, ?, ?)");
    const insertScreen = db.prepare("INSERT INTO screens (PRODUCT_ID, SCREEN_NAME, SCREEN_CATEGORY, SCREEN_DESCRIPTION, LEGACY_SCREEN_CODE) VALUES (?, ?, ?, ?, ?)");
    const insertFeatureArea = db.prepare("INSERT OR IGNORE INTO feature_areas (FEATURE_AREA_NAME, PRODUCT_ID) VALUES (?, ?)");
    const insertFeatureRequest = db.prepare(`
      INSERT INTO feature_requests (PRODUCT_ID, CONVERTED_FEATURE_ID, TITLE, DESCRIPTION, WORKFLOW_CONTEXT, STATUS, CREATED_AT, LEGACY_REQUEST_CODE, APP_AREA, SCREEN_ID, SCREEN_NAME, ORIGIN)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVote = db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, ?, ?)");
    const insertFeedback = db.prepare("INSERT INTO feedback (PRODUCT_ID, FEATURE_ID, SCREEN_ID, FEEDBACK_TYPE, FEEDBACK_TEXT, ROLE, CREATED_AT, APP_AREA, SCREEN_NAME) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertKudos = db.prepare("INSERT INTO kudos (PRODUCT_ID, FEATURE_ID, SCREEN_ID, QUOTE_TEXT, ROLE, CONSENT_PUBLIC, CREATED_AT, APP_AREA, SCREEN_NAME) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

    const categoryIdByName = new Map();
    const subcategoryIdByKey = new Map();
    const productIdByLegacyCode = new Map();
    const featureIdByLegacyCode = new Map();
    const featureIdByName = new Map();
    const screenIdByLegacyCode = new Map();
    const screenByName = new Map();
    const featureRequestIdByLegacy = new Map();

    for (const row of productsRows) {
      const categoryName = String(row.category ?? "");
      const rawSubcategory = String(row.subcategory ?? "");
      const subcategoryName = SUBCATEGORY_NAME_OVERRIDES[rawSubcategory] ?? rawSubcategory;
      if (!categoryIdByName.has(categoryName)) {
        const description = CATEGORY_DESCRIPTIONS[categoryName] ?? `${categoryName} category`;
        const info = insertCategory.run(categoryName, description);
        categoryIdByName.set(categoryName, Number(info.lastInsertRowid));
      }
      const categoryId = categoryIdByName.get(categoryName);
      const subKey = `${categoryId}::${subcategoryName}`;
      if (!subcategoryIdByKey.has(subKey)) {
        const info = insertSubcategory.run(categoryId, subcategoryName, `${subcategoryName} subcategory`);
        subcategoryIdByKey.set(subKey, Number(info.lastInsertRowid));
      }
      const subcategoryId = subcategoryIdByKey.get(subKey);
      const legacyCode = String(row.id ?? "");
      const info = insertProduct.run(subcategoryId, String(row.name ?? ""), String(row.name ?? ""), "active", legacyCode);
      productIdByLegacyCode.set(legacyCode, Number(info.lastInsertRowid));
    }

    const defaultProductId = productIdByLegacyCode.get("PRD-005") ?? [...productIdByLegacyCode.values()][0];

    for (const row of productFeaturesRows) {
      const legacyCode = String(row.id ?? "");
      const productId = productIdByLegacyCode.get(String(row.product_id ?? "")) ?? defaultProductId;
      const categoryLabel = categoryById.get(String(row.feature_category_id ?? "")) ?? "Platform Services";
      insertFeatureArea.run(categoryLabel, productId);
      const name = String(row.name ?? "");
      const info = insertFeature.run(
        productId,
        name,
        String(row.description ?? `Capture feedback for ${name}.`),
        String(row.status ?? "planned"),
        categoryLabel,
        legacyCode,
      );
      const featureId = Number(info.lastInsertRowid);
      featureIdByLegacyCode.set(legacyCode, featureId);
      featureIdByName.set(name.toLowerCase(), featureId);
    }

    for (const row of screenLibrary) {
      const name = String(row.name ?? "");
      const legacyCode = String(row.id ?? "");
      const maybeFeatureId = featureIdByName.get(name.toLowerCase());
      const productId = maybeFeatureId
        ? db.prepare("SELECT PRODUCT_ID AS ProductID FROM features WHERE FEATURE_ID = ?").get(maybeFeatureId)?.ProductID ?? defaultProductId
        : defaultProductId;
      const info = insertScreen.run(
        productId,
        name,
        String(row.app ?? "platform-services"),
        String(row.description ?? ""),
        legacyCode,
      );
      const screenId = Number(info.lastInsertRowid);
      screenIdByLegacyCode.set(legacyCode, screenId);
      screenByName.set(name.toLowerCase(), { screenId, productId, screenName: name, app: String(row.app ?? "platform-services") });
    }

    for (const row of featureRequests) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const convertedFeatureId = row.convertedFeatureId ?? null;
      const appArea = row.app ?? (screen?.ScreenCategory ?? byName?.ScreenCategory ?? "servicing");
      const res = insertFeatureRequest.run(
        productId,
        convertedFeatureId,
        String(row.title ?? ""),
        String(row.description ?? row.title ?? ""),
        row.workflowContext == null ? null : String(row.workflowContext),
        String(row.status ?? "open"),
        String(row.createdAt ?? nowIso()),
        String(row.id ?? ""),
        String(appArea),
        screenId,
        String(row.screenName ?? screen?.ScreenName ?? byName?.ScreenName ?? ""),
        row.origin == null ? null : String(row.origin),
      );
      const requestId = Number(res.lastInsertRowid);
      featureRequestIdByLegacy.set(String(row.id ?? ""), requestId);
      const voteCount = Math.max(0, Number(row.votes ?? 1));
      for (let i = 0; i < voteCount; i += 1) {
        insertVote.run(requestId, `seed-${requestId}-${i + 1}`, 1, String(row.createdAt ?? nowIso()));
      }
    }

    for (const row of screenFeedback) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const feature = row.screenName ? resolveFeatureByName.get(String(row.screenName)) : null;
      const featureId = feature?.FeatureID ?? null;
      insertFeedback.run(
        productId,
        featureId,
        screenId,
        String(row.type ?? "issue"),
        row.text == null ? null : String(row.text),
        "unspecified",
        String(row.createdAt ?? nowIso()),
        String(row.app ?? screen?.ScreenCategory ?? byName?.ScreenCategory ?? "servicing"),
        String(row.screenName ?? screen?.ScreenName ?? byName?.ScreenName ?? ""),
      );
    }

    for (const row of kudosQuotes) {
      const screen = row.screenId ? resolveScreenByLegacyCode.get(String(row.screenId)) : null;
      const byName = !screen && row.screenName ? resolveScreenByName.get(String(row.screenName)) : null;
      const screenId = screen?.ScreenID ?? byName?.ScreenID ?? null;
      const productId = screen?.ProductID ?? byName?.ProductID ?? defaultProductId;
      const feature = row.screenName ? resolveFeatureByName.get(String(row.screenName)) : null;
      const featureId = feature?.FeatureID ?? null;
      insertKudos.run(
        productId,
        featureId,
        screenId,
        String(row.text ?? ""),
        String(row.role ?? "unspecified"),
        row.consentPublic ? 1 : 0,
        String(row.createdAt ?? nowIso()),
        String(row.app ?? screen?.ScreenCategory ?? byName?.ScreenCategory ?? "servicing"),
        String(row.screenName ?? screen?.ScreenName ?? byName?.ScreenName ?? ""),
      );
    }
  });

  tx();
};

export const reseedPostgres = async () => {
  const flat = toFlatBootstrap();
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`
        TRUNCATE TABLE
          feature_request_votes,
          feature_requests,
          feature_areas,
          feedback,
          kudos,
          screens,
          features,
          products,
          subcategories,
          categories
        RESTART IDENTITY CASCADE;
      `);

      const categoryIdByName = new Map();
      const subcategoryIdByKey = new Map();
      const productDbIdByLocalId = new Map();
      const featureDbIdByLocalId = new Map();
      const screenDbIdByLocalId = new Map();

      for (const row of flat.products) {
        const categoryName = String(row.category ?? "Lending");
        let categoryId = categoryIdByName.get(categoryName);
        if (!categoryId) {
          const categoryInsert = await client.query(
            "INSERT INTO categories (category_name, description) VALUES ($1, $2) RETURNING category_id",
            [categoryName, CATEGORY_DESCRIPTIONS[categoryName] ?? `${categoryName} category`],
          );
          categoryId = Number(categoryInsert.rows[0]?.category_id);
          categoryIdByName.set(categoryName, categoryId);
        }

        const rawSubcategory = String(row.subcategory ?? "Servicing");
        const subcategoryName = SUBCATEGORY_NAME_OVERRIDES[rawSubcategory] ?? rawSubcategory;
        const subKey = `${categoryId}::${subcategoryName}`;
        let subcategoryId = subcategoryIdByKey.get(subKey);
        if (!subcategoryId) {
          const subcategoryInsert = await client.query(
            "INSERT INTO subcategories (category_id, subcategory_name, description) VALUES ($1, $2, $3) RETURNING subcategory_id",
            [categoryId, subcategoryName, `${subcategoryName} subcategory`],
          );
          subcategoryId = Number(subcategoryInsert.rows[0]?.subcategory_id);
          subcategoryIdByKey.set(subKey, subcategoryId);
        }

        const productInsert = await client.query(
          `INSERT INTO products (subcategory_id, product_name, description, product_status, legacy_product_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING product_id`,
          [
            subcategoryId,
            String(row.name ?? ""),
            String(row.description ?? row.name ?? ""),
            String(row.status ?? "active"),
            String(row.legacyProductCode ?? ""),
          ],
        );
        productDbIdByLocalId.set(Number(row.id), Number(productInsert.rows[0]?.product_id));
      }

      for (const row of flat.features) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const featureInsert = await client.query(
          `INSERT INTO features (product_id, feature_name, feature_description, feature_status, module_name, legacy_feature_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING feature_id`,
          [
            productId,
            String(row.name ?? ""),
            String(row.description ?? ""),
            String(row.status ?? "planned"),
            String(row.moduleName ?? "Platform Services"),
            String(row.legacyFeatureCode ?? ""),
          ],
        );
        featureDbIdByLocalId.set(Number(row.id), Number(featureInsert.rows[0]?.feature_id));
        await client.query(
          "INSERT INTO feature_areas (feature_area_name, product_id) VALUES ($1, $2) ON CONFLICT (product_id, feature_area_name) DO NOTHING",
          [String(row.moduleName ?? "Platform Services"), productId],
        );
      }

      for (const row of flat.screens) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const screenInsert = await client.query(
          `INSERT INTO screens (product_id, screen_name, screen_category, screen_description, legacy_screen_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING screen_id`,
          [
            productId,
            String(row.name ?? ""),
            String(row.screenCategory ?? "servicing"),
            String(row.description ?? ""),
            String(row.legacyScreenCode ?? ""),
          ],
        );
        screenDbIdByLocalId.set(Number(row.id), Number(screenInsert.rows[0]?.screen_id));
      }

      for (const row of flat.featureRequests) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        const featureRequestInsert = await client.query(
          `INSERT INTO feature_requests
           (product_id, converted_feature_id, title, description, workflow_context, status, created_at, legacy_request_code, app_area, screen_id, screen_name, origin)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12)
           RETURNING feature_request_id`,
          [
            productId,
            row.convertedFeatureId == null ? null : featureDbIdByLocalId.get(Number(row.convertedFeatureId)) ?? null,
            String(row.title ?? ""),
            String(row.description ?? ""),
            row.workflowContext == null ? null : String(row.workflowContext),
            String(row.status ?? "open"),
            String(row.createdAt ?? nowIso()),
            String(row.legacyRequestCode ?? row.id ?? ""),
            String(row.app ?? "servicing"),
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            row.screenName == null ? null : String(row.screenName),
            row.origin == null ? null : String(row.origin),
          ],
        );
        const requestId = Number(featureRequestInsert.rows[0]?.feature_request_id);
        const voteCount = Math.max(0, Number(row.votes ?? 0));
        for (let i = 0; i < voteCount; i += 1) {
          await client.query(
            "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
            [requestId, `seed-${requestId}-${i + 1}`, String(row.createdAt ?? nowIso())],
          );
        }
      }

      for (const row of flat.screenFeedback) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        await client.query(
          `INSERT INTO feedback
           (product_id, feature_id, screen_id, feedback_type, feedback_text, role, created_at, app_area, screen_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)`,
          [
            productId,
            row.featureId == null ? null : featureDbIdByLocalId.get(Number(row.featureId)) ?? null,
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            String(row.type ?? "issue"),
            row.text == null ? null : String(row.text),
            String(row.role ?? "unspecified"),
            String(row.createdAt ?? nowIso()),
            String(row.app ?? "servicing"),
            row.screenName == null ? null : String(row.screenName),
          ],
        );
      }

      for (const row of flat.kudosQuotes) {
        const productId = productDbIdByLocalId.get(Number(row.productId));
        if (!productId) continue;
        await client.query(
          `INSERT INTO kudos
           (product_id, feature_id, screen_id, quote_text, role, consent_public, created_at, app_area, screen_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)`,
          [
            productId,
            row.featureId == null ? null : featureDbIdByLocalId.get(Number(row.featureId)) ?? null,
            row.screenId == null ? null : screenDbIdByLocalId.get(Number(row.screenId)) ?? null,
            String(row.text ?? ""),
            String(row.role ?? "unspecified"),
            Boolean(row.consentPublic),
            String(row.createdAt ?? nowIso()),
            String(row.app ?? "servicing"),
            row.screenName == null ? null : String(row.screenName),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
};

const appendFlatRuntimeFeatureRequest = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? body.legacyRequestCode ?? `fr-runtime-${Date.now()}`);
  const entry = {
    id,
    app: String(body.app ?? "servicing"),
    screenId: body.screenId ?? null,
    screenName: String(body.screenName ?? ""),
    title: String(body.title ?? ""),
    description: body.description == null ? undefined : String(body.description),
    workflowContext: body.workflowContext == null ? undefined : String(body.workflowContext),
    votes: Math.max(1, Number(body.votes ?? 1)),
    createdAt: String(body.createdAt ?? nowIso()),
    origin: String(body.origin ?? "kiosk"),
    role: normalizeRole(body.role),
  };
  runtime.featureRequests = Array.isArray(runtime.featureRequests) ? [entry, ...runtime.featureRequests] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const incrementFlatRuntimeVote = (id) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const key = String(id ?? "");
  if (!runtime.featureRequestVoteIncrements || typeof runtime.featureRequestVoteIncrements !== "object") {
    runtime.featureRequestVoteIncrements = {};
  }
  runtime.featureRequestVoteIncrements[key] = Math.max(0, Number(runtime.featureRequestVoteIncrements[key] ?? 0) + 1);
  writeRuntimeStore(runtimeStorePath, runtime);
};

const appendFlatRuntimeKudos = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? `kd-runtime-${Date.now()}`);
  const entry = {
    id,
    app: String(body.app ?? "servicing"),
    screenId: body.screenId ?? null,
    screenName: String(body.screenName ?? ""),
    text: String(body.text ?? ""),
    role: normalizeRole(body.role),
    consentPublic: Boolean(body.consentPublic),
    createdAt: String(body.createdAt ?? nowIso()),
  };
  runtime.kudos = Array.isArray(runtime.kudos) ? [entry, ...runtime.kudos] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const appendFlatRuntimeScreenFeedback = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const id = String(body.id ?? `sfb-runtime-${Date.now()}`);
  const entry = {
    id,
    app: String(body.app ?? "servicing"),
    screenId: body.screenId ?? null,
    screenName: String(body.screenName ?? ""),
    type: String(body.type ?? "issue"),
    text: body.text == null ? undefined : String(body.text),
    followUpQuestion: body.followUpQuestion == null ? undefined : String(body.followUpQuestion),
    followUpResponse: body.followUpResponse == null ? undefined : String(body.followUpResponse),
    role: normalizeRole(body.role),
    createdAt: String(body.createdAt ?? nowIso()),
  };
  runtime.screenFeedback = Array.isArray(runtime.screenFeedback) ? [entry, ...runtime.screenFeedback] : [entry];
  writeRuntimeStore(runtimeStorePath, runtime);
  return id;
};

const upsertFlatRuntimeCardSort = (body) => {
  const runtime = readRuntimeStore(runtimeStorePath);
  const conceptTitle = String(body.conceptTitle ?? "");
  if (!conceptTitle) return;
  const nextEntry = {
    conceptTitle,
    tier: body.tier ?? null,
    reaction: body.reaction ?? (body.tier === "high" ? "excited" : "useful"),
    sessionRole: normalizeRole(body.sessionRole ?? body.role),
    updatedAt: String(body.updatedAt ?? nowIso()),
  };
  const existing = Array.isArray(runtime.cardSortResults) ? runtime.cardSortResults : [];
  const filtered = existing.filter((entry) => String(entry.conceptTitle ?? "") !== conceptTitle);
  runtime.cardSortResults = [nextEntry, ...filtered];
  writeRuntimeStore(runtimeStorePath, runtime);
};

const loadSignalsForSynthesis = async () => {
  if (!useDbDataSource) {
    const flat = toFlatBootstrap();
    return toSynthesisSignals({
      featureRequests: flat.featureRequests,
      screenFeedback: flat.screenFeedback.map((item) => ({ ...item, appLabel: appLabelFromId(item.app) })),
      kudos: flat.kudosQuotes,
      cardSortResults: readRuntimeStore(runtimeStorePath).cardSortResults ?? [],
    });
  }

  if (usePostgresDb) {
    const signalRows = await withPostgresClient(async (client) => {
      const featureRequests = (
        await client.query(`
          SELECT fr.feature_request_id AS id, fr.title AS title, fr.workflow_context AS "workflowContext", fr.app_area AS app,
            fr.screen_name AS "screenName", fr.origin AS origin, COALESCE(SUM(frv.vote_value), 0) AS votes
          FROM feature_requests fr
          LEFT JOIN feature_request_votes frv ON frv.feature_request_id = fr.feature_request_id
          GROUP BY fr.feature_request_id
        `)
      ).rows;

      const screenFeedback = (
        await client.query(`
          SELECT feedback_id AS id, app_area AS app, screen_name AS "screenName", feedback_type AS type,
            feedback_text AS text, role AS role
          FROM feedback
        `)
      ).rows.map((row) => ({ ...row, appLabel: appLabelFromId(row.app) }));

      const kudos = (
        await client.query(`
          SELECT kudos_id AS id, quote_text AS text, role AS role, consent_public AS "consentPublic"
          FROM kudos
        `)
      ).rows;
      return { featureRequests, screenFeedback, kudos };
    });

    return toSynthesisSignals({
      featureRequests: signalRows.featureRequests,
      screenFeedback: signalRows.screenFeedback,
      kudos: signalRows.kudos,
      cardSortResults: [],
    });
  }

  const featureRequests = db.prepare(`
    SELECT fr.FEATURE_REQUEST_ID AS id, fr.TITLE AS title, fr.WORKFLOW_CONTEXT AS workflowContext, fr.APP_AREA AS app,
      fr.SCREEN_NAME AS screenName, fr.ORIGIN AS origin, COALESCE(SUM(frv.VOTE_VALUE), 0) AS votes
    FROM feature_requests fr
    LEFT JOIN feature_request_votes frv ON frv.FEATURE_REQUEST_ID = fr.FEATURE_REQUEST_ID
    GROUP BY fr.FEATURE_REQUEST_ID
  `).all();

  const screenFeedback = db.prepare(`
    SELECT FEEDBACK_ID AS id, APP_AREA AS app, SCREEN_NAME AS screenName, FEEDBACK_TYPE AS type,
      FEEDBACK_TEXT AS text, ROLE AS role
    FROM feedback
  `).all().map((row) => ({ ...row, appLabel: appLabelFromId(row.app) }));

  const kudos = db.prepare(`
    SELECT KUDOS_ID AS id, QUOTE_TEXT AS text, ROLE AS role, CONSENT_PUBLIC AS consentPublic
    FROM kudos
  `).all();

  return toSynthesisSignals({
    featureRequests,
    screenFeedback,
    kudos,
    cardSortResults: [],
  });
};

const sendSseEvent = (response, payload) => {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
};

export const handleApiRequest = async (request, response) => {
  try {
    const { method = "GET", url = "/" } = request;
    const parsed = new URL(url, `http://localhost:${port}`);
    const pathname = parsed.pathname;

    if (method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    if (method === "GET" && pathname === "/health") {
      sendJson(response, 200, { ok: true, dbPath, dbEngine, dataSourceMode, synthesisProvider: synthesisConfig.provider ?? null });
      return;
    }

    if (method === "GET" && pathname === "/api/bootstrap") {
      sendJson(response, 200, await bootstrapPayload());
      return;
    }

    if (method === "GET" && pathname === "/api/admin/tables") {
      sendJson(response, 200, { tables: await buildAdminTables() });
      return;
    }

    if (method === "POST" && pathname === "/api/admin/reseed") {
      const payload = await readBody(request);
      if (useDbDataSource) {
        if (usePostgresDb) {
          await reseedPostgres();
        } else {
          reseed(payload);
        }
      } else {
        resetRuntimeStore(runtimeStorePath);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/feature-requests") {
      const body = await readBody(request);
      let id;
      if (useDbDataSource) {
        if (usePostgresDb) {
          id = await withPostgresClient(async (client) => {
            const insertResult = await client.query(
              `
              INSERT INTO feature_requests (product_id, converted_feature_id, title, description, workflow_context, status, created_at, legacy_request_code, app_area, screen_id, screen_name, origin)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11, $12)
              RETURNING feature_request_id
              `,
              [
                Number(body.productId),
                body.convertedFeatureId == null ? null : Number(body.convertedFeatureId),
                String(body.title ?? ""),
                body.description == null ? null : String(body.description),
                body.workflowContext == null ? null : String(body.workflowContext),
                String(body.status ?? "open"),
                String(body.createdAt ?? nowIso()),
                body.legacyRequestCode == null ? null : String(body.legacyRequestCode),
                String(body.app ?? "servicing"),
                body.screenId == null ? null : Number(body.screenId),
                body.screenName == null ? null : String(body.screenName),
                body.origin == null ? null : String(body.origin),
              ],
            );
            const requestId = Number(insertResult.rows[0]?.feature_request_id);
            await client.query(
              "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
              [requestId, String(body.sessionId ?? "web"), String(body.createdAt ?? nowIso())],
            );
            return requestId;
          });
        } else {
          const result = db.prepare(`
          INSERT INTO feature_requests (PRODUCT_ID, CONVERTED_FEATURE_ID, TITLE, DESCRIPTION, WORKFLOW_CONTEXT, STATUS, CREATED_AT, LEGACY_REQUEST_CODE, APP_AREA, SCREEN_ID, SCREEN_NAME, ORIGIN)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(body.productId),
          body.convertedFeatureId == null ? null : Number(body.convertedFeatureId),
          String(body.title ?? ""),
          body.description == null ? null : String(body.description),
          body.workflowContext == null ? null : String(body.workflowContext),
          String(body.status ?? "open"),
          String(body.createdAt ?? nowIso()),
          body.legacyRequestCode == null ? null : String(body.legacyRequestCode),
          String(body.app ?? "servicing"),
          body.screenId == null ? null : Number(body.screenId),
          body.screenName == null ? null : String(body.screenName),
          body.origin == null ? null : String(body.origin),
        );
        id = Number(result.lastInsertRowid);
        db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, 1, ?)").run(
          id,
          String(body.sessionId ?? "web"),
          String(body.createdAt ?? nowIso()),
        );
        }
      } else {
        id = appendFlatRuntimeFeatureRequest(body);
      }
      sendJson(response, 200, { ok: true, id });
      return;
    }

    if (method === "POST" && pathname.startsWith("/api/feature-requests/") && pathname.endsWith("/upvote")) {
      const parts = pathname.split("/");
      const idParam = String(parts[3] ?? "");
      const body = await readBody(request);
      let votes = 0;
      if (useDbDataSource) {
        const id = Number(idParam);
        if (!Number.isFinite(id)) {
          sendJson(response, 400, { error: "Invalid feature request id" });
          return;
        }
        if (usePostgresDb) {
          votes = await withPostgresClient(async (client) => {
            const existsResult = await client.query(
              "SELECT 1 FROM feature_requests WHERE feature_request_id = $1 LIMIT 1",
              [id],
            );
            if (existsResult.rowCount === 0) {
              sendJson(response, 404, { error: `Feature request ${id} was not found` });
              return 0;
            }
            await client.query(
              "INSERT INTO feature_request_votes (feature_request_id, session_id, vote_value, created_at) VALUES ($1, $2, 1, $3::timestamptz)",
              [id, String(body.sessionId ?? `web-${Date.now()}`), nowIso()],
            );
            const votesResult = await client.query(
              "SELECT COALESCE(SUM(vote_value), 0)::int AS votes FROM feature_request_votes WHERE feature_request_id = $1",
              [id],
            );
            return Number(votesResult.rows[0]?.votes ?? 0);
          });
          if (response.writableEnded) return;
        } else {
          const requestExists = db.prepare("SELECT 1 FROM feature_requests WHERE FEATURE_REQUEST_ID = ? LIMIT 1").get(id);
          if (!requestExists) {
            sendJson(response, 404, { error: `Feature request ${id} was not found` });
            return;
          }
          db.prepare("INSERT INTO feature_request_votes (FEATURE_REQUEST_ID, SESSION_ID, VOTE_VALUE, CREATED_AT) VALUES (?, ?, 1, ?)").run(
            id,
            String(body.sessionId ?? `web-${Date.now()}`),
            nowIso(),
          );
          const votesRow = db.prepare(
            "SELECT COALESCE(SUM(VOTE_VALUE), 0) AS votes FROM feature_request_votes WHERE FEATURE_REQUEST_ID = ?",
          ).get(id);
          votes = Number(votesRow?.votes ?? 0);
        }
      } else {
        incrementFlatRuntimeVote(idParam);
        votes = getFlatFeatureRequestVoteCount(idParam);
      }
      sendJson(response, 200, { ok: true, votes });
      return;
    }

    if (method === "POST" && pathname === "/api/kudos") {
      const body = await readBody(request);
      if (useDbDataSource) {
        if (usePostgresDb) {
          const result = await withPostgresClient((client) =>
            client.query(
              `
              INSERT INTO kudos (product_id, feature_id, screen_id, quote_text, role, consent_public, created_at, app_area, screen_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)
              RETURNING kudos_id
              `,
              [
                Number(body.productId),
                body.featureId == null ? null : Number(body.featureId),
                body.screenId == null ? null : Number(body.screenId),
                String(body.text ?? ""),
                String(body.role ?? "unspecified"),
                Boolean(body.consentPublic),
                String(body.createdAt ?? nowIso()),
                String(body.app ?? "servicing"),
                body.screenName == null ? null : String(body.screenName),
              ],
            ),
          );
          sendJson(response, 200, { ok: true, id: Number(result.rows[0]?.kudos_id) });
        } else {
          const result = db.prepare(`
          INSERT INTO kudos (PRODUCT_ID, FEATURE_ID, SCREEN_ID, QUOTE_TEXT, ROLE, CONSENT_PUBLIC, CREATED_AT, APP_AREA, SCREEN_NAME)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(body.productId),
          body.featureId == null ? null : Number(body.featureId),
          body.screenId == null ? null : Number(body.screenId),
          String(body.text ?? ""),
          String(body.role ?? "unspecified"),
          body.consentPublic ? 1 : 0,
          String(body.createdAt ?? nowIso()),
          String(body.app ?? "servicing"),
          body.screenName == null ? null : String(body.screenName),
        );
        sendJson(response, 200, { ok: true, id: Number(result.lastInsertRowid) });
        }
      } else {
        sendJson(response, 200, { ok: true, id: appendFlatRuntimeKudos(body) });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/screen-feedback") {
      const body = await readBody(request);
      if (useDbDataSource) {
        if (usePostgresDb) {
          const result = await withPostgresClient((client) =>
            client.query(
              `
              INSERT INTO feedback (product_id, feature_id, screen_id, feedback_type, feedback_text, role, created_at, app_area, screen_name)
              VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9)
              RETURNING feedback_id
              `,
              [
                Number(body.productId),
                body.featureId == null ? null : Number(body.featureId),
                body.screenId == null ? null : Number(body.screenId),
                String(body.type ?? "issue"),
                body.text == null ? null : String(body.text),
                String(body.role ?? "unspecified"),
                String(body.createdAt ?? nowIso()),
                String(body.app ?? "servicing"),
                body.screenName == null ? null : String(body.screenName),
              ],
            ),
          );
          sendJson(response, 200, { ok: true, id: Number(result.rows[0]?.feedback_id) });
        } else {
          const result = db.prepare(`
          INSERT INTO feedback (PRODUCT_ID, FEATURE_ID, SCREEN_ID, FEEDBACK_TYPE, FEEDBACK_TEXT, ROLE, CREATED_AT, APP_AREA, SCREEN_NAME)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          Number(body.productId),
          body.featureId == null ? null : Number(body.featureId),
          body.screenId == null ? null : Number(body.screenId),
          String(body.type ?? "issue"),
          body.text == null ? null : String(body.text),
          String(body.role ?? "unspecified"),
          String(body.createdAt ?? nowIso()),
          String(body.app ?? "servicing"),
          body.screenName == null ? null : String(body.screenName),
        );
        sendJson(response, 200, { ok: true, id: Number(result.lastInsertRowid) });
        }
      } else {
        sendJson(response, 200, { ok: true, id: appendFlatRuntimeScreenFeedback(body) });
      }
      return;
    }

    if (method === "POST" && pathname === "/api/card-sort") {
      const body = await readBody(request);
      if (!useDbDataSource) {
        upsertFlatRuntimeCardSort(body);
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/synthesis/stream") {
      const body = await readBody(request);
      const signals = await loadSignalsForSynthesis();
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      response.write(": connected\n\n");
      try {
        await runSynthesis({
          requestBody: body,
          signals,
          config: synthesisConfig,
          log: (message) => console.log(message),
          sendEvent: (event) => sendSseEvent(response, event),
        });
      } catch (error) {
        const code = error?.code ?? "ERR-06";
        const message = error instanceof Error ? error.message : "Synthesis failed";
        sendSseEvent(response, { type: "error", code, message });
      } finally {
        response.end();
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendJson(response, 500, { error: message });
  }
};

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectExecution) {
  const server = http.createServer(handleApiRequest);
  server.listen(port, "127.0.0.1", () => {
    // eslint-disable-next-line no-console
    console.log(`[api] running on http://localhost:${port} · mode=${dataSourceMode} · dbEngine=${dbEngine} · db=${dbPath} · synthesisProvider=${synthesisConfig.provider ?? "none"}`);
  });
}
