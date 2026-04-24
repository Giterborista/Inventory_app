import { nowIso, sanitizeStringList } from "@/features/workbench/state-utils";
import type { PubChemMatch } from "@/features/workbench/types";

type PubChemPropertyRecord = {
  CID: number;
  Title?: string;
  IUPACName?: string;
  MolecularFormula?: string;
  MolecularWeight?: string | number;
  CanonicalSMILES?: string;
  InChI?: string;
  InChIKey?: string;
};

type CandidateSource = {
  strategy: string;
  term: string;
};

function encodeSegment(value: string) {
  return encodeURIComponent(value.trim());
}

function extractCasFromSynonyms(synonyms: string[]) {
  const casPattern = /^\d{2,7}-\d{2}-\d$/;
  return synonyms.find((item) => casPattern.test(item.trim()))?.trim() ?? "";
}

function normalizeSynonym(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[()_,./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string) {
  return normalizeSynonym(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildNgrams(value: string, size = 3) {
  if (value.length <= size) {
    return new Set(value ? [value] : []);
  }

  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function diceCoefficient(left: string, right: string) {
  const leftNgrams = buildNgrams(left);
  const rightNgrams = buildNgrams(right);
  if (leftNgrams.size === 0 || rightNgrams.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const item of leftNgrams) {
    if (rightNgrams.has(item)) {
      overlap += 1;
    }
  }

  return (2 * overlap) / (leftNgrams.size + rightNgrams.size);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function buildQueryVariants(query: string) {
  const trimmed = query.trim();
  const normalized = normalizeSynonym(trimmed);
  const compact = normalizeCompact(trimmed);
  const dehyphenated = trimmed.replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();

  return uniqueStrings([trimmed, normalized, dehyphenated, compact].filter((value) => value.length >= 3));
}

export function getCuratedPubChemSynonyms(match: Pick<PubChemMatch, "synonyms" | "matchedCas" | "title" | "iupacName">, limit = 12) {
  const excluded = new Set(
    [match.matchedCas, match.title, match.iupacName]
      .filter(Boolean)
      .map((item) => normalizeSynonym(item)),
  );
  const seen = new Set<string>();
  const results: string[] = [];

  for (const synonym of sanitizeStringList(match.synonyms)) {
    const trimmed = synonym.trim();
    if (!trimmed) {
      continue;
    }
    const normalized = normalizeSynonym(trimmed);
    if (!normalized || excluded.has(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(trimmed);

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

export function getCuratedPubChemSynonymText(
  match: Pick<PubChemMatch, "synonyms" | "matchedCas" | "title" | "iupacName">,
  limit = 12,
) {
  return getCuratedPubChemSynonyms(match, limit).join(", ");
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`PubChem request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchSynonymsForCid(cid: number) {
  try {
    const payload = await fetchJson<{
      InformationList?: {
        Information?: Array<{
          Synonym?: string[];
        }>;
      };
    }>(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/synonyms/JSON`);

    return payload.InformationList?.Information?.[0]?.Synonym ?? [];
  } catch {
    return [];
  }
}

async function fetchCidsFromName(term: string) {
  try {
    const payload = await fetchJson<{
      IdentifierList?: {
        CID?: number[];
      };
    }>(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeSegment(term)}/cids/JSON`);

    return payload.IdentifierList?.CID ?? [];
  } catch {
    return [];
  }
}

async function fetchAutocompleteTerms(term: string) {
  try {
    const payload = await fetchJson<{
      dictionary_terms?: {
        compound?: string[];
      };
    }>(`https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeSegment(term)}/json?limit=8`);

    return payload.dictionary_terms?.compound ?? [];
  } catch {
    return [];
  }
}

async function fetchCidsFromEutils(term: string) {
  try {
    const payload = await fetchJson<{
      esearchresult?: {
        idlist?: string[];
      };
    }>(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pccompound&term=${encodeURIComponent(
        `"${term}"[All Fields]`,
      )}&retmax=8&retmode=json`,
    );

    return (payload.esearchresult?.idlist ?? [])
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
}

function scoreCandidate(
  query: string,
  title: string,
  iupacName: string,
  synonyms: string[],
  sources: CandidateSource[],
) {
  const queryNormalized = normalizeSynonym(query);
  const queryCompact = normalizeCompact(query);
  const queryTokens = tokenize(query);
  const searchableTexts = [title, iupacName, ...synonyms].filter(Boolean);
  const normalizedTexts = searchableTexts.map((value) => normalizeSynonym(value));
  const compactTexts = searchableTexts.map((value) => normalizeCompact(value));

  let score = 0;
  const reasons = new Set<string>();

  if (normalizedTexts.some((value) => value === queryNormalized)) {
    score += 120;
    reasons.add("exact name");
  }

  if (compactTexts.some((value) => value === queryCompact)) {
    score += 90;
    reasons.add("exact compact match");
  }

  if (normalizedTexts.some((value) => value.includes(queryNormalized) || queryNormalized.includes(value))) {
    score += 35;
    reasons.add("close wording");
  }

  const bestTokenOverlap = normalizedTexts.reduce((best, candidate) => {
    const candidateTokens = tokenize(candidate);
    if (candidateTokens.length === 0 || queryTokens.length === 0) {
      return best;
    }

    const overlap = queryTokens.filter((token) => candidateTokens.includes(token)).length;
    return Math.max(best, overlap / Math.max(candidateTokens.length, queryTokens.length));
  }, 0);

  if (bestTokenOverlap > 0) {
    score += Math.round(bestTokenOverlap * 55);
    if (bestTokenOverlap >= 0.5) {
      reasons.add("token overlap");
    }
  }

  const bestDice = compactTexts.reduce((best, candidate) => Math.max(best, diceCoefficient(queryCompact, candidate)), 0);
  if (bestDice > 0) {
    score += Math.round(bestDice * 80);
    if (bestDice >= 0.45) {
      reasons.add("similar structure");
    }
  }

  for (const source of sources) {
    if (source.strategy === "direct") {
      score += 20;
    } else if (source.strategy === "all-fields") {
      score += 12;
    } else if (source.strategy === "autocomplete") {
      score += 8;
    }
  }

  if (reasons.size === 0 && sources.length > 0) {
    reasons.add(sources[0].strategy);
  }

  return {
    score,
    matchedBy: uniqueStrings([...reasons, ...sources.map((source) => source.strategy)]),
    matchedTerm: sources[0]?.term ?? query,
  };
}

export async function searchPubChem(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [] as PubChemMatch[];
  }

  const queryVariants = buildQueryVariants(normalizedQuery).slice(0, 4);
  const candidateSources = new Map<number, CandidateSource[]>();

  const addCandidateSources = (cids: number[], source: CandidateSource) => {
    for (const cid of cids) {
      candidateSources.set(cid, [...(candidateSources.get(cid) ?? []), source]);
    }
  };

  for (const variant of queryVariants) {
    addCandidateSources(await fetchCidsFromName(variant), { strategy: "direct", term: variant });
    addCandidateSources(await fetchCidsFromEutils(variant), { strategy: "all-fields", term: variant });
  }

  const autocompleteTerms = uniqueStrings(
    (
      await Promise.all(queryVariants.slice(0, 2).map((variant) => fetchAutocompleteTerms(variant)))
    )
      .flat()
      .slice(0, 10),
  );

  for (const term of autocompleteTerms.slice(0, 6)) {
    addCandidateSources(await fetchCidsFromName(term), { strategy: "autocomplete", term });
  }

  const cids = [...candidateSources.keys()].slice(0, 16);
  if (cids.length === 0) {
    return [];
  }

  const propertyPayload = await fetchJson<{
    PropertyTable?: {
      Properties?: PubChemPropertyRecord[];
    };
  }>(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cids.join(",")}/property/Title,IUPACName,MolecularFormula,MolecularWeight,CanonicalSMILES,InChI,InChIKey/JSON`,
  );

  const propertyRecords = propertyPayload.PropertyTable?.Properties ?? [];
  const synonymResults = await Promise.all(propertyRecords.map((record) => fetchSynonymsForCid(record.CID)));

  return propertyRecords
    .map((record, index) => {
      const synonyms = synonymResults[index] ?? [];
      const matchedCas = extractCasFromSynonyms(synonyms);
      const ranking = scoreCandidate(
        normalizedQuery,
        record.Title ?? "",
        record.IUPACName ?? "",
        synonyms,
        candidateSources.get(record.CID) ?? [],
      );

      return {
        cid: record.CID,
        query: normalizedQuery,
        queryType: "auto",
        matchedTerm: ranking.matchedTerm,
        matchedBy: ranking.matchedBy,
        searchScore: ranking.score,
        title: record.Title ?? "",
        iupacName: record.IUPACName ?? "",
        molecularFormula: record.MolecularFormula ?? "",
        molecularWeight: String(record.MolecularWeight ?? ""),
        canonicalSmiles: record.CanonicalSMILES ?? "",
        inchi: record.InChI ?? "",
        inchikey: record.InChIKey ?? "",
        synonyms,
        matchedCas,
        matchedAt: nowIso(),
        pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${record.CID}`,
      } satisfies PubChemMatch;
    })
    .sort((left, right) => right.searchScore - left.searchScore)
    .slice(0, 12);
}
