"use client";

import { useEffect, useState } from "react";

import { DocumentationPanel } from "@/features/workbench/components/documentation-panel";
import { ReconstructionTable } from "@/features/workbench/components/reconstruction-table";
import type { InventoryFixRequest } from "@/features/workbench/components/reconstruction-table";
import { WorkspaceNavigator } from "@/features/workbench/components/workspace-navigator";
import type { PasProfile } from "@/features/workbench/pas-defaults";
import { getMoleculeInventoryReviewIssues } from "@/features/workbench/selectors";
import type { InventoryReviewIssue } from "@/features/workbench/selectors";
import type { ProjectValidationIssue } from "@/features/workbench/selectors";
import type {
  DocumentationRecord,
  MoleculeDraft,
  MoleculeRecord,
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
  onOpenMoleculeForFix: (moleculeId: string, section: ReconstructionSection) => void;
  onUpdateMoleculeField: (
    field:
      | "activityType"
      | "referenceProductName"
      | "name"
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
  ) => string;
  onImportActivityFromFile: (file: File, rowId: string, values: Partial<ReconstructionRow> & { section: ReconstructionSection }) => Promise<void>;
  onApplyPasDefaults: (profile: PasProfile) => void;
  onRescaleRows: () => void;
  autoOpenRowEditor?: ReconstructionSection | null;
  onAutoOpenRowEditorHandled?: () => void;
  projectIssueFocus?: ProjectValidationIssue | null;
  onProjectIssueFocusHandled?: () => void;
  searchFocusRequest?: InventoryFixRequest | null;
  onSearchFocusRequestHandled?: () => void;
};

type ActivityWorkspaceTab = "inputs" | "outputs" | "documentation";

function WorkspaceTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`h-10 border-b-2 px-3 text-sm font-semibold transition sm:px-4 ${
        active ? "border-[#e2e6eb] text-ink" : "border-transparent text-slate hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span>
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
  onOpenMoleculeForFix,
  onUpdateMoleculeField,
  onUpdateDocumentation,
  onDeleteRow,
  onSaveRow,
  onCreateChildFromRow,
  onImportActivityFromFile,
  onApplyPasDefaults,
  onRescaleRows,
  autoOpenRowEditor,
  onAutoOpenRowEditorHandled,
  projectIssueFocus,
  onProjectIssueFocusHandled,
  searchFocusRequest,
  onSearchFocusRequestHandled,
}: ObjectInventoryProps) {
  const [activeTab, setActiveTab] = useState<ActivityWorkspaceTab>("inputs");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fixRequest, setFixRequest] = useState<InventoryFixRequest | null>(null);
  const [documentationFocusRequest, setDocumentationFocusRequest] = useState(0);
  const referenceProductName = molecule.referenceProductName || molecule.name;
  const activityLabel = molecule.name || "Untitled activity";
  const inputCount = molecule.rows.filter((row) => row.section === "INPUT").length;
  const outputCount = molecule.rows.filter((row) => row.section === "OUTPUT").length;
  const reviewIssues = getMoleculeInventoryReviewIssues(project, molecule);

  function focusIssue(issue: InventoryReviewIssue) {
    if (issue.target === "documentation") {
      setActiveTab("documentation");
      setDocumentationFocusRequest((current) => current + 1);
      return;
    }

    if (issue.target === "linked-activity" && issue.linkedMoleculeId) {
      onOpenMoleculeForFix(issue.linkedMoleculeId, "OUTPUT");
      return;
    }

    setActiveTab(issue.section === "OUTPUT" || issue.target === "reference-output" ? "outputs" : "inputs");
    setFixRequest({
      key: Date.now(),
      kind: issue.rowId ? "row" : "add",
      section: issue.section ?? (issue.target === "reference-output" ? "OUTPUT" : "INPUT"),
      rowId: issue.rowId,
      panel: issue.target === "row-background" ? "dataset" : "details",
    });
  }

  useEffect(() => {
    if (!projectIssueFocus) return;

    if (projectIssueFocus.target.tab === "scope") {
      setActiveTab("documentation");
      setDocumentationFocusRequest((current) => current + 1);
      onProjectIssueFocusHandled?.();
      return;
    }

    const section = projectIssueFocus.target.tab === "outputs" ? "OUTPUT" : "INPUT";
    setActiveTab(projectIssueFocus.target.tab);
    setFixRequest({
      key: Date.now(),
      kind: projectIssueFocus.target.flowId ? "row" : "add",
      section,
      rowId: projectIssueFocus.target.flowId,
      panel: projectIssueFocus.target.field === "ecoinventDatasetId" || projectIssueFocus.target.field === "connection" ? "dataset" : "details",
      field: projectIssueFocus.target.field,
    });
    onProjectIssueFocusHandled?.();
  }, [onProjectIssueFocusHandled, projectIssueFocus]);

  useEffect(() => {
    if (!searchFocusRequest) return;
    setActiveTab(searchFocusRequest.section === "OUTPUT" ? "outputs" : "inputs");
    setFixRequest(searchFocusRequest);
    onSearchFocusRequestHandled?.();
  }, [onSearchFocusRequestHandled, searchFocusRequest]);

  return (
    <main className="min-h-screen bg-transparent px-3 py-3 text-ink sm:px-4 sm:py-4" data-tutorial="activity-page">
      <div className="mx-auto grid max-w-[112rem] gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="md:sticky md:top-4 md:h-[calc(100vh-2rem)] md:self-start" data-tutorial="activity-sidebar">
          <WorkspaceNavigator
            onBack={onBack}
            onOpenMolecule={onOpenMolecule}
            project={project}
            selectedMoleculeId={molecule.id}
          />
        </div>

        <div className="workspace-shell min-w-0 self-start overflow-hidden rounded-xl border border-mist/60 bg-white" data-tutorial="activity-workspace">
          <header className="bg-white">
            <div className="relative px-5 py-4 pr-16 sm:px-6 sm:pr-16">
              <button
                aria-label={`Delete activity ${activityLabel}`}
                className="absolute right-5 top-4 grid h-9 w-9 place-items-center rounded-md border border-transparent text-slate transition hover:border-alert/25 hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/40 sm:right-6"
                onClick={onDelete}
                title="Delete activity"
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
                  <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="max-w-5xl break-words text-xl font-semibold leading-tight text-ink sm:text-2xl">
                    {activityLabel}
                  </h1>
                  <button
                    aria-expanded={settingsOpen}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate transition hover:bg-lab hover:text-ink"
                    onClick={() => setSettingsOpen((current) => !current)}
                    type="button"
                  >
                    <span aria-hidden="true">✎</span>
                    {settingsOpen ? "Done" : "Edit activity"}
                  </button>
                </div>

                {settingsOpen ? (
                  <div className="mt-4 max-w-4xl rounded-lg border border-mist bg-lab/45 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1fr)]">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate">Activity name</span>
                        <input
                          aria-label="Activity name"
                          className="mt-2 h-10 w-full rounded-md border border-mist bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-accent"
                          onChange={(event) => onUpdateMoleculeField("name", event.target.value)}
                          placeholder="Production of research concrete"
                          value={molecule.name}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate">Main output</span>
                        <input
                          aria-describedby="main-output-rename-note"
                          aria-label="Main output"
                          className="mt-2 h-10 w-full rounded-md border border-mist bg-white px-3 text-sm font-medium text-ink outline-none transition focus:border-accent"
                          onChange={(event) => onUpdateMoleculeField("referenceProductName", event.target.value)}
                          placeholder="Main output name"
                          value={referenceProductName}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <p className="text-xs leading-5 text-slate" id="main-output-rename-note">
                        Changing the main output also renames the activity’s primary output.
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate">
                  {reviewIssues.length > 0 ? (
                    <details className="relative">
                      <summary className="cursor-pointer list-none font-semibold text-[#e8796f] hover:text-alert">
                        {reviewIssues.length} issue{reviewIssues.length === 1 ? "" : "s"} · View
                      </summary>
                      <div className="theme-popover absolute left-0 z-30 mt-2 grid w-[min(34rem,calc(100vw-3rem))] gap-1 rounded-lg border border-mist p-2">
                        {reviewIssues.map((issue) => (
                          <button
                            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate transition hover:bg-white/5 hover:text-ink"
                            key={`${issue.state}-${issue.label}-${issue.rowId ?? issue.target}`}
                            onClick={(event) => {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                              focusIssue(issue);
                            }}
                            type="button"
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${issue.state === "alert" ? "bg-alert" : "bg-scale-2"}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{issue.label}</span>
                              {issue.rowName ? <span className="block truncate text-xs text-slate/75">{issue.rowName}</span> : null}
                            </span>
                            <span className="text-xs font-semibold text-alert">Fix →</span>
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>

            </div>

            <div className="tab-strip flex gap-3 border-b border-mist/70 px-3 sm:px-5">
              <WorkspaceTab
                active={activeTab === "inputs"}
                label={`Inputs · ${inputCount}`}
                onClick={() => setActiveTab("inputs")}
              />
              <WorkspaceTab
                active={activeTab === "outputs"}
                label={`Outputs · ${outputCount}`}
                onClick={() => setActiveTab("outputs")}
              />
              <WorkspaceTab
                active={activeTab === "documentation"}
                label="Scope & sources"
                onClick={() => setActiveTab("documentation")}
              />
            </div>

          </header>

          <div className="workspace-pane min-w-0" key={activeTab}>
            {activeTab !== "documentation" ? (
              <ReconstructionTable
                activeSection={activeTab === "outputs" ? "OUTPUT" : "INPUT"}
                autoOpenSection={autoOpenRowEditor}
                molecule={molecule}
                onApplyPasDefaults={onApplyPasDefaults}
                onAutoOpenHandled={onAutoOpenRowEditorHandled}
                onCreateChildFromRow={onCreateChildFromRow}
                onImportActivityFromFile={onImportActivityFromFile}
                onDeleteRow={onDeleteRow}
                onOpenMolecule={onOpenMolecule}
                onRescale={onRescaleRows}
                onSaveRow={onSaveRow}
                onUpdateScaleField={(field, value) => onUpdateMoleculeField(field, value)}
                project={project}
                fixRequest={fixRequest}
                onFixRequestHandled={() => setFixRequest(null)}
              />
            ) : (
              <DocumentationPanel
                documentation={molecule.documentation}
                focusMissingField={documentationFocusRequest}
                moleculeNotes={molecule.notes}
                onChange={onUpdateDocumentation}
                onNotesChange={(value) => onUpdateMoleculeField("notes", value)}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
