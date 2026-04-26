export type ResolutionStatus =
  | "present"
  | "missing"
  | "proxy_created"
  | "in_progress"
  | "unchecked";

export type ReviewStatus = "draft" | "in_progress" | "ready" | "reviewed";

export type ReconstructionSection = "INPUT" | "OUTPUT";

export type LinkMethod = "folder" | "cas" | "name" | "heuristic" | "manual" | "placeholder";

export type LinkConfidence = "high" | "medium" | "low";

export type EvidenceType =
  | "patent"
  | "dataset"
  | "internal_note"
  | "supplier"
  | "publication"
  | "reference";

export type EvidenceStrength = "strong" | "moderate" | "weak";

export type ExportFormat = "html" | "pdf";

export type ImportWarningLevel = "info" | "warning";

export type EcoinventMatchBasis = "cas" | "name" | "synonym" | "iupac" | "manual";

export type PubChemMatch = {
  cid: number;
  query: string;
  queryType: "auto";
  matchedTerm: string;
  matchedBy: string[];
  searchScore: number;
  title: string;
  iupacName: string;
  molecularFormula: string;
  molecularWeight: string;
  canonicalSmiles: string;
  inchi: string;
  inchikey: string;
  synonyms: string[];
  matchedCas: string;
  matchedAt: string;
  pubchemUrl: string;
};

export type ExplanationLine = {
  id: string;
  order: number;
  step: string;
  parameterDecision: string;
  ruleCalculation: string;
  result: string;
  explanation: string;
};

export type DocumentationRecord = {
  referenceAndScope: string;
  functionalUnit: string;
  pasAssumptions: string;
  balancedEquation: string;
  calculationNotes: string;
  explanationLines: ExplanationLine[];
};

export type EvidenceRecord = {
  id: string;
  moleculeId: string;
  rowId: string | null;
  type: EvidenceType;
  citation: string;
  identifier: string;
  locator: string;
  url: string;
  summary: string;
  strength: EvidenceStrength;
  isPrimary: boolean;
  sourceWorkbook: string;
  sourceSheet: string;
  sourceRowNumber: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ReconstructionRow = {
  id: string;
  section: ReconstructionSection;
  order: number;
  name: string;
  synonyms: string[];
  ro: string;
  reactionValue: string;
  cleaningValue: string;
  totalValue: string;
  unit: string;
  totalScaledValue: string;
  scaledUnit: string;
  description: string;
  reference: string;
  iupac: string;
  cas: string;
  smiles: string;
  ecoinventStatus: ResolutionStatus;
  rawEcoinventStatus: string;
  ecoinventName: string;
  notes: string;
  relevant: string;
  formula: string;
  pubchemMatch?: PubChemMatch | null;
  linkedMoleculeId: string | null;
  evidenceIds: string[];
  sourceWorkbook: string;
  sourceSheet: string;
  sourceRowNumber: number | null;
  linkConfidence: LinkConfidence | null;
  needsReview: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExportSnapshot = {
  id: string;
  version: number;
  exportedAt: string;
  format: ExportFormat;
  fileName: string;
};

export type MoleculeLinkRecord = {
  id: string;
  parentMoleculeId: string;
  childMoleculeId: string;
  sourceRowId: string | null;
  linkMethod: LinkMethod;
  confidence: LinkConfidence;
  needsReview: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ImportWarning = {
  id: string;
  level: ImportWarningLevel;
  message: string;
  workbookPath: string;
};

export type ImportSession = {
  id: string;
  createdAt: string;
  sourceLabel: string;
  warnings: ImportWarning[];
  ignoredVariants: string[];
};

export type EcoinventCheckRecord = {
  searchQuery: string;
  matchedBy: EcoinventMatchBasis;
  version: string;
  systemModel: string;
  datasetName: string;
  datasetUrl: string;
  decisionNote: string;
  checkedAt: string;
};

export type MoleculeRecord = {
  id: string;
  name: string;
  cas: string;
  iupac: string;
  smiles: string;
  synonyms: string[];
  ecoinventAliases: string[];
  notes: string;
  ecoinventStatus: ResolutionStatus;
  rawEcoinventStatus: string;
  ecoinventCheck: EcoinventCheckRecord | null;
  reviewStatus: ReviewStatus;
  placeholder: boolean;
  needsReview: boolean;
  topLevel: boolean;
  rootOrder: number;
  scaleReferenceAmount: string;
  scaleTargetAmount: string;
  scaleUnit: string;
  sourceWorkbook: string;
  sourceSheet: string;
  importSessionId: string;
  pubchemMatch?: PubChemMatch | null;
  rows: ReconstructionRow[];
  documentation: DocumentationRecord;
  evidence: EvidenceRecord[];
  exports: ExportSnapshot[];
  parentLinkIds: string[];
  childLinkIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  molecules: MoleculeRecord[];
  links: MoleculeLinkRecord[];
  importSessions: ImportSession[];
  createdAt: string;
  updatedAt: string;
};

export type WorkbenchState = {
  project: ProjectRecord;
  selectedMoleculeId: string | null;
};

export type MoleculeDraft = {
  name: string;
  cas: string;
  iupac: string;
  smiles: string;
  synonyms: string;
  ecoinventAliases: string;
  notes: string;
  ecoinventStatus: ResolutionStatus;
  topLevel: boolean;
  parentMoleculeId: string;
  pubchemMatch?: PubChemMatch | null;
  openAfterSave?: boolean;
};

export type ImportFileEntry = {
  relativePath: string;
  fileName: string;
  arrayBuffer: ArrayBuffer;
};

export type DemoImportEntry = {
  relativePath: string;
  url: string;
};

export type DemoImportManifest = {
  projectName: string;
  sourceLabel: string;
  directories: string[];
  files: DemoImportEntry[];
};
