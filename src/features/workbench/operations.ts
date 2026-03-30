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
  | "name"
  | "cas"
  | "iupac"
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
  const factor =
    (parseNumericValue(molecule.scaleTargetAmount) ?? 1) /
    Math.max(parseNumericValue(molecule.scaleReferenceAmount) ?? 1, Number.EPSILON);
  const numeric = parseNumericValue(originalQuantity);
  return numeric === null ? "" : formatScaledValue(numeric * factor);
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

  return createBlankRow("INPUT", nextOrder, {
    name: childMolecule.name,
    totalValue: rowValues.totalValue,
    unit: rowValues.unit || "kg",
    totalScaledValue: getScaledQuantity(parentMolecule, rowValues.totalValue),
    scaledUnit: rowValues.unit || parentMolecule.scaleUnit,
    cas: childMolecule.cas,
    iupac: childMolecule.iupac,
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
  },
): WorkbenchState {
  const importSessionId = state.project.importSessions.at(-1)?.id ?? "manual";
  const newMolecule = createMoleculeFromDraft(draft, importSessionId);
  let nextState = updateMolecules(state, (molecules) => {
    const maxRootOrder = molecules.reduce((max, molecule) => Math.max(max, molecule.rootOrder || 0), 0);
    return [
      ...molecules,
      {
        ...newMolecule,
        rootOrder: draft.topLevel ? maxRootOrder + 1 : 0,
      },
    ];
  });

  if (options?.parentMoleculeId && options?.sourceRowId) {
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
  }

  if (draft.parentMoleculeId && !options?.sourceRowId) {
    nextState = addManualParentLink(nextState, newMolecule.id, draft.parentMoleculeId);
  }

  if (options?.childMoleculeId) {
    nextState = addManualParentLink(nextState, options.childMoleculeId, newMolecule.id);
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
  return updateOneMolecule(state, moleculeId, (molecule) => ({
    ...molecule,
    [field]: value,
  }));
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
  if (moleculeId === parentMoleculeId) {
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
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const factor =
      (parseNumericValue(molecule.scaleTargetAmount) ?? 1) /
      Math.max(parseNumericValue(molecule.scaleReferenceAmount) ?? 1, Number.EPSILON);
    const originalQuantity = deriveTotalValue(values);
    const scaledQuantity =
      values.totalScaledValue ??
      (() => {
        const numeric = parseNumericValue(originalQuantity);
        return numeric === null ? "" : formatScaledValue(numeric * factor);
      })();

    const hasExistingRow = rowId ? molecule.rows.some((row) => row.id === rowId) : false;

    if (!rowId || !hasExistingRow) {
      const nextOrder = molecule.rows.filter((row) => row.section === section).length + 1;
      return {
        ...molecule,
        rows: [
          ...molecule.rows,
          createBlankRow(section, nextOrder, {
            ...values,
            id: rowId ?? values.id,
            totalValue: originalQuantity,
            totalScaledValue: scaledQuantity,
            scaledUnit: values.scaledUnit ?? values.unit ?? molecule.scaleUnit,
          }),
        ],
      };
    }

    return {
      ...molecule,
      rows: molecule.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...values,
              section,
              totalValue: originalQuantity,
              totalScaledValue: scaledQuantity,
              scaledUnit: values.scaledUnit ?? values.unit ?? row.scaledUnit,
              updatedAt: nowIso(),
            }
          : row,
      ),
    };
  });
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
  return updateOneMolecule(state, moleculeId, (molecule) => {
    const referenceAmount = parseNumericValue(molecule.scaleReferenceAmount) ?? 1;
    const targetAmount = parseNumericValue(molecule.scaleTargetAmount) ?? 1;
    const factor = referenceAmount === 0 ? 1 : targetAmount / referenceAmount;

    return {
      ...molecule,
      rows: molecule.rows.map((row) => {
        const numeric = parseNumericValue(row.totalValue);
        return {
          ...row,
          totalScaledValue: numeric === null ? row.totalScaledValue : formatScaledValue(numeric * factor),
          scaledUnit: row.scaledUnit || row.unit || molecule.scaleUnit,
          updatedAt: nowIso(),
        };
      }),
    };
  });
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
        ecoinventStatus: "present",
        rawEcoinventStatus: "Y",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.electricity,
      },
      {
        name: "Heat",
        totalValue: formatScaledValue(defaults.heatMjPerKg * referenceAmount),
        unit: "MJ",
        totalScaledValue: getScaledQuantity(molecule, defaults.heatMjPerKg * referenceAmount),
        scaledUnit: "MJ",
        reference: PAS_REFERENCE_LABEL,
        ecoinventStatus: "present",
        rawEcoinventStatus: "Y",
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
        ecoinventStatus: "present",
        rawEcoinventStatus: "Y",
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

    const hazardousAmountKg = inputRows.reduce((sum, row) => {
      if (isWaterLikeRow(row) || isPasUtilityRow(row)) {
        return sum;
      }
      return sum + (toMassKg(row.totalValue, row.unit) ?? 0);
    }, 0);

    const outputRows: Array<Partial<ReconstructionRow> & { name: string }> = [
      {
        name: "Wastewater treatment",
        totalValue: formatScaledValue(wastewaterAmountKg),
        unit: "kg",
        totalScaledValue: getScaledQuantity(molecule, wastewaterAmountKg),
        scaledUnit: "kg",
        reference: "Automatic from water inputs",
        ecoinventStatus: "present",
        rawEcoinventStatus: "Y",
        ecoinventName: PAS_DEFAULT_ECOINVENT_NAMES.wastewater,
      },
      {
        name: "Hazardous waste incineration",
        totalValue: formatScaledValue(hazardousAmountKg),
        unit: "kg",
        totalScaledValue: getScaledQuantity(molecule, hazardousAmountKg),
        scaledUnit: "kg",
        reference: "Automatic from non-utility mass inputs",
        ecoinventStatus: "present",
        rawEcoinventStatus: "Y",
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
