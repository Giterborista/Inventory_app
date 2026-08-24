"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getReferenceProductRow } from "@/features/workbench/selectors";
import type {
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
} from "@/features/workbench/types";

type InterconnectionGraphProps = {
  project: ProjectRecord;
  visibleIds: Set<string> | null;
  onOpenMolecule: (moleculeId: string) => void;
  onOpenRow: (moleculeId: string, row: ReconstructionRow) => void;
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
  laneIndex: number;
  laneCount: number;
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
const MAX_EXPORT_DIMENSION = 12_000;
const MAX_EXPORT_PIXELS = 24_000_000;

export function pngExportScale(width: number, height: number, activityCount: number) {
  const preferredScale = activityCount <= 2 ? 1 : activityCount <= 8 ? 1.5 : 2;
  const dimensionScale = Math.min(
    MAX_EXPORT_DIMENSION / Math.max(width, 1),
    MAX_EXPORT_DIMENSION / Math.max(height, 1),
  );
  const pixelScale = Math.sqrt(MAX_EXPORT_PIXELS / Math.max(width * height, 1));
  return Math.max(0.1, Math.min(preferredScale, dimensionScale, pixelScale));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function routingLane(startX: number, endX: number, index: number, count: number) {
  const direction = endX >= startX ? 1 : -1;
  const span = Math.abs(endX - startX);
  const inset = Math.min(12, span / 4);
  const usable = Math.max(0, span - inset * 2);
  return startX + direction * (inset + usable * ((index + 1) / (count + 1)));
}
function graphContentBounds(svg: SVGSVGElement) {
  const padding = 24;
  const elements = svg.querySelectorAll<SVGGraphicsElement>("g[data-graph-kind], path[data-graph-edge]");
  const boxes = Array.from(elements, (element) => element.getBBox());
  if (!boxes.length) {
    return { x: 0, y: 0, width: Number(svg.getAttribute("width")) || 1, height: Number(svg.getAttribute("height")) || 1 };
  }
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
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
  const amount = row.totalScaledValue.trim() || row.totalValue.trim() || "Amount missing";
  const unit = row.totalScaledValue.trim()
    ? row.scaledUnit.trim() || row.unit.trim()
    : row.unit.trim();
  return `${amount}${unit ? ` ${unit}` : ""}`;
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
  onOpenRow,
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

    // Assign stages across the complete DAG so reused suppliers always remain
    // to the left of every activity that consumes their main output.
    const depthById = new Map<string, number>();
    roots.forEach((root) => depthById.set(root.id, 0));
    for (let iteration = 0; iteration < activities.length; iteration += 1) {
      let changed = false;
      links.forEach((link) => {
        const parentDepth = depthById.get(link.parentMoleculeId);
        if (parentDepth === undefined) return;
        const nextDepth = parentDepth + 1;
        if (nextDepth > (depthById.get(link.childMoleculeId) ?? -1)) {
          depthById.set(link.childMoleculeId, nextDepth);
          changed = true;
        }
      });
      if (!changed) break;
    }
    activities.forEach((activity) => {
      if (!depthById.has(activity.id)) depthById.set(activity.id, 0);
    });
    const maxDepth = Math.max(0, ...depthById.values());

    const heightMemo = new Map<string, number>();
    const subtreeHeight = (id: string, path = new Set<string>()): number => {
      if (path.has(id)) return ACTIVITY_HEIGHT + LANE_PADDING * 2;
      if (heightMemo.has(id)) return heightMemo.get(id)!;
      const activity = activityById.get(id);
      if (!activity) return 0;
      const nextPath = new Set(path).add(id);
      const displayedInputCount = activity.rows.filter(
        (row) => row.section === "INPUT" && (showInputs || Boolean(row.linkedMoleculeId)),
      ).length;
      const childLinks = children.get(id) ?? [];
      const childHeights = childLinks.map((link) =>
        subtreeHeight(link.childMoleculeId, nextPath),
      );
      const inputHeight = displayedInputCount
        ? displayedInputCount * FLOW_HEIGHT + (displayedInputCount - 1) * FLOW_NODE_GAP
        : 0;
      const childStackHeight = childHeights.length
        ? childHeights.reduce((sum, value) => sum + value, 0) +
          (childHeights.length - 1) * FLOW_NODE_GAP
        : 0;
      const visibleOutputs = activity.rows.filter((row) => row.section === "OUTPUT").length;
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
      const stageDepth = depthById.get(id) ?? depth;
      const x = PADDING + FLOW_WIDTH + FLOW_GAP + (maxDepth - stageDepth) * STAGE_STEP;
      const node: ActivityNode = {
        activity,
        depth: stageDepth,
        x,
        blockY,
        blockHeight,
        y: blockY + (blockHeight - ACTIVITY_HEIGHT) / 2,
      };
      activityNodes.push(node);

      const childLinks = children.get(id) ?? [];
      const displayedInputs = activity.rows
        .filter((row) => row.section === "INPUT" && (showInputs || Boolean(row.linkedMoleculeId)))
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
      const inputHeight = displayedInputs.length
        ? displayedInputs.length * FLOW_HEIGHT +
          (displayedInputs.length - 1) * FLOW_NODE_GAP
        : 0;
      const inputY = blockY + (blockHeight - inputHeight) / 2;
      displayedInputs.forEach((row, index) => {
        const y = inputY + index * (FLOW_HEIGHT + FLOW_NODE_GAP);
        flowNodes.push({
          row,
          ownerId: id,
          input: true,
          x: x - FLOW_GAP - FLOW_WIDTH,
          y,
        });
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
          laneIndex: 0,
          laneCount: 1,
        });
        placeActivity(childId, depth + 1, entryY, nextPath);
        entryY += entry.height + FLOW_NODE_GAP;
      });

      const outputs = activity.rows
        .filter((row) => row.section === "OUTPUT")
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
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
    const flowNodeByKey = new Map(
      flowNodes.map((node) => [`${node.ownerId}:${node.row.id}`, node]),
    );
    const linkedEdgeGroups = new Map<string, LinkedEdge[]>();
    linkedEdges.forEach((edge) => {
      const child = nodeById.get(edge.childId);
      const parent = nodeById.get(edge.parentId);
      const key = `${child?.x ?? 0}:${parent?.x ?? 0}`;
      linkedEdgeGroups.set(key, [...(linkedEdgeGroups.get(key) ?? []), edge]);
    });
    linkedEdgeGroups.forEach((edges) => {
      edges.sort((left, right) => {
        const leftInput = left.row ? flowNodeByKey.get(`${left.parentId}:${left.row.id}`) : null;
        const rightInput = right.row ? flowNodeByKey.get(`${right.parentId}:${right.row.id}`) : null;
        const leftY = leftInput?.y ?? nodeById.get(left.parentId)?.y ?? 0;
        const rightY = rightInput?.y ?? nodeById.get(right.parentId)?.y ?? 0;
        return leftY - rightY || left.id.localeCompare(right.id);
      });
      edges.forEach((edge, index) => {
        edge.laneIndex = index;
        edge.laneCount = edges.length;
      });
    });
    const width =
      PADDING * 2 + FLOW_WIDTH * 2 + FLOW_GAP * 2 + ACTIVITY_WIDTH + maxDepth * STAGE_STEP;
    const canvasHeight = Math.max(240, rootY - SUBTREE_GAP + PADDING);
    return {
      activityNodes,
      activityById: nodeById,
      flowNodes,
      flowNodeByKey,
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

  const downloadImage = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const bounds = graphContentBounds(svg);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.style.removeProperty("transform");
    clone.setAttribute("width", String(bounds.width));
    clone.setAttribute("height", String(bounds.height));
    clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const theme = getComputedStyle(document.documentElement);
    const themeStyle = document.createElementNS("http://www.w3.org/2000/svg", "style");
    themeStyle.textContent = `:root{--graph-bg:${theme.getPropertyValue("--graph-bg")};--panel:${theme.getPropertyValue("--panel")};--ink:${theme.getPropertyValue("--ink")};--muted:${theme.getPropertyValue("--muted")};--line:${theme.getPropertyValue("--line")};--alert:${theme.getPropertyValue("--alert")};--graph-line:${theme.getPropertyValue("--graph-line")};--graph-input-fill:${theme.getPropertyValue("--graph-input-fill")};--graph-input-stroke:${theme.getPropertyValue("--graph-input-stroke")};--graph-input-text:${theme.getPropertyValue("--graph-input-text")};--graph-output-fill:${theme.getPropertyValue("--graph-output-fill")};--graph-output-stroke:${theme.getPropertyValue("--graph-output-stroke")};--graph-output-text:${theme.getPropertyValue("--graph-output-text")};--graph-input-line:${theme.getPropertyValue("--graph-input-line")};--graph-output-line:${theme.getPropertyValue("--graph-output-line")};--graph-activity-fill:${theme.getPropertyValue("--graph-activity-fill")}}`;
    clone.prepend(themeStyle);

    const scale = pngExportScale(bounds.width, bounds.height, graph.activityNodes.length);
    const exportWidth = Math.max(1, Math.round(bounds.width * scale));
    const exportHeight = Math.max(1, Math.round(bounds.height * scale));
    const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();
      image.src = svgUrl;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, exportWidth, exportHeight);

      const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!pngBlob) return;
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      const fileName = `${project.name || "project"}-inventory-network`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      link.href = pngUrl;
      link.download = `${fileName}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
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
          <div
            className="theme-popover absolute right-3 top-3 z-10 flex items-center gap-4 rounded-sm border border-mist/70 px-3 py-2 text-[11px] font-semibold text-slate shadow-sm"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[2px] border" style={{ background: "var(--graph-input-fill)", borderColor: "var(--graph-input-stroke)" }} />
              Input
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[2px] border" style={{ background: "var(--graph-activity-fill)", borderColor: "var(--graph-line)" }} />
              Activity
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[2px] border" style={{ background: "var(--graph-output-fill)", borderColor: "var(--graph-output-stroke)" }} />
              Output
            </span>
          </div>
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
                id="network-arrow-input"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="8"
                refY="4"
              >
                <path d="M0 0 8 4 0 8Z" fill="var(--graph-input-line)" />
              </marker>
              <marker
                id="network-arrow-output"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="8"
                refY="4"
              >
                <path d="M0 0 8 4 0 8Z" fill="var(--graph-output-line)" />
              </marker>
              <marker
                id="network-arrow-link"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="8"
                refY="4"
              >
                <path d="M0 0 8 4 0 8Z" fill="var(--graph-line)" />
              </marker>
            </defs>
            <rect width={graph.width} height={graph.height} fill="var(--graph-bg)" />
            {graph.flowNodes.map((flow) => {
              const owner = graph.activityById.get(flow.ownerId);
              if (!owner) return null;
              const siblings = graph.flowNodes.filter(
                (candidate) => candidate.ownerId === flow.ownerId && candidate.input === flow.input,
              );
              const siblingIndex = siblings.findIndex((candidate) => candidate.row.id === flow.row.id);
              const ownerPortY = owner.y + 18 +
                (ACTIVITY_HEIGHT - 36) * ((siblingIndex + 1) / (siblings.length + 1));
              const x1 = flow.input
                ? flow.x + FLOW_WIDTH
                : owner.x + ACTIVITY_WIDTH;
              const y1 = flow.input
                ? flow.y + FLOW_HEIGHT / 2
                : ownerPortY;
              const x2 = flow.input ? owner.x : flow.x;
              const y2 = flow.input ? ownerPortY : flow.y + FLOW_HEIGHT / 2;
              const laneX = routingLane(x1, x2, siblingIndex, siblings.length);
              return (
                <path
                  key={`flow-path:${flow.ownerId}:${flow.row.id}`}
                  data-graph-edge
                  d={`M${x1} ${y1} H${laneX} V${y2} H${x2}`}
                  fill="none"
                  markerEnd={flow.input ? "url(#network-arrow-input)" : "url(#network-arrow-output)"}
                  stroke={flow.input ? "var(--graph-input-line)" : "var(--graph-output-line)"}
                  strokeWidth="1.5"
                />
              );
            })}
            {graph.linkedEdges.map((edge) => {
              const child = graph.activityById.get(edge.childId);
              if (!child) return null;
              const childOutput = getReferenceProductRow(child.activity);
              const outputNode = childOutput
                ? graph.flowNodeByKey.get(`${child.activity.id}:${childOutput.id}`)
                : null;
              const inputNode = edge.row
                ? graph.flowNodeByKey.get(`${edge.parentId}:${edge.row.id}`)
                : null;
              if (!outputNode) return null;
              const parent = graph.activityById.get(edge.parentId);
              const x1 = outputNode.x + FLOW_WIDTH;
              const y1 = outputNode.y + FLOW_HEIGHT / 2;
              const x2 = inputNode?.x ?? parent?.x;
              const y2 = inputNode
                ? inputNode.y + FLOW_HEIGHT / 2
                : parent
                  ? parent.y + ACTIVITY_HEIGHT / 2
                  : null;
              if (x2 === undefined || y2 === null) return null;
              const laneX = routingLane(x1, x2, edge.laneIndex, edge.laneCount);
              const path = `M${x1} ${y1} H${laneX} V${y2} H${x2}`;
              return (
                <g key={`linked-path:${edge.id}`}>
                  <path d={path} fill="none" stroke="var(--graph-bg)" strokeWidth="5.5" />
                  <path
                    data-graph-edge
                    d={path}
                    fill="none"
                    markerEnd="url(#network-arrow-link)"
                    stroke="var(--graph-line)"
                    strokeWidth="1.75"
                  />
                </g>
              );
            })}
            {graph.flowNodes.map((flow) => {
              const nameLines = wrapCompact(flow.row.name || "Unnamed flow", 31);
              return (
                <g
                  key={`flow-node:${flow.ownerId}:${flow.row.id}`}
                  aria-label={`Open ${flow.input ? "input" : "output"} ${flow.row.name || "unnamed flow"}`}
                  className="cursor-pointer"
                  data-graph-kind={flow.input ? "input" : "output"}
                  data-molecule-id={flow.ownerId}
                  data-row-id={flow.row.id}
                  onClick={() => onOpenRow(flow.ownerId, flow.row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onOpenRow(flow.ownerId, flow.row);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  role="button"
                  tabIndex={0}
                >
                  <rect
                    x={flow.x}
                    y={flow.y}
                    width={FLOW_WIDTH}
                    height={FLOW_HEIGHT}
                    rx="4"
                    fill={flow.input ? "var(--graph-input-fill)" : "var(--graph-output-fill)"}
                    stroke={flow.input ? "var(--graph-input-stroke)" : "var(--graph-output-stroke)"}
                    strokeWidth="1.5"
                  />
                  <text
                    x={flow.x + 12}
                    y={flow.y + 18}
                    fill={flow.input ? "var(--graph-input-text)" : "var(--graph-output-text)"}
                    fontSize="11"
                    fontWeight="700"
                  >
                    {nameLines.map((line, index) => <tspan key={`${line}:${index}`} x={flow.x + 12} dy={index ? 14 : 0}>{line}</tspan>)}
                  </text>
                  <text
                    x={flow.x + 12}
                    y={flow.y + 52}
                    fill={flow.input ? "var(--graph-input-text)" : "var(--graph-output-text)"}
                    fontSize="10"
                    opacity="0.72"
                  >
                    {compact(flowAmount(flow.row), 30)}
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
                  aria-label={`Open activity ${activityTitle(node.activity)}`}
                  className="cursor-pointer"
                  data-graph-kind="activity"
                  data-molecule-id={node.activity.id}
                  onClick={() => {
                    if (!dragRef.current?.moved) onOpenMolecule(node.activity.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      onOpenMolecule(node.activity.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  role="button"
                  tabIndex={0}
                >
                <rect
                  x={node.x}
                  y={node.y}
                  width={ACTIVITY_WIDTH}
                  height={ACTIVITY_HEIGHT}
                  rx="5"
                  fill="var(--graph-activity-fill)"
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
