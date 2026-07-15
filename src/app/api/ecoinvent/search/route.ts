import { NextResponse } from "next/server";

import type { EcoinventDatasetMatch } from "@/features/workbench/types";

const ECOQUERY_BASE_URL = "https://api.ecoquery.ecoinvent.org";
const ECOQUERY_VERSION = "3.12";
const ECOQUERY_SYSTEM_MODEL = "cutoff";
const PAGE_SIZE = 100;

type FacetItem = { name?: string; count?: number };
type EcoQueryDataset = { id?: string | number; uuid?: string; dataset_uuid?: string; datasetUuid?: string; geography?: string; url?: string };
type EcoQueryProduct = { name?: string; unit?: string; datasets?: EcoQueryDataset[] };
type EcoQueryActivity = { name?: string; activity_type?: string; sectors?: string[]; products?: EcoQueryProduct[] };
type EcoQuerySearchResponse = {
  activities?: EcoQueryActivity[];
  total_hits?: number;
  filters?: {
    sectors?: FacetItem[];
    sector?: FacetItem[];
    isic_sections?: FacetItem[];
    isic_classes?: FacetItem[];
    activity_types?: FacetItem[];
  };
};
type EcoQueryMetadataResponse = {
  activity_name?: string;
  reference_product?: string;
  unit?: string;
  sector?: string;
  has_access?: boolean;
  geography?: { short_name?: string; long_name?: string };
};
type EcoQueryDocumentationResponse = {
  activity_description?: {
    name?: string;
    general_comment?: string;
    product_information?: string;
    synonyms?: string[];
    included_activities_start?: string;
    included_activities_end?: string;
    geography?: { short_name?: string; long_name?: string };
  };
};

type ManualVariant = {
  datasetId: string;
  datasetUuid: string;
  datasetUrl: string;
  geography: string;
  exactName: string;
};

type ManualFamily = {
  familyKey: string;
  activityName: string;
  activityType: string;
  referenceProduct: string;
  unit: string;
  sectors: string[];
  variants: ManualVariant[];
};

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).map((item) => item.trim()).filter(Boolean) : [];
}

function extractUuid(value: unknown) {
  return asString(value).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0] ?? "";
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeGeography(value: string) {
  const normalized = value.trim();
  return normalized.match(/\(([A-Z0-9-]+)\)$/i)?.[1] ?? normalized;
}

function exactName(activityName: string, referenceProduct: string, geography: string) {
  return `${activityName}${geography ? ` {${normalizeGeography(geography)}}` : ""}${referenceProduct ? ` | ${referenceProduct}` : ""} | Cut-off, U`;
}

function retryableStatus(status: number) {
  return status === 429 || status === 408 || status >= 500;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    if (response.ok) return (await response.json()) as T;
    if (retryableStatus(response.status) && attempt < 2) {
      await response.arrayBuffer();
      await wait(750 * (2 ** attempt));
      continue;
    }
    throw new Error(`ecoQuery request failed with ${response.status}${response.status === 429 ? " after automatic retries" : ""}.`);
  }
  throw new Error("ecoQuery request failed after automatic retries.");
}

