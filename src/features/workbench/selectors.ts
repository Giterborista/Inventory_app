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
    (child) => child.placeholder || child.reviewStatus === "draft" || child.reviewStatus === "in_progress",
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
      getEffectiveResolutionStatus(project, molecule) !== "present" ||
      molecule.placeholder ||
      molecule.needsReview ||
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
