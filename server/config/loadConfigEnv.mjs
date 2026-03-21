import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

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

let loaded = false;

export const loadConfigEnv = () => {
  if (loaded) return;
  loaded = true;
  const isVercelRuntime = ["1", "true"].includes(String(process.env.VERCEL ?? "").toLowerCase());
  if (isVercelRuntime) return;
  const envFromConfig = {
    ...parseDotenvFile(path.resolve(rootDir, ".env.config")),
    ...parseDotenvFile(path.resolve(rootDir, ".env.config.local")),
  };
  for (const [key, value] of Object.entries(envFromConfig)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
};
