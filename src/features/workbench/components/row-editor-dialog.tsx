"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { EcoinventLookupDialog } from "@/features/workbench/components/ecoinvent-lookup-dialog";
import { CreateMoleculeDialog } from "@/features/workbench/components/create-molecule-dialog";
import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { resolutionLabels } from "@/features/workbench/display";
import { makeClientId } from "@/features/workbench/state-utils";
import { getCuratedPubChemSynonymText } from "@/features/workbench/pubchem";
import { getAncestorIds } from "@/features/workbench/selectors";
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
  initialPanel?: "details" | "dataset" | "notes";
  initialField?: string;
  onClose: () => void;
  onSave: (values: Partial<ReconstructionRow> & { section: ReconstructionSection }, rowId?: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: ReconstructionSection },
    draft: Partial<MoleculeDraft>,
  ) => string;
  onOpenMolecule: (moleculeId: string) => void;
  onImportActivityFromFile: (file: File, rowId: string, values: Partial<ReconstructionRow> & { section: ReconstructionSection }) => Promise<void>;
};

type RowDraft = {
  section: ReconstructionSection;
  objectKind: ObjectKind;
  name: string;
  synonyms: string;
  reactionValue: string;
  cleaningValue: string;
  totalValue: string;
  uncertaintyEnabled: boolean;
  minimumValue: string;
  maximumValue: string;
  amountSource: ReconstructionRow["amountSource"];
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
    uncertaintyEnabled: row?.uncertaintyEnabled ?? false,
    minimumValue: row?.minimumValue ?? "",
    maximumValue: row?.maximumValue ?? "",
    amountSource: row?.amountSource ?? "",
    unit: row?.unit ?? "",
    totalScaledValue: row?.totalScaledValue ?? "",
    scaledUnit: row?.scaledUnit ?? row?.unit ?? "",
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

function normalizeUnitForComparison(unit: string) {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "item(s)": "item",
    items: "item",
    unit: "item",
    units: "item",
    kilogram: "kg",
    kilograms: "kg",
    gram: "g",
    grams: "g",
    litre: "l",
    litres: "l",
    liter: "l",
    liters: "l",
    "m^3": "m3",
    "m³": "m3",
  };
  return aliases[normalized] ?? normalized;
}

