"use client";

import { useMemo } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import { getEffectiveResolutionStatus, getParentMolecules, getTopLevelMolecules } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord } from "@/features/workbench/types";

type InterconnectionGraphProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
};

type GraphNode = {
  molecule: MoleculeRecord;
  depth: number;
  x: number;
  y: number;
  topLevel: boolean;
  reused: boolean;
};

function getStatusStroke(status: MoleculeRecord["ecoinventStatus"]) {
  if (status === "present" || status === "proxy_created") {
    return "#2f7d67";
  }
  if (status === "in_progress" || status === "unchecked") {
    return "#b08a28";
  }
  if (status === "missing") {
    return "#b85c38";
  }
  return "#61737a";
}

export function InterconnectionGraph({ project, visibleIds, onOpenMolecule }: InterconnectionGraphProps) {
  const graph = useMemo(() => {
    const molecules = project.molecules.filter((molecule) => !visibleIds || visibleIds.has(molecule.id));
    const roots = getTopLevelMolecules(project).filter((molecule) => molecules.some((candidate) => candidate.id === molecule.id));
    const depthMap = new Map<string, number>();
    const queue = roots.map((molecule) => ({ id: molecule.id, depth: 0 }));

    for (const root of roots) {
      depthMap.set(root.id, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const link of project.links.filter((entry) => entry.parentMoleculeId === current.id)) {
        if (visibleIds && !visibleIds.has(link.childMoleculeId)) {
          continue;
        }

        const nextDepth = current.depth + 1;
        const existingDepth = depthMap.get(link.childMoleculeId);
        if (existingDepth === undefined || nextDepth < existingDepth) {
          depthMap.set(link.childMoleculeId, nextDepth);
          queue.push({ id: link.childMoleculeId, depth: nextDepth });
        }
      }
    }

    for (const molecule of molecules) {
      if (!depthMap.has(molecule.id)) {
        depthMap.set(molecule.id, 0);
      }
    }

    const columns = new Map<number, MoleculeRecord[]>();
    for (const molecule of molecules) {
      const depth = depthMap.get(molecule.id) ?? 0;
      columns.set(depth, [...(columns.get(depth) ?? []), molecule]);
    }

    const sortedDepths = [...columns.keys()].sort((a, b) => a - b);
    const nodes = new Map<string, GraphNode>();
    const columnWidth = 260;
    const rowHeight = 94;

    for (const depth of sortedDepths) {
      const column = (columns.get(depth) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
      column.forEach((molecule, index) => {
        nodes.set(molecule.id, {
          molecule,
          depth,
          x: 60 + depth * columnWidth,
          y: 60 + index * rowHeight,
          topLevel: molecule.topLevel || depth === 0,
          reused: getParentMolecules(project, molecule.id).length > 1,
        });
      });
    }

    const edges = project.links
      .filter(
        (link) =>
          nodes.has(link.parentMoleculeId) &&
          nodes.has(link.childMoleculeId) &&
          (!visibleIds || (visibleIds.has(link.parentMoleculeId) && visibleIds.has(link.childMoleculeId))),
      )
      .map((link) => ({
        id: link.id,
        source: nodes.get(link.parentMoleculeId)!,
        target: nodes.get(link.childMoleculeId)!,
      }));

    const width = Math.max(880, sortedDepths.length * columnWidth + 260);
    const height = Math.max(
      340,
      ...[...columns.values()].map((column) => column.length * rowHeight + 120),
    );

    return {
      nodes: [...nodes.values()],
      edges,
      width,
      height,
    };
  }, [project, visibleIds]);

  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Diagnostic view</div>
          <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Interconnection graph</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Secondary visual diagnostic view of all molecule links. Use it to spot wrong dependencies, reused intermediates, or isolated nodes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="Top-level" tone="accent" />
          <StatusBadge label="Nested" tone="ink" />
          <StatusBadge label="Reused / flagged" tone="alert" />
        </div>
      </div>

      {graph.nodes.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-[1.9rem] border border-mist/80 bg-[#f6faf9] p-4">
          <svg
            className="h-auto w-full"
            style={{ minWidth: `${graph.width}px` }}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
          >
            <defs>
              <marker
                id="graph-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto-start-reverse"
                refX="7"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 z" fill="#8aa0a1" />
              </marker>
            </defs>

            {graph.edges.map((edge) => {
              const startX = edge.target.x + 224;
              const startY = edge.target.y + 32;
              const endX = edge.source.x;
              const endY = edge.source.y + 32;
              const controlX = startX + (endX - startX) / 2;
              const path = `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;

              return (
                <path
                  key={edge.id}
                  d={path}
                  fill="none"
                  markerEnd="url(#graph-arrow)"
                  stroke="#96abac"
                  strokeWidth="2.2"
                />
              );
            })}

            {graph.nodes.map((node) => (
              <g
                key={node.molecule.id}
                className="cursor-pointer"
                onClick={() => onOpenMolecule(node.molecule.id)}
              >
                <rect
                  fill={node.topLevel ? "#f3fbf8" : "#ffffff"}
                  filter="drop-shadow(0 12px 20px rgba(18,34,35,0.08))"
                  height="64"
                  rx="20"
                  stroke={getStatusStroke(getEffectiveResolutionStatus(project, node.molecule))}
                  strokeDasharray={node.reused ? "6 4" : undefined}
                  strokeWidth={node.topLevel ? 3 : 2}
                  width="224"
                  x={node.x}
                  y={node.y}
                />
                <text fill="#132021" fontSize="13" fontWeight="600" x={node.x + 16} y={node.y + 24}>
                  {node.molecule.name.slice(0, 28)}
                </text>
                <text fill="#61737a" fontSize="11" x={node.x + 16} y={node.y + 44}>
                  {node.topLevel ? "Root molecule" : `Level ${node.depth}`} • {node.molecule.cas || "No CAS"}
                </text>
                {node.reused ? (
                  <text fill="#b35d39" fontSize="10" fontWeight="600" x={node.x + 16} y={node.y + 58}>
                    reused intermediate
                  </text>
                ) : null}
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-mist bg-lab px-4 py-8 text-sm text-slate">
          No molecule graph yet.
        </div>
      )}
    </section>
  );
}
