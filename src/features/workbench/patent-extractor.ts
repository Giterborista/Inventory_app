import { normalizeCas, normalizeText } from "@/features/workbench/state-utils";
import type { ProjectRecord, ReconstructionSection } from "@/features/workbench/types";

export type ExtractedSuggestionRole =
  | "input"
  | "solvent"
  | "workup"
  | "output"
  | "ambiguous";

export type ExtractedSuggestionConfidence = "high" | "medium" | "low";

export type PatentExtractionSuggestion = {
  id: string;
  name: string;
  amount: string;
  unit: string;
  cas: string;
  iupac: string;
  role: ExtractedSuggestionRole;
  suggestedSection: ReconstructionSection;
  confidence: ExtractedSuggestionConfidence;
  snippet: string;
  reason: string;
  linkedMoleculeId: string | null;
};

export type PatentExtractionSummary = {
  temperatures: string[];
  durations: string[];
  yieldValue: string | null;
  purityValue: string | null;
  notes: string[];
};

export type PatentExtractionResult = {
  suggestions: PatentExtractionSuggestion[];
  summary: PatentExtractionSummary;
};

const QUANTITY_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|g|mg|μg|ug|mL|ml|L|l|mmol|mol)\s+of\s+([^;,.]+?)(?=(?:\s+(?:was|were|is|are|to|and|followed|added|dissolved|dispersed|uniformly|then)\b|[;,.]|$))/gi;
const QUANTITY_NO_OF_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kg|g|mg|μg|ug|mL|ml|L|l|mmol|mol)\s*\(([^)]*)\)\s+of\s+([^;,.]+?)(?=(?:\s+(?:was|were|is|are|to|and|followed|added|dissolved|dispersed|uniformly|then)\b|[;,.]|$))/gi;
const DILUTE_WITH_PATTERN =
  /(?:dilute(?:d)?(?:\s+the\s+volume)?\s+to\s+(\d+(?:\.\d+)?)\s*(mL|ml|L|l)\s+with\s+([^;,.]+?))(?=(?:\s+(?:to|for|and|then)\b|[;,.]|$))/gi;
const WITH_MATERIAL_PATTERN =
  /(?:with\s+(?:a\s+mixed\s+solvent\s+of\s+)?([^;,.]+?)(?=(?:\s+(?:and\s+[^;,.]+)?\s*(?:to|for|at|then|followed|was|were|is|are)\b|[;.]|$)))/gi;
const EXTRACT_WITH_PATTERN =
  /(?:extract(?:ed)?\s+with\s+([^;,.]+?)(?=(?:\s+(?:and\s+the|and\s+water|and\s+[^;,.]+|to|for|then|was|were)\b|[;.]|$)))/gi;
const PRODUCT_PATTERN =
  /(?:obtain|obtained|afford(?:ed)?|give|gave|yield(?:ed)?)\s+(?:approximately\s+)?(\d+(?:\.\d+)?)\s*(kg|g|mg|μg|ug|mL|ml|L|l|mmol|mol)?\s+of\s+([^;,.]+?)(?=(?:\s*,?\s*with\s+a?\s*yield\b|[;.]|$))/gi;
const TEMPERATURE_PATTERN = /(-?\d+(?:\.\d+)?)\s*°?\s*C\b/gi;
const TEMPERATURE_CONTEXT_PATTERN = /temperature\s+(?:was|is)\s*(-?\d+(?:\.\d+)?)(?!\s*(?:ml|l|kg|g|mg|mmol|mol))/gi;
const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|days?)/gi;
const YIELD_PATTERN = /yield(?:\s+of|\s+was|:)?\s*(\d+(?:\.\d+)?)\s*%/i;
const PURITY_PATTERN = /purity(?:\s+of|\s+was|:)?\s*(\d+(?:\.\d+)?)\s*%/i;

const KNOWN_SOLVENTS = [
  "dichloromethane",
  "methanol",
  "ethanol",
  "water",
  "toluene",
  "ethyl acetate",
  "petroleum ether",
  "acetonitrile",
  "tetrahydrofuran",
  "chloroform",
  "hexane",
  "dmf",
  "dimethylformamide",
];

const KNOWN_WORKUP_MATERIALS = [
  "saturated brine",
  "brine",
  "petroleum ether",
  "water",
  "sodium bicarbonate",
  "hydrochloric acid",
];

function makeSuggestionId(index: number) {
  return `extract-${index + 1}`;
}

