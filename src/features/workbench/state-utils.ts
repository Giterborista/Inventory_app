import type {
  DocumentationRecord,
  EcoinventCheckRecord,
  EvidenceRecord,
  ExplanationLine,
  LinkConfidence,
  MoleculeDraft,
  MoleculeLinkRecord,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
  ResolutionStatus,
  WorkbenchState,
} from "@/features/workbench/types";

type PartialMoleculeRecord = Omit<Partial<MoleculeRecord>, "rows" | "evidence" | "exports" | "documentation"> & {
  rows?: Array<Partial<ReconstructionRow>>;
  evidence?: Array<Partial<EvidenceRecord>>;
  exports?: MoleculeRecord["exports"];
  documentation?: Partial<DocumentationRecord>;
};

type PartialProjectRecord = Omit<Partial<ProjectRecord>, "molecules" | "links" | "importSessions"> & {
  molecules?: Array<PartialMoleculeRecord>;
  links?: Array<Partial<MoleculeLinkRecord>>;
  importSessions?: ProjectRecord["importSessions"];
};

export function makeClientId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[()_,./]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function normalizeCas(value: string) {
  const cleaned = value.trim().replaceAll(/\s+/g, "");
  if (!cleaned || cleaned === "-") {
    return "";
  }

  const firstLine = cleaned.split(/\n+/)[0] ?? "";
  return firstLine.replaceAll(/[^\d-]/g, "");
}

export function cleanCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replaceAll(/\r/g, "").trim();
}

function safeText(value: unknown, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function normalizeListKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .trim();
}

function isObviousNoiseToken(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }

  return /^(?:l-|d-|n|\d+)$/.test(trimmed);
}

export function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of value) {
    const trimmed = safeText(item).trim();
    if (!trimmed || isObviousNoiseToken(trimmed)) {
      continue;
    }

    const key = normalizeListKey(trimmed);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    sanitized.push(trimmed);
  }

  return sanitized;
}

function safeStringList(value: unknown) {
  return sanitizeStringList(value);
}

function normalizeRawResolutionStatus(status: ResolutionStatus, rawValue: unknown) {
  const rawText = safeText(rawValue).trim();
  const normalizedRaw = normalizeText(rawText);

  if (!normalizedRaw || normalizedRaw === "unchecked" || normalizedRaw === "not added yet" || normalizedRaw === "in progress") {
    return status === "unchecked" ? "Not checked" : rawText;
  }

  return rawText;
}

export function createEmptyDocumentation(): DocumentationRecord {
  return {
    referenceAndScope: "",
    functionalUnit: "",
    pasAssumptions: "",
    balancedEquation: "",
    calculationNotes: "",
    explanationLines: [],
  };
}

export function createEmptyEcoinventCheck(): EcoinventCheckRecord {
  return {
    searchQuery: "",
    matchedBy: "manual",
    version: "3.12",
    systemModel: "cutoff",
    datasetName: "",
    datasetUrl: "",
    decisionNote: "",
    checkedAt: "",
  };
}

export function createExplanationLine(order: number): ExplanationLine {
  return {
    id: makeClientId("explanation"),
    order,
    step: "",
    parameterDecision: "",
    ruleCalculation: "",
    result: "",
    explanation: "",
  };
}

export function createEvidenceRecord(values: Partial<EvidenceRecord> & Pick<EvidenceRecord, "moleculeId" | "rowId" | "citation">): EvidenceRecord {
  const timestamp = nowIso();

  return {
    id: makeClientId("evidence"),
    type: "reference",
    identifier: "",
    locator: "",
    url: "",
    summary: "",
    strength: "moderate",
    isPrimary: false,
    sourceWorkbook: "",
    sourceSheet: "",
    sourceRowNumber: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...values,
  };
}

