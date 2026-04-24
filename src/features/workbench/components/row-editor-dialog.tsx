"use client";

import { useEffect, useMemo, useState } from "react";

import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { resolutionLabels, visibleResolutionOptions } from "@/features/workbench/display";
import { makeClientId } from "@/features/workbench/state-utils";
import { getCuratedPubChemSynonymText } from "@/features/workbench/pubchem";
import type {
  MoleculeDraft,
  MoleculeRecord,
  ProjectRecord,
  PubChemMatch,
  ReconstructionRow,
  ReconstructionSection,
  ResolutionStatus,
} from "@/features/workbench/types";

type RowEditorDialogProps = {
  open: boolean;
  project: ProjectRecord;
  currentMolecule: MoleculeRecord;
  section: ReconstructionSection;
  initialRow?: ReconstructionRow | null;
  onClose: () => void;
  onSave: (values: Partial<ReconstructionRow> & { section: ReconstructionSection }, rowId?: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: ReconstructionSection },
    draft: Partial<MoleculeDraft>,
  ) => void;
};

type RowDraft = {
  section: ReconstructionSection;
  name: string;
  synonyms: string;
  reactionValue: string;
  cleaningValue: string;
  totalValue: string;
  unit: string;
  totalScaledValue: string;
  scaledUnit: string;
  cas: string;
  iupac: string;
  description: string;
  reference: string;
  notes: string;
  formula: string;
  ecoinventName: string;
  pubchemMatch: PubChemMatch | null;
  linkedMoleculeId: string | null;
  ecoinventStatus: ResolutionStatus;
};

type ProjectItemResult =
  | { kind: "molecule"; id: string; molecule: MoleculeRecord }
  | { kind: "row"; id: string; sourceMolecule: MoleculeRecord; row: ReconstructionRow };

type RowProjectItemResult = Extract<ProjectItemResult, { kind: "row" }>;

function buildDraft(
  section: ReconstructionSection,
  row?: ReconstructionRow | null,
): RowDraft {
  return {
    section: row?.section ?? section,
    name: row?.name ?? "",
    synonyms: row?.synonyms.join(", ") ?? "",
    reactionValue: row?.reactionValue ?? "",
    cleaningValue: row?.cleaningValue ?? "",
    totalValue: row?.totalValue ?? "",
    unit: row?.unit ?? "kg",
    totalScaledValue: row?.totalScaledValue ?? "",
    scaledUnit: row?.scaledUnit ?? row?.unit ?? "kg",
    cas: row?.cas ?? "",
    iupac: row?.iupac ?? "",
    description: row?.description ?? "",
    reference: row?.reference ?? "",
    notes: row?.notes ?? "",
    formula: row?.formula ?? "",
    ecoinventName: row?.ecoinventName ?? "",
    pubchemMatch: row?.pubchemMatch ?? null,
    linkedMoleculeId: row?.linkedMoleculeId ?? null,
    ecoinventStatus: row?.ecoinventStatus ?? "missing",
  };
}

function parseNumeric(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value ?? "")
    .replace(",", ".")
    .trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScaled(value: number) {
  return Number(value.toFixed(6)).toString();
}

function convertMassValueToKg(value: string, unit: string) {
  const numeric = parseNumeric(value);
  if (numeric === null) {
    return null;
  }

  const normalizedUnit = unit.trim().toLowerCase();
  if (!normalizedUnit || normalizedUnit === "kg") {
    return numeric;
  }
  if (normalizedUnit === "g") {
    return numeric / 1000;
  }
  if (normalizedUnit === "mg") {
    return numeric / 1_000_000;
  }
  if (normalizedUnit === "ug" || normalizedUnit === "µg" || normalizedUnit === "mcg") {
    return numeric / 1_000_000_000;
  }
  if (normalizedUnit === "t" || normalizedUnit === "ton" || normalizedUnit === "tons" || normalizedUnit === "tonne" || normalizedUnit === "tonnes") {
    return numeric * 1000;
  }
  if (normalizedUnit === "lb" || normalizedUnit === "lbs") {
    return numeric * 0.45359237;
  }
  if (normalizedUnit === "oz") {
    return numeric * 0.028349523125;
  }

  return null;
}

