import {
  createBlankRow,
  createEmptyEcoinventCheck,
  createEvidenceRecord,
  createExplanationLine,
  createMoleculeFromDraft,
  makeClientId,
  normalizeSectionRows,
  normalizeExplanationLines,
  normalizeText,
  nowIso,
  sanitizeStringList,
  touchProject,
} from "@/features/workbench/state-utils";
import {
  PAS_DEFAULT_ECOINVENT_NAMES,
  PAS_PROFILE_DEFAULTS,
  PAS_REFERENCE_LABEL,
  STEAM_ENERGY_PER_KG_MJ,
  type PasProfile,
} from "@/features/workbench/pas-defaults";
import type {
  DocumentationRecord,
  EcoinventCheckRecord,
  EvidenceRecord,
  MoleculeDraft,
  MoleculeLinkRecord,
  MoleculeRecord,
  ProjectRecord,
  ReconstructionRow,
  ReconstructionSection,
  ReviewStatus,
  WorkbenchState,
} from "@/features/workbench/types";

type ChildDependencyRowValues = {
  totalValue: string;
  unit: string;
  reference: string;
  description: string;
  notes: string;
};

type MoleculeField =
  | "activityType"
  | "referenceProductName"
  | "objectKind"
  | "name"
  | "cas"
  | "iupac"
  | "smiles"
  | "synonyms"
  | "ecoinventAliases"
  | "notes"
  | "ecoinventStatus"
  | "reviewStatus"
  | "placeholder"
  | "needsReview"
  | "topLevel"
  | "scaleReferenceAmount"
  | "scaleTargetAmount"
  | "scaleUnit";

type MoleculeFieldValue =
  | string
  | string[]
  | MoleculeRecord["ecoinventStatus"]
  | ReviewStatus
  | boolean;

const WATER_KG_PER_M3 = 1000;

function updateMolecules(
  state: WorkbenchState,
  updater: (molecules: MoleculeRecord[]) => MoleculeRecord[],
): WorkbenchState {
  return {
    ...state,
    project: touchProject(state.project, updater(state.project.molecules)),
  };
}

function updateOneMolecule(
  state: WorkbenchState,
  moleculeId: string,
  updater: (molecule: MoleculeRecord) => MoleculeRecord,
): WorkbenchState {
  return updateMolecules(state, (molecules) =>
    molecules.map((molecule) =>
      molecule.id === moleculeId
        ? {
            ...updater(molecule),
            updatedAt: nowIso(),
          }
        : molecule,
    ),
  );
}

function parseNumericValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value ?? "")
    .replace(",", ".")
    .trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function wouldCreateDependencyCycle(project: ProjectRecord, parentMoleculeId: string, childMoleculeId: string) {
  if (parentMoleculeId === childMoleculeId) {
    return true;
  }

  const visited = new Set<string>();
  const pending = [childMoleculeId];
  while (pending.length > 0) {
    const candidateId = pending.pop();
    if (!candidateId || visited.has(candidateId)) {
      continue;
    }
    if (candidateId === parentMoleculeId) {
      return true;
    }
    visited.add(candidateId);
    for (const link of project.links) {
      if (link.parentMoleculeId === candidateId) {
        pending.push(link.childMoleculeId);
      }
    }
  }

  return false;
}

function formatScaledValue(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number(value.toFixed(6)).toString();
}

function deriveTotalValue(values: Partial<ReconstructionRow>) {
  if ((values.totalValue ?? "").toString().trim()) {
    return String(values.totalValue ?? "");
  }

  const reaction = parseNumericValue(values.reactionValue ?? "");
  const cleaning = parseNumericValue(values.cleaningValue ?? "");
  if (reaction === null && cleaning === null) {
    return "";
  }

  return formatScaledValue((reaction ?? 0) + (cleaning ?? 0));
}

function getScaledQuantity(
  molecule: MoleculeRecord,
  originalQuantity: string | number | null | undefined,
) {
  const referenceAmount = parseNumericValue(molecule.scaleReferenceAmount);
  const targetAmount = parseNumericValue(molecule.scaleTargetAmount);
  if (referenceAmount === null || referenceAmount <= 0 || targetAmount === null || targetAmount <= 0 || !molecule.scaleUnit.trim()) {
    return "";
  }
  const factor = targetAmount / referenceAmount;
  const numeric = parseNumericValue(originalQuantity);
  return numeric === null ? "" : formatScaledValue(numeric * factor);
}

function rescaleRows(molecule: MoleculeRecord) {
  const referenceAmount = parseNumericValue(molecule.scaleReferenceAmount);
  const targetAmount = parseNumericValue(molecule.scaleTargetAmount);

  if (
    referenceAmount === null ||
    referenceAmount <= 0 ||
    targetAmount === null ||
    targetAmount <= 0 ||
    !molecule.scaleUnit.trim()
  ) {
    return molecule.rows;
  }

  const factor = targetAmount / referenceAmount;
  return molecule.rows.map((row) => {
    const numeric = parseNumericValue(row.totalValue);
    if (numeric === null) {
      return row;
    }

    return {
      ...row,
      totalScaledValue: formatScaledValue(numeric * factor),
      scaledUnit: row.unit || molecule.scaleUnit,
      updatedAt: nowIso(),
    };
  });
}

function findRowIndexByName(rows: ReconstructionRow[], name: string) {
  const normalizedTarget = normalizeText(name);
  return rows.findIndex((row) => normalizeText(row.name) === normalizedTarget);
}

function isWaterLikeRow(row: ReconstructionRow) {
  return normalizeText(row.name).includes("water");
}

function isPasUtilityRow(row: ReconstructionRow) {
  const normalized = normalizeText(row.name);
  return normalized.includes("electricity") || normalized === "heat" || normalized.includes("steam");
}

function toMassKg(totalValue: string | number | null | undefined, unit: string | null | undefined) {
  const numeric = parseNumericValue(totalValue);
  if (numeric === null) {
    return null;
  }

  const normalizedUnit = normalizeText(String(unit ?? ""));
  if (normalizedUnit === "kg") {
    return numeric;
  }
  if (normalizedUnit === "g") {
    return numeric / 1000;
  }
  if (normalizedUnit === "mg") {
    return numeric / 1_000_000;
  }
  if (normalizedUnit === "t" || normalizedUnit === "ton" || normalizedUnit === "tonne" || normalizedUnit === "tonnes") {
    return numeric * 1000;
  }
  if (normalizedUnit === "lb" || normalizedUnit === "lbs") {
    return numeric * 0.45359237;
  }

  return null;
}

function upsertPasRows(
  molecule: MoleculeRecord,
  section: ReconstructionSection,
  definitions: Array<Partial<ReconstructionRow> & { name: string }>,
) {
  const sectionRows = molecule.rows.filter((row) => row.section === section);
  const untouchedRows = molecule.rows.filter((row) => row.section !== section);
  const nextSectionRows = [...sectionRows];
  const timestamp = nowIso();

  for (const definition of definitions) {
    const index = findRowIndexByName(nextSectionRows, definition.name);

    if (index === -1) {
      nextSectionRows.push(
        createBlankRow(section, nextSectionRows.length + 1, {
          ...definition,
          section,
          scaledUnit: definition.scaledUnit ?? definition.unit ?? molecule.scaleUnit,
        }),
      );
      continue;
    }

    const current = nextSectionRows[index];
    nextSectionRows[index] = {
      ...current,
      ...definition,
      section,
      notes: definition.notes || current.notes,
      updatedAt: timestamp,
      scaledUnit: definition.scaledUnit ?? definition.unit ?? current.scaledUnit,
      evidenceIds: current.evidenceIds,
    };
  }

  return [...untouchedRows, ...normalizeSectionRows(nextSectionRows)];
}

