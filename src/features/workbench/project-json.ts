import { normalizeProjectRecord } from "@/features/workbench/state-utils";
import type {
  DocumentationRecord,
  ExplanationLine,
  EvidenceRecord,
  EcoinventCheckRecord,
  ImportSession,
  MoleculeLinkRecord,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ResolutionStatus,
  WorkbenchState,
} from "@/features/workbench/types";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

type ProjectDocument = {
  schemaVersion: number;
  exportedAt: string;
  project: ProjectRecord;
};

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a valid object.`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item).trim()).filter(Boolean) : [];
}

function mergeLegacyText(base: unknown, legacy: unknown, label: string) {
  const primary = asString(base).trim();
  const legacyText = asString(legacy).trim();
  if (!legacyText) {
    return primary;
  }
  if (!primary) {
    return `${label}: ${legacyText}`;
  }
  if (primary.includes(legacyText)) {
    return primary;
  }
  return `${primary}\n\n${label}: ${legacyText}`;
}

function migrateResolutionStatus(value: unknown): ResolutionStatus {
  const normalized = asString(value).trim().toLowerCase();
  if (
    normalized === "present" ||
    normalized === "missing" ||
    normalized === "proxy_created" ||
    normalized === "in_progress" ||
    normalized === "unchecked"
  ) {
    return normalized;
  }

  if (normalized === "likely_equivalent" || normalized === "related_not_equivalent") {
    return "unchecked";
  }

  return "unchecked";
}

function migrateExplanationLine(value: unknown): ExplanationLine {
  const record = asRecord(value, "Explanation line");
  return {
    id: asString(record.id),
    order: Number(record.order ?? 0) || 0,
    step: asString(record.step),
    parameterDecision: asString(record.parameterDecision),
    ruleCalculation: asString(record.ruleCalculation),
    result: asString(record.result),
    explanation: asString(record.explanation),
  };
}

function migrateDocumentation(value: unknown): DocumentationRecord {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    referenceAndScope: asString(record.referenceAndScope),
    functionalUnit: asString(record.functionalUnit),
    pasAssumptions: asString(record.pasAssumptions),
    balancedEquation: asString(record.balancedEquation),
    calculationNotes: mergeLegacyText(record.calculationNotes, record.reviewerNotes, "Legacy reviewer notes"),
    explanationLines: Array.isArray(record.explanationLines) ? record.explanationLines.map(migrateExplanationLine) : [],
  };
}

function migrateEcoinventCheck(value: unknown): EcoinventCheckRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    searchQuery: asString(record.searchQuery),
    matchedBy: (["cas", "name", "synonym", "iupac", "manual"].includes(asString(record.matchedBy))
      ? record.matchedBy
      : "manual") as EcoinventCheckRecord["matchedBy"],
    version: asString(record.version || "3.12"),
    systemModel: asString(record.systemModel || "cutoff"),
    datasetName: asString(record.datasetName),
    datasetUrl: asString(record.datasetUrl),
    decisionNote: asString(record.decisionNote),
    checkedAt: asString(record.checkedAt),
  };
}

function migrateRow(value: unknown): Partial<ReconstructionRow> {
  const record = asRecord(value, "Reconstruction row");
  const legacyStep = asString(record.stepLabel).trim();

  return {
    id: asString(record.id),
    section: (record.section === "OUTPUT" ? "OUTPUT" : "INPUT") as ReconstructionRow["section"],
    order: Number(record.order ?? 0) || 0,
    name: asString(record.name),
    synonyms: asStringArray(record.synonyms),
    ro: asString(record.ro),
    reactionValue: asString(record.reactionValue),
    cleaningValue: asString(record.cleaningValue),
    totalValue: asString(record.totalValue),
    unit: asString(record.unit || "kg"),
    totalScaledValue: asString(record.totalScaledValue),
    scaledUnit: asString(record.scaledUnit || record.unit || "kg"),
    description: asString(record.description),
    reference: asString(record.reference),
    iupac: asString(record.iupac),
    cas: asString(record.cas),
    smiles: asString(record.smiles),
    ecoinventStatus: migrateResolutionStatus(record.ecoinventStatus),
    rawEcoinventStatus: asString(record.rawEcoinventStatus),
    ecoinventName: asString(record.ecoinventName),
    notes: mergeLegacyText(record.notes, legacyStep, "Legacy step"),
    relevant: asString(record.relevant),
    formula: asString(record.formula),
    pubchemMatch: (record.pubchemMatch ?? null) as ReconstructionRow["pubchemMatch"],
    linkedMoleculeId: record.linkedMoleculeId ? asString(record.linkedMoleculeId) : null,
    evidenceIds: Array.isArray(record.evidenceIds) ? record.evidenceIds.map((item) => asString(item)).filter(Boolean) : [],
    sourceWorkbook: asString(record.sourceWorkbook),
    sourceSheet: asString(record.sourceSheet),
    sourceRowNumber: typeof record.sourceRowNumber === "number" ? record.sourceRowNumber : null,
    linkConfidence:
      record.linkConfidence === "high" || record.linkConfidence === "medium" || record.linkConfidence === "low"
        ? record.linkConfidence
        : null,
    needsReview: Boolean(record.needsReview),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function migrateEvidence(value: unknown): Partial<EvidenceRecord> {
  const record = asRecord(value, "Evidence record");
  return {
    id: asString(record.id),
    moleculeId: asString(record.moleculeId),
    rowId: record.rowId ? asString(record.rowId) : null,
    type: (["patent", "dataset", "internal_note", "supplier", "publication", "reference"].includes(asString(record.type))
      ? record.type
      : "reference") as EvidenceRecord["type"],
    citation: asString(record.citation),
    identifier: asString(record.identifier),
    locator: asString(record.locator),
    url: asString(record.url),
    summary: asString(record.summary),
    strength: (["strong", "moderate", "weak"].includes(asString(record.strength))
      ? record.strength
      : "moderate") as EvidenceRecord["strength"],
    isPrimary: Boolean(record.isPrimary),
    sourceWorkbook: asString(record.sourceWorkbook),
    sourceSheet: asString(record.sourceSheet),
    sourceRowNumber: typeof record.sourceRowNumber === "number" ? record.sourceRowNumber : null,
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function migrateLink(value: unknown): Partial<MoleculeLinkRecord> {
  const record = asRecord(value, "Dependency link");
  return {
    id: asString(record.id),
    parentMoleculeId: asString(record.parentMoleculeId),
    childMoleculeId: asString(record.childMoleculeId),
    sourceRowId: record.sourceRowId ? asString(record.sourceRowId) : null,
    linkMethod: (["folder", "cas", "name", "heuristic", "manual", "placeholder"].includes(asString(record.linkMethod))
      ? record.linkMethod
      : "manual") as MoleculeLinkRecord["linkMethod"],
    confidence: (["high", "medium", "low"].includes(asString(record.confidence))
      ? record.confidence
      : "high") as MoleculeLinkRecord["confidence"],
    needsReview: Boolean(record.needsReview),
    sortOrder: Number(record.sortOrder ?? 0) || 0,
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function migrateImportSession(value: unknown): ImportSession {
  const record = asRecord(value, "Import session");
  return {
    id: asString(record.id),
    createdAt: asString(record.createdAt),
    sourceLabel: asString(record.sourceLabel),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.map((warning) => {
          const warningRecord = asRecord(warning, "Import warning");
          return {
            id: asString(warningRecord.id),
            level: warningRecord.level === "warning" ? "warning" : "info",
            message: asString(warningRecord.message),
            workbookPath: asString(warningRecord.workbookPath),
          };
        })
      : [],
    ignoredVariants: asStringArray(record.ignoredVariants),
  };
}

function migrateMolecule(value: unknown): Partial<MoleculeRecord> {
  const record = asRecord(value, "Molecule");
  const migratedDocumentation = migrateDocumentation(record.documentation);

  return {
    id: asString(record.id),
    name: asString(record.name),
    cas: asString(record.cas),
    iupac: asString(record.iupac),
    smiles: asString(record.smiles),
    synonyms: asStringArray(record.synonyms),
    ecoinventAliases: asStringArray(record.ecoinventAliases),
    notes: mergeLegacyText(record.notes, record.reviewerNotes, "Legacy reviewer notes"),
    ecoinventStatus: migrateResolutionStatus(record.ecoinventStatus),
    rawEcoinventStatus: asString(record.rawEcoinventStatus),
    ecoinventCheck: migrateEcoinventCheck(record.ecoinventCheck),
    reviewStatus: (["draft", "in_progress", "ready", "reviewed"].includes(asString(record.reviewStatus))
      ? record.reviewStatus
      : "draft") as MoleculeRecord["reviewStatus"],
    placeholder: Boolean(record.placeholder),
    needsReview: Boolean(record.needsReview),
    topLevel: Boolean(record.topLevel ?? record.isTopLevel),
    rootOrder: Number(record.rootOrder ?? 0) || 0,
    scaleReferenceAmount: asString(record.scaleReferenceAmount || "1"),
    scaleTargetAmount: asString(record.scaleTargetAmount || "1"),
    scaleUnit: asString(record.scaleUnit || "kg"),
    sourceWorkbook: asString(record.sourceWorkbook || "Manual entry"),
    sourceSheet: asString(record.sourceSheet),
    importSessionId: asString(record.importSessionId || "manual"),
    pubchemMatch: (record.pubchemMatch ?? null) as MoleculeRecord["pubchemMatch"],
    rows: Array.isArray(record.rows) ? (record.rows.map(migrateRow) as unknown as MoleculeRecord["rows"]) : [],
    documentation: migratedDocumentation,
    evidence: Array.isArray(record.evidence)
      ? (record.evidence.map(migrateEvidence) as unknown as MoleculeRecord["evidence"])
      : [],
    exports: Array.isArray(record.exports) ? (record.exports as MoleculeRecord["exports"]) : [],
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  };
}

function migrateProjectRecord(rawProject: unknown, schemaVersion: number) {
  if (schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported project schema version ${schemaVersion}.`);
  }

  const project = asRecord(rawProject, "Project");
  return {
    id: asString(project.id),
    name: asString(project.name),
    molecules: Array.isArray(project.molecules) ? project.molecules.map(migrateMolecule) : [],
    links: Array.isArray(project.links) ? project.links.map(migrateLink) : [],
    importSessions: Array.isArray(project.importSessions) ? project.importSessions.map(migrateImportSession) : [],
    createdAt: asString(project.createdAt),
    updatedAt: asString(project.updatedAt),
  };
}

