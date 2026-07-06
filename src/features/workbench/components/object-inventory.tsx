"use client";

import { useState } from "react";

import { DocumentationPanel } from "@/features/workbench/components/documentation-panel";
import { ReconstructionTable } from "@/features/workbench/components/reconstruction-table";
import { WorkspaceNavigator } from "@/features/workbench/components/workspace-navigator";
import type { PasProfile } from "@/features/workbench/pas-defaults";
import type {
  DocumentationRecord,
  MoleculeRecord,
  MoleculeDraft,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
  ReviewStatus,
} from "@/features/workbench/types";

type ObjectInventoryProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  onBack: () => void;
  onDelete: () => void;
  onSaveProjectJson: () => void;
  onOpenMolecule: (moleculeId: string) => void;
  onUpdateMoleculeField: (
    field:
      | "activityType"
      | "referenceProductName"
      | "objectKind"
      | "name"
      | "cas"
      | "iupac"
      | "smiles"
      | "notes"
      | "synonyms"
      | "ecoinventAliases"
      | "reviewStatus"
      | "needsReview"
      | "topLevel"
      | "scaleReferenceAmount"
      | "scaleTargetAmount"
      | "scaleUnit",
    value: string | string[] | ReviewStatus | boolean,
  ) => void;
  onUpdateDocumentation: (
    field: keyof DocumentationRecord,
    value: DocumentationRecord[keyof DocumentationRecord],
  ) => void;
  onDeleteRow: (rowId: string) => void;
  onSaveRow: (section: "INPUT" | "OUTPUT", values: Partial<ReconstructionRow>, rowId?: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: "INPUT" | "OUTPUT" },
    draft: Partial<MoleculeDraft>,
  ) => void;
  onApplyPasDefaults: (profile: PasProfile) => void;
  onRescaleRows: () => void;
  autoOpenRowEditor?: ReconstructionSection | null;
  onAutoOpenRowEditorHandled?: () => void;
};

type ActivityWorkspaceTab = "inventory" | "documentation";

function WorkflowButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
        active
          ? "border-white bg-white text-ink shadow-sm"
          : "border-white/12 bg-white/8 text-white/72 hover:bg-white/12 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span className={`mt-1 block text-xs ${active ? "text-slate" : "text-white/52"}`}>{meta}</span>
    </button>
  );
}

export function ObjectInventory({
  project,
  molecule,
  onBack,
  onDelete,
  onSaveProjectJson,
  onOpenMolecule,
  onUpdateMoleculeField,
  onUpdateDocumentation,
  onDeleteRow,
  onSaveRow,
  onCreateChildFromRow,
  onApplyPasDefaults,
  onRescaleRows,
  autoOpenRowEditor,
  onAutoOpenRowEditorHandled,
}: ObjectInventoryProps) {
  const [activeTab, setActiveTab] = useState<ActivityWorkspaceTab>("inventory");
  const referenceProductName = molecule.referenceProductName || molecule.name;
  const activityType = molecule.activityType || "Production of";
  const activityLabel = `${activityType} ${referenceProductName || "untitled reference product"}`.trim();
  const inputCount = molecule.rows.filter((row) => row.section === "INPUT").length;
  const outputCount = molecule.rows.filter((row) => row.section === "OUTPUT").length;
  const uncheckedCount = molecule.rows.filter((row) => row.ecoinventStatus === "unchecked").length;
  const documentationDone = Boolean(
    molecule.notes.trim() ||
      molecule.documentation.referenceAndScope.trim() ||
      molecule.documentation.functionalUnit.trim() ||
      molecule.documentation.pasAssumptions.trim() ||
      molecule.documentation.calculationNotes.trim(),
  );

  return (
    <main className="min-h-screen px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-[112rem] gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <WorkspaceNavigator
            onBack={onBack}
            onOpenMolecule={onOpenMolecule}
            project={project}
            selectedMoleculeId={molecule.id}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Work on this activity</div>
            <div className="mt-3 space-y-2">
              <WorkflowButton
                active={activeTab === "inventory"}
                label="Inventory flows"
                meta={`${inputCount} input${inputCount === 1 ? "" : "s"} / ${outputCount} output${outputCount === 1 ? "" : "s"}`}
                onClick={() => setActiveTab("inventory")}
              />
              <WorkflowButton
                active={activeTab === "documentation"}
                label="Documentation"
                meta={documentationDone ? "Evidence started" : "Needs source notes"}
                onClick={() => setActiveTab("documentation")}
              />
            </div>
          </WorkspaceNavigator>
        </div>

        <div className="min-w-0 space-y-6">
          <section className="panel-surface rounded-lg border border-mist p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate">Activity</div>
                <h1 className="mt-1 max-w-5xl break-words text-2xl font-semibold text-ink md:text-3xl">
                  {activityLabel}
                </h1>
                <div className="mt-2 text-sm text-slate">
                  {inputCount} input{inputCount === 1 ? "" : "s"} / {outputCount} output{outputCount === 1 ? "" : "s"}
                  {uncheckedCount > 0 ? ` / ${uncheckedCount} open dataset check${uncheckedCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-md border border-alert/20 bg-white px-4 py-2.5 text-sm font-medium text-alert transition hover:bg-alert/10"
                  onClick={onDelete}
                  type="button"
                >
                  Delete activity
                </button>
                <button
                  className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink"
                  onClick={onSaveProjectJson}
                  type="button"
                >
                  Save project JSON
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-mist bg-lab p-4">
              <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
                <label className="block">
                  <span className="text-sm font-medium text-ink">Activity type</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-mist/80 bg-lab px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateMoleculeField("activityType", event.target.value)}
                    placeholder="Production of"
                    value={activityType}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">Produced item</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateMoleculeField("referenceProductName", event.target.value)}
                    value={referenceProductName}
                  />
                </label>
              </div>
            </div>

          </section>

          {activeTab === "inventory" ? (
            <ReconstructionTable
              molecule={molecule}
              onDeleteRow={onDeleteRow}
              onOpenMolecule={onOpenMolecule}
              onCreateChildFromRow={onCreateChildFromRow}
              onApplyPasDefaults={onApplyPasDefaults}
              onRescale={onRescaleRows}
              onSaveRow={onSaveRow}
              onUpdateScaleField={(field, value) => onUpdateMoleculeField(field, value)}
              autoOpenSection={autoOpenRowEditor}
              onAutoOpenHandled={onAutoOpenRowEditorHandled}
              project={project}
            />
          ) : (
            <DocumentationPanel
              documentation={molecule.documentation}
              moleculeNotes={molecule.notes}
              onChange={onUpdateDocumentation}
              onNotesChange={(value) => onUpdateMoleculeField("notes", value)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
