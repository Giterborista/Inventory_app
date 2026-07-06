import { normalizeText } from "@/features/workbench/state-utils";
import type {
  EvidenceRecord,
  ImportWarning,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ResolutionStatus,
} from "@/features/workbench/types";

export type MoleculeTraceability = {
  parents: MoleculeRecord[];
  children: MoleculeRecord[];
  unresolvedChildren: MoleculeRecord[];
  reusedByCount: number;
  latestImportWarnings: ImportWarning[];
  primaryEvidence: EvidenceRecord | null;
};

export type InventoryReviewState = "ok" | "warning" | "alert";

export type InventoryReviewIssue = {
  label: string;
  state: Exclude<InventoryReviewState, "ok">;
};

export function getMoleculeById(project: ProjectRecord, moleculeId: string | null) {
  if (!moleculeId) {
    return null;
  }

  return project.molecules.find((molecule) => molecule.id === moleculeId) ?? null;
}

export function getParentMolecules(project: ProjectRecord, moleculeId: string) {
  return project.links
    .slice()
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .filter((link) => link.childMoleculeId === moleculeId)
    .map((link) => project.molecules.find((candidate) => candidate.id === link.parentMoleculeId) ?? null)
    .filter((value): value is MoleculeRecord => Boolean(value))
    .filter((value, index, items) => items.findIndex((item) => item.id === value.id) === index);
}

export function getChildMolecules(project: ProjectRecord, moleculeId: string) {
  return project.links
    .slice()
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
    .filter((link) => link.parentMoleculeId === moleculeId)
    .map((link) => project.molecules.find((candidate) => candidate.id === link.childMoleculeId) ?? null)
    .filter((value): value is MoleculeRecord => Boolean(value))
    .filter((value, index, items) => items.findIndex((item) => item.id === value.id) === index);
}

export function getMoleculeRows(molecule: MoleculeRecord, section?: ReconstructionRow["section"]) {
  const rows = [...molecule.rows].sort((left, right) => left.order - right.order);
  return section ? rows.filter((row) => row.section === section) : rows;
}

export function getRowEvidence(molecule: MoleculeRecord, row: ReconstructionRow) {
  return molecule.evidence.filter((evidence) => row.evidenceIds.includes(evidence.id));
}

export function getPrimaryEvidence(molecule: MoleculeRecord) {
  return molecule.evidence.find((evidence) => evidence.isPrimary) ?? molecule.evidence[0] ?? null;
}

export function getLinkedMolecule(project: ProjectRecord, row: ReconstructionRow) {
  if (!row.linkedMoleculeId) {
    return null;
  }

  return project.molecules.find((molecule) => molecule.id === row.linkedMoleculeId) ?? null;
}

export function getReferenceProductRow(molecule: MoleculeRecord) {
  const referenceProductName = molecule.referenceProductName || molecule.name;
  return (
    molecule.rows.find(
      (row) =>
        row.section === "OUTPUT" &&
        row.order === 1 &&
        row.name.trim() === referenceProductName.trim(),
    ) ??
    molecule.rows.find((row) => row.section === "OUTPUT") ??
    null
  );
}

export function hasReferenceOutput(molecule: MoleculeRecord | null) {
  return Boolean(molecule && getReferenceProductRow(molecule));
}

export function isReferenceProductRow(molecule: MoleculeRecord, row: ReconstructionRow) {
  const referenceProductName = molecule.referenceProductName || molecule.name;
  return row.section === "OUTPUT" && row.order === 1 && row.name.trim() === referenceProductName.trim();
}

export function getRowInventoryReviewIssues(
  project: ProjectRecord,
  molecule: MoleculeRecord,
  row: ReconstructionRow,
): InventoryReviewIssue[] {
  const linkedMolecule = getLinkedMolecule(project, row);
  const referenceOutput = isReferenceProductRow(molecule, row);
  const issues: InventoryReviewIssue[] = [];

  if (!row.totalValue.trim() && !referenceOutput) {
    issues.push({ label: "Missing amount", state: "warning" });
  }

  if (linkedMolecule && !hasReferenceOutput(linkedMolecule)) {
    issues.push({ label: "Missing linked output", state: "alert" });
  }

  if (!referenceOutput && !linkedMolecule && row.ecoinventStatus === "missing") {
    issues.push({ label: "Disconnected item", state: "alert" });
  }

  if (
    !referenceOutput &&
    !linkedMolecule &&
    (row.ecoinventStatus === "unchecked" || row.ecoinventStatus === "in_progress")
  ) {
    issues.push({ label: "Needs check", state: "warning" });
  }

  return issues;
}

