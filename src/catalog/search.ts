import { CATALOG, type CatalogEntry, getCatalogEntry as findCatalogEntry } from './entries.js';

export type { CatalogEntry };
export { CATALOG };

export function searchCatalog(query: string, limit = 10): CatalogEntry[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const scored = CATALOG.map((entry) => {
    const hay = `${entry.name} ${entry.summary} ${entry.path} ${entry.method}`.toLowerCase();
    const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { entry, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map((x) => x.entry);
}

export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return findCatalogEntry(name);
}
