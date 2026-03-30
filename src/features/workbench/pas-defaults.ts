export type PasProfile = "simple_organic" | "other_chemical";

export const PAS_REFERENCE_LABEL = "PAS 2090, Table 2 - Modelling chemical proxies";
export const STEAM_ENERGY_PER_KG_MJ = 2.75;

export const PAS_PROFILE_OPTIONS: Array<{
  value: PasProfile;
  label: string;
  summary: string;
}> = [
  {
    value: "simple_organic",
    label: "Simple organic",
    summary: "0.62 kWh electricity, 2.77 MJ heat, 0.36 MJ steam per kg output",
  },
  {
    value: "other_chemical",
    label: "Other chemical",
    summary: "65 kWh electricity, 212 MJ heat, 13 MJ steam per kg output",
  },
];

export const PAS_PROFILE_DEFAULTS: Record<
  PasProfile,
  {
    electricityKwhPerKg: number;
    heatMjPerKg: number;
    steamMjPerKg: number;
  }
> = {
  simple_organic: {
    electricityKwhPerKg: 0.62,
    heatMjPerKg: 2.77,
    steamMjPerKg: 0.36,
  },
  other_chemical: {
    electricityKwhPerKg: 65,
    heatMjPerKg: 212,
    steamMjPerKg: 13,
  },
};

export const PAS_DEFAULT_ECOINVENT_NAMES = {
  electricity: "Electricity, medium voltage {CN}| market for | Cut-off, U",
  heat:
    "Heat, district or industrial, other than natural gas {CN}| treatment of coal gas, in power plant | Cut-off, U",
  steam: "Steam, in chemical industry {RoW}| steam production, in chemical industry | Cut-off, U",
  wastewater:
    "Wastewater, average {RoW}| treatment of wastewater, average, wastewater treatment | Cut-off, U",
  hazardous:
    "Hazardous waste, for incineration {RoW}| treatment of hazardous waste, hazardous waste incineration | Cut-off, U",
} as const;