function createLinkedInputRow(
  parentMolecule: MoleculeRecord,
  childMolecule: MoleculeRecord,
  rowValues: ChildDependencyRowValues,
) {
  const nextOrder = parentMolecule.rows.filter((row) => row.section === "INPUT").length + 1;
  const totalScaledValue = getScaledQuantity(parentMolecule, rowValues.totalValue);

  return createBlankRow("INPUT", nextOrder, {
    objectKind: childMolecule.objectKind,
    name: childMolecule.referenceProductName || childMolecule.name,
    synonyms: childMolecule.synonyms,
    totalValue: rowValues.totalValue,
    unit: rowValues.unit || "kg",
    totalScaledValue,
    scaledUnit: totalScaledValue ? rowValues.unit || parentMolecule.scaleUnit : "",
    cas: childMolecule.cas,
    iupac: childMolecule.iupac,
    smiles: childMolecule.smiles,
    reference: rowValues.reference,
    description: rowValues.description,
    notes: rowValues.notes,
    linkedMoleculeId: childMolecule.id,
    ecoinventStatus: childMolecule.ecoinventStatus,
    rawEcoinventStatus: childMolecule.rawEcoinventStatus,
    linkConfidence: "high",
    needsReview: false,
  });
}

function createReferenceOutputRowFromDraft(draft: MoleculeDraft, unit = "kg") {
  const referenceAmount = draft.referenceAmount?.trim() || "1";
  const referenceUnit = draft.referenceUnit?.trim() || unit || "kg";

  return createBlankRow("OUTPUT", 1, {
    objectKind: "generic_object",
    name: draft.referenceProductName || draft.name || "Main output",
    synonyms: [],
    unit: referenceUnit,
    totalValue: referenceAmount,
    totalScaledValue: "",
    scaledUnit: "",
    cas: "",
    iupac: "",
    smiles: "",
    notes: "",
    ecoinventStatus: "unchecked",
    rawEcoinventStatus: "Not checked",
    ecoinventName: "",
  });
}

function createReferenceOutputRowFromInputRow(row: ReconstructionRow) {
  return createBlankRow("OUTPUT", 1, {
    objectKind: row.objectKind,
    name: row.name || "Main output",
    synonyms: row.synonyms,
    unit: row.unit || "kg",
    totalValue: "",
    totalScaledValue: "",
    scaledUnit: "",
    cas: row.objectKind === "generic_object" ? "" : row.cas,
    iupac: row.objectKind === "generic_object" ? "" : row.iupac,
    smiles: row.objectKind === "generic_object" ? "" : row.smiles,
    notes: "Main output placeholder. Add the output amount before impact calculation.",
    ecoinventStatus: row.ecoinventStatus,
    rawEcoinventStatus: row.rawEcoinventStatus,
    ecoinventName: row.ecoinventName,
  });
}

function hasNamedReferenceOutput(molecule: MoleculeRecord) {
  const referenceProductName = (molecule.referenceProductName || molecule.name).trim();
  return molecule.rows.some(
    (row) => row.section === "OUTPUT" && row.name.trim() === referenceProductName,
  );
}

function addReferenceOutputFromInputRow(molecule: MoleculeRecord, inputRow: ReconstructionRow) {
  const inputRows = molecule.rows.filter((row) => row.section === "INPUT");
  const existingOutputRows = molecule.rows
    .filter((row) => row.section === "OUTPUT")
    .sort((left, right) => left.order - right.order)
    .map((row, index) => ({ ...row, order: index + 2 }));

  return [...inputRows, createReferenceOutputRowFromInputRow(inputRow), ...existingOutputRows];
}

function documentationHasContent(documentation: DocumentationRecord) {
  return Boolean(
    documentation.referenceAndScope.trim() ||
      documentation.functionalUnit.trim() ||
      documentation.pasAssumptions.trim() ||
      documentation.balancedEquation.trim() ||
      documentation.calculationNotes.trim() ||
      documentation.explanationLines.length > 0,
  );
}

function moleculeHasSubstantialContent(molecule: MoleculeRecord) {
  return Boolean(
    molecule.rows.length > 0 ||
      molecule.evidence.length > 0 ||
      documentationHasContent(molecule.documentation) ||
      molecule.exports.length > 0,
  );
}

function combineStringLists(...lists: string[][]) {
  return [...new Set(lists.flat().map((value) => value.trim()).filter(Boolean))];
}

function pickPreferredText(primary: string, fallback: string) {
  return primary.trim() ? primary : fallback;
}

function mergeDocumentationRecords(current: DocumentationRecord, imported: DocumentationRecord): DocumentationRecord {
  const explanationIds = new Set<string>();
  const explanationLines = [...current.explanationLines, ...imported.explanationLines].filter((line) => {
    if (explanationIds.has(line.id)) {
      return false;
    }
    explanationIds.add(line.id);
    return true;
  });

  return {
    referenceAndScope: pickPreferredText(imported.referenceAndScope, current.referenceAndScope),
    functionalUnit: pickPreferredText(imported.functionalUnit, current.functionalUnit),
    pasAssumptions: pickPreferredText(imported.pasAssumptions, current.pasAssumptions),
    balancedEquation: pickPreferredText(imported.balancedEquation, current.balancedEquation),
    calculationNotes: pickPreferredText(imported.calculationNotes, current.calculationNotes),
    explanationLines: normalizeExplanationLines(explanationLines),
  };
}

function getImportedRootMolecule(project: ProjectRecord) {
  const childIds = new Set(project.links.map((link) => link.childMoleculeId));
  const roots = project.molecules.filter((molecule) => !childIds.has(molecule.id));

  if (roots.length !== 1) {
    throw new Error(
      `Imported JSON must contain exactly one top-level root molecule. Found ${roots.length}.`,
    );
  }

  return roots[0];
}

function findImportTargetMolecule(project: ProjectRecord, importedRoot: MoleculeRecord) {
  const normalizedCas = normalizeText(importedRoot.cas);
  const normalizedName = normalizeText(importedRoot.name);
  const normalizedIupac = normalizeText(importedRoot.iupac);
  const importedSynonyms = new Set(
    [...importedRoot.synonyms, ...importedRoot.ecoinventAliases].map((value) => normalizeText(value)).filter(Boolean),
  );

  const matches = project.molecules.filter((candidate) => {
    if (normalizedCas && normalizeText(candidate.cas) === normalizedCas) {
      return true;
    }
    if (normalizedName && normalizeText(candidate.name) === normalizedName) {
      return true;
    }
    if (normalizedIupac && normalizeText(candidate.iupac) === normalizedIupac) {
      return true;
    }

    return [...candidate.synonyms, ...candidate.ecoinventAliases]
      .map((value) => normalizeText(value))
      .some((value) => importedSynonyms.has(value));
  });

  if (matches.length !== 1) {
    return null;
  }

  return matches[0].placeholder || !moleculeHasSubstantialContent(matches[0]) ? matches[0] : null;
}

