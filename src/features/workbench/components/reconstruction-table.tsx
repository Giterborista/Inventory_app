"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { RowEditorDialog } from "@/features/workbench/components/row-editor-dialog";
import { resolutionLabels } from "@/features/workbench/display";
import { getLinkedMolecule, getRowInventoryReviewIssues, isReferenceProductRow } from "@/features/workbench/selectors";
import type { PasProfile } from "@/features/workbench/pas-defaults";
import type {
  MoleculeDraft,
  MoleculeRecord,
  ObjectKind,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
  ResolutionStatus,
} from "@/features/workbench/types";

export type InventoryFixRequest = {
  key: number;
  kind: "row" | "add";
  section: ReconstructionSection;
  rowId?: string;
  panel?: "details" | "dataset" | "notes";
  field?: string;
};

type ReconstructionTableProps = {
  activeSection: ReconstructionSection;
  project: ProjectRecord;
  molecule: MoleculeRecord;
  onDeleteRow: (rowId: string) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: ReconstructionSection },
    draft: Partial<MoleculeDraft>,
  ) => string;
  onImportActivityFromFile: (file: File, rowId: string, values: Partial<ReconstructionRow> & { section: ReconstructionSection }) => Promise<void>;
  onApplyPasDefaults: (profile: PasProfile) => void;
  onSaveRow: (section: ReconstructionSection, values: Partial<ReconstructionRow>, rowId?: string) => void;
  onRescale: () => void;
  onUpdateScaleField: (field: "scaleReferenceAmount" | "scaleTargetAmount" | "scaleUnit", value: string) => void;
  autoOpenSection?: ReconstructionSection | null;
  onAutoOpenHandled?: () => void;
  fixRequest?: InventoryFixRequest | null;
  onFixRequestHandled?: () => void;
};

type EditorState = {
  open: boolean;
  mode: "inline" | "advanced";
  section: ReconstructionSection;
  row: ReconstructionRow | null;
  panel: "details" | "dataset" | "notes";
  field?: string;
};

type InlineRowDraft = {
  objectKind: ObjectKind;
  name: string;
  totalValue: string;
  unit: string;
  ecoinventStatus: ResolutionStatus;
  notes: string;
};

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

function buildInlineDraft(row?: ReconstructionRow | null): InlineRowDraft {
  return {
    objectKind: row?.objectKind ?? "generic_object",
    name: row?.name ?? "",
    totalValue: row?.totalValue ?? "",
    unit: row?.unit ?? "kg",
    ecoinventStatus: row?.ecoinventStatus ?? "unchecked",
    notes: row?.notes ?? row?.description ?? "",
  };
}

function hasMeaningfulRo(value: string) {
  const normalized = value.trim();
  return Boolean(normalized && normalized !== "-" && normalized !== "–" && normalized !== "—");
}

