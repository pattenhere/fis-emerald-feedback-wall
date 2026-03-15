export type DataSourceMode = "flat" | "db";

const parseDataSourceMode = (value: unknown): DataSourceMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "db" || normalized === "database" ? "db" : "flat";
};

export const runtimeConfig = {
  dataSource: parseDataSourceMode(import.meta.env.VITE_DATA_SOURCE),
};

export const useDbDataSource = runtimeConfig.dataSource === "db";

