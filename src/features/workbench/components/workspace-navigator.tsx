"use client";

import { type ReactNode, useMemo } from "react";

import { ReviewStatusIcon } from "@/features/workbench/components/review-status-icon";
import { getAncestorIds, getChildMolecules, getMoleculeInventoryReviewState, getTopLevelMolecules } from "@/features/workbench/selectors";
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

function MiniTreeNode({
  molecule,
  project,
  depth,
  selectedMoleculeId,
  expandedIds,
  onOpenMolecule,
}: {
  molecule: MoleculeRecord;
  project: ProjectRecord;
  depth: number;
  selectedMoleculeId: string;
  expandedIds: Set<string>;
  onOpenMolecule: (moleculeId: string) => void;
}) {
  const children = getChildMolecules(project, molecule.id);
  const isSelected = molecule.id === selectedMoleculeId;
  const isExpanded = children.length > 0 && expandedIds.has(molecule.id);
  const reviewState = getMoleculeInventoryReviewState(project, molecule);

  return (
    <div>
      <button
        className={`group flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
          isSelected
            ? "border-2 border-accent bg-white text-ink shadow-md ring-2 ring-accent/15"
            : "border-mist bg-white text-ink hover:border-accent/35"
        }`}
        onClick={() => onOpenMolecule(molecule.id)}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        type="button"
      >
        <span className="mt-0.5 shrink-0">
          <ReviewStatusIcon size="sm" state={reviewState} />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-xs font-semibold leading-4">{activityLabel(molecule)}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate">
            {molecule.referenceProductName || molecule.name || "No reference product"}
          </span>
        </span>
      </button>

      {isExpanded ? (
        <div className="mt-1 space-y-1 border-l border-mist pl-1">
          {children.map((child) => (
            <MiniTreeNode
              depth={depth + 1}
              expandedIds={expandedIds}
              key={child.id}
              molecule={child}
              onOpenMolecule={onOpenMolecule}
              project={project}
              selectedMoleculeId={selectedMoleculeId}
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
  children,
}: WorkspaceNavigatorProps) {
  const roots = useMemo(() => getTopLevelMolecules(project), [project]);
  const expandedIds = useMemo(() => {
    const ids = getAncestorIds(project, selectedMoleculeId);
    ids.add(selectedMoleculeId);
    return ids;
  }, [project, selectedMoleculeId]);

  return (
    <aside className="overflow-hidden rounded-lg bg-ink text-white shadow-sm">
      <div className="p-4">
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-white/8 px-3 text-xs font-semibold text-white transition hover:bg-white/12"
          onClick={onBack}
          type="button"
        >
          <span className="text-base leading-none">&lt;</span>
          Project overview
        </button>

        {children ? <div className="mt-4 border-t border-white/12 pt-4">{children}</div> : null}

        <div className="mt-4 border-t border-white/12 pt-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Inventory tree</div>
          <div className="mt-3 max-h-[calc(100vh-18rem)] space-y-1 overflow-y-auto rounded-lg bg-lab p-2">
            {roots.map((root) => (
              <MiniTreeNode
                depth={0}
                expandedIds={expandedIds}
                key={root.id}
                molecule={root}
                onOpenMolecule={onOpenMolecule}
                project={project}
                selectedMoleculeId={selectedMoleculeId}
              />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
