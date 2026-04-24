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

export async function searchPubChem(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [] as PubChemMatch[];
  }

  const cidPayload = await fetchJson<{
    IdentifierList?: {
      CID?: number[];
    };
  }>(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeSegment(normalizedQuery)}/cids/JSON`);

  const cids = (cidPayload.IdentifierList?.CID ?? []).slice(0, 8);
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

  return propertyRecords.map((record, index) => {
    const synonyms = synonymResults[index] ?? [];
    const matchedCas = extractCasFromSynonyms(synonyms);

    return {
      cid: record.CID,
      query: normalizedQuery,
      queryType: "auto",
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
  });
}
