"use client";

import { useEffect, useState } from "react";

import type { EcoinventDatasetMatch } from "@/features/workbench/types";

type EcoinventLookupDialogProps = {
  open: boolean;
  initialQuery: string;
  context?: {
    unit: string;
    goalAndScope: string;
    functionalUnit: string;
  };
  onClose: () => void;
  onSelect: (match: EcoinventDatasetMatch) => void;
};

type Interpretation = {
  normalizedName: string;
  enrichedTerms: string[];
  inputKind: "known_material" | "single_material_object" | "chemical" | "equipment_or_multicomponent" | "other";
  inferredMaterial: string;
  rationale: string;
};

type Fallback = {
  type: "chemical_suggestions" | "foreground_activity" | "unresolved";
  title: string;
  reason: string;
  suggestions: string[];
  possibleComponents: string[];
  documentationNeeded: string[];
};

type PipelineResponse = {
  status?: "complete" | "unresolved";
  results?: EcoinventDatasetMatch[];
  additionalResults?: EcoinventDatasetMatch[];
  interpretation?: Interpretation;
  searchTerms?: string[];
  rawCandidateCount?: number;
  distinctCandidateCount?: number;
  evaluatedCount?: number;
  suitableCount?: number;
  selectedIsicClass?: string;
  selectedIsicSection?: string;
  selectedIsicClasses?: string[];
  selectedIsicSections?: string[];
  isicRationale?: string;
  batchCount?: number;
  materialInference?: string;
  fallback?: Fallback | null;
  threshold?: number;
  error?: string;
  configured?: boolean;
};

type ProgressEvent = {
  id: string;
  status: "running" | "complete";
  label: string;
  detail: string;
  variables?: Array<{
    label: string;
    value: string | string[];
  }>;
};

type StreamMessage =
  | { type: "progress"; event: ProgressEvent }
  | { type: "result"; payload: PipelineResponse }
  | { type: "error"; error: string };

type FacetOption = { name: string; count: number };
type ManualVariant = { datasetId: string; datasetUuid: string; datasetUrl: string; geography: string; exactName: string };
type ManualFamily = {
  familyKey: string;
  activityName: string;
  activityType: string;
  referenceProduct: string;
  unit: string;
  sectors: string[];
  variants: ManualVariant[];
};
type ManualSearchResponse = {
  families?: ManualFamily[];
  totalHits?: number;
  nextFrom?: number | null;
  facets?: { sectors: FacetOption[]; activityTypes: FacetOption[]; isicSections: FacetOption[]; isicClasses: FacetOption[] };
  match?: EcoinventDatasetMatch;
  error?: string;
};

const emptyFacets = { sectors: [] as FacetOption[], activityTypes: [] as FacetOption[], isicSections: [] as FacetOption[], isicClasses: [] as FacetOption[] };

function mergeManualFamilies(current: ManualFamily[], incoming: ManualFamily[]) {
  const merged = new Map(current.map((family) => [family.familyKey, family]));
  for (const family of incoming) {
    const existing = merged.get(family.familyKey);
    if (!existing) {
      merged.set(family.familyKey, family);
      continue;
    }
    const variants = new Map(existing.variants.map((variant) => [variant.datasetId, variant]));
    for (const variant of family.variants) variants.set(variant.datasetId, variant);
    merged.set(family.familyKey, { ...existing, variants: [...variants.values()].sort((a, b) => a.geography.localeCompare(b.geography)) });
  }
  return [...merged.values()];
}

function compactText(value: string, fallback = "Not documented") {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function DatasetDocumentation({ match }: { match: EcoinventDatasetMatch }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate">Dataset information</div>
      <div className="mt-3 grid gap-x-5 gap-y-4 text-xs leading-5 text-slate md:grid-cols-2">
        <div><div className="font-semibold text-ink">Product information</div><div className="mt-1 whitespace-pre-wrap">{match.productInformation.trim() || "Not documented"}</div></div>
        <div><div className="font-semibold text-ink">General comment</div><div className="mt-1 whitespace-pre-wrap">{match.generalComment.trim() || "Not documented"}</div></div>
        <div><div className="font-semibold text-ink">Included activities — start</div><div className="mt-1 whitespace-pre-wrap">{match.includedActivitiesStart.trim() || "Not documented"}</div></div>
        <div><div className="font-semibold text-ink">Included activities — end</div><div className="mt-1 whitespace-pre-wrap">{match.includedActivitiesEnd.trim() || "Not documented"}</div></div>
        {match.synonyms.length ? <div className="md:col-span-2"><span className="font-semibold text-ink">Documented synonyms:</span> {match.synonyms.join(", ")}</div> : null}
      </div>
    </div>
  );
}