function splitClauses(text: string) {
  return text
    .replaceAll(/\r/g, " ")
    .replaceAll(/\bS\d+\.\s*/g, " ")
    .split(/(?:\n+|;\s*|(?<=\.)\s+|(?<=:)\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanChemicalName(rawValue: string) {
  return rawValue
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/^(?:dried|dry)\s+/i, "")
    .replace(/^(?:white|crude|solid|reaction|intermediate)\s+/i, "")
    .replace(/\s+(?:to obtain|followed by|for|over)\b.*$/i, "")
    .replace(/[.,;]+$/g, "")
    .trim();
}

function splitMaterialList(rawValue: string) {
  return rawValue
    .split(/\s+(?:and|,)\s+/i)
    .map((item) => cleanChemicalName(item))
    .filter(Boolean);
}

function matchExistingMolecule(project: ProjectRecord, name: string, cas: string, iupac = "") {
  const normalizedCas = normalizeCas(cas);
  if (normalizedCas) {
    const casMatch = project.molecules.find((molecule) => normalizeCas(molecule.cas) === normalizedCas);
    if (casMatch) {
      return casMatch.id;
    }
  }

  const normalizedName = normalizeText(name);
  const normalizedIupac = normalizeText(iupac);
  const exactMatches = project.molecules.filter((molecule) => {
    const tokens = [molecule.name, molecule.iupac, ...molecule.synonyms, ...molecule.ecoinventAliases].map((item) =>
      normalizeText(item),
    );
    return tokens.includes(normalizedName) || (normalizedIupac && tokens.includes(normalizedIupac));
  });
  if (exactMatches.length === 1) {
    return exactMatches[0]?.id ?? null;
  }

  if (normalizedName.length >= 5) {
    const fuzzyMatches = project.molecules.filter((molecule) => {
      const haystack = [molecule.name, molecule.iupac, ...molecule.synonyms, ...molecule.ecoinventAliases]
        .map((item) => normalizeText(item))
        .join(" ");
      return haystack.includes(normalizedName);
    });
    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0]?.id ?? null;
    }
  }

  return null;
}

function inferRole(clause: string, name: string): {
  role: ExtractedSuggestionRole;
  suggestedSection: ReconstructionSection;
  confidence: ExtractedSuggestionConfidence;
  reason: string;
} {
  const normalizedClause = normalizeText(clause);
  const normalizedName = normalizeText(name);

  if (normalizedClause.includes("washed with") || normalizedClause.includes("quenched")) {
    return {
      role: "workup",
      suggestedSection: "INPUT",
      confidence: "medium",
      reason: "Detected in a wash or quench clause",
    };
  }

  if (
    normalizedClause.includes("extracted with") ||
    normalizedClause.includes("recrystallized") ||
    normalizedClause.includes("mixed solvent")
  ) {
    return {
      role: "workup",
      suggestedSection: "INPUT",
      confidence: "medium",
      reason: "Detected in extraction, recrystallization, or isolation context",
    };
  }

  if (KNOWN_WORKUP_MATERIALS.some((item) => normalizeText(item) === normalizedName)) {
    return {
      role: "workup",
      suggestedSection: "INPUT",
      confidence: "medium",
      reason: "Known work-up or isolation material",
    };
  }

  if (
    KNOWN_SOLVENTS.some((item) => normalizeText(item) === normalizedName) ||
    normalizedClause.includes(`in ${normalizedName}`) ||
    normalizedClause.includes(`with ${normalizedName}`)
  ) {
    return {
      role: "solvent",
      suggestedSection: "INPUT",
      confidence: "medium",
      reason: "Detected in a solvent or dispersion context",
    };
  }

  if (
    normalizedClause.includes("product was obtained") ||
    normalizedClause.includes("afforded") ||
    normalizedClause.includes("obtain") ||
    normalizedClause.includes("obtained")
  ) {
    return {
      role: "output",
      suggestedSection: "OUTPUT",
      confidence: "high",
      reason: "Detected in a product or isolated-material clause",
    };
  }

  if (normalizedName.includes("base") || normalizedName.includes("product")) {
    return {
      role: "ambiguous",
      suggestedSection: "INPUT",
      confidence: "low",
      reason: "Name is chemically ambiguous and needs manual review",
    };
  }

  return {
    role: "input",
    suggestedSection: "INPUT",
    confidence: "high",
    reason: "Explicit mass/amount next to a reagent-like name",
  };
}

