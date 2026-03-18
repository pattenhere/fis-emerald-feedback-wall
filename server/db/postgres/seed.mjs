import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

if (!process.env.FEEDBACK_DB_ENGINE) {
  process.env.FEEDBACK_DB_ENGINE = "postgres";
}
if (!process.env.FEEDBACK_DATA_SOURCE) {
  process.env.FEEDBACK_DATA_SOURCE = "db";
}

const resolvePostgresUrl = () =>
  String(process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim();

if (!resolvePostgresUrl()) {
  // eslint-disable-next-line no-console
  console.error("[postgres] missing POSTGRES_URL / POSTGRES_URL_NON_POOLING; cannot seed");
  process.exit(1);
}

const { reseedPostgres } = await import("../../api.mjs");

try {
  await reseedPostgres();
  // eslint-disable-next-line no-console
  console.log("[postgres] seed complete");
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("[postgres] seed failed", error);
  process.exit(1);
}
