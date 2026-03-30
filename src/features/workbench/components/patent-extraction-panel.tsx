"use client";

import { useMemo, useState } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import {
  buildExtractionDocumentationSummary,
  extractPatentDraft,
  type PatentExtractionResult,
  type PatentExtractionSuggestion,
} from "@/features/workbench/patent-extractor";
import { getMoleculeById } from "@/features/workbench/selectors";
import type {
  DocumentationRecord,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
} from "@/features/workbench/types";

type ExtractionEvidenceDraft = {
  citation: string;
  summary: string;
};

type PatentExtractionPanelProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  documentation: DocumentationRecord;
  onAddExtractedRow: (
    section: ReconstructionSection,
    values: Partial<ReconstructionRow>,
    evidence?: ExtractionEvidenceDraft,
  ) => void;
  onUpdateDocumentation: (
    field: keyof DocumentationRecord,
    value: DocumentationRecord[keyof DocumentationRecord],
  ) => void;
};

function appendTextBlock(current: string, nextBlock: string) {
  const normalizedCurrent = current.trim();
  const normalizedNext = nextBlock.trim();
  if (!normalizedNext) {
    return current;
  }
  if (!normalizedCurrent) {
    return normalizedNext;
  }
  if (normalizedCurrent.includes(normalizedNext)) {
    return current;
  }

  return `${normalizedCurrent}\n\n${normalizedNext}`;
}

function confidenceTone(confidence: PatentExtractionSuggestion["confidence"]) {
  if (confidence === "high") {
    return "accent" as const;
  }
  if (confidence === "medium") {
    return "ink" as const;
  }
  return "alert" as const;
}

function roleLabel(role: PatentExtractionSuggestion["role"]) {
  if (role === "input") return "Likely input";
  if (role === "solvent") return "Likely solvent";
  if (role === "workup") return "Likely work-up";
  if (role === "output") return "Likely output";
  return "Needs review";
}