function compactRowPreview(row: ReconstructionRow) {
  const sourceText =
    row.synonyms.length > 0
      ? row.synonyms.slice(0, 3).join(", ")
      : row.notes || row.description || row.reference || "";
  const normalized = sourceText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function InlineRowEditorSheet({
  molecule,
  onAdvanced,
  onCancel,
  onSave,
  row,
  section,
}: {
  molecule: MoleculeRecord;
  onAdvanced: () => void;
  onCancel: () => void;
  onSave: (values: Partial<ReconstructionRow>, rowId?: string) => void;
  row?: ReconstructionRow | null;
  section: ReconstructionSection;
}) {
  const [draft, setDraft] = useState<InlineRowDraft>(() => buildInlineDraft(row));

  useEffect(() => {
    setDraft(buildInlineDraft(row));
  }, [row]);

  const parsedAmount = parseNumeric(draft.totalValue);
  const amountInvalid = draft.totalValue.trim().length > 0 && parsedAmount === null;
  const canSave = draft.name.trim().length > 0 && !amountInvalid && draft.unit.trim().length > 0;
  const scaleFactor =
    (parseNumeric(molecule.scaleTargetAmount) ?? 1) /
    Math.max(parseNumeric(molecule.scaleReferenceAmount) ?? 1, Number.EPSILON);
  const scaledPreview = parsedAmount === null ? "" : formatScaled(parsedAmount * scaleFactor);
  const modeLabel = row ? "Edit row" : `Add ${section.toLowerCase()} row`;

  return (
    <div className="rounded-lg border border-ink/10 bg-white shadow-[0_18px_40px_rgba(15,31,53,0.12)]">
      <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist/80 pb-4">
            <div>
              <div className="text-xs font-semibold text-slate">{modeLabel}</div>
              <h3 className="mt-1 text-xl font-semibold text-ink">{section === "INPUT" ? "What does the activity use?" : "What does the activity produce?"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-mist bg-white px-3 py-2 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!row}
                onClick={onAdvanced}
                type="button"
              >
                More details
              </button>
              <button
                className="rounded-md border border-mist bg-white px-3 py-2 text-xs font-semibold text-slate transition hover:border-alert/40 hover:text-alert"
                onClick={onCancel}
                type="button"
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink">Name</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-mist bg-lab px-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder={section === "INPUT" ? "e.g. Ethylene glycol" : "e.g. Finished product"}
                  value={draft.name}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">Amount</span>
                <input
                  className={`mt-2 h-11 w-full rounded-md border bg-lab px-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white ${
                    amountInvalid ? "border-alert" : "border-mist"
                  }`}
                  onChange={(event) => setDraft((current) => ({ ...current, totalValue: event.target.value }))}
                  placeholder="1"
                  value={draft.totalValue}
                />
                {amountInvalid ? <div className="mt-2 text-xs font-semibold text-alert">Use a number such as 1, 0.25, or 3.5.</div> : null}
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">Unit</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-mist bg-lab px-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
                  onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))}
                  placeholder="kg"
                  value={draft.unit}
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">Input kind</span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-mist bg-lab px-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      objectKind: event.target.value === "molecule" ? "molecule" : "generic_object",
                    }))
                  }
                  value={draft.objectKind}
                >
                  <option value="generic_object">Material, energy, transport, or service</option>
                  <option value="molecule">Chemical substance</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">Dataset status</span>
                <select
                  className="mt-2 h-11 w-full rounded-md border border-mist bg-lab px-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ecoinventStatus: event.target.value as ResolutionStatus,
                    }))
                  }
                  value={draft.ecoinventStatus}
                >
                  <option value="unchecked">Not checked</option>
                  <option value="present">Dataset found</option>
                  <option value="missing">Dataset missing</option>
                  <option value="proxy_created">Proxy created</option>
                  <option value="in_progress">In progress</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink">Notes</span>
                <textarea
                  className="mt-2 min-h-20 w-full resize-y rounded-md border border-mist bg-lab px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Source, assumption, or reason for this flow"
                  value={draft.notes}
                />
              </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-mist/80 pt-4">
            <button
              className="rounded-md border border-mist bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-alert/40 hover:text-alert"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4b87] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSave}
              onClick={() =>
                onSave(
                  {
                    section,
                    objectKind: draft.objectKind,
                    name: draft.name.trim(),
                    totalValue: draft.totalValue.trim(),
                    unit: draft.unit.trim(),
                    scaledUnit: draft.unit.trim(),
                    totalScaledValue: scaledPreview,
                    notes: draft.notes,
                    description: row?.description ?? "",
                    ecoinventStatus: draft.ecoinventStatus,
                    rawEcoinventStatus: resolutionLabels[draft.ecoinventStatus],
                  },
                  row?.id,
                )
              }
              type="button"
            >
              Save
            </button>
          </div>
      </div>
    </div>
  );
}

