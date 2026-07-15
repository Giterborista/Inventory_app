import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ECOQUERY_BASE_URL = "https://api.ecoquery.ecoinvent.org";
const VERSION = "3.12";
const SYSTEM_MODEL = "cutoff";
const PAGE_SIZE = 100;
const CONCURRENCY = 1;
// Keep the fresh-run request rate below both documented responses seen in practice:
// 20/minute and 240/hour. Pagination requests count too.
const REQUEST_SPACING_MS = 4_200;
const CACHE_PATH = process.env.ECOQUERY_AUDIT_CACHE ?? "/tmp/ecoquery-market-audit-cache.json";

const corpus = {
  "Metals, minerals, and elements": [
    "steel", "low-alloy steel", "stainless steel", "galvanized steel", "aluminium",
    "copper", "zinc", "nickel", "titanium", "magnesium", "lead", "tin", "brass",
    "bronze", "cast iron", "chromium", "cobalt", "lithium", "graphite", "silicon", "silica",
  ],
  "Polymers and elastomers": [
    "plastic", "polymer", "polyethylene", "HDPE", "LDPE", "polypropylene", "PVC", "PET",
    "PETG", "polystyrene", "ABS", "polycarbonate", "polyurethane", "nylon", "polyamide",
    "PTFE", "PMMA", "epoxy resin", "silicone", "silicone rubber",
  ],
  "Industrial chemicals": [
    "sulfuric acid", "hydrochloric acid", "nitric acid", "phosphoric acid", "sodium hydroxide",
    "ammonia", "hydrogen peroxide", "ethanol", "methanol", "acetone", "benzene", "toluene",
    "ethylene glycol", "glycerol", "formaldehyde", "chlorine", "hydrogen", "oxygen", "nitrogen",
    "carbon dioxide",
  ],
  "Construction and natural materials": [
    "cement", "concrete", "reinforced concrete", "glass", "ceramic", "sand", "gravel", "gypsum",
    "limestone", "clay", "wood", "timber", "plywood", "particleboard", "cardboard", "paper",
    "cotton", "natural rubber", "carbon fibre", "glass fibre",
  ],
  "Energy, water, and bulk commodities": [
    "electricity", "heat", "steam", "diesel", "petrol", "gasoline", "natural gas", "biogas",
    "hydrogen fuel", "coal", "coke", "fuel oil", "compressed air", "tap water", "deionised water",
    "wastewater", "sodium chloride", "calcium carbonate", "urea", "phosphate",
  ],
  "Equipment and components": [
    "GPS device", "smartphone", "computer", "laptop", "server", "printed circuit board", "battery",
    "lithium-ion battery", "electric motor", "pump", "valve", "steel screw", "cable", "copper wire",
    "sensor", "solar panel", "photovoltaic module", "inverter", "transformer", "research buoy",
  ],
  "Manufactured and aggregated products": [
    "packaging", "plastic bottle", "PET bottle", "glass bottle", "cardboard box", "steel pipe",
    "aluminium sheet", "stainless steel sheet", "galvanized screw", "silicone sealant",
    "electronic device", "power supply", "LED", "display", "hard disk drive", "refrigerator",
    "washing machine", "air conditioner", "heat pump", "bicycle",
  ],
};

const cases = Object.entries(corpus).flatMap(([category, terms]) => terms.map((term) => ({ category, term })));

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPage(term, from) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${ECOQUERY_BASE_URL}/search/${VERSION}/${SYSTEM_MODEL}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from_: from,
        limit: PAGE_SIZE,
        query: term,
        filters: {
          geography: [],
          isic_section: [],
          isic_class: [],
          activity_type: ["MARKET_ACTIVITY"],
          sector: [],
        },
        search_by: "activity",
      }),
    });
    if (response.ok) {
      const result = await response.json();
      await wait(REQUEST_SPACING_MS);
      return result;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await response.arrayBuffer();
      await wait(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(Math.max(retryAfter * 1000, 2_500), 60_000)
        : Math.min(2_500 * (2 ** attempt), 60_000));
      continue;
    }
    throw new Error(`ecoQuery returned ${response.status}`);
  }
  throw new Error("ecoQuery retry limit reached");
}

