import { ApifyClient } from 'apify-client';

const ZILLOW_ACTOR = 'maxcopell/zillow-scraper';
const TRULIA_ACTOR = 'igolaizola/trulia-scraper';

function buildTruliaUrl(location) {
  const cityState = location.match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (cityState) {
    const city = cityState[1].trim().replace(/\s+/g, '_');
    const state = cityState[2].toUpperCase();
    return `https://www.trulia.com/${state}/${city}/`;
  }
  if (/^\d{5}$/.test(location.trim())) {
    return `https://www.trulia.com/${location.trim()}/`;
  }
  return null;
}

function describeParking(item, home) {
  const garage = home.garageSpaces ?? item.garageSpaces;
  const features = home.parkingFeatures ?? item.parkingFeatures;
  if (typeof garage === 'number' && garage > 0) {
    return `${garage}-car garage`;
  }
  if (Array.isArray(features) && features.length > 0) {
    return features.join(', ');
  }
  if (typeof features === 'string' && features) {
    return features;
  }
  return '';
}

function normalizeZillow(item) {
  const home = item.hdpData?.homeInfo ?? {};
  const url = item.detailUrl
    ? (item.detailUrl.startsWith('http') ? item.detailUrl : `https://www.zillow.com${item.detailUrl}`)
    : home.zpid
      ? `https://www.zillow.com/homedetails/${home.zpid}_zpid/`
      : null;

  const lotSqft =
    home.lotAreaUnit === 'sqft' ? home.lotAreaValue
    : home.lotAreaUnit === 'acres' && home.lotAreaValue ? Math.round(home.lotAreaValue * 43560)
    : null;

  return {
    source: 'Zillow',
    url,
    address: item.addressStreet ?? home.streetAddress ?? item.address ?? null,
    city: item.addressCity ?? home.city ?? null,
    state: item.addressState ?? home.state ?? null,
    price: item.unformattedPrice ?? home.price ?? null,
    beds: item.beds ?? home.bedrooms ?? null,
    baths: item.baths ?? home.bathrooms ?? null,
    sqft: item.area ?? home.livingArea ?? null,
    lotSqft,
    parking: describeParking(item, home),
    description: item.description ?? home.description ?? '',
  };
}

function parseLot(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/([\d,.]+)\s*(sqft|sq ft|acres?)/i);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ''));
  return /acre/i.test(m[2]) ? Math.round(v * 43560) : Math.round(v);
}

function normalizeTrulia(item) {
  const url = item.url ?? (item.id ? `https://www.trulia.com/p/${item.id}` : null);
  const price = typeof item.price === 'string'
    ? Number(item.price.replace(/[^\d]/g, '')) || null
    : item.price ?? null;

  const lotSqft = parseLot(item.lotSize ?? item.lot_size);

  let parking = '';
  if (typeof item.parking === 'string') parking = item.parking;
  else if (typeof item.garageSpaces === 'number' && item.garageSpaces > 0) parking = `${item.garageSpaces}-car garage`;

  return {
    source: 'Trulia',
    url,
    address: item.address ?? item.streetAddress ?? null,
    city: item.city ?? null,
    state: item.state ?? null,
    price,
    beds: item.beds ?? item.bedrooms ?? null,
    baths: item.baths ?? item.bathrooms ?? null,
    sqft: item.sqft ?? item.livingArea ?? null,
    lotSqft,
    parking,
    description: item.description ?? '',
  };
}

async function runActor(client, actorId, input, label) {
  console.log(`[${label}] starting actor ${actorId}`);
  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`[${label}] returned ${items.length} raw items`);
  return items;
}

export async function fetchForSearch(client, search, maxItems, sourceFilter) {
  const tasks = [];

  if (!sourceFilter || sourceFilter === 'zillow') {
    const searchUrls = search.zillowSearchUrls.map((entry) =>
      typeof entry === 'string' ? { url: entry } : { url: entry.url },
    );
    tasks.push(
      runActor(
        client,
        ZILLOW_ACTOR,
        { searchUrls, maxItems, extractFromZpid: true },
        `${search.tab}/Zillow`,
      )
        .then((items) => items.map(normalizeZillow))
        .catch((err) => {
          console.error(`[${search.tab}/Zillow] failed: ${err.message}`);
          return [];
        }),
    );
  }

  if (!sourceFilter || sourceFilter === 'trulia') {
    const startUrls = search.locations
      .map(buildTruliaUrl)
      .filter(Boolean)
      .map((url) => ({ url }));

    if (startUrls.length === 0) {
      console.warn(`[${search.tab}/Trulia] no resolvable URLs — skipping`);
    } else {
      tasks.push(
        runActor(client, TRULIA_ACTOR, { startUrls, maxItems }, `${search.tab}/Trulia`)
          .then((items) => items.map(normalizeTrulia))
          .catch((err) => {
            if (/paid Actor|free trial has expired/i.test(err.message)) {
              console.log(`[${search.tab}/Trulia] skipped — actor requires paid rental on Apify`);
            } else {
              console.error(`[${search.tab}/Trulia] failed: ${err.message}`);
            }
            return [];
          }),
      );
    }
  }

  const results = await Promise.all(tasks);
  return results.flat().filter((l) => l.url);
}

export function makeApifyClient(token) {
  return new ApifyClient({ token });
}