export function getMoleculeInventoryReviewState(
  project: ProjectRecord,
  molecule: MoleculeRecord,
): InventoryReviewState {
  const issues = molecule.rows.flatMap((row) => getRowInventoryReviewIssues(project, molecule, row));

  if (!hasReferenceOutput(molecule)) {
    issues.push({ label: "Missing reference output", state: "alert" });
  }

  if (issues.some((issue) => issue.state === "alert")) {
    return "alert";
  }

  return issues.length > 0 ? "warning" : "ok";
}

export function getIncomingLinkedRows(project: ProjectRecord, moleculeId: string) {
  return project.molecules.flatMap((candidate) =>
    candidate.rows.filter((row) => row.linkedMoleculeId === moleculeId),
  );
}

export function getEffectiveResolutionStatus(
  project: ProjectRecord,
  molecule: MoleculeRecord,
): ResolutionStatus {
  if (!molecule.placeholder) {
    return molecule.ecoinventStatus;
  }

  const incomingStatuses = getIncomingLinkedRows(project, molecule.id).map((row) => row.ecoinventStatus);
  if (incomingStatuses.length === 0) {
    return molecule.ecoinventStatus;
  }

  if (incomingStatuses.includes("proxy_created")) {
    return "proxy_created";
  }
  if (incomingStatuses.includes("in_progress")) {
    return "in_progress";
  }
  if (incomingStatuses.includes("missing")) {
    return "missing";
  }
  if (incomingStatuses.includes("unchecked")) {
    return "unchecked";
  }
  if (incomingStatuses.includes("present")) {
    return "present";
  }

  return molecule.ecoinventStatus;
}

export function getMoleculeTraceability(project: ProjectRecord, molecule: MoleculeRecord): MoleculeTraceability {
  const parents = getParentMolecules(project, molecule.id);
  const children = getChildMolecules(project, molecule.id);

  const unresolvedChildren = children.filter(
    (child) => child.placeholder || getMoleculeInventoryReviewState(project, child) !== "ok",
  );

  const latestImportWarnings =
    project.importSessions.at(-1)?.warnings.filter((warning) =>
      warning.workbookPath === molecule.sourceWorkbook ||
      project.links.some(
        (link) =>
          (link.parentMoleculeId === molecule.id || link.childMoleculeId === molecule.id) &&
          warning.workbookPath.includes(molecule.name),
      ),
    ) ?? [];

  return {
    parents,
    children,
    unresolvedChildren,
    reusedByCount: parents.length,
    latestImportWarnings,
    primaryEvidence: getPrimaryEvidence(molecule),
  };
}

export function getTopLevelMolecules(project: ProjectRecord) {
  const explicitRoots = project.molecules.filter((molecule) => molecule.topLevel);
  const roots =
    explicitRoots.length > 0
      ? explicitRoots
      : project.molecules.filter((molecule) => getParentMolecules(project, molecule.id).length === 0);
  const orderedRoots = roots
    .filter((value, index, items) => items.findIndex((item) => item.id === value.id) === index)
    .sort((left, right) => {
      const leftOrder = left.rootOrder || Number.MAX_SAFE_INTEGER;
      const rightOrder = right.rootOrder || Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.name.localeCompare(right.name);
    });
  const reachable = new Set<string>();

  const visit = (moleculeId: string) => {
    if (reachable.has(moleculeId)) {
      return;
    }
    reachable.add(moleculeId);
    for (const child of getChildMolecules(project, moleculeId)) {
      visit(child.id);
    }
  };

  for (const root of orderedRoots) {
    visit(root.id);
  }

  const orphaned = project.molecules.filter((molecule) => !reachable.has(molecule.id));
  return [...orderedRoots, ...orphaned].filter(
    (value, index, items) => items.findIndex((item) => item.id === value.id) === index,
  );
}

export function getAncestorIds(project: ProjectRecord, moleculeId: string) {
  const visited = new Set<string>();

  const visit = (candidateId: string) => {
    for (const parent of getParentMolecules(project, candidateId)) {
      if (!visited.has(parent.id)) {
        visited.add(parent.id);
        visit(parent.id);
      }
    }
  };

  visit(moleculeId);
  return visited;
}

