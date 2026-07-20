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
  target: "row-details" | "row-background" | "linked-activity" | "add-input" | "documentation" | "reference-output";
  rowId?: string;
  rowName?: string;
  section?: ReconstructionRow["section"];
  linkedMoleculeId?: string;
};

export type ProjectIssueSeverity = "error" | "warning";
export type ProjectIssueTab = "inputs" | "outputs" | "scope";

export type ProjectValidationIssue = {
  id: string;
  activityId: string;
  severity: ProjectIssueSeverity;
  message: string;
  target: {
    tab: ProjectIssueTab;
    flowId?: string;
    field?: string;
    activityId?: string;
  };
};

export type ProjectSearchResult = {
  id: string;
  kind: "activity" | "input" | "output" | "ecoinvent_dataset";
  activityId: string;
  rowId: string | null;
  section: ReconstructionRow["section"] | null;
  title: string;
  context: string;
  amount: string;
  unit: string;
  score: number;
};

export function getProductSystemRoots(project: ProjectRecord) {
  const incomingActivityIds = new Set(project.links.map((link) => link.childMoleculeId));

  return project.molecules
    .filter((molecule) => !incomingActivityIds.has(molecule.id))
    .sort((left, right) => {
      if (left.topLevel !== right.topLevel) return left.topLevel ? -1 : 1;
      const leftOrder = left.rootOrder || Number.MAX_SAFE_INTEGER;
      const rightOrder = right.rootOrder || Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.name.localeCompare(right.name);
    });
}

function parseReviewNumber(value: string) {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

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
    molecule.rows.find(
      (row) => row.section === "OUTPUT" && row.name.trim() === referenceProductName.trim(),
    ) ??
    null
  );
}

export function hasReferenceOutput(molecule: MoleculeRecord | null) {
  return Boolean(molecule && getReferenceProductRow(molecule));
}

export function isReferenceProductRow(molecule: MoleculeRecord, row: ReconstructionRow) {
  return getReferenceProductRow(molecule)?.id === row.id;
}

export function hasEcoinventDatasetConnection(row: ReconstructionRow) {
  return Boolean(
    row.ecoinventDatasetId.trim() || row.ecoinventDatasetUuid.trim(),
  );
}

export function getRowInventoryReviewIssues(
  project: ProjectRecord,
  molecule: MoleculeRecord,
  row: ReconstructionRow,
): InventoryReviewIssue[] {
  const linkedMolecule = getLinkedMolecule(project, row);
  const referenceOutput = isReferenceProductRow(molecule, row);
  const hasDatasetConnection = hasEcoinventDatasetConnection(row);
  const issues: InventoryReviewIssue[] = [];

  if (!row.unit.trim()) {
    issues.push({ label: referenceOutput ? "Missing reference unit" : "Missing unit", state: referenceOutput ? "alert" : "warning", target: "row-details", rowId: row.id, rowName: row.name, section: row.section });
  }

  if (referenceOutput) {
    const referenceAmount = parseReviewNumber(row.totalValue);
    if (!row.totalValue.trim()) {
      issues.push({ label: "Missing reference amount", state: "alert", target: "row-details", rowId: row.id, rowName: row.name, section: row.section });
    } else if (referenceAmount === null || referenceAmount <= 0) {
      issues.push({ label: "Invalid reference amount", state: "alert", target: "row-details", rowId: row.id, rowName: row.name, section: row.section });
    }
  } else if (!row.totalValue.trim()) {
    issues.push({ label: "Missing amount", state: "warning", target: "row-details", rowId: row.id, rowName: row.name, section: row.section });
  }

  if (linkedMolecule && !hasReferenceOutput(linkedMolecule)) {
    issues.push({ label: "Linked activity has no output", state: "alert", target: "linked-activity", rowId: row.id, rowName: row.name, section: row.section, linkedMoleculeId: linkedMolecule.id });
  }

  if (!referenceOutput && !linkedMolecule && !hasDatasetConnection) {
    issues.push({ label: "No dataset connection", state: "alert", target: "row-background", rowId: row.id, rowName: row.name, section: row.section });
  } else if (
    !referenceOutput &&
    !linkedMolecule &&
    (row.ecoinventStatus === "unchecked" || row.ecoinventStatus === "in_progress")
  ) {
    issues.push({ label: "Review the selected dataset", state: "warning", target: "row-background", rowId: row.id, rowName: row.name, section: row.section });
  }

  return issues;
}

