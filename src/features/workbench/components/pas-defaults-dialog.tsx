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
      <div
        aria-labelledby="pas-defaults-title"
        aria-modal="true"
        className="hero-surface w-full max-w-2xl rounded-xl border border-white/70 p-6 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">Advanced proxy tool</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold text-ink" id="pas-defaults-title">Apply PAS utility and waste estimates</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
              Create or update estimated rows for electricity, heat, steam, wastewater treatment, and hazardous waste incineration.
              Totals will be written at the current reference basis of {referenceAmount || "1"} {scaleUnit || "kg"} and clearly kept open for dataset review.
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

        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <span className="font-semibold">Use only when measured or supplier data are unavailable.</span> These are proxy estimates, not observations. Verify the geography, technology, units, and suggested ecoinvent datasets before using the inventory in a study.
        </div>

        <div className="mt-6 space-y-4">
          {PAS_PROFILE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className="block w-full rounded-lg border border-mist/80 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent"
              onClick={() => onApply(option.value)}
              type="button"
            >
              <div className="text-base font-semibold text-ink">{option.label}</div>
              <div className="mt-1 text-sm leading-6 text-slate">{option.summary}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-mist/80 bg-lab px-4 py-4 text-sm leading-6 text-slate">
          Wastewater is calculated from water-like INPUT rows only, converted from kg water to m3 using 1000 kg/m3.
          Hazardous waste is calculated from non-water mass-based INPUT rows, excluding electricity, heat, and steam.
        </div>
      </div>
    </div>
  );
}
