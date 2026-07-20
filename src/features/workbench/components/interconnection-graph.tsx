"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
} from "@/features/workbench/types";

type InterconnectionGraphProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  showInputs: boolean;
  disconnectedActivityIds?: Set<string>;
};
type Viewport = { x: number; y: number; scale: number };
type ActivityNode = {
  activity: MoleculeRecord;
  x: number;
  y: number;
  blockY: number;
  blockHeight: number;
  depth: number;
};
type FlowNode = {
  row: ReconstructionRow;
  ownerId: string;
  x: number;
  y: number;
  input: boolean;
};
type LinkedEdge = {
  id: string;
  parentId: string;
  childId: string;
  row: ReconstructionRow | null;
  labelX: number;
  labelY: number;
  targetY: number;
};

const ACTIVITY_WIDTH = 290;
const ACTIVITY_HEIGHT = 112;
const FLOW_WIDTH = 235;
const FLOW_HEIGHT = 64;
const FLOW_GAP = 56;
const FLOW_NODE_GAP = 10;
const SUBTREE_GAP = 22;
const LANE_PADDING = 16;
const STAGE_STEP = ACTIVITY_WIDTH + FLOW_WIDTH * 2 + FLOW_GAP * 3;
const PADDING = 48;
const PREVIEW_HEIGHT = 800;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
function compact(value: string, max = 29) {
  const clean = value.trim() || "Untitled";
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean;
}
function wrapCompact(value: string, max = 31) {
  const words = (value.trim() || "Untitled").split(/\s+/);
  const lines: string[] = [];
  let truncated = false;
  for (const word of words) {
    const current = lines.at(-1) ?? "";
    if (current && `${current} ${word}`.length <= max) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < 2) {
      lines.push(word);
    } else {
      truncated = true;
      break;
    }
  }
  if (truncated && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, max - 1).trimEnd()}…`;
  return lines.slice(0, 2);
}
function activityTitle(activity: MoleculeRecord) {
  return activity.name || "Untitled activity";
}
function flowAmount(row: ReconstructionRow) {
  return `${row.totalValue || "Amount missing"}${row.unit ? ` ${row.unit}` : ""}`;
}

function GraphButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="h-9 rounded-sm border border-mist px-3 text-xs font-semibold text-ink transition hover:bg-lab"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function InterconnectionGraph({
  project,
  visibleIds,
  onOpenMolecule,
  showInputs,
  disconnectedActivityIds = new Set(),
}: InterconnectionGraphProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [viewport, setViewport] = useState<Viewport>({
    x: 20,
    y: 20,
    scale: 1,
  });
  const [dragging, setDragging] = useState(false);
  const graph = useMemo(() => {
    const activities = project.molecules.filter(
      (item) => !visibleIds || visibleIds.has(item.id),
    );
    const ids = new Set(activities.map((item) => item.id));
    const links = project.links.filter(
      (link) => ids.has(link.parentMoleculeId) && ids.has(link.childMoleculeId),
    );
    const activityById = new Map(activities.map((item) => [item.id, item]));
    const children = new Map<string, typeof links>();
    const incoming = new Set<string>();
    activities.forEach((item) => children.set(item.id, []));
    links.forEach((link) => {
      children.get(link.parentMoleculeId)?.push(link);
      incoming.add(link.childMoleculeId);
    });
    children.forEach((items) =>
      items.sort((a, b) => a.sortOrder - b.sortOrder),
    );

    const roots = activities
      .filter((item) => item.topLevel || !incoming.has(item.id))
      .sort((a, b) => a.rootOrder - b.rootOrder || a.name.localeCompare(b.name));
    if (!roots.length && activities[0]) roots.push(activities[0]);

    const depthMemo = new Map<string, number>();
    const branchDepth = (id: string, path = new Set<string>()): number => {
      if (path.has(id)) return 0;
      if (depthMemo.has(id)) return depthMemo.get(id)!;
      const nextPath = new Set(path).add(id);
      const depth = Math.max(
        0,
        ...(children.get(id) ?? []).map(
          (link) => 1 + branchDepth(link.childMoleculeId, nextPath),
        ),
      );
      depthMemo.set(id, depth);
      return depth;
    };
    const maxDepth = Math.max(0, ...roots.map((root) => branchDepth(root.id)));

    const heightMemo = new Map<string, number>();
    const subtreeHeight = (id: string, path = new Set<string>()): number => {
      if (path.has(id)) return ACTIVITY_HEIGHT + LANE_PADDING * 2;
      if (heightMemo.has(id)) return heightMemo.get(id)!;
      const activity = activityById.get(id);
      if (!activity) return 0;
      const nextPath = new Set(path).add(id);
      const ordinaryCount = showInputs
        ? activity.rows.filter((row) => row.section === "INPUT" && !row.linkedMoleculeId).length
        : 0;
      const childLinks = children.get(id) ?? [];
      const childHeights = childLinks.map((link) =>
        subtreeHeight(link.childMoleculeId, nextPath),
      );
      const displayedInputCount = ordinaryCount + childLinks.length;
      const inputHeight = displayedInputCount
        ? displayedInputCount * FLOW_HEIGHT + (displayedInputCount - 1) * FLOW_NODE_GAP
        : 0;
      const childStackHeight = childHeights.length
        ? childHeights.reduce((sum, value) => sum + value, 0) +
          (childHeights.length - 1) * FLOW_NODE_GAP
        : 0;
      const visibleOutputs = activity.rows.filter((row) => row.section === "OUTPUT").length -
        (incoming.has(id) ? 1 : 0);
      const outputHeight = visibleOutputs > 0
        ? visibleOutputs * FLOW_HEIGHT + (visibleOutputs - 1) * FLOW_NODE_GAP
        : 0;
      const height = Math.max(
        ACTIVITY_HEIGHT,
        inputHeight,
        childStackHeight,
        outputHeight,
      ) + LANE_PADDING * 2;
      heightMemo.set(id, height);
      return height;
    };

    const activityNodes: ActivityNode[] = [];
    const flowNodes: FlowNode[] = [];
    const linkedEdges: LinkedEdge[] = [];
    const placed = new Set<string>();
    const placeActivity = (id: string, depth: number, blockY: number, path = new Set<string>()) => {
      const activity = activityById.get(id);
      if (!activity || path.has(id) || placed.has(id)) return;
      placed.add(id);
      const blockHeight = subtreeHeight(id);
      const x = PADDING + FLOW_WIDTH + FLOW_GAP + (maxDepth - depth) * STAGE_STEP;
      const node: ActivityNode = {
        activity,
        depth,
        x,
        blockY,
        blockHeight,
        y: blockY + (blockHeight - ACTIVITY_HEIGHT) / 2,
      };
      activityNodes.push(node);

      const ordinaryInputs = showInputs
        ? activity.rows.filter((row) => row.section === "INPUT" && !row.linkedMoleculeId)
        : [];
      const childLinks = children.get(id) ?? [];
      const linkedInputs = childLinks.map((link) => ({
        link,
        row: activity.rows.find(
          (row) => row.id === link.sourceRowId || row.linkedMoleculeId === link.childMoleculeId,
        ) ?? null,
      }));
      const displayedInputs = [
        ...ordinaryInputs.map((row) => ({ link: null, row })),
        ...linkedInputs,
      ].sort((left, right) => {
        const leftOrder = left.row?.order ?? left.link?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.row?.order ?? right.link?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      });
      const inputHeight = displayedInputs.length
        ? displayedInputs.length * FLOW_HEIGHT +
          (displayedInputs.length - 1) * FLOW_NODE_GAP
        : 0;
      const inputY = blockY + (blockHeight - inputHeight) / 2;
      const linkedInputY = new Map<string, number>();
      displayedInputs.forEach((input, index) => {
        const y = inputY + index * (FLOW_HEIGHT + FLOW_NODE_GAP);
        if (input.link) {
          linkedInputY.set(input.link.id, y);
        } else if (input.row) {
          flowNodes.push({
            row: input.row,
            ownerId: id,
            input: true,
            x: x - FLOW_GAP - FLOW_WIDTH,
            y,
          });
        }
      });

      const childEntries = childLinks.map((link) => ({
        link,
        height: subtreeHeight(link.childMoleculeId),
      }));
      const childStackHeight = childEntries.length
        ? childEntries.reduce((sum, entry) => sum + entry.height, 0) +
          (childEntries.length - 1) * FLOW_NODE_GAP
        : 0;
      let entryY = blockY + (blockHeight - childStackHeight) / 2;
      const nextPath = new Set(path).add(id);
      childEntries.forEach((entry) => {
        const childId = entry.link.childMoleculeId;
        const sourceRow = activity.rows.find(
          (row) => row.id === entry.link.sourceRowId || row.linkedMoleculeId === childId,
        ) ?? null;
        linkedEdges.push({
          id: entry.link.id,
          parentId: id,
          childId,
          row: sourceRow,
          labelX: x - FLOW_GAP - FLOW_WIDTH,
          labelY: linkedInputY.get(entry.link.id) ?? node.y + (ACTIVITY_HEIGHT - FLOW_HEIGHT) / 2,
          targetY: clamp(
            (linkedInputY.get(entry.link.id) ?? node.y) + FLOW_HEIGHT / 2,
            node.y + 20,
            node.y + ACTIVITY_HEIGHT - 20,
          ),
        });
        placeActivity(childId, depth + 1, entryY, nextPath);
        entryY += entry.height + FLOW_NODE_GAP;
      });

      const allOutputs = activity.rows.filter((row) => row.section === "OUTPUT");
      const outputs = incoming.has(id) ? allOutputs.slice(1) : allOutputs;
      const outputHeight = outputs.length
        ? outputs.length * FLOW_HEIGHT + (outputs.length - 1) * FLOW_NODE_GAP
        : 0;
      outputs.forEach((row, index) =>
        flowNodes.push({
          row,
          ownerId: id,
          input: false,
          x: x + ACTIVITY_WIDTH + FLOW_GAP,
          y: blockY + (blockHeight - outputHeight) / 2 + index * (FLOW_HEIGHT + FLOW_NODE_GAP),
        }),
      );
    };

    let rootY = PADDING;
    roots.forEach((root) => {
      placeActivity(root.id, 0, rootY);
      rootY += subtreeHeight(root.id) + SUBTREE_GAP;
    });
    activities.forEach((activity) => {
      if (!placed.has(activity.id)) {
        placeActivity(activity.id, 0, rootY);
        rootY += subtreeHeight(activity.id) + SUBTREE_GAP;
      }
    });
    const nodeById = new Map(activityNodes.map((node) => [node.activity.id, node]));
    const width =
      PADDING * 2 + FLOW_WIDTH * 2 + FLOW_GAP * 2 + ACTIVITY_WIDTH + maxDepth * STAGE_STEP;
    const canvasHeight = Math.max(PREVIEW_HEIGHT, rootY - SUBTREE_GAP + PADDING);
    return {
      activityNodes,
      activityById: nodeById,
      flowNodes,
      linkedEdges,
      width,
      height: canvasHeight,
    };
  }, [project, showInputs, visibleIds]);

  const fitView = () => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const scale = clamp(
      Math.min(
        (wrapper.clientWidth - 40) / graph.width,
        (wrapper.clientHeight - 40) / graph.height,
        1,
      ),
      0.28,
      1,
    );
    setViewport({
      x: Math.max(20, (wrapper.clientWidth - graph.width * scale) / 2),
      y: Math.max(20, (wrapper.clientHeight - graph.height * scale) / 2),
      scale,
    });
  };
  const zoomBy = (factor: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    setViewport((current) => {
      const scale = clamp(current.scale * factor, 0.28, 2.4);
      const centerX = wrapper.clientWidth / 2;
      const centerY = wrapper.clientHeight / 2;
      const graphX = clamp((centerX - current.x) / current.scale, 0, graph.width);
      const graphY = clamp((centerY - current.y) / current.scale, 0, graph.height);
      return {
        x: centerX - graphX * scale,
        y: centerY - graphY * scale,
        scale,
      };
    });
  };
  useEffect(() => {
    fitView();
  }, [graph.height, graph.width]);

  const downloadImage = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.style.removeProperty("transform");
    clone.setAttribute("width", String(graph.width));
    clone.setAttribute("height", String(graph.height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const theme = getComputedStyle(document.documentElement);
    const themeStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    themeStyle.textContent = `:root{--graph-bg:${theme.getPropertyValue("--graph-bg")};--panel:${theme.getPropertyValue("--panel")};--ink:${theme.getPropertyValue("--ink")};--muted:${theme.getPropertyValue("--muted")};--line:${theme.getPropertyValue("--line")};--graph-line:${theme.getPropertyValue("--graph-line")}}`;
    clone.prepend(themeStyle);
    const link = document.createElement("a");
    link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    link.download = `${project.name || "project"}-inventory-network.svg`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    link.click();
  };

  return (
    <section className="overflow-hidden border-y border-mist/60 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist/60 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">Inventory network</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate">
            Inputs feed activities; activities create outputs. Inputs modelled
            by another project activity remain connected as activity nodes.
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Graph controls"
        >
          <GraphButton
            label="Zoom in"
            onClick={() => zoomBy(1.16)}
          />
          <GraphButton
            label="Zoom out"
            onClick={() => zoomBy(0.86)}
          />
          <GraphButton label="Fit network" onClick={fitView} />
          <GraphButton label="Download" onClick={downloadImage} />
        </div>
      </div>
      {graph.activityNodes.length ? (
        <div
          className={`theme-graph relative m-5 overflow-hidden border border-mist/60 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          ref={wrapperRef}
          style={{ height: PREVIEW_HEIGHT, touchAction: "none" }}
          onPointerDown={(event) => {
            dragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              x: viewport.x,
              y: viewport.y,
              moved: false,
            };
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
            setViewport((v) => ({ ...v, x: drag.x + dx, y: drag.y + dy }));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(false);
            window.setTimeout(() => {
              dragRef.current = null;
            }, 0);
          }}
        >
          <svg
            ref={svgRef}
            width={graph.width}
            height={graph.height}
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <defs>
              <marker
                id="network-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
              >
                <path d="M0 0 8 4 0 8Z" fill="var(--muted)" />
              </marker>
            </defs>
            <rect width={graph.width} height={graph.height} fill="var(--graph-bg)" />
            {graph.flowNodes.map((flow) => {
              const owner = graph.activityById.get(flow.ownerId);
              if (!owner) return null;
              const x1 = flow.input
                ? flow.x + FLOW_WIDTH
                : owner.x + ACTIVITY_WIDTH;
              const y1 = flow.input
                ? flow.y + FLOW_HEIGHT / 2
                : owner.y + ACTIVITY_HEIGHT / 2;
              const x2 = flow.input ? owner.x : flow.x;
              const y2 = flow.input
                ? clamp(
                    flow.y + FLOW_HEIGHT / 2,
                    owner.y + 20,
                    owner.y + ACTIVITY_HEIGHT - 20,
                  )
                : flow.y + FLOW_HEIGHT / 2;
              return (
                <path
                  key={`flow-path:${flow.ownerId}:${flow.row.id}`}
                  d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1},${(x1 + x2) / 2} ${y2},${x2 - (flow.input ? 7 : 0)} ${y2}`}
                  fill="none"
                  markerEnd="url(#network-arrow)"
                  stroke="var(--graph-line)"
                  strokeWidth="1.5"
                />
              );
            })}
            {graph.linkedEdges.map((edge) => {
              const parent = graph.activityById.get(edge.parentId);
              const child = graph.activityById.get(edge.childId);
              if (!parent || !child) return null;
              const childX = child.x + ACTIVITY_WIDTH;
              const childY = child.y + ACTIVITY_HEIGHT / 2;
              const labelY = edge.labelY + FLOW_HEIGHT / 2;
              const labelRight = edge.labelX + FLOW_WIDTH;
              const childBend = Math.max(44, (edge.labelX - childX) * 0.42);
              const parentBend = Math.max(24, (parent.x - labelRight) * 0.45);
              return (
                <g
                  key={`linked-path:${edge.id}`}
                  fill="none"
                  markerEnd="url(#network-arrow)"
                  stroke="var(--graph-line)"
                  strokeWidth="1.75"
                >
                  <path
                    d={`M${childX} ${childY} C${childX + childBend} ${childY},${edge.labelX - childBend} ${labelY},${edge.labelX - 7} ${labelY}`}
                  />
                  <path d={`M${labelRight} ${labelY} C${labelRight + parentBend} ${labelY},${parent.x - parentBend} ${edge.targetY},${parent.x - 7} ${edge.targetY}`} />
                </g>
              );
            })}
            {graph.flowNodes.map((flow) => {
              const nameLines = wrapCompact(flow.row.name || "Unnamed flow", 31);
              return (
                <g
                  key={`flow-node:${flow.ownerId}:${flow.row.id}`}
                  className="cursor-pointer"
                  onClick={() => onOpenMolecule(flow.ownerId)}
                  role="button"
                  tabIndex={0}
                >
                  <rect
                    x={flow.x}
                    y={flow.y}
                    width={FLOW_WIDTH}
                    height={FLOW_HEIGHT}
                    rx="4"
                    fill="var(--panel)"
                    stroke="var(--line)"
                  />
                  <text
                    x={flow.x + 12}
                    y={flow.y + 18}
                    fill="var(--ink)"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {nameLines.map((line, index) => <tspan key={`${line}:${index}`} x={flow.x + 12} dy={index ? 14 : 0}>{line}</tspan>)}
                  </text>
                  <text
                    x={flow.x + 12}
                    y={flow.y + 52}
                    fill="var(--muted)"
                    fontSize="10"
                  >
                    {compact(flowAmount(flow.row), 30)}
                  </text>
                </g>
              );
            })}
            {graph.linkedEdges.map((edge) => {
              const child = graph.activityById.get(edge.childId);
              if (!child) return null;
              const referenceOutput = child.activity.rows.find(
                (row) => row.section === "OUTPUT",
              );
              const label = edge.row?.name || referenceOutput?.name || child.activity.referenceProductName || child.activity.name;
              const amount = edge.row ? flowAmount(edge.row) : referenceOutput ? flowAmount(referenceOutput) : "Main output";
              const nameLines = wrapCompact(label, 31);
              return (
                <g
                  key={`linked-node:${edge.id}`}
                  className="cursor-pointer"
                  onClick={() => onOpenMolecule(child.activity.id)}
                  role="button"
                  tabIndex={0}
                >
                  <rect
                    x={edge.labelX}
                    y={edge.labelY}
                    width={FLOW_WIDTH}
                    height={FLOW_HEIGHT}
                    rx="4"
                    fill="var(--panel)"
                    stroke="var(--graph-line)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={edge.labelX + 12}
                    y={edge.labelY + 18}
                    fill="var(--ink)"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {nameLines.map((line, index) => <tspan key={`${line}:${index}`} x={edge.labelX + 12} dy={index ? 14 : 0}>{line}</tspan>)}
                  </text>
                  <text
                    x={edge.labelX + 12}
                    y={edge.labelY + 52}
                    fill="var(--muted)"
                    fontSize="10"
                  >
                    {compact(amount, 30)}
                  </text>
                </g>
              );
            })}
            {graph.activityNodes.map((node) => {
              const titleLines = wrapCompact(activityTitle(node.activity), 34);
              const disconnected = disconnectedActivityIds.has(node.activity.id);
              return (
                <g
                  key={node.activity.id}
                  className="cursor-pointer"
                  onClick={() => {
                    if (!dragRef.current?.moved) onOpenMolecule(node.activity.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      onOpenMolecule(node.activity.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                <rect
                  x={node.x}
                  y={node.y}
                  width={ACTIVITY_WIDTH}
                  height={ACTIVITY_HEIGHT}
                  rx="5"
                  fill="var(--panel)"
                  stroke={disconnected ? "var(--alert)" : node.activity.topLevel ? "var(--ink)" : "var(--graph-line)"}
                  strokeWidth={disconnected || node.activity.topLevel ? 2 : 1.5}
                />
                <text
                  x={node.x + 15}
                  y={node.y + 35}
                  fill="var(--ink)"
                  fontSize="14"
                  fontWeight="700"
                >
                  {titleLines.map((line, index) => <tspan key={line} x={node.x + 15} dy={index ? 18 : 0}>{line}</tspan>)}
                </text>
                <text
                  x={node.x + 15}
                  y={node.y + 91}
                  fill="var(--muted)"
                  fontSize="10"
                >
                  {
                    node.activity.rows.filter((r) => r.section === "INPUT")
                      .length
                  }{" "}
                  inputs ·{" "}
                  {
                    node.activity.rows.filter((r) => r.section === "OUTPUT")
                      .length
                  }{" "}
                  outputs
                </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="m-5 py-10 text-center text-sm text-slate">
          No inventory network yet. Create the first activity to begin.
        </div>
      )}
    </section>
  );
}
