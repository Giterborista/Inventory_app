"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { HierarchyTree } from "@/features/workbench/components/hierarchy-tree";
import { InterconnectionGraph } from "@/features/workbench/components/interconnection-graph";
import { ProjectChecksDrawer, type ProjectChecksFilter } from "@/features/workbench/components/project-checks-drawer";
import { ThemeToggle } from "@/features/workbench/components/theme-toggle";
import { getHierarchyVisibleIds } from "@/features/workbench/selectors";
import type { ProjectValidationIssue } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type DashboardProps = {
  project: ProjectRecord;
  filteredMolecules: MoleculeRecord[];
  unresolvedMolecules: MoleculeRecord[];
  searchQuery: string;
  isExportingProjectPdf?: boolean;
  browserDraftRecovered?: boolean;
  saveStatusLabel: string;
  projectIssues: ProjectValidationIssue[];
  projectChecksOpen: boolean;
  projectChecksFilter: ProjectChecksFilter;
  projectChecksActivityId: string;
  onSearchQueryChange: (value: string) => void;
  onUpdateProjectName: (value: string) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateMolecule: (parentMoleculeId?: string) => void;
  onOpenProjectJson: (file: File) => void;
  onOpenProjectReport: () => void;
  onSaveProjectJson: () => void;
  onNewProject: () => void;
  onProjectChecksOpenChange: (open: boolean) => void;
  onProjectChecksFilterChange: (filter: ProjectChecksFilter) => void;
  onProjectChecksActivityChange: (activityId: string) => void;
  onOpenProjectIssue: (issue: ProjectValidationIssue) => void;
};