export function getMoleculeInventoryReviewIssues(
  project: ProjectRecord,
  molecule: MoleculeRecord,
): InventoryReviewIssue[] {
  const issues = molecule.rows.flatMap((row) => getRowInventoryReviewIssues(project, molecule, row));

  if (!hasReferenceOutput(molecule)) {
    issues.push({ label: "Add the activity's main output", state: "alert", target: "reference-output", section: "OUTPUT" });
  }

  if (!molecule.rows.some((row) => row.section === "INPUT")) {
    issues.push({ label: "Add the first input", state: "warning", target: "add-input", section: "INPUT" });
  }

  const documentationComplete = Boolean(
    molecule.documentation.referenceAndScope.trim() && molecule.documentation.calculationNotes.trim(),
  );
  if (!documentationComplete) {
    issues.push({ label: "Add activity context and traceability", state: "warning", target: "documentation" });
  }

  return issues.filter(
    (issue, index, allIssues) =>
      allIssues.findIndex(
        (candidate) =>
          candidate.label === issue.label &&
          candidate.state === issue.state &&
          candidate.rowId === issue.rowId &&
          candidate.target === issue.target,
      ) === index,
  );
}

function getProjectIssueField(issue: InventoryReviewIssue) {
  if (issue.target === "row-background") return "ecoinventDatasetId";
  if (issue.target === "documentation") return "referenceAndScope";
  if (issue.target === "reference-output") return "referenceOutput";
  if (issue.target === "add-input") return "inputList";
  if (issue.label.toLowerCase().includes("unit")) return "unit";
  if (issue.label.toLowerCase().includes("amount")) return "totalValue";
  return "details";
}

function getProjectIssueMessage(issue: InventoryReviewIssue) {
  const flowType = issue.section === "OUTPUT" ? "Output" : "Input";
  const flowName = issue.rowName?.trim();

  if (issue.label === "Missing reference amount") return "Main output has no amount";
  if (issue.label === "Invalid reference amount") return "Main output amount must be greater than zero";
  if (issue.label === "Missing reference unit") return "Main output has no unit";
  if (issue.label === "No dataset connection") return `${flowType} “${flowName || "unnamed flow"}” has no dataset`;
  if (issue.label === "Review the selected dataset") return `${flowType} “${flowName || "unnamed flow"}” dataset needs review`;
  if (issue.label === "Missing amount") return `${flowType} “${flowName || "unnamed flow"}” has no amount`;
  if (issue.label === "Missing unit") return `${flowType} “${flowName || "unnamed flow"}” has no unit`;
  if (issue.label === "Linked activity has no output") return `Linked activity for “${flowName || "unnamed flow"}” has no output`;
  if (issue.label === "Add the activity's main output") return "Activity has no main output";
  if (issue.label === "Add the first input") return "Activity has no inputs";
  if (issue.label === "Add activity context and traceability") return "Activity context or sources are incomplete";
  return issue.label;
}

/**
 * The single project-level validation result used by project summaries, the
 * activity tree, and issue navigation. UI components must not recreate checks.
 */
export function validateProject(project: ProjectRecord): ProjectValidationIssue[] {
  const activityIssues: ProjectValidationIssue[] = project.molecules.flatMap((molecule) =>
    getMoleculeInventoryReviewIssues(project, molecule).map((issue) => {
      const tab: ProjectIssueTab =
        issue.target === "documentation"
          ? "scope"
          : issue.section === "OUTPUT" || issue.target === "reference-output" || issue.target === "linked-activity"
            ? "outputs"
            : "inputs";
      const field = issue.target === "documentation"
        ? (!molecule.documentation.referenceAndScope.trim() ? "referenceAndScope" : "calculationNotes")
        : getProjectIssueField(issue);
      const targetActivityId = issue.target === "linked-activity" ? issue.linkedMoleculeId : undefined;
      const stableTarget = issue.rowId ?? field;

      return {
        id: `${molecule.id}:${stableTarget}:${issue.target}:${field}`,
        activityId: molecule.id,
        severity: issue.state === "alert" ? "error" : "warning",
        message: getProjectIssueMessage(issue),
        target: {
          tab,
          flowId: issue.rowId,
          field,
          activityId: targetActivityId,
        },
      };
    }),
  );

  const productSystemRoots = getProductSystemRoots(project);
  const mainActivity = productSystemRoots[0];
  const connectivityIssues: ProjectValidationIssue[] = mainActivity
    ? productSystemRoots.slice(1).map((activity) => ({
        id: `${activity.id}:product-system:disconnected`,
        activityId: activity.id,
        severity: "error",
        message: "Activity is disconnected from the main product system",
        target: {
          tab: "inputs",
          field: "connection",
          activityId: mainActivity.id,
        },
      }))
    : [];

  return [...connectivityIssues, ...activityIssues];
}