function RowTable({
  inlineEditor,
  molecule,
  onCancelInlineEditor,
  onDeleteRow,
  onOpenAdvancedEditor,
  onOpenEditor,
  onOpenMolecule,
  onSaveInlineRow,
  project,
  rows,
  section,
  showScaledColumn,
}: {
  inlineEditor: EditorState | null;
  molecule: MoleculeRecord;
  onCancelInlineEditor: () => void;
  onDeleteRow: (rowId: string) => void;
  onOpenAdvancedEditor: (section: ReconstructionSection, row?: ReconstructionRow | null) => void;
  onOpenEditor: (
    section: ReconstructionSection,
    row?: ReconstructionRow | null,
    panel?: "details" | "dataset" | "notes",
  ) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onSaveInlineRow: (values: Partial<ReconstructionRow>, rowId?: string) => void;
  project: ProjectRecord;
  rows: ReconstructionRow[];
  section: ReconstructionSection;
  showScaledColumn: boolean;
}) {
  if (rows.length === 0) {
    const showNewEditor = Boolean(inlineEditor && !inlineEditor.row && inlineEditor.section === section);

    return (
      <div className="space-y-3">
        {showNewEditor ? (
          <InlineRowEditorSheet
            molecule={molecule}
            onAdvanced={() => onOpenAdvancedEditor(section)}
            onCancel={onCancelInlineEditor}
            onSave={onSaveInlineRow}
            section={section}
          />
        ) : (
          <div className="border-t border-mist/60 px-1 py-7">
            <div className="max-w-2xl text-sm leading-6 text-slate">
              {section === "INPUT"
                ? "Add the materials, energy, water, transport, or services used by this activity."
                : "Add co-products, emissions, or waste only when they are part of what you are studying."}
            </div>
          </div>
        )}
      </div>
    );
  }

  const showNewEditor = Boolean(inlineEditor && !inlineEditor.row && inlineEditor.section === section);

  return (
    <div className="space-y-3">
      {showNewEditor ? (
        <InlineRowEditorSheet
          molecule={molecule}
          onAdvanced={() => onOpenAdvancedEditor(section)}
          onCancel={onCancelInlineEditor}
          onSave={onSaveInlineRow}
          section={section}
        />
      ) : null}
      <div className="overflow-x-auto border-y border-mist/60 bg-white">
      <table className={`w-full border-collapse ${showScaledColumn ? "min-w-[42rem]" : "min-w-[36rem]"}`}>
        <thead>
          <tr className="border-b border-mist/70 bg-transparent text-left text-xs font-semibold text-slate">
            <th className={showScaledColumn ? "w-[40%] px-4 py-3" : "w-[46%] px-4 py-3"}>Flow</th>
            <th className="w-[12%] px-4 py-3">Amount</th>
            <th className="w-[10%] px-4 py-3">Unit</th>
            {showScaledColumn ? <th className="w-[14%] px-4 py-3">Scaled</th> : null}
            <th className="w-[20%] px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const linkedMolecule = getLinkedMolecule(project, row);
            const referenceProductOutput = isReferenceProductRow(molecule, row);
            const backgroundIssue = getRowInventoryReviewIssues(project, molecule, row).find(
              (issue) => issue.target === "row-background" && issue.state === "alert",
            );
            const rowPreview = compactRowPreview(row);
            const amountDisplay =
              row.totalValue ||
              (row.uncertaintyEnabled && row.minimumValue && row.maximumValue
                ? `${row.minimumValue}–${row.maximumValue}`
                : "—");

            const inlineOpenForRow = Boolean(inlineEditor?.row?.id === row.id && inlineEditor.section === section);

            return (
              <Fragment key={row.id}>
              <tr className={`border-b border-mist/60 align-top transition hover:bg-lab/55 ${inlineOpenForRow ? "bg-accent-soft/45" : ""}`}>
                <td className="px-4 py-4">
                  <div className="font-semibold text-ink">{row.name || "Untitled row"}</div>
                  {rowPreview ? <div className="mt-1 max-w-xl text-xs leading-5 text-slate">{rowPreview}</div> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {hasMeaningfulRo(row.ro) ? <span className="text-[11px] font-medium text-slate">RO {row.ro}</span> : null}
                    {linkedMolecule ? (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-sm bg-mist px-2 py-1 text-[11px] font-semibold text-ink transition hover:text-ink"
                        onClick={() => onOpenMolecule(linkedMolecule.id)}
                        type="button"
                      >
                        <span aria-hidden="true">↗</span> Linked activity · {linkedMolecule.name}
                      </button>
                    ) : null}
                    {backgroundIssue ? (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-sm bg-alert/10 px-2 py-1 text-[11px] font-semibold text-alert transition hover:bg-alert/15"
                        onClick={() => onOpenEditor(section, row, "dataset")}
                        type="button"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-alert" />
                        {backgroundIssue.label}
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-ink">
                  {amountDisplay}
                  {row.amountSource ? (
                    <span className="mt-1 block text-[10px] font-semibold capitalize text-slate">{row.amountSource}</span>
                  ) : null}
                </td>
                <td className="px-4 py-4 text-sm text-ink">{row.unit || "-"}</td>
                {showScaledColumn ? (
                  <td className="px-4 py-4 text-sm font-semibold text-ink">{row.totalScaledValue || "-"}</td>
                ) : null}
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-md px-2 py-2 text-xs font-semibold text-slate transition hover:bg-lab hover:text-accent"
                      onClick={() => onOpenEditor(section, row)}
                      type="button"
                    >
                      Edit details
                    </button>
                    {!referenceProductOutput ? (
                      <button
                        aria-label={`Delete ${row.name || "flow"}`}
                        className="grid h-8 w-8 place-items-center rounded-md text-base text-slate transition hover:bg-alert/10 hover:text-alert"
                        onClick={() => onDeleteRow(row.id)}
                        title="Delete flow"
                        type="button"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
              {inlineOpenForRow ? (
                <tr key={`${row.id}-editor`} className="border-b border-mist/60 bg-accent-soft/45">
                  <td className="px-3 pb-4 pt-0" colSpan={showScaledColumn ? 5 : 4}>
                    <InlineRowEditorSheet
                      molecule={molecule}
                      onAdvanced={() => onOpenAdvancedEditor(section, row)}
                      onCancel={onCancelInlineEditor}
                      onSave={onSaveInlineRow}
                      row={row}
                      section={section}
                    />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export function ReconstructionTable({
  activeSection,
  project,
  molecule,
  onDeleteRow,
  onOpenMolecule,
  onCreateChildFromRow,
  onImportActivityFromFile,
  onSaveRow,
  onRescale,
  onUpdateScaleField,
  autoOpenSection,
  onAutoOpenHandled,
  fixRequest,
  onFixRequestHandled,
}: ReconstructionTableProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    open: false,
    mode: "inline",
    section: "INPUT",
    row: null,
    panel: "details",
    field: undefined,
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaledColumnVisible, setScaledColumnVisible] = useState(false);

  const inputRows = useMemo(
    () => molecule.rows.filter((row) => row.section === "INPUT").sort((a, b) => a.order - b.order),
    [molecule.rows],
  );
  const outputRows = useMemo(
    () => molecule.rows.filter((row) => row.section === "OUTPUT").sort((a, b) => a.order - b.order),
    [molecule.rows],
  );
  const activeRows = activeSection === "INPUT" ? inputRows : outputRows;
  const referenceAmount = parseNumeric(molecule.scaleReferenceAmount);
  const targetAmount = parseNumeric(molecule.scaleTargetAmount);
  const scaleValid = Boolean(referenceAmount && referenceAmount > 0 && targetAmount && targetAmount > 0 && molecule.scaleUnit.trim());

  function openEditor(
    section: ReconstructionSection,
    row?: ReconstructionRow | null,
    panel: "details" | "dataset" | "notes" = "details",
    field?: string,
  ) {
    setEditorState({
      open: true,
      mode: "advanced",
      section: row?.section ?? section,
      row: row ?? null,
      panel,
      field,
    });
  }

  function openAdvancedEditor(section: ReconstructionSection, row?: ReconstructionRow | null) {
    openEditor(section, row, "details");
  }

  function closeEditor() {
    setEditorState((current) => ({
      open: false,
      mode: "inline",
      section: current.section,
      row: null,
      panel: "details",
      field: undefined,
    }));
  }

  function saveInlineRow(values: Partial<ReconstructionRow>, rowId?: string) {
    onSaveRow(editorState.section, { ...values, section: editorState.section }, rowId);
    closeEditor();
  }

  useEffect(() => {
    if (!autoOpenSection) {
      return;
    }

    openEditor(autoOpenSection);
    onAutoOpenHandled?.();
  }, [autoOpenSection, onAutoOpenHandled]);

  useEffect(() => {
    if (!fixRequest) {
      return;
    }

    const row = fixRequest.rowId
      ? molecule.rows.find((candidate) => candidate.id === fixRequest.rowId) ?? null
      : null;
    openEditor(fixRequest.section, fixRequest.kind === "row" ? row : null, fixRequest.panel ?? "details", fixRequest.field);
    onFixRequestHandled?.();
  }, [fixRequest, molecule.rows, onFixRequestHandled]);

  useEffect(() => {
    const handleTutorialStep = (event: Event) => {
      const step = (event as CustomEvent<{ step: number }>).detail?.step;
      if (typeof step !== "number") return;
      if (step <= 8) closeEditor();
      if (step === 9) openEditor("INPUT");
    };
    window.addEventListener("lci:tutorial-step", handleTutorialStep);
    return () => window.removeEventListener("lci:tutorial-step", handleTutorialStep);
  }, []);

  return (
    <div>
      <section className="flex flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-5 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">{activeSection === "INPUT" ? "Inputs" : "Outputs"}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
          {activeSection === "INPUT" ? (
          <button
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]"
            data-tutorial="add-input"
            onClick={() => openEditor(activeSection)}
            type="button"
          >
            + Add {activeSection === "INPUT" ? "input" : "output"}
          </button>
          ) : (
            <button className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]" onClick={() => openEditor(activeSection)} type="button">+ Add output</button>
          )}
          <button
            aria-label="How inputs and outputs work"
            className="inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium text-slate transition hover:text-ink"
            onClick={() => setHelpOpen(true)}
            type="button"
          >
            <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full border border-slate/40 text-[10px]">?</span>
            How inputs and outputs work
          </button>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <RowTable
            inlineEditor={null}
            molecule={molecule}
            onCancelInlineEditor={closeEditor}
            onDeleteRow={onDeleteRow}
            onOpenAdvancedEditor={openAdvancedEditor}
            onOpenEditor={openEditor}
            onOpenMolecule={onOpenMolecule}
            onSaveInlineRow={saveInlineRow}
            project={project}
            rows={activeRows}
            section={activeSection}
            showScaledColumn={scaledColumnVisible}
          />
        </div>

        <div className="border-t border-mist/40 px-4 py-3 text-slate sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs font-semibold text-slate">Scale amounts</span>
              <span className="text-xs text-slate">{molecule.scaleReferenceAmount || "–"} {molecule.scaleUnit || "kg"} → {molecule.scaleTargetAmount || "–"} {molecule.scaleUnit || "kg"}</span>
            </div>
            <button className="rounded-sm border border-mist px-3 py-1.5 text-xs font-semibold text-slate transition hover:bg-lab hover:text-ink" onClick={() => setScaleOpen((current) => !current)} type="button">{scaleOpen ? "Done" : "Edit scale"}</button>
          </div>
          {scaleOpen ? (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-mist/40 pt-3">
              <label className="block w-28"><span className="text-xs text-slate">Recorded</span><input aria-invalid={referenceAmount === null || referenceAmount <= 0} className="mt-1 h-9 w-full rounded-sm border border-mist bg-white px-3 text-sm text-ink outline-none focus:border-slate" inputMode="decimal" onChange={(event) => onUpdateScaleField("scaleReferenceAmount", event.target.value)} value={molecule.scaleReferenceAmount} /></label>
              <label className="block w-28"><span className="text-xs text-slate">Target</span><input aria-invalid={targetAmount === null || targetAmount <= 0} className="mt-1 h-9 w-full rounded-sm border border-mist bg-white px-3 text-sm text-ink outline-none focus:border-slate" inputMode="decimal" onChange={(event) => onUpdateScaleField("scaleTargetAmount", event.target.value)} value={molecule.scaleTargetAmount} /></label>
              <label className="block w-24"><span className="text-xs text-slate">Unit</span><input className="mt-1 h-9 w-full rounded-sm border border-mist bg-white px-3 text-sm text-ink outline-none focus:border-slate" onChange={(event) => onUpdateScaleField("scaleUnit", event.target.value)} value={molecule.scaleUnit} /></label>
              <button className="h-9 rounded-sm border border-mist px-3 text-xs font-semibold text-ink transition hover:bg-lab disabled:cursor-not-allowed disabled:opacity-40" disabled={!scaleValid} onClick={() => { onRescale(); setScaledColumnVisible(true); }} type="button">Recalculate</button>
              {!scaleValid ? <span className="pb-2 text-xs text-alert">Enter positive amounts and a unit.</span> : null}
            </div>
          ) : null}
        </div>

      </section>

      <RowEditorDialog
        currentMolecule={molecule}
        initialRow={editorState.row}
        initialPanel={editorState.panel}
        initialField={editorState.field}
        onClose={() =>
          setEditorState({
            open: false,
            mode: "inline",
            section: editorState.section,
            row: null,
            panel: "details",
            field: undefined,
          })
        }
        onSave={(values, rowId) => {
          onSaveRow(editorState.section, { ...values, section: editorState.section }, rowId);
          setEditorState({
            open: false,
            mode: "inline",
            section: editorState.section,
            row: null,
            panel: "details",
            field: undefined,
          });
        }}
        onCreateChildFromRow={(rowId, values, draft) => {
          onSaveRow(editorState.section, { ...values, section: editorState.section }, rowId);
          return onCreateChildFromRow(rowId, { ...values, section: editorState.section }, draft);
        }}
        onImportActivityFromFile={onImportActivityFromFile}
        onOpenMolecule={onOpenMolecule}
        open={editorState.open && editorState.mode === "advanced"}
        project={project}
        section={editorState.section}
      />

      {helpOpen
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 px-4 py-6 backdrop-blur-md">
              <section
                aria-labelledby="inventory-help-title"
                aria-modal="true"
                className="hero-surface max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/70 p-5 shadow-2xl sm:p-6"
                role="dialog"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-ink" id="inventory-help-title">How inputs and outputs work</h3>
                    <p className="mt-3 text-sm leading-6 text-slate">
                      A Bill of Materials (BOM) (i.e., a list of materials needed to create a product/device) is often a useful starting point to identify the inputs of an activity. However, it typically does not include all the information needed to describe the activity and should therefore be supplemented with information on energy, water, equipment, and the outputs generated during the activity. The lists below present some examples of common inputs and outputs.
                    </p>
                  </div>
                  <button
                    aria-label="Close inputs and outputs help"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-mist text-lg text-slate transition hover:border-alert hover:text-alert"
                    onClick={() => setHelpOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <section className="border-l-2 border-sea/55 pl-4">
                    <h4 className="text-sm font-semibold text-ink">Inputs</h4>
                    <p className="mt-1 text-xs text-slate">Typical inputs may include:</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-5 text-slate">
                      <li>materials and components, potentially obtained from the BOM (also purchased devices);</li>
                      <li>use of equipment or infrastructure;</li>
                      <li>water supplied from the network;</li>
                      <li>electricity, heating energy and fuels;</li>
                      <li>resources taken directly from the environment (e.g. air from the room), if any.</li>
                    </ul>
                  </section>
                  <section className="border-l-2 border-accent pl-4">
                    <h4 className="text-sm font-semibold text-ink">Outputs</h4>
                    <p className="mt-1 text-xs text-slate">Typical outputs may include:</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-5 text-slate">
                      <li>main output (product, service or system);</li>
                      <li>co-products (i.e., products that cannot be dissociated from the main output), if any;</li>
                      <li>direct emissions to air, water or soil, if any;</li>
                      <li>generated waste, if any.</li>
                    </ul>
                  </section>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
