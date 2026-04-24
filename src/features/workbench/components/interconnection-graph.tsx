"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "@/features/workbench/components/status-badge";
import {
  getEffectiveResolutionStatus,
  getMoleculeRows,
  getTopLevelMolecules,
} from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

type InterconnectionGraphProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
};

type PreviewViewport = {
  x: number;
  y: number;
  scale: number;
};

type TreeNode = {
  instanceId: string;
  sourceId: string;
  kind: "molecule" | "ingredient";
  label: string;
  casOrMeta: string;
  flagged: boolean;
  molecule?: MoleculeRecord;
  row?: ReconstructionRow;
  children: TreeNode[];
  subtreeWidth: number;
  maxDepth: number;
  x: number;
  y: number;
};

type TreeRoot = {
  root: TreeNode;
  height: number;
};

const NODE_WIDTH = 330;
const NODE_HEIGHT = 110;
const CARD_RADIUS = 28;
const HORIZONTAL_GAP = 48;
const LEVEL_GAP = 158;
const ROOT_GAP = 84;
const PADDING_X = 48;
const PADDING_Y = 34;
const PREVIEW_HEIGHT = 760;

function getStatusStroke(status: MoleculeRecord["ecoinventStatus"] | ReconstructionRow["ecoinventStatus"]) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function wrapLabel(value: string, maxLength = 30) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLength || current.length === 0) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === 1) {
      break;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 2).map((line, index, array) => {
    if (index === array.length - 1 && trimmed.length > array.join(" ").length) {
      return `${line.slice(0, Math.max(0, maxLength - 3))}...`;
    }
    return line;
  });
}

function measureNode(node: TreeNode): TreeNode {
  const measuredChildren = node.children.map(measureNode);
  const childrenWidth = measuredChildren.reduce((sum, child) => sum + child.subtreeWidth, 0);
  const gapsWidth = measuredChildren.length > 1 ? (measuredChildren.length - 1) * HORIZONTAL_GAP : 0;

  return {
    ...node,
    children: measuredChildren,
    subtreeWidth: measuredChildren.length === 0 ? NODE_WIDTH : Math.max(NODE_WIDTH, childrenWidth + gapsWidth),
    maxDepth: measuredChildren.length === 0 ? 0 : 1 + Math.max(...measuredChildren.map((child) => child.maxDepth)),
  };
}

function positionNode(node: TreeNode, left: number, top: number): TreeNode {
  const centeredX = left + (node.subtreeWidth - NODE_WIDTH) / 2;
  if (node.children.length === 0) {
    return { ...node, x: centeredX, y: top };
  }

  let cursor = left;
  const positionedChildren = node.children.map((child) => {
    const positioned = positionNode(child, cursor, top + LEVEL_GAP);
    cursor += child.subtreeWidth + HORIZONTAL_GAP;
    return positioned;
  });

  return {
    ...node,
    x: centeredX,
    y: top,
    children: positionedChildren,
  };
}

function flattenNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flattenNodes)];
}

