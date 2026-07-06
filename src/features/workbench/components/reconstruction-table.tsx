"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { PasDefaultsDialog } from "@/features/workbench/components/pas-defaults-dialog";
import { ReviewStatusIcon, ReviewStatusPill } from "@/features/workbench/components/review-status-icon";
import { RowEditorDialog } from "@/features/workbench/components/row-editor-dialog";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import { getLinkedMolecule, getRowInventoryReviewIssues, hasReferenceOutput, isReferenceProductRow } from "@/features/workbench/selectors";
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

type ReconstructionTableProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  onDeleteRow: (rowId: string) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: ReconstructionSection },
    draft: Partial<MoleculeDraft>,
  ) => void;
  onApplyPasDefaults: (profile: PasProfile) => void;
  onSaveRow: (section: ReconstructionSection, values: Partial<ReconstructionRow>, rowId?: string) => void;
  onRescale: () => void;
  onUpdateScaleField: (field: "scaleReferenceAmount" | "scaleTargetAmount" | "scaleUnit", value: string) => void;
  autoOpenSection?: ReconstructionSection | null;
  onAutoOpenHandled?: () => void;
};

type EditorState = {
  open: boolean;
  mode: "inline" | "advanced";
  section: ReconstructionSection;
  row: ReconstructionRow | null;
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

function normalizeUnit(value: string) {
  return value.trim().toLowerCase();
}

function compactRowPreview(row: ReconstructionRow) {
  const sourceText =
    row.synonyms.length > 0
      ? row.synonyms.slice(0, 3).join(", ")
      : row.notes || row.description || row.reference || "";
  const normalized = sourceText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "No short note yet";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function FlowTab({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-ink text-white shadow-sm" : "text-slate hover:bg-white hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-xs ${active ? "bg-white/15 text-white" : "bg-mist/70 text-slate"}`}>
        {count}
      </span>
    </button>
  );
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
      <div className="grid min-h-[18rem] lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="border-b border-mist/80 bg-lab/95 p-4 lg:border-b-0 lg:border-r">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">{modeLabel}</div>
          <div className="mt-4 space-y-2">
            <div className="rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-semibold text-ink">
              1. Flow
            </div>
            <div className="rounded-md border border-mist bg-white/65 px-3 py-2 text-sm font-medium text-slate">
              2. Amount
            </div>
            <div className="rounded-md border border-mist bg-white/65 px-3 py-2 text-sm font-medium text-slate">
              3. Dataset
            </div>
          </div>
          <div className="mt-4 rounded-md border border-mist bg-white px-3 py-2 text-xs leading-5 text-slate">
            Required fields are visible here. PubChem, ecoinvent lookup, and child activity creation stay in advanced details.
          </div>
        </aside>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist/80 pb-4">
            <div>
              <div className="text-xs font-semibold text-slate">{section === "INPUT" ? "Input to activity" : "Output from activity"}</div>
              <h3 className="mt-1 text-xl font-semibold text-ink">{row ? row.name || "Untitled row" : "New inventory flow"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-mist bg-white px-3 py-2 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!row}
                onClick={onAdvanced}
                type="button"
              >
                {row ? "Advanced details" : "Advanced after save"}
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

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-ink">Flow name</span>
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
                <span className="text-sm font-semibold text-ink">Item type</span>
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
                  <option value="generic_object">Generic object</option>
                  <option value="molecule">Molecule</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-ink">Ecoinvent status</span>
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

            <div className="rounded-md border border-mist bg-lab p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Preview</div>
              <div className="mt-3 text-sm font-semibold text-ink">{draft.name || "Unnamed flow"}</div>
              <div className="mt-2 text-sm text-slate">
                {draft.totalValue || "-"} {draft.unit || ""}
              </div>
              <div className="mt-4 rounded-md bg-white px-3 py-2 text-xs leading-5 text-slate">
                Scaled value: <span className="font-semibold text-ink">{scaledPreview || "-"}</span> {draft.unit || ""}
              </div>
              <StatusBadge label={resolutionLabels[draft.ecoinventStatus]} tone={resolutionTone(draft.ecoinventStatus)} />
            </div>
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
              className="rounded-md bg-ink px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
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
              Save row
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowTable({
  inlineEditor,
  molecule,
  onAdd,
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
  onAdd: () => void;
  onCancelInlineEditor: () => void;
  onDeleteRow: (rowId: string) => void;
  onOpenAdvancedEditor: (section: ReconstructionSection, row?: ReconstructionRow | null) => void;
  onOpenEditor: (section: ReconstructionSection, row?: ReconstructionRow | null) => void;
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
          <div className="rounded-lg border border-dashed border-mist bg-lab px-5 py-8">
            <div className="text-lg font-semibold text-ink">
              {section === "INPUT" ? "No input flows yet" : "No output flows yet"}
            </div>
            <div className="mt-2 max-w-2xl text-sm leading-6 text-slate">
              {section === "INPUT"
                ? "Add the materials, energy, auxiliaries, or upstream services needed by this activity."
                : "Add the reference product and any co-products, emissions, or wastes leaving this activity."}
            </div>
            <button
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink"
              onClick={onAdd}
              type="button"
            >
              Add first {section.toLowerCase()} row
            </button>
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
      <div className="overflow-x-auto rounded-lg border border-mist/80 bg-white">
      <table className={`w-full border-collapse ${showScaledColumn ? "min-w-[48rem]" : "min-w-[42rem]"}`}>
        <thead>
          <tr className="border-b border-mist/80 bg-lab text-left text-xs font-semibold text-slate">
            <th className={showScaledColumn ? "w-[32%] px-4 py-3" : "w-[38%] px-4 py-3"}>Flow</th>
            <th className="w-[12%] px-4 py-3">Amount</th>
            <th className="w-[10%] px-4 py-3">Unit</th>
            {showScaledColumn ? <th className="w-[14%] px-4 py-3">Scaled</th> : null}
            <th className="w-[18%] px-4 py-3">Review</th>
            <th className="w-[14%] px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const linkedMolecule = getLinkedMolecule(project, row);
            const missingLinkedOutput = Boolean(linkedMolecule && !hasReferenceOutput(linkedMolecule));
            const referenceProductOutput = isReferenceProductRow(molecule, row);
            const missingAmount = !row.totalValue.trim() && !referenceProductOutput;
            const reviewItems = getRowInventoryReviewIssues(project, molecule, row);

            const inlineOpenForRow = Boolean(inlineEditor?.row?.id === row.id && inlineEditor.section === section);

            return (
              <Fragment key={row.id}>
              <tr className={`border-b border-mist/60 align-top transition hover:bg-lab/55 ${inlineOpenForRow ? "bg-[#f3f7fb]" : ""}`}>
                <td className="px-4 py-4">
                  <div className="font-semibold text-ink">{row.name || "Untitled row"}</div>
                  <div className="mt-1 max-w-xl text-xs leading-5 text-slate">{compactRowPreview(row)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {hasMeaningfulRo(row.ro) ? <span className="text-[11px] font-medium text-slate">RO {row.ro}</span> : null}
                    {missingLinkedOutput ? <StatusBadge label="Missing reference output" tone="alert" /> : null}
                    {linkedMolecule ? (
                      <button
                        className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
                        onClick={() => onOpenMolecule(linkedMolecule.id)}
                        type="button"
                      >
                        Open activity
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-ink">
                  <span
                    className={
                      missingAmount
                        ? "inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800"
                        : ""
                    }
                  >
                    {row.totalValue || (referenceProductOutput ? "-" : "Missing")}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-ink">{row.unit || "-"}</td>
                {showScaledColumn ? (
                  <td className="px-4 py-4 text-sm font-semibold text-ink">{row.totalScaledValue || "-"}</td>
                ) : null}
                <td className="px-4 py-4">
                  <div className="flex flex-col gap-2">
                    {reviewItems.length > 0 ? (
                      reviewItems.slice(0, 2).map((item) => (
                        <ReviewStatusPill key={item.label} label={item.label} state={item.state} />
                      ))
                    ) : (
                      <ReviewStatusIcon state="ok" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-md border border-mist px-3 py-2 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
                      onClick={() => onOpenEditor(section, row)}
                      type="button"
                    >
                      Edit/check
                    </button>
                    <button
                      className="rounded-md border border-alert/20 px-3 py-2 text-xs font-semibold text-alert transition hover:bg-alert/10"
                      onClick={() => onDeleteRow(row.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {inlineOpenForRow ? (
                <tr key={`${row.id}-editor`} className="border-b border-mist/60 bg-[#f3f7fb]">
                  <td className="px-3 pb-4 pt-0" colSpan={showScaledColumn ? 6 : 5}>
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
  project,
  molecule,
  onDeleteRow,
  onOpenMolecule,
  onCreateChildFromRow,
  onApplyPasDefaults,
  onSaveRow,
  onRescale,
  onUpdateScaleField,
  autoOpenSection,
  onAutoOpenHandled,
}: ReconstructionTableProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    open: false,
    mode: "inline",
    section: "INPUT",
    row: null,
  });
  const [activeSection, setActiveSection] = useState<ReconstructionSection>("INPUT");
  const [pasDialogOpen, setPasDialogOpen] = useState(false);
  const [activityNotice, setActivityNotice] = useState("");
  const [referenceBasisOpen, setReferenceBasisOpen] = useState(false);
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
  const scaleUnit = molecule.scaleUnit || "kg";
  const referenceProductUnitMismatch = useMemo(() => {
    const referenceProductName = molecule.referenceProductName || molecule.name;
    const referenceRow =
      outputRows.find((row) => row.order === 1 && row.name.trim() === referenceProductName.trim()) ??
      outputRows[0] ??
      null;
    const referenceUnit = normalizeUnit(referenceRow?.unit || referenceRow?.scaledUnit || "");
    const normalizedScaleUnit = normalizeUnit(scaleUnit);

    if (!referenceRow || !referenceUnit || !normalizedScaleUnit || referenceUnit === normalizedScaleUnit) {
      return null;
    }

    return {
      name: referenceRow.name || "Reference product",
      unit: referenceRow.unit || referenceRow.scaledUnit,
    };
  }, [molecule.name, molecule.referenceProductName, outputRows, scaleUnit]);

  function openEditor(section: ReconstructionSection, row?: ReconstructionRow | null) {
    setActiveSection(section);
    setEditorState({
      open: true,
      mode: "advanced",
      section: row?.section ?? section,
      row: row ?? null,
    });
  }

  function openAdvancedEditor(section: ReconstructionSection, row?: ReconstructionRow | null) {
    setActiveSection(section);
    setEditorState({
      open: true,
      mode: "advanced",
      section: row?.section ?? section,
      row: row ?? null,
    });
  }

  function closeEditor() {
    setEditorState((current) => ({
      open: false,
      mode: "inline",
      section: current.section,
      row: null,
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

  return (
    <div className="space-y-5">
      <section className="panel-surface rounded-lg border border-white/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Inventory flows</h2>
            <div className="mt-1 text-sm text-slate">Enter physical flows first, then match datasets where available.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent"
              onClick={() => openEditor("INPUT")}
              type="button"
            >
              Add input
            </button>
            <button
              className="rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent"
              onClick={() => openEditor("OUTPUT")}
              type="button"
            >
              Add output
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-mist/80 bg-lab p-1">
          <FlowTab active={activeSection === "INPUT"} count={inputRows.length} label="Inputs" onClick={() => setActiveSection("INPUT")} />
          <FlowTab active={activeSection === "OUTPUT"} count={outputRows.length} label="Outputs" onClick={() => setActiveSection("OUTPUT")} />
        </div>

        <div className="mt-4">
          <RowTable
            inlineEditor={null}
            molecule={molecule}
            onAdd={() => openEditor(activeSection)}
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
      </section>

      {activityNotice ? (
        <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
          {activityNotice}
        </div>
      ) : null}

      <section className="panel-surface rounded-lg border border-white/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">Reference basis</h2>
            {referenceBasisOpen ? (
              <div className="mt-1 text-sm text-slate">Rescale rows to one consistent activity basis.</div>
            ) : null}
          </div>
          <button
            className="rounded-md border border-mist/80 bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent"
            onClick={() => setReferenceBasisOpen((current) => !current)}
            type="button"
          >
            {referenceBasisOpen ? "Close" : "Open"}
          </button>
        </div>

        {referenceBasisOpen ? (
          <>
            {referenceProductUnitMismatch ? (
              <div className="mt-4 rounded-lg border border-alert/25 bg-alert/10 px-4 py-3 text-sm leading-6 text-alert">
                <div className="font-semibold">Unit check failed</div>
                <div>
                  The reference product row uses {referenceProductUnitMismatch.unit}, while the activity scale unit is{" "}
                  {scaleUnit}. Align them before using rescaled values for comparison.
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-ink">Reference amount</span>
                <input
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => onUpdateScaleField("scaleReferenceAmount", event.target.value)}
                  value={molecule.scaleReferenceAmount}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Target amount</span>
                <input
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => onUpdateScaleField("scaleTargetAmount", event.target.value)}
                  value={molecule.scaleTargetAmount}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink">Unit</span>
                <input
                  className="mt-2 w-full rounded-lg border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => onUpdateScaleField("scaleUnit", event.target.value)}
                  value={molecule.scaleUnit}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-md border border-mist/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent"
                onClick={() => setPasDialogOpen(true)}
                type="button"
              >
                PAS defaults
              </button>
              <button
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink"
                onClick={() => {
                  onRescale();
                  setScaledColumnVisible(true);
                }}
                type="button"
              >
                Rescale rows
              </button>
            </div>
          </>
        ) : null}
      </section>

      <RowEditorDialog
        currentMolecule={molecule}
        initialRow={editorState.row}
        onClose={() =>
          setEditorState({
            open: false,
            mode: "inline",
            section: editorState.section,
            row: null,
          })
        }
        onSave={(values, rowId) => {
          onSaveRow(editorState.section, { ...values, section: editorState.section }, rowId);
          setEditorState({
            open: false,
            mode: "inline",
            section: editorState.section,
            row: null,
          });
        }}
        onCreateChildFromRow={(rowId, values, draft) => {
          onSaveRow(editorState.section, { ...values, section: editorState.section }, rowId);
          setEditorState({
            open: false,
            mode: "inline",
            section: editorState.section,
            row: null,
          });
          setActivityNotice("Activity created");
          window.setTimeout(() => setActivityNotice(""), 3000);
          onCreateChildFromRow(rowId, { ...values, section: editorState.section }, draft);
        }}
        open={editorState.open && editorState.mode === "advanced"}
        project={project}
        section={editorState.section}
      />

      <PasDefaultsDialog
        open={pasDialogOpen}
        referenceAmount={molecule.scaleReferenceAmount}
        scaleUnit={molecule.scaleUnit}
        onApply={(profile) => {
          onApplyPasDefaults(profile);
          setPasDialogOpen(false);
        }}
        onClose={() => setPasDialogOpen(false)}
      />
    </div>
  );
}
