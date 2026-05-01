import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, '..', 'config.json');

export async function loadConfig() {
  const required = ['APIFY_TOKEN', 'GOOGLE_SA_KEY', 'SHEET_ID'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`${key} is required`);
  }

  const raw = await readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.searches) || parsed.searches.length === 0) {
    throw new Error('config.json must define a non-empty "searches" array');
  }

  for (const s of parsed.searches) {
    if (!s.tab) throw new Error('each search needs a "tab" name');
    if (!Array.isArray(s.locations) || s.locations.length === 0) {
      throw new Error(`search "${s.tab}" needs a non-empty "locations" array`);
    }
    if (!Array.isArray(s.zillowSearchUrls) || s.zillowSearchUrls.length === 0) {
      throw new Error(
        `search "${s.tab}" needs a non-empty "zillowSearchUrls" array (paste full Zillow search URLs containing searchQueryState)`,
      );
    }
  }

  return {
    apifyToken: process.env.APIFY_TOKEN,
    googleSaKey: process.env.GOOGLE_SA_KEY,
    sheetId: process.env.SHEET_ID,
    searches: parsed.searches,
    maxItemsPerSource: parsed.maxItemsPerSource ?? 200,
  };
}