export function createBlankRow(
  section: ReconstructionSection,
  order: number,
  values?: Partial<ReconstructionRow>,
): ReconstructionRow {
  const timestamp = nowIso();
  const row = values ?? {};

  return {
    id: row.id ?? makeClientId("row"),
    section: row.section ?? section,
    order: row.order ?? order,
    objectKind: row.objectKind === "molecule" ? "molecule" : "generic_object",
    name: safeText(row.name),
    synonyms: safeStringList(row.synonyms),
    ro: safeText(row.ro),
    reactionValue: safeText(row.reactionValue),
    cleaningValue: safeText(row.cleaningValue),
    totalValue: safeText(row.totalValue),
    uncertaintyEnabled: row.uncertaintyEnabled ?? false,
    minimumValue: safeText(row.minimumValue),
    maximumValue: safeText(row.maximumValue),
    amountSource:
      row.amountSource === "measured" || row.amountSource === "calculated" || row.amountSource === "estimated"
        ? row.amountSource
        : "",
    unit: safeText(row.unit, "kg"),
    totalScaledValue: safeText(row.totalScaledValue),
    scaledUnit: safeText(row.scaledUnit ?? row.unit, "kg"),
    description: safeText(row.description),
    reference: safeText(row.reference),
    iupac: safeText(row.iupac),
    cas: safeText(row.cas),
    smiles: safeText(row.smiles),
    ecoinventStatus: row.ecoinventStatus ?? "unchecked",
    rawEcoinventStatus: normalizeRawResolutionStatus(row.ecoinventStatus ?? "unchecked", row.rawEcoinventStatus),
    ecoinventDatasetId: safeText(row.ecoinventDatasetId),
    ecoinventDatasetUuid: safeText(row.ecoinventDatasetUuid),
    ecoinventGeography: safeText(row.ecoinventGeography),
    ecoinventName: safeText(row.ecoinventName),
    ecoinventReferenceProduct: safeText(row.ecoinventReferenceProduct),
    ecoinventUnit: safeText(row.ecoinventUnit),
    notes: safeText(row.notes),
    relevant: safeText(row.relevant),
    formula: safeText(row.formula),
    pubchemMatch: row.pubchemMatch ?? null,
    linkedMoleculeId: row.linkedMoleculeId ?? null,
    evidenceIds: Array.isArray(row.evidenceIds) ? row.evidenceIds.filter(Boolean) : [],
    sourceWorkbook: safeText(row.sourceWorkbook),
    sourceSheet: safeText(row.sourceSheet),
    sourceRowNumber: typeof row.sourceRowNumber === "number" ? row.sourceRowNumber : null,
    linkConfidence: row.linkConfidence ?? null,
    needsReview: row.needsReview ?? false,
    createdAt: row.createdAt ?? timestamp,
    updatedAt: row.updatedAt ?? timestamp,
  };
}

export function normalizeSectionRows(rows: ReconstructionRow[]) {
  return rows
    .sort((left, right) => left.order - right.order)
    .map((row, index) => ({
      ...row,
      order: index + 1,
    }));
}

export function normalizeExplanationLines(lines: ExplanationLine[]) {
  return lines
    .sort((left, right) => left.order - right.order)
    .map((line, index) => ({
      ...line,
      order: index + 1,
    }));
}

export function mapImportedStatus(rawValue: string): ResolutionStatus {
  const normalized = normalizeText(rawValue);

  if (!normalized || normalized === "-" || normalized === " ") {
    return "unchecked";
  }
  if (normalized.startsWith("y") && normalized.includes("created")) {
    return "proxy_created";
  }
  if (normalized === "y" || normalized === "yes" || normalized.startsWith("y ")) {
    return "present";
  }
  if (normalized.includes("in progress")) {
    return "in_progress";
  }
  if (normalized === "no" || normalized === "n") {
    return "missing";
  }

  return "unchecked";
}

export function statusNeedsReview(status: ResolutionStatus) {
  return status === "missing" || status === "in_progress" || status === "unchecked";
}

export function inferReviewStatus(
  moleculeStatus: ResolutionStatus,
  documentation: DocumentationRecord,
  placeholder: boolean,
) {
  if (moleculeStatus === "present") {
    return "reviewed" as const;
  }
  if (placeholder) {
    return moleculeStatus === "in_progress" ? ("in_progress" as const) : ("draft" as const);
  }
  if (moleculeStatus === "in_progress") {
    return "in_progress" as const;
  }
  const hasStructuredDocs =
    documentation.referenceAndScope ||
    documentation.functionalUnit ||
    documentation.pasAssumptions ||
    documentation.balancedEquation ||
    documentation.explanationLines.length > 0;

  return hasStructuredDocs ? ("ready" as const) : ("draft" as const);
}

