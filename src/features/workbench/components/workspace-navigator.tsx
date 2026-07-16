"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import {
  getAncestorIds,
  getChildMolecules,
  getHierarchySearchMatches,
  getHierarchyVisibleIds,
  getMoleculeInventoryReviewState,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import { ThemeToggle } from "@/features/workbench/components/theme-toggle";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type WorkspaceNavigatorProps = {
  project: ProjectRecord;
  selectedMoleculeId: string;
  onBack: () => void;
  onOpenMolecule: (moleculeId: string) => void;
  children?: ReactNode;
};

function activityLabel(molecule: MoleculeRecord) {
  return `${molecule.activityType || "Production of"} ${
    molecule.referenceProductName || molecule.name || "Untitled activity"
  }`.trim();
}

function TreeRow({
  depth,
  expandedIds,
  molecule,
  onOpenMolecule,
  project,
  selectedMoleculeId,
  setExpandedIds,
  visibleIds,
}: {
  depth: number;
  expandedIds: Set<string>;
  molecule: MoleculeRecord;
  onOpenMolecule: (moleculeId: string) => void;
  project: ProjectRecord;
  selectedMoleculeId: string;
  setExpandedIds: (updater: (current: Set<string>) => Set<string>) => void;
  visibleIds: Set<string> | null;
}) {
  if (visibleIds && !visibleIds.has(molecule.id)) {
    return null;
  }

  const children = getChildMolecules(project, molecule.id).filter(
    (child) => !visibleIds || visibleIds.has(child.id),
  );
  const selected = molecule.id === selectedMoleculeId;
  const expanded = children.length > 0 && expandedIds.has(molecule.id);
  const reviewState = getMoleculeInventoryReviewState(project, molecule);
  const inputCount = molecule.rows.filter((row) => row.section === "INPUT").length;

  return (
    <div>
      <div
        className={`group relative flex min-h-11 items-center rounded-md transition ${
          selected ? "bg-white/5 text-ink before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-slate" : "text-slate hover:bg-white/[0.035] hover:text-ink"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {depth > 0 ? (
          <span className="absolute inset-y-0 w-px bg-mist" style={{ left: `${15 + (depth - 1) * 16}px` }} />
        ) : null}
        <button
          aria-label={children.length > 0 ? `${expanded ? "Collapse" : "Expand"} ${activityLabel(molecule)}` : undefined}
          className={`mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-xs transition ${
            children.length > 0 ? "hover:bg-white" : "pointer-events-none text-transparent"
          }`}
          onClick={() =>
            setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(molecule.id)) {
                next.delete(molecule.id);
              } else {
                next.add(molecule.id);
              }
              return next;
            })
          }
          type="button"
        >
          {children.length > 0 ? (expanded ? "⌄" : "›") : "·"}
        </button>
        <button
          className="flex flex-none items-center gap-2 py-2 pr-3 text-left"
          onClick={() => onOpenMolecule(molecule.id)}
          type="button"
        >
          {reviewState === "alert" ? <span aria-label="Needs attention" className="h-2 w-2 shrink-0 rounded-full bg-alert" /> : null}
          <span>
            <span className={`block whitespace-nowrap text-sm ${selected ? "font-semibold" : "font-medium"}`}>
              {molecule.referenceProductName || molecule.name || "Untitled activity"}
            </span>
            <span className="block whitespace-nowrap text-[11px] text-slate/75">
              {inputCount} input{inputCount === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      </div>

      {expanded ? (
        <div>
          {children.map((child) => (
            <TreeRow
              depth={depth + 1}
              expandedIds={expandedIds}
              key={child.id}
              molecule={child}
              onOpenMolecule={onOpenMolecule}
              project={project}
              selectedMoleculeId={selectedMoleculeId}
              setExpandedIds={setExpandedIds}
              visibleIds={visibleIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceNavigator({
  project,
  selectedMoleculeId,
  onBack,
  onOpenMolecule,
}: WorkspaceNavigatorProps) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = getAncestorIds(project, selectedMoleculeId);
    initial.add(selectedMoleculeId);
    return initial;
  });
  const roots = useMemo(() => getTopLevelMolecules(project), [project]);
  const matches = useMemo(() => getHierarchySearchMatches(project, query), [project, query]);
  const visibleIds = useMemo(() => getHierarchyVisibleIds(project, matches), [matches, project]);

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const id of getAncestorIds(project, selectedMoleculeId)) {
        next.add(id);
      }
      next.add(selectedMoleculeId);
      if (query.trim()) {
        for (const match of matches) {
          next.add(match.id);
          for (const id of getAncestorIds(project, match.id)) {
            next.add(id);
          }
        }
      }
      return next;
    });
  }, [matches, project, query, selectedMoleculeId]);

  return (
    <aside className="workspace-rail flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-mist lg:min-h-[calc(100vh-2rem)]">
      <div className="border-b border-mist/70 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold tracking-wide text-white shadow-sm">LCI</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{project.name}</div>
              <div className="text-xs text-slate">Project</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <button
          className="mt-4 inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-slate transition hover:bg-lab hover:text-ink"
          onClick={onBack}
          type="button"
        >
          <span aria-hidden="true">←</span>
          Project overview
        </button>
      </div>

      <div className="border-b border-mist/70 p-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate/60">⌕</span>
          <input
            aria-label="Search project structure"
            className="h-9 w-full rounded-md border border-mist bg-lab pl-9 pr-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an activity"
            value={query}
          />
        </label>
      </div>

      <div className="flex max-h-72 min-h-0 flex-1 flex-col px-2 py-3 lg:max-h-none">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate">Project structure</h2>
          <button
            className="text-[11px] font-medium text-slate transition hover:text-ink"
            onClick={() => setExpandedIds(new Set([selectedMoleculeId]))}
            type="button"
          >
            Collapse
          </button>
        </div>
        <div aria-label="Scrollable project structure" className="min-h-0 flex-1 overflow-auto pb-1">
          <div className="w-max min-w-full space-y-0.5">
            {roots.map((root) => (
              <TreeRow
                depth={0}
                expandedIds={expandedIds}
                key={root.id}
                molecule={root}
                onOpenMolecule={onOpenMolecule}
                project={project}
                selectedMoleculeId={selectedMoleculeId}
                setExpandedIds={setExpandedIds}
                visibleIds={visibleIds}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
