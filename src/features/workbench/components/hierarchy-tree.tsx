"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import {
  getChildMolecules,
  getLinkedMolecule,
  getMoleculeRows,
  getRowInventoryReviewIssues,
  getProductSystemRoots,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import type { ProjectValidationIssue } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

type HierarchyTreeProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  selectedMoleculeId: string;
  showAllIngredients: boolean;
  onOpenMolecule: (moleculeId: string) => void;
  onSelectMolecule: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateTopLevelMolecule: () => void;
  projectIssues: ProjectValidationIssue[];
  onOpenActivityIssues: (activityId: string) => void;
  onStartTutorial: () => void;
};

function IngredientNode({
  molecule,
  project,
  row,
  depth,
  isLast,
}: {
  molecule: MoleculeRecord;
  project: ProjectRecord;
  row: ReconstructionRow;
  depth: number;
  isLast: boolean;
}) {
  const reviewItems = getRowInventoryReviewIssues(project, molecule, row);

  return (
    <div className="relative flex min-h-14 items-center gap-3 border-b border-mist/60 py-2 pr-3 text-sm" style={{ paddingLeft: `${52 + depth * 28}px` }}>
      <span className="absolute top-0 w-px bg-mist" style={{ bottom: isLast ? "50%" : 0, left: `${26 + (depth - 1) * 28}px` }} />
      <span className="absolute top-1/2 h-px w-6 bg-mist" style={{ left: `${26 + (depth - 1) * 28}px` }} />
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate/35" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{row.name || "Unnamed input"}</div>
        <div className="truncate text-xs text-slate">
          {[row.totalValue && `${row.totalValue} ${row.unit}`, row.cas, row.ecoinventName].filter(Boolean).join(" · ") || "Input flow"}
        </div>
      </div>
      {reviewItems.length > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-alert" title={reviewItems[0]?.label}>
          <span className="h-2 w-2 rounded-full bg-alert" />
          {reviewItems[0]?.label}
        </span>
      ) : null}
    </div>
  );
}