export function InterconnectionGraph({ project, visibleIds, onOpenMolecule }: InterconnectionGraphProps) {
  const [showAllIngredients, setShowAllIngredients] = useState(false);
  const [viewport, setViewport] = useState<PreviewViewport>({ x: 24, y: 24, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const graph = useMemo(() => {
    const molecules = project.molecules.filter((molecule) => !visibleIds || visibleIds.has(molecule.id));
    const moleculeById = new Map(molecules.map((molecule) => [molecule.id, molecule]));
    const childIdsByParentId = new Map<string, string[]>();

    for (const link of project.links) {
      if (!moleculeById.has(link.parentMoleculeId) || !moleculeById.has(link.childMoleculeId)) {
        continue;
      }
      childIdsByParentId.set(link.parentMoleculeId, [...(childIdsByParentId.get(link.parentMoleculeId) ?? []), link.childMoleculeId]);
    }

    for (const [parentId, childIds] of childIdsByParentId) {
      childIdsByParentId.set(
        parentId,
        childIds
          .slice()
          .sort((left, right) => (moleculeById.get(left)?.name ?? "").localeCompare(moleculeById.get(right)?.name ?? "")),
      );
    }

    const buildMoleculeNode = (moleculeId: string, ancestry: Set<string>, instancePath: string): TreeNode => {
      const molecule = moleculeById.get(moleculeId)!;
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(molecule.id);

      const childNodes = (childIdsByParentId.get(moleculeId) ?? []).flatMap((childId, index) => {
        if (nextAncestry.has(childId)) {
          return [];
        }
        return buildMoleculeNode(childId, nextAncestry, `${instancePath}:m:${index}:${childId}`);
      });

      const ingredientNodes = showAllIngredients
        ? getMoleculeRows(molecule, "INPUT")
            .filter((row) => !row.linkedMoleculeId)
            .sort((left, right) => left.name.localeCompare(right.name))
            .map<TreeNode>((row, index) => ({
              instanceId: `${instancePath}:i:${index}:${row.id}`,
              sourceId: row.id,
              kind: "ingredient",
              label: row.name || "Unnamed ingredient",
              casOrMeta: row.cas || row.unit || "Input ingredient",
              flagged: row.ecoinventStatus !== "present",
              row,
              children: [],
              subtreeWidth: NODE_WIDTH,
              maxDepth: 0,
              x: 0,
              y: 0,
            }))
        : [];

      return {
        instanceId: instancePath,
        sourceId: molecule.id,
        kind: "molecule",
        label: molecule.name,
        casOrMeta: molecule.cas || "No CAS",
        flagged:
          molecule.placeholder ||
          molecule.needsReview ||
          getEffectiveResolutionStatus(project, molecule) !== "present",
        molecule,
        children: [...childNodes, ...ingredientNodes],
        subtreeWidth: NODE_WIDTH,
        maxDepth: 0,
        x: 0,
        y: 0,
      };
    };

    const roots = getTopLevelMolecules(project)
      .filter((molecule) => moleculeById.has(molecule.id))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((molecule, index) => buildMoleculeNode(molecule.id, new Set<string>(), `root:${index}:${molecule.id}`))
      .map(measureNode);

    const maxTreeWidth = roots.length > 0 ? Math.max(...roots.map((root) => root.subtreeWidth)) : NODE_WIDTH;
    let currentTop = PADDING_Y;

    const positionedRoots = roots.map<TreeRoot>((root) => {
      const positioned = positionNode(root, PADDING_X + (maxTreeWidth - root.subtreeWidth) / 2, currentTop);
      const height = NODE_HEIGHT + root.maxDepth * LEVEL_GAP;
      currentTop += height + ROOT_GAP;
      return { root: positioned, height };
    });

    return {
      roots: positionedRoots,
      width: maxTreeWidth + PADDING_X * 2,
      height: Math.max(currentTop - ROOT_GAP + PADDING_Y, PREVIEW_HEIGHT),
    };
  }, [project, showAllIngredients, visibleIds]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const fitScale = clamp(
      Math.min((wrapper.clientWidth - 32) / graph.width, (wrapper.clientHeight - 32) / graph.height, 1),
      0.32,
      1,
    );
    setViewport({ x: 24, y: 24, scale: fitScale });
  }, [graph.height, graph.width]);

  const zoomBy = (multiplier: number) => {
    setViewport((current) => ({
      ...current,
      scale: clamp(current.scale * multiplier, 0.3, 2.6),
    }));
  };

  const resetView = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      setViewport({ x: 24, y: 24, scale: 1 });
      return;
    }
    const fitScale = clamp(
      Math.min((wrapper.clientWidth - 32) / graph.width, (wrapper.clientHeight - 32) / graph.height, 1),
      0.32,
      1,
    );
    setViewport({ x: 24, y: 24, scale: fitScale });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      x: viewport.x,
      y: viewport.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    setViewport((current) => ({
      ...current,
      x: dragState.x + (event.clientX - dragState.startX),
      y: dragState.y + (event.clientY - dragState.startY),
    }));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const multiplier = event.deltaY > 0 ? 0.92 : 1.08;
    zoomBy(multiplier);
  };

  const downloadHighQualityImage = async () => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }

    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.style.removeProperty("transform");
    clone.style.removeProperty("transform-origin");
    clone.style.removeProperty("width");
    clone.style.removeProperty("height");
    clone.setAttribute("width", String(graph.width));
    clone.setAttribute("height", String(graph.height));

    const markup = `<?xml version="1.0" encoding="UTF-8"?>${clone.outerHTML}`;
    const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();
      image.decoding = "async";
      image.src = svgUrl;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Unable to render SVG export."));
      });

      const canvas = document.createElement("canvas");
      const scale = 2.4;
      canvas.width = Math.round(graph.width * scale);
      canvas.height = Math.round(graph.height * scale);
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.fillStyle = "#f7fbfa";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, graph.width, graph.height);

      const pngUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${project.name || "project"}-dependency-tree.png`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      link.click();
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-title">Preview tree</div>
          <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Vertical dependency map</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
            Read the molecule structure top to bottom. Each branch is expanded as a clean tree preview to cut line
            crossings and keep upstream chains readable. Reused molecules are repeated visually when needed so the
            structure stays easy to inspect.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm">
            <input
              checked={showAllIngredients}
              className="h-4 w-4 rounded border-mist text-accent focus:ring-accent"
              onChange={(event) => setShowAllIngredients(event.target.checked)}
              type="checkbox"
            />
            Show complete tree with ingredients
          </label>
          <button
            className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm transition hover:border-accent hover:text-accent"
            onClick={() => zoomBy(1.14)}
            type="button"
          >
            Zoom in
          </button>
          <button
            className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm transition hover:border-accent hover:text-accent"
            onClick={() => zoomBy(0.88)}
            type="button"
          >
            Zoom out
          </button>
          <button
            className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm transition hover:border-accent hover:text-accent"
            onClick={resetView}
            type="button"
          >
            Reset
          </button>
          <button
            className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate shadow-sm transition hover:border-accent hover:text-accent"
            onClick={() => void downloadHighQualityImage()}
            type="button"
          >
            Download image
          </button>
          <StatusBadge label="Flagged" tone="alert" />
        </div>
      </div>

      {graph.roots.length > 0 ? (
        <div
          className={`mt-6 overflow-hidden rounded-[1.9rem] border border-mist/80 bg-[#f6faf9] ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={handleWheel}
          ref={wrapperRef}
          style={{ height: `${PREVIEW_HEIGHT}px`, touchAction: "none" }}
        >
          <svg
            className="select-none"
            height={graph.height}
            ref={svgRef}
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: "0 0",
            }}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            width={graph.width}
          >
            <rect fill="#f7fbfa" height={graph.height} rx="32" width={graph.width} />

            {graph.roots.map((entry, index) => (
              <rect
                fill={index % 2 === 0 ? "#edf6f4" : "#f8fbfa"}
                height={entry.height + 48}
                key={`tree-band:${entry.root.instanceId}`}
                rx="28"
                width={graph.width - 32}
                x={16}
                y={entry.root.y - 24}
              />
            ))}

            {graph.roots
              .flatMap((entry) => flattenNodes(entry.root))
              .filter((node) => node.children.length > 0)
              .map((node) => {
                const parentCenterX = node.x + NODE_WIDTH / 2;
                const parentBottomY = node.y + NODE_HEIGHT;
                const branchY = parentBottomY + 34;
                const childCenters = node.children.map((child) => child.x + NODE_WIDTH / 2);

                return (
                  <g key={`connector:${node.instanceId}`}>
                    <line
                      stroke="#96abac"
                      strokeLinecap="round"
                      strokeWidth="3"
                      x1={parentCenterX}
                      x2={parentCenterX}
                      y1={parentBottomY}
                      y2={branchY}
                    />
                    {node.children.length > 1 ? (
                      <line
                        stroke="#96abac"
                        strokeLinecap="round"
                        strokeWidth="3"
                        x1={Math.min(...childCenters)}
                        x2={Math.max(...childCenters)}
                        y1={branchY}
                        y2={branchY}
                      />
                    ) : null}
                    {node.children.map((child) => (
                      <line
                        key={`child-connector:${child.instanceId}`}
                        stroke="#96abac"
                        strokeLinecap="round"
                        strokeWidth="3"
                        x1={child.x + NODE_WIDTH / 2}
                        x2={child.x + NODE_WIDTH / 2}
                        y1={branchY}
                        y2={child.y}
                      />
                    ))}
                  </g>
                );
              })}

            {graph.roots.flatMap((entry) => flattenNodes(entry.root)).map((node) => {
              const status =
                node.kind === "ingredient" && node.row
                  ? node.row.ecoinventStatus
                  : getEffectiveResolutionStatus(project, node.molecule!);
              const labelLines = wrapLabel(node.label, 30);

              return (
                <g
                  className="cursor-pointer"
                  key={node.instanceId}
                  onClick={() => {
                    if (node.kind === "molecule" && node.molecule) {
                      onOpenMolecule(node.molecule.id);
                    }
                  }}
                >
                  <rect
                    fill={node.kind === "ingredient" ? "#fbfcfc" : "#ffffff"}
                    filter="drop-shadow(0 18px 24px rgba(18,34,35,0.08))"
                    height={NODE_HEIGHT}
                    rx={CARD_RADIUS}
                    stroke={getStatusStroke(status)}
                    strokeDasharray={node.flagged ? "9 7" : undefined}
                    strokeWidth={node.flagged ? 3 : 2.4}
                    width={NODE_WIDTH}
                    x={node.x}
                    y={node.y}
                  />
                  {labelLines.map((line, index) => (
                    <text
                      fill="#132021"
                      fontSize="18"
                      fontWeight="700"
                      key={`label:${node.instanceId}:${index}`}
                      x={node.x + 24}
                      y={node.y + 36 + index * 24}
                    >
                      {line}
                    </text>
                  ))}
                  <text fill="#61737a" fontSize="14" fontWeight="600" x={node.x + 24} y={node.y + 68}>
                    {node.casOrMeta}
                  </text>
                  {node.flagged ? (
                    <>
                      <rect
                        fill="#fff4ef"
                        height="28"
                        rx="14"
                        stroke="#b85c38"
                        strokeWidth="1.7"
                        width="86"
                        x={node.x + 24}
                        y={node.y + 70}
                      />
                      <text fill="#b35d39" fontSize="15" fontWeight="700" x={node.x + 67} y={node.y + 89}>
                        flagged
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
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