function GeographyDatasetList({
  family,
  variants,
  detailDatasetId,
  loadingDetailDatasetId,
  selectingDatasetId,
  detailsById,
  onShowDetails,
  onSelectDataset,
  selectable = true,
}: {
  family: ManualFamily;
  variants: ManualVariant[];
  detailDatasetId: string;
  loadingDetailDatasetId: string;
  selectingDatasetId: string;
  detailsById: Record<string, EcoinventDatasetMatch>;
  onShowDetails: (family: ManualFamily, variant: ManualVariant) => void;
  onSelectDataset: (family: ManualFamily, variant: ManualVariant) => void;
  selectable?: boolean;
}) {
  return (
    <div className="ecoinvent-geography-panel rounded-md border border-mist">
      <div className="border-b border-mist px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate">Available geographies</div>
      <div className="divide-y divide-mist">
        {variants.map((variant) => {
          const details = detailsById[variant.datasetId];
          const informationOpen = detailDatasetId === variant.datasetId;
          return (
            <div key={variant.datasetId}>
              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="text-xs font-semibold text-ink">{variant.geography || "Unspecified geography"}</div><div className="mt-1 break-words text-[11px] leading-5 text-slate">{variant.exactName}</div></div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button className="rounded-md border border-mist px-3 py-2 text-xs font-semibold text-slate hover:border-accent hover:text-accent disabled:opacity-50" disabled={Boolean(loadingDetailDatasetId)} onClick={() => onShowDetails(family, variant)} type="button">{loadingDetailDatasetId === variant.datasetId ? "Loading…" : informationOpen ? "Hide information" : "More information"}</button>
                  {selectable ? <button className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-[#ad4141] disabled:opacity-50" disabled={Boolean(selectingDatasetId)} onClick={() => onSelectDataset(family, variant)} type="button">{selectingDatasetId === variant.datasetId ? "Loading…" : "Use dataset"}</button> : null}
                </div>
              </div>
              {informationOpen && details ? <div className="border-t border-mist px-3 pb-3"><DatasetDocumentation match={details} />{details.datasetUrl ? <a className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline" href={details.datasetUrl} rel="noreferrer" target="_blank">Open public ecoQuery dataset page ↗</a> : null}</div> : informationOpen ? <div className="border-t border-mist px-3 py-3 text-xs text-slate">Loading public dataset information…</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DatasetResultCard({
  family,
  panelId,
  expanded,
  assessment,
  statusLabel,
  detailDatasetId,
  loadingDetailDatasetId,
  selectingDatasetId,
  detailsById,
  onToggle,
  onShowDetails,
  onSelectDataset,
  selectable = true,
}: {
  family: ManualFamily;
  panelId: string;
  expanded: boolean;
  assessment?: EcoinventDatasetMatch["aiAssessment"];
  statusLabel?: string;
  detailDatasetId: string;
  loadingDetailDatasetId: string;
  selectingDatasetId: string;
  detailsById: Record<string, EcoinventDatasetMatch>;
  onToggle: (panelId: string) => void;
  onShowDetails: (family: ManualFamily, variant: ManualVariant) => void;
  onSelectDataset: (family: ManualFamily, variant: ManualVariant) => void;
  selectable?: boolean;
}) {
  return (
    <article className="ecoinvent-result-card overflow-hidden rounded-lg">
      <div className="flex flex-col items-stretch gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-ink">{family.activityName || "Unnamed activity"}</div>
            <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Activity</span>
            {statusLabel ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selectable ? "bg-accent/10 text-accent" : "bg-lab text-slate"}`}>{statusLabel}</span> : null}
          </div>
          <div className="mt-1 text-xs text-slate">{(family.activityType || "Activity").replaceAll("_", " ")} · {family.unit || "No unit"} · {family.variants.length} geography variant{family.variants.length === 1 ? "" : "s"}</div>
          <div className="mt-2 text-xs text-slate"><span className="font-semibold text-ink">Reference product:</span> {family.referenceProduct || "Not supplied"}{family.sectors.length ? <> · <span className="font-semibold text-ink">Sector:</span> {family.sectors.join(", ")}</> : null}</div>
          {assessment ? <div className="mt-3 border-t border-mist/60 pt-3 text-xs leading-5 text-slate"><span className="font-semibold text-ink">AI assessment:</span> {compactText(assessment.rationale, "No assessment returned.")}{assessment.cautions[0] ? <> <span className="font-semibold text-ink">Limitation:</span> {compactText(assessment.cautions[0])}</> : null}</div> : null}
        </div>
        {selectable ? <button className="w-full rounded-md border border-mist bg-white px-3 py-2 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent sm:w-auto" onClick={() => onToggle(panelId)} type="button">{expanded ? "Hide geographies" : "Choose geography"}</button> : <span className="text-[11px] font-semibold text-slate">Not selectable</span>}
      </div>
      {selectable && expanded ? <div className="mx-4 mb-4"><GeographyDatasetList detailDatasetId={detailDatasetId} detailsById={detailsById} family={family} loadingDetailDatasetId={loadingDetailDatasetId} onSelectDataset={onSelectDataset} onShowDetails={onShowDetails} selectingDatasetId={selectingDatasetId} variants={family.variants} /></div> : null}
    </article>
  );
}

export function EcoinventLookupDialog({ open, initialQuery, context, onClose, onSelect }: EcoinventLookupDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState<"manual" | "ai">("manual");
  const [response, setResponse] = useState<PipelineResponse | null>(null);
  const [manualFamilies, setManualFamilies] = useState<ManualFamily[]>([]);
  const [manualSearched, setManualSearched] = useState(false);
  const [manualFacets, setManualFacets] = useState(emptyFacets);
  const [manualTotalHits, setManualTotalHits] = useState(0);
  const [nextFrom, setNextFrom] = useState<number | null>(null);
  const [activityType, setActivityType] = useState("MARKET_ACTIVITY");
  const [sector, setSector] = useState("");
  const [isicSection, setIsicSection] = useState("");
  const [isicClass, setIsicClass] = useState("");
  const [expandedDatasetId, setExpandedDatasetId] = useState("");
  const [selectingDatasetId, setSelectingDatasetId] = useState("");
  const [detailDatasetId, setDetailDatasetId] = useState("");
  const [loadingDetailDatasetId, setLoadingDetailDatasetId] = useState("");
  const [manualDetails, setManualDetails] = useState<Record<string, EcoinventDatasetMatch>>({});
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setView("manual");
    setResponse(null);
    setManualFamilies([]);
    setManualSearched(false);
    setManualFacets(emptyFacets);
    setManualTotalHits(0);
    setNextFrom(null);
    setActivityType("MARKET_ACTIVITY");
    setSector("");
    setIsicSection("");
    setIsicClass("");
    setExpandedDatasetId("");
    setSelectingDatasetId("");
    setDetailDatasetId("");
    setLoadingDetailDatasetId("");
    setManualDetails({});
    setLoading(false);
    setError("");
    setProgressEvents([]);
    const controller = new AbortController();
    setFacetsLoading(true);
    void fetch("/api/ecoinvent/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "facets", query: "", activityTypes: [], sectors: [], isicSections: [], isicClasses: [] }),
      signal: controller.signal,
    })
      .then(async (result) => {
        const payload = (await result.json()) as ManualSearchResponse;
        if (!result.ok) throw new Error(payload.error || "The ecoQuery filters could not be loaded.");
        setManualFacets(payload.facets ?? emptyFacets);
      })
      .catch((facetError) => {
        if (facetError instanceof DOMException && facetError.name === "AbortError") return;
        setError(facetError instanceof Error ? facetError.message : "The ecoQuery filters could not be loaded.");
      })
      .finally(() => setFacetsLoading(false));
    return () => controller.abort();
  }, [initialQuery, open]);

  if (!open) return null;

  const manualSearch = async (append = false) => {
    const searchQuery = query.trim();
    if (!searchQuery) return;
    setView("manual");
    setLoading(true);
    setError("");
    setResponse(null);
    setProgressEvents([]);
    if (!append) {
      setManualFamilies([]);
      setManualSearched(false);
      setExpandedDatasetId("");
      setDetailDatasetId("");
      setManualDetails({});
    }
    try {
      const result = await fetch("/api/ecoinvent/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: searchQuery,
          from: append ? nextFrom ?? 0 : 0,
          activityTypes: activityType ? [activityType] : [],
          sectors: sector ? [sector] : [],
          isicSections: isicSection ? [isicSection] : [],
          isicClasses: isicClass ? [isicClass] : [],
        }),
      });
      const payload = (await result.json()) as ManualSearchResponse;
      if (!result.ok) throw new Error(payload.error || "ecoQuery search failed.");
      setManualFamilies((current) => mergeManualFamilies(append ? current : [], payload.families ?? []));
      setManualSearched(true);
      setManualFacets(payload.facets ?? emptyFacets);
      setManualTotalHits(payload.totalHits ?? 0);
      setNextFrom(payload.nextFrom ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "ecoQuery search failed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchManualDataset = async (family: ManualFamily, variant: ManualVariant) => {
    const result = await fetch("/api/ecoinvent/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "select",
          datasetId: variant.datasetId,
          datasetUuid: variant.datasetUuid,
          datasetUrl: variant.datasetUrl,
          query: query.trim(),
          activityName: family.activityName,
          activityType: family.activityType,
          referenceProduct: family.referenceProduct,
          geography: variant.geography,
          unit: family.unit,
          sector: family.sectors.join(", "),
        }),
    });
    const payload = (await result.json()) as ManualSearchResponse;
    if (!result.ok || !payload.match) throw new Error(payload.error || "The selected dataset could not be loaded.");
    return payload.match;
  };

  const selectManualDataset = async (family: ManualFamily, variant: ManualVariant) => {
    setSelectingDatasetId(variant.datasetId);
    setError("");
    try {
      const match = manualDetails[variant.datasetId] ?? await fetchManualDataset(family, variant);
      onSelect(match);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "The selected dataset could not be loaded.");
    } finally {
      setSelectingDatasetId("");
    }
  };

  const showManualDetails = async (family: ManualFamily, variant: ManualVariant) => {
    if (detailDatasetId === variant.datasetId) {
      setDetailDatasetId("");
      return;
    }
    setDetailDatasetId(variant.datasetId);
    if (manualDetails[variant.datasetId]) return;
    setLoadingDetailDatasetId(variant.datasetId);
    setError("");
    try {
      const match = await fetchManualDataset(family, variant);
      setManualDetails((current) => ({ ...current, [variant.datasetId]: match }));
    } catch (detailError) {
      setDetailDatasetId("");
      setError(detailError instanceof Error ? detailError.message : "The dataset information could not be loaded.");
    } finally {
      setLoadingDetailDatasetId("");
    }
  };

  const askAi = async () => {
    const component = query.trim();
    if (!component) return;
    setLoading(true);
    setView("ai");
    setError("");
    setResponse(null);
    setExpandedDatasetId("");
    setProgressEvents([]);
    try {
      const result = await fetch("/api/ecoinvent/assistant", {
        method: "POST",
        headers: { accept: "application/x-ndjson", "content-type": "application/json" },
        body: JSON.stringify({
          component,
          unit: context?.unit ?? "",
          goalAndScope: context?.goalAndScope ?? "",
          functionalUnit: context?.functionalUnit ?? "",
        }),
      });
      if (!result.ok) {
        const payload = (await result.json()) as PipelineResponse;
        throw new Error(payload.configured === false
          ? "OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart the server."
          : payload.error || "The autonomous ecoinvent search failed.");
      }

      if (!result.headers.get("content-type")?.includes("application/x-ndjson") || !result.body) {
        setResponse((await result.json()) as PipelineResponse);
        return;
      }

      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPayload: PipelineResponse | null = null;
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        const message = JSON.parse(line) as StreamMessage;
        if (message.type === "progress") {
          setProgressEvents((current) => {
            const existingIndex = current.findIndex((item) => item.id === message.event.id);
            if (existingIndex === -1) return [...current, message.event];
            return current.map((item, index) => index === existingIndex ? message.event : item);
          });
        } else if (message.type === "result") {
          finalPayload = message.payload;
        } else {
          throw new Error(message.error || "The autonomous ecoinvent search failed.");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handleLine);
        if (done) break;
      }
      handleLine(buffer);
      if (!finalPayload) throw new Error("The search ended before a final result was returned.");
      setResponse(finalPayload);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "The autonomous ecoinvent search is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const results = response?.results ?? [];
  const additionalResults = response?.additionalResults ?? [];
  const fallback = response?.fallback;
  const currentAiProgress = [...progressEvents].reverse().find((event) => event.status === "running") ?? progressEvents.at(-1);
  const aiConfidence = results.length
    ? results.every((result) => result.aiAssessment?.confidence === "high")
      ? "high"
      : results.some((result) => result.aiAssessment?.confidence === "low")
        ? "low"
        : "medium"
    : "not available";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/65 px-4 py-6">
      <div aria-labelledby="ecoinvent-lookup-title" aria-modal="true" className="ecoinvent-modal-shell flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl" role="dialog">
        <div className="ecoinvent-search-surface flex flex-wrap items-start justify-between gap-4 border-b border-mist/80 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate">ecoinvent 3.12 / cut-off</div>
            <h2 className="mt-1 text-2xl font-semibold text-ink" id="ecoinvent-lookup-title">Find an ecoinvent dataset</h2>
          </div>
          <button className="rounded-md border border-mist px-3 py-1 text-sm text-slate transition hover:border-slate hover:text-ink" onClick={onClose} type="button">Close</button>
        </div>

        <div className="ecoinvent-search-surface border-b border-mist/80 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              className="min-h-12 min-w-0 flex-1 rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => {
                setQuery(event.target.value);
                setView("manual");
                setResponse(null);
                setManualFamilies([]);
                setManualSearched(false);
                setManualTotalHits(0);
                setNextFrom(null);
                setError("");
                setProgressEvents([]);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void manualSearch();
              }}
              placeholder="Search for an activity or a product…"
              value={query}
            />
            <button
              className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#ad4141] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || !query.trim()}
              onClick={() => void manualSearch()}
              type="button"
            >
              {loading && view === "manual" ? "Searching…" : "Search"}
            </button>
          </div>
          {manualSearched ? (
            <button className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50" disabled={loading || !query.trim()} onClick={() => void askAi()} type="button">
              <span aria-hidden="true">✦</span> {loading && view === "ai" ? "Refining with AI…" : "Improve this search with AI"}
            </button>
          ) : null}
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate">Filter by</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select aria-label="Activity type" className="min-h-10 min-w-0 w-full rounded-md border border-mist bg-white px-3 text-sm text-slate outline-none focus:border-accent" disabled={facetsLoading} onChange={(event) => setActivityType(event.target.value)} value={activityType}>
                <option value="">All activity types</option>
                {activityType && !manualFacets.activityTypes.some((item) => item.name === activityType) ? <option value={activityType}>{activityType.replaceAll("_", " ")}</option> : null}
                {manualFacets.activityTypes.map((item) => <option key={item.name} value={item.name}>{item.name.replaceAll("_", " ")} ({item.count})</option>)}
              </select>
              <select aria-label="Sector" className="min-h-10 min-w-0 w-full rounded-md border border-mist bg-white px-3 text-sm text-slate outline-none focus:border-accent" onChange={(event) => setSector(event.target.value)} value={sector}>
                <option value="">All sectors</option>
                {sector && !manualFacets.sectors.some((item) => item.name === sector) ? <option value={sector}>{sector}</option> : null}
                {manualFacets.sectors.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
              </select>
              <select aria-label="ISIC section" className="min-h-10 min-w-0 w-full rounded-md border border-mist bg-white px-3 text-sm text-slate outline-none focus:border-accent" onChange={(event) => { setIsicSection(event.target.value); setIsicClass(""); }} value={isicSection}>
                <option value="">All ISIC sections</option>
                {isicSection && !manualFacets.isicSections.some((item) => item.name === isicSection) ? <option value={isicSection}>{isicSection}</option> : null}
                {manualFacets.isicSections.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
              </select>
              <select aria-label="ISIC class" className="min-h-10 min-w-0 w-full rounded-md border border-mist bg-white px-3 text-sm text-slate outline-none focus:border-accent" onChange={(event) => setIsicClass(event.target.value)} value={isicClass}>
                <option value="">All ISIC classes</option>
                {isicClass && !manualFacets.isicClasses.some((item) => item.name === isicClass) ? <option value={isicClass}>{isicClass}</option> : null}
                {manualFacets.isicClasses.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
              </select>
            </div>
          </div>
        </div>

        {error ? <div className="mx-5 mt-4 rounded-lg border border-alert/20 bg-alert/5 px-4 py-3 text-sm text-alert">{error}</div> : null}

        <div className="ecoinvent-results-surface min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {view === "manual" && manualFamilies.length ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate">
              <div><span className="font-semibold text-ink">{manualFamilies.length}</span> grouped result{manualFamilies.length === 1 ? "" : "s"} shown from {manualTotalHits} ecoQuery activit{manualTotalHits === 1 ? "y" : "ies"}</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full bg-accent/10 px-2.5 py-1 font-semibold text-accent">{activityType ? activityType.replaceAll("_", " ") : "All activity types"}</span>
                {sector ? <span className="rounded-full border border-mist bg-white px-2.5 py-1">{sector}</span> : null}
                {isicSection ? <span className="rounded-full border border-mist bg-white px-2.5 py-1">{isicSection}</span> : null}
                {isicClass ? <span className="rounded-full border border-mist bg-white px-2.5 py-1">{isicClass}</span> : null}
              </div>
            </div>
          ) : null}

          {view === "manual" ? manualFamilies.map((family) => {
            const expanded = expandedDatasetId === family.familyKey;
            return (
              <DatasetResultCard detailDatasetId={detailDatasetId} detailsById={manualDetails} expanded={expanded} family={family} key={family.familyKey} loadingDetailDatasetId={loadingDetailDatasetId} onSelectDataset={(nextFamily, variant) => void selectManualDataset(nextFamily, variant)} onShowDetails={(nextFamily, variant) => void showManualDetails(nextFamily, variant)} onToggle={(panelId) => setExpandedDatasetId(expanded ? "" : panelId)} panelId={family.familyKey} selectingDatasetId={selectingDatasetId} />
            );
          }) : null}

          {view === "manual" && nextFrom !== null && nextFrom < manualTotalHits ? (
            <div className="flex justify-center">
              <button className="rounded-md border border-mist bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent disabled:opacity-60" disabled={loading} onClick={() => void manualSearch(true)} type="button">{loading ? "Loading…" : "Load more results"}</button>
            </div>
          ) : null}

          {view === "manual" && loading && !manualFamilies.length ? (
            <div className="rounded-lg border border-accent/20 bg-accent/[0.04] px-4 py-8 text-center text-sm text-slate">Searching live ecoQuery metadata…</div>
          ) : null}

          {view === "manual" && !loading && manualSearched && !manualFamilies.length && !error ? (
            <div className="flex flex-wrap items-center justify-center gap-2 py-6 text-sm text-slate">
              <span>No precise match found.</span>
              <button className="inline-flex items-center gap-1 font-semibold text-accent transition hover:text-ink" onClick={() => void askAi()} type="button"><span aria-hidden="true">✦</span> Refine with AI</button>
            </div>
          ) : null}

          {view === "manual" && !loading && !manualSearched && !error ? (
            <p className="py-4 text-center text-sm text-slate">Search by activity or reference product.</p>
          ) : null}

          {view === "ai" && loading ? (
            <div aria-live="polite" className="flex items-center gap-3 rounded-lg border border-mist bg-white px-4 py-3">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
              <div><div className="text-sm font-semibold text-ink">AI search in progress</div><div className="mt-0.5 text-xs text-slate">{currentAiProgress?.label ?? "Interpreting the search"}{currentAiProgress?.detail ? ` — ${currentAiProgress.detail}` : ""}</div></div>
            </div>
          ) : null}

          {view === "ai" && response?.interpretation ? (
            <div className="ecoinvent-result-card rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">AI search summary</div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${aiConfidence === "high" ? "bg-sea/10 text-sea" : "bg-lab text-slate"}`}>{aiConfidence} confidence</span>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div><span className="block text-slate">Interpreted as</span><span className="mt-0.5 block font-semibold text-ink">{response.interpretation.normalizedName}</span></div>
                <div><span className="block text-slate">Activity type</span><span className="mt-0.5 block font-semibold text-ink">Market activity</span></div>
                <div><span className="block text-slate">Candidates evaluated</span><span className="mt-0.5 block font-semibold text-ink">{response.evaluatedCount ?? 0}</span></div>
                <div><span className="block text-slate">Recommendations</span><span className="mt-0.5 block font-semibold text-ink">{results.length}</span></div>
                <div><span className="block text-slate">Search terms</span><span className="mt-0.5 block font-semibold text-ink">{response.searchTerms?.length ?? 0}</span></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-mist/60 pt-3">
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-accent hover:text-ink">Show AI reasoning trace</summary>
                  <div className="mt-3 space-y-3 rounded-md bg-lab p-3">
                    <div className="text-xs leading-5 text-slate"><span className="font-semibold text-ink">Interpretation:</span> {response.interpretation.inputKind.replaceAll("_", " ")} — {response.interpretation.rationale}</div>
                    {response.materialInference ? <div className="text-xs text-slate"><span className="font-semibold text-ink">Material restart:</span> {response.materialInference}</div> : null}
                    <div className="flex flex-wrap gap-1.5">{(response.searchTerms ?? []).map((term) => <span className="rounded-full border border-mist bg-white px-2 py-1 text-[11px] text-slate" key={term}>{term}</span>)}</div>
                    {(response.selectedIsicClasses?.length || response.selectedIsicClass) ? <div className="text-xs leading-5 text-slate"><span className="font-semibold text-ink">ISIC selection:</span> {(response.selectedIsicClasses?.length ? response.selectedIsicClasses : [response.selectedIsicClass]).filter(Boolean).join(" · ")}{response.isicRationale ? ` — ${response.isicRationale}` : ""}</div> : null}
                    <div className="space-y-1">{progressEvents.map((event) => <details className="rounded border border-mist bg-white px-3 py-2" key={event.id}><summary className="cursor-pointer text-xs font-semibold text-ink">{event.label}</summary><div className="mt-1 text-[11px] leading-5 text-slate">{event.detail}</div>{event.variables?.length ? <div className="mt-2 space-y-1">{event.variables.map((variable) => <div className="text-[11px] text-slate" key={variable.label}><span className="font-semibold text-ink">{variable.label}:</span> {Array.isArray(variable.value) ? variable.value.join(" · ") || "None" : variable.value || "None"}</div>)}</div> : null}</details>)}</div>
                  </div>
                </details>
                <button className="text-xs font-semibold text-slate transition hover:text-ink" onClick={() => setView("manual")} type="button">Refine search</button>
              </div>
            </div>
          ) : null}

          {view === "ai" && fallback ? (
            <div className="rounded-lg border border-alert/20 bg-alert/[0.035] p-4">
              <div className="text-sm font-semibold text-alert">{fallback.title}</div>
              <p className="mt-1 text-xs leading-5 text-slate">{fallback.reason}</p>
              {fallback.suggestions.length ? (
                <div className="mt-3"><div className="text-xs font-semibold text-ink">Unverified ideas for researcher review</div><ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate">{fallback.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : null}
              {fallback.possibleComponents.length ? (
                <div className="mt-3"><div className="text-xs font-semibold text-ink">Possible components — examples only</div><ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate">{fallback.possibleComponents.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : null}
              {fallback.documentationNeeded.length ? (
                <div className="mt-3"><div className="text-xs font-semibold text-ink">Researcher documentation needed</div><ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate">{fallback.documentationNeeded.map((item) => <li key={item}>{item}</li>)}</ul></div>
              ) : null}
            </div>
          ) : null}

          {view === "ai" && !loading && response && !results.length && !fallback ? (
            <div className="rounded-lg border border-dashed border-mist bg-lab px-4 py-8 text-sm text-slate">No suitable market dataset was found.</div>
          ) : null}

          {view === "ai" && results.length ? <div className="pt-1"><h3 className="text-base font-semibold text-ink">Recommended datasets</h3><p className="mt-0.5 text-xs text-slate">AI recommendations are geography-aggregated. Choose the exact geography before using a dataset.</p></div> : null}

          {view === "ai" ? results.map((match) => {
            const geographyDatasets: ManualVariant[] = match.geographyDatasets?.length ? match.geographyDatasets : [{ datasetId: match.datasetId, datasetUuid: match.datasetUuid, datasetUrl: match.datasetUrl, geography: match.geography, exactName: match.exactName }];
            const geographyPanelId = `ai-geographies-${match.datasetId}`;
            const expanded = expandedDatasetId === geographyPanelId;
            const family: ManualFamily = { familyKey: match.datasetId, activityName: match.activityName, activityType: match.activityType, referenceProduct: match.referenceProduct, unit: match.unit, sectors: match.sector ? [match.sector] : [], variants: geographyDatasets };
            return (
              <DatasetResultCard assessment={match.aiAssessment} detailDatasetId={detailDatasetId} detailsById={manualDetails} expanded={expanded} family={family} key={match.datasetId} loadingDetailDatasetId={loadingDetailDatasetId} onSelectDataset={(nextFamily, variant) => void selectManualDataset(nextFamily, variant)} onShowDetails={(nextFamily, variant) => void showManualDetails(nextFamily, variant)} onToggle={(panelId) => setExpandedDatasetId(expanded ? "" : panelId)} panelId={geographyPanelId} selectingDatasetId={selectingDatasetId} statusLabel={match.aiAssessment?.degree === 0 ? "Exact match" : "Normalized match"} />
            );
          }) : null}

          {view === "ai" && additionalResults.length ? (
            <details className="rounded-lg border border-mist/60 bg-transparent">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate hover:text-ink"><span>Show additional candidates</span><span className="rounded-full bg-lab px-2 py-0.5 text-[11px]">{additionalResults.length}</span></summary>
              <div className="space-y-2 border-t border-mist/60 p-3">
                {additionalResults.map((match) => {
                  const assessment = match.aiAssessment;
                  const accepted = Boolean(assessment?.accepted);
                  const geographyDatasets: ManualVariant[] = match.geographyDatasets?.length ? match.geographyDatasets : [{ datasetId: match.datasetId, datasetUuid: match.datasetUuid, datasetUrl: match.datasetUrl, geography: match.geography, exactName: match.exactName }];
                  const family: ManualFamily = { familyKey: match.datasetId, activityName: match.activityName, activityType: match.activityType, referenceProduct: match.referenceProduct, unit: match.unit, sectors: match.sector ? [match.sector] : [], variants: geographyDatasets };
                  const geographyPanelId = `additional-geographies-${match.datasetId}`;
                  const expanded = expandedDatasetId === geographyPanelId;
                  const matchLabel = accepted ? (assessment?.degree === 0 ? "Exact match" : "Normalized match") : assessment?.branchMatch === "proxy" ? "Broader proxy" : assessment?.confidence === "low" ? "Low-confidence alternative" : "Rejected mismatch";
                  return <DatasetResultCard assessment={assessment} detailDatasetId={detailDatasetId} detailsById={manualDetails} expanded={expanded} family={family} key={match.datasetId} loadingDetailDatasetId={loadingDetailDatasetId} onSelectDataset={(nextFamily, variant) => void selectManualDataset(nextFamily, variant)} onShowDetails={(nextFamily, variant) => void showManualDetails(nextFamily, variant)} onToggle={(panelId) => setExpandedDatasetId(expanded ? "" : panelId)} panelId={geographyPanelId} selectable={accepted} selectingDatasetId={selectingDatasetId} statusLabel={matchLabel} />;
                })}
              </div>
            </details>
          ) : null}

          {view === "ai" && !loading && !response && !error ? (
            <p className="py-4 text-center text-sm text-slate">Run a manual search first, then use AI when you need help refining it.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
