"use client";

import { type ReactNode, useRef, useState } from "react";

import { HierarchyTree } from "@/features/workbench/components/hierarchy-tree";
import { InterconnectionGraph } from "@/features/workbench/components/interconnection-graph";
import { ReviewStatusIcon } from "@/features/workbench/components/review-status-icon";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import {
  getHierarchyVisibleIds,
  getMoleculeInventoryReviewState,
} from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type DashboardProps = {
  project: ProjectRecord;
  filteredMolecules: MoleculeRecord[];
  unresolvedMolecules: MoleculeRecord[];
  searchQuery: string;
  isExportingProjectPdf?: boolean;
  onSearchQueryChange: (value: string) => void;
  onUpdateProjectName: (value: string) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onAddInputRow: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateMolecule: () => void;
  onOpenProjectJson: (file: File) => void;
  onOpenProjectReport: () => void;
  onSaveProjectJson: () => void;
  onNewProject: () => void;
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
        active ? "bg-white text-ink shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
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
  primary = false,
}: {
  disabled?: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${
        primary
          ? "bg-white text-ink hover:bg-lab"
          : "border border-white/15 bg-white/8 text-white/86 hover:bg-white/12 hover:text-white"
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
  onSearchQueryChange,
  onUpdateProjectName,
  onOpenMolecule,
  onAddInputRow,
  onCreateParentMolecule,
  onCreateMolecule,
  onOpenProjectJson,
  onOpenProjectReport,
  onSaveProjectJson,
  onNewProject,
}: DashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<"hierarchy" | "graph">("hierarchy");
  const visibleIds = getHierarchyVisibleIds(project, filteredMolecules);
  const hasSearch = Boolean(searchQuery.trim());

  return (
    <main className="min-h-screen px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto grid max-w-[112rem] gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-lg bg-ink p-3 text-white shadow-sm xl:sticky xl:top-4">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <SidebarAction icon="folder" label="Open" onClick={() => fileInputRef.current?.click()} />
              <SidebarAction icon="save" label="Save" onClick={onSaveProjectJson} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SidebarAction
                disabled={isExportingProjectPdf}
                icon="file"
                label={isExportingProjectPdf ? "PDF..." : "Dossier"}
                onClick={onOpenProjectReport}
              />
              <SidebarAction icon="layers" label="New" onClick={onNewProject} />
            </div>
          </div>

          <label className="relative mt-4 block w-full">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50">
              <Icon name="search" />
            </span>
            <input
              className="h-10 w-full rounded-md border border-white/12 bg-white/10 px-10 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-white/35"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search activities"
              value={searchQuery}
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-white/8 p-1">
            <ViewTab active={activeView === "hierarchy"} icon="tree" label="Tree" onClick={() => setActiveView("hierarchy")} />
            <ViewTab active={activeView === "graph"} icon="graph" label="Graph" onClick={() => setActiveView("graph")} />
          </div>

        </aside>

        <div className="min-w-0 space-y-4">
          <header className="rounded-lg border border-mist bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-xs font-semibold text-slate">Project</span>
                <input
                  className="w-full rounded-md border border-transparent bg-transparent py-1 text-2xl font-semibold leading-tight text-ink outline-none transition focus:border-mist focus:bg-lab focus:px-3"
                  onChange={(event) => onUpdateProjectName(event.target.value)}
                  value={project.name}
                />
              </label>
              {unresolvedMolecules.length > 0 ? (
                <div className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 text-amber-800">
                  <Icon name="alert" />
                  <span className="text-sm font-semibold">{unresolvedMolecules.length}</span>
                  <span className="text-xs font-semibold">review</span>
                </div>
              ) : null}
            </div>
          </header>

          <section className="min-w-0">
            {activeView === "hierarchy" ? (
              <HierarchyTree
                onAddInputRow={onAddInputRow}
                onCreateParentMolecule={onCreateParentMolecule}
                onCreateTopLevelMolecule={onCreateMolecule}
                onOpenMolecule={onOpenMolecule}
                project={project}
                visibleIds={visibleIds}
              />
            ) : (
              <InterconnectionGraph onOpenMolecule={onOpenMolecule} project={project} visibleIds={visibleIds} />
            )}
          </section>

            {hasSearch ? (
              <section className="panel-surface rounded-lg border border-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink">Search results</h2>
                  <span className="text-sm font-medium text-slate">{filteredMolecules.length} found</span>
                </div>
                {filteredMolecules.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {filteredMolecules.map((molecule) => (
                      <button
                        key={molecule.id}
                        className="rounded-lg border border-mist/80 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent"
                        onClick={() => onOpenMolecule(molecule.id)}
                        type="button"
                      >
                        <div className="font-semibold text-ink">{molecule.name}</div>
                        <div className="mt-1 text-xs text-slate">{molecule.cas || molecule.iupac || "No identity detail yet"}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ReviewStatusIcon state={getMoleculeInventoryReviewState(project, molecule)} />
                          {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-mist bg-lab px-4 py-6 text-sm font-medium text-slate">
                    No matching activities.
                  </div>
                )}
              </section>
            ) : null}
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
    </main>
  );
}