function facetValues(items: FacetItem[] | undefined) {
  return (items ?? [])
    .map((item) => ({ name: asString(item.name), count: Number(item.count ?? 0) }))
    .filter((item) => item.name)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function groupFamilies(response: EcoQuerySearchResponse) {
  const families = new Map<string, ManualFamily>();
  for (const activity of response.activities ?? []) {
    for (const product of activity.products ?? []) {
      const activityName = activity.name ?? "";
      const activityType = activity.activity_type ?? "";
      const referenceProduct = product.name ?? "";
      const unit = product.unit ?? "";
      const familyKey = [activityName, referenceProduct, unit, activityType].map(normalizeText).join("|");
      const family = families.get(familyKey) ?? {
        familyKey,
        activityName,
        activityType,
        referenceProduct,
        unit,
        sectors: activity.sectors ?? [],
        variants: [],
      };
      const knownIds = new Set(family.variants.map((variant) => variant.datasetId));
      for (const dataset of product.datasets ?? []) {
        const datasetId = asString(dataset.id);
        if (!datasetId || knownIds.has(datasetId)) continue;
        const geography = dataset.geography ?? "";
        family.variants.push({
          datasetId,
          datasetUuid: extractUuid(dataset.uuid) || extractUuid(dataset.dataset_uuid) || extractUuid(dataset.datasetUuid) || extractUuid(dataset.url),
          datasetUrl: dataset.url ?? "",
          geography,
          exactName: exactName(activityName, referenceProduct, geography),
        });
      }
      family.variants.sort((a, b) => a.geography.localeCompare(b.geography));
      families.set(familyKey, family);
    }
  }
  return [...families.values()];
}

async function selectDataset(datasetId: string, fallback: {
  query: string;
  activityName: string;
  activityType: string;
  referenceProduct: string;
  geography: string;
  unit: string;
  sector: string;
  datasetUuid: string;
  datasetUrl: string;
}): Promise<EcoinventDatasetMatch> {
  const params = new URLSearchParams({ dataset_id: datasetId, version: ECOQUERY_VERSION, system_model: ECOQUERY_SYSTEM_MODEL });
  const [metadataResult, documentationResult] = await Promise.allSettled([
    fetchJson<EcoQueryMetadataResponse>(`${ECOQUERY_BASE_URL}/spold?${params}`),
    fetchJson<EcoQueryDocumentationResponse>(`${ECOQUERY_BASE_URL}/spold/documentation?${params}`),
  ]);
  const metadata = metadataResult.status === "fulfilled" ? metadataResult.value : {};
  const documentation = documentationResult.status === "fulfilled" ? documentationResult.value.activity_description ?? {} : {};
  const activityName = metadata.activity_name || documentation.name || fallback.activityName;
  const referenceProduct = metadata.reference_product || fallback.referenceProduct;
  const geography = metadata.geography?.short_name || documentation.geography?.short_name || fallback.geography;
  return {
    datasetId,
    datasetUuid: fallback.datasetUuid,
    searchQuery: fallback.query,
    activityName,
    activityType: fallback.activityType,
    referenceProduct,
    geography: normalizeGeography(geography),
    unit: metadata.unit || fallback.unit,
    sector: metadata.sector || fallback.sector,
    exactName: exactName(activityName, referenceProduct, geography),
    datasetUrl: fallback.datasetUrl,
    hasAccess: Boolean(metadata.has_access),
    generalComment: documentation.general_comment ?? "",
    productInformation: documentation.product_information ?? "",
    includedActivitiesStart: documentation.included_activities_start ?? "",
    includedActivitiesEnd: documentation.included_activities_end ?? "",
    synonyms: documentation.synonyms ?? [],
    version: ECOQUERY_VERSION,
    systemModel: ECOQUERY_SYSTEM_MODEL,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = asString(body.action) || "search";
    if (action === "select") {
      const datasetId = asString(body.datasetId);
      if (!datasetId) return NextResponse.json({ error: "A dataset ID is required." }, { status: 400 });
      const match = await selectDataset(datasetId, {
        query: asString(body.query),
        activityName: asString(body.activityName),
        activityType: asString(body.activityType),
        referenceProduct: asString(body.referenceProduct),
        geography: asString(body.geography),
        unit: asString(body.unit),
        sector: asString(body.sector),
        datasetUuid: asString(body.datasetUuid),
        datasetUrl: asString(body.datasetUrl),
      });
      return NextResponse.json({ match });
    }

    const query = asString(body.query).trim();
    const from = Math.max(0, Number(body.from) || 0);
    const activityTypes = stringArray(body.activityTypes);
    if (!("activityTypes" in body) && body.marketOnly !== false && action !== "facets") activityTypes.push("MARKET_ACTIVITY");
    const sectors = stringArray(body.sectors);
    const isicSections = stringArray(body.isicSections);
    const isicClasses = stringArray(body.isicClasses);
    const response = await fetchJson<EcoQuerySearchResponse>(`${ECOQUERY_BASE_URL}/search/${ECOQUERY_VERSION}/${ECOQUERY_SYSTEM_MODEL}`, {
      method: "POST",
      body: JSON.stringify({
        from_: from,
        limit: PAGE_SIZE,
        query,
        filters: {
          geography: [],
          isic_section: isicSections,
          isic_class: isicClasses,
          activity_type: activityTypes,
          sector: sectors,
        },
        search_by: "activity",
      }),
    });
    const activitiesOnPage = response.activities?.length ?? 0;
    return NextResponse.json({
      families: action === "facets" ? [] : groupFamilies(response),
      totalHits: Number(response.total_hits ?? activitiesOnPage),
      nextFrom: activitiesOnPage ? from + activitiesOnPage : null,
      facets: {
        sectors: facetValues(response.filters?.sectors ?? response.filters?.sector),
        activityTypes: facetValues(response.filters?.activity_types),
        isicSections: facetValues(response.filters?.isic_sections),
        isicClasses: facetValues(response.filters?.isic_classes),
      },
      appliedFilters: { activityTypes, sectors, isicSections, isicClasses },
      version: ECOQUERY_VERSION,
      systemModel: ECOQUERY_SYSTEM_MODEL,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ecoQuery search failed." }, { status: 502 });
  }
}
