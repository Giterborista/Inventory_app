"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import { searchPubChem } from "@/features/workbench/pubchem";
import type { PubChemMatch } from "@/features/workbench/types";

type PubChemLookupDialogProps = {
  open: boolean;
  title: string;
  initialQuery?: string;
  onClose: () => void;
  onSelect: (match: PubChemMatch) => void;
};

export function PubChemLookupDialog({
  open,
  title,
  initialQuery = "",
  onClose,
  onSelect,
}: PubChemLookupDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PubChemMatch[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery(initialQuery);
    setResults([]);
    setError("");
    setLoading(false);
  }, [initialQuery, open]);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  if (!open) {
    return null;
  }

  const runLookup = async () => {
    if (!trimmedQuery) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const matches = await searchPubChem(trimmedQuery);
      setResults(matches);
      if (matches.length === 0) {
        setError("No PubChem match was found for that query.");
      }
    } catch {
      setError("PubChem lookup failed. Check the query and try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-10 backdrop-blur-sm">
      <div
        aria-labelledby="pubchem-lookup-title"
        aria-modal="true"
        className="hero-surface w-full max-w-4xl rounded-xl border border-white/70 p-6 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">PubChem lookup</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold text-ink" id="pubchem-lookup-title">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
              Search PubChem by CAS, name, IUPAC, or synonym, then choose a candidate to autofill the current form.
            </p>
          </div>
          <button
            className="rounded-md border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            <span className="text-sm font-medium text-ink">Query</span>
            <input
              className="mt-2 w-full rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="CAS, name, IUPAC, or synonym"
              value={query}
            />
          </label>
          <button
            className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-[#1f4b87] disabled:cursor-not-allowed disabled:bg-mist"
            disabled={!trimmedQuery || loading}
            onClick={() => void runLookup()}
            type="button"
          >
            {loading ? "Searching..." : "Search PubChem"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-alert/20 bg-alert/10 px-4 py-3 text-sm text-alert">
            {error}
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {results.map((match) => (
            <div
              key={match.cid}
              className="rounded-lg border border-mist/80 bg-white px-5 py-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-semibold text-ink">{match.title || match.iupacName || `CID ${match.cid}`}</div>
                    <StatusBadge label={`CID ${match.cid}`} tone="accent" />
                    {match.matchedCas ? <StatusBadge label={match.matchedCas} tone="ink" /> : null}
                    <StatusBadge label={`Score ${match.searchScore}`} tone="ink" />
                  </div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">IUPAC:</span> {match.iupacName || "-"}
                    </div>
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">Formula:</span> {match.molecularFormula || "-"}
                    </div>
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">Molecular weight:</span> {match.molecularWeight || "-"}
                    </div>
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">InChIKey:</span> {match.inchikey || "-"}
                    </div>
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">Matched term:</span> {match.matchedTerm || "-"}
                    </div>
                    <div className="text-sm text-slate">
                      <span className="font-medium text-ink">Matched by:</span> {match.matchedBy.join(", ") || "-"}
                    </div>
                  </div>
                  {match.synonyms.length > 0 ? (
                    <div className="mt-3 text-sm text-slate">
                      <span className="font-medium text-ink">Synonyms:</span>{" "}
                      {match.synonyms.slice(0, 8).join(", ")}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    className="rounded-md border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                    href={match.pubchemUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open PubChem
                  </a>
                  <button
                    className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4b87]"
                    onClick={() => onSelect(match)}
                    type="button"
                  >
                    Use this match
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loading && !error && results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-mist bg-lab px-4 py-8 text-sm text-slate">
              No results yet. Search PubChem to enrich this molecule or row with candidate identity data.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
