import { NextResponse } from "next/server";

import type { EcoinventDatasetMatch } from "@/features/workbench/types";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const ECOQUERY_BASE_URL = "https://api.ecoquery.ecoinvent.org";
const ECOQUERY_VERSION = "3.12";
const ECOQUERY_SYSTEM_MODEL = "cutoff";
const CANDIDATE_THRESHOLD = 40;
const EVALUATION_BATCH_SIZE = 10;
const SEARCH_LIMIT = 100;

type AssistantRequest = {
  component?: string;
  unit?: string;
  goalAndScope?: string;
  functionalUnit?: string;
};

type InputKind = "known_material" | "single_material_object" | "chemical" | "equipment_or_multicomponent" | "other";

type Interpretation = {
  normalizedName: string;
  enrichedTerms: string[];
  inputKind: InputKind;
  inferredMaterial: string;
  rationale: string;
};

type FacetItem = { name: string; count: number };
type EcoQueryDataset = { id?: string | number; uuid?: string; dataset_uuid?: string; datasetUuid?: string; geography?: string; url?: string };
type EcoQueryProduct = { name?: string; unit?: string; datasets?: EcoQueryDataset[] };
type EcoQueryActivity = { name?: string; activity_type?: string; sectors?: string[]; products?: EcoQueryProduct[] };
type EcoQuerySearchResponse = {
  activities?: EcoQueryActivity[];
  total_hits?: number;
  filters?: {
    isic_sections?: FacetItem[];
    isic_classes?: FacetItem[];
  };
};
type EcoQueryMetadataResponse = {
  activity_name?: string;
  reference_product?: string;
  unit?: string;
  sector?: string;
  has_access?: boolean;
  geography?: { short_name?: string };
};
type EcoQueryDocumentationResponse = {
  activity_description?: {
    name?: string;
    general_comment?: string;
    product_information?: string;
    synonyms?: string[];
    included_activities_start?: string;
    included_activities_end?: string;
    geography?: { short_name?: string };
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
  searchTerms: Set<string>;
  geographies: Set<string>;
  geographyDatasets: Map<string, {
    datasetId: string;
    datasetUuid: string;
    datasetUrl: string;
    geography: string;
    exactName: string;
  }>;
};

type SearchRun = {
  response: EcoQuerySearchResponse;
  query: string;
};

type CandidateAssessment = {
  candidateId: string;
  matchClass: "exact" | "normalized" | "proxy" | "irrelevant";
  confidence: "high" | "medium" | "low";
  suitable: boolean;
  rationale: string;
  cautions: string[];
};

type IsicSelection = {
  selectedClasses: string[];
  selectedSections: string[];
  rationale: string;
  consideredClasses?: string[];
  consideredSections?: string[];
};

type Fallback = {
  type: "chemical_suggestions" | "foreground_activity" | "unresolved";
  title: string;
  reason: string;
  suggestions: string[];
  possibleComponents: string[];
  documentationNeeded: string[];
};

type PipelineOutcome = {
  results: EcoinventDatasetMatch[];
  additionalResults: EcoinventDatasetMatch[];
  interpretation: Interpretation;
  searchTerms: string[];
  rawCandidateCount: number;
  distinctCandidateCount: number;
  evaluatedCount: number;
  suitableCount: number;
  selectedIsicClass: string;
  selectedIsicSection: string;
  selectedIsicClasses: string[];
  selectedIsicSections: string[];
  isicRationale: string;
  batchCount: number;
  materialInference: string;
  fallback: Fallback | null;
};

type ProgressEvent = {
  id: "interpret" | "market_search" | "candidate_decision" | "isic" | "filtered_search" | "metadata" | "evaluation" | "material_restart" | "fallback" | "result";
  status: "running" | "complete";
  label: string;
  detail: string;
  variables?: Array<{
    label: string;
    value: string | string[];
  }>;
};

type ProgressSink = (event: ProgressEvent) => void;

const interpretationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    normalizedName: { type: "string" },
    enrichedTerms: { type: "array", items: { type: "string" }, maxItems: 6 },
    inputKind: { type: "string", enum: ["known_material", "single_material_object", "chemical", "equipment_or_multicomponent", "other"] },
    inferredMaterial: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["normalizedName", "enrichedTerms", "inputKind", "inferredMaterial", "rationale"],
};

const isicSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    selectedClasses: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
    selectedSections: { type: "array", items: { type: "string" }, maxItems: 2 },
    rationale: { type: "string" },
  },
  required: ["selectedClasses", "selectedSections", "rationale"],
};

const assessmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessments: {
      type: "array",
      maxItems: EVALUATION_BATCH_SIZE,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          matchClass: { type: "string", enum: ["exact", "normalized", "proxy", "irrelevant"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          suitable: { type: "boolean" },
          rationale: { type: "string" },
          cautions: { type: "array", items: { type: "string" }, maxItems: 4 },
        },
        required: ["candidateId", "matchClass", "confidence", "suitable", "rationale", "cautions"],
      },
    },
  },
  required: ["assessments"],
};

const fallbackSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["chemical_suggestions", "foreground_activity", "unresolved"] },
    title: { type: "string" },
    reason: { type: "string" },
    suggestions: { type: "array", items: { type: "string" }, maxItems: 8 },
    possibleComponents: { type: "array", items: { type: "string" }, maxItems: 8 },
    documentationNeeded: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["type", "title", "reason", "suggestions", "possibleComponents", "documentationNeeded"],
};

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function extractUuid(value: unknown) {
  const match = asString(value).match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match?.[0] ?? "";
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeGeography(value: string) {
  const normalized = value.trim();
  return normalized.match(/\(([A-Z0-9-]+)\)$/i)?.[1] ?? normalized;
}

function uniqueTerms(values: string[]) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean && !unique.has(normalizeText(clean))) unique.set(normalizeText(clean), clean);
  }
  return [...unique.values()].slice(0, 6);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 250), 10_000);
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 250), 10_000);
  }
  return Math.min(500 * (2 ** attempt), 8_000);
}

function retryableStatus(status: number) {
  return status === 429 || status === 408 || status >= 500;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, transform: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await transform(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    if (response.ok) return (await response.json()) as T;
    if (retryableStatus(response.status) && attempt < 3) {
      await response.arrayBuffer();
      await wait(retryDelay(response, attempt));
      continue;
    }
    throw new Error(`ecoQuery request failed with ${response.status}${response.status === 429 ? " after automatic retries" : ""}.`);
  }
  throw new Error("ecoQuery request failed after automatic retries.");
}

async function callOpenAI<T>(instructions: string, input: unknown, name: string, schema: object): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        reasoning: { effort: "low" },
        instructions,
        input: JSON.stringify(input),
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
    });
    const payload = (await response.json()) as { output_text?: string; error?: { message?: string }; output?: Array<{ content?: Array<{ text?: string }> }> };
    if (response.ok) {
      const outputText = payload.output_text || payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") || "";
      if (!outputText) throw new Error("OpenAI returned no structured output.");
      return JSON.parse(outputText) as T;
    }
    if (retryableStatus(response.status) && attempt < 2) {
      await wait(retryDelay(response, attempt));
      continue;
    }
    throw new Error(payload.error?.message || `OpenAI request failed with ${response.status}${response.status === 429 ? " after automatic retries" : ""}.`);
  }
  throw new Error("OpenAI request failed after automatic retries.");
}

async function interpretInput(context: AssistantRequest): Promise<Interpretation> {
  return callOpenAI<Interpretation>(
    "Normalize and enrich one researcher term for a public ecoinvent metadata search. Return the concise normalized entity and up to six useful literal synonyms, abbreviations, expanded names, chemical names, or common technical names. Expand a recognized abbreviation in normalizedName; keep the abbreviation among enrichedTerms. Do not invent composition, manufacturing routes, datasets, or proxies. Classify the input as: known_material when it already names a material; single_material_object only when one material can be inferred defensibly from the name; chemical for a named chemical or chemical family; equipment_or_multicomponent when it is equipment, an assembled item, or has multiple materials; otherwise other. For single_material_object only, return one defensible inferred material. For every other kind inferredMaterial must be empty. Goal/scope and functional unit provide context but must not alter the named entity. No user question is allowed.",
    context,
    "ecoinvent_input_interpretation",
    interpretationSchema,
  );
}

async function searchEcoQuery(query: string, isicClass = ""): Promise<SearchRun> {
  const response = await fetchJson<EcoQuerySearchResponse>(`${ECOQUERY_BASE_URL}/search/${ECOQUERY_VERSION}/${ECOQUERY_SYSTEM_MODEL}`, {
    method: "POST",
    body: JSON.stringify({
      from_: 0,
      limit: SEARCH_LIMIT,
      query,
      filters: {
        geography: [],
        isic_section: [],
        isic_class: isicClass ? [isicClass] : [],
        activity_type: ["MARKET_ACTIVITY"],
        sector: [],
      },
      search_by: "activity",
    }),
  });
  return { response, query };
}

