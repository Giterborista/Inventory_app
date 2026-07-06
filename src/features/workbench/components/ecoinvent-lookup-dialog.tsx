"use client";

import { useEffect, useState } from "react";

import type { EcoinventDatasetMatch } from "@/features/workbench/types";

type EcoinventLookupDialogProps = {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onSelect: (match: EcoinventDatasetMatch) => void;
};

function compactText(value: string, fallback = "Not documented") {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 320 ? `${normalized.slice(0, 317)}...` : normalized;
}

export function EcoinventLookupDialog({ open, initialQuery, onClose, onSelect }: EcoinventLookupDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<EcoinventDatasetMatch[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [expandedDatasetId, setExpandedDatasetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery(initialQuery);
    setResults([]);
    setVisibleCount(10);
    setExpandedDatasetId("");
    setError("");
  }, [initialQuery, open]);

  if (!open) {
    return null;
  }

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setError("");
    setExpandedDatasetId("");
    setVisibleCount(10);
    try {
      const response = await fetch("/api/ecoinvent/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          query: trimmed,
          limit: 60,
        }),
      });

      const payload = (await response.json()) as { results?: EcoinventDatasetMatch[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "ecoQuery search failed.");
      }

      setResults(payload.results ?? []);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "ecoQuery search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-6 backdrop-blur-sm">
      <div className="hero-surface flex max-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-white/70 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist/80 bg-white/90 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate">ecoinvent 3.12 / cut-off</div>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Match dataset</h2>
          </div>
          <button
            className="rounded-md border border-mist px-3 py-1 text-sm text-slate transition hover:border-slate hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="border-b border-mist/80 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            className="min-h-12 flex-1 rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void search();
              }
            }}
            placeholder="Search activity, market, chemical, or product name"
            value={query}
          />
          <button
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || !query.trim()}
            onClick={() => void search()}
            type="button"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        </div>

        {error ? (
          <div className="mx-5 mt-4 rounded-lg border border-alert/20 bg-alert/5 px-4 py-3 text-sm text-alert">{error}</div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {!loading && results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-mist bg-lab px-4 py-8 text-sm text-slate">
              Search by activity, product, market, chemical name, or geography. Select the closest dataset for this row.
            </div>
          ) : null}

          {results.slice(0, visibleCount).map((match) => {
            const expanded = expandedDatasetId === match.datasetId;

            return (
            <div
              className="w-full rounded-lg border border-mist/80 bg-white px-4 py-4 text-left shadow-sm transition hover:border-accent"
              key={match.datasetId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{match.exactName}</div>
                  <div className="mt-1 text-xs text-slate">
                    {match.activityType || "Activity"} / {match.geography || "No geography"} / {match.unit || "No unit"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="rounded-md border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
                    onClick={() => setExpandedDatasetId(expanded ? "" : match.datasetId)}
                    type="button"
                  >
                    {expanded ? "Hide details" : "Expand details"}
                  </button>
                  <button
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ink"
                    onClick={() => onSelect(match)}
                    type="button"
                  >
                    Use dataset
                  </button>
                </div>
              </div>

              {expanded ? (
                <div className="mt-3 rounded-lg border border-mist bg-lab px-4 py-4">
                  <div className="grid gap-4 text-xs leading-6 text-slate md:grid-cols-2">
                    <div>
                      <div className="font-semibold text-ink">Product information</div>
                      <div className="mt-1 whitespace-pre-wrap">{match.productInformation.trim() || "Not documented"}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-ink">General comment</div>
                      <div className="mt-1 whitespace-pre-wrap">{match.generalComment.trim() || "Not documented"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 text-xs leading-5 text-slate md:grid-cols-2">
                  <div>
                    <span className="font-semibold text-ink">Product information:</span>{" "}
                    {compactText(match.productInformation)}
                  </div>
                  <div>
                    <span className="font-semibold text-ink">General comment:</span>{" "}
                    {compactText(match.generalComment)}
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {results.length > visibleCount ? (
            <div className="flex justify-center pt-2">
              <button
                className="rounded-md border border-mist bg-white px-4 py-2 text-sm font-semibold text-slate shadow-sm transition hover:border-accent hover:text-accent"
                onClick={() => setVisibleCount((current) => Math.min(current + 10, results.length))}
                type="button"
              >
                Load more
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
