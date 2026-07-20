"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { HierarchyTree } from "@/features/workbench/components/hierarchy-tree";
import { InterconnectionGraph } from "@/features/workbench/components/interconnection-graph";
import { ProjectChecksDrawer, type ProjectChecksFilter } from "@/features/workbench/components/project-checks-drawer";
import { ThemeToggle } from "@/features/workbench/components/theme-toggle";
import { getHierarchyVisibleIds } from "@/features/workbench/selectors";
import type { ProjectSearchResult, ProjectValidationIssue } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";
import valueChainImage from "../../../../Pictures/Picture1.png";

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
  searchResults: ProjectSearchResult[];
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
  onOpenSearchResult: (result: ProjectSearchResult) => void;
  onStartTutorial: () => void;
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
  primary = false,
}: {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
  outlined?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-10 w-full items-center justify-start gap-3 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        primary
          ? "bg-accent text-white hover:bg-[#ad4141]"
          : outlined
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
  searchResults,
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
  onOpenSearchResult,
  onStartTutorial,
}: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<"hierarchy" | "graph">("hierarchy");
  const [selectedStructureMoleculeId, setSelectedStructureMoleculeId] = useState("");
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [valueChainHelpOpen, setValueChainHelpOpen] = useState(false);
  const visibleIds = getHierarchyVisibleIds(project, filteredMolecules);
  const hasActivities = project.molecules.length > 0;
  const affectedActivityCount = new Set(projectIssues.map((issue) => issue.activityId)).size;
  const disconnectedActivityIds = new Set(
    projectIssues
      .filter((issue) => issue.target.field === "connection")
      .map((issue) => issue.activityId),
  );
  useEffect(() => {
    if (selectedStructureMoleculeId && !project.molecules.some((molecule) => molecule.id === selectedStructureMoleculeId)) {
      setSelectedStructureMoleculeId("");
    }
  }, [project.molecules, selectedStructureMoleculeId]);
  useEffect(() => {
    if (!valueChainHelpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setValueChainHelpOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [valueChainHelpOpen]);
  useEffect(() => {
    const handleTutorialStep = (event: Event) => {
      const tutorialStep = (event as CustomEvent<{ step?: number }>).detail?.step;
      if (tutorialStep === 6) setActiveView("hierarchy");
    };
    window.addEventListener("lci:tutorial-step", handleTutorialStep);
    return () => window.removeEventListener("lci:tutorial-step", handleTutorialStep);
  }, []);
  return (
    <main className="min-h-screen bg-transparent px-3 py-3 text-ink sm:px-4 sm:py-4" data-tutorial="dashboard-page">
      <div className="mx-auto grid max-w-[112rem] gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="theme-sidebar h-fit overflow-hidden rounded-xl border border-mist/40 md:sticky md:top-4 md:h-[calc(100vh-2rem)] md:self-start">
          <div className="border-b border-mist/70 p-4" data-tutorial="sidebar-brand">
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
          <div className="p-3" data-tutorial="sidebar-actions">
            <div className="space-y-1">
              {hasActivities ? (
                <>
                  <SidebarAction icon="save" label="Download project" onClick={onSaveProjectJson} primary />
                  <SidebarAction icon="folder" label="Open project file" onClick={() => fileInputRef.current?.click()} outlined />
                  <SidebarAction
                    disabled={isExportingProjectPdf}
                    icon="file"
                    label={isExportingProjectPdf ? "Creating report..." : "Create PDF report"}
                    onClick={onOpenProjectReport}
                  />
                </>
              ) : (
                <SidebarAction icon="folder" label="Open project file" onClick={() => fileInputRef.current?.click()} primary />
              )}
              <SidebarAction icon="layers" label="New project" onClick={onNewProject} />
            </div>
          </div>

          <div className="mx-3 px-3 py-2 text-[11px] leading-5 text-slate/70" data-tutorial="sidebar-save-status">
            {saveStatusLabel}
          </div>

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
                  aria-label={projectIssues.length > 0 ? `Open error center: ${projectIssues.length} issue${projectIssues.length === 1 ? "" : "s"} across ${affectedActivityCount} activit${affectedActivityCount === 1 ? "y" : "ies"}` : "Open error center: no issues found"}
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
                      ? `Error center · ${projectIssues.length}`
                      : "Error center · Clear"}
                  </span>
                </button>
              ) : null}
            </div>
          </header>

          <section className="mt-3 min-w-0 overflow-hidden rounded-xl border border-mist/60 bg-white" data-tutorial="project-workspace">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist/60 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">Project structure</h2>
                <button
                  aria-expanded={valueChainHelpOpen}
                  className="mt-1 inline-flex items-center gap-2 text-left text-sm font-medium text-helper transition hover:text-ink"
                  onClick={() => setValueChainHelpOpen(true)}
                  type="button"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-helper/45 text-[11px] font-semibold">?</span>
                  How to model value chains in LCA?
                </button>
              </div>
              {hasActivities ? <div className="flex flex-wrap items-center gap-2">
                <div aria-label="Structure view" className="flex items-center gap-1 rounded-lg border border-mist/60 bg-lab p-1" data-tutorial="structure-view-controls">
                  <ViewTab active={activeView === "hierarchy"} icon="tree" label="Tree" onClick={() => setActiveView("hierarchy")} />
                  <ViewTab active={activeView === "graph"} icon="graph" label="Graph" onClick={() => setActiveView("graph")} />
                </div>
                <label className="inline-flex h-10 items-center gap-2 rounded-md border border-mist/60 px-3 text-xs font-semibold text-slate transition hover:text-ink">
                  <input checked={showAllIngredients} className="h-4 w-4 rounded border-mist text-accent focus:ring-accent" onChange={(event) => setShowAllIngredients(event.target.checked)} type="checkbox" />
                  Show inputs
                </label>
                <button className="inline-flex h-10 items-center gap-2 rounded-md border border-mist/60 px-3 text-xs font-semibold text-ink transition hover:bg-lab" onClick={() => onCreateMolecule()} type="button">
                  <Icon name="plus" />
                  Add activity
                </button>
                {selectedStructureMoleculeId ? (
                  <button className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-xs font-semibold text-white transition hover:bg-[#ad4141]" onClick={() => onCreateMolecule(selectedStructureMoleculeId)} type="button">
                    + Add child activity
                  </button>
                ) : null}
              </div> : null}
            </div>
            {hasActivities ? (
              <div className="border-b border-mist/60 px-4 py-4 sm:px-5">
                <label className="relative block max-w-4xl">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate/60">
                    <Icon name="search" />
                  </span>
                  <input
                    aria-label="Search project structure"
                    className="h-11 w-full rounded-md border border-mist/70 bg-lab/40 px-10 pr-12 text-sm text-ink outline-none transition focus:border-slate focus:bg-white"
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    placeholder="Search activities, inputs, outputs, synonyms, or ecoinvent datasets"
                    value={searchQuery}
                  />
                  {searchQuery ? (
                    <button
                      aria-label="Clear project search"
                      className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-lg text-slate transition hover:bg-white hover:text-ink"
                      onClick={() => onSearchQueryChange("")}
                      title="Clear search"
                      type="button"
                    >
                      ×
                    </button>
                  ) : null}
                </label>
              </div>
            ) : null}
            {searchQuery.trim() ? (
              <div className="min-h-[calc(100vh-12rem)] bg-white">
                <div className="flex items-center justify-between gap-3 border-b border-mist/60 px-4 py-3 text-xs text-slate sm:px-5">
                  <span>{searchResults.length} result{searchResults.length === 1 ? "" : "s"}</span>
                  <span className="hidden sm:inline">Select a result to open it</span>
                </div>
                {searchResults.length > 0 ? (
                  <div aria-label="Project search results" role="listbox">
                    {searchResults.map((result) => {
                      const kindLabel = result.kind === "ecoinvent_dataset"
                        ? "Ecoinvent dataset"
                        : result.kind.charAt(0).toUpperCase() + result.kind.slice(1);
                      const kindStyle = result.kind === "activity"
                        ? "border-ink/20 bg-ink/[0.045] text-ink"
                        : result.kind === "input"
                          ? "border-accent/25 bg-accent-soft text-accent"
                          : result.kind === "output"
                            ? "border-sea/25 bg-sea/10 text-sea"
                            : "border-amber-300 bg-amber-50 text-amber-900";
                      return (
                        <button
                          className="flex w-full items-center gap-4 border-b border-mist/60 px-4 py-3 text-left transition hover:bg-lab/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 sm:px-5"
                          key={result.id}
                          onClick={() => onOpenSearchResult(result)}
                          role="option"
                          type="button"
                        >
                          <span className={`inline-flex w-32 shrink-0 justify-center rounded-sm border px-2 py-1 text-[11px] font-semibold ${kindStyle}`}>
                            {kindLabel}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">{result.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate">{result.context}</span>
                          </span>
                          {result.amount || result.unit ? (
                            <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                              {[result.amount, result.unit].filter(Boolean).join(" ")}
                            </span>
                          ) : null}
                          <span aria-hidden="true" className="shrink-0 text-slate/60">→</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-12 text-center sm:px-5">
                    <div className="text-sm font-semibold text-ink">No matching project item</div>
                    <div className="mt-1 text-xs text-slate">Try an activity, flow, synonym, UUID, or ecoinvent dataset name.</div>
                  </div>
                )}
              </div>
            ) : activeView === "hierarchy" ? (
              <HierarchyTree
                onCreateParentMolecule={onCreateParentMolecule}
                onCreateTopLevelMolecule={() => onCreateMolecule()}
                onStartTutorial={onStartTutorial}
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
              <InterconnectionGraph disconnectedActivityIds={disconnectedActivityIds} onOpenMolecule={onOpenMolecule} project={project} showInputs={showAllIngredients} visibleIds={visibleIds} />
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
      {valueChainHelpOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/70 px-4 py-6 backdrop-blur-md">
          <section
            aria-labelledby="value-chain-help-title"
            aria-modal="true"
            className="hero-surface max-h-[calc(100dvh-3rem)] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/70 p-5 shadow-2xl sm:p-6"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-ink" id="value-chain-help-title">How to model value chains in LCA?</h3>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate">
                  In the LCA framework, the life cycle of a value chain is modelled as a set of connected activities, such as producing a material, assembling a device or treating waste. Each activity receives inputs, meaning what it uses, and generates outputs, meaning what it produces or releases. An output from one activity may become an input to another activity in the analysed value chain (i.e., main output), thereby connecting the different parts of the system, as shown in the figure below.
                </p>
              </div>
              <button
                aria-label="Close value chain help"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-mist text-lg text-slate transition hover:border-alert hover:text-alert"
                onClick={() => setValueChainHelpOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <figure className="mt-5 overflow-hidden rounded-lg border border-mist bg-[#05070a] p-3">
              <div className="overflow-x-auto">
                <Image
                  alt="Three activities connected in sequence. Each receives separate inputs and generates outputs, while its main output becomes an input to the following activity."
                  className="h-auto w-full min-w-[44rem] sm:min-w-0"
                  sizes="(max-width: 768px) 44rem, 64rem"
                  src={valueChainImage}
                />
              </div>
              <figcaption className="border-t border-white/10 px-2 pb-1 pt-3 text-xs leading-5 text-white/75">
                General representation of connected activities. Each activity receives inputs and generates outputs, and the main output of one activity is the reason why this activity exists.
              </figcaption>
            </figure>
          </section>
        </div>
      ) : null}
    </main>
  );
}