export function RowEditorDialog({
  open,
  project,
  currentMolecule,
  section,
  initialRow,
  onClose,
  onSave,
  onCreateChildFromRow,
}: RowEditorDialogProps) {
  const [draft, setDraft] = useState<RowDraft>(buildDraft(section, initialRow));
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(buildDraft(section, initialRow));
    setSearchQuery("");
    setBrowseOpen(false);
  }, [initialRow, open, section]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query && !browseOpen) {
      return [] as ProjectItemResult[];
    }

    const moleculeMatches: ProjectItemResult[] = project.molecules
      .filter((molecule) => molecule.id !== currentMolecule.id)
      .filter((molecule) => {
        if (!query) {
          return true;
        }
        return [molecule.name, molecule.cas, molecule.iupac, ...molecule.synonyms, ...molecule.ecoinventAliases]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .map((molecule) => ({
        kind: "molecule" as const,
        id: `molecule:${molecule.id}`,
        molecule,
      }));

    const rowMatches: RowProjectItemResult[] = project.molecules
      .filter((molecule) => molecule.id !== currentMolecule.id)
      .flatMap((molecule) =>
        molecule.rows.map((row) => ({
          kind: "row" as const,
          id: `row:${row.id}`,
          sourceMolecule: molecule,
          row,
        })),
      )
      .filter((item) => {
        if (!query) {
          return true;
        }
        return [
          item.row.name,
          ...(item.row.synonyms ?? []),
          item.row.cas,
          item.row.iupac,
          item.row.reference,
          item.row.description,
          item.sourceMolecule.name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });

    const dedupedRows = rowMatches.filter(
      (item, index) =>
        rowMatches.findIndex(
          (candidate) =>
            candidate.row.name === item.row.name &&
            candidate.row.cas === item.row.cas &&
            candidate.row.iupac === item.row.iupac,
        ) === index,
    );

    return [...moleculeMatches, ...dedupedRows].slice(0, 12);
  }, [browseOpen, currentMolecule.id, project.molecules, searchQuery]);

  const selectedMolecule = project.molecules.find((molecule) => molecule.id === draft.linkedMoleculeId) ?? null;
  const scaleFactor =
    (parseNumeric(currentMolecule.scaleTargetAmount) ?? 1) /
    Math.max(parseNumeric(currentMolecule.scaleReferenceAmount) ?? 1, Number.EPSILON);
  const rescaledPreview = (() => {
    const numeric = parseNumeric(
      draft.totalValue ||
        (() => {
          const reaction = parseNumeric(draft.reactionValue) ?? 0;
          const cleaning = parseNumeric(draft.cleaningValue) ?? 0;
          return reaction || cleaning ? reaction + cleaning : null;
        })(),
    );
    if (numeric === null) {
      return draft.totalScaledValue;
    }
    return formatScaled(numeric * scaleFactor);
  })();
  const kgConversionPreview = useMemo(() => {
    const normalizedUnit = draft.unit.trim().toLowerCase();
    const convertedTotal = convertMassValueToKg(draft.totalValue, draft.unit);
    if (!normalizedUnit || normalizedUnit === "kg" || convertedTotal === null) {
      return null;
    }

    return {
      normalizedUnit,
      total: formatScaled(convertedTotal),
    };
  }, [draft.totalValue, draft.unit]);

  if (!open) {
    return null;
  }

  const applyPubChemMatch = (match: PubChemMatch) => {
    setDraft((current) => ({
      ...current,
      name: current.name || match.title || match.iupacName || current.name,
      synonyms: getCuratedPubChemSynonymText(match),
      cas: current.cas || match.matchedCas,
      iupac: match.iupacName || current.iupac,
      formula: match.molecularFormula || current.formula,
      pubchemMatch: match,
      linkedMoleculeId: null,
    }));
    setLookupOpen(false);
  };

  const buildRowPayload = (rowId?: string) => ({
    ...(rowId ? { id: rowId } : {}),
    section: draft.section,
    name: draft.name,
    synonyms: draft.synonyms
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    reactionValue: draft.reactionValue,
    cleaningValue: draft.cleaningValue,
    totalValue: draft.totalValue,
    unit: draft.unit,
    totalScaledValue: rescaledPreview,
    scaledUnit: draft.scaledUnit || draft.unit,
    cas: draft.cas,
    iupac: draft.iupac,
    description: draft.description,
    reference: draft.reference,
    notes: draft.notes,
    formula: draft.formula,
    pubchemMatch: draft.pubchemMatch,
    linkedMoleculeId: draft.linkedMoleculeId,
    ecoinventStatus: draft.ecoinventStatus,
    ecoinventName: draft.ecoinventName,
    rawEcoinventStatus: resolutionLabels[draft.ecoinventStatus],
  });
  const handleConvertToKg = () => {
    setDraft((current) => {
      const convert = (value: string) => {
        const converted = convertMassValueToKg(value, current.unit);
        return converted === null ? value : formatScaled(converted);
      };

      return {
        ...current,
        reactionValue: convert(current.reactionValue),
        cleaningValue: convert(current.cleaningValue),
        totalValue: convert(current.totalValue),
        unit: "kg",
        scaledUnit: "kg",
      };
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 px-4 py-10 backdrop-blur-sm">
        <div className="hero-surface w-full max-w-5xl rounded-[2.2rem] border border-white/70 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">Row editor</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold text-ink">
              {initialRow ? "Edit reconstruction row" : `Add ${section.toLowerCase()} row`}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
              Search an existing molecule or enter a standalone item, then capture the quantity and traceable row data in one form.
            </p>
          </div>
          <button
            className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-mist/80 bg-lab p-4">
              <div className="text-sm font-semibold text-ink">Search and link existing molecule</div>
              <p className="mt-1 text-sm text-slate">
                Search by name, CAS, IUPAC, or synonym. Linking preserves traceability to another molecule in the project.
              </p>
              <div className="mt-3 flex flex-wrap justify-end">
                <button
                  className="mr-2 rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                  onClick={() => setBrowseOpen((current) => !current)}
                  type="button"
                >
                  {browseOpen ? "Hide project items" : "Browse project items"}
                </button>
                <button
                  className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                  onClick={() => setLookupOpen(true)}
                  type="button"
                >
                  Lookup in PubChem
                </button>
              </div>
              <input
                className="mt-3 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search existing molecules or browse the project list below"
                value={searchQuery}
              />
              {selectedMolecule ? (
                <div className="mt-3 rounded-2xl border border-accent/20 bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-ink">{selectedMolecule.name}</div>
                  <div className="mt-1 text-xs text-slate">
                    {[selectedMolecule.cas, selectedMolecule.iupac].filter(Boolean).join(" • ") || "Linked molecule"}
                  </div>
                  {selectedMolecule.ecoinventCheck?.datasetName ? (
                    <div className="mt-2 text-xs text-slate">
                      Exact ecoinvent name:{" "}
                      <span className="font-medium text-ink">{selectedMolecule.ecoinventCheck.datasetName}</span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-accent">
                      {resolutionLabels[selectedMolecule.ecoinventStatus]}
                    </span>
                    <button
                      className="rounded-full border border-mist px-3 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          linkedMoleculeId: null,
                          pubchemMatch: current.pubchemMatch,
                        }))
                      }
                      type="button"
                    >
                      Clear link
                    </button>
                  </div>
                </div>
              ) : null}
              {searchResults.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-mist/80 bg-white p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">
                    {searchQuery.trim() ? "Matching project items" : "Existing project items"}
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        className="block w-full rounded-xl border border-mist/80 bg-lab px-3 py-2 text-left transition hover:border-accent hover:bg-white"
                        onClick={() => {
                          if (item.kind === "molecule") {
                            setDraft((current) => ({
                              ...current,
                              name: item.molecule.name,
                              synonyms: item.molecule.synonyms.join(", "),
                              cas: item.molecule.cas,
                              iupac: item.molecule.iupac,
                              formula: "",
                              pubchemMatch: null,
                              linkedMoleculeId: item.molecule.id,
                              ecoinventStatus: item.molecule.ecoinventStatus,
                              ecoinventName: item.molecule.ecoinventCheck?.datasetName ?? current.ecoinventName,
                            }));
                            return;
                          }

                          setDraft((current) => ({
                            ...current,
                            name: item.row.name,
                            synonyms: (item.row.synonyms ?? []).join(", "),
                            reactionValue: current.reactionValue || item.row.reactionValue,
                            cleaningValue: current.cleaningValue || item.row.cleaningValue,
                            totalValue: current.totalValue || item.row.totalValue,
                            unit: current.unit || item.row.unit,
                            totalScaledValue: current.totalScaledValue || item.row.totalScaledValue,
                            scaledUnit: current.scaledUnit || item.row.scaledUnit,
                            cas: item.row.cas,
                            iupac: item.row.iupac,
                            formula: item.row.formula,
                            pubchemMatch: item.row.pubchemMatch ?? null,
                            linkedMoleculeId: null,
                            ecoinventStatus: item.row.ecoinventStatus,
                            ecoinventName: item.row.ecoinventName || current.ecoinventName,
                            reference: current.reference || item.row.reference,
                            description: current.description || item.row.description,
                          }));
                        }}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-ink">
                              {item.kind === "molecule" ? item.molecule.name : item.row.name}
                            </div>
                            <div className="mt-1 text-[11px] text-slate">
                              {item.kind === "molecule"
                                ? [item.molecule.cas, item.molecule.iupac].filter(Boolean).join(" • ") || "Molecule record"
                                : `${item.sourceMolecule.name} • ${item.row.section}`}
                            </div>
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate">
                            {item.kind === "molecule" ? "Molecule" : "Project row"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {draft.pubchemMatch ? (
                <div className="mt-3 rounded-2xl border border-accent/20 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-ink">
                      {draft.pubchemMatch.title || draft.pubchemMatch.iupacName}
                    </div>
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      CID {draft.pubchemMatch.cid}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate md:grid-cols-2">
                    <div><span className="font-medium text-ink">Formula:</span> {draft.pubchemMatch.molecularFormula || "—"}</div>
                    <div><span className="font-medium text-ink">CAS:</span> {draft.pubchemMatch.matchedCas || "—"}</div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Section</span>
                <select
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      section: event.target.value as ReconstructionSection,
                    }))
                  }
                  value={draft.section}
                >
                  <option value="INPUT">INPUT</option>
                  <option value="OUTPUT">OUTPUT</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Ecoinvent status</span>
                <select
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ecoinventStatus: event.target.value as ResolutionStatus,
                    }))
                  }
                  value={draft.ecoinventStatus}
                >
                  {visibleResolutionOptions.map((value) => (
                    <option key={value} value={value}>
                      {resolutionLabels[value]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Molecule / item name</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Molecule name or simple item label"
                  value={draft.name}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Synonyms</span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, synonyms: event.target.value }))}
                  placeholder="Comma-separated synonyms. PubChem matches can populate this automatically."
                  value={draft.synonyms}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Reaction amount</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, reactionValue: event.target.value }))}
                  placeholder="0.000"
                  value={draft.reactionValue}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Cleaning amount</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, cleaningValue: event.target.value }))}
                  placeholder="0.000"
                  value={draft.cleaningValue}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Total quantity</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, totalValue: event.target.value }))}
                  placeholder="Auto-calculated from reaction + cleaning if left blank"
                  value={draft.totalValue}
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Unit</span>
                  {kgConversionPreview ? (
                    <button
                      className="rounded-full border border-accent/30 bg-white px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:border-accent hover:bg-accent/5"
                      onClick={handleConvertToKg}
                      type="button"
                    >
                      Convert to kg
                    </button>
                  ) : null}
                </div>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      unit: event.target.value,
                      scaledUnit: event.target.value,
                    }))
                  }
                  placeholder="kg"
                  value={draft.unit}
                />
                {kgConversionPreview ? (
                  <div className="mt-2 rounded-2xl border border-accent/15 bg-white px-3 py-2 text-xs leading-5 text-slate">
                    Fast mass conversion detected: {draft.totalValue || "—"} {kgConversionPreview.normalizedUnit} ={" "}
                    <span className="font-semibold text-ink">{kgConversionPreview.total} kg</span>
                  </div>
                ) : null}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">CAS</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, cas: event.target.value }))}
                  placeholder="123-45-6"
                  value={draft.cas}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">IUPAC</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, iupac: event.target.value }))}
                  placeholder="IUPAC name"
                  value={draft.iupac}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Exact ecoinvent name</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, ecoinventName: event.target.value }))}
                  placeholder="Exact dataset or matching wording for this row"
                  value={draft.ecoinventName}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Description</span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short description of the row item or its role"
                  value={draft.description}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Reference</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="Patent, paper, memo, or dataset reference"
                  value={draft.reference}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Notes</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional row note"
                  value={draft.notes}
                />
              </label>

              {draft.formula ? (
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-3 text-sm text-slate md:col-span-2">
                  <span className="font-medium text-ink">Molecular formula:</span> {draft.formula}
                </div>
              ) : null}
              {draft.synonyms.trim() ? (
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-3 text-sm text-slate md:col-span-2">
                  <span className="font-medium text-ink">Visible row synonyms:</span> {draft.synonyms}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-mist/80 bg-lab p-5">
              <div className="text-sm font-semibold text-ink">Rescaling preview</div>
              <p className="mt-1 text-sm text-slate">
                Original quantity is preserved. The nearby rescaled value follows the current molecule scaling basis.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Reference basis</div>
                  <div className="mt-1 text-sm text-ink">
                    {currentMolecule.scaleReferenceAmount} {currentMolecule.scaleUnit}
                  </div>
                </div>
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Target basis</div>
                  <div className="mt-1 text-sm text-ink">
                    {currentMolecule.scaleTargetAmount} {currentMolecule.scaleUnit}
                  </div>
                </div>
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Original total</div>
                  <div className="mt-1 text-sm text-ink">
                    {draft.totalValue || "—"} {draft.unit || ""}
                  </div>
                </div>
                <div className="rounded-2xl border border-accent/20 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Rescaled quantity</div>
                  <div className="mt-1 text-sm font-semibold text-ink">
                    {rescaledPreview || "—"} {draft.scaledUnit || draft.unit || ""}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-mist/80 bg-lab p-5 text-sm text-slate">
              <div className="font-semibold text-ink">Linked molecule traceability</div>
              <p className="mt-2">
                {selectedMolecule
                  ? "This row will preserve a direct traceability link to another molecule in the project hierarchy."
                  : "Leave the row unlinked for utilities, plain named items, or materials that do not correspond to a created molecule record."}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {draft.section === "INPUT" ? (
            <button
              className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
              onClick={() => {
                const targetRowId = initialRow?.id ?? makeClientId("row");
                const payload = buildRowPayload(targetRowId);
                onSave(payload, initialRow?.id);
                onCreateChildFromRow(targetRowId, payload, {
                  name: draft.name,
                  cas: draft.cas,
                  iupac: draft.iupac,
                  synonyms: draft.pubchemMatch ? getCuratedPubChemSynonymText(draft.pubchemMatch) : "",
                  ecoinventAliases: draft.ecoinventName,
                  notes: draft.notes,
                  ecoinventStatus: draft.ecoinventStatus,
                  topLevel: false,
                  parentMoleculeId: "",
                  pubchemMatch: draft.pubchemMatch ?? null,
                });
              }}
              type="button"
            >
              Create linked child molecule
            </button>
          ) : null}
          <button
            className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink"
            onClick={() => onSave(buildRowPayload(), initialRow?.id)}
            type="button"
          >
            {initialRow ? "Save row" : `Add ${draft.section.toLowerCase()} row`}
          </button>
        </div>
      </div>
      </div>

      <PubChemLookupDialog
        initialQuery={draft.cas || draft.name || draft.iupac}
        onClose={() => setLookupOpen(false)}
        onSelect={applyPubChemMatch}
        open={lookupOpen}
        title="Lookup row identity in PubChem"
      />
    </>
  );
}
