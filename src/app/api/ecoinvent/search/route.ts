import { NextResponse } from "next/server";

import type { EcoinventDatasetMatch } from "@/features/workbench/types";

const ECOQUERY_BASE_URL = "https://api.ecoquery.ecoinvent.org";
const ECOQUERY_VERSION = "3.12";
const ECOQUERY_SYSTEM_MODEL = "cutoff";

type EcoQueryDataset = {
  id?: string | number;
  uuid?: string;
  dataset_uuid?: string;
  datasetUuid?: string;
  geography?: string;
  url?: string;
};

type EcoQueryProduct = {
  name?: string;
  unit?: string;
  datasets?: EcoQueryDataset[];
};

type EcoQueryActivity = {
  name?: string;
  activity_type?: string;
  sectors?: string[];
  products?: EcoQueryProduct[];
};

type EcoQuerySearchResponse = {
  activities?: EcoQueryActivity[];
};

type EcoQueryMetadataResponse = {
  activity_name?: string;
  reference_product?: string;
  unit?: string;
  sector?: string;
  has_access?: boolean;
  geography?: {
    short_name?: string;
    long_name?: string;
  };
};

type EcoQueryDocumentationResponse = {
  activity_description?: {
    name?: string;
    general_comment?: string;
    product_information?: string;
    synonyms?: string[];
    included_activities_start?: string;
    included_activities_end?: string;
    geography?: {
      short_name?: string;
      long_name?: string;
    };
  };
};

type SearchCandidate = {
  datasetId: string;
  datasetUuid: string;
  datasetUrl: string;
  activityName: string;
  activityType: string;
  referenceProduct: string;
  geography: string;
  unit: string;
  sector: string;
};

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function extractUuid(value: unknown) {
  const text = asString(value);
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match?.[0] ?? "";
}

function extractDatasetUuid(dataset: EcoQueryDataset) {
  return (
    extractUuid(dataset.uuid) ||
    extractUuid(dataset.dataset_uuid) ||
    extractUuid(dataset.datasetUuid) ||
    extractUuid(dataset.url)
  );
}

function normalizeGeographyLabel(value: string) {
  const normalized = value.trim();
  const codeMatch = normalized.match(/\(([A-Z0-9-]+)\)$/);
  return codeMatch?.[1] ?? normalized;
}

function buildExactName(metadata: EcoQueryMetadataResponse, fallback: SearchCandidate) {
  const activityName = asString(metadata.activity_name) || fallback.activityName;
  const referenceProduct = asString(metadata.reference_product) || fallback.referenceProduct;
  const geography = normalizeGeographyLabel(metadata.geography?.short_name || fallback.geography);
  const systemModelLabel = ECOQUERY_SYSTEM_MODEL === "cutoff" ? "Cut-off, U" : ECOQUERY_SYSTEM_MODEL;

  return [activityName, geography ? `{${geography}}` : "", referenceProduct ? `| ${referenceProduct}` : "", `| ${systemModelLabel}`]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+\|/g, " |");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`ecoQuery request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function enrichCandidate(candidate: SearchCandidate, searchQuery: string): Promise<EcoinventDatasetMatch> {
  const searchParams = new URLSearchParams({
    dataset_id: candidate.datasetId,
    version: ECOQUERY_VERSION,
    system_model: ECOQUERY_SYSTEM_MODEL,
  });

  const [metadataResult, documentationResult] = await Promise.allSettled([
    fetchJson<EcoQueryMetadataResponse>(`${ECOQUERY_BASE_URL}/spold?${searchParams.toString()}`),
    fetchJson<EcoQueryDocumentationResponse>(`${ECOQUERY_BASE_URL}/spold/documentation?${searchParams.toString()}`),
  ]);

  const metadata = metadataResult.status === "fulfilled" ? metadataResult.value : {};
  const documentation = documentationResult.status === "fulfilled" ? documentationResult.value : {};
  const activityDescription = documentation.activity_description ?? {};
  const geography = normalizeGeographyLabel(
    metadata.geography?.short_name ||
    activityDescription.geography?.short_name ||
    candidate.geography,
  );

  return {
    datasetId: candidate.datasetId,
    datasetUuid: candidate.datasetUuid,
    searchQuery,
    activityName: asString(metadata.activity_name) || asString(activityDescription.name) || candidate.activityName,
    activityType: candidate.activityType,
    referenceProduct: asString(metadata.reference_product) || candidate.referenceProduct,
    geography,
    unit: asString(metadata.unit) || candidate.unit,
    sector: asString(metadata.sector) || candidate.sector,
    exactName: buildExactName(metadata, candidate),
    datasetUrl: candidate.datasetUrl,
    hasAccess: Boolean(metadata.has_access),
    generalComment: asString(activityDescription.general_comment),
    productInformation: asString(activityDescription.product_information),
    includedActivitiesStart: asString(activityDescription.included_activities_start),
    includedActivitiesEnd: asString(activityDescription.included_activities_end),
    synonyms: Array.isArray(activityDescription.synonyms) ? activityDescription.synonyms.filter((item) => typeof item === "string") : [],
    version: ECOQUERY_VERSION,
    systemModel: ECOQUERY_SYSTEM_MODEL,
  };
}

function flattenCandidates(searchResponse: EcoQuerySearchResponse) {
  const candidates: SearchCandidate[] = [];

  for (const activity of searchResponse.activities ?? []) {
    for (const product of activity.products ?? []) {
      for (const dataset of product.datasets ?? []) {
        const datasetId = asString(dataset.id);
        if (!datasetId) {
          continue;
        }

        candidates.push({
          datasetId,
          datasetUuid: extractDatasetUuid(dataset),
          datasetUrl: dataset.url ?? "",
          activityName: activity.name ?? "",
          activityType: activity.activity_type ?? "",
          referenceProduct: product.name ?? "",
          geography: dataset.geography ?? "",
          unit: product.unit ?? "",
          sector: activity.sectors?.join(", ") ?? "",
        });
      }
    }
  }

  return candidates;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string; limit?: number };
    const query = asString(body.query).trim();
    const requestedLimit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 60;
    const limit = Math.min(Math.max(requestedLimit, 1), 60);

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const searchResponse = await fetchJson<EcoQuerySearchResponse>(
      `${ECOQUERY_BASE_URL}/search/${ECOQUERY_VERSION}/${ECOQUERY_SYSTEM_MODEL}`,
      {
        method: "POST",
        body: JSON.stringify({
          from_: 0,
          limit: 60,
          query,
          filters: {
            geography: [],
            isic_section: [],
            isic_class: [],
            activity_type: [],
            sector: [],
          },
          search_by: "activity",
        }),
      },
    );

    const candidates = flattenCandidates(searchResponse).slice(0, limit);
    const results = await Promise.all(candidates.map((candidate) => enrichCandidate(candidate, query)));

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ecoQuery search failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
