"use client";

import { useMemo, useRef, useState } from "react";

import { HierarchyTree } from "@/features/workbench/components/hierarchy-tree";
import { InterconnectionGraph } from "@/features/workbench/components/interconnection-graph";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import {
  getEffectiveResolutionStatus,
  getHierarchyVisibleIds,
  getPresentMoleculeCount,
  getProxyMoleculeCount,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type DashboardProps = {
  project: ProjectRecord;
  filteredMolecules: MoleculeRecord[];
  unresolvedMolecules: MoleculeRecord[];
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onUpdateProjectName: (value: string) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onAddChildDependency: (parentMoleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateMolecule: () => void;
  onOpenProjectJson: (file: File) => void;
  onOpenProjectReport: () => void;
  onSaveProjectJson: () => void;
  onNewProject: () => void;
};

function SummaryMetric({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: number;
  tone?: "accent" | "ink" | "alert";
}) {
  return (
    <div className="rounded-[1.6rem] border border-mist/80 bg-white/70 px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate">{label}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-3xl font-semibold text-ink">{value}</div>
        <div className="pb-1">
          <StatusBadge label={tone === "accent" ? "active" : tone === "alert" ? "watch" : "tracked"} tone={tone} />
        </div>
      </div>
    </div>
  );
}

function ViewTab({
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
      className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-ink text-white shadow-lg shadow-ink/10"
          : "bg-white/80 text-slate hover:bg-white hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function Dashboard({
  project,
  filteredMolecules,
  unresolvedMolecules,
  searchQuery,
  onSearchQueryChange,
  onUpdateProjectName,
  onOpenMolecule,
  onAddChildDependency,
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
  const topLevelMolecules = useMemo(() => getTopLevelMolecules(project).slice(0, 4), [project]);

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <div className="mx-auto max-w-[104rem] space-y-6">
        <section className="hero-surface rounded-[2.25rem] border border-white/70 p-8">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-4xl">
              <div className="section-title">Proxy Reconstruction Studio</div>
              <h1 className="mt-4 text-4xl font-semibold text-ink md:text-[3.2rem]">
                Traceable molecule workbooks for missing ecoinvent chemistry
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate">
                Start from the main molecule, expand the dependency cascade, and open any molecule workspace to document
                reconstruction logic, row-level links, and review-ready traceability in one place.
              </p>
              <div className="mt-5 rounded-[1.4rem] border border-accent/15 bg-white/75 px-4 py-4 text-sm leading-6 text-slate shadow-sm">
                This app runs as a session-only JSON editor. No project data is stored in the browser. Open a JSON file to
                continue existing work, and save JSON before leaving the page to keep your latest changes.
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-3 rounded-full bg-white/80 px-4 py-2 text-sm text-slate shadow-sm">
                  <span>Project</span>
                  <input
                    className="min-w-[18rem] rounded-full border border-mist/80 bg-white px-3 py-1 text-sm font-semibold text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateProjectName(event.target.value)}
                    value={project.name}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Open JSON
              </button>
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={onOpenProjectReport}
                type="button"
              >
                Project dossier
              </button>
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={onSaveProjectJson}
                type="button"
              >
                Save JSON
              </button>
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={onNewProject}
                type="button"
              >
                New project
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <SummaryMetric label="Total molecules" value={project.molecules.length} />
            <SummaryMetric label="Present in ecoinvent" tone="accent" value={getPresentMoleculeCount(project)} />
            <SummaryMetric label="Proxy molecules" value={getProxyMoleculeCount(project)} />
            <SummaryMetric label="Unresolved" tone="alert" value={unresolvedMolecules.length} />
          </div>
        </section>

        <section className="panel-surface rounded-[2.25rem] border border-white/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="section-title">Project overview</div>
              <h2 className="mt-3 text-2xl font-semibold text-ink">Hierarchy-first navigation</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate">
                Search across molecule identity, row names, synonyms, SMILES, references, notes, evidence, documentation, and
                linked dependency names. Use the cascade as the primary view, then switch to the interconnection graph for
                dependency QA. The open/save workflow is JSON-only and leaves no project data behind when the session closes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full bg-lab p-1">
                <ViewTab active={activeView === "hierarchy"} label="Cascade view" onClick={() => setActiveView("hierarchy")} />
                <ViewTab active={activeView === "graph"} label="Graph view" onClick={() => setActiveView("graph")} />
              </div>
              <input
                className="w-full min-w-[18rem] max-w-md rounded-full border border-mist/90 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-accent"
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search anywhere in the project"
                value={searchQuery}
              />
            </div>
          </div>

          {searchQuery.trim() && filteredMolecules.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-3">
              {filteredMolecules.map((molecule) => (
                <button
                  key={molecule.id}
                  className="rounded-2xl border border-mist/80 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent"
                  onClick={() => onOpenMolecule(molecule.id)}
                  type="button"
                >
                  <div className="font-semibold text-ink">{molecule.name}</div>
                  <div className="mt-1 text-xs text-slate">{molecule.cas || molecule.iupac || "No identity detail yet"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      label={resolutionLabels[getEffectiveResolutionStatus(project, molecule)]}
                      tone={resolutionTone(getEffectiveResolutionStatus(project, molecule))}
                    />
                    {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {activeView === "hierarchy" ? (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.6fr)]">
            <HierarchyTree
              onAddChildDependency={onAddChildDependency}
              onCreateParentMolecule={onCreateParentMolecule}
              onCreateTopLevelMolecule={onCreateMolecule}
              onOpenMolecule={onOpenMolecule}
              project={project}
              visibleIds={visibleIds}
            />

            <div className="space-y-6">
              <section className="panel-surface rounded-[2rem] border border-white/70 p-5">
                <div className="section-title">Top-level molecules</div>
                <div className="mt-4 space-y-3">
                  {topLevelMolecules.map((molecule) => (
                    <button
                      key={molecule.id}
                      className="w-full rounded-[1.6rem] border border-mist/80 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent"
                      onClick={() => onOpenMolecule(molecule.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-ink">{molecule.name}</div>
                          <div className="mt-1 text-xs text-slate">{molecule.cas || "No CAS recorded"}</div>
                        </div>
                        <StatusBadge label={molecule.topLevel ? "Root" : "Linked"} tone={molecule.topLevel ? "accent" : "ink"} />
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel-surface rounded-[2rem] border border-white/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="section-title">Tracked molecules</div>
                    <h3 className="mt-2 text-lg font-semibold text-ink">Proxy and missing molecules</h3>
                  </div>
                  <StatusBadge label={String(unresolvedMolecules.length)} tone="alert" />
                </div>
                <div className="mt-4 space-y-3">
                  {unresolvedMolecules.slice(0, 6).map((molecule) => (
                    <button
                      key={molecule.id}
                      className="w-full rounded-2xl border border-mist/80 bg-white px-4 py-3 text-left shadow-sm transition hover:border-accent"
                      onClick={() => onOpenMolecule(molecule.id)}
                      type="button"
                    >
                      <div className="font-medium text-ink">{molecule.name}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge
                          label={resolutionLabels[getEffectiveResolutionStatus(project, molecule)]}
                          tone={resolutionTone(getEffectiveResolutionStatus(project, molecule))}
                        />
                        {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <InterconnectionGraph onOpenMolecule={onOpenMolecule} project={project} visibleIds={visibleIds} />
            <section className="panel-surface rounded-[2rem] border border-white/70 p-5">
              <div className="section-title">Graph guidance</div>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4 shadow-sm">
                  <div className="font-semibold text-ink">Depth bands</div>
                  <p className="mt-2 text-sm leading-6 text-slate">
                    Wider spacing and alternating vertical bands make each dependency generation easier to read from left to right.
                  </p>
                </div>
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4 shadow-sm">
                  <div className="font-semibold text-ink">Complete tree</div>
                  <p className="mt-2 text-sm leading-6 text-slate">
                    Turn on the ingredient toggle to inspect not only linked child molecules but also plain input materials in the same map.
                  </p>
                </div>
                <div className="rounded-2xl border border-mist/80 bg-white px-4 py-4 shadow-sm">
                  <div className="font-semibold text-ink">Flagged nodes</div>
                  <p className="mt-2 text-sm leading-6 text-slate">
                    Only flagged nodes are called out visually, so unresolved or incomplete parts of the chain stand out immediately.
                  </p>
                </div>
              </div>
            </section>
          </section>
        )}

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
