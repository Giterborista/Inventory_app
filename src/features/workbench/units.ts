const SIMPLE_UNIT_ALIASES: Record<string, string> = {
  "item(s)": "item",
  items: "item",
  unit: "item",
  units: "item",
  kilogram: "kg",
  kilograms: "kg",
  gram: "g",
  grams: "g",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  "m^3": "m3",
  "m³": "m3",
};

const DISTANCE_WORDS = new Set(["km", "kilometer", "kilometers", "kilometre", "kilometres"]);
const TONNE_WORDS = new Set(["t", "ton", "tons", "tonne", "tonnes"]);
const PERSON_WORDS = new Set(["p", "pax", "person", "persons", "passenger", "passengers"]);
const VEHICLE_WORDS = new Set(["v", "veh", "vehicle", "vehicles"]);

function normalizeUnitSyntax(unit: string) {
  return unit
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[×·∙⋅]/g, "*")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*\*\s*/g, "*")
    .replace(/\s*-\s*/g, "-");
}

function transportUnitAlias(unit: string) {
  if (unit === "tkm" || unit === "pkm" || unit === "vkm") {
    return unit;
  }

  const words = unit.replace(/[.*-]/g, " ").split(/\s+/).filter(Boolean);
  const distance = words.at(-1) ?? "";
  if (!DISTANCE_WORDS.has(distance)) {
    return null;
  }

  const basis = words.slice(0, -1);
  if (basis.length === 1 && TONNE_WORDS.has(basis[0])) {
    return "tkm";
  }
  if (basis.length === 2 && basis[0] === "metric" && TONNE_WORDS.has(basis[1])) {
    return "tkm";
  }
  if (basis.length === 1 && PERSON_WORDS.has(basis[0])) {
    return "pkm";
  }
  if (basis.length === 1 && VEHICLE_WORDS.has(basis[0])) {
    return "vkm";
  }

  return null;
}

export function normalizeUnitForComparison(unit: string) {
  const normalized = normalizeUnitSyntax(unit);
  return transportUnitAlias(normalized) ?? SIMPLE_UNIT_ALIASES[normalized] ?? normalized;
}

export function areUnitsEquivalent(left: string, right: string) {
  const normalizedLeft = normalizeUnitForComparison(left);
  const normalizedRight = normalizeUnitForComparison(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function convergeToEcoinventUnit(userUnit: string, ecoinventUnit: string) {
  const canonicalUnit = ecoinventUnit.trim();
  if (!canonicalUnit) return userUnit;
  if (!userUnit.trim() || areUnitsEquivalent(userUnit, canonicalUnit)) return canonicalUnit;
  return userUnit;
}

export function unitMismatchMessage(userUnit: string, ecoinventUnit: string) {
  return `Unit mismatch: user "${userUnit}", ecoinvent "${ecoinventUnit}"`;
}
