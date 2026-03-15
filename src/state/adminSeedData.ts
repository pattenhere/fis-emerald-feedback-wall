type SeedRow = Record<string, unknown>;
import { buildCoreAdminTables, loadFlatAdminTablesFromSeeds } from "./seeds/seedLoader";

export interface SeedTableDefinition {
  id: string;
  label: string;
  columns?: string[];
  rows: SeedRow[];
}

export const ADMIN_SEED_TABLES: SeedTableDefinition[] = buildCoreAdminTables();

export const loadFlatAdminTables = async (): Promise<SeedTableDefinition[]> => {
  const tables = await loadFlatAdminTablesFromSeeds();
  return tables.map((table) => ({
    id: table.id,
    label: table.label,
    rows: table.rows,
  }));
};