function remapImportedProject(project: ProjectRecord): {
  importSessions: ProjectRecord["importSessions"];
  links: MoleculeLinkRecord[];
  molecules: MoleculeRecord[];
  rootMoleculeId: string;
} {
  const importSessionIdMap = new Map<string, string>();
  const moleculeIdMap = new Map<string, string>();
  const rowIdMap = new Map<string, string>();
  const evidenceIdMap = new Map<string, string>();
  const exportIdMap = new Map<string, string>();
  const linkIdMap = new Map<string, string>();
  const explanationIdMap = new Map<string, string>();

  for (const session of project.importSessions) {
    importSessionIdMap.set(session.id, makeClientId("import-session"));
  }
  for (const molecule of project.molecules) {
    moleculeIdMap.set(molecule.id, makeClientId("molecule"));
    for (const row of molecule.rows) {
      rowIdMap.set(row.id, makeClientId("row"));
    }
    for (const evidence of molecule.evidence) {
      evidenceIdMap.set(evidence.id, makeClientId("evidence"));
    }
    for (const exportRecord of molecule.exports) {
      exportIdMap.set(exportRecord.id, makeClientId("export"));
    }
    for (const line of molecule.documentation.explanationLines) {
      explanationIdMap.set(line.id, makeClientId("explanation"));
    }
  }
  for (const link of project.links) {
    linkIdMap.set(link.id, makeClientId("link"));
  }

  const molecules = project.molecules.map((molecule) => ({
    ...molecule,
    id: moleculeIdMap.get(molecule.id) ?? molecule.id,
    importSessionId: importSessionIdMap.get(molecule.importSessionId) ?? molecule.importSessionId,
    topLevel: false,
    rootOrder: 0,
    rows: molecule.rows.map((row) => ({
      ...row,
      id: rowIdMap.get(row.id) ?? row.id,
      linkedMoleculeId: row.linkedMoleculeId ? (moleculeIdMap.get(row.linkedMoleculeId) ?? row.linkedMoleculeId) : null,
      evidenceIds: row.evidenceIds.map((id) => evidenceIdMap.get(id) ?? id),
    })),
    documentation: {
      ...molecule.documentation,
      explanationLines: molecule.documentation.explanationLines.map((line) => ({
        ...line,
        id: explanationIdMap.get(line.id) ?? line.id,
      })),
    },
    evidence: molecule.evidence.map((record) => ({
      ...record,
      id: evidenceIdMap.get(record.id) ?? record.id,
      moleculeId: moleculeIdMap.get(record.moleculeId) ?? record.moleculeId,
      rowId: record.rowId ? (rowIdMap.get(record.rowId) ?? record.rowId) : null,
    })),
    exports: molecule.exports.map((record) => ({
      ...record,
      id: exportIdMap.get(record.id) ?? record.id,
    })),
    parentLinkIds: [] as string[],
    childLinkIds: [] as string[],
  }));

  const links = project.links.map((link) => ({
    ...link,
    id: linkIdMap.get(link.id) ?? link.id,
    parentMoleculeId: moleculeIdMap.get(link.parentMoleculeId) ?? link.parentMoleculeId,
    childMoleculeId: moleculeIdMap.get(link.childMoleculeId) ?? link.childMoleculeId,
    sourceRowId: link.sourceRowId ? (rowIdMap.get(link.sourceRowId) ?? link.sourceRowId) : null,
  }));

  const importSessions = project.importSessions.map((session) => ({
    ...session,
    id: importSessionIdMap.get(session.id) ?? session.id,
  }));

  return {
    importSessions,
    links,
    molecules,
    rootMoleculeId: moleculeIdMap.get(getImportedRootMolecule(project).id) ?? getImportedRootMolecule(project).id,
  };
}

function replaceReferencedMoleculeId(molecule: MoleculeRecord, fromId: string, toId: string) {
  return {
    ...molecule,
    rows: molecule.rows.map((row) =>
      row.linkedMoleculeId === fromId
        ? {
            ...row,
            linkedMoleculeId: toId,
          }
        : row,
    ),
  };
}

function mergeImportedRootMolecule(
  current: MoleculeRecord,
  imported: MoleculeRecord,
  options?: {
    forceTopLevel?: boolean;
  },
): MoleculeRecord {
  const importedLooksComplete = imported.rows.length > 0 || documentationHasContent(imported.documentation);

  return {
    ...current,
    name: pickPreferredText(imported.name, current.name),
    cas: pickPreferredText(imported.cas, current.cas),
    iupac: pickPreferredText(imported.iupac, current.iupac),
    smiles: pickPreferredText(imported.smiles, current.smiles),
    synonyms: combineStringLists(current.synonyms, imported.synonyms),
    ecoinventAliases: combineStringLists(current.ecoinventAliases, imported.ecoinventAliases),
    notes: pickPreferredText(imported.notes, current.notes),
    ecoinventStatus: imported.ecoinventStatus === "unchecked" ? current.ecoinventStatus : imported.ecoinventStatus,
    rawEcoinventStatus: pickPreferredText(imported.rawEcoinventStatus, current.rawEcoinventStatus),
    ecoinventCheck: imported.ecoinventCheck ?? current.ecoinventCheck,
    reviewStatus: importedLooksComplete ? imported.reviewStatus : current.reviewStatus,
    placeholder: imported.placeholder && !importedLooksComplete && current.placeholder,
    needsReview: imported.needsReview || current.needsReview,
    topLevel: options?.forceTopLevel ?? current.topLevel,
    rootOrder: options?.forceTopLevel ? current.rootOrder : current.rootOrder,
    scaleReferenceAmount: pickPreferredText(imported.scaleReferenceAmount, current.scaleReferenceAmount),
    scaleTargetAmount: pickPreferredText(imported.scaleTargetAmount, current.scaleTargetAmount),
    scaleUnit: pickPreferredText(imported.scaleUnit, current.scaleUnit),
    sourceWorkbook: pickPreferredText(imported.sourceWorkbook, current.sourceWorkbook),
    sourceSheet: pickPreferredText(imported.sourceSheet, current.sourceSheet),
    importSessionId: pickPreferredText(imported.importSessionId, current.importSessionId),
    pubchemMatch: imported.pubchemMatch ?? current.pubchemMatch,
    rows: [...current.rows, ...imported.rows],
    documentation: mergeDocumentationRecords(current.documentation, imported.documentation),
    evidence: [...current.evidence, ...imported.evidence],
    exports: [...current.exports, ...imported.exports],
    parentLinkIds: current.parentLinkIds,
    childLinkIds: current.childLinkIds,
    updatedAt: nowIso(),
  };
}

function upsertImportedRootLink(
  state: WorkbenchState,
  parentMoleculeId: string,
  importedRootId: string,
  importedRoot: MoleculeRecord,
  rowValues: ChildDependencyRowValues,
): WorkbenchState {
  const parent = state.project.molecules.find((molecule) => molecule.id === parentMoleculeId);
  if (!parent) {
    return state;
  }

  const existingRow = parent.rows.find((row) => row.section === "INPUT" && row.linkedMoleculeId === importedRootId);
  if (!existingRow) {
    return linkExistingChildDependency(state, parentMoleculeId, importedRootId, rowValues);
  }

  return saveReconstructionRow(
    state,
    parentMoleculeId,
    "INPUT",
    {
      ...existingRow,
      objectKind: importedRoot.objectKind,
      name: importedRoot.name,
      synonyms: importedRoot.synonyms,
      cas: importedRoot.cas,
      iupac: importedRoot.iupac,
      smiles: importedRoot.smiles,
      totalValue: rowValues.totalValue || existingRow.totalValue,
      unit: rowValues.unit || existingRow.unit,
      reference: rowValues.reference || existingRow.reference,
      description: rowValues.description || existingRow.description,
      notes: rowValues.notes || existingRow.notes,
      linkedMoleculeId: importedRootId,
      ecoinventStatus: importedRoot.ecoinventStatus,
      rawEcoinventStatus: importedRoot.rawEcoinventStatus,
      ecoinventName: importedRoot.ecoinventCheck?.datasetName ?? existingRow.ecoinventName,
      linkConfidence: "high",
      needsReview: false,
    },
    existingRow.id,
  );
}