export function getDescendantIds(project: ProjectRecord, moleculeId: string) {
  const visited = new Set<string>();

  const visit = (candidateId: string) => {
    for (const child of getChildMolecules(project, candidateId)) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        visit(child.id);
      }
    }
  };

  visit(moleculeId);
  return visited;
}

export function getHierarchyVisibleIds(project: ProjectRecord, filteredMolecules: MoleculeRecord[]) {
  if (filteredMolecules.length === project.molecules.length) {
    return null;
  }

  const ids = new Set<string>();
  for (const molecule of filteredMolecules) {
    ids.add(molecule.id);
    for (const ancestorId of getAncestorIds(project, molecule.id)) {
      ids.add(ancestorId);
    }
    for (const descendantId of getDescendantIds(project, molecule.id)) {
      ids.add(descendantId);
    }
  }

  return ids;
}

export function getUnresolvedMolecules(project: ProjectRecord) {
  return project.molecules.filter(
    (molecule) =>
      getMoleculeInventoryReviewState(project, molecule) !== "ok" ||
      molecule.placeholder ||
      getMoleculeTraceability(project, molecule).unresolvedChildren.length > 0,
  );
}

export function getReusedMolecules(project: ProjectRecord) {
  return project.molecules
    .map((molecule) => ({
      molecule,
      parents: getMoleculeTraceability(project, molecule).parents,
    }))
    .filter((entry) => entry.parents.length > 1)
    .sort((left, right) => right.parents.length - left.parents.length);
}

export function getPresentMoleculeCount(project: ProjectRecord) {
  return project.molecules.filter((molecule) => molecule.ecoinventStatus === "present").length;
}

export function getProxyMoleculeCount(project: ProjectRecord) {
  return project.molecules.filter((molecule) => molecule.ecoinventStatus !== "present").length;
}

export function getOpenImportWarnings(project: ProjectRecord) {
  return project.importSessions.at(-1)?.warnings ?? [];
}

export function getExportVersionLabel(molecule: MoleculeRecord) {
  const latest = molecule.exports.at(-1);
  return latest ? `v${latest.version}` : "Not exported";
}

function buildMoleculeSearchableText(project: ProjectRecord, molecule: MoleculeRecord) {
  const linkedMoleculeNames = molecule.rows
    .map((row) => (row.linkedMoleculeId ? getMoleculeById(project, row.linkedMoleculeId)?.name ?? "" : ""))
    .filter(Boolean);

  const parentNames = getParentMolecules(project, molecule.id).map((parent) => parent.name);
  const childNames = getChildMolecules(project, molecule.id).map((child) => child.name);

  return normalizeText(
    [
      molecule.name,
      molecule.cas,
      molecule.iupac,
      molecule.smiles,
      molecule.notes,
      molecule.sourceWorkbook,
      molecule.sourceSheet,
      molecule.ecoinventCheck?.datasetName ?? "",
      molecule.ecoinventCheck?.searchQuery ?? "",
      molecule.ecoinventCheck?.decisionNote ?? "",
      ...molecule.ecoinventAliases,
      ...molecule.synonyms,
      ...parentNames,
      ...childNames,
      ...linkedMoleculeNames,
      ...molecule.rows.flatMap((row) => [
        row.name,
        ...(row.synonyms ?? []),
        row.ro,
        row.cas,
        row.iupac,
        row.smiles,
        row.reference,
        row.description,
        row.notes,
        row.formula,
        row.relevant,
        row.ecoinventName,
        row.sourceWorkbook,
        row.sourceSheet,
      ]),
      ...molecule.evidence.flatMap((evidence) => [
        evidence.citation,
        evidence.identifier,
        evidence.locator,
        evidence.summary,
        evidence.sourceWorkbook,
        evidence.sourceSheet,
      ]),
      molecule.documentation.referenceAndScope,
      molecule.documentation.functionalUnit,
      molecule.documentation.pasAssumptions,
      molecule.documentation.balancedEquation,
      molecule.documentation.calculationNotes,
      ...molecule.documentation.explanationLines.flatMap((line) => [
        line.step,
        line.parameterDecision,
        line.ruleCalculation,
        line.result,
        line.explanation,
      ]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function getHierarchySearchMatches(project: ProjectRecord, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return project.molecules;
  }

  return project.molecules.filter((molecule) => buildMoleculeSearchableText(project, molecule).includes(normalizedQuery));
}