function EditorSectionTab({
  label,
  active,
  completed,
  index,
  status,
  onClick,
}: {
  label: string;
  active: boolean;
  completed: boolean;
  index: number;
  status?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-[4.25rem] w-full min-w-[10rem] items-center gap-3 rounded-sm border px-3 py-3 text-left text-sm transition lg:min-w-0 ${
        active ? "border-slate/60 bg-white/5 text-ink" : "border-transparent text-slate hover:bg-white/[0.035] hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${completed ? "border-slate text-ink" : "border-mist text-slate"}`}>{completed ? "✓" : index}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span>{status ? <span className="mt-0.5 block text-[10px] font-normal text-slate">{status}</span> : null}</span>
    </button>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m7 7 1 13h8l1-13" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function DataSourceOption({
  actionLabel,
  description,
  disabled,
  onRemove,
  onSelect,
  removeLabel,
  selected,
  title,
  tutorialId,
}: {
  actionLabel: string;
  description: string;
  disabled: boolean;
  onRemove: () => void;
  onSelect: () => void;
  removeLabel: string;
  selected: boolean;
  title: string;
  tutorialId?: string;
}) {
  return (
    <div className={`flex items-stretch rounded-sm border transition ${selected ? "border-slate bg-white/5" : disabled ? "border-mist/45 opacity-45" : "border-mist/60 hover:bg-white/[0.035]"}`} data-tutorial={tutorialId}>
      <button
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-left text-sm text-slate disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-xs">{description}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-ink">{selected ? "Selected" : disabled ? "Locked" : actionLabel}</span>
      </button>
      {selected ? (
        <div className="flex items-center border-l border-alert/25 px-2">
          <button
            aria-label={removeLabel}
            className="grid h-9 w-9 place-items-center rounded-sm border border-alert/50 bg-alert/10 text-alert transition hover:border-alert hover:bg-alert/20"
            onClick={onRemove}
            title={removeLabel}
            type="button"
          >
            <TrashIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function RowEditorDialog({
  open,
  project,
  currentMolecule,
  section,
  initialRow,
  initialPanel = "details",
  initialField,
  onClose,
  onSave,
  onCreateChildFromRow,
  onOpenMolecule,
  onImportActivityFromFile,
}: RowEditorDialogProps) {
  const [draft, setDraft] = useState<RowDraft>(buildDraft(section, initialRow));
  const [searchQuery, setSearchQuery] = useState("");
  const [reuseSearchOpen, setReuseSearchOpen] = useState(false);
  const [activityConnectionMode, setActivityConnectionMode] = useState<"existing" | "import">("existing");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [ecoinventLookupOpen, setEcoinventLookupOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"details" | "dataset" | "notes">("details");
  const [linkedActivityNotice, setLinkedActivityNotice] = useState<string | null>(null);
  const [createdRowId, setCreatedRowId] = useState<string | null>(null);
  const [nameTipOpen, setNameTipOpen] = useState(false);
  const [amountSourceHelpOpen, setAmountSourceHelpOpen] = useState(false);
  const [createLinkedActivityOpen, setCreateLinkedActivityOpen] = useState(false);
  const [importingActivity, setImportingActivity] = useState(false);
  const [importActivityError, setImportActivityError] = useState("");
  const [highlightedField, setHighlightedField] = useState("");
  const importActivityInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(buildDraft(section, initialRow));
    setSearchQuery("");
    setReuseSearchOpen(false);
    setActivityConnectionMode("existing");
    setEcoinventLookupOpen(false);
    setActivePanel(initialPanel);
    setLinkedActivityNotice(null);
    setCreatedRowId(null);
    setNameTipOpen(false);
    setAmountSourceHelpOpen(false);
    setCreateLinkedActivityOpen(false);
    setImportingActivity(false);
    setImportActivityError("");
    setHighlightedField(initialField ?? "");
  }, [initialField, initialPanel, initialRow, open, section]);

  useEffect(() => {
    if (!open || !highlightedField) return;
    const revealTimer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-project-issue-field~="${highlightedField}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusTarget = target?.matches("input, textarea, select, button")
        ? target
        : target?.querySelector<HTMLElement>("input, textarea, select, button");
      focusTarget?.focus({ preventScroll: true });
    }, 0);
    const clearTimer = window.setTimeout(() => setHighlightedField(""), 2400);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedField, open]);

  useEffect(() => {
    const handleTutorialStep = (event: Event) => {
      const step = (event as CustomEvent<{ step: number }>).detail?.step;
      if (typeof step !== "number") return;
      if (step <= 8) {
        onClose();
        return;
      }
      if (step === 9) {
        setEcoinventLookupOpen(false);
        setActivePanel("details");
      } else if (step === 10 || step === 11) {
        setEcoinventLookupOpen(false);
        setActivePanel("dataset");
      } else if (step === 12) {
        setActivePanel("dataset");
        setEcoinventLookupOpen(true);
      } else if (step === 14) {
        setEcoinventLookupOpen(false);
        setActivePanel("dataset");
      } else if (step === 15) {
        setEcoinventLookupOpen(false);
        setActivePanel("notes");
      }
    };
    window.addEventListener("lci:tutorial-step", handleTutorialStep);
    return () => window.removeEventListener("lci:tutorial-step", handleTutorialStep);
  }, [onClose]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const ancestorIds = getAncestorIds(project, currentMolecule.id);

    const moleculeMatches: ProjectItemResult[] = project.molecules
      .filter((molecule) => molecule.id !== currentMolecule.id && !ancestorIds.has(molecule.id))
      .filter((molecule) => {
        if (!query) {
          return true;
        }
        return [
          molecule.name,
          molecule.activityType,
          molecule.referenceProductName,
          molecule.cas,
          molecule.iupac,
          ...molecule.synonyms,
          ...molecule.ecoinventAliases,
        ]
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
  }, [currentMolecule.id, initialRow?.id, project, searchQuery]);

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
  const parsedMinimum = parseNumeric(draft.minimumValue);
  const parsedMaximum = parseNumeric(draft.maximumValue);
  const uncertaintyInvalid =
    draft.uncertaintyEnabled &&
    (parsedMinimum === null || parsedMaximum === null || parsedMinimum > parsedMaximum);
  const referenceAmountInvalid = isReferenceOutputRow && (parsedAmount === null || parsedAmount <= 0);
  const unitComplete = draft.unit.trim().length > 0;
  const requiredDetailsComplete = identityComplete && unitComplete && !amountInvalid && !referenceAmountInvalid && !uncertaintyInvalid;
  const hasEcoinventMatch = Boolean(draft.ecoinventDatasetId || draft.ecoinventDatasetUuid);
  const userUnit = draft.unit.trim();
  const ecoinventUnit = draft.ecoinventUnit.trim();
  const hasUnitMismatch =
    Boolean(userUnit && ecoinventUnit) && normalizeUnitForComparison(userUnit) !== normalizeUnitForComparison(ecoinventUnit);
  const selectedDataSource = isLinkedProjectItem
    ? "activity"
    : hasEcoinventMatch
      ? "ecoinvent"
      : draft.ecoinventStatus === "missing"
        ? "missing"
        : null;
  const canEditEcoinvent = identityComplete && !isReferenceOutputRow;
  const canEditDocumentation = identityComplete;
  const canSave = requiredDetailsComplete && !hasUnitMismatch;
  const dataSourceComplete = isReferenceOutputRow || selectedDataSource !== null;
  useEffect(() => {
    if (!open || !selectedDataSource) return;
    setReuseSearchOpen(false);
    setSearchQuery("");
  }, [open, selectedDataSource]);
  const rowEditorSteps = [
    {
      id: "details" as const,
      label: "Details",
    },
    {
      id: "dataset" as const,
      label: "Data source",
    },
    {
      id: "notes" as const,
      label: "Documentation",
    },
  ];

  if (!open) {
    return null;
  }

  const applyPubChemMatch = (match: PubChemMatch) => {
    setDraft((current) => ({
      ...current,
      name: match.title || match.iupacName || current.name,
      objectKind: "molecule",
      synonyms: getCuratedPubChemSynonymText(match),
      cas: match.matchedCas,
      iupac: match.iupacName,
      smiles: match.canonicalSmiles,
      formula: match.molecularFormula,
      pubchemMatch: match,
    }));
    setLookupOpen(false);
  };

  const applyEcoinventMatch = (match: EcoinventDatasetMatch) => {
    if (selectedDataSource && selectedDataSource !== "ecoinvent") return;
    setDraft((current) => ({
      ...current,
      linkedMoleculeId: null,
      ecoinventStatus: "present",
      ecoinventDatasetId: match.datasetId,
      ecoinventDatasetUuid: match.datasetUuid,
      ecoinventGeography: match.geography,
      ecoinventName: match.exactName,
      ecoinventReferenceProduct: match.referenceProduct,
      ecoinventUnit: match.unit,
    }));
    setLinkedActivityNotice(null);
    setReuseSearchOpen(false);
    setSearchQuery("");
    setEcoinventLookupOpen(false);
  };

  const clearDataSourceConnection = () => {
    setDraft((current) => ({
      ...current,
      linkedMoleculeId: null,
      ecoinventStatus: "unchecked",
      ecoinventDatasetId: "",
      ecoinventDatasetUuid: "",
      ecoinventGeography: "",
      ecoinventName: "",
      ecoinventReferenceProduct: "",
      ecoinventUnit: "",
    }));
    setLinkedActivityNotice(null);
    setReuseSearchOpen(false);
    setSearchQuery("");
  };

  const markMissingFromEcoinvent = () => {
    if (selectedDataSource && selectedDataSource !== "missing") return;
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

  const linkProjectActivity = (molecule: MoleculeRecord) => {
    if (selectedDataSource && selectedDataSource !== "activity") return;
    setDraft((current) => ({
      ...current,
      linkedMoleculeId: molecule.id,
      ecoinventStatus: "missing",
      ecoinventDatasetId: "",
      ecoinventDatasetUuid: "",
      ecoinventGeography: "",
      ecoinventName: "",
      ecoinventReferenceProduct: "",
      ecoinventUnit: "",
    }));
    setReuseSearchOpen(false);
    setSearchQuery("");
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
    uncertaintyEnabled: draft.uncertaintyEnabled,
    minimumValue: draft.uncertaintyEnabled ? draft.minimumValue : "",
    maximumValue: draft.uncertaintyEnabled ? draft.maximumValue : "",
    amountSource: draft.amountSource,
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
  const importActivityFile = async (file: File) => {
    if (selectedDataSource && selectedDataSource !== "activity") return;
    const targetRowId = initialRow?.id ?? createdRowId ?? makeClientId("row");
    setImportingActivity(true);
    setImportActivityError("");
    try {
      await onImportActivityFromFile(file, targetRowId, buildRowPayload(targetRowId));
      onClose();
    } catch (error) {
      setImportActivityError(error instanceof Error ? error.message : "The activity file could not be imported.");
    } finally {
      setImportingActivity(false);
    }
  };
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
  const createLinkedActivityFromInput = (activityDraft: MoleculeDraft) => {
    if (selectedDataSource && selectedDataSource !== "activity") return;
    const targetRowId = initialRow?.id ?? createdRowId ?? makeClientId("row");
    const payload = buildRowPayload(targetRowId);
    const childIsMolecule = draft.objectKind === "molecule";

    const newMoleculeId = onCreateChildFromRow(targetRowId, payload, {
      ...activityDraft,
      objectKind: draft.objectKind,
      activityType: activityDraft.activityType || "Production of",
      referenceProductName: activityDraft.referenceProductName || draft.name,
      referenceUnit: draft.unit || "kg",
      name: activityDraft.name || `Production of ${activityDraft.referenceProductName || draft.name}`,
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
    setDraft((current) => ({
      ...current,
      linkedMoleculeId: newMoleculeId,
      ecoinventStatus: "missing",
      ecoinventDatasetId: "",
      ecoinventDatasetUuid: "",
      ecoinventGeography: "",
      ecoinventName: "",
      ecoinventReferenceProduct: "",
      ecoinventUnit: "",
    }));
    setCreatedRowId(targetRowId);
    setLinkedActivityNotice(newMoleculeId);
    setCreateLinkedActivityOpen(false);
  };

  return createPortal((
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/35 px-4 py-6 backdrop-blur-sm">
        <div
          aria-labelledby="inventory-flow-editor-title"
          aria-modal="true"
          className="hero-surface flex h-[calc(100dvh-3rem)] max-h-[52rem] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/70 shadow-xl"
          data-tutorial="row-editor-dialog"
          role="dialog"
        >
        <div className="flex items-start justify-between gap-4 border-b border-mist/80 bg-white/90 px-5 py-4 backdrop-blur">
          <div>
            <div className="text-sm font-semibold text-slate">{draft.section === "INPUT" ? "What the activity uses" : "What the activity produces"}</div>
            <h2 className="mt-1 text-2xl font-semibold text-ink" id="inventory-flow-editor-title">
              {initialRow ? `Edit ${section.toLowerCase()}` : `Add ${section.toLowerCase()}`}
            </h2>
            {isReferenceOutputRow ? (
              <div className="mt-1 text-sm text-slate">The main output needs a name, positive amount, and unit.</div>
            ) : null}
          </div>
          <button
            aria-label="Close flow editor"
            className="grid h-8 w-8 place-items-center rounded-sm text-lg text-slate transition hover:bg-white/5 hover:text-ink"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="min-w-0 max-w-full overflow-hidden border-b border-mist/60 bg-lab/80 p-3 lg:h-full lg:border-b-0 lg:border-r">
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:pb-0">
              {rowEditorSteps.map((step, index) => (
                <EditorSectionTab
                  active={activePanel === step.id}
                  completed={step.id === "details" ? requiredDetailsComplete : step.id === "dataset" ? dataSourceComplete : Boolean(draft.amountSource || draft.description || draft.reference || draft.notes)}
                  index={index + 1}
                  key={step.label}
                  label={step.label}
                  status={activePanel === step.id ? "Current" : step.id === "notes" ? "Optional" : undefined}
                  onClick={() => setActivePanel(step.id)}
                />
              ))}
            </div>
          </aside>

        <div className="step-panel min-w-0 overflow-y-auto" key={activePanel}><div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
          {activePanel === "details" ? (
          <section
            className={`rounded-md p-1 ${["details", "inputList", "referenceOutput"].includes(highlightedField) ? "ring-2 ring-accent/50 ring-offset-4 ring-offset-white" : ""}`}
            data-project-issue-field="details inputList referenceOutput"
            data-tutorial="row-editor-details"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-ink">What is it, and how much is {draft.section === "INPUT" ? "used" : "produced"}?</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink">{draft.section === "INPUT" ? "Input" : "Output"} kind</span>
                <select
                  className="mt-2 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      objectKind: event.target.value === "generic_object" ? "generic_object" : "molecule",
                      pubchemMatch: event.target.value === "generic_object" ? null : current.pubchemMatch,
                    }))
                  }
                  value={draft.objectKind}
                >
                  <option value="generic_object">Material, energy, transport, or service</option>
                  <option value="molecule">Chemical substance</option>
                </select>
              </label>
              <div className="relative block">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-ink" htmlFor="flow-name">
                    {draft.objectKind === "generic_object" ? "Name *" : "Chemical name *"}
                  </label>
                  <button
                    aria-expanded={nameTipOpen}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                      nameTipOpen ? "border-helper bg-helper-soft text-helper" : "border-helper/45 text-helper hover:border-helper hover:bg-helper-soft"
                    }`}
                    onClick={() => setNameTipOpen((current) => !current)}
                    type="button"
                  >
                    Tip
                  </button>
                </div>
                <input
                  className="mt-2 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  id="flow-name"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={draft.objectKind === "generic_object" ? "e.g. Galvanised steel sheet, steel screw, or grid electricity" : "e.g. Ethylene glycol"}
                  value={draft.name}
                />
                {nameTipOpen ? (
                  <div className="theme-popover absolute right-0 top-9 z-20 w-[min(21rem,calc(100vw-5rem))] rounded-lg border border-helper/55 p-4 text-sm leading-6 text-helper shadow-2xl" role="note">
                    <span className="theme-popover absolute -top-2 right-5 h-4 w-4 rotate-45 border-l border-t border-helper/55" />
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-helper">Tip</span>
                      <button aria-label="Close naming tip" className="-mr-1 -mt-1 grid h-6 w-6 place-items-center rounded text-base text-helper hover:bg-white/10" onClick={() => setNameTipOpen(false)} type="button">×</button>
                    </div>
                    <p className="mt-1">
                      Put the item’s specific identity in Name: <span className="font-medium text-ink">Galvanised steel sheet</span>, <span className="font-medium text-ink">Steel screw</span>, or <span className="font-medium text-ink">Grid electricity</span>. Use Documentation for specifications, assumptions, or context—not for the item name.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {draft.objectKind === "molecule" ? (
              <div className="mt-4 border-t border-mist/60 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Chemical identity</div>
                  <div className="mt-0.5 text-xs text-helper">Search PubChem to confirm the chemical name and identifiers.</div>
                </div>
                <button
                  className="theme-popover rounded-md border border-helper px-3 py-2 text-xs font-semibold text-helper transition hover:bg-helper-soft"
                  onClick={() => setLookupOpen(true)}
                  type="button"
                >
                  Look up in PubChem
                </button>
              </div>
              {draft.pubchemMatch ? (
                <div className="mt-3 border-l-2 border-slate px-3 py-2 text-xs text-slate" role="status">
                  <span className="font-semibold text-ink">Imported from PubChem · CID {draft.pubchemMatch.cid}</span>
                  <span className="mt-1 block">{[draft.cas && `CAS ${draft.cas}`, draft.formula, draft.iupac].filter(Boolean).join(" · ")}</span>
                </div>
              ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`block rounded-md ${highlightedField === "totalValue" ? "ring-2 ring-accent/50 ring-offset-4 ring-offset-white" : ""}`} data-project-issue-field="totalValue">
                <span className="text-sm font-medium text-ink">Amount</span>
                <input
                  aria-invalid={amountInvalid || referenceAmountInvalid}
                  className={`mt-2 w-full rounded-md border bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate ${
                    amountInvalid || referenceAmountInvalid ? "border-alert" : "border-mist"
                  }`}
                  onChange={(event) => setDraft((current) => ({ ...current, totalValue: event.target.value }))}
                  placeholder="0.000"
                  value={draft.totalValue}
                />
                {amountInvalid ? <div className="mt-2 text-xs font-semibold text-alert">Use a numeric value such as 1, 0.25, or 3.5.</div> : null}
                {referenceAmountInvalid && !amountInvalid ? <div className="mt-2 text-xs font-semibold text-alert">The reference amount must be greater than zero.</div> : null}
              </label>

              <label className={`block rounded-md ${highlightedField === "unit" ? "ring-2 ring-accent/50 ring-offset-4 ring-offset-white" : ""}`} data-project-issue-field="unit">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Unit *</span>
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
                  className="mt-2 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      unit: event.target.value,
                      scaledUnit: event.target.value,
                    }))
                  }
                  list="lci-unit-options"
                  placeholder="e.g. kg, kWh, MJ, or m3"
                  value={draft.unit}
                />
                <datalist id="lci-unit-options">
                  <option value="kg" />
                  <option value="g" />
                  <option value="kWh" />
                  <option value="MJ" />
                  <option value="m3" />
                  <option value="L" />
                  <option value="tkm" />
                  <option value="item" />
                </datalist>
                {kgConversionPreview ? (
                  <div className="mt-2 rounded-lg border border-accent/15 bg-white px-3 py-2 text-xs leading-5 text-slate">
                    Fast mass conversion detected: {draft.totalValue || "-"} {kgConversionPreview.normalizedUnit} ={" "}
                    <span className="font-semibold text-ink">{kgConversionPreview.total} kg</span>
                  </div>
                ) : null}
              </label>
            </div>

            <div className="mt-5 border-t border-mist/60 pt-4">
              <div className="flex items-start justify-between gap-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    checked={draft.uncertaintyEnabled}
                    className="mt-0.5 h-4 w-4 rounded border-mist text-accent focus:ring-accent"
                    onChange={(event) => setDraft((current) => ({ ...current, uncertaintyEnabled: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Add uncertainty</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate">
                      To account for possible uncertainties and variability in the modelled activity, where an amount varies or is not known precisely, a range or minimum and maximum values may also be provided.
                    </span>
                  </span>
                </label>
              </div>
              {draft.uncertaintyEnabled ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-ink">Minimum value</span>
                    <input
                      aria-invalid={uncertaintyInvalid}
                      className={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm text-ink outline-none transition focus:border-slate ${uncertaintyInvalid ? "border-alert" : "border-mist"}`}
                      inputMode="decimal"
                      onChange={(event) => setDraft((current) => ({ ...current, minimumValue: event.target.value }))}
                      placeholder="Minimum"
                      value={draft.minimumValue}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-ink">Maximum value</span>
                    <input
                      aria-invalid={uncertaintyInvalid}
                      className={`mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm text-ink outline-none transition focus:border-slate ${uncertaintyInvalid ? "border-alert" : "border-mist"}`}
                      inputMode="decimal"
                      onChange={(event) => setDraft((current) => ({ ...current, maximumValue: event.target.value }))}
                      placeholder="Maximum"
                      value={draft.maximumValue}
                    />
                  </label>
                  {uncertaintyInvalid ? (
                    <p className="text-xs font-semibold text-alert sm:col-span-2">Enter numeric values with the minimum no greater than the maximum.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-5 border-t border-mist/60 pt-4">
            <div className="hidden">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">Reuse something already in this project</div>
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
                    className="rounded-md border border-mist bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={selectedDataSource !== null}
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
                      className="inline-flex items-center gap-2 rounded-sm border border-alert/50 bg-alert/10 px-3 py-1.5 text-xs font-semibold text-alert transition hover:border-alert hover:bg-alert/20"
                      onClick={clearDataSourceConnection}
                      type="button"
                    >
                      <TrashIcon />
                      Remove connection
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
            </div>
          </section>
          ) : null}

          {activePanel === "dataset" ? (
          <section className={`rounded-md p-1 ${highlightedField === "ecoinventDatasetId" ? "ring-2 ring-accent/50 ring-offset-4 ring-offset-white" : ""}`} data-project-issue-field="ecoinventDatasetId" data-tutorial="row-editor-dataset">
	            <div>
	              <h3 className="text-lg font-semibold text-ink">How is this {draft.section === "INPUT" ? "input" : "output"} represented?</h3>
	              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">Choose one data source. You can change this choice later.</p>
	            </div>
                {isReferenceOutputRow ? <div className="mt-5 border-l-2 border-slate px-4 py-3 text-sm text-slate">This is the activity’s main output; it does not need a background dataset.</div> : (
                  <div className="mt-5 grid gap-2">
                    <DataSourceOption
                      actionLabel="Search →"
                      description="Search background datasets by flow name."
                      disabled={!canEditEcoinvent || (selectedDataSource !== null && selectedDataSource !== "ecoinvent")}
                      onRemove={clearDataSourceConnection}
                      onSelect={() => setEcoinventLookupOpen(true)}
                      removeLabel="Remove database connection"
                      selected={selectedDataSource === "ecoinvent"}
                      title="Link an ecoinvent dataset"
                      tutorialId="ecoinvent-option"
                    />
                    <DataSourceOption
                      actionLabel="Choose →"
                      description="Link an activity already in this project or import an activity JSON file."
                      disabled={selectedDataSource !== null && selectedDataSource !== "activity"}
                      onRemove={clearDataSourceConnection}
                      onSelect={() => {
                        if (selectedDataSource !== "activity") {
                          setActivityConnectionMode("existing");
                          setReuseSearchOpen(true);
                        }
                      }}
                      removeLabel="Remove activity connection"
                      selected={selectedDataSource === "activity"}
                      title="Link or import an activity"
                    />
                    <DataSourceOption
                      actionLabel="Select"
                      description="Keep the flow and mark its background data as missing."
                      disabled={selectedDataSource !== null && selectedDataSource !== "missing"}
                      onRemove={clearDataSourceConnection}
                      onSelect={() => {
                        markMissingFromEcoinvent();
                        setReuseSearchOpen(false);
                      }}
                      removeLabel="Remove missing-data selection"
                      selected={selectedDataSource === "missing"}
                      title="No suitable dataset available"
                    />
                  </div>
                )}
                {reuseSearchOpen && !isReferenceOutputRow ? (
                  <div className="mt-5 border-t border-mist/60 pt-4">
                    <div>
                      <div className="text-sm font-semibold text-ink">Choose how to connect the activity</div>
                      <div className="mt-1 text-xs leading-5 text-slate">Use an activity already defined in this project, or import an activity from a compatible JSON file.</div>
                    </div>
                    <div aria-label="Activity connection method" className="mt-4 grid grid-cols-2 rounded-md border border-mist/70 bg-lab p-1" role="group">
                      <button
                        aria-pressed={activityConnectionMode === "existing"}
                        className={`min-h-10 rounded-sm px-3 text-sm font-semibold transition ${activityConnectionMode === "existing" ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"}`}
                        onClick={() => { setActivityConnectionMode("existing"); setImportActivityError(""); }}
                        type="button"
                      >Existing activity</button>
                      <button
                        aria-pressed={activityConnectionMode === "import"}
                        className={`min-h-10 rounded-sm px-3 text-sm font-semibold transition ${activityConnectionMode === "import" ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"}`}
                        onClick={() => { setActivityConnectionMode("import"); setSearchQuery(""); }}
                        type="button"
                      >Import JSON</button>
                    </div>
                    {importActivityError ? <div className="mt-3 rounded-md border border-alert/30 bg-alert/10 px-3 py-2 text-xs leading-5 text-alert">{importActivityError}</div> : null}
                    {activityConnectionMode === "existing" ? (
                      <div className="mt-4">
                        <label className="text-xs font-semibold text-ink" htmlFor="existing-activity-search">Search existing activities</label>
                        <p className="mt-1 text-xs leading-5 text-slate">Search by activity name, main output, synonym, or linked ecoinvent name.</p>
                        <input id="existing-activity-search" className="mt-2 w-full rounded-sm border border-mist bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-slate" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by activity name or main output" value={searchQuery} />
                        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
                          {searchResults.filter((item): item is Extract<ProjectItemResult, { kind: "molecule" }> => item.kind === "molecule").map((item) => {
                            const mainOutput = item.molecule.rows.find((row) => row.section === "OUTPUT" && row.order === 1);
                            return (
                              <button className="flex w-full items-center justify-between gap-4 rounded-sm border border-transparent px-3 py-2.5 text-left text-sm text-slate transition hover:border-mist/70 hover:bg-white hover:text-ink" key={item.id} onClick={() => linkProjectActivity(item.molecule)} type="button">
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-ink">{item.molecule.name}</span>
                                  <span className="mt-0.5 block truncate text-xs text-slate">Main output: {item.molecule.referenceProductName || mainOutput?.name || "Not defined"}{mainOutput?.totalValue ? ` · ${mainOutput.totalValue} ${mainOutput.unit}` : ""}</span>
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-accent">Link</span>
                              </button>
                            );
                          })}
                          {searchResults.filter((item) => item.kind === "molecule").length === 0 ? <div className="rounded-sm border border-dashed border-mist px-3 py-4 text-center text-xs text-slate">No matching activity in this project.</div> : null}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-md border border-mist/70 bg-lab px-4 py-4">
                        <div className="text-sm font-semibold text-ink">Import an activity JSON</div>
                        <p className="mt-1 text-xs leading-5 text-slate">Select a JSON file exported from this tool. The imported activity and its connected foreground activities will be added to this project and linked to the current flow.</p>
                        <button className="mt-4 rounded-sm border border-mist bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-50" disabled={importingActivity} onClick={() => importActivityInputRef.current?.click()} type="button">{importingActivity ? "Importing…" : "Choose JSON file"}</button>
                        <input accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importActivityFile(file); event.target.value = ""; }} ref={importActivityInputRef} type="file" />
                      </div>
                    )}
                  </div>
                ) : null}
	            {isReferenceOutputRow ? (
	              <div className="mt-4 rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
	                Main output
	              </div>
	            ) : isLinkedProjectItem ? (
	              <div className={`mt-4 rounded-lg border px-4 py-4 ${linkedActivityNotice ? "border-sea/25 bg-sea/10" : "border-accent/20 bg-accent-soft/60"}`}>
	                <div className="flex flex-wrap items-center justify-between gap-3">
	                  <div>
	                    <div className={`text-sm font-semibold ${linkedActivityNotice ? "text-sea" : "text-ink"}`}>
	                      {linkedActivityNotice ? "✓ Activity created and linked" : "Linked activity"}
	                    </div>
	                    <div className="mt-1 text-sm text-slate">
	                      {selectedMolecule?.name || draft.name || "Linked project activity"}. Continue editing this input, or open the activity to add its inventory.
	                    </div>
	                  </div>
	                  <button
	                    className="rounded-sm border border-mist px-3 py-2 text-sm font-semibold text-ink transition hover:bg-white/5"
	                    onClick={() => {
	                      if (draft.linkedMoleculeId) {
	                        onOpenMolecule(draft.linkedMoleculeId);
	                      }
	                    }}
	                    type="button"
	                  >
	                    Open activity →
	                  </button>
	                </div>
	              </div>
            ) : hasEcoinventMatch ? (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-slate px-4 py-2" data-tutorial="linked-dataset"><div><div className="text-sm font-semibold text-ink">Dataset linked</div><div className="mt-0.5 text-xs text-slate">{draft.ecoinventName || "Selected ecoinvent dataset"}{draft.ecoinventGeography ? ` — ${draft.ecoinventGeography}` : ""}</div></div><button className="rounded-sm border border-mist px-3 py-1.5 text-xs text-slate hover:text-ink" onClick={() => setEcoinventLookupOpen(true)} type="button">Change dataset</button></div>
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
            ) : draft.ecoinventStatus === "missing" ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-mist bg-lab px-4 py-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Create an activity for this input</div>
                  <div className="mt-1 text-xs leading-5 text-slate">
                    Model its inputs and outputs as a foreground activity in this project.
                  </div>
                </div>
                <button
                  className="rounded-sm border border-mist bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
                  onClick={() => {
                    clearDataSourceConnection();
                    setCreateLinkedActivityOpen(true);
                  }}
                  type="button"
                >
                  Create activity
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-mist bg-lab px-4 py-5 text-sm leading-6 text-slate">
                No ecoinvent dataset selected yet. Search ecoinvent, or mark the item as missing.
              </div>
            )}
          </section>
          ) : null}

          {activePanel === "notes" ? (
          <section
            className={`p-1 transition ${
              canEditDocumentation ? "" : "pointer-events-none opacity-45"
            }`}
            data-tutorial="row-editor-notes"
          >
            <h3 className="text-lg font-semibold text-ink">Documentation</h3>
            {!canEditDocumentation ? (
              <p className="mt-2 text-sm text-slate">
                Enter the item name before documenting the row.
              </p>
            ) : null}
            <div className="mt-4 grid gap-4">
              <fieldset className="relative border-b border-mist/60 pb-5">
                <legend className="px-1">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                    How was this {draft.uncertaintyEnabled ? "amount or range" : "amount"} obtained?
                    <button
                      aria-label="About how the amount was obtained"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-helper/45 text-xs font-bold text-helper transition hover:border-helper hover:bg-helper-soft"
                      onClick={() => setAmountSourceHelpOpen((current) => !current)}
                      type="button"
                    >?</button>
                  </span>
                </legend>
                {amountSourceHelpOpen ? (
                  <aside className="theme-popover mt-3 rounded-md border border-helper/45 p-4 text-sm leading-6 text-slate" role="note">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">How amounts may be obtained</span>
                      <button aria-label="Close amount source help" className="grid h-6 w-6 place-items-center text-base text-slate hover:text-ink" onClick={() => setAmountSourceHelpOpen(false)} type="button">×</button>
                    </div>
                    <p className="mt-2">These amounts may be:</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5">
                      <li>measured (power consumption measured using a Kill-A-Watt meter)</li>
                      <li>calculated (heating energy calculated by means of thermodynamic formulas)</li>
                      <li>estimated (value estimated through expert judgement).</li>
                    </ol>
                  </aside>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {(["measured", "calculated", "estimated"] as const).map((source) => (
                    <button
                      aria-pressed={draft.amountSource === source}
                      className={`rounded-md border px-3 py-2 text-sm font-semibold capitalize transition ${
                        draft.amountSource === source
                          ? "border-slate bg-white/5 text-ink"
                          : "border-mist bg-white text-slate hover:border-slate hover:text-ink"
                      }`}
                      key={source}
                      onClick={() => setDraft((current) => ({ ...current, amountSource: source }))}
                      type="button"
                    >
                      {source}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">
                  Description of the {draft.objectKind === "generic_object" ? "flow" : "molecule"}
                </span>
                <textarea
                  className="mt-2 min-h-20 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short description of the row item or its role"
                  value={draft.description}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Reference</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                  placeholder="Patent, paper, memo, or dataset reference"
                  value={draft.reference}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Additional notes</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-md border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-slate"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Optional row note"
                  value={draft.notes}
                />
              </label>
            </div>
          </section>
          ) : null}
        </div></div>
        </div>

        <div className="flex flex-col items-stretch gap-3 border-t border-mist/80 bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
          <div className="text-sm text-alert">
            {hasUnitMismatch
              ? `Unit mismatch: change the flow unit to ${draft.ecoinventUnit || "the dataset unit"}, or remove the database connection.`
              : !canSave && uncertaintyInvalid
              ? "Check the uncertainty range."
              : !canSave && (amountInvalid || referenceAmountInvalid)
                ? "Enter a valid amount."
                : ""}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {activePanel === "details" ? <button className="rounded-sm px-3 py-2 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ink" onClick={onClose} type="button">Cancel</button> : <button className="rounded-sm px-3 py-2 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ink" onClick={() => setActivePanel(activePanel === "notes" ? "dataset" : "details")} type="button">Back</button>}
            {activePanel !== "notes" ? (
              <button className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141] disabled:cursor-not-allowed disabled:bg-mist" data-tutorial={activePanel === "dataset" ? "row-editor-next-documentation" : undefined} disabled={activePanel === "details" ? !requiredDetailsComplete : !dataSourceComplete} onClick={() => setActivePanel(activePanel === "details" ? "dataset" : "notes")} type="button">Next: {activePanel === "details" ? "Data source" : "Documentation"}</button>
            ) : (
              <button className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141] disabled:cursor-not-allowed disabled:bg-mist" disabled={!canSave} onClick={() => { if (!canSave) return; const targetRowId = initialRow?.id ?? createdRowId ?? makeClientId("row"); onSave(buildRowPayload(targetRowId), targetRowId); }} type="button">{initialRow ? `Save ${draft.section.toLowerCase()}` : `Add ${draft.section.toLowerCase()}`}</button>
            )}
          </div>
        </div>
      </div>
      </div>

      <CreateMoleculeDialog
        initialValues={{
          activityType: "Production of",
          referenceProductName: draft.name,
          referenceAmount: "1",
          referenceUnit: draft.unit || "kg",
          name: draft.name,
          topLevel: false,
        }}
        layerClassName="z-[90]"
        onClose={() => setCreateLinkedActivityOpen(false)}
        onSubmit={createLinkedActivityFromInput}
        open={createLinkedActivityOpen}
        submitLabel="Create and link activity"
        title="Create linked activity"
      />

      <PubChemLookupDialog
        initialQuery={draft.cas || draft.name || draft.iupac}
        onClose={() => setLookupOpen(false)}
        onSelect={applyPubChemMatch}
        open={lookupOpen}
        title="Lookup row identity in PubChem"
      />
      <EcoinventLookupDialog
        context={{
          unit: draft.unit,
          goalAndScope: currentMolecule.documentation.referenceAndScope,
          functionalUnit: currentMolecule.documentation.functionalUnit,
        }}
        initialQuery={draft.ecoinventName || draft.name || draft.cas || draft.iupac}
        onClose={() => setEcoinventLookupOpen(false)}
        onSelect={applyEcoinventMatch}
        open={ecoinventLookupOpen}
      />
    </>
  ), document.body);
}
