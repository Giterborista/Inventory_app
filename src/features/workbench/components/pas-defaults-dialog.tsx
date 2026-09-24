"use client";

import { createPortal } from "react-dom";

import { PAS_PROFILE_OPTIONS, type PasProfile } from "@/features/workbench/pas-defaults";

type PasDefaultsDialogProps = {
  open: boolean;
  onClose: () => void;
  onApply: (profile: PasProfile) => void;
};

export function PasDefaultsDialog({
  open,
  onClose,
  onApply,
}: PasDefaultsDialogProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/35 px-4 py-10 backdrop-blur-sm">
      <div
        aria-labelledby="pas-defaults-title"
        aria-modal="true"
        className="hero-surface w-full max-w-2xl rounded-xl border border-white/70 p-6 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="section-title">PAS input values</div>
            <h2 className="mt-2 text-[1.7rem] font-semibold text-ink" id="pas-defaults-title">Apply PAS inputs and waste outputs</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
              Create or update estimated inputs for electricity, industrial heat from natural gas, and steam-derived heat,
              plus calculated outputs for spent solvent incineration and wastewater treatment.
              Values are defined for a main output basis of exactly 1 kg and linked to the specified ecoinvent datasets.
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
          Spent solvent mixture is calculated as all mass inputs minus water minus the main output.
          Wastewater is the sum of water inputs, converted from kg to m3 using 1000 kg/m3. Water is identified by its linked dataset: tap water, or deionised, ultrapure or completely softened water.
          Applying a profile updates matching PAS rows instead of creating duplicates. Existing measured values with the same flow names will be replaced, so review the affected rows before continuing.
        </div>
      </div>
    </div>,
    document.body,
  );
}
