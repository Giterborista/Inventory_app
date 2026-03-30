import type {
  EvidenceStrength,
  EvidenceType,
  LinkConfidence,
  ResolutionStatus,
  ReviewStatus,
} from "@/features/workbench/types";

export const resolutionLabels: Record<ResolutionStatus, string> = {
  present: "Present in ecoinvent",
  missing: "Missing from ecoinvent",
  proxy_created: "Proxy created",
  in_progress: "In progress",
  unchecked: "In progress",
};

export const visibleResolutionOptions: ResolutionStatus[] = [
  "present",
  "missing",
  "proxy_created",
  "in_progress",
];

export const reviewLabels: Record<ReviewStatus, string> = {
  draft: "Draft",
  in_progress: "In progress",
  ready: "Ready",
  reviewed: "Reviewed",
};

export const evidenceTypeLabels: Record<EvidenceType, string> = {
  patent: "Patent",
  dataset: "Dataset",
  internal_note: "Internal note",
  supplier: "Supplier",
  publication: "Publication",
  reference: "Reference",
};

export const evidenceStrengthLabels: Record<EvidenceStrength, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
};

export function resolutionTone(status: ResolutionStatus) {
  if (status === "present" || status === "proxy_created") {
    return "accent";
  }
  if (status === "in_progress" || status === "unchecked") {
    return "warning";
  }
  if (status === "missing") {
    return "alert";
  }

  return "ink";
}

export function reviewTone(status: ReviewStatus) {
  if (status === "ready" || status === "reviewed") {
    return "accent";
  }
  if (status === "draft") {
    return "alert";
  }
  return "ink";
}

export function confidenceTone(confidence: LinkConfidence | null) {
  if (confidence === "high") {
    return "accent";
  }
  if (confidence === "medium") {
    return "ink";
  }
  return "alert";
}