export function createMoleculeFromDraft(
  draft: MoleculeDraft,
  importSessionId: string,
  moleculeId = makeClientId("molecule"),
): MoleculeRecord {
  const timestamp = nowIso();
  const documentation = createEmptyDocumentation();
  const referenceProductName = safeText(draft.referenceProductName || draft.name, "Untitled activity").trim();
  const referenceAmount = safeText(draft.referenceAmount, "1").trim() || "1";
  const referenceUnit = safeText(draft.referenceUnit, "kg").trim() || "kg";

  return {
    id: moleculeId,
    activityType: draft.activityType ?? "production",
    referenceProductName,
    objectKind: draft.objectKind ?? "molecule",
    name: referenceProductName,
    cas: normalizeCas(draft.cas),
    iupac: draft.iupac.trim(),
    smiles: safeText(draft.smiles).trim(),
    synonyms: sanitizeStringList(draft.synonyms.split(",")),
    ecoinventAliases: sanitizeStringList(draft.ecoinventAliases.split(",")),
    notes: draft.notes,
    ecoinventStatus: draft.ecoinventStatus,
    rawEcoinventStatus: draft.ecoinventStatus,
    ecoinventCheck: draft.ecoinventCheck ?? createEmptyEcoinventCheck(),
    reviewStatus: inferReviewStatus(draft.ecoinventStatus, documentation, false),
    placeholder: false,
    needsReview: draft.ecoinventStatus !== "present",
    topLevel: draft.topLevel,
    rootOrder: 0,
    scaleReferenceAmount: referenceAmount,
    scaleTargetAmount: referenceAmount,
    scaleUnit: referenceUnit,
    sourceWorkbook: "Manual entry",
    sourceSheet: "",
    importSessionId,
    pubchemMatch: draft.pubchemMatch ?? null,
    rows: [
      createBlankRow("OUTPUT", 1, {
        objectKind: "generic_object",
        name: referenceProductName,
        totalValue: referenceAmount,
        totalScaledValue: referenceAmount,
        unit: referenceUnit,
        scaledUnit: referenceUnit,
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
      }),
    ],
    documentation,
    evidence: [],
    exports: [],
    parentLinkIds: [],
    childLinkIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyProject(name = "Untitled proxy project"): ProjectRecord {
  const timestamp = nowIso();

  return {
    id: makeClientId("project"),
    name,
    molecules: [],
    links: [],
    importSessions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyWorkbenchState(name?: string): WorkbenchState {
  return {
    project: createEmptyProject(name),
    selectedMoleculeId: null,
  };
}

function normalizeDocumentationRecord(record?: Partial<DocumentationRecord>): DocumentationRecord {
  return {
    referenceAndScope: safeText(record?.referenceAndScope),
    functionalUnit: safeText(record?.functionalUnit),
    pasAssumptions: safeText(record?.pasAssumptions),
    balancedEquation: safeText(record?.balancedEquation),
    calculationNotes: safeText(record?.calculationNotes),
    explanationLines: normalizeExplanationLines(record?.explanationLines ?? []),
  };
}

function normalizeEcoinventCheckRecord(record?: Partial<EcoinventCheckRecord> | null): EcoinventCheckRecord | null {
  if (!record) {
    return null;
  }

  return {
    ...createEmptyEcoinventCheck(),
    searchQuery: safeText(record.searchQuery),
    matchedBy: record.matchedBy ?? "manual",
    version: safeText(record.version, "3.12"),
    systemModel: safeText(record.systemModel, "cutoff"),
    datasetName: safeText(record.datasetName),
    datasetUrl: safeText(record.datasetUrl),
    decisionNote: safeText(record.decisionNote),
    checkedAt: safeText(record.checkedAt),
  };
}

function normalizeMoleculeRecord(molecule: PartialMoleculeRecord): MoleculeRecord {
  const legacyHierarchy = molecule as PartialMoleculeRecord & {
    isTopLevel?: boolean;
    topLevel?: boolean;
    rootOrder?: number;
  };

  const referenceProductName = safeText(
    (molecule as PartialMoleculeRecord & { referenceProductName?: string }).referenceProductName || molecule.name,
    "Untitled activity",
  );
  const activityType = safeText(
    (molecule as PartialMoleculeRecord & { activityType?: string }).activityType,
    "Production of",
  );

  return {
    ...(molecule as MoleculeRecord),
    id: molecule.id ?? makeClientId("molecule"),
    activityType,
    referenceProductName,
    objectKind: molecule.objectKind === "generic_object" ? "generic_object" : "molecule",
    name: safeText(molecule.name || referenceProductName, "Untitled activity"),
    cas: safeText(molecule.cas),
    iupac: safeText(molecule.iupac),
    smiles: safeText(molecule.smiles),
    synonyms: safeStringList(molecule.synonyms),
    ecoinventAliases: safeStringList(molecule.ecoinventAliases),
    notes: safeText(molecule.notes),
    ecoinventStatus: molecule.ecoinventStatus ?? "unchecked",
    rawEcoinventStatus: normalizeRawResolutionStatus(
      molecule.ecoinventStatus ?? "unchecked",
      molecule.rawEcoinventStatus ?? molecule.ecoinventStatus ?? "unchecked",
    ),
    ecoinventCheck: normalizeEcoinventCheckRecord(molecule.ecoinventCheck),
    reviewStatus: molecule.reviewStatus ?? "draft",
    placeholder: molecule.placeholder ?? false,
    needsReview: molecule.needsReview ?? false,
    topLevel: legacyHierarchy.topLevel ?? legacyHierarchy.isTopLevel ?? false,
    rootOrder: legacyHierarchy.rootOrder ?? 0,
    scaleReferenceAmount: safeText(molecule.scaleReferenceAmount, "1"),
    scaleTargetAmount: safeText(molecule.scaleTargetAmount, "1"),
    scaleUnit: safeText(molecule.scaleUnit, "kg"),
    sourceWorkbook: safeText(molecule.sourceWorkbook, "Manual entry"),
    sourceSheet: safeText(molecule.sourceSheet),
    importSessionId: safeText(molecule.importSessionId, "manual"),
    pubchemMatch: molecule.pubchemMatch ?? null,
    rows: (molecule.rows ?? []).map((row) =>
      createBlankRow(row.section ?? "INPUT", row.order ?? 1, {
        ...row,
        evidenceIds: row.evidenceIds ?? [],
      }),
    ),
    documentation: normalizeDocumentationRecord(molecule.documentation),
    evidence: (molecule.evidence ?? []).map((evidence) =>
      createEvidenceRecord({
        ...evidence,
        moleculeId: safeText(evidence.moleculeId, molecule.id ?? ""),
        rowId: evidence.rowId ?? null,
        citation: safeText(evidence.citation),
      }),
    ),
    exports: molecule.exports ?? [],
    parentLinkIds: molecule.parentLinkIds ?? [],
    childLinkIds: molecule.childLinkIds ?? [],
    createdAt: molecule.createdAt ?? nowIso(),
    updatedAt: molecule.updatedAt ?? nowIso(),
  };
}

export function normalizeProjectRecord(project: PartialProjectRecord): ProjectRecord {
  const normalizedProject = syncProjectGraph({
    ...project,
    id: project.id ?? makeClientId("project"),
    name: project.name ?? "Untitled proxy project",
    molecules: (project.molecules ?? []).map(normalizeMoleculeRecord),
    links: (project.links ?? []).map((link) => ({
      id: link.id ?? makeClientId("link"),
      parentMoleculeId: link.parentMoleculeId ?? "",
      childMoleculeId: link.childMoleculeId ?? "",
      sourceRowId: link.sourceRowId ?? null,
      linkMethod: link.linkMethod ?? "manual",
      confidence: link.confidence ?? "high",
      needsReview: link.needsReview ?? false,
      sortOrder: link.sortOrder ?? 0,
      createdAt: link.createdAt ?? nowIso(),
      updatedAt: link.updatedAt ?? nowIso(),
    })),
    importSessions: project.importSessions ?? [],
    createdAt: project.createdAt ?? nowIso(),
    updatedAt: project.updatedAt ?? nowIso(),
  });

  if (normalizedProject.molecules.some((molecule) => molecule.topLevel)) {
    return normalizedProject;
  }

  let nextRootOrder = 1;
  return {
    ...normalizedProject,
    molecules: normalizedProject.molecules.map((molecule) => {
      const hasParent = normalizedProject.links.some((link) => link.childMoleculeId === molecule.id);
      if (!hasParent) {
        return {
          ...molecule,
          topLevel: true,
          rootOrder: nextRootOrder++,
        };
      }
      return molecule;
    }),
  };
}

function linkKey(parentMoleculeId: string, childMoleculeId: string, sourceRowId: string) {
  return `${parentMoleculeId}:${childMoleculeId}:${sourceRowId}`;
}

function normalizedLinkKey(parentMoleculeId: string, childMoleculeId: string, sourceRowId: string | null) {
  return linkKey(parentMoleculeId, childMoleculeId, sourceRowId ?? "__manual__");
}

function dedupeEvidence(records: EvidenceRecord[]) {
  const byId = new Map<string, EvidenceRecord>();

  for (const record of records) {
    byId.set(record.id, record);
  }

  return [...byId.values()];
}

export function syncProjectGraph(project: ProjectRecord): ProjectRecord {
  const existingLinks = new Map(
    (project.links ?? []).map((link) => [
      normalizedLinkKey(link.parentMoleculeId, link.childMoleculeId, link.sourceRowId ?? null),
      link,
    ]),
  );

  const rowLinkedPairs = new Set(
    project.molecules.flatMap((molecule) =>
      molecule.rows
        .filter((row): row is ReconstructionRow & { linkedMoleculeId: string } => Boolean(row.linkedMoleculeId))
        .map((row) => normalizedLinkKey(molecule.id, row.linkedMoleculeId, null)),
    ),
  );

  const manualLinks = (project.links ?? []).filter(
    (link) =>
      link.sourceRowId === null &&
      !rowLinkedPairs.has(normalizedLinkKey(link.parentMoleculeId, link.childMoleculeId, null)),
  );
  const nextLinks: MoleculeLinkRecord[] = [...manualLinks];

  for (const molecule of project.molecules) {
    for (const row of molecule.rows) {
      if (!row.linkedMoleculeId) {
        continue;
      }

      const key = normalizedLinkKey(molecule.id, row.linkedMoleculeId, row.id);
      const existing = existingLinks.get(key);
      const timestamp = nowIso();
      const siblingSortOrder =
        existing?.sortOrder ??
        (nextLinks.filter((link) => link.parentMoleculeId === molecule.id).length + 1);

      nextLinks.push({
        id: existing?.id ?? makeClientId("link"),
        parentMoleculeId: molecule.id,
        childMoleculeId: row.linkedMoleculeId,
        sourceRowId: row.id,
        linkMethod: existing?.linkMethod ?? "manual",
        confidence: existing?.confidence ?? (row.linkConfidence ?? "high"),
        needsReview: existing?.needsReview ?? row.needsReview,
        sortOrder: siblingSortOrder,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    }
  }

  let syncedProject: ProjectRecord = {
    ...project,
    molecules: project.molecules.map((molecule) => {
      const incomingStatuses = project.molecules.flatMap((candidate) =>
        candidate.rows
          .filter((row) => row.linkedMoleculeId === molecule.id)
          .map((row) => row.ecoinventStatus),
      );
      const inheritedStatus =
        molecule.placeholder && (molecule.ecoinventStatus === "missing" || molecule.ecoinventStatus === "unchecked")
          ? incomingStatuses.includes("proxy_created")
            ? "proxy_created"
            : incomingStatuses.includes("in_progress")
              ? "in_progress"
              : incomingStatuses.includes("missing")
                ? "missing"
                : incomingStatuses.includes("unchecked")
                  ? "unchecked"
                  : incomingStatuses.includes("present")
                    ? "present"
                    : molecule.ecoinventStatus
          : molecule.ecoinventStatus;
      const parentLinkIds = nextLinks
        .filter((link) => link.childMoleculeId === molecule.id)
        .map((link) => link.id);
      const childLinkIds = nextLinks
        .filter((link) => link.parentMoleculeId === molecule.id)
        .map((link) => link.id);

      return {
        ...molecule,
        ecoinventStatus: inheritedStatus,
        rawEcoinventStatus:
          inheritedStatus !== molecule.ecoinventStatus ? inheritedStatus : molecule.rawEcoinventStatus,
        evidence: dedupeEvidence(molecule.evidence),
        parentLinkIds,
        childLinkIds,
      };
    }),
    links: nextLinks,
    updatedAt: nowIso(),
  };

  const maxRootOrder = syncedProject.molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);
  let nextRootOrder = maxRootOrder;
  syncedProject = {
    ...syncedProject,
    molecules: syncedProject.molecules.map((molecule) => {
      if (molecule.topLevel && molecule.rootOrder <= 0) {
        nextRootOrder += 1;
        return {
          ...molecule,
          rootOrder: nextRootOrder,
        };
      }
      return molecule;
    }),
  };

  return syncedProject;
}

export function touchProject(project: ProjectRecord, molecules: MoleculeRecord[]) {
  return syncProjectGraph({
    ...project,
    molecules,
    updatedAt: nowIso(),
  });
}

export function getConfidenceTone(confidence: LinkConfidence | null) {
  if (confidence === "high") {
    return "accent";
  }
  if (confidence === "medium") {
    return "ink";
  }

  return "alert";
}
