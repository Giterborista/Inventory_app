"use client";

import { useMemo, useState } from "react";

import { PasDefaultsDialog } from "@/features/workbench/components/pas-defaults-dialog";
import { RowEditorDialog } from "@/features/workbench/components/row-editor-dialog";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import { getLinkedMolecule } from "@/features/workbench/selectors";
import type { PasProfile } from "@/features/workbench/pas-defaults";
import type {
  MoleculeDraft,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
} from "@/features/workbench/types";

function hasMeaningfulRo(value: string) {
  const normalized = value.trim();
  return Boolean(normalized && normalized !== "-" && normalized !== "–" && normalized !== "—");
}

type ReconstructionTableProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: "up" | "down") => void;
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
};

type EditorState = {
  open: boolean;
  section: ReconstructionSection;
  row: ReconstructionRow | null;
};

function SectionBlock({
  section,
  project,
  molecule,
  rows,
  onDeleteRow,
  onMoveRow,
  onOpenMolecule,
  onOpenEditor,
}: {
  section: ReconstructionSection;
  project: ProjectRecord;
  molecule: MoleculeRecord;
  rows: ReconstructionRow[];
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: "up" | "down") => void;
  onOpenMolecule: (moleculeId: string) => void;
  onOpenEditor: (section: ReconstructionSection, row?: ReconstructionRow | null) => void;
}) {
  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist/80 px-6 py-5">
        <div>
          <div className="section-title">{section === "INPUT" ? "Upstream inventory" : "Output inventory"}</div>
          <h3 className="mt-2 text-[1.45rem] font-semibold text-ink">{section}</h3>
          <p className="mt-2 text-sm leading-6 text-slate">
            {section === "INPUT"
              ? "Materials, utilities, and upstream molecules used to reconstruct this molecule."
              : "Main products, co-products, wastes, and other outputs for this molecule."}
          </p>
        </div>
        <button
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition hover:bg-ink"
          onClick={() => onOpenEditor(section)}
          type="button"
        >
          Add {section.toLowerCase()} row
        </button>
      </div>

      <div className="px-6 py-4">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-mist/80 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">
              <th className="w-[21%] px-3 py-3">Molecule / item</th>
              <th className="w-[8%] px-3 py-3">Reaction</th>
              <th className="w-[8%] px-3 py-3">Cleaning</th>
              <th className="w-[8%] px-3 py-3">Total qty</th>
              <th className="w-[8%] px-3 py-3">Unit</th>
              <th className="w-[9%] px-3 py-3">Rescaled</th>
              <th className="w-[11%] px-3 py-3">CAS / IUPAC</th>
              <th className="w-[15%] px-3 py-3">Reference / description</th>
              <th className="w-[10%] px-3 py-3">Link / status</th>
              <th className="w-[12%] px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-sm text-slate" colSpan={10}>
                  No {section.toLowerCase()} rows yet.
                </td>
              </tr>
            ) : null}

            {rows.map((row) => {
              const linkedMolecule = getLinkedMolecule(project, row);

              return (
                <tr key={row.id} className="border-b border-mist/60 align-top transition hover:bg-lab/50">
                  <td className="px-3 py-4">
                    <div className="font-medium text-ink">{row.name || "Untitled row"}</div>
                    {row.synonyms.length > 0 ? (
                      <div className="mt-1 text-xs text-slate">
                        Synonyms: {row.synonyms.slice(0, 6).join(", ")}
                        {row.synonyms.length > 6 ? "…" : ""}
                      </div>
                    ) : null}
                    <div className="mt-1 text-xs text-slate">{row.notes || row.description || "No notes"}</div>
                    {hasMeaningfulRo(row.ro) ? <div className="mt-1 text-[11px] text-slate">RO {row.ro}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {linkedMolecule ? (
                        <>
                          <StatusBadge
                            label={linkedMolecule.placeholder ? "Linked placeholder" : "Linked molecule"}
                            tone={linkedMolecule.placeholder ? "alert" : "accent"}
                          />
                          <button
                            className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                            onClick={() => onOpenMolecule(linkedMolecule.id)}
                            type="button"
                          >
                            Open linked
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate">Standalone item</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-sm text-ink">{row.reactionValue || "—"}</td>
                  <td className="px-3 py-4 text-sm text-ink">{row.cleaningValue || "—"}</td>
                  <td className="px-3 py-4 text-sm text-ink">{row.totalValue || "—"}</td>
                  <td className="px-3 py-4 text-sm text-ink">{row.unit || "—"}</td>
                  <td className="px-3 py-4 text-sm font-semibold text-ink">{row.totalScaledValue || "—"}</td>
                  <td className="px-3 py-4 text-sm text-slate">
                    <div className="font-mono">{row.cas || "—"}</div>
                    {row.iupac ? <div className="mt-1 text-xs">{row.iupac}</div> : null}
                    {row.smiles ? <div className="mt-1 break-all font-mono text-[11px]">{row.smiles}</div> : null}
                  </td>
                  <td className="px-3 py-4 text-sm text-slate">
                    <div>{row.reference || "—"}</div>
                    {row.description ? <div className="mt-1 text-xs">{row.description}</div> : null}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-col gap-2">
                      <StatusBadge
                        label={resolutionLabels[row.ecoinventStatus]}
                        tone={resolutionTone(row.ecoinventStatus)}
                      />
                      {row.ecoinventName ? <div className="text-xs text-slate">{row.ecoinventName}</div> : null}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="rounded-full border border-mist px-3 py-2 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => onOpenEditor(section, row)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-full border border-mist px-3 py-2 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => onMoveRow(row.id, "up")}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        className="rounded-full border border-mist px-3 py-2 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => onMoveRow(row.id, "down")}
                        type="button"
                      >
                        Down
                      </button>
                      <button
                        className="rounded-full border border-alert/20 px-3 py-2 text-xs font-medium text-alert transition hover:bg-alert/10"
                        onClick={() => onDeleteRow(row.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReconstructionTable({
  project,
  molecule,
  onDeleteRow,
  onMoveRow,
  onOpenMolecule,
  onCreateChildFromRow,
  onApplyPasDefaults,
  onSaveRow,
  onRescale,
  onUpdateScaleField,
}: ReconstructionTableProps) {
  const [editorState, setEditorState] = useState<EditorState>({
    open: false,
    section: "INPUT",
    row: null,
  });
  const [pasDialogOpen, setPasDialogOpen] = useState(false);

  const inputRows = useMemo(
    () => molecule.rows.filter((row) => row.section === "INPUT").sort((a, b) => a.order - b.order),
    [molecule.rows],
  );
  const outputRows = useMemo(
    () => molecule.rows.filter((row) => row.section === "OUTPUT").sort((a, b) => a.order - b.order),
    [molecule.rows],
  );

  const openEditor = (section: ReconstructionSection, row?: ReconstructionRow | null) => {
    setEditorState({
      open: true,
      section: row?.section ?? section,
      row: row ?? null,
    });
  };

  return (
    <div className="space-y-6">
      <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="section-title">Reconstruction workspace</div>
            <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">INPUT / OUTPUT reconstruction table</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Keep reaction, cleaning, total, and rescaled totals visible together, and link rows directly to existing molecules when traceability is needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-mist/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent"
              onClick={() => setPasDialogOpen(true)}
              type="button"
            >
              Apply PAS defaults
            </button>
            <button
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition hover:bg-ink"
              onClick={onRescale}
              type="button"
            >
              Rescale everything
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,0.8fr)_auto]">
          <label className="block">
            <span className="text-sm font-medium text-ink">Reference amount</span>
            <input
              className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => onUpdateScaleField("scaleReferenceAmount", event.target.value)}
              value={molecule.scaleReferenceAmount}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Target amount</span>
            <input
              className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => onUpdateScaleField("scaleTargetAmount", event.target.value)}
              value={molecule.scaleTargetAmount}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Scale unit</span>
            <input
              className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => onUpdateScaleField("scaleUnit", event.target.value)}
              value={molecule.scaleUnit}
            />
          </label>
          <div className="rounded-2xl border border-mist/80 bg-lab px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Current basis</div>
            <div className="mt-1 text-sm text-ink">
              {molecule.scaleTargetAmount} {molecule.scaleUnit}
            </div>
          </div>
        </div>
      </section>

      <SectionBlock
        molecule={molecule}
        onDeleteRow={onDeleteRow}
        onMoveRow={onMoveRow}
        onOpenEditor={openEditor}
        onOpenMolecule={onOpenMolecule}
        project={project}
        rows={inputRows}
        section="INPUT"
      />

      <SectionBlock
        molecule={molecule}
        onDeleteRow={onDeleteRow}
        onMoveRow={onMoveRow}
        onOpenEditor={openEditor}
        onOpenMolecule={onOpenMolecule}
        project={project}
        rows={outputRows}
        section="OUTPUT"
      />

      <RowEditorDialog
        currentMolecule={molecule}
        initialRow={editorState.row}
        onClose={() =>
          setEditorState({
            open: false,
            section: editorState.section,
            row: null,
          })
        }
        onSave={(values, rowId) => {
          onSaveRow(values.section ?? editorState.section, values, rowId);
          setEditorState({
            open: false,
            section: values.section ?? editorState.section,
            row: null,
          });
        }}
        onCreateChildFromRow={(rowId, values, draft) => {
          onSaveRow(values.section ?? editorState.section, values, rowId);
          setEditorState({
            open: false,
            section: values.section ?? editorState.section,
            row: null,
          });
          onCreateChildFromRow(rowId, values, draft);
        }}
        open={editorState.open}
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