function collectCandidateFamilies(runs: SearchRun[]) {
  const families = new Map<string, SearchCandidate>();
  let rawCandidateCount = 0;
  for (const { response, query } of runs) {
    for (const activity of response.activities ?? []) {
      for (const product of activity.products ?? []) {
        for (const dataset of product.datasets ?? []) {
          const datasetId = asString(dataset.id);
          if (!datasetId) continue;
          rawCandidateCount += 1;
          const key = [activity.name, product.name, product.unit, activity.activity_type].map((value) => normalizeText(value ?? "")).join("|");
          const geography = normalizeGeography(dataset.geography ?? "");
          const datasetUuid = extractUuid(dataset.uuid) || extractUuid(dataset.dataset_uuid) || extractUuid(dataset.datasetUuid) || extractUuid(dataset.url);
          const geographyDataset = {
            datasetId,
            datasetUuid,
            datasetUrl: dataset.url ?? "",
            geography,
            exactName: `${activity.name ?? ""}${geography ? ` {${geography}}` : ""}${product.name ? ` | ${product.name}` : ""} | Cut-off, U`,
          };
          const existing = families.get(key);
          if (existing) {
            existing.searchTerms.add(query);
            if (geography) existing.geographies.add(geography);
            existing.geographyDatasets.set(datasetId, geographyDataset);
            continue;
          }
          families.set(key, {
            datasetId,
            datasetUuid,
            datasetUrl: dataset.url ?? "",
            activityName: activity.name ?? "",
            activityType: activity.activity_type ?? "",
            referenceProduct: product.name ?? "",
            geography,
            unit: product.unit ?? "",
            sector: activity.sectors?.join(", ") ?? "",
            searchTerms: new Set([query]),
            geographies: new Set(geography ? [geography] : []),
            geographyDatasets: new Map([[datasetId, geographyDataset]]),
          });
        }
      }
    }
  }
  return { candidates: [...families.values()], rawCandidateCount };
}

function mergeFacets(runs: SearchRun[], field: "isic_classes" | "isic_sections") {
  const facets = new Map<string, number>();
  for (const run of runs) {
    for (const item of run.response.filters?.[field] ?? []) {
      facets.set(item.name, Math.max(facets.get(item.name) ?? 0, item.count));
    }
  }
  return [...facets.entries()].map(([name, count]) => ({ name, count }));
}

async function chooseIsic(context: AssistantRequest, interpretation: Interpretation, runs: SearchRun[]): Promise<IsicSelection> {
  const classes = mergeFacets(runs, "isic_classes");
  const sections = mergeFacets(runs, "isic_sections");
  if (!classes.length) return { selectedClasses: [], selectedSections: [], rationale: "No live ISIC class was returned by ecoQuery.", consideredClasses: [], consideredSections: sections.map((item) => item.name) };
  const selection = await callOpenAI<IsicSelection>(
    "Select one or, only when needed, two ISIC classes from the live ecoQuery classes supplied. Select the strongest class whose economic activity corresponds to supplying the normalized requested entity. Add a second class only when it is also semantically plausible and excluding it creates a material risk of missing the correct dataset; never add a second class merely to broaden the search. Market activity is already fixed. Every selected class and section must exactly match a supplied live value. Do not invent a class and do not ask the researcher. Result counts are secondary to semantic fit. Explain why one class is sufficient or why two are required.",
    { context, interpretation, liveClasses: classes, liveSections: sections },
    "ecoinvent_isic_selection",
    isicSelectionSchema,
  );
  const liveClassNames = new Set(classes.map((item) => item.name));
  const liveSectionNames = new Set(sections.map((item) => item.name));
  const selectedClasses = uniqueTerms(selection.selectedClasses.filter((item) => liveClassNames.has(item))).slice(0, 2);
  if (!selectedClasses.length) selectedClasses.push([...classes].sort((a, b) => b.count - a.count)[0]?.name ?? "");
  const selectedSections = uniqueTerms(selection.selectedSections.filter((item) => liveSectionNames.has(item))).slice(0, 2);
  return {
    ...selection,
    selectedClasses: selectedClasses.filter(Boolean),
    selectedSections,
    consideredClasses: classes.map((item) => `${item.name} (${item.count})`),
    consideredSections: sections.map((item) => `${item.name} (${item.count})`),
  };
}