export function importMoleculeSubtree(
  state: WorkbenchState,
  importedState: WorkbenchState,
  options?: {
    parentMoleculeId?: string;
    sourceRowId?: string;
    rowValues?: ChildDependencyRowValues;
    replaceMoleculeId?: string;
    navigateToImported?: boolean;
  },
): WorkbenchState {
  const importedRootOriginal = getImportedRootMolecule(importedState.project);
  const remapped = remapImportedProject(importedState.project);
  const remappedRoot = remapped.molecules.find((molecule) => molecule.id === remapped.rootMoleculeId);

  if (!remappedRoot) {
    throw new Error("The imported JSON root molecule could not be identified.");
  }

  const existingTarget =
    (options?.replaceMoleculeId
      ? state.project.molecules.find((molecule) => molecule.id === options.replaceMoleculeId) ?? null
      : null) ?? findImportTargetMolecule(state.project, importedRootOriginal);

  let importedRootId = remapped.rootMoleculeId;
  let importedLinks = remapped.links;
  let importedMolecules: MoleculeRecord[] = remapped.molecules.map((molecule) =>
    molecule.id === remapped.rootMoleculeId
      ? {
          ...molecule,
          topLevel: !options?.parentMoleculeId && !existingTarget,
          rootOrder: 0,
        }
      : {
          ...molecule,
          topLevel: false,
          rootOrder: 0,
        },
  );

  let nextMolecules = [...state.project.molecules];

  if (existingTarget) {
    const mergedRoot = mergeImportedRootMolecule(existingTarget, remappedRoot, {
      forceTopLevel: options?.parentMoleculeId ? false : existingTarget.topLevel,
    });

    importedRootId = existingTarget.id;
    importedLinks = importedLinks.map((link) => ({
      ...link,
      parentMoleculeId: link.parentMoleculeId === remapped.rootMoleculeId ? existingTarget.id : link.parentMoleculeId,
      childMoleculeId: link.childMoleculeId === remapped.rootMoleculeId ? existingTarget.id : link.childMoleculeId,
    }));
    importedMolecules = importedMolecules
      .filter((molecule) => molecule.id !== remapped.rootMoleculeId)
      .map((molecule) => replaceReferencedMoleculeId(molecule, remapped.rootMoleculeId, existingTarget.id));

    nextMolecules = state.project.molecules.map((molecule) => (molecule.id === existingTarget.id ? mergedRoot : molecule));
  }

  if (!existingTarget) {
    const maxRootOrder = nextMolecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);
    importedMolecules = importedMolecules.map((molecule) =>
      molecule.id === importedRootId
        ? {
            ...molecule,
            topLevel: !options?.parentMoleculeId,
            rootOrder: options?.parentMoleculeId ? 0 : maxRootOrder + 1,
          }
        : molecule,
    );
  }

  let nextState: WorkbenchState = {
    ...state,
    project: touchProject(
      {
        ...state.project,
        importSessions: [...state.project.importSessions, ...remapped.importSessions],
        links: [...state.project.links, ...importedLinks],
        updatedAt: nowIso(),
      },
      [...nextMolecules, ...importedMolecules],
    ),
  };

  const importedRoot =
    nextState.project.molecules.find((molecule) => molecule.id === importedRootId) ?? remappedRoot;

  if (options?.parentMoleculeId && options?.sourceRowId) {
    const parentMolecule = nextState.project.molecules.find((molecule) => molecule.id === options.parentMoleculeId);
    const existingRow = parentMolecule?.rows.find((row) => row.id === options.sourceRowId);
    if (existingRow) {
      nextState = saveReconstructionRow(
        nextState,
        options.parentMoleculeId,
        "INPUT",
        {
          ...existingRow,
          name: importedRoot.name,
          synonyms: importedRoot.synonyms,
          cas: importedRoot.cas,
          iupac: importedRoot.iupac,
          linkedMoleculeId: importedRootId,
          ecoinventStatus: importedRoot.ecoinventStatus,
          rawEcoinventStatus: importedRoot.rawEcoinventStatus,
          ecoinventName: importedRoot.ecoinventCheck?.datasetName ?? existingRow.ecoinventName,
          linkConfidence: "high",
          needsReview: false,
        },
        options.sourceRowId,
      );
    }
  } else if (options?.parentMoleculeId && options.rowValues) {
    nextState = upsertImportedRootLink(
      nextState,
      options.parentMoleculeId,
      importedRootId,
      importedRoot,
      options.rowValues,
    );
  }

  return {
    ...nextState,
    selectedMoleculeId: options?.navigateToImported === false ? state.selectedMoleculeId : importedRootId,
  };
}