function familyKey(activity, product) {
  return [activity.name, product.name, product.unit, activity.activity_type]
    .map((value) => String(value ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

async function auditTerm(testCase) {
  const families = new Set();
  const isicClasses = new Set();
  let rawDatasetVariants = 0;
  let totalHits = 0;
  let from = 0;
  let pages = 0;

  while (true) {
    const response = await fetchPage(testCase.term, from);
    const activities = response.activities ?? [];
    totalHits = Number(response.total_hits ?? totalHits);
    pages += 1;
    for (const item of response.filters?.isic_classes ?? []) isicClasses.add(item.name);
    for (const activity of activities) {
      for (const product of activity.products ?? []) {
        const datasets = product.datasets ?? [];
        rawDatasetVariants += datasets.length;
        if (datasets.length) families.add(familyKey(activity, product));
      }
    }
    from += activities.length;
    if (!activities.length || activities.length < PAGE_SIZE || from >= totalHits) break;
  }

  return {
    ...testCase,
    totalHits,
    distinctCandidateFamilies: families.size,
    rawDatasetVariants,
    liveIsicClasses: isicClasses.size,
    pages,
  };
}

async function mapWithConcurrency(items, concurrency, transform) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await transform(items[index]);
      } catch (error) {
        results[index] = { ...items[index], error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function nearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

function distribution(rows) {
  const values = rows.map((row) => row.distinctCandidateFamilies);
  const nonZero = values.filter((value) => value > 0);
  const frequencies = new Map();
  for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  const modes = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
    .map(([candidateCount, frequency]) => ({ candidateCount, frequency }));
  const thresholds = [10, 20, 30, 40, 50, 60, 80, 100, 150];
  return {
    sampleSize: values.length,
    zeroResultTerms: values.filter((value) => value === 0).length,
    modeCandidates: modes,
    median: nearestRank(values, 0.5),
    medianNonZero: nearestRank(nonZero, 0.5),
    p75: nearestRank(values, 0.75),
    p90: nearestRank(values, 0.9),
    p95: nearestRank(values, 0.95),
    maximum: values.length ? Math.max(...values) : null,
    coverage: Object.fromEntries(thresholds.map((threshold) => [threshold, {
      count: values.filter((value) => value <= threshold).length,
      percent: Number((100 * values.filter((value) => value <= threshold).length / values.length).toFixed(1)),
    }])),
  };
}

let cachedRows = [];
if (existsSync(CACHE_PATH)) {
  try {
    cachedRows = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    cachedRows = [];
  }
}
const cachedByCase = new Map(cachedRows.map((row) => [`${row.category}\u0000${row.term}`, row]));
const results = [];
for (const [index, testCase] of cases.entries()) {
  const key = `${testCase.category}\u0000${testCase.term}`;
  let result = cachedByCase.get(key);
  if (!result || result.error) {
    try {
      result = await auditTerm(testCase);
    } catch (error) {
      result = { ...testCase, error: error instanceof Error ? error.message : String(error) };
    }
    cachedByCase.set(key, result);
    writeFileSync(CACHE_PATH, JSON.stringify([...cachedByCase.values()], null, 2));
  }
  results.push(result);
  console.error(`[${index + 1}/${cases.length}] ${testCase.term}: ${result.error ?? `${result.distinctCandidateFamilies} candidates`}`);
}
const successful = results.filter((row) => !row.error);
const byCategory = Object.fromEntries(Object.keys(corpus).map((category) => [
  category,
  distribution(successful.filter((row) => row.category === category)),
]));
const outliers = [...successful]
  .sort((a, b) => b.distinctCandidateFamilies - a.distinctCandidateFamilies || a.term.localeCompare(b.term))
  .slice(0, 30);

console.log(JSON.stringify({
  methodology: {
    queriedAt: new Date().toISOString(),
    ecoQueryVersion: VERSION,
    systemModel: SYSTEM_MODEL,
    activityType: "MARKET_ACTIVITY",
    isicFilter: "none",
    geographyAggregationKey: "activity name + reference product + unit + activity type",
    queryPolicy: "one literal researcher term per test; no AI synonyms",
    corpusSize: cases.length,
    categories: Object.fromEntries(Object.entries(corpus).map(([category, terms]) => [category, terms.length])),
  },
  overall: distribution(successful),
  byCategory,
  outliers,
  results,
}, null, 2));
