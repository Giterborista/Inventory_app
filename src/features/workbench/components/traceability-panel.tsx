"use client";

import { useMemo, useState } from "react";

import { formatRelativeTime } from "@/lib/utils";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone } from "@/features/workbench/display";
import { getEffectiveResolutionStatus, getExportVersionLabel, getMoleculeTraceability } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type TraceabilityPanelProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  onOpenMolecule: (moleculeId: string) => void;
  onAddManualParent: (parentMoleculeId: string) => void;
  onCreateParentMolecule: () => void;
  onRemoveManualParent: (parentMoleculeId: string) => void;
  onMoveChild: (childMoleculeId: string, direction: "up" | "down") => void;
};

export function TraceabilityPanel({
  project,
  molecule,
  onOpenMolecule,
  onAddManualParent,
  onCreateParentMolecule,
  onRemoveManualParent,
  onMoveChild,
}: TraceabilityPanelProps) {
  const [selectedParentId, setSelectedParentId] = useState("");
  const traceability = getMoleculeTraceability(project, molecule);
  const effectiveStatus = getEffectiveResolutionStatus(project, molecule);
  const availableParents = useMemo(
    () =>
      project.molecules.filter(
        (candidate) =>
          candidate.id !== molecule.id &&
          !project.links.some(
            (link) =>
              link.parentMoleculeId === candidate.id && link.childMoleculeId === molecule.id,
          ),
      ),
    [molecule.id, project.links, project.molecules],
  );
  const hierarchyLabel =
    traceability.parents.length === 0
      ? "Top-level molecule"
      : traceability.parents.length > 1
        ? `Reused intermediate in ${traceability.parents.length} parents`
        : `Child of ${traceability.parents[0]?.name ?? "another molecule"}`;

  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="section-title">Traceability</div>
          <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Traceability summary</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate">
            Keep the parent/child hierarchy, project context, reuse, and review state visible without fragmenting the object inventory.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={resolutionLabels[effectiveStatus]} tone={resolutionTone(effectiveStatus)} />
          {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-[1.5rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Project</div>
          <div className="mt-1 text-sm text-ink">{project.name}</div>
        </div>
        <div className="rounded-[1.5rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Hierarchy position</div>
          <div className="mt-1 text-sm text-ink">{hierarchyLabel}</div>
        </div>
        <div className="rounded-[1.5rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Latest export</div>
          <div className="mt-1 text-sm text-ink">{getExportVersionLabel(molecule)}</div>
        </div>
        <div className="rounded-[1.5rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Last modified</div>
          <div className="mt-1 text-sm text-ink">{formatRelativeTime(molecule.updatedAt)}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="rounded-[1.7rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Parent molecules</h3>
            <StatusBadge label={String(traceability.parents.length)} tone="ink" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {traceability.parents.length > 0 ? (
              traceability.parents.map((parent) => {
                const manualLink = project.links.find(
                  (link) =>
                    link.parentMoleculeId === parent.id &&
                    link.childMoleculeId === molecule.id &&
                    link.sourceRowId === null,
                );

                return (
                  <div key={parent.id} className="flex items-center gap-2 rounded-full border border-mist/80 bg-white px-3 py-1.5 shadow-sm">
                    <button
                      className="text-sm text-slate transition hover:text-accent"
                      onClick={() => onOpenMolecule(parent.id)}
                      type="button"
                    >
                      {parent.name}
                    </button>
                    <StatusBadge label={manualLink ? "Manual" : "Row-linked"} tone={manualLink ? "ink" : "accent"} />
                    {manualLink ? (
                      <button
                        className="text-xs font-medium text-alert transition hover:underline"
                        onClick={() => onRemoveManualParent(parent.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <span className="text-sm text-slate">No parent molecule.</span>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-2xl border border-mist bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
              onChange={(event) => setSelectedParentId(event.target.value)}
              value={selectedParentId}
            >
              <option value="">Add manual parent…</option>
              {availableParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
            <button
              className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedParentId}
              onClick={() => {
                if (!selectedParentId) {
                  return;
                }
                onAddManualParent(selectedParentId);
                setSelectedParentId("");
              }}
              type="button"
            >
              Add
            </button>
          </div>
          <button
            className="mt-3 rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onCreateParentMolecule}
            type="button"
          >
            Create new parent molecule
          </button>
        </div>

        <div className="rounded-[1.7rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Child molecules</h3>
            <StatusBadge label={String(traceability.children.length)} tone="ink" />
          </div>
          <div className="mt-3 space-y-2">
            {traceability.children.length > 0 ? (
              traceability.children.map((child, index) => (
                <div
                  key={child.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mist/80 bg-white px-3 py-2 shadow-sm"
                >
                  <button
                    className="text-sm text-slate transition hover:text-accent"
                    onClick={() => onOpenMolecule(child.id)}
                    type="button"
                  >
                    {child.name}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border border-mist px-3 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                      onClick={() => onMoveChild(child.id, "up")}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      className="rounded-full border border-mist px-3 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                      onClick={() => onMoveChild(child.id, "down")}
                      type="button"
                    >
                      Down
                    </button>
                    <span className="text-xs text-slate">#{index + 1}</span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-sm text-slate">No linked child molecules.</span>
            )}
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-mist/80 bg-lab px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Reuse and review</h3>
            <StatusBadge label={`${traceability.reusedByCount} reuse`} tone="ink" />
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate">
            <p>
              <span className="font-medium text-ink">Primary source:</span>{" "}
              {traceability.primaryEvidence?.citation || "No source captured yet"}
            </p>
            <p>
              <span className="font-medium text-ink">Unresolved children:</span>{" "}
              {traceability.unresolvedChildren.length > 0
                ? traceability.unresolvedChildren.map((child) => child.name).join(", ")
                : "None"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
