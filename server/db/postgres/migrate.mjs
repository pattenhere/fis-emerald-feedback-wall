import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePostgresPool, getPostgresPool } from "./client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const migrationsDir = path.resolve(__dirname, "migrations");

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

const envFromConfig = {
  ...parseDotenvFile(path.resolve(rootDir, ".env.config")),
  ...parseDotenvFile(path.resolve(rootDir, ".env.config.local")),
};
for (const [key, value] of Object.entries(envFromConfig)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const readSqlMigrations = () => {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  return files.map((filename) => ({
    filename,
    sql: fs.readFileSync(path.join(migrationsDir, filename), "utf8"),
  }));
};

const ensureMigrationsTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const getAppliedMigrationNames = async (client) => {
  const result = await client.query("SELECT filename FROM schema_migrations ORDER BY filename ASC");
  return new Set(result.rows.map((row) => String(row.filename)));
};

const runMigrations = async ({ statusOnly = false }) => {
  const pool = await getPostgresPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrationNames(client);
    const migrations = readSqlMigrations();

    if (statusOnly) {
      for (const migration of migrations) {
        const state = applied.has(migration.filename) ? "applied" : "pending";
        // eslint-disable-next-line no-console
        console.log(`${state.padEnd(8)} ${migration.filename}`);
      }
      return;
    }

    for (const migration of migrations) {
      if (applied.has(migration.filename)) continue;

      // eslint-disable-next-line no-console
      console.log(`[postgres] applying ${migration.filename}`);
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [migration.filename]);
      await client.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`[postgres] applied ${migration.filename}`);
    }

    // eslint-disable-next-line no-console
    console.log("[postgres] migrations complete");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
    await closePostgresPool();
  }
};

const statusOnly = process.argv.includes("--status");
runMigrations({ statusOnly }).catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[postgres] migration failed", error);
  process.exit(1);
});
