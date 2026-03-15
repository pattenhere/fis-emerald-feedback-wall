import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePostgresPool, getPostgresPool } from "./client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
};

const envFromConfig = {
  ...parseDotenvFile(path.resolve(rootDir, ".env.config")),
  ...parseDotenvFile(path.resolve(rootDir, ".env.config.local")),
};
for (const [key, value] of Object.entries(envFromConfig)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const TABLES = [
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

try {
  const pool = await getPostgresPool();
  const client = await pool.connect();
  try {
    // eslint-disable-next-line no-console
    console.log("table_name,count");
    for (const table of TABLES) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      const count = Number(result.rows[0]?.count ?? 0);
      // eslint-disable-next-line no-console
      console.log(`${table},${count}`);
    }
  } finally {
    client.release();
    await closePostgresPool();
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("[postgres] verify failed", error);
  process.exit(1);
}