export function getMoleculeInventoryReviewState(
  project: ProjectRecord,
  molecule: MoleculeRecord,
): InventoryReviewState {
  const issues = getMoleculeInventoryReviewIssues(project, molecule);

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

function searchMatchScore(query: string, title: string, searchableValues: string[]) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  const normalizedTitle = normalizeText(title);
  const searchableText = normalizeText(searchableValues.filter(Boolean).join(" "));
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (!queryTokens.every((token) => searchableText.includes(token))) return null;

  if (normalizedTitle === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (normalizedTitle.includes(normalizedQuery)) return 2;
  return 3;
}

export function getProjectSearchResults(project: ProjectRecord, query: string): ProjectSearchResult[] {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const results: ProjectSearchResult[] = [];

  for (const molecule of project.molecules) {
    const referenceProduct = getReferenceProductRow(molecule);
    const activityTitle = molecule.name || "Untitled activity";
    const activityScore = searchMatchScore(query, activityTitle, [
      activityTitle,
      molecule.name,
      molecule.referenceProductName,
      molecule.cas,
      molecule.iupac,
      molecule.smiles,
      molecule.notes,
      ...molecule.synonyms,
      ...molecule.ecoinventAliases,
      molecule.ecoinventCheck?.datasetName ?? "",
      molecule.ecoinventCheck?.searchQuery ?? "",
    ]);

    if (activityScore !== null) {
      results.push({
        id: `activity:${molecule.id}`,
        kind: "activity",
        activityId: molecule.id,
        rowId: null,
        section: null,
        title: activityTitle,
        context: molecule.referenceProductName || "Main output not named",
        amount: referenceProduct?.totalValue || referenceProduct?.totalScaledValue || "",
        unit: referenceProduct?.unit || referenceProduct?.scaledUnit || "",
        score: activityScore,
      });
    }

    for (const row of molecule.rows) {
      const rowScore = searchMatchScore(query, row.name, [
        row.name,
        ...row.synonyms,
        row.ro,
        row.cas,
        row.iupac,
        row.smiles,
        row.formula,
        row.description,
        row.reference,
        row.notes,
        row.relevant,
      ]);
      if (rowScore !== null) {
        results.push({
          id: `flow:${molecule.id}:${row.id}`,
          kind: row.section === "INPUT" ? "input" : "output",
          activityId: molecule.id,
          rowId: row.id,
          section: row.section,
          title: row.name || `Unnamed ${row.section.toLowerCase()}`,
          context: activityTitle,
          amount: row.totalValue || row.totalScaledValue,
          unit: row.unit || row.scaledUnit,
          score: rowScore,
        });
      }

      const datasetTitle = row.ecoinventName || row.ecoinventReferenceProduct;
      const datasetScore = datasetTitle
        ? searchMatchScore(query, datasetTitle, [
            row.ecoinventName,
            row.ecoinventReferenceProduct,
            row.ecoinventGeography,
            row.ecoinventDatasetId,
            row.ecoinventDatasetUuid,
            row.ecoinventUnit,
          ])
        : null;
      if (datasetScore !== null) {
        results.push({
          id: `dataset:${molecule.id}:${row.id}`,
          kind: "ecoinvent_dataset",
          activityId: molecule.id,
          rowId: row.id,
          section: row.section,
          title: datasetTitle,
          context: `${row.name || "Unnamed flow"} in ${activityTitle}`,
          amount: row.totalValue || row.totalScaledValue,
          unit: row.unit || row.scaledUnit,
          score: datasetScore,
        });
      }
    }
  }

  return results
    .sort((left, right) => left.score - right.score || left.title.localeCompare(right.title) || left.context.localeCompare(right.context))
    .slice(0, 80);
}
