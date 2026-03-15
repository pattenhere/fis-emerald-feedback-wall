let poolSingleton = null;

const resolvePostgresUrl = () => {
  const value =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    "";
  return String(value).trim();
};

export const isPostgresConfigured = () => resolvePostgresUrl().length > 0;

export const getPostgresPool = async () => {
  if (poolSingleton) return poolSingleton;

  const connectionString = resolvePostgresUrl();
  if (!connectionString) {
    throw new Error(
      "Postgres connection is not configured. Set POSTGRES_URL (or POSTGRES_URL_NON_POOLING) in environment.",
    );
  }

  let createPool;
  try {
    ({ Pool: createPool } = await import("pg"));
  } catch {
    throw new Error(
      "Missing dependency: pg. Run `npm install pg` before using Postgres scaffolding.",
    );
  }

  poolSingleton = new createPool({
    connectionString,
    max: Number(process.env.POSTGRES_MAX_CLIENTS ?? 5),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS ?? 10_000),
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECTION_TIMEOUT_MS ?? 10_000),
    ssl:
      String(process.env.POSTGRES_SSL ?? "true").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return poolSingleton;
};

export const closePostgresPool = async () => {
  if (!poolSingleton) return;
  await poolSingleton.end();
  poolSingleton = null;
};