type IconName =
  | "activity"
  | "alert"
  | "check"
  | "file"
  | "folder"
  | "graph"
  | "layers"
  | "plus"
  | "save"
  | "search"
  | "tree";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    activity: (
      <>
        <path d="M4 8.5h16" />
        <path d="M7 5.5h10" />
        <path d="M6 8.5v9.8A1.7 1.7 0 0 0 7.7 20h8.6a1.7 1.7 0 0 0 1.7-1.7V8.5" />
        <path d="M9 13h6" />
        <path d="M9 16h4" />
      </>
    ),
    alert: (
      <>
        <path d="M12 4.2 21 19H3L12 4.2Z" />
        <path d="M12 9v4" />
        <path d="M12 16.5h.01" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12.3 2.2 2.2 4.8-5" />
      </>
    ),
    file: (
      <>
        <path d="M7 3.5h6l4 4V20H7V3.5Z" />
        <path d="M13 3.5V8h4" />
        <path d="M9.5 12h5" />
        <path d="M9.5 15h5" />
      </>
    ),
    folder: (
      <>
        <path d="M3.5 7.5h6l1.7 2h9.3v7.8A2.7 2.7 0 0 1 17.8 20H6.2a2.7 2.7 0 0 1-2.7-2.7V7.5Z" />
        <path d="M3.5 7.5V6A2 2 0 0 1 5.5 4h3.1l1.7 2h6.2A2 2 0 0 1 18.5 8" />
      </>
    ),
    graph: (
      <>
        <circle cx="6.5" cy="7" r="2.5" />
        <circle cx="17.5" cy="7" r="2.5" />
        <circle cx="12" cy="17" r="2.5" />
        <path d="m8.7 8.2 6.6 6.3" />
        <path d="m15.3 8.2-6.6 6.3" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3.5 8.5 4.3L12 12.2 3.5 7.8 12 3.5Z" />
        <path d="m5 12 7 3.6 7-3.6" />
        <path d="m5 16 7 3.6 7-3.6" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    save: (
      <>
        <path d="M5 4h12l2 2v14H5V4Z" />
        <path d="M8 4v6h8V4" />
        <path d="M8 20v-6h8v6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="5.8" />
        <path d="m15 15 4.5 4.5" />
      </>
    ),
    tree: (
      <>
        <path d="M12 4v5" />
        <path d="M7 13H5.8A2.8 2.8 0 0 1 3 10.2V9" />
        <path d="M17 13h1.2A2.8 2.8 0 0 0 21 10.2V9" />
        <path d="M12 9v11" />
        <path d="M8 20h8" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="5" cy="13" r="2" />
        <circle cx="19" cy="13" r="2" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

function ViewTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-accent-soft text-accent ring-1 ring-accent/25" : "text-slate/80 hover:bg-white/[0.035] hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function SidebarAction({
  disabled,
  icon,
  label,
  onClick,
  outlined = false,
}: {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
  outlined?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-10 w-full items-center justify-start gap-3 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        outlined
          ? "border border-mist/60 text-ink hover:bg-white/[0.035]"
          : "text-slate/75 hover:bg-white/[0.035] hover:text-ink"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

export function Dashboard({
  project,
  filteredMolecules,
  unresolvedMolecules,
  searchQuery,
  isExportingProjectPdf = false,
  browserDraftRecovered = false,
  saveStatusLabel,
  projectIssues,
  projectChecksOpen,
  projectChecksFilter,
  projectChecksActivityId,
  onSearchQueryChange,
  onUpdateProjectName,
  onOpenMolecule,
  onCreateParentMolecule,
  onCreateMolecule,
  onOpenProjectJson,
  onOpenProjectReport,
  onSaveProjectJson,
  onNewProject,
  onProjectChecksOpenChange,
  onProjectChecksFilterChange,
  onProjectChecksActivityChange,
  onOpenProjectIssue,
}: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<"hierarchy" | "graph">("hierarchy");
  const [selectedStructureMoleculeId, setSelectedStructureMoleculeId] = useState("");
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const visibleIds = getHierarchyVisibleIds(project, filteredMolecules);
  const hasActivities = project.molecules.length > 0;
  const affectedActivityCount = new Set(projectIssues.map((issue) => issue.activityId)).size;
  useEffect(() => {
    if (selectedStructureMoleculeId && !project.molecules.some((molecule) => molecule.id === selectedStructureMoleculeId)) {
      setSelectedStructureMoleculeId("");
    }
  }, [project.molecules, selectedStructureMoleculeId]);
  return (
    <main className="min-h-screen bg-transparent px-3 py-3 text-ink sm:px-4 sm:py-4">
      <div className="mx-auto grid max-w-[112rem] gap-4 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
        <aside className="theme-sidebar h-fit overflow-hidden rounded-xl border border-mist/40 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:self-start">
          <div className="border-b border-mist/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-bold tracking-wide text-white">LCI</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">Inventory Builder</div>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-1">
              <SidebarAction icon="folder" label="Open project file" onClick={() => fileInputRef.current?.click()} outlined />
              {hasActivities ? (
                <>
                  <SidebarAction icon="save" label="Download project" onClick={onSaveProjectJson} />
                  <SidebarAction
                    disabled={isExportingProjectPdf}
                    icon="file"
                    label={isExportingProjectPdf ? "Creating report..." : "Create PDF report"}
                    onClick={onOpenProjectReport}
                  />
                </>
              ) : null}
              <SidebarAction icon="layers" label="New project" onClick={onNewProject} />
            </div>
          </div>

          <div className="mx-3 px-3 py-2 text-[11px] leading-5 text-slate/70">
            {saveStatusLabel}
          </div>

          {hasActivities ? <label className="relative mx-3 mt-4 block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate/60">
              <Icon name="search" />
            </span>
            <input
              className="h-10 w-full rounded-md border border-mist/60 bg-transparent px-10 text-sm text-ink outline-none transition focus:border-slate focus:bg-white/5"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search activities"
              value={searchQuery}
            />
          </label> : null}

        </aside>

        <div className="min-w-0">
          <header className="border-b border-mist/60 px-1 pb-3 pt-1 sm:px-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
              <label className="block min-w-0">
                <input
                  aria-label="Project name"
                  className="w-full max-w-4xl rounded-sm border border-transparent bg-transparent px-1 py-1 text-lg font-semibold leading-tight text-ink outline-none transition hover:border-mist/60 focus:border-slate sm:text-xl"
                  onChange={(event) => onUpdateProjectName(event.target.value)}
                  value={project.name}
                />
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate">
                <span><strong className="font-semibold text-ink">{project.molecules.length}</strong> activities</span>
                {browserDraftRecovered ? <span className="text-sea">Previous work recovered</span> : null}
              </div>
              </div>
              {hasActivities ? (
                <button
                  aria-label={projectIssues.length > 0 ? `Open project checks: ${projectIssues.length} issue${projectIssues.length === 1 ? "" : "s"} across ${affectedActivityCount} activit${affectedActivityCount === 1 ? "y" : "ies"}` : "Open project checks: no issues found"}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition ${projectIssues.length > 0 ? "border-alert/35 text-alert hover:bg-alert/10" : "border-mist/70 text-sea hover:bg-lab"}`}
                  onClick={() => {
                    onProjectChecksActivityChange("");
                    onProjectChecksOpenChange(true);
                  }}
                  type="button"
                >
                  <Icon name={projectIssues.length > 0 ? "alert" : "check"} />
                  <span aria-live="polite">
                    {projectIssues.length > 0
                      ? `${projectIssues.length} issue${projectIssues.length === 1 ? "" : "s"} across ${affectedActivityCount} activit${affectedActivityCount === 1 ? "y" : "ies"}`
                      : "No issues found"}
                  </span>
                </button>
              ) : null}
            </div>
          </header>

          <section className="mt-3 min-w-0 overflow-hidden rounded-xl border border-mist/60 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist/60 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">Project structure</h2>
                <p className="mt-0.5 text-sm text-slate">Build and navigate the activity hierarchy.</p>
              </div>
              {hasActivities ? <div className="flex flex-wrap items-center gap-2">
                <div aria-label="Structure view" className="flex items-center gap-1 rounded-lg border border-mist/60 bg-lab p-1">
                  <ViewTab active={activeView === "hierarchy"} icon="tree" label="Tree" onClick={() => setActiveView("hierarchy")} />
                  <ViewTab active={activeView === "graph"} icon="graph" label="Graph" onClick={() => setActiveView("graph")} />
                </div>
                <label className="inline-flex h-10 items-center gap-2 rounded-md border border-mist/60 px-3 text-xs font-semibold text-slate transition hover:text-ink">
                  <input checked={showAllIngredients} className="h-4 w-4 rounded border-mist text-accent focus:ring-accent" onChange={(event) => setShowAllIngredients(event.target.checked)} type="checkbox" />
                  Show inputs
                </label>
                {selectedStructureMoleculeId ? (
                  <button className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-xs font-semibold text-white transition hover:bg-[#ad4141]" onClick={() => onCreateMolecule(selectedStructureMoleculeId)} type="button">
                    + Add child activity
                  </button>
                ) : null}
              </div> : null}
            </div>
            {activeView === "hierarchy" ? (
              <HierarchyTree
                onCreateParentMolecule={onCreateParentMolecule}
                onCreateTopLevelMolecule={() => onCreateMolecule()}
                onOpenMolecule={onOpenMolecule}
                onSelectMolecule={setSelectedStructureMoleculeId}
                onOpenActivityIssues={(activityId) => {
                  onProjectChecksActivityChange(activityId);
                  onProjectChecksOpenChange(true);
                }}
                projectIssues={projectIssues}
                project={project}
                selectedMoleculeId={selectedStructureMoleculeId}
                showAllIngredients={showAllIngredients}
                visibleIds={visibleIds}
              />
            ) : (
              <InterconnectionGraph onOpenMolecule={onOpenMolecule} project={project} showInputs={showAllIngredients} visibleIds={visibleIds} />
            )}
          </section>

        </div>

        <input
          ref={fileInputRef}
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onOpenProjectJson(file);
              event.target.value = "";
            }
          }}
          type="file"
        />
      </div>
      <ProjectChecksDrawer
        activityFilterId={projectChecksActivityId}
        filter={projectChecksFilter}
        issues={projectIssues}
        onClearActivityFilter={() => onProjectChecksActivityChange("")}
        onClose={() => onProjectChecksOpenChange(false)}
        onFilterChange={onProjectChecksFilterChange}
        onOpenIssue={onOpenProjectIssue}
        open={projectChecksOpen}
        project={project}
      />
    </main>
  );
}