function insertCreatedParentMolecule(
  state: WorkbenchState,
  childMoleculeId: string,
  newParentMoleculeId: string,
): WorkbenchState {
  const childMolecule = state.project.molecules.find((molecule) => molecule.id === childMoleculeId);
  const newParentMolecule = state.project.molecules.find((molecule) => molecule.id === newParentMoleculeId);

  if (!childMolecule || !newParentMolecule) {
    return state;
  }

  const ensureNewParentHasChildInput = (nextState: WorkbenchState) =>
    updateOneMolecule(nextState, newParentMoleculeId, (parentMolecule) => {
      if (parentMolecule.rows.some((row) => row.linkedMoleculeId === childMoleculeId)) {
        return parentMolecule;
      }

      return {
        ...parentMolecule,
        rows: [
          ...parentMolecule.rows,
          createLinkedInputRow(parentMolecule, childMolecule, {
            totalValue: "",
            unit: childMolecule.scaleUnit || "kg",
            reference: "",
            description: "Linked child activity",
            notes: "",
          }),
        ],
      };
    });

  const existingParentLinks = state.project.links.filter((link) => link.childMoleculeId === childMoleculeId);
  if (existingParentLinks.length === 0) {
    return ensureNewParentHasChildInput(addManualParentLink(state, childMoleculeId, newParentMoleculeId));
  }

  const timestamp = nowIso();
  const nextManualLink: MoleculeLinkRecord = {
    id: makeClientId("link"),
    parentMoleculeId: newParentMoleculeId,
    childMoleculeId,
    sourceRowId: null,
    linkMethod: "manual",
    confidence: "high",
    needsReview: false,
    sortOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const nextLinks = [
    ...state.project.links.map((link) =>
      link.childMoleculeId === childMoleculeId
        ? {
            ...link,
            childMoleculeId: newParentMoleculeId,
            updatedAt: timestamp,
          }
        : link,
    ),
    nextManualLink,
  ];

  const nextMolecules = state.project.molecules.map((molecule) => {
    if (molecule.id === newParentMoleculeId) {
      return {
        ...molecule,
        topLevel: false,
        rootOrder: 0,
        rows: molecule.rows.some((row) => row.linkedMoleculeId === childMoleculeId)
          ? molecule.rows
          : [
              ...molecule.rows,
              createLinkedInputRow(molecule, childMolecule, {
                totalValue: "",
                unit: childMolecule.scaleUnit || "kg",
                reference: "",
                description: "Linked child activity",
                notes: "",
              }),
            ],
        updatedAt: timestamp,
      };
    }

    if (molecule.id === childMoleculeId) {
      return {
        ...molecule,
        topLevel: false,
        rootOrder: 0,
        updatedAt: timestamp,
      };
    }

    const hasLinkedChildRows = molecule.rows.some((row) => row.linkedMoleculeId === childMoleculeId);
    if (!hasLinkedChildRows) {
      return molecule;
    }

    return {
      ...molecule,
      updatedAt: timestamp,
      rows: molecule.rows.map((row) =>
        row.linkedMoleculeId === childMoleculeId
          ? {
              ...row,
              name: newParentMolecule.name,
              synonyms: newParentMolecule.synonyms,
              cas: newParentMolecule.cas,
              iupac: newParentMolecule.iupac,
              linkedMoleculeId: newParentMoleculeId,
              ecoinventStatus: newParentMolecule.ecoinventStatus,
              rawEcoinventStatus: newParentMolecule.rawEcoinventStatus,
              ecoinventName: newParentMolecule.ecoinventCheck?.datasetName ?? "",
              updatedAt: timestamp,
            }
          : row,
      ),
    };
  });

  return {
    ...state,
    project: touchProject(
      {
        ...state.project,
        links: nextLinks,
        updatedAt: timestamp,
      },
      nextMolecules,
    ),
  };
}

export function replaceProject(state: WorkbenchState, nextState: WorkbenchState): WorkbenchState {
  return {
    project: nextState.project,
    selectedMoleculeId: nextState.selectedMoleculeId,
  };
}

export function updateProjectName(state: WorkbenchState, name: string): WorkbenchState {
  return {
    ...state,
    project: {
      ...state.project,
      name,
      updatedAt: nowIso(),
    },
  };
}

export function selectMolecule(state: WorkbenchState, moleculeId: string | null): WorkbenchState {
  return {
    ...state,
    selectedMoleculeId: moleculeId,
  };
}

export function createMolecule(
  state: WorkbenchState,
  draft: MoleculeDraft,
  options?: {
    parentMoleculeId?: string;
    sourceRowId?: string;
    childMoleculeId?: string;
    navigateToNew?: boolean;
    newMoleculeId?: string;
  },
): WorkbenchState {
  const importSessionId = state.project.importSessions.at(-1)?.id ?? "manual";
  const childHasParents = options?.childMoleculeId
    ? state.project.links.some((link) => link.childMoleculeId === options.childMoleculeId)
    : false;
  const newMolecule = createMoleculeFromDraft(
    options?.childMoleculeId
      ? {
          ...draft,
          topLevel: childHasParents ? false : draft.topLevel,
        }
      : draft,
    importSessionId,
    options?.newMoleculeId,
  );
  let nextState = updateMolecules(state, (molecules) => {
    const maxRootOrder = molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);
    return [
      ...molecules,
      {
        ...newMolecule,
        rootOrder: newMolecule.topLevel ? maxRootOrder + 1 : 0,
      },
    ];
  });

  if (options?.parentMoleculeId && options?.sourceRowId) {
    const timestamp = nowIso();
    const sourceRow = state.project.molecules
      .find((molecule) => molecule.id === options.parentMoleculeId)
      ?.rows.find((row) => row.id === options.sourceRowId);
    nextState = updateReconstructionRow(
      nextState,
      options.parentMoleculeId,
      options.sourceRowId,
      "linkedMoleculeId",
      newMolecule.id,
    );
    nextState = updateReconstructionRow(
      nextState,
      options.parentMoleculeId,
      options.sourceRowId,
      "linkConfidence",
      "high",
    );
    nextState = updateReconstructionRow(
      nextState,
      options.parentMoleculeId,
      options.sourceRowId,
      "needsReview",
      "true",
    );

    const linkExists = nextState.project.links.some(
      (link) =>
        link.parentMoleculeId === options.parentMoleculeId &&
        link.childMoleculeId === newMolecule.id &&
        link.sourceRowId === options.sourceRowId,
    );

    if (!linkExists) {
      const siblings = nextState.project.links.filter((link) => link.parentMoleculeId === options.parentMoleculeId);
      const nextLink: MoleculeLinkRecord = {
        id: makeClientId("link"),
        parentMoleculeId: options.parentMoleculeId,
        childMoleculeId: newMolecule.id,
        sourceRowId: options.sourceRowId,
        linkMethod: "manual",
        confidence: "high",
        needsReview: false,
        sortOrder: siblings.length + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      nextState = {
        ...nextState,
        project: touchProject(
          {
            ...nextState.project,
            links: [...nextState.project.links, nextLink],
            updatedAt: timestamp,
          },
          nextState.project.molecules.map((molecule) =>
            molecule.id === newMolecule.id
              ? {
                  ...molecule,
                  topLevel: false,
                  rootOrder: 0,
                  rows:
                    molecule.rows.some((row) => row.section === "OUTPUT")
                      ? molecule.rows
                      : [createReferenceOutputRowFromDraft(draft, sourceRow?.unit || "kg")],
                  updatedAt: timestamp,
                }
              : molecule,
          ),
        ),
      };
    }
  }

  if (draft.parentMoleculeId && !options?.sourceRowId) {
    nextState = addManualParentLink(nextState, newMolecule.id, draft.parentMoleculeId);
  }

  if (options?.childMoleculeId) {
    nextState = insertCreatedParentMolecule(nextState, options.childMoleculeId, newMolecule.id);
  }

  return {
    ...nextState,
    selectedMoleculeId: options?.navigateToNew === false ? nextState.selectedMoleculeId : newMolecule.id,
  };
}

export function linkExistingChildDependency(
  state: WorkbenchState,
  parentMoleculeId: string,
  childMoleculeId: string,
  rowValues: ChildDependencyRowValues,
): WorkbenchState {
  const childMolecule = state.project.molecules.find((molecule) => molecule.id === childMoleculeId);
  if (!childMolecule) {
    return state;
  }

  return updateOneMolecule(state, parentMoleculeId, (parentMolecule) => ({
    ...parentMolecule,
    rows: [...parentMolecule.rows, createLinkedInputRow(parentMolecule, childMolecule, rowValues)],
  }));
}

export function createChildDependency(
  state: WorkbenchState,
  parentMoleculeId: string,
  childDraft: MoleculeDraft,
  rowValues: ChildDependencyRowValues,
): WorkbenchState {
  const importSessionId = state.project.importSessions.at(-1)?.id ?? "manual";
  const childMolecule = {
    ...createMoleculeFromDraft(
      {
        ...childDraft,
        topLevel: false,
        parentMoleculeId: "",
      },
      importSessionId,
    ),
    rootOrder: 0,
  };

  return updateMolecules(state, (molecules) => {
    const parentMolecule = molecules.find((molecule) => molecule.id === parentMoleculeId);
    if (!parentMolecule) {
      return molecules;
    }

    const nextRows = [...parentMolecule.rows, createLinkedInputRow(parentMolecule, childMolecule, rowValues)];

    return [
      ...molecules.map((molecule) =>
        molecule.id === parentMoleculeId
          ? {
              ...molecule,
              rows: nextRows,
            }
          : molecule,
      ),
      childMolecule,
    ];
  });
}

export function updateMoleculeField(
  state: WorkbenchState,
  moleculeId: string,
  field: MoleculeField,
  value: MoleculeFieldValue,
): WorkbenchState {
  const normalizedValue =
    field === "synonyms" || field === "ecoinventAliases"
      ? sanitizeStringList(Array.isArray(value) ? value : [])
      : value;

  return updateOneMolecule(state, moleculeId, (molecule) => {
    if (field !== "referenceProductName") {
      const updatedMolecule = {
        ...molecule,
        [field]: normalizedValue,
      };

      return field === "scaleReferenceAmount" || field === "scaleTargetAmount" || field === "scaleUnit"
        ? {
            ...updatedMolecule,
            rows: updatedMolecule.rows.map((row) => ({ ...row, totalScaledValue: "", scaledUnit: "" })),
          }
        : updatedMolecule;
    }

    const nextName = String(normalizedValue);
    let referenceOutputUpdated = false;

    return {
      ...molecule,
      referenceProductName: nextName,
      rows: molecule.rows.map((row) => {
        if (referenceOutputUpdated || row.section !== "OUTPUT") {
          return row;
        }

        referenceOutputUpdated = true;
        return {
          ...row,
          name: nextName || row.name,
          updatedAt: nowIso(),
        };
      }),
    };
  });
}

export function updateEcoinventCheck(
  state: WorkbenchState,
  moleculeId: string,
  patch: Partial<EcoinventCheckRecord> | null,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    ecoinventCheck: patch === null ? null : { ...(molecule.ecoinventCheck ?? createEmptyEcoinventCheck()), ...patch },
  }));
}

