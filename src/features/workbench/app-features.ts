export type AppEdition = "basic" | "evidence";

const configuredEdition = process.env.NEXT_PUBLIC_APP_EDITION?.trim().toLowerCase();

export const appEdition: AppEdition = configuredEdition === "evidence" ? "evidence" : "basic";

export const appFeatures = {
  evidenceLedger: appEdition === "evidence",
} as const;

export const appBrandBadgeColorClass = appEdition === "evidence" ? "bg-[#247a65]" : "bg-accent";
