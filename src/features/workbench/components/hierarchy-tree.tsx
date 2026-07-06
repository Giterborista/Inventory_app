"use client";

import { useMemo, useState } from "react";

import { ReviewStatusIcon, ReviewStatusPill } from "@/features/workbench/components/review-status-icon";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import {
  getChildMolecules,
  getLinkedMolecule,
  getMoleculeInventoryReviewState,
  getMoleculeRows,
  getRowInventoryReviewIssues,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

type HierarchyTreeProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  onAddInputRow: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateTopLevelMolecule: () => void;
};

function IngredientNode({
  molecule,
  project,
  row,
  depth,
}: {
  molecule: MoleculeRecord;
  project: ProjectRecord;
  row: ReconstructionRow;
  depth: number;
}) {
  const reviewItems = getRowInventoryReviewIssues(project, molecule, row);

  return (
    <div
      className="rounded-lg border border-mist bg-white px-4 py-3 shadow-sm"
      style={{ marginLeft: `${depth * 22}px` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.98rem] font-semibold text-ink">{row.name || "Unnamed ingredient"}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate">
            {row.cas ? (
              <>
                <span className="font-mono">{row.cas}</span>
                <span>/</span>
              </>
            ) : null}
            <span>Input ingredient</span>
          </div>
          {row.reference || row.description ? (
            <div className="mt-2 text-xs text-slate">{row.reference || row.description}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {reviewItems.length > 0 ? (
            reviewItems.slice(0, 1).map((item) => <ReviewStatusPill key={item.label} label={item.label} state={item.state} />)
          ) : (
            <ReviewStatusIcon state="ok" />
          )}
          {row.ecoinventName ? <div className="text-xs text-slate">{row.ecoinventName}</div> : null}
        </div>
      </div>
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
  visibleIds,
  onOpenMolecule,
  onAddInputRow,
  onCreateParentMolecule,
}: {
  molecule: MoleculeRecord;
  project: ProjectRecord;
  depth: number;
  viaRow?: ReconstructionRow | null;
  showAllIngredients: boolean;
  path: Set<string>;
  expandedIds: Set<string>;
  setExpandedIds: (value: Set<string> | ((current: Set<string>) => Set<string>)) => void;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  onAddInputRow: (moleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
}) {
  const reviewState = getMoleculeInventoryReviewState(project, molecule);
  const referenceProductName = molecule.referenceProductName || molecule.name;
  const activityLabel = `${molecule.activityType || "Production of"} ${
    referenceProductName || "untitled reference product"
  }`.trim();
  const childMolecules = getChildMolecules(project, molecule.id).filter((child) => !visibleIds || visibleIds.has(child.id));
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const displayEntries = showAllIngredients
    ? inputRows
        .map((row) => {
          const linked = getLinkedMolecule(project, row);
          if (linked && (!visibleIds || visibleIds.has(linked.id))) {
            return { kind: "molecule" as const, row, molecule: linked };
          }
          return { kind: "ingredient" as const, row };
        })
    : childMolecules.map((child) => ({ kind: "molecule" as const, molecule: child, row: null }));
  const hasChildren = displayEntries.length > 0;
  const cycleDetected = path.has(molecule.id);
  const expanded = hasChildren && (expandedIds.has(molecule.id) || depth === 0);

  if (visibleIds && !visibleIds.has(molecule.id)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-lg border border-mist bg-white px-4 py-3 shadow-sm transition hover:border-accent/35"
        style={{ marginLeft: `${depth * 22}px` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition ${
                hasChildren
                  ? "border-mist bg-lab text-ink hover:border-accent hover:text-accent"
                  : "pointer-events-none border-transparent bg-transparent"
              }`}
              onClick={() =>
                hasChildren
                  ? setExpandedIds((current) => {
                      const next = new Set(current);
                      if (next.has(molecule.id)) {
                        next.delete(molecule.id);
                      } else {
                        next.add(molecule.id);
                      }
                      return next;
                    })
                  : undefined
              }
              type="button"
            >
              {hasChildren ? (expanded ? "−" : "+") : null}
            </button>

            <div className="min-w-0">
              <button
                className="truncate text-left text-[1.02rem] font-semibold text-ink transition hover:text-accent"
                onClick={() => onOpenMolecule(molecule.id)}
                type="button"
              >
                {activityLabel}
              </button>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate">
                {molecule.cas ? (
                  <>
                    <span className="font-mono">{molecule.cas}</span>
                    <span>/</span>
                  </>
                ) : null}
                <span>{depth === 0 ? (molecule.topLevel ? "Root activity" : "Unplaced activity") : `Depth ${depth}`}</span>
                {viaRow?.reference ? (
                  <>
                    <span>/</span>
                    <span>{viaRow.reference}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-md border border-mist/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
              onClick={() => {
                setExpandedIds((current) => {
                  const next = new Set(current);
                  next.add(molecule.id);
                  return next;
                });
                onAddInputRow(molecule.id);
              }}
              type="button"
            >
              Add input
            </button>
            <button
              className="rounded-md border border-mist/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
              onClick={() => onCreateParentMolecule(molecule.id)}
              type="button"
            >
              Add parent activity
            </button>
            <ReviewStatusIcon state={reviewState} />
            {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
            {cycleDetected ? <StatusBadge label="Cycle" tone="alert" /> : null}
          </div>
        </div>
      </div>

      {expanded && !cycleDetected ? (
        <div className="space-y-2 border-l border-mist pl-3">
          {displayEntries.map((entry) =>
            entry.kind === "molecule" ? (
              <TreeNode
                key={`${molecule.id}-${entry.row?.id ?? entry.molecule.id}`}
                depth={depth + 1}
                expandedIds={expandedIds}
                molecule={entry.molecule}
                onOpenMolecule={onOpenMolecule}
                onAddInputRow={onAddInputRow}
                onCreateParentMolecule={onCreateParentMolecule}
                path={new Set([...path, molecule.id])}
                project={project}
                setExpandedIds={setExpandedIds}
                showAllIngredients={showAllIngredients}
                viaRow={entry.row}
                visibleIds={visibleIds}
              />
            ) : (
              <IngredientNode key={entry.row.id} depth={depth + 1} molecule={molecule} project={project} row={entry.row} />
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
  onOpenMolecule,
  onAddInputRow,
  onCreateParentMolecule,
  onCreateTopLevelMolecule,
}: HierarchyTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const rootMolecules = useMemo(
    () => getTopLevelMolecules(project).filter((molecule) => !visibleIds || visibleIds.has(molecule.id)),
    [project, visibleIds],
  );

  return (
    <section className="panel-surface rounded-lg border border-white/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-ink">Inventory</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-mist/80 bg-white/90 px-3 text-xs font-semibold text-slate shadow-sm transition hover:border-accent/30 hover:text-ink active:scale-[0.98]">
            <input
              checked={showAllIngredients}
              className="h-4 w-4 rounded border-mist text-accent focus:ring-accent"
              onChange={(event) => setShowAllIngredients(event.target.checked)}
              type="checkbox"
            />
            Show inputs
          </label>
          {rootMolecules.length > 0 ? (
            <button
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-ink active:scale-[0.98]"
              onClick={onCreateTopLevelMolecule}
              type="button"
            >
              Add activity
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-7 space-y-3">
        {rootMolecules.length > 0 ? (
          rootMolecules.map((molecule) => (
            <TreeNode
              key={molecule.id}
              depth={0}
              expandedIds={expandedIds}
              molecule={molecule}
              onOpenMolecule={onOpenMolecule}
              onAddInputRow={onAddInputRow}
              onCreateParentMolecule={onCreateParentMolecule}
              path={new Set()}
              project={project}
              setExpandedIds={setExpandedIds}
              showAllIngredients={showAllIngredients}
              visibleIds={visibleIds}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-mist bg-lab/90 px-6 py-8 text-sm text-slate shadow-inner">
            <div className="max-w-2xl">
              <div className="text-xl font-semibold text-ink">No activities yet</div>
              <div className="mt-2 leading-6">
                Start by naming the product or process you want to model.
              </div>
            </div>
            <button
              className="mt-5 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink"
              onClick={onCreateTopLevelMolecule}
              type="button"
            >
              Create first activity
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