export function setMoleculeTopLevel(state: WorkbenchState, moleculeId: string, topLevel: boolean): WorkbenchState {
  const maxRootOrder = state.project.molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);

  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    topLevel,
    rootOrder: topLevel ? molecule.rootOrder || maxRootOrder + 1 : 0,
  }));
}

export function addManualParentLink(state: WorkbenchState, moleculeId: string, parentMoleculeId: string): WorkbenchState {
  if (wouldCreateDependencyCycle(state.project, parentMoleculeId, moleculeId)) {
    return state;
  }

  const alreadyExists = state.project.links.some(
    (link) => link.parentMoleculeId === parentMoleculeId && link.childMoleculeId === moleculeId && link.sourceRowId === null,
  );
  if (alreadyExists) {
    return state;
  }

  const siblings = state.project.links.filter((link) => link.parentMoleculeId === parentMoleculeId);
  const nextLink: MoleculeLinkRecord = {
    id: makeClientId("link"),
    parentMoleculeId,
    childMoleculeId: moleculeId,
    sourceRowId: null,
    linkMethod: "manual",
    confidence: "high",
    needsReview: false,
    sortOrder: siblings.length + 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const maxRootOrder = state.project.molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);

  return {
    ...state,
    project: touchProject(
      {
        ...state.project,
        links: [...state.project.links, nextLink],
        updatedAt: nowIso(),
      },
      state.project.molecules.map((molecule) =>
        molecule.id === moleculeId
          ? {
              ...molecule,
              topLevel: false,
              rootOrder: 0,
              updatedAt: nowIso(),
            }
          : molecule.topLevel && molecule.rootOrder > maxRootOrder
            ? { ...molecule, rootOrder: maxRootOrder }
            : molecule,
      ),
    ),
  };
}

export function removeManualParentLink(state: WorkbenchState, moleculeId: string, parentMoleculeId: string): WorkbenchState {
  const remainingLinks = state.project.links.filter(
    (link) =>
      !(
        link.parentMoleculeId === parentMoleculeId &&
        link.childMoleculeId === moleculeId &&
        link.sourceRowId === null &&
        link.linkMethod === "manual"
      ),
  );
  const stillHasParents = remainingLinks.some((link) => link.childMoleculeId === moleculeId);
  const maxRootOrder = state.project.molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);

  return {
    ...state,
    project: touchProject(
      {
        ...state.project,
        links: remainingLinks,
        updatedAt: nowIso(),
      },
      state.project.molecules.map((molecule) =>
        molecule.id === moleculeId && !stillHasParents
          ? {
              ...molecule,
              topLevel: true,
              rootOrder: molecule.rootOrder || maxRootOrder + 1,
              updatedAt: nowIso(),
            }
          : molecule,
      ),
    ),
  };
}

export function moveRootMolecule(state: WorkbenchState, moleculeId: string, direction: "up" | "down"): WorkbenchState {
  const roots = state.project.molecules
    .filter((molecule) => molecule.topLevel)
    .slice()
    .sort((left, right) => left.rootOrder - right.rootOrder);
  const index = roots.findIndex((molecule) => molecule.id === moleculeId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= roots.length) {
    return state;
  }

  const reordered = [...roots];
  const [moving] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moving);
  const orderById = new Map(reordered.map((molecule, position) => [molecule.id, position + 1]));

  return updateMolecules(state, (molecules) =>
    molecules.map((molecule) =>
      molecule.topLevel
        ? {
            ...molecule,
            rootOrder: orderById.get(molecule.id) ?? molecule.rootOrder,
          }
        : molecule,
    ),
  );
}

export function moveChildMolecule(
  state: WorkbenchState,
  parentMoleculeId: string,
  childMoleculeId: string,
  direction: "up" | "down",
): WorkbenchState {
  const parentLinks = state.project.links
    .filter((link) => link.parentMoleculeId === parentMoleculeId)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const childOrder = parentLinks
    .map((link) => link.childMoleculeId)
    .filter((value, index, items) => items.indexOf(value) === index);
  const index = childOrder.findIndex((value) => value === childMoleculeId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= childOrder.length) {
    return state;
  }

  const reorderedChildren = [...childOrder];
  const [movingChild] = reorderedChildren.splice(index, 1);
  reorderedChildren.splice(targetIndex, 0, movingChild);
  const childPosition = new Map(reorderedChildren.map((value, position) => [value, position]));

  const groupedLinks = reorderedChildren.flatMap((childId) =>
    parentLinks.filter((link) => link.childMoleculeId === childId),
  );

  const updatedLinks = state.project.links.map((link) => {
    if (link.parentMoleculeId !== parentMoleculeId) {
      return link;
    }
    const nextIndex = groupedLinks.findIndex((candidate) => candidate.id === link.id);
    return {
      ...link,
      sortOrder: nextIndex >= 0 ? nextIndex + 1 : (childPosition.get(link.childMoleculeId) ?? link.sortOrder),
      updatedAt: nowIso(),
    };
  });

  return {
    ...state,
    project: touchProject(
      {
        ...state.project,
        links: updatedLinks,
        updatedAt: nowIso(),
      },
      state.project.molecules,
    ),
  };
}

export function updateDocumentation(
  state: WorkbenchState,
  moleculeId: string,
  field: keyof DocumentationRecord,
  value: DocumentationRecord[keyof DocumentationRecord],
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    documentation: {
      ...molecule.documentation,
      [field]: value,
    },
  }));
}

export function addExplanationLine(state: WorkbenchState, moleculeId: string): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    documentation: {
      ...molecule.documentation,
      explanationLines: [
        ...molecule.documentation.explanationLines,
        createExplanationLine(molecule.documentation.explanationLines.length + 1),
      ],
    },
  }));
}

export function ensureLinkedObjectReferenceOutput(
  state: WorkbenchState,
  parentMoleculeId: string,
  inputRowId: string,
): WorkbenchState {
  const parent = state.project.molecules.find((molecule) => molecule.id === parentMoleculeId);
  const inputRow = parent?.rows.find((row) => row.id === inputRowId && row.section === "INPUT");
  const linkedMoleculeId = inputRow?.linkedMoleculeId;

  if (!inputRow || !linkedMoleculeId) {
    return state;
  }

  return updateOneMolecule(state, linkedMoleculeId, (linkedMolecule) => {
    if (hasNamedReferenceOutput(linkedMolecule)) {
      return linkedMolecule;
    }

    return {
      ...linkedMolecule,
      rows: addReferenceOutputFromInputRow(linkedMolecule, inputRow),
    };
  });
}

export function ensureLinkedObjectReferenceOutputs(state: WorkbenchState): WorkbenchState {
  const incomingRowsByLinkedId = new Map<string, ReconstructionRow>();

  for (const molecule of state.project.molecules) {
    for (const row of molecule.rows) {
      if (row.section === "INPUT" && row.linkedMoleculeId && !incomingRowsByLinkedId.has(row.linkedMoleculeId)) {
        incomingRowsByLinkedId.set(row.linkedMoleculeId, row);
      }
    }
  }

  let changed = false;
  const nextMolecules = state.project.molecules.map((molecule) => {
    if (hasNamedReferenceOutput(molecule)) {
      return molecule;
    }

    const incomingRow = incomingRowsByLinkedId.get(molecule.id);
    if (!incomingRow) {
      return molecule;
    }

    changed = true;
    return {
      ...molecule,
      rows: addReferenceOutputFromInputRow(molecule, incomingRow),
      updatedAt: nowIso(),
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    project: touchProject(state.project, nextMolecules),
  };
}

export function updateExplanationLine(
  state: WorkbenchState,
  moleculeId: string,
  lineId: string,
  field: keyof MoleculeRecord["documentation"]["explanationLines"][number],
  value: string,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    documentation: {
      ...molecule.documentation,
      explanationLines: molecule.documentation.explanationLines.map((line) =>
        line.id === lineId ? { ...line, [field]: value } : line,
      ),
    },
  }));
}