function dedupeSuggestions(suggestions: PatentExtractionSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = [
      normalizeText(suggestion.name),
      suggestion.amount,
      suggestion.unit.toLowerCase(),
      suggestion.role,
      normalizeText(suggestion.snippet),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractQuantifiedSuggestions(text: string, project: ProjectRecord) {
  const clauses = splitClauses(text);
  const suggestions: PatentExtractionSuggestion[] = [];

  clauses.forEach((clause) => {
    let match: RegExpExecArray | null;
    const localPattern = new RegExp(QUANTITY_PATTERN);
    while ((match = localPattern.exec(clause)) !== null) {
      const amount = match[1] ?? "";
      const unit = match[2] ?? "";
      const rawName = match[3] ?? "";
      const name = cleanChemicalName(rawName);
      if (!name) {
        continue;
      }

      const roleMeta = inferRole(clause, name);
      suggestions.push({
        id: makeSuggestionId(suggestions.length),
        name,
        amount,
        unit,
        cas: "",
        iupac: "",
        role: roleMeta.role,
        suggestedSection: roleMeta.suggestedSection,
        confidence: roleMeta.confidence,
        snippet: clause,
        reason: roleMeta.reason,
        linkedMoleculeId: matchExistingMolecule(project, name, "", ""),
      });
    }

    const parentheticalPattern = new RegExp(QUANTITY_NO_OF_PATTERN);
    while ((match = parentheticalPattern.exec(clause)) !== null) {
      const amount = match[1] ?? "";
      const unit = match[2] ?? "";
      const rawName = match[4] ?? "";
      const name = cleanChemicalName(rawName);
      if (!name) {
        continue;
      }

      const roleMeta = inferRole(clause, name);
      suggestions.push({
        id: makeSuggestionId(suggestions.length),
        name,
        amount,
        unit,
        cas: "",
        iupac: "",
        role: roleMeta.role,
        suggestedSection: roleMeta.suggestedSection,
        confidence: roleMeta.confidence,
        snippet: clause,
        reason: roleMeta.reason,
        linkedMoleculeId: matchExistingMolecule(project, name, "", ""),
      });
    }
  });

  return suggestions;
}

function extractNamedClauseSuggestion(
  clause: string,
  project: ProjectRecord,
  name: string,
  role: ExtractedSuggestionRole,
  reason: string,
) {
  return {
    id: makeSuggestionId(0),
    name,
    amount: "",
    unit: "",
    cas: "",
    iupac: "",
    role,
    suggestedSection: "INPUT" as const,
    confidence: "medium" as const,
    snippet: clause,
    reason,
    linkedMoleculeId: matchExistingMolecule(project, name, "", ""),
  };
}

function extractContextSuggestions(text: string, project: ProjectRecord) {
  const clauses = splitClauses(text);
  const suggestions: PatentExtractionSuggestion[] = [];

  clauses.forEach((clause) => {
    const normalizedClause = normalizeText(clause);

    for (const solvent of KNOWN_SOLVENTS) {
      const normalizedSolvent = normalizeText(solvent);
      if (
        normalizedClause.includes(normalizedSolvent) &&
        (normalizedClause.includes("dissolved in") ||
          normalizedClause.includes("dispersed in") ||
          normalizedClause.includes("in " + normalizedSolvent))
      ) {
        suggestions.push(
          extractNamedClauseSuggestion(clause, project, solvent, "solvent", "Known solvent detected from context"),
        );
      }
    }

    for (const item of KNOWN_WORKUP_MATERIALS) {
      const normalizedItem = normalizeText(item);
      if (
        normalizedClause.includes(normalizedItem) &&
        (normalizedClause.includes("washed with") ||
          normalizedClause.includes("quenched") ||
          normalizedClause.includes("added to induce crystallization"))
      ) {
        suggestions.push(
          extractNamedClauseSuggestion(clause, project, item, "workup", "Known work-up material detected from context"),
        );
      }
    }

    let diluteMatch: RegExpExecArray | null;
    const dilutePattern = new RegExp(DILUTE_WITH_PATTERN);
    while ((diluteMatch = dilutePattern.exec(clause)) !== null) {
      const solvent = cleanChemicalName(diluteMatch[3] ?? "");
      if (!solvent) {
        continue;
      }
      const roleMeta = inferRole(clause, solvent);
      suggestions.push({
        id: makeSuggestionId(suggestions.length),
        name: solvent,
        amount: "",
        unit: "",
        cas: "",
        iupac: "",
        role: roleMeta.role,
        suggestedSection: roleMeta.suggestedSection,
        confidence: "medium",
        snippet: clause,
        reason: "Detected as solvent in a dilution clause",
        linkedMoleculeId: matchExistingMolecule(project, solvent, "", ""),
      });
    }

    let extractMatch: RegExpExecArray | null;
    const extractPattern = new RegExp(EXTRACT_WITH_PATTERN);
    while ((extractMatch = extractPattern.exec(clause)) !== null) {
      for (const material of splitMaterialList(extractMatch[1] ?? "")) {
        suggestions.push({
          id: makeSuggestionId(suggestions.length),
          name: material,
          amount: "",
          unit: "",
          cas: "",
          iupac: "",
          role: "workup",
          suggestedSection: "INPUT",
          confidence: "medium",
          snippet: clause,
          reason: "Detected in an extraction clause",
          linkedMoleculeId: matchExistingMolecule(project, material, "", ""),
        });
      }
    }

    let withMatch: RegExpExecArray | null;
    const withPattern = new RegExp(WITH_MATERIAL_PATTERN);
    while ((withMatch = withPattern.exec(clause)) !== null) {
      const materials = splitMaterialList(withMatch[1] ?? "");
      for (const material of materials) {
        const normalizedMaterial = normalizeText(material);
        if (!KNOWN_SOLVENTS.some((item) => normalizeText(item) === normalizedMaterial)) {
          continue;
        }
        suggestions.push({
          id: makeSuggestionId(suggestions.length),
          name: material,
          amount: "",
          unit: "",
          cas: "",
          iupac: "",
          role: normalizedClause.includes("recrystallized") || normalizedClause.includes("mixed solvent") ? "workup" : "solvent",
          suggestedSection: "INPUT",
          confidence: "medium",
          snippet: clause,
          reason: normalizedClause.includes("recrystallized") || normalizedClause.includes("mixed solvent")
            ? "Detected as recrystallization solvent"
            : "Detected from solvent context",
          linkedMoleculeId: matchExistingMolecule(project, material, "", ""),
        });
      }
    }
  });

  return suggestions;
}

function extractProductSuggestions(text: string, project: ProjectRecord) {
  const clauses = splitClauses(text);
  const suggestions: PatentExtractionSuggestion[] = [];

  clauses.forEach((clause) => {
    let match: RegExpExecArray | null;
    const localPattern = new RegExp(PRODUCT_PATTERN);
    while ((match = localPattern.exec(clause)) !== null) {
      const amount = match[1] ?? "";
      const unit = match[2] ?? "";
      const rawName = match[3] ?? "";
      const name = cleanChemicalName(rawName);
      if (!name) {
        continue;
      }

      suggestions.push({
        id: makeSuggestionId(suggestions.length),
        name,
        amount,
        unit,
        cas: "",
        iupac: "",
        role: "output",
        suggestedSection: "OUTPUT",
        confidence: "high",
        snippet: clause,
        reason: "Detected in an isolated product clause",
        linkedMoleculeId: matchExistingMolecule(project, name, "", ""),
      });
    }
  });

  return suggestions;
}

function extractSummary(text: string): PatentExtractionSummary {
  const temperatures = [...text.matchAll(TEMPERATURE_PATTERN)].map((match) => `${match[1]}°C`);
  for (const match of text.matchAll(TEMPERATURE_CONTEXT_PATTERN)) {
    temperatures.push(`${match[1]}°C`);
  }
  if (/room temperature/i.test(text)) {
    temperatures.push("room temperature");
  }

  const durations = [...text.matchAll(DURATION_PATTERN)].map((match) => `${match[1]} ${match[2]}`);
  const yieldValue = text.match(YIELD_PATTERN)?.[1] ? `${text.match(YIELD_PATTERN)?.[1]}%` : null;
  const purityValue = text.match(PURITY_PATTERN)?.[1] ? `${text.match(PURITY_PATTERN)?.[1]}%` : null;
  const notes: string[] = [];

  if (/product was obtained/i.test(text) && !/obtained\s+([A-Za-z0-9-]+)/i.test(text)) {
    notes.push("Product was obtained, but no explicit product name was detected.");
  }
  if (/monitored by tlc/i.test(text)) {
    notes.push("Reaction completion was monitored by TLC.");
  }

  return {
    temperatures: [...new Set(temperatures)],
    durations: [...new Set(durations)],
    yieldValue,
    purityValue,
    notes,
  };
}

export function buildExtractionDocumentationSummary(
  result: PatentExtractionResult,
  sourceLabel: string,
) {
  const lines = [
    sourceLabel ? `Source: ${sourceLabel}` : "Source: Pasted patent text",
    result.summary.temperatures.length > 0 ? `Temperatures: ${result.summary.temperatures.join(", ")}` : "",
    result.summary.durations.length > 0 ? `Durations: ${result.summary.durations.join(", ")}` : "",
    result.summary.yieldValue ? `Yield: ${result.summary.yieldValue}` : "",
    result.summary.purityValue ? `Purity: ${result.summary.purityValue}` : "",
    ...result.summary.notes,
  ].filter(Boolean);

  return lines.join("\n");
}

export function extractPatentDraft(text: string, project: ProjectRecord): PatentExtractionResult {
  const quantified = extractQuantifiedSuggestions(text, project);
  const products = extractProductSuggestions(text, project).map((suggestion, index) => ({
    ...suggestion,
    id: makeSuggestionId(quantified.length + index),
  }));
  const contextual = extractContextSuggestions(text, project).map((suggestion, index) => ({
    ...suggestion,
    id: makeSuggestionId(quantified.length + products.length + index),
  }));

  return {
    suggestions: dedupeSuggestions([...quantified, ...products, ...contextual]),
    summary: extractSummary(text),
  };
}