function searchCandidateLabels(candidates: SearchCandidate[]) {
  return candidates.map((candidate) => [
    candidate.activityName || "Unnamed activity",
    candidate.referenceProduct ? `reference product: ${candidate.referenceProduct}` : "",
    candidate.unit ? `unit: ${candidate.unit}` : "",
    candidate.activityType ? `type: ${candidate.activityType}` : "",
  ].filter(Boolean).join(" | "));
}

function datasetCandidateLabels(candidates: EcoinventDatasetMatch[]) {
  return candidates.map((candidate) => [
    candidate.activityName || "Unnamed activity",
    candidate.referenceProduct ? `reference product: ${candidate.referenceProduct}` : "",
    candidate.unit ? `unit: ${candidate.unit}` : "",
    candidate.activityType ? `type: ${candidate.activityType}` : "",
  ].filter(Boolean).join(" | "));
}

async function enrichCandidate(candidate: SearchCandidate): Promise<EcoinventDatasetMatch> {
  const params = new URLSearchParams({ dataset_id: candidate.datasetId, version: ECOQUERY_VERSION, system_model: ECOQUERY_SYSTEM_MODEL });
  const [metadataResult, documentationResult] = await Promise.allSettled([
    fetchJson<EcoQueryMetadataResponse>(`${ECOQUERY_BASE_URL}/spold?${params}`),
    fetchJson<EcoQueryDocumentationResponse>(`${ECOQUERY_BASE_URL}/spold/documentation?${params}`),
  ]);
  const metadata = metadataResult.status === "fulfilled" ? metadataResult.value : {};
  const documentation = documentationResult.status === "fulfilled" ? documentationResult.value.activity_description ?? {} : {};
  const activityName = metadata.activity_name || documentation.name || candidate.activityName;
  const referenceProduct = metadata.reference_product || candidate.referenceProduct;
  const geography = normalizeGeography(metadata.geography?.short_name || documentation.geography?.short_name || candidate.geography);
  return {
    datasetId: candidate.datasetId,
    datasetUuid: candidate.datasetUuid,
    searchQuery: [...candidate.searchTerms].join("; "),
    activityName,
    activityType: candidate.activityType,
    referenceProduct,
    geography,
    unit: metadata.unit || candidate.unit,
    sector: metadata.sector || candidate.sector,
    exactName: `${activityName}${geography ? ` {${geography}}` : ""}${referenceProduct ? ` | ${referenceProduct}` : ""} | Cut-off, U`,
    datasetUrl: candidate.datasetUrl,
    hasAccess: Boolean(metadata.has_access),
    generalComment: documentation.general_comment || "",
    productInformation: documentation.product_information || "",
    includedActivitiesStart: documentation.included_activities_start || "",
    includedActivitiesEnd: documentation.included_activities_end || "",
    synonyms: documentation.synonyms?.filter((item): item is string => typeof item === "string") || [],
    version: ECOQUERY_VERSION,
    systemModel: ECOQUERY_SYSTEM_MODEL,
    geographyVariants: [...candidate.geographies].sort(),
    geographyDatasets: [...candidate.geographyDatasets.values()].sort((a, b) => a.geography.localeCompare(b.geography)),
  };
}

async function evaluateBatch(context: AssistantRequest, interpretation: Interpretation, candidates: EcoinventDatasetMatch[]) {
  const compact = candidates.map((candidate) => ({
    candidateId: candidate.datasetId,
    activityName: candidate.activityName,
    activityType: candidate.activityType,
    referenceProduct: candidate.referenceProduct,
    unit: candidate.unit,
    sector: candidate.sector,
    productInformation: candidate.productInformation.slice(0, 700),
    generalComment: candidate.generalComment.slice(0, 700),
  }));
  const result = await callOpenAI<{ assessments: CandidateAssessment[] }>(
    "Evaluate every supplied public ecoinvent metadata candidate independently. Geography is deliberately ignored. suitable=true only when the candidate is a MARKET_ACTIVITY and its reference product has the same core identity as the requested entity: exact for a direct name, or normalized for a synonym, abbreviation, spelling, ecoinvent naming adjustment, or a more specific documented physical/supply form of the same broad material. A form, morphology, granulate/resin designation, or other specificity must not be rejected by itself when the requested material is broad and composition and function remain the same; record the specificity as a caution. A different material, blend, formulation, filler, reinforcement, coating, component, equipment, production service, treatment, waste flow, or manufacturing process is a proxy or irrelevant and must have suitable=false. A grade qualifier is suitable only when it does not imply a different composition or function. Unit must be compatible with the requested entity and researcher unit when one is supplied. Never turn a proxy into a recommendation. Use the normalized name and all enriched terms when checking identity. Do not compare candidates outside this batch and do not invent data. Return one assessment for each supplied candidate ID.",
    { context, interpretation, candidates: compact },
    "ecoinvent_candidate_assessment",
    assessmentSchema,
  );
  return result.assessments;
}

