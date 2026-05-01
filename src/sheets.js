import { google } from 'googleapis';

const HEADER = [
  'Date',
  'Address',
  'City',
  'Price',
  '# Bedrooms',
  '# Bathrooms',
  'Sq Ft',
  'Lot Size',
  'Parking',
  'Link',
  'Description',
  'Notes',
  'Source',
];
const LAST_COL = 'M';
const LINK_COL = 'J';

export function buildSheetsClient(googleSaKey) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(googleSaKey),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureHeader(sheets, sheetId, tab) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A1:${LAST_COL}1`,
  });
  const row = res.data.values?.[0];
  const matches = row && row.length === HEADER.length && HEADER.every((h, i) => row[i] === h);
  if (matches) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${tab}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADER] },
  });
  console.log(`[${tab}] wrote header row`);
}

export async function readExistingLinks(sheets, sheetId, tab) {
  await ensureHeader(sheets, sheetId, tab);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!${LINK_COL}2:${LINK_COL}`,
  });
  const links = (res.data.values ?? []).flat().filter(Boolean);
  return new Set(links);
}

const cityField = (l) => {
  if (l.city && l.state) return `${l.city}, ${l.state}`;
  return l.city ?? l.state ?? '';
};

export async function appendRows(sheets, sheetId, tab, listings) {
  if (listings.length === 0) return;
  const today = new Date().toISOString().slice(0, 10);

  const rows = listings.map((l) => [
    today,
    l.address ?? '',
    cityField(l),
    l.price ?? '',
    l.beds ?? '',
    l.baths ?? '',
    l.sqft ?? '',
    l.lotSqft ?? '',
    l.parking ?? '',
    l.url,
    l.description ?? '',
    '',
    l.source,
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${tab}!A:${LAST_COL}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}
