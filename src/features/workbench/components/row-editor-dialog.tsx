"use client";

import { useEffect, useMemo, useState } from "react";

import { EcoinventLookupDialog } from "@/features/workbench/components/ecoinvent-lookup-dialog";
import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { resolutionLabels } from "@/features/workbench/display";
import { makeClientId } from "@/features/workbench/state-utils";
import { getCuratedPubChemSynonymText } from "@/features/workbench/pubchem";
import type {
  EcoinventDatasetMatch,
  MoleculeDraft,
  MoleculeRecord,
  ProjectRecord,
  PubChemMatch,
  ReconstructionRow,
  ReconstructionSection,
  ObjectKind,
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
  objectKind: ObjectKind;
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
  smiles: string;
  description: string;
  reference: string;
  notes: string;
  formula: string;
  ecoinventDatasetId: string;
  ecoinventDatasetUuid: string;
  ecoinventGeography: string;
  ecoinventName: string;
  ecoinventReferenceProduct: string;
  ecoinventUnit: string;
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
  const fallbackAmount = (() => {
    const reaction = parseNumeric(row?.reactionValue) ?? 0;
    const cleaning = parseNumeric(row?.cleaningValue) ?? 0;
    return reaction || cleaning ? formatScaled(reaction + cleaning) : "";
  })();

  return {
    section: row?.section ?? section,
    objectKind: row?.objectKind ?? "generic_object",
    name: row?.name ?? "",
    synonyms: row?.synonyms.join(", ") ?? "",
    reactionValue: row?.reactionValue ?? "",
    cleaningValue: row?.cleaningValue ?? "",
    totalValue: row?.totalValue || fallbackAmount,
    unit: row?.unit ?? "kg",
    totalScaledValue: row?.totalScaledValue ?? "",
    scaledUnit: row?.scaledUnit ?? row?.unit ?? "kg",
    cas: row?.cas ?? "",
    iupac: row?.iupac ?? "",
    smiles: row?.smiles ?? "",
    description: row?.description ?? "",
    reference: row?.reference ?? "",
    notes: row?.notes ?? "",
    formula: row?.formula ?? "",
    ecoinventDatasetId: row?.ecoinventDatasetId ?? "",
    ecoinventDatasetUuid: row?.ecoinventDatasetUuid ?? "",
    ecoinventGeography: row?.ecoinventGeography ?? "",
    ecoinventName: row?.ecoinventName ?? "",
    ecoinventReferenceProduct: row?.ecoinventReferenceProduct ?? "",
    ecoinventUnit: row?.ecoinventUnit ?? "",
    pubchemMatch: row?.pubchemMatch ?? null,
    linkedMoleculeId: row?.linkedMoleculeId ?? null,
    ecoinventStatus: row?.ecoinventStatus ?? "unchecked",
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

function StepPill({
  index,
  label,
  complete,
  active,
  locked,
}: {
  index: number;
  label: string;
  complete: boolean;
  active: boolean;
  locked: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition ${
        complete
          ? "border-accent/25 bg-accent/10 text-accent"
          : active
            ? "border-ink/20 bg-white text-ink shadow-sm"
            : locked
              ? "border-mist bg-lab text-slate/55"
              : "border-mist bg-white text-slate"
      }`}
    >
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-semibold ${
          complete
            ? "bg-accent text-white"
            : active
              ? "bg-ink text-white"
              : "bg-white text-slate ring-1 ring-mist"
        }`}
      >
        {complete ? "OK" : index}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11px] text-slate">
          {complete ? "Complete" : locked ? "Later" : active ? "Now" : "Optional"}
        </span>
      </span>
    </div>
  );
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
  const [reuseSearchOpen, setReuseSearchOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [ecoinventLookupOpen, setEcoinventLookupOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(buildDraft(section, initialRow));
    setSearchQuery("");
    setReuseSearchOpen(false);
    setEcoinventLookupOpen(false);
  }, [initialRow, open, section]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

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
        molecule.rows
          .filter((row) => row.id !== initialRow?.id)
          .map((row) => ({
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
  }, [currentMolecule.id, initialRow?.id, project.molecules, searchQuery]);

  const selectedMolecule = project.molecules.find((molecule) => molecule.id === draft.linkedMoleculeId) ?? null;
  const referenceProductName = currentMolecule.referenceProductName || currentMolecule.name;
  const isReferenceOutputRow =
    draft.section === "OUTPUT" &&
    ((initialRow?.order === 1 && draft.name.trim() === referenceProductName.trim()) ||
      (!initialRow && draft.name.trim() === referenceProductName.trim()));
  const isLinkedProjectItem = Boolean(draft.linkedMoleculeId);
  const scaleFactor =
    (parseNumeric(currentMolecule.scaleTargetAmount) ?? 1) /
    Math.max(parseNumeric(currentMolecule.scaleReferenceAmount) ?? 1, Number.EPSILON);
  const rescaledPreview = (() => {
    const numeric = parseNumeric(draft.totalValue);
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
  const identityComplete = draft.name.trim().length > 0;
  const parsedAmount = parseNumeric(draft.totalValue);
  const amountInvalid = draft.totalValue.trim().length > 0 && parsedAmount === null;
  const unitComplete = draft.unit.trim().length > 0;
  const requiredDetailsComplete = identityComplete && unitComplete && !amountInvalid;
  const ecoinventDecisionComplete =
    isReferenceOutputRow ||
    isLinkedProjectItem ||
    draft.ecoinventStatus === "present" ||
    draft.ecoinventStatus === "missing";
  const hasEcoinventMatch = Boolean(draft.ecoinventDatasetId || draft.ecoinventDatasetUuid);
  const userUnit = draft.unit.trim();
  const ecoinventUnit = draft.ecoinventUnit.trim();
  const hasUnitMismatch =
    Boolean(userUnit && ecoinventUnit) && userUnit.toLowerCase() !== ecoinventUnit.toLowerCase();
  const canEditEcoinvent = identityComplete && !isReferenceOutputRow && !isLinkedProjectItem;
  const canEditDocumentation = identityComplete;
  const canSave = requiredDetailsComplete;
  const rowEditorSteps = [
    {
      label: "Required details",
      complete: requiredDetailsComplete,
      active: !requiredDetailsComplete,
      locked: false,
    },
    {
      label: "Ecoinvent",
      complete: ecoinventDecisionComplete,
      active: canEditEcoinvent && requiredDetailsComplete && !ecoinventDecisionComplete,
      locked: false,
    },
    {
      label: "Notes",
      complete: Boolean(draft.description.trim() || draft.reference.trim() || draft.notes.trim()),
      active: canEditDocumentation && canSave,
      locked: false,
    },
  ];

  if (!open) {
    return null;
  }

  const applyPubChemMatch = (match: PubChemMatch) => {
    setDraft((current) => ({
      ...current,
      name: current.name || match.title || match.iupacName || current.name,
      objectKind: "molecule",
      synonyms: getCuratedPubChemSynonymText(match),
      cas: current.cas || match.matchedCas,
      iupac: match.iupacName || current.iupac,
      smiles: current.smiles || match.canonicalSmiles || current.smiles,
      formula: match.molecularFormula || current.formula,
      pubchemMatch: match,
      linkedMoleculeId: null,
    }));
    setLookupOpen(false);
  };

  const applyEcoinventMatch = (match: EcoinventDatasetMatch) => {
    setDraft((current) => ({
      ...current,
      ecoinventStatus: "present",
      ecoinventDatasetId: match.datasetId,
      ecoinventDatasetUuid: match.datasetUuid,
      ecoinventGeography: match.geography,
      ecoinventName: match.exactName,
      ecoinventReferenceProduct: match.referenceProduct,
      ecoinventUnit: match.unit,
    }));
    setEcoinventLookupOpen(false);
  };

  const markMissingFromEcoinvent = () => {
    setDraft((current) => ({
      ...current,
      ecoinventStatus: "missing",
      ecoinventDatasetId: "",
      ecoinventDatasetUuid: "",
      ecoinventGeography: "",
      ecoinventName: "",
      ecoinventReferenceProduct: "",
      ecoinventUnit: "",
    }));
  };

  const buildRowPayload = (rowId?: string) => ({
    ...(rowId ? { id: rowId } : {}),
    section: draft.section,
    objectKind: draft.objectKind,
    name: draft.name,
    synonyms: draft.synonyms
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    reactionValue: "",
    cleaningValue: "",
    totalValue: draft.totalValue,
    unit: draft.unit,
    totalScaledValue: rescaledPreview,
    scaledUnit: draft.scaledUnit || draft.unit,
    cas: draft.objectKind === "molecule" ? draft.cas : "",
    iupac: draft.objectKind === "molecule" ? draft.iupac : "",
    smiles: draft.objectKind === "molecule" ? draft.smiles : "",
    description: draft.description,
    reference: draft.reference,
    notes: draft.notes,
    formula: draft.objectKind === "molecule" ? draft.formula : "",
    pubchemMatch: draft.objectKind === "molecule" ? draft.pubchemMatch : null,
    linkedMoleculeId: draft.linkedMoleculeId,
    ecoinventStatus: isLinkedProjectItem ? "missing" : draft.ecoinventStatus,
    ecoinventDatasetId: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventDatasetId,
    ecoinventDatasetUuid: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventDatasetUuid,
    ecoinventGeography: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventGeography,
    ecoinventName: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventName,
    ecoinventReferenceProduct: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventReferenceProduct,
    ecoinventUnit: isLinkedProjectItem || isReferenceOutputRow ? "" : draft.ecoinventUnit,
    rawEcoinventStatus: isReferenceOutputRow ? "OK" : resolutionLabels[isLinkedProjectItem ? "missing" : draft.ecoinventStatus],
  });
  const handleConvertToKg = () => {
    setDraft((current) => {
      const converted = convertMassValueToKg(current.totalValue, current.unit);

      return {
        ...current,
        totalValue: converted === null ? current.totalValue : formatScaled(converted),
        unit: "kg",
        scaledUnit: "kg",
      };
    });
  };
  const createLinkedActivityFromInput = () => {
    const targetRowId = initialRow?.id ?? makeClientId("row");
    const payload = buildRowPayload(targetRowId);
    const childIsMolecule = draft.objectKind === "molecule";

    onCreateChildFromRow(targetRowId, payload, {
      objectKind: draft.objectKind,
      activityType: "Production of",
      referenceProductName: draft.name,
      name: draft.name,
      cas: childIsMolecule ? draft.cas : "",
      iupac: childIsMolecule ? draft.iupac : "",
      smiles: childIsMolecule ? draft.smiles : "",
      synonyms: childIsMolecule && draft.pubchemMatch ? getCuratedPubChemSynonymText(draft.pubchemMatch) : draft.synonyms,
      ecoinventAliases: draft.ecoinventName,
      notes: draft.notes,
      ecoinventStatus: draft.ecoinventStatus,
      topLevel: false,
      parentMoleculeId: "",
      pubchemMatch: childIsMolecule ? draft.pubchemMatch ?? null : null,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 px-4 py-6 backdrop-blur-sm">
        <div className="hero-surface flex max-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-white/70 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-mist/80 bg-white/90 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-sm font-semibold text-slate">{draft.section === "INPUT" ? "Input flow" : "Output flow"}</div>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              {initialRow ? "Edit reconstruction row" : `Add ${section.toLowerCase()} row`}
            </h2>
            <div className="mt-1 text-sm text-slate">Name and unit are enough to save. A missing quantity is kept as a review warning.</div>
          </div>
          <button
            className="rounded-md border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="border-b border-mist/80 bg-lab/80 p-4 lg:sticky lg:top-0 lg:h-full lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              {rowEditorSteps.map((step, index) => (
                <StepPill
                  active={step.active}
                  complete={step.complete}
                  index={index + 1}
                  key={step.label}
                  label={step.label}
                  locked={step.locked}
                />
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-mist/80 bg-white p-3 text-sm">
              <div className="font-semibold text-ink">Save condition</div>
              <div className="mt-1 text-xs leading-5 text-slate">
                Enter a name, amount, and unit to save. Dataset matching and notes can be completed now or later.
              </div>
            </div>
          </aside>

        <div className="space-y-4 p-4 pb-24 sm:p-5 sm:pb-24">
          <section className="rounded-lg border border-mist/80 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="section-title">Required</div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Core flow details</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Item type</span>
                <select
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      objectKind: event.target.value === "generic_object" ? "generic_object" : "molecule",
                      pubchemMatch: event.target.value === "generic_object" ? null : current.pubchemMatch,
                    }))
                  }
                  value={draft.objectKind}
                >
                  <option value="generic_object">Generic Object</option>
                  <option value="molecule">Molecule</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">
                  {draft.objectKind === "generic_object" ? "Object name" : "Molecule name"}
                </span>
                <input
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={draft.objectKind === "generic_object" ? "Object name" : "Molecule name"}
                  value={draft.name}
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">Amount</span>
                <input
                  className={`mt-2 w-full rounded-lg border bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent ${
                    amountInvalid ? "border-alert" : "border-mist"
                  }`}
                  onChange={(event) => setDraft((current) => ({ ...current, totalValue: event.target.value }))}
                  placeholder="0.000"
                  value={draft.totalValue}
                />
                {amountInvalid ? <div className="mt-2 text-xs font-semibold text-alert">Use a numeric value such as 1, 0.25, or 3.5.</div> : null}
              </label>

              <label className="block">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Unit</span>
                  {kgConversionPreview ? (
                    <button
                      className="rounded-md border border-accent/30 bg-white px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:border-accent hover:bg-accent/5"
                      onClick={handleConvertToKg}
                      type="button"
                    >
                      Convert to kg
                    </button>
                  ) : null}
                </div>
                <input
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
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
                  <div className="mt-2 rounded-lg border border-accent/15 bg-white px-3 py-2 text-xs leading-5 text-slate">
                    Fast mass conversion detected: {draft.totalValue || "-"} {kgConversionPreview.normalizedUnit} ={" "}
                    <span className="font-semibold text-ink">{kgConversionPreview.total} kg</span>
                  </div>
                ) : null}
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {draft.objectKind === "molecule" ? (
                <button
                  className="rounded-md border border-mist/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
                  onClick={() => setLookupOpen(true)}
                  type="button"
                >
                  Lookup in PubChem
                </button>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border border-mist/80 bg-lab p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Reuse an existing project item</div>
                  <div className="mt-1 text-xs text-slate">Optional: search previous activities or rows to avoid retyping names and identifiers.</div>
                </div>
                {reuseSearchOpen ? (
                  <button
                    className="rounded-md border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
                    onClick={() => {
                      setReuseSearchOpen(false);
                      setSearchQuery("");
                    }}
                    type="button"
                  >
                    Hide search
                  </button>
                ) : (
                  <button
                    className="rounded-md border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
                    onClick={() => setReuseSearchOpen(true)}
                    type="button"
                  >
                    Search
                  </button>
                )}
              </div>
              {reuseSearchOpen ? (
                <input
                  className="w-full rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search existing project items"
                  value={searchQuery}
                />
              ) : null}
              {selectedMolecule ? (
                <div className="mt-3 rounded-lg border border-accent/20 bg-white px-4 py-3">
                  <div className="text-sm font-semibold text-ink">{selectedMolecule.name}</div>
                  <div className="mt-1 text-xs text-slate">
                    {[
                      selectedMolecule.objectKind === "generic_object" ? "Generic Object" : "Molecule",
                      selectedMolecule.cas,
                      selectedMolecule.iupac,
                    ].filter(Boolean).join(" • ") || "Linked item"}
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
                      className="rounded-md border border-mist px-3 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
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
              {reuseSearchOpen && searchResults.length > 0 ? (
                <div className="mt-3 rounded-lg border border-mist/80 bg-white p-3">
                  <div className="text-[11px] font-semibold text-slate">
                    {searchQuery.trim() ? "Matching project items" : "Existing project items"}
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        className="block w-full rounded-lg border border-mist/80 bg-lab px-3 py-2 text-left transition hover:border-accent hover:bg-white"
                        onClick={() => {
                          if (item.kind === "molecule") {
                            setDraft((current) => ({
                              ...current,
                              objectKind: item.molecule.objectKind,
                              name: item.molecule.name,
                              synonyms: item.molecule.synonyms.join(", "),
                              cas: item.molecule.cas,
                              iupac: item.molecule.iupac,
                              smiles: item.molecule.smiles,
                              formula: "",
                              pubchemMatch: null,
                              linkedMoleculeId: item.molecule.id,
                              ecoinventStatus: "missing",
                              ecoinventDatasetId: "",
                              ecoinventDatasetUuid: "",
                              ecoinventGeography: "",
                              ecoinventName: "",
                              ecoinventReferenceProduct: "",
                              ecoinventUnit: "",
                            }));
                            return;
                          }

                          setDraft((current) => ({
                            ...current,
                            objectKind: item.row.objectKind,
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
                            smiles: item.row.smiles,
                            formula: item.row.formula,
                            pubchemMatch: item.row.pubchemMatch ?? null,
                            linkedMoleculeId: null,
                            ecoinventStatus: item.row.ecoinventStatus,
                            ecoinventDatasetId: item.row.ecoinventDatasetId || current.ecoinventDatasetId,
                            ecoinventDatasetUuid: item.row.ecoinventDatasetUuid || current.ecoinventDatasetUuid,
                            ecoinventGeography: item.row.ecoinventGeography || current.ecoinventGeography,
                            ecoinventName: item.row.ecoinventName || current.ecoinventName,
                            ecoinventReferenceProduct: item.row.ecoinventReferenceProduct || current.ecoinventReferenceProduct,
                            ecoinventUnit: item.row.ecoinventUnit || current.ecoinventUnit,
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
                          <div className="text-[10px] font-semibold text-slate">
                            {item.kind === "molecule"
                              ? item.molecule.objectKind === "generic_object"
                                ? "Generic Object"
                                : "Molecule"
                              : "Project row"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {draft.pubchemMatch ? (
                <div className="mt-3 rounded-lg border border-accent/20 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-ink">
                      {draft.pubchemMatch.title || draft.pubchemMatch.iupacName}
                    </div>
                    <span className="rounded-md border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      CID {draft.pubchemMatch.cid}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-slate md:grid-cols-2">
                    <div><span className="font-medium text-ink">Formula:</span> {draft.pubchemMatch.molecularFormula || "-"}</div>
                    <div><span className="font-medium text-ink">CAS:</span> {draft.pubchemMatch.matchedCas || "-"}</div>
                  </div>
                </div>
              ) : null}

            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {draft.objectKind === "molecule" ? (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">CAS</span>
                    <input
                      className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) => setDraft((current) => ({ ...current, cas: event.target.value }))}
                      placeholder="123-45-6"
                      value={draft.cas}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">IUPAC</span>
                    <input
                      className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) => setDraft((current) => ({ ...current, iupac: event.target.value }))}
                      placeholder="IUPAC name"
                      value={draft.iupac}
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-ink">SMILES</span>
                    <input
                      className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 font-mono text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) => setDraft((current) => ({ ...current, smiles: event.target.value }))}
                      placeholder="Canonical SMILES"
                      value={draft.smiles}
                    />
                  </label>
                </>
              ) : null}
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Synonyms</span>
	                <textarea
	                  className="mt-2 min-h-20 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
	                  onChange={(event) => setDraft((current) => ({ ...current, synonyms: event.target.value }))}
	                  placeholder={
	                    draft.objectKind === "molecule"
	                      ? "Comma-separated synonyms. PubChem matches can populate this automatically."
	                      : "Comma-separated synonyms"
	                  }
	                  value={draft.synonyms}
	                />
              </label>
            </div>
          </section>

	          <section className="rounded-lg border border-mist/80 bg-white/80 p-5 shadow-sm transition">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="section-title">Ecoinvent dataset</div>
                <h3 className="mt-2 text-lg font-semibold text-ink">Dataset decision</h3>
	                {!identityComplete ? <p className="mt-2 text-sm text-slate">Enter the item name before selecting ecoinvent.</p> : null}
	                {isReferenceOutputRow ? (
	                  <p className="mt-2 text-sm text-slate">
	                    This is the reference product for this activity. No ecoinvent match is required here.
	                  </p>
	                ) : null}
	                {isLinkedProjectItem ? (
	                  <p className="mt-2 text-sm text-slate">
	                    This row is connected to an existing project item. The ecoinvent decision is locked and treated as internally modelled.
	                  </p>
	                ) : null}
	              </div>
	              <div className="flex flex-wrap gap-2">
	                <button
	                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45"
	                  disabled={!canEditEcoinvent}
	                  onClick={() => setEcoinventLookupOpen(true)}
	                  type="button"
	                >
	                  Search ecoinvent
	                </button>
	                <button
	                  className="rounded-md border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-alert/30 hover:text-alert disabled:cursor-not-allowed disabled:opacity-45"
	                  disabled={!canEditEcoinvent}
	                  onClick={markMissingFromEcoinvent}
	                  type="button"
	                >
                  Mark as missing from ecoinvent
                </button>
              </div>
            </div>
	            {isReferenceOutputRow ? (
	              <div className="mt-4 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
	                Reference product output
	              </div>
	            ) : isLinkedProjectItem ? (
	              <div className="mt-4 rounded-lg border border-mist bg-lab px-4 py-3 text-sm leading-6 text-slate">
	                Internally modelled through <span className="font-semibold text-ink">{selectedMolecule?.name || "linked project item"}</span>.
	              </div>
	            ) : hasEcoinventMatch ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-lg border border-accent/20 bg-lab px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate">
                    Exact ecoinvent name
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink">{draft.ecoinventName || "-"}</div>
                </div>
                <div className="rounded-lg border border-mist/80 bg-lab px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate">
                    Geography / reference product
                  </div>
                  <div className="mt-1 text-sm text-ink">
                    {[draft.ecoinventGeography, draft.ecoinventReferenceProduct, draft.ecoinventUnit]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </div>
                </div>
                {hasUnitMismatch ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    Unit mismatch: the row uses <span className="font-semibold">{userUnit}</span>, while the selected
                    ecoinvent dataset uses <span className="font-semibold">{ecoinventUnit}</span>. Check whether the
                    amount must be converted before using this dataset.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-mist bg-lab px-4 py-5 text-sm leading-6 text-slate">
                {draft.ecoinventStatus === "missing"
                  ? "Marked as missing from ecoinvent. If this input needs modelling, create an activity for this input."
                  : "No ecoinvent dataset selected yet. Search ecoinvent, or mark the item as missing."}
              </div>
            )}
	            {draft.section === "INPUT" && draft.ecoinventStatus === "missing" && !isLinkedProjectItem ? (
              <button
                className="mt-4 rounded-md border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                onClick={createLinkedActivityFromInput}
                type="button"
              >
                Create activity for this input
              </button>
            ) : null}
          </section>

          <section
            className={`rounded-lg border border-mist/80 bg-white/80 p-5 shadow-sm transition ${
              canEditDocumentation ? "" : "pointer-events-none opacity-45"
            }`}
          >
            <div className="section-title">Documentation</div>
            <h3 className="mt-2 text-lg font-semibold text-ink">Description, reference, and notes</h3>
            {!canEditDocumentation ? (
              <p className="mt-2 text-sm text-slate">
                Enter the item name before documenting the row.
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">
                  Description of the {draft.objectKind === "generic_object" ? "Object" : "molecule"}
                </span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short description of the row item or its role"
                  value={draft.description}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Reference</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="Patent, paper, memo, or dataset reference"
                  value={draft.reference}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Notes</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional row note"
                  value={draft.notes}
                />
              </label>
            </div>
          </section>
        </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-mist/80 bg-white/90 px-5 py-4">
          <div className="text-sm text-slate">
            {canSave
              ? draft.totalValue.trim()
                ? "Ready to save"
                : "Ready to save with missing quantity warning"
              : amountInvalid
                ? "Fix the amount before saving"
                : "Name and unit are required"}
          </div>
          <div className="flex items-center gap-3">
          <button
            className="rounded-md border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:bg-slate/40"
            disabled={!canSave}
            onClick={() => {
              if (!canSave) {
                return;
              }
              const targetRowId = initialRow?.id ?? makeClientId("row");
              onSave(buildRowPayload(targetRowId), initialRow?.id);
            }}
            type="button"
          >
            {initialRow ? "Save row" : `Save ${draft.section.toLowerCase()} row`}
          </button>
          </div>
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
      <EcoinventLookupDialog
        initialQuery={draft.ecoinventName || draft.name || draft.cas || draft.iupac}
        onClose={() => setEcoinventLookupOpen(false)}
        onSelect={applyEcoinventMatch}
        open={ecoinventLookupOpen}
      />
    </>
  );
}