function validateNormalizedProject(project: ProjectRecord) {
  const errors: string[] = [];
  const moleculeIds = new Set<string>();
  const rowIds = new Map<string, string>();
  const linkIds = new Set<string>();
  const allowedStatuses: ResolutionStatus[] = ["present", "missing", "proxy_created", "in_progress", "unchecked"];

  for (const molecule of project.molecules) {
    if (!molecule.id) {
      errors.push("A molecule is missing its id.");
      continue;
    }
    if (moleculeIds.has(molecule.id)) {
      errors.push(`Duplicate molecule id: ${molecule.id}`);
    }
    moleculeIds.add(molecule.id);
    if (!allowedStatuses.includes(molecule.ecoinventStatus)) {
      errors.push(`Unsupported ecoinvent status on molecule ${molecule.name || molecule.id}.`);
    }
    if (molecule.topLevel && molecule.rootOrder <= 0) {
      errors.push(`Top-level molecule ${molecule.name || molecule.id} is missing a valid root order.`);
    }

    for (const row of molecule.rows) {
      if (!row.id) {
        errors.push(`A row in molecule ${molecule.name || molecule.id} is missing its id.`);
        continue;
      }
      if (rowIds.has(row.id)) {
        errors.push(`Duplicate row id: ${row.id}`);
      }
      rowIds.set(row.id, molecule.id);
      if (!allowedStatuses.includes(row.ecoinventStatus)) {
        errors.push(`Unsupported row ecoinvent status on ${molecule.name || molecule.id} / ${row.name || row.id}.`);
      }
      if (row.linkedMoleculeId && !project.molecules.some((candidate) => candidate.id === row.linkedMoleculeId)) {
        errors.push(`Row ${row.id} links to a missing molecule id ${row.linkedMoleculeId}.`);
      }
    }

    for (const evidence of molecule.evidence) {
      if (evidence.moleculeId !== molecule.id) {
        errors.push(`Evidence ${evidence.id} is attached to the wrong molecule.`);
      }
      if (evidence.rowId) {
        const rowOwner = rowIds.get(evidence.rowId);
        if (!rowOwner) {
          errors.push(`Evidence ${evidence.id} points to missing row ${evidence.rowId}.`);
        } else if (rowOwner !== molecule.id) {
          errors.push(`Evidence ${evidence.id} points to a row owned by another molecule.`);
        }
      }
    }
  }

  for (const link of project.links) {
    if (!link.id) {
      errors.push("A dependency link is missing its id.");
      continue;
    }
    if (linkIds.has(link.id)) {
      errors.push(`Duplicate link id: ${link.id}`);
    }
    linkIds.add(link.id);

    if (!moleculeIds.has(link.parentMoleculeId)) {
      errors.push(`Link ${link.id} points to missing parent molecule ${link.parentMoleculeId}.`);
    }
    if (!moleculeIds.has(link.childMoleculeId)) {
      errors.push(`Link ${link.id} points to missing child molecule ${link.childMoleculeId}.`);
    }

    if (link.sourceRowId) {
      const rowOwner = rowIds.get(link.sourceRowId);
      if (!rowOwner) {
        errors.push(`Link ${link.id} references missing source row ${link.sourceRowId}.`);
        continue;
      }
      if (rowOwner !== link.parentMoleculeId) {
        errors.push(`Link ${link.id} source row does not belong to its parent molecule.`);
        continue;
      }
      const parent = project.molecules.find((molecule) => molecule.id === link.parentMoleculeId);
      const row = parent?.rows.find((candidate) => candidate.id === link.sourceRowId);
      if (row && row.linkedMoleculeId !== link.childMoleculeId) {
        errors.push(`Link ${link.id} does not match the linked molecule on source row ${link.sourceRowId}.`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Project JSON validation failed:\n- ${errors.join("\n- ")}`);
  }
}

function stripProjectForExport(project: ProjectRecord): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    molecules: project.molecules.map((molecule) => ({
      id: molecule.id,
      name: molecule.name,
      cas: molecule.cas,
      iupac: molecule.iupac,
      smiles: molecule.smiles,
      synonyms: [...molecule.synonyms],
      ecoinventAliases: [...molecule.ecoinventAliases],
      notes: molecule.notes,
      ecoinventStatus: molecule.ecoinventStatus,
      rawEcoinventStatus: molecule.rawEcoinventStatus,
      ecoinventCheck: molecule.ecoinventCheck
        ? {
            ...molecule.ecoinventCheck,
          }
        : null,
      reviewStatus: molecule.reviewStatus,
      placeholder: molecule.placeholder,
      needsReview: molecule.needsReview,
      topLevel: molecule.topLevel,
      rootOrder: molecule.rootOrder,
      scaleReferenceAmount: molecule.scaleReferenceAmount,
      scaleTargetAmount: molecule.scaleTargetAmount,
      scaleUnit: molecule.scaleUnit,
      sourceWorkbook: molecule.sourceWorkbook,
      sourceSheet: molecule.sourceSheet,
      importSessionId: molecule.importSessionId,
      pubchemMatch: molecule.pubchemMatch ?? null,
      rows: molecule.rows.map((row) => ({
        id: row.id,
        section: row.section,
        order: row.order,
        name: row.name,
        synonyms: [...row.synonyms],
        ro: row.ro,
        reactionValue: row.reactionValue,
        cleaningValue: row.cleaningValue,
        totalValue: row.totalValue,
        unit: row.unit,
        totalScaledValue: row.totalScaledValue,
        scaledUnit: row.scaledUnit,
        description: row.description,
        reference: row.reference,
        iupac: row.iupac,
        cas: row.cas,
        smiles: row.smiles,
        ecoinventStatus: row.ecoinventStatus,
        rawEcoinventStatus: row.rawEcoinventStatus,
        ecoinventName: row.ecoinventName,
        notes: row.notes,
        relevant: row.relevant,
        formula: row.formula,
        pubchemMatch: row.pubchemMatch ?? null,
        linkedMoleculeId: row.linkedMoleculeId,
        evidenceIds: [...row.evidenceIds],
        sourceWorkbook: row.sourceWorkbook,
        sourceSheet: row.sourceSheet,
        sourceRowNumber: row.sourceRowNumber,
        linkConfidence: row.linkConfidence,
        needsReview: row.needsReview,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      documentation: {
        referenceAndScope: molecule.documentation.referenceAndScope,
        functionalUnit: molecule.documentation.functionalUnit,
        pasAssumptions: molecule.documentation.pasAssumptions,
        balancedEquation: molecule.documentation.balancedEquation,
        calculationNotes: molecule.documentation.calculationNotes,
        explanationLines: molecule.documentation.explanationLines.map((line) => ({
          id: line.id,
          order: line.order,
          step: line.step,
          parameterDecision: line.parameterDecision,
          ruleCalculation: line.ruleCalculation,
          result: line.result,
          explanation: line.explanation,
        })),
      },
      evidence: molecule.evidence.map((evidence) => ({
        id: evidence.id,
        moleculeId: evidence.moleculeId,
        rowId: evidence.rowId,
        type: evidence.type,
        citation: evidence.citation,
        identifier: evidence.identifier,
        locator: evidence.locator,
        url: evidence.url,
        summary: evidence.summary,
        strength: evidence.strength,
        isPrimary: evidence.isPrimary,
        sourceWorkbook: evidence.sourceWorkbook,
        sourceSheet: evidence.sourceSheet,
        sourceRowNumber: evidence.sourceRowNumber,
        createdAt: evidence.createdAt,
        updatedAt: evidence.updatedAt,
      })),
      exports: molecule.exports.map((exportRecord) => ({
        id: exportRecord.id,
        version: exportRecord.version,
        exportedAt: exportRecord.exportedAt,
        format: exportRecord.format,
        fileName: exportRecord.fileName,
      })),
      parentLinkIds: [...molecule.parentLinkIds],
      childLinkIds: [...molecule.childLinkIds],
      createdAt: molecule.createdAt,
      updatedAt: molecule.updatedAt,
    })),
    links: project.links.map((link) => ({
      id: link.id,
      parentMoleculeId: link.parentMoleculeId,
      childMoleculeId: link.childMoleculeId,
      sourceRowId: link.sourceRowId,
      linkMethod: link.linkMethod,
      confidence: link.confidence,
      needsReview: link.needsReview,
      sortOrder: link.sortOrder,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    })),
    importSessions: project.importSessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      sourceLabel: session.sourceLabel,
      warnings: session.warnings.map((warning) => ({
        id: warning.id,
        level: warning.level,
        message: warning.message,
        workbookPath: warning.workbookPath,
      })),
      ignoredVariants: [...session.ignoredVariants],
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export function createProjectDocument(project: ProjectRecord): ProjectDocument {
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: stripProjectForExport(project),
  };
}

export function parseProjectDocument(rawText: string): WorkbenchState {
  const parsed = JSON.parse(rawText) as { schemaVersion?: number; project?: unknown } | unknown;
  const parsedRecord =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  const schemaVersion =
    parsedRecord && typeof parsedRecord.schemaVersion === "number" ? parsedRecord.schemaVersion : 1;
  const rawProject = parsedRecord && "project" in parsedRecord ? parsedRecord.project : parsed;

  const migratedProject = migrateProjectRecord(rawProject, schemaVersion);
  const normalizedProject = normalizeProjectRecord(migratedProject);
  validateNormalizedProject(normalizedProject);

  return {
    project: normalizedProject,
    selectedMoleculeId: null,
  };
}
