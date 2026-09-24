import type {
  EvidenceLedgerClass,
  EvidenceLedgerRecord,
  EvidenceLedgerScale,
} from "@/features/workbench/types";

export const evidenceClassInfo: Record<Exclude<EvidenceLedgerClass, "">, { label: string; tier: string }> = {
  L: { label: "Dedicated LCA study", tier: "strong" },
  D: { label: "Direct industrial data", tier: "strong" },
  P: { label: "Patent", tier: "strong, gated" },
  W: { label: "Process paper", tier: "moderate" },
  A: { label: "Academic paper, primary source", tier: "moderate" },
  K: { label: "Known synthesis, secondary source", tier: "moderate" },
  T: { label: "Stoichiometric data only", tier: "weak" },
  E: { label: "Analogy / expert estimate", tier: "weak, last resort" },
};

export const evidenceScaleInfo: Record<Exclude<EvidenceLedgerScale, "">, string> = {
  GEN: "Scale unspecified",
  LAB: "Laboratory scale",
  PIL: "Pilot scale",
  IND: "Industrial scale",
  "IND+": "Industrial scale, market-leading producer",
};

export const scaledEvidenceClasses = new Set<EvidenceLedgerClass>(["L", "D", "P", "W", "A", "K"]);

export const evidenceGateInfo: Partial<Record<EvidenceLedgerClass, { letter: string; question: string }>> = {
  L: { letter: "G", question: "Is the inventory grounded in direct or primary industrial data, rather than generic background data?" },
  D: { letter: "V", question: "Has the data been verified or audited by a third party?" },
  W: { letter: "M", question: "Is it based on a real pilot or demonstration operation, rather than simulation only?" },
  A: { letter: "I", question: "Was the product isolated and characterised with a real experimental yield?" },
  K: { letter: "C", question: "Can it be traced to a citable primary reference?" },
  T: { letter: "B", question: "Does the mass balance close?" },
  E: { letter: "X", question: "Is the analogue structurally or mechanistically close?" },
};

export function createEmptyEvidenceLedger(): EvidenceLedgerRecord {
  return {
    code: "",
    cls: "",
    scale: "",
    gate: null,
    year: "",
    q: false,
    f: false,
    s: false,
    c: false,
    role: "",
    outcome: "PRIM",
    exclusionReason: "",
    route: "",
    reference: "",
  };
}

export function validateEvidenceLedger(entry: EvidenceLedgerRecord): string[] {
  const errors: string[] = [];
  if (!entry.cls) errors.push("Select an evidence class.");
  if (entry.scale && !scaledEvidenceClasses.has(entry.cls)) errors.push(`Class ${entry.cls} does not use a scale.`);
  if (entry.cls === "P") {
    if (!/^\d{4}$/.test(entry.year)) errors.push("A patent needs a four-digit publication year.");
    if (entry.gate !== null) errors.push("Patents use the year and QFSC block instead of a generic gate.");
  } else if (entry.year) {
    errors.push("Only patents use the year and QFSC block.");
  }
  if (entry.role && !/^(?:1|N\d+)$/.test(entry.role)) errors.push("Role must be 1 or N followed by a number.");
  if (entry.outcome === "EXCL" && !entry.exclusionReason.trim()) errors.push("Explain why the evidence was excluded.");
  if (entry.exclusionReason.includes(")")) errors.push("The exclusion reason cannot contain a closing parenthesis.");
  if (entry.route && !/^(?:BASE|SENS\d+)$/.test(entry.route)) errors.push("Route must be BASE or SENS followed by a number.");
  if (entry.reference.includes("@")) errors.push("The source identifier cannot contain @.");
  return errors;
}

export function encodeEvidenceLedger(entry: EvidenceLedgerRecord): string {
  if (validateEvidenceLedger(entry).length > 0 || !entry.cls) return "";
  const parts: string[] = [entry.cls];
  if (entry.scale) parts.push(entry.scale);
  if (entry.cls !== "P" && entry.gate !== null) {
    parts.push(entry.gate ? evidenceGateInfo[entry.cls]?.letter ?? "" : "0");
  }
  if (entry.cls === "P") {
    parts.push(entry.year);
    parts.push(`${entry.q ? "Q" : "0"}${entry.f ? "F" : "0"}${entry.s ? "S" : "0"}${entry.c ? "C" : "0"}`);
  }
  if (entry.role) parts.push(entry.role);
  parts.push(entry.outcome === "EXCL" ? `EXCL(${entry.exclusionReason.trim()})` : entry.outcome);
  if (entry.route) parts.push(entry.route);
  const body = parts.filter(Boolean).join("-");
  return entry.reference.trim() ? `${body}@${entry.reference.trim()}` : body;
}

export function finalizeEvidenceLedger(entry: EvidenceLedgerRecord): EvidenceLedgerRecord {
  const normalized: EvidenceLedgerRecord = {
    ...entry,
    scale: scaledEvidenceClasses.has(entry.cls) ? entry.scale : "",
    gate: entry.cls === "P" ? null : entry.gate,
    year: entry.cls === "P" ? entry.year.trim() : "",
    q: entry.cls === "P" && entry.q,
    f: entry.cls === "P" && entry.f,
    s: entry.cls === "P" && entry.s,
    c: entry.cls === "P" && entry.c,
    role: entry.role.trim(),
    exclusionReason: entry.outcome === "EXCL" ? entry.exclusionReason.trim() : "",
    route: entry.route.trim().toUpperCase(),
    reference: entry.reference.trim(),
  };
  return { ...normalized, code: encodeEvidenceLedger(normalized) };
}

export function describeEvidenceLedger(entry: EvidenceLedgerRecord): string {
  if (!entry.cls) return "";
  const info = evidenceClassInfo[entry.cls];
  const details = [`${entry.cls} - ${info.label} (${info.tier})`];
  if (entry.scale) details.push(evidenceScaleInfo[entry.scale].toLowerCase());
  if (entry.gate !== null && entry.cls !== "P") details.push(entry.gate ? "quality gate passed" : "quality gate failed or unverified");
  if (entry.cls === "P" && entry.year) details.push(`published ${entry.year}`);
  if (entry.outcome === "PRIM") details.push("accepted as primary evidence");
  if (entry.outcome === "PROXY") details.push("used as a transparent proxy");
  if (entry.outcome === "EXCL") details.push(`excluded: ${entry.exclusionReason}`);
  if (entry.reference) details.push(`source: ${entry.reference}`);
  return details.join(" · ");
}