export function deleteExplanationLine(state: WorkbenchState, moleculeId: string, lineId: string): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    documentation: {
      ...molecule.documentation,
      explanationLines: normalizeExplanationLines(
        molecule.documentation.explanationLines.filter((line) => line.id !== lineId),
      ),
    },
  }));
}

export function moveExplanationLine(
  state: WorkbenchState,
  moleculeId: string,
  lineId: string,
  direction: "up" | "down",
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const lines = [...molecule.documentation.explanationLines].sort((left, right) => left.order - right.order);
    const index = lines.findIndex((line) => line.id === lineId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= lines.length) {
      return molecule;
    }

    const reordered = [...lines];
    const [line] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, line);

    return {
      ...molecule,
      documentation: {
        ...molecule.documentation,
        explanationLines: normalizeExplanationLines(reordered),
      },
    };
  });
}

export function addReconstructionRow(
  state: WorkbenchState,
  moleculeId: string,
  section: ReconstructionSection,
  values?: Partial<ReconstructionRow>,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const nextOrder = molecule.rows.filter((row) => row.section === section).length + 1;
    return {
      ...molecule,
      rows: [...molecule.rows, createBlankRow(section, nextOrder, values)],
    };
  });
}

export function saveReconstructionRow(
  state: WorkbenchState,
  moleculeId: string,
  section: ReconstructionSection,
  values: Partial<ReconstructionRow>,
  rowId?: string,
): WorkbenchState {
  if (
    values.linkedMoleculeId &&
    wouldCreateDependencyCycle(state.project, moleculeId, values.linkedMoleculeId)
  ) {
    return state;
  }

  const previousLinkedMoleculeId = rowId
    ? state.project.molecules
        .find((molecule) => molecule.id === moleculeId)
        ?.rows.find((row) => row.id === rowId)?.linkedMoleculeId ?? null
    : null;
  const nextState = updateOneMolecule(state, moleculeId, (molecule) => {
    const existingRow = rowId ? molecule.rows.find((row) => row.id === rowId) : null;
    const isReferenceProductRow =
      Boolean(existingRow) &&
      existingRow?.section === "OUTPUT" &&
      existingRow.order === 1;
    const effectiveValues = isReferenceProductRow
      ? {
          ...values,
          name: molecule.referenceProductName || molecule.name,
          objectKind: "generic_object" as const,
          cas: "",
          iupac: "",
          smiles: "",
          synonyms: [],
        }
      : values;
    const originalQuantity = deriveTotalValue(effectiveValues);
    const effectiveReferenceAmount = isReferenceProductRow
      ? parseNumericValue(originalQuantity)
      : parseNumericValue(molecule.scaleReferenceAmount);
    const targetAmount = parseNumericValue(molecule.scaleTargetAmount);
    const scalingConfigured =
      effectiveReferenceAmount !== null &&
      effectiveReferenceAmount > 0 &&
      targetAmount !== null &&
      targetAmount > 0 &&
      molecule.scaleUnit.trim().length > 0;
    const factor = scalingConfigured ? targetAmount / effectiveReferenceAmount : null;
    const scaledQuantity =
      !scalingConfigured
        ? ""
        : effectiveValues.totalScaledValue ??
      (() => {
        const numeric = parseNumericValue(originalQuantity);
        return numeric === null || factor === null ? "" : formatScaledValue(numeric * factor);
      })();
    const hasExistingRow = Boolean(existingRow);

    if (!rowId || !hasExistingRow) {
      const nextOrder = molecule.rows.filter((row) => row.section === section).length + 1;
      const normalizedSynonyms = sanitizeStringList(effectiveValues.synonyms ?? []);
      return {
        ...molecule,
        rows: [
          ...molecule.rows,
          createBlankRow(section, nextOrder, {
            ...effectiveValues,
            synonyms: normalizedSynonyms,
            id: rowId ?? effectiveValues.id,
            totalValue: originalQuantity,
            totalScaledValue: scaledQuantity,
            scaledUnit: scalingConfigured
              ? effectiveValues.scaledUnit ?? effectiveValues.unit ?? molecule.scaleUnit
              : "",
          }),
        ],
      };
    }

    const nextMolecule = {
      ...molecule,
      rows: molecule.rows.map((row) =>
        row.id === rowId
          ? (() => {
              const normalizedSynonyms =
                effectiveValues.synonyms === undefined ? row.synonyms : sanitizeStringList(effectiveValues.synonyms);
              return {
                ...row,
                ...effectiveValues,
                synonyms: normalizedSynonyms,
                section,
                totalValue: originalQuantity,
                totalScaledValue: scaledQuantity,
                scaledUnit: scalingConfigured
                  ? effectiveValues.scaledUnit ?? effectiveValues.unit ?? row.scaledUnit
                  : "",
                updatedAt: nowIso(),
              };
            })()
          : row,
      ),
    };

    if (!isReferenceProductRow) {
      return nextMolecule;
    }

    const scalingWasConfigured = Boolean(
      molecule.scaleReferenceAmount.trim() && molecule.scaleTargetAmount.trim() && molecule.scaleUnit.trim(),
    );

    return {
      ...nextMolecule,
      scaleReferenceAmount: scalingWasConfigured ? originalQuantity || molecule.scaleReferenceAmount : "",
      scaleTargetAmount: scalingWasConfigured ? molecule.scaleTargetAmount : "",
      scaleUnit: scalingWasConfigured ? String(effectiveValues.unit || molecule.scaleUnit) : "",
    };
  });

  const linkedMoleculeChanged =
    Boolean(rowId && previousLinkedMoleculeId) &&
    values.linkedMoleculeId !== undefined &&
    values.linkedMoleculeId !== previousLinkedMoleculeId;

  if (!linkedMoleculeChanged || !rowId || !previousLinkedMoleculeId) {
    return nextState;
  }

  const removedLinks = nextState.project.links.filter(
    (link) =>
      link.parentMoleculeId === moleculeId &&
      link.childMoleculeId === previousLinkedMoleculeId &&
      (link.sourceRowId === rowId || link.sourceRowId === null),
  );
  const removedLinkIds = new Set(removedLinks.map((link) => link.id));
  const remainingLinks = nextState.project.links.filter((link) => !removedLinkIds.has(link.id));
  const previousChildStillLinked = remainingLinks.some(
    (link) => link.childMoleculeId === previousLinkedMoleculeId,
  );
  const molecules = nextState.project.molecules.map((molecule) => {
    if (molecule.id === moleculeId) {
      return {
        ...molecule,
        childLinkIds: molecule.childLinkIds.filter((id) => !removedLinkIds.has(id)),
      };
    }
    if (molecule.id === previousLinkedMoleculeId) {
      return {
        ...molecule,
        parentLinkIds: molecule.parentLinkIds.filter((id) => !removedLinkIds.has(id)),
        topLevel: previousChildStillLinked ? molecule.topLevel : true,
      };
    }
    return molecule;
  });

  return {
    ...nextState,
    project: touchProject(
      {
        ...nextState.project,
        links: remainingLinks,
      },
      molecules,
    ),
  };
}

export function updateReconstructionRow(
  state: WorkbenchState,
  moleculeId: string,
  rowId: string,
  field: keyof ReconstructionRow,
  value: string | null,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    rows: molecule.rows.map((row) =>
      row.id === rowId
        ? {
            ...row,
            [field]:
              field === "needsReview"
                ? value === "true"
                : field === "evidenceIds"
                  ? (value ? [value] : [])
                  : value,
            updatedAt: nowIso(),
          }
        : row,
    ),
  }));
}

