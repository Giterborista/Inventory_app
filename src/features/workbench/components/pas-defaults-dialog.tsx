"use client";

import { PAS_PROFILE_OPTIONS, type PasProfile } from "@/features/workbench/pas-defaults";

type PasDefaultsDialogProps = {
  open: boolean;
  referenceAmount: string;
  scaleUnit: string;
  onClose: () => void;
  onApply: (profile: PasProfile) => void;
};

export function PasDefaultsDialog({
  open,
  referenceAmount,
  scaleUnit,
  onClose,
  onApply,
}: PasDefaultsDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/35 px-4 py-10 backdrop-blur-sm">
      <div className="hero-surface w-full max-w-2xl rounded-[2.2rem] border border-white/70 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">PAS defaults</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold text-ink">Apply default utilities and waste</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
              Create or update PAS Table 2 proxy rows for electricity, heat, steam, wastewater treatment, and hazardous waste incineration.
              Totals will be written at the current reference basis of {referenceAmount || "1"} {scaleUnit || "kg"}.
            </p>
          </div>
          <button
            className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {PAS_PROFILE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className="block w-full rounded-[1.7rem] border border-mist/80 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent"
              onClick={() => onApply(option.value)}
              type="button"
            >
              <div className="text-base font-semibold text-ink">{option.label}</div>
              <div className="mt-1 text-sm leading-6 text-slate">{option.summary}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-mist/80 bg-lab px-4 py-4 text-sm leading-6 text-slate">
          Wastewater is calculated from water-like INPUT rows only. Hazardous waste is calculated from non-water mass-based INPUT rows, excluding electricity, heat, and steam.
        </div>
      </div>
    </div>
  );
}
