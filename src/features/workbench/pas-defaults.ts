export type PasProfile = "simple_organic" | "other_chemical";

export const PAS_REFERENCE_LABEL = "PAS 2090, Table 2 - Modelling chemical proxies";

export const PAS_PROFILE_OPTIONS: Array<{
  value: PasProfile;
  label: string;
  summary: string;
}> = [
  {
    value: "simple_organic",
    label: "Simple organic chemical",
    summary: "0.62 kWh electricity, 2.77 MJ heat, 0.36 MJ steam per kg output",
  },
  {
    value: "other_chemical",
    label: "Any other chemical",
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

export const PAS_DEFAULT_ECOINVENT_DATASETS = {
  electricity: {
    exactName: "market group for electricity, medium voltage {RER} | electricity, medium voltage | Cutoff, U",
    datasetUuid: "5f066c54-bf67-3dc2-9304-7c8b839e8050",
    geography: "RER",
    referenceProduct: "electricity, medium voltage",
    unit: "kWh",
  },
  heat: {
    exactName: "market for heat, district or industrial, natural gas {RER w/o CH} | heat, district or industrial, natural gas | Cutoff, U",
    datasetUuid: "a05a3b74-84ea-3541-9c0c-84ccb236e5b5",
    geography: "RER w/o CH",
    referenceProduct: "heat, district or industrial, natural gas",
    unit: "MJ",
  },
  steam: {
    exactName: "market for heat, from steam, in chemical industry {RER} | heat, from steam, in chemical industry | Cutoff, U",
    datasetUuid: "27f5cf08-da55-339a-bd75-035dadb0cd86",
    geography: "RER",
    referenceProduct: "heat, from steam, in chemical industry",
    unit: "MJ",
  },
  spentSolvent: {
    exactName: "treatment of spent solvent mixture, hazardous waste incineration {RER w/o CH} | spent solvent mixture | Cutoff, U",
    datasetUuid: "c988649d-7fc3-33e5-bca7-fa24d28a1c22",
    geography: "RER w/o CH",
    referenceProduct: "spent solvent mixture",
    unit: "kg",
  },
  wastewater: {
    exactName: "treatment of wastewater, average, wastewater treatment {RER w/o CH} | wastewater, average | Cutoff, U",
    datasetUuid: "17984772-934a-366c-afce-5a3926ec0e94",
    geography: "RER w/o CH",
    referenceProduct: "wastewater, average",
    unit: "m3",
  },
} as const;

export const PAS_WATER_DATASET_TERMS = ["tap water", "water, deionised", "water, ultrapure", "water, completely softened"];
