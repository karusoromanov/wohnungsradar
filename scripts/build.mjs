// Wohnungsradar Wien – fetch willhaben, merge state, render docs/index.html
// Runs on GitHub Actions (Node 20+). No dependencies.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_PATH = join(ROOT, "data", "state.json");
const TEMPLATE_PATH = join(ROOT, "scripts", "template.html");
const OUT_PATH = join(ROOT, "docs", "index.html");

const WINDOW_DAYS = 10;
const DEFAULT_SEARCH = {
  url: "https://www.willhaben.at/iad/immobilien/mietwohnungen/mietwohnung-angebote?areaId=900&areaId=117232&areaId=117226&areaId=117233&areaId=117227&NO_OF_ROOMS_BUCKET=2X2&sort=1&rows=200&ESTATE_SIZE%2FLIVING_AREA_FROM=40&PRICE_TO=1000",
  label: "2 Zimmer · ab 40 m² · bis € 1.000 · 1040 / 1050 / 1100 / 1110",
};

function fail(msg) {
  console.error("FEHLER: " + msg);
  process.exit(1);
}

// ---- load previous state ----
let OLD = { generatedAt: null, lastRunAt: null, windowDays: WINDOW_DAYS, search: DEFAULT_SEARCH, listings: [] };
if (existsSync(STATE_PATH)) {
  try {
    OLD = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch (e) {
    fail("data/state.json ist kein gültiges JSON: " + e.message);
  }
}
const SEARCH = OLD.search && OLD.search.url ? OLD.search : DEFAULT_SEARCH;

// ---- fetch willhaben ----
const res = await fetch(SEARCH.url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "de-AT,de;q=0.9",
  },
}).catch((e) => fail("Abruf fehlgeschlagen: " + e.message));

if (!res.ok) fail("willhaben antwortete mit HTTP " + res.status);
const html = await res.text();

const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!m) fail("__NEXT_DATA__ nicht gefunden (Bot-Sperre oder Seitenänderung?)");

let next;
try {
  next = JSON.parse(m[1]);
} catch (e) {
  fail("__NEXT_DATA__ JSON kaputt: " + e.message);
}

const ads =
  next?.props?.pageProps?.searchResult?.advertSummaryList?.advertSummary;
if (!Array.isArray(ads) || ads.length === 0) fail("Keine Inserate im Ergebnis.");

// ---- map ads -> listings ----
function mapAd(ad) {
  const attrs = ad?.attributes?.attribute || [];
  const g = (name) => {
    const a = attrs.find((x) => x.name === name);
    return a && a.values && a.values.length ? a.values[0] : null;
  };
  const seo = g("SEO_URL") || "";
  const plzMatch = seo.match(/wien-(\d{4})-/);
  const loc = g("LOCATION") || "";
  return {
    id: g("ADID") || String(ad.id || ""),
    title: g("HEADING") || "(ohne Titel)",
    price: g("PRICE_FOR_DISPLAY") || null,
    priceVal: g("PRICE") != null ? Math.round(Number(g("PRICE"))) : null,
    size: g("ESTATE_SIZE/LIVING_AREA") != null ? Number(g("ESTATE_SIZE/LIVING_AREA")) : null,
    bez: loc.replace("Wien, ", "").replace(". Bezirk,", ".").trim(),
    plz: plzMatch ? plzMatch[1] : null,
    privat: g("ISPRIVATE") === "1",
    published: g("PUBLISHED_String"),
    url: "https://www.willhaben.at/iad/" + seo,
  };
}

const fetched = ads.map(mapAd).filter((x) => x.id && x.published);
if (fetched.length === 0) fail("Nach dem Parsen 0 verwertbare Inserate.");

// ---- merge ----
const now = new Date().toISOString();
const nowMs = Date.now();
const cutoff = nowMs - WINDOW_DAYS * 864e5;

const oldById = new Map((OLD.listings || []).map((x) => [x.id, x]));

let listings = fetched.map((x) => {
  const prev = oldById.get(x.id);
  return { ...x, firstSeen: prev && prev.firstSeen ? prev.firstSeen : now };
});

listings = listings
  .filter((x) => Date.parse(x.firstSeen) >= cutoff)
  .sort(
    (a, b) =>
      Date.parse(b.firstSeen) - Date.parse(a.firstSeen) ||
      Date.parse(b.published) - Date.parse(a.published)
  );

const NEW = {
  generatedAt: now,
  lastRunAt: OLD.generatedAt || now,
  tz: "Europe/Vienna",
  windowDays: WINDOW_DAYS,
  search: SEARCH,
  listings,
};

const prevRunMs = Date.parse(NEW.lastRunAt);
const newCount = listings.filter((x) => Date.parse(x.firstSeen) >= prevRunMs).length;

// ---- write state + page ----
writeFileSync(STATE_PATH, JSON.stringify(NEW, null, 1) + "\n", "utf8");

const template = readFileSync(TEMPLATE_PATH, "utf8");
if (!template.includes("__WH_DATA__")) fail("template.html: Platzhalter __WH_DATA__ fehlt.");
const page = template.replace("__WH_DATA__", JSON.stringify(NEW));
writeFileSync(OUT_PATH, page, "utf8");

console.log(`OK – ${listings.length} Inserate im Fenster, davon ${newCount} neu seit letztem Lauf.`);
