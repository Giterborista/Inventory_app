"use client";

import { useMemo, useState } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import {
  getChildMolecules,
  getEffectiveResolutionStatus,
  getLinkedMolecule,
  getMoleculeRows,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

type HierarchyTreeProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  onAddChildDependency: (parentMoleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
  onCreateTopLevelMolecule: () => void;
};

function IngredientNode({
  row,
  depth,
}: {
  row: ReconstructionRow;
  depth: number;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[1.55rem] border border-mist/70 bg-lab/85 px-5 py-4 shadow-sm"
      style={{ marginLeft: `${depth * 30}px` }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-slate/10"
        style={{ opacity: Math.max(0.14, 0.56 - depth * 0.09) }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.98rem] font-semibold text-ink">{row.name || "Unnamed ingredient"}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate">
            <span className="font-mono">{row.cas || "No CAS"}</span>
            <span>•</span>
            <span>Input ingredient</span>
          </div>
          {row.reference || row.description ? (
            <div className="mt-2 text-xs text-slate">{row.reference || row.description}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={resolutionLabels[row.ecoinventStatus]} tone={resolutionTone(row.ecoinventStatus)} />
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
  onAddChildDependency,
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
  onAddChildDependency: (parentMoleculeId: string) => void;
  onCreateParentMolecule: (childMoleculeId: string) => void;
}) {
  const displayStatus = getEffectiveResolutionStatus(project, molecule);
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
        className="relative overflow-hidden rounded-[1.7rem] border border-mist/80 bg-white/90 px-5 py-4 shadow-sm"
        style={{ marginLeft: `${depth * 30}px` }}
      >
        <div
          className="absolute left-0 top-0 h-full w-1.5 rounded-r-full bg-accent/20"
          style={{ opacity: Math.max(0.18, 0.68 - depth * 0.12) }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition ${
                hasChildren
                  ? "border-mist bg-lab text-ink hover:border-accent hover:text-accent"
                  : "border-mist/50 bg-white text-slate"
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
              {hasChildren ? (expanded ? "−" : "+") : "·"}
            </button>

            <div className="min-w-0">
              <button
                className="truncate text-left text-[1.02rem] font-semibold text-ink transition hover:text-accent"
                onClick={() => onOpenMolecule(molecule.id)}
                type="button"
              >
                {molecule.name}
              </button>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate">
                <span className="font-mono">{molecule.cas || "No CAS"}</span>
                <span>•</span>
                <span>{depth === 0 ? (molecule.topLevel ? "Root molecule" : "Unplaced root") : `Depth ${depth}`}</span>
                {viaRow?.reference ? (
                  <>
                    <span>•</span>
                    <span>{viaRow.reference}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-mist/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
              onClick={() => {
                setExpandedIds((current) => {
                  const next = new Set(current);
                  next.add(molecule.id);
                  return next;
                });
                onAddChildDependency(molecule.id);
              }}
              type="button"
            >
              Add child
            </button>
            <button
              className="rounded-full border border-mist/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate transition hover:border-accent hover:text-accent"
              onClick={() => onCreateParentMolecule(molecule.id)}
              type="button"
            >
              Add parent
            </button>
            <StatusBadge label={resolutionLabels[displayStatus]} tone={resolutionTone(displayStatus)} />
            {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
            {cycleDetected ? <StatusBadge label="Cycle" tone="alert" /> : null}
          </div>
        </div>
      </div>

      {expanded && !cycleDetected ? (
        <div className="space-y-2 border-l border-mist/70 pl-3">
          {displayEntries.map((entry) =>
            entry.kind === "molecule" ? (
              <TreeNode
                key={`${molecule.id}-${entry.row?.id ?? entry.molecule.id}`}
                depth={depth + 1}
                expandedIds={expandedIds}
                molecule={entry.molecule}
                onOpenMolecule={onOpenMolecule}
                onAddChildDependency={onAddChildDependency}
                onCreateParentMolecule={onCreateParentMolecule}
                path={new Set([...path, molecule.id])}
                project={project}
                setExpandedIds={setExpandedIds}
                showAllIngredients={showAllIngredients}
                viaRow={entry.row}
                visibleIds={visibleIds}
              />
            ) : (
              <IngredientNode key={entry.row.id} depth={depth + 1} row={entry.row} />
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
  onAddChildDependency,
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
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Cascade hierarchy</div>
          <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Dependency cascade</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Main molecules are shown first. Expand each level to inspect child molecules and deeper dependency chains.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge label={`${rootMolecules.length} top-level`} tone="ink" />
          <label className="flex items-center gap-2 rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm">
            <input
              checked={showAllIngredients}
              className="h-4 w-4 rounded border-mist text-accent focus:ring-accent"
              onChange={(event) => setShowAllIngredients(event.target.checked)}
              type="checkbox"
            />
            Show all input ingredients
          </label>
          <button
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition hover:bg-ink"
            onClick={onCreateTopLevelMolecule}
            type="button"
          >
            Add top-level molecule
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rootMolecules.length > 0 ? (
          rootMolecules.map((molecule) => (
            <TreeNode
              key={molecule.id}
              depth={0}
              expandedIds={expandedIds}
              molecule={molecule}
              onOpenMolecule={onOpenMolecule}
              onAddChildDependency={onAddChildDependency}
              onCreateParentMolecule={onCreateParentMolecule}
              path={new Set()}
              project={project}
              setExpandedIds={setExpandedIds}
              showAllIngredients={showAllIngredients}
              visibleIds={visibleIds}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-mist bg-lab px-4 py-8 text-sm text-slate">
            <div>No molecules yet. Start the process chain by creating the first top-level molecule.</div>
            <button
              className="mt-4 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition hover:bg-ink"
              onClick={onCreateTopLevelMolecule}
              type="button"
            >
              Create first molecule
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