function TreeNode({
  molecule,
  project,
  depth,
  viaRow,
  showAllIngredients,
  path,
  expandedIds,
  setExpandedIds,
  openMenuId,
  setOpenMenuId,
  visibleIds,
  onOpenMolecule,
  onSelectMolecule,
  onCreateParentMolecule,
  selectedMoleculeId,
  projectIssues,
  onOpenActivityIssues,
  isLast = false,
}: {
  molecule: MoleculeRecord;
  project: ProjectRecord;
  depth: number;
  viaRow?: ReconstructionRow | null;
  showAllIngredients: boolean;
  path: Set<string>;
  expandedIds: Set<string>;
  setExpandedIds: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void;
  openMenuId: string;
  setOpenMenuId: (value: string | ((current: string) => string)) => void;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  onSelectMolecule: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  selectedMoleculeId: string;
  projectIssues: ProjectValidationIssue[];
  onOpenActivityIssues: (activityId: string) => void;
  isLast?: boolean;
}) {
  const activityIssueCount = projectIssues.filter((issue) => issue.activityId === molecule.id).length;
  const activityLabel = molecule.name || "Untitled activity";
  const childMolecules = getChildMolecules(project, molecule.id).filter((child) => !visibleIds || visibleIds.has(child.id));
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const outputCount = getMoleculeRows(molecule, "OUTPUT").length;
  const displayEntries = showAllIngredients
    ? (() => {
        const entries = inputRows.map((row) => {
          const linked = getLinkedMolecule(project, row);
          if (linked && (!visibleIds || visibleIds.has(linked.id))) {
            return { kind: "molecule" as const, row, molecule: linked };
          }
          return { kind: "ingredient" as const, row };
        });
        return [
          ...entries.filter((entry) => entry.kind === "ingredient"),
          ...entries.filter((entry) => entry.kind === "molecule"),
        ];
      })()
    : childMolecules.map((child) => ({ kind: "molecule" as const, molecule: child, row: null }));
  const hasChildren = displayEntries.length > 0;
  const cycleDetected = path.has(molecule.id);
  const expanded = hasChildren && (expandedIds.has(molecule.id) || depth === 0);
  const selected = selectedMoleculeId === molecule.id;
  const productSystemRoots = getProductSystemRoots(project);
  const mainActivityId = productSystemRoots[0]?.id;
  const hasDisconnectedRoots = productSystemRoots.length > 1;

  if (visibleIds && !visibleIds.has(molecule.id)) {
    return null;
  }

  return (
    <div>
      <div
        aria-selected={selected}
        data-tutorial={!hasDisconnectedRoots && molecule.id === mainActivityId ? "main-activity" : undefined}
        className={`group relative flex min-h-[4.75rem] cursor-pointer items-center border-b border-mist/60 pr-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${selected ? "bg-accent/[0.055] before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-accent" : "hover:bg-lab/70"}`}
        onClick={() => {
          onSelectMolecule(molecule.id);
          onOpenMolecule(molecule.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectMolecule(molecule.id);
            onOpenMolecule(molecule.id);
          }
        }}
        role="option"
        style={{ paddingLeft: `${12 + depth * 28}px` }}
        tabIndex={0}
      >
        {depth > 0 ? (
          <>
            <span className="absolute top-0 w-px bg-mist" style={{ bottom: isLast ? "50%" : 0, left: `${26 + (depth - 1) * 28}px` }} />
            <span className="absolute top-1/2 h-px w-6 bg-mist" style={{ left: `${26 + (depth - 1) * 28}px` }} />
          </>
        ) : null}
        <button
          aria-label={hasChildren ? `${expanded ? "Collapse" : "Expand"} ${activityLabel}` : undefined}
          className={`mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-md border text-base transition ${hasChildren ? "border-mist/60 bg-white text-ink hover:border-accent hover:text-accent" : "border-transparent text-slate/35"}`}
          disabled={!hasChildren}
          onClick={(event) => {
            event.stopPropagation();
            if (!hasChildren) return;
            setExpandedIds((current) => {
              const next = new Set(current);
              if (next.has(molecule.id)) next.delete(molecule.id);
              else next.add(molecule.id);
              return next;
            });
          }}
          type="button"
        >
          {expanded ? "⌄" : "›"}
        </button>

        <div className="min-w-0 flex-1 py-3">
          <div className="truncate text-sm font-semibold text-ink">{activityLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate">
            <span>{depth === 0 ? (hasDisconnectedRoots ? "Disconnected from overall system" : "Main activity") : viaRow?.totalValue ? `${viaRow.totalValue} ${viaRow.unit}` : "Child activity"}</span>
            <span aria-hidden="true">·</span>
            <span>{inputRows.length} input{inputRows.length === 1 ? "" : "s"} · {outputCount} output{outputCount === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="ml-2 flex shrink-0 items-center gap-1 sm:ml-3 sm:gap-2">
          {activityIssueCount > 0 ? (
            <button
              aria-label={`Open ${activityIssueCount} issue${activityIssueCount === 1 ? "" : "s"} for ${activityLabel}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-alert transition hover:bg-alert/10"
              onClick={(event) => {
                event.stopPropagation();
                onOpenActivityIssues(molecule.id);
              }}
              type="button"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-alert" />
              {activityIssueCount} issue{activityIssueCount === 1 ? "" : "s"}
            </button>
          ) : null}
          {molecule.placeholder ? <StatusBadge label="Placeholder" tone="ink" /> : null}
          {cycleDetected ? <StatusBadge label="Cycle" tone="alert" /> : null}
        </div>

        <div className="ml-3 flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <div className="relative" data-tree-more-menu={molecule.id}>
            <button aria-expanded={openMenuId === molecule.id} className="grid h-9 place-items-center rounded-md px-3 text-xs font-semibold text-slate transition hover:bg-white hover:text-ink" onClick={() => setOpenMenuId((current) => current === molecule.id ? "" : molecule.id)} type="button">More</button>
            {openMenuId === molecule.id ? <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-mist bg-white p-1.5">
              <button className="block w-full rounded-md px-3 py-2 text-left text-xs font-medium text-slate transition hover:bg-lab hover:text-ink" onClick={() => { setOpenMenuId(""); onCreateParentMolecule(molecule.id); }} type="button">Create parent activity</button>
            </div> : null}
          </div>
        </div>
      </div>

      {expanded && !cycleDetected ? (
        <div>
          {displayEntries.map((entry, index) =>
            entry.kind === "molecule" ? (
              <TreeNode
                key={`${molecule.id}-${entry.row?.id ?? entry.molecule.id}`}
                depth={depth + 1}
                expandedIds={expandedIds}
                isLast={index === displayEntries.length - 1}
                molecule={entry.molecule}
                onOpenMolecule={onOpenMolecule}
                onSelectMolecule={onSelectMolecule}
                onCreateParentMolecule={onCreateParentMolecule}
                onOpenActivityIssues={onOpenActivityIssues}
                openMenuId={openMenuId}
                path={new Set([...path, molecule.id])}
                project={project}
                projectIssues={projectIssues}
                setExpandedIds={setExpandedIds}
                setOpenMenuId={setOpenMenuId}
                showAllIngredients={showAllIngredients}
                selectedMoleculeId={selectedMoleculeId}
                viaRow={entry.row}
                visibleIds={visibleIds}
              />
            ) : (
              <IngredientNode key={entry.row.id} depth={depth + 1} isLast={index === displayEntries.length - 1} molecule={molecule} project={project} row={entry.row} />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function HierarchyTree({
  project,
  visibleIds,
  selectedMoleculeId,
  showAllIngredients,
  onOpenMolecule,
  onSelectMolecule,
  onCreateParentMolecule,
  onCreateTopLevelMolecule,
  projectIssues,
  onOpenActivityIssues,
  onStartTutorial,
}: HierarchyTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState("");
  const rootMolecules = useMemo(
    () => getTopLevelMolecules(project).filter((molecule) => !visibleIds || visibleIds.has(molecule.id)),
    [project, visibleIds],
  );

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`[data-tree-more-menu="${openMenuId}"]`)) return;
      setOpenMenuId("");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId("");
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  return (
    <section className="min-h-[calc(100vh-12rem)] bg-white">
      <div>
        {rootMolecules.length > 0 ? (
          <>
          <div aria-label="Project activity tree" role="listbox">
          {rootMolecules.map((molecule, index) => (
            <TreeNode
              key={molecule.id}
              depth={0}
              expandedIds={expandedIds}
              isLast={index === rootMolecules.length - 1}
              molecule={molecule}
              onOpenMolecule={onOpenMolecule}
              onSelectMolecule={onSelectMolecule}
              onCreateParentMolecule={onCreateParentMolecule}
              onOpenActivityIssues={onOpenActivityIssues}
              openMenuId={openMenuId}
              path={new Set()}
              project={project}
              projectIssues={projectIssues}
              selectedMoleculeId={selectedMoleculeId}
              setExpandedIds={setExpandedIds}
              setOpenMenuId={setOpenMenuId}
              showAllIngredients={showAllIngredients}
              visibleIds={visibleIds}
            />
          ))}
          </div>
          </>
        ) : (
          <div className="px-4 py-8 sm:px-5 sm:py-10">
            <div className="max-w-2xl">
              <div className="text-xl font-semibold text-ink">What do you want to study?</div>
              <p className="mt-2 text-sm leading-6 text-slate">
                Start with the product, service, or process result you want to describe.
              </p>
              <button
                className="mt-5 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]"
                onClick={onCreateTopLevelMolecule}
                type="button"
              >
                + Add first activity
              </button>
              <div className="mt-10 max-w-2xl">
                <div className="text-xl font-semibold text-ink">First time using this tool?</div>
                <p className="mt-2 text-sm leading-6 text-slate">Open an example project and follow a guided tutorial.</p>
                <button className="mt-5 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]" onClick={onStartTutorial} type="button">Open example project and tutorial</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
