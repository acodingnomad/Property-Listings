import 'dotenv/config';
import { loadConfig } from './config.js';
import { fetchForSearch, makeApifyClient } from './apify.js';
import { applyCriteria } from './filter.js';
import { buildSheetsClient, readExistingLinks, appendRows } from './sheets.js';

const dryRun = process.argv.includes('--dry-run');
const sourceFilter = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];
const tabFilter = process.argv.find((a) => a.startsWith('--tab='))?.split('=')[1];

async function runSearch(apify, sheets, search, sheetId, maxItems) {
  console.log(`\n=== ${search.tab} | ${search.locations.join(', ')} ===`);
  const raw = await fetchForSearch(apify, search, maxItems, sourceFilter);
  const matched = raw.filter((l) => applyCriteria(l, search));
  const existing = await readExistingLinks(sheets, sheetId, search.tab);
  const fresh = matched.filter((l) => !existing.has(l.url));

  console.log(
    `[${search.tab}] raw: ${raw.length} | matched: ${matched.length} | new: ${fresh.length}`,
  );

  if (dryRun) {
    for (const l of fresh.slice(0, 5)) {
      console.log(`  ${l.source} | $${l.price} | ${l.beds}bd/${l.baths}ba | ${l.address} | ${l.url}`);
    }
    if (fresh.length > 5) console.log(`  ... and ${fresh.length - 5} more`);
    return { tab: search.tab, appended: 0, found: fresh.length };
  }

  await appendRows(sheets, sheetId, search.tab, fresh);
  return { tab: search.tab, appended: fresh.length, found: fresh.length };
}

async function main() {
  const cfg = await loadConfig();
  if (dryRun) console.log('DRY RUN — no sheet writes');
  if (sourceFilter) console.log(`Source filter: ${sourceFilter}`);
  if (tabFilter) console.log(`Tab filter: ${tabFilter}`);

  const apify = makeApifyClient(cfg.apifyToken);
  const sheets = buildSheetsClient(cfg.googleSaKey);

  const searches = tabFilter ? cfg.searches.filter((s) => s.tab === tabFilter) : cfg.searches;
  if (searches.length === 0) throw new Error(`No searches matched tab filter "${tabFilter}"`);

  const summary = [];
  for (const search of searches) {
    summary.push(await runSearch(apify, sheets, search, cfg.sheetId, cfg.maxItemsPerSource));
  }

  console.log('\n=== Summary ===');
  for (const s of summary) {
    console.log(`  ${s.tab}: ${dryRun ? `${s.found} would-append` : `${s.appended} appended`}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