export function rescaleMoleculeRows(state: WorkbenchState, moleculeId: string): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    rows: rescaleRows(molecule),
  }));
}

export function applyPasDefaults(
  state: WorkbenchState,
  moleculeId: string,
  profile: PasProfile,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const referenceAmount = parseNumericValue(molecule.scaleReferenceAmount) ?? 1;
    const defaults = PAS_PROFILE_DEFAULTS[profile];
    const utilityRows: Array<Partial<ReconstructionRow> & { name: string }> = [
      {
        name: "Electricity, medium voltage",
        totalValue: formatScaledValue(defaults.electricityKwhPerKg * referenceAmount),
        unit: "kWh",
        totalScaledValue: getScaledQuantity(molecule, defaults.electricityKwhPerKg * referenceAmount),
        scaledUnit: "kWh",
        reference: PAS_REFERENCE_LABEL,
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.electricity,
      },
      {
        name: "Heat",
        totalValue: formatScaledValue(defaults.heatMjPerKg * referenceAmount),
        unit: "MJ",
        totalScaledValue: getScaledQuantity(molecule, defaults.heatMjPerKg * referenceAmount),
        scaledUnit: "MJ",
        reference: PAS_REFERENCE_LABEL,
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.heat,
        notes: "Default PAS proxy heat dataset for industrial chemical production.",
      },
      {
        name: "Steam",
        totalValue: formatScaledValue((defaults.steamMjPerKg / STEAM_ENERGY_PER_KG_MJ) * referenceAmount),
        unit: "kg",
        totalScaledValue: getScaledQuantity(
          molecule,
          (defaults.steamMjPerKg / STEAM_ENERGY_PER_KG_MJ) * referenceAmount,
        ),
        scaledUnit: "kg",
        reference: PAS_REFERENCE_LABEL,
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.steam,
        notes: "Converted from MJ to kg steam using 2.75 MJ/kg.",
      },
    ];

    const rowsWithUtilities = upsertPasRows(molecule, "INPUT", utilityRows);
    const inputRows = rowsWithUtilities.filter((row) => row.section === "INPUT");

    const wastewaterAmountKg = inputRows.reduce((sum, row) => {
      if (!isWaterLikeRow(row)) {
        return sum;
      }
      return sum + (toMassKg(row.totalValue, row.unit) ?? 0);
    }, 0);
    const wastewaterAmountM3 = wastewaterAmountKg / WATER_KG_PER_M3;

    const hazardousAmountKg = inputRows.reduce((sum, row) => {
      if (isWaterLikeRow(row) || isPasUtilityRow(row)) {
        return sum;
      }
      return sum + (toMassKg(row.totalValue, row.unit) ?? 0);
    }, 0);

    const outputRows: Array<Partial<ReconstructionRow> & { name: string }> = [
      {
        name: "Wastewater treatment",
        totalValue: formatScaledValue(wastewaterAmountM3),
        unit: "m3",
        totalScaledValue: getScaledQuantity(molecule, wastewaterAmountM3),
        scaledUnit: "m3",
        reference: "Automatic from water inputs",
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.wastewater,
        notes: "Calculated from water input mass using 1000 kg/m3.",
      },
      {
        name: "Hazardous waste incineration",
        totalValue: formatScaledValue(hazardousAmountKg),
        unit: "kg",
        totalScaledValue: getScaledQuantity(molecule, hazardousAmountKg),
        scaledUnit: "kg",
        reference: "Automatic from non-utility mass inputs",
        ecoinventStatus: "unchecked",
        rawEcoinventStatus: "Not checked",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.hazardous,
      },
    ];

    return {
      ...molecule,
      rows: upsertPasRows(
        {
          ...molecule,
          rows: rowsWithUtilities,
        },
        "OUTPUT",
        outputRows,
      ),
    };
  });
}

export function deleteReconstructionRow(
  state: WorkbenchState,
  moleculeId: string,
  rowId: string,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const remainingRows = molecule.rows.filter((row) => row.id !== rowId);
    const remainingEvidence = molecule.evidence.filter((evidence) => evidence.rowId !== rowId);

    return {
      ...molecule,
      evidence: remainingEvidence,
      rows: [
        ...normalizeSectionRows(remainingRows.filter((row) => row.section === "INPUT")),
        ...normalizeSectionRows(remainingRows.filter((row) => row.section === "OUTPUT")),
      ],
    };
  });
}

export function moveReconstructionRow(
  state: WorkbenchState,
  moleculeId: string,
  rowId: string,
  direction: "up" | "down",
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const row = molecule.rows.find((entry) => entry.id === rowId);
    if (!row) {
      return molecule;
    }

    const sectionRows = molecule.rows
      .filter((entry) => entry.section === row.section)
      .sort((left, right) => left.order - right.order);
    const index = sectionRows.findIndex((entry) => entry.id === rowId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= sectionRows.length) {
      return molecule;
    }

    const reordered = [...sectionRows];
    const [moving] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moving);
    const normalized = normalizeSectionRows(reordered);

    return {
      ...molecule,
      rows: molecule.rows.map((entry) => {
        if (entry.section !== row.section) {
          return entry;
        }
        return normalized.find((candidate) => candidate.id === entry.id) ?? entry;
      }),
    };
  });
}

export function addEvidenceRecord(
  state: WorkbenchState,
  moleculeId: string,
  values: Partial<EvidenceRecord> & Pick<EvidenceRecord, "rowId" | "citation">,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const { rowId, citation, ...restValues } = values;
    const nextEvidence = createEvidenceRecord({
      ...restValues,
      moleculeId,
      rowId,
      citation,
    });

    return {
      ...molecule,
      evidence: [...molecule.evidence, nextEvidence],
      rows: molecule.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              evidenceIds: [...row.evidenceIds, nextEvidence.id],
            }
          : row,
      ),
    };
  });
}

export function updateEvidenceRecord(
  state: WorkbenchState,
  moleculeId: string,
  evidenceId: string,
  field: keyof EvidenceRecord,
  value: string | boolean,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    evidence: molecule.evidence.map((record) =>
      record.id === evidenceId
        ? {
            ...record,
            [field]: value,
            updatedAt: nowIso(),
          }
        : record,
    ),
  }));
}

export function deleteEvidenceRecord(
  state: WorkbenchState,
  moleculeId: string,
  evidenceId: string,
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    evidence: molecule.evidence.filter((record) => record.id !== evidenceId),
    rows: molecule.rows.map((row) => ({
      ...row,
      evidenceIds: row.evidenceIds.filter((id) => id !== evidenceId),
    })),
  }));
}

export function recordExport(
  state: WorkbenchState,
  moleculeId: string,
  exportRecord: MoleculeRecord["exports"][number],
): WorkbenchState {
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    exports: [...molecule.exports, exportRecord],
  }));
}

export function deleteMolecule(state: WorkbenchState, moleculeId: string): WorkbenchState {
  const nextState = updateMolecules(state, (molecules) =>
    molecules
      .filter((molecule) => molecule.id !== moleculeId)
      .map((molecule) => ({
        ...molecule,
        updatedAt:
          molecule.rows.some((row) => row.linkedMoleculeId === moleculeId) ? nowIso() : molecule.updatedAt,
        rows: molecule.rows.map((row) =>
          row.linkedMoleculeId === moleculeId
            ? {
                ...row,
                linkedMoleculeId: null,
                linkConfidence: null,
                needsReview: true,
              }
            : row,
        ),
      })),
  );

  return {
    ...nextState,
    selectedMoleculeId:
      nextState.selectedMoleculeId === moleculeId ? null : nextState.selectedMoleculeId,
  };
}