function applyAssessments(candidates: EcoinventDatasetMatch[], assessments: CandidateAssessment[]) {
  const byId = new Map(assessments.map((assessment) => [assessment.candidateId, assessment]));
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  const classOrder = { exact: 0, normalized: 1, proxy: 2, irrelevant: 3 };
  const decorated = candidates
    .map((candidate) => ({ candidate, assessment: byId.get(candidate.datasetId) }))
    .filter((item): item is { candidate: EcoinventDatasetMatch; assessment: CandidateAssessment } => Boolean(item.assessment))
    .sort((a, b) => Number(!(a.assessment.suitable && (a.assessment.matchClass === "exact" || a.assessment.matchClass === "normalized"))) - Number(!(b.assessment.suitable && (b.assessment.matchClass === "exact" || b.assessment.matchClass === "normalized")))
      || classOrder[a.assessment.matchClass] - classOrder[b.assessment.matchClass]
      || confidenceOrder[a.assessment.confidence] - confidenceOrder[b.assessment.confidence]
      || a.candidate.activityName.localeCompare(b.candidate.activityName))
    .map(({ candidate, assessment }, index): EcoinventDatasetMatch => {
      const accepted = assessment.suitable && (assessment.matchClass === "exact" || assessment.matchClass === "normalized");
      const degree = assessment.matchClass === "exact" ? 0 : assessment.matchClass === "normalized" ? 1 : assessment.matchClass === "proxy" ? 3 : 4;
      const degreeLabel = assessment.matchClass === "exact" ? "Exact" : assessment.matchClass === "normalized" ? "Normalized" : assessment.matchClass === "proxy" ? "Close proxy" : "Broad proxy";
      return {
        ...candidate,
        aiAssessment: {
          rank: index + 1,
          confidence: assessment.confidence,
          degree,
          degreeLabel,
          branchMatch: assessment.matchClass === "exact" ? "exact" : assessment.matchClass === "normalized" ? "normalized" : assessment.matchClass === "proxy" ? "proxy" : "mismatch",
          accepted,
          selectable: accepted,
          rejectionReason: accepted ? "" : assessment.rationale,
          rationale: assessment.rationale,
          cautions: assessment.cautions,
        },
      };
    });
  const recommended = decorated.filter((candidate) => candidate.aiAssessment?.accepted).slice(0, 3);
  const recommendedIds = new Set(recommended.map((candidate) => candidate.datasetId));
  return { recommended, additional: decorated.filter((candidate) => !recommendedIds.has(candidate.datasetId)) };
}

async function createFallback(context: AssistantRequest, interpretation: Interpretation): Promise<Fallback> {
  return callOpenAI<Fallback>(
    "No suitable direct or normalized ecoinvent market dataset was found. Produce only the fallback required by the supplied input kind. For chemical: type chemical_suggestions and give unverified alternative names, chemical families, or proxy ideas for researcher review; do not claim they are datasets and do not select one. For equipment_or_multicomponent: type foreground_activity, recommend creating a foreground activity, and give possible components only as non-exhaustive examples; the researcher must obtain documentation and quantities. For known_material or other: type unresolved and give concise researcher-led search or documentation suggestions, without selecting a proxy. Geography is outside this beta, so never request or recommend a geography choice. Do not ask a question and do not invent composition or quantities.",
    { context, interpretation },
    "ecoinvent_no_match_fallback",
    fallbackSchema,
  );
}