export function PatentExtractionPanel({
  project,
  molecule,
  documentation,
  onAddExtractedRow,
  onUpdateDocumentation,
}: PatentExtractionPanelProps) {
  const [open, setOpen] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<PatentExtractionResult | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([]);
  const [addedSuggestionIds, setAddedSuggestionIds] = useState<string[]>([]);

  const visibleSuggestions = useMemo(
    () =>
      (result?.suggestions ?? []).filter(
        (suggestion) =>
          !dismissedSuggestionIds.includes(suggestion.id) && !addedSuggestionIds.includes(suggestion.id),
      ),
    [addedSuggestionIds, dismissedSuggestionIds, result?.suggestions],
  );

  const extractDraft = () => {
    const nextResult = extractPatentDraft(text, project);
    setResult(nextResult);
    setDismissedSuggestionIds([]);
    setAddedSuggestionIds([]);
  };

  const applySuggestion = (
    suggestion: PatentExtractionSuggestion,
    section: ReconstructionSection = suggestion.suggestedSection,
  ) => {
    const linkedMolecule = suggestion.linkedMoleculeId
      ? getMoleculeById(project, suggestion.linkedMoleculeId)
      : null;

    onAddExtractedRow(
      section,
      {
        name: linkedMolecule?.name || suggestion.name,
        totalValue: suggestion.amount,
        unit: suggestion.unit || molecule.scaleUnit,
        scaledUnit: suggestion.unit || molecule.scaleUnit,
        cas: linkedMolecule?.cas || suggestion.cas,
        iupac: linkedMolecule?.iupac || suggestion.iupac,
        reference: sourceLabel || "Patent text extract",
        description: suggestion.snippet,
        notes: `${roleLabel(suggestion.role)} • ${suggestion.reason}`,
        linkedMoleculeId: suggestion.linkedMoleculeId,
        ecoinventStatus: linkedMolecule?.ecoinventStatus ?? "missing",
        rawEcoinventStatus: linkedMolecule?.rawEcoinventStatus ?? "",
        linkConfidence: linkedMolecule ? "high" : null,
        needsReview: suggestion.confidence !== "high",
      },
      {
        citation: sourceLabel || "Patent text extract",
        summary: suggestion.snippet,
      },
    );

    setAddedSuggestionIds((current) => [...current, suggestion.id]);
  };

  const appendSummaryToDocumentation = () => {
    if (!result) {
      return;
    }

    const summaryBlock = buildExtractionDocumentationSummary(result, sourceLabel);
    onUpdateDocumentation("calculationNotes", appendTextBlock(documentation.calculationNotes, summaryBlock));

    if (sourceLabel.trim()) {
      onUpdateDocumentation("functionalUnit", appendTextBlock(documentation.functionalUnit, sourceLabel.trim()));
    }
  };

  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="section-title">Patent text assistant</div>
          <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Paste text and extract draft chemistry</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate">
            Deterministic browser-side extraction for patent or lab text. It drafts likely inputs, solvents, work-up
            materials, and key conditions for you to review before adding them to the molecule workbook.
          </p>
        </div>
        <button
          className="rounded-full border border-mist/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? "Hide assistant" : "Open assistant"}
        </button>
      </div>

      {open ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="rounded-[1.9rem] border border-mist/80 bg-lab p-5">
              <div className="grid gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-ink">Source label</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => setSourceLabel(event.target.value)}
                    placeholder="Example 5, patent WO-..., internal note, or source label"
                    value={sourceLabel}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-ink">Paste reaction or patent text</span>
                  <textarea
                    className="mt-2 min-h-56 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-accent"
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste one example or one reaction step here"
                    value={text}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-ink disabled:cursor-not-allowed disabled:bg-mist"
                    disabled={!text.trim()}
                    onClick={extractDraft}
                    type="button"
                  >
                    Extract draft
                  </button>
                  {result ? (
                    <button
                      className="rounded-full border border-mist/80 bg-white px-4 py-2.5 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                      onClick={appendSummaryToDocumentation}
                      type="button"
                    >
                      Append summary to documentation
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[1.9rem] border border-mist/80 bg-lab p-5">
              <div className="section-title">Detected conditions</div>
              {result ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Temperatures</div>
                      <div className="mt-2 text-sm text-ink">
                        {result.summary.temperatures.length > 0 ? result.summary.temperatures.join(", ") : "None detected"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Durations</div>
                      <div className="mt-2 text-sm text-ink">
                        {result.summary.durations.length > 0 ? result.summary.durations.join(", ") : "None detected"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Yield</div>
                      <div className="mt-2 text-sm text-ink">{result.summary.yieldValue || "None detected"}</div>
                    </div>
                    <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Purity</div>
                      <div className="mt-2 text-sm text-ink">{result.summary.purityValue || "None detected"}</div>
                    </div>
                  </div>
                  {result.summary.notes.length > 0 ? (
                    <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Notes</div>
                      <ul className="mt-2 space-y-2 text-sm text-slate">
                        {result.summary.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-mist bg-white px-4 py-8 text-sm text-slate">
                  Paste one reaction step and extract draft rows to see the detected conditions here.
                </div>
              )}
            </section>
          </div>

          <section className="rounded-[1.9rem] border border-mist/80 bg-lab p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="section-title">Draft rows</div>
                <h3 className="mt-2 text-xl font-semibold text-ink">Suggested reagents and materials</h3>
              </div>
              {result ? <StatusBadge label={`${visibleSuggestions.length} open suggestions`} tone="ink" /> : null}
            </div>

            <div className="mt-5 space-y-4">
              {result ? (
                visibleSuggestions.length > 0 ? (
                  visibleSuggestions.map((suggestion) => {
                    const linkedMolecule = suggestion.linkedMoleculeId
                      ? getMoleculeById(project, suggestion.linkedMoleculeId)
                      : null;

                    return (
                      <div
                        key={suggestion.id}
                        className="rounded-[1.6rem] border border-mist/80 bg-white px-5 py-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-base font-semibold text-ink">{suggestion.name}</div>
                              <StatusBadge label={roleLabel(suggestion.role)} tone="ink" />
                              <StatusBadge label={`${suggestion.confidence} confidence`} tone={confidenceTone(suggestion.confidence)} />
                              {linkedMolecule ? (
                                <StatusBadge
                                  label={`Matches ${linkedMolecule.name}`}
                                  tone={linkedMolecule.placeholder ? "alert" : "accent"}
                                />
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate">
                              <span>
                                <span className="font-medium text-ink">Amount:</span>{" "}
                                {[suggestion.amount || "—", suggestion.unit || ""].join(" ").trim()}
                              </span>
                              {linkedMolecule ? (
                                <span>
                                  <span className="font-medium text-ink">Ecoinvent:</span>{" "}
                                  {resolutionLabels[linkedMolecule.ecoinventStatus]}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 rounded-2xl border border-mist/70 bg-lab px-4 py-3 text-sm leading-6 text-slate">
                              {suggestion.snippet}
                            </div>
                            <div className="mt-2 text-xs text-slate">{suggestion.reason}</div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
                              onClick={() => applySuggestion(suggestion, "INPUT")}
                              type="button"
                            >
                              Add to INPUT
                            </button>
                            <button
                              className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                              onClick={() => applySuggestion(suggestion, "OUTPUT")}
                              type="button"
                            >
                              Add to OUTPUT
                            </button>
                            <button
                              className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-alert hover:text-alert"
                              onClick={() =>
                                setDismissedSuggestionIds((current) => [...current, suggestion.id])
                              }
                              type="button"
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-mist bg-white px-4 py-8 text-sm text-slate">
                    All current suggestions have been added or dismissed.
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-dashed border-mist bg-white px-4 py-8 text-sm text-slate">
                  No extracted draft yet. Paste text above and run the deterministic extractor.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