async function runPipeline(context: AssistantRequest, allowMaterialInference = true, onProgress: ProgressSink = () => undefined): Promise<PipelineOutcome> {
  onProgress({
    id: "interpret",
    status: "running",
    label: "Interpret and enrich the name",
    detail: "Expanding abbreviations, synonyms, and technical wording.",
    variables: [
      { label: "Researcher input", value: context.component || "" },
      { label: "Requested unit", value: context.unit || "Not supplied" },
      { label: "Goal and scope", value: context.goalAndScope || "Not supplied" },
      { label: "Functional unit", value: context.functionalUnit || "Not supplied" },
    ],
  });
  const interpretation = await interpretInput(context);
  const marketName = interpretation.normalizedName.trim() ? `market for ${interpretation.normalizedName.trim()}` : "";
  const searchTerms = uniqueTerms([context.component ?? "", interpretation.normalizedName, marketName, ...interpretation.enrichedTerms]);
  onProgress({
    id: "interpret",
    status: "complete",
    label: "Name interpreted",
    detail: `${interpretation.normalizedName} · ${searchTerms.length} search term${searchTerms.length === 1 ? "" : "s"}`,
    variables: [
      { label: "Normalized name", value: interpretation.normalizedName },
      { label: "Input classification", value: interpretation.inputKind },
      { label: "Inferred material", value: interpretation.inferredMaterial || "None" },
      { label: "Interpretation rationale", value: interpretation.rationale },
      { label: "AI-enriched terms", value: interpretation.enrichedTerms },
      { label: "Final search terms", value: searchTerms },
      { label: "Fixed activity type", value: "MARKET_ACTIVITY" },
      { label: "Geography", value: "Ignored for this beta" },
    ],
  });
  onProgress({
    id: "market_search",
    status: "running",
    label: "Search market activities",
    detail: "Querying live ecoQuery metadata with geography ignored.",
    variables: [
      { label: "Queries", value: searchTerms },
      { label: "Activity type filter", value: "MARKET_ACTIVITY" },
      { label: "ISIC class filter", value: "None for initial discovery" },
      { label: "ecoinvent version", value: ECOQUERY_VERSION },
      { label: "System model", value: ECOQUERY_SYSTEM_MODEL },
    ],
  });
  let runs = await mapWithConcurrency(searchTerms, 3, (term) => searchEcoQuery(term));
  let collected = collectCandidateFamilies(runs);
  let selectedIsic: IsicSelection = { selectedClasses: [], selectedSections: [], rationale: "", consideredClasses: [], consideredSections: [] };
  onProgress({
    id: "market_search",
    status: "complete",
    label: "Initial market search complete",
    detail: `${collected.candidates.length} distinct candidate famil${collected.candidates.length === 1 ? "y" : "ies"} after geography aggregation.`,
    variables: [
      { label: "Raw dataset variants", value: String(collected.rawCandidateCount) },
      { label: "Distinct candidate families", value: String(collected.candidates.length) },
      { label: "Candidate names and variables", value: searchCandidateLabels(collected.candidates) },
    ],
  });

  if (collected.candidates.length > CANDIDATE_THRESHOLD) {
    onProgress({
      id: "candidate_decision",
      status: "complete",
      label: "Candidate threshold exceeded",
      detail: `${collected.candidates.length} > ${CANDIDATE_THRESHOLD}, so the ISIC narrowing branch is required.`,
      variables: [
        { label: "Candidate threshold", value: String(CANDIDATE_THRESHOLD) },
        { label: "Observed candidates", value: String(collected.candidates.length) },
        { label: "Selected branch", value: "Autonomous ISIC narrowing" },
      ],
    });
    onProgress({
      id: "isic",
      status: "running",
      label: "Select live ISIC classes",
      detail: "Ranking only the classes returned by ecoQuery and selecting a second class only when needed.",
      variables: [{ label: "Selection input", value: `${interpretation.normalizedName} · MARKET_ACTIVITY` }],
    });
    selectedIsic = await chooseIsic(context, interpretation, runs);
    onProgress({
      id: "isic",
      status: "complete",
      label: selectedIsic.selectedClasses.length === 2 ? "Two ISIC classes selected" : "ISIC class selected",
      detail: selectedIsic.selectedClasses.join(" · ") || "No live ISIC class was available.",
      variables: [
        { label: "Selected ISIC classes", value: selectedIsic.selectedClasses.length ? selectedIsic.selectedClasses : ["None"] },
        { label: "Selected ISIC sections", value: selectedIsic.selectedSections.length ? selectedIsic.selectedSections : ["None"] },
        { label: "Selection rationale", value: selectedIsic.rationale },
        { label: "Live classes considered", value: selectedIsic.consideredClasses ?? [] },
        { label: "Live sections considered", value: selectedIsic.consideredSections ?? [] },
      ],
    });
    if (selectedIsic.selectedClasses.length) {
      onProgress({
        id: "filtered_search",
        status: "running",
        label: "Repeat the market search",
        detail: `Searching every enriched term in ${selectedIsic.selectedClasses.length} selected ISIC class${selectedIsic.selectedClasses.length === 1 ? "" : "es"}.`,
        variables: [
          { label: "Queries", value: searchTerms },
          { label: "Activity type filter", value: "MARKET_ACTIVITY" },
          { label: "ISIC class filters", value: selectedIsic.selectedClasses },
        ],
      });
      const filteredQueries = selectedIsic.selectedClasses.flatMap((isicClass) => searchTerms.map((term) => ({ term, isicClass })));
      runs = await mapWithConcurrency(filteredQueries, 3, ({ term, isicClass }) => searchEcoQuery(term, isicClass));
      collected = collectCandidateFamilies(runs);
      onProgress({
        id: "filtered_search",
        status: "complete",
        label: "ISIC-filtered search complete",
        detail: `${collected.candidates.length} distinct candidate famil${collected.candidates.length === 1 ? "y" : "ies"} remain.`,
        variables: [
          { label: "ISIC classes searched", value: selectedIsic.selectedClasses },
          { label: "Raw dataset variants", value: String(collected.rawCandidateCount) },
          { label: "Distinct candidate families", value: String(collected.candidates.length) },
          { label: "Candidate names and variables", value: searchCandidateLabels(collected.candidates) },
        ],
      });
    }
  } else {
    onProgress({
      id: "candidate_decision",
      status: "complete",
      label: "Evaluate directly",
      detail: `${collected.candidates.length} ≤ ${CANDIDATE_THRESHOLD}, so no ISIC narrowing is needed.`,
      variables: [
        { label: "Candidate threshold", value: String(CANDIDATE_THRESHOLD) },
        { label: "Observed candidates", value: String(collected.candidates.length) },
        { label: "Selected branch", value: "Direct suitability evaluation" },
      ],
    });
  }

  onProgress({
    id: "metadata",
    status: "running",
    label: "Read candidate metadata",
    detail: `Loading names, reference products, units, and public documentation for ${collected.candidates.length} candidate${collected.candidates.length === 1 ? "" : "s"}.`,
    variables: [{ label: "Candidate families being hydrated", value: searchCandidateLabels(collected.candidates) }],
  });
  const enrichedCandidates = await mapWithConcurrency(collected.candidates, 4, enrichCandidate);
  onProgress({
    id: "metadata",
    status: "complete",
    label: "Candidate metadata ready",
    detail: `${enrichedCandidates.length} candidate${enrichedCandidates.length === 1 ? "" : "s"} ready for suitability evaluation.`,
    variables: [{ label: "Hydrated candidate names and variables", value: datasetCandidateLabels(enrichedCandidates) }],
  });
  const batches = chunk(enrichedCandidates, EVALUATION_BATCH_SIZE);
  const batchVariables = batches.map((batch, index) => ({ label: `Evaluation batch ${index + 1}`, value: datasetCandidateLabels(batch) }));
  onProgress({
    id: "evaluation",
    status: "running",
    label: "Evaluate suitability",
    detail: `${batches.length} batch${batches.length === 1 ? "" : "es"} of at most ${EVALUATION_BATCH_SIZE} candidates.`,
    variables: batchVariables,
  });
  let completedBatches = 0;
  const assessments = (await mapWithConcurrency(batches, 1, async (batch) => {
    const evaluated = await evaluateBatch(context, interpretation, batch);
    completedBatches += 1;
    onProgress({ id: "evaluation", status: "running", label: "Evaluate suitability", detail: `${completedBatches} of ${batches.length} batch${batches.length === 1 ? "" : "es"} complete.`, variables: batchVariables });
    return evaluated;
  })).flat();
  const assessedResults = applyAssessments(enrichedCandidates, assessments);
  const results = assessedResults.recommended;
  const additionalResults = assessedResults.additional;
  const suitableCount = assessments.filter((assessment) => assessment.suitable && (assessment.matchClass === "exact" || assessment.matchClass === "normalized")).length;
  const candidatesById = new Map(enrichedCandidates.map((candidate) => [candidate.datasetId, candidate]));
  const assessmentLabels = assessments.map((assessment) => {
    const candidate = candidatesById.get(assessment.candidateId);
    const name = candidate ? `${candidate.activityName} | ${candidate.referenceProduct} | ${candidate.unit}` : assessment.candidateId;
    const decision = assessment.suitable ? "accepted" : "rejected";
    const cautions = assessment.cautions.length ? ` | cautions: ${assessment.cautions.join("; ")}` : "";
    return `${name} → ${decision} | ${assessment.matchClass} | ${assessment.confidence} confidence | ${assessment.rationale}${cautions}`;
  });
  onProgress({
    id: "evaluation",
    status: "complete",
    label: "Suitability evaluation complete",
    detail: `${suitableCount} exact or normalized match${suitableCount === 1 ? "" : "es"} passed.`,
    variables: [
      ...batchVariables,
      { label: "Candidate decisions", value: assessmentLabels },
      { label: "Accepted candidate names", value: results.map((result) => result.exactName) },
      { label: "Accepted count", value: String(suitableCount) },
      { label: "Rejected count", value: String(Math.max(assessments.length - suitableCount, 0)) },
    ],
  });

  if (!results.length && allowMaterialInference && interpretation.inputKind === "single_material_object" && interpretation.inferredMaterial.trim()) {
    onProgress({ id: "material_restart", status: "running", label: "Restart with the inferred material", detail: interpretation.inferredMaterial.trim(), variables: [{ label: "Restart query", value: interpretation.inferredMaterial.trim() }] });
    const retried = await runPipeline({ ...context, component: interpretation.inferredMaterial.trim() }, false, onProgress);
    onProgress({ id: "material_restart", status: "complete", label: "Material restart complete", detail: `${retried.results.length} suitable result${retried.results.length === 1 ? "" : "s"} found.`, variables: [{ label: "Restart query", value: interpretation.inferredMaterial.trim() }, { label: "Result names", value: retried.results.map((result) => result.exactName) }] });
    return {
      ...retried,
      materialInference: interpretation.inferredMaterial.trim(),
    };
  }

  if (!results.length) {
    onProgress({ id: "fallback", status: "running", label: "Prepare the no-match outcome", detail: "Applying the agreed fallback for this type of input.", variables: [{ label: "Input classification", value: interpretation.inputKind }] });
  } else {
    onProgress({ id: "result", status: "complete", label: "Prepare recommendations", detail: `${results.length} dataset${results.length === 1 ? "" : "s"} will be shown.`, variables: [{ label: "Recommended dataset names", value: results.map((result) => result.exactName) }] });
  }

  const fallback = results.length ? null : await createFallback(context, interpretation);
  if (fallback) onProgress({
    id: "fallback",
    status: "complete",
    label: "No-match guidance ready",
    detail: fallback.title,
    variables: [
      { label: "Fallback type", value: fallback.type },
      { label: "Reason", value: fallback.reason },
      { label: "Suggestions", value: fallback.suggestions },
      { label: "Possible components", value: fallback.possibleComponents },
      { label: "Documentation needed", value: fallback.documentationNeeded },
    ],
  });

  return {
    results,
    additionalResults,
    interpretation,
    searchTerms,
    rawCandidateCount: collected.rawCandidateCount,
    distinctCandidateCount: collected.candidates.length,
    evaluatedCount: assessments.length,
    suitableCount,
    selectedIsicClass: selectedIsic.selectedClasses.join(" · "),
    selectedIsicSection: selectedIsic.selectedSections.join(" · "),
    selectedIsicClasses: selectedIsic.selectedClasses,
    selectedIsicSections: selectedIsic.selectedSections,
    isicRationale: selectedIsic.rationale,
    batchCount: batches.length,
    materialInference: "",
    fallback,
  };
}

function responsePayload(outcome: PipelineOutcome) {
  return {
    status: outcome.results.length ? "complete" : "unresolved",
    ...outcome,
    marketOnly: true,
    threshold: CANDIDATE_THRESHOLD,
    model: OPENAI_MODEL,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AssistantRequest;
    const component = asString(body.component).trim();
    if (!component) return NextResponse.json({ error: "Enter a material, chemical, object, or equipment name." }, { status: 400 });
    const context = {
      component,
      unit: asString(body.unit).trim(),
      goalAndScope: asString(body.goalAndScope).trim(),
      functionalUnit: asString(body.functionalUnit).trim(),
    };

    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (value: object) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
          void (async () => {
            try {
              const outcome = await runPipeline(context, true, (event) => send({ type: "progress", event }));
              send({ type: "result", payload: responsePayload(outcome) });
            } catch (streamError) {
              send({ type: "error", error: streamError instanceof Error ? streamError.message : "Assistant request failed." });
            } finally {
              controller.close();
            }
          })();
        },
      });
      return new Response(stream, {
        headers: {
          "cache-control": "no-cache, no-transform",
          "content-type": "application/x-ndjson; charset=utf-8",
        },
      });
    }

    const outcome = await runPipeline(context);
    return NextResponse.json(responsePayload(outcome));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assistant request failed.";
    return NextResponse.json(
      { error: message, configured: Boolean(process.env.OPENAI_API_KEY) },
      { status: message.includes("OPENAI_API_KEY") ? 503 : 502 },
    );
  }
}
