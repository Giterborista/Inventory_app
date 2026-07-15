"use client";

import { useEffect, useState } from "react";

import { ActivityFlowDiagram } from "@/features/workbench/components/activity-flow-diagram";
import type { MoleculeDraft } from "@/features/workbench/types";

const emptyDraft: MoleculeDraft = {
  activityType: "Production of",
  referenceProductName: "",
  referenceAmount: "1",
  referenceUnit: "kg",
  objectKind: "generic_object",
  name: "",
  cas: "",
  iupac: "",
  smiles: "",
  synonyms: "",
  ecoinventAliases: "",
  ecoinventStatus: "unchecked",
  notes: "",
  topLevel: true,
  parentMoleculeId: "",
};

type CreateMoleculeDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  initialValues?: Partial<MoleculeDraft>;
  parentSourceActivity?: { activityName: string; outputName: string };
  layerClassName?: string;
  onClose: () => void;
  onSubmit: (draft: MoleculeDraft) => void;
};

export function CreateMoleculeDialog({
  open,
  title,
  submitLabel,
  initialValues,
  parentSourceActivity,
  layerClassName = "z-50",
  onClose,
  onSubmit,
}: CreateMoleculeDialogProps) {
  const [draft, setDraft] = useState<MoleculeDraft>(emptyDraft);
  const [tipOpen, setTipOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextDraft = {
      ...emptyDraft,
      ...initialValues,
    };
    const nextReferenceProductName = nextDraft.referenceProductName || nextDraft.name;

    setDraft({
      ...nextDraft,
      activityType: nextDraft.activityType || "Production of",
      objectKind: "generic_object",
      referenceProductName: nextReferenceProductName,
      name: nextReferenceProductName,
    });
    setTipOpen(false);
    setHelpOpen(false);
  }, [initialValues, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (helpOpen) {
        setHelpOpen(false);
      } else if (tipOpen) {
        setTipOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [helpOpen, onClose, open, tipOpen]);

  if (!open) {
    return null;
  }

  const submitDraft = () => {
    const referenceProductName = draft.referenceProductName.trim();
    onSubmit({
      ...draft,
      activityType: draft.activityType.trim() || "Production of",
      referenceProductName,
      referenceAmount: draft.referenceAmount.trim() || "1",
      referenceUnit: draft.referenceUnit.trim() || "kg",
      objectKind: "generic_object",
      name: referenceProductName,
      cas: "",
      iupac: "",
      smiles: "",
      synonyms: "",
      ecoinventAliases: "",
      ecoinventStatus: "unchecked",
      pubchemMatch: null,
    });
  };

  return (
    <>
    <div className={`fixed inset-0 ${layerClassName} flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 backdrop-blur-sm`}>
      <div
        aria-labelledby="create-activity-title"
        aria-modal="true"
        className="hero-surface flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/70 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist/70 px-6 py-5">
          <div>
            <h2 className="text-[1.7rem] font-semibold text-ink" id="create-activity-title">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-expanded={helpOpen}
              aria-label="How an activity works"
              className={`inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-semibold transition ${
                helpOpen ? "border-helper bg-helper-soft text-helper" : "border-helper/45 text-helper hover:border-helper hover:bg-helper-soft"
              }`}
              onClick={() => {
                setHelpOpen((current) => !current);
                setTipOpen(false);
              }}
              type="button"
            >
              <span aria-hidden="true">?</span> How activities work
            </button>
            <button
              aria-label="Close create activity"
              className="grid h-8 w-8 place-items-center rounded-sm text-lg text-slate transition hover:bg-white/5 hover:text-ink"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {parentSourceActivity ? <section className="mb-5 rounded-lg border border-mist bg-lab p-4" aria-label="Parent activity relationship">
            <div className="text-sm font-semibold text-ink">What creating a parent means</div>
            <p className="mt-1 text-sm leading-6 text-slate">The new parent activity will automatically use the reference output of <span className="font-semibold text-ink">{parentSourceActivity.activityName}</span> as one of its inputs. The parent’s own reference product remains its main output.</p>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
              <div className="rounded-md border border-mist bg-white px-3 py-2"><span className="block text-slate">Linked input</span><span className="mt-0.5 block font-semibold text-ink">{parentSourceActivity.outputName}</span></div>
              <span className="hidden text-slate sm:block" aria-hidden="true">→</span>
              <div className="rounded-md border border-mist bg-white px-3 py-2"><span className="block text-slate">New activity</span><span className="mt-0.5 block font-semibold text-ink">Parent activity</span></div>
              <span className="hidden text-slate sm:block" aria-hidden="true">→</span>
              <div className="rounded-md border border-mist bg-white px-3 py-2"><span className="block text-slate">Reference output</span><span className="mt-0.5 block font-semibold text-ink">Product or service entered below</span></div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate">You can set the amount of the linked input after creating the parent.</p>
          </section> : null}
          <div className="grid gap-4">
            <section className="py-1">
              <div className="grid gap-5">
                <div className="grid items-start gap-4 md:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
                <label className="block">
                  <span className="text-sm font-semibold text-slate">Activity prefix</span>
                  <input
                    aria-describedby="activity-prefix-help"
                    className="mt-2 w-full rounded-md border border-mist bg-white px-3 py-3 text-sm text-ink outline-none transition focus:border-slate"
                    onChange={(event) => setDraft((current) => ({ ...current, activityType: event.target.value }))}
                    placeholder="Production of"
                    value={draft.activityType}
                  />
                  <span className="mt-2 block text-xs leading-5 text-slate" id="activity-prefix-help">Usually “Production of”.</span>
                </label>

                <div className="relative block">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
                    <label htmlFor="activity-product-service">Product or service</label>
                    <button
                      aria-expanded={tipOpen}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                        tipOpen ? "border-helper bg-helper-soft text-helper" : "border-helper/45 text-helper hover:border-helper hover:bg-helper-soft"
                      }`}
                      onClick={() => {
                        setTipOpen((current) => !current);
                        setHelpOpen(false);
                      }}
                      type="button"
                    >
                      Tip
                    </button>
                  </div>
                  <input
                    aria-describedby="activity-product-help"
                    className="mt-2 w-full rounded-md border border-mist bg-white px-4 py-3 text-base font-medium text-ink outline-none transition focus:border-slate"
                    id="activity-product-service"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        referenceProductName: event.target.value,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Concrete block, laboratory analysis, or delivery service"
                    value={draft.referenceProductName}
                  />
                  <span className="mt-2 block text-xs leading-5 text-slate" id="activity-product-help">
                    This is the main product or service created by this activity.
                  </span>
                  {tipOpen ? (
                    <div className="theme-popover absolute right-0 top-9 z-20 w-[min(20rem,calc(100vw-5rem))] rounded-lg border border-helper/55 p-4 text-sm leading-6 text-helper shadow-2xl" role="note">
                      <span className="theme-popover absolute -top-2 right-5 h-4 w-4 rotate-45 border-l border-t border-helper/55" />
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-semibold text-helper">Tip</span>
                        <button
                          aria-label="Close tip"
                          className="-mr-1 -mt-1 grid h-6 w-6 place-items-center rounded text-base text-slate transition hover:bg-white/10 hover:text-ink"
                          onClick={() => setTipOpen(false)}
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                      <p className="mt-1">
                        Start with the process that makes what you are investigating—for example, <span className="font-medium text-ink">Production of research concrete</span> or <span className="font-medium text-ink">Production of a separation membrane</span>. Add its inputs after creating the activity.
                      </p>
                    </div>
                  ) : null}
                </div>
                </div>

                <div className="border-l-2 border-accent bg-white/45 px-4 py-2.5">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-slate">Activity being created</span>
                  <span className="mt-0.5 block text-sm font-semibold text-ink">
                    {draft.activityType.trim() || "Production of"} {draft.referenceProductName.trim() || "your product or service"}
                  </span>
                </div>
              </div>
            </section>

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-mist/70 px-6 py-4">
          <button
            className="rounded-sm px-4 py-2 text-sm font-medium text-slate transition hover:bg-white/5 hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!draft.referenceProductName.trim()}
            onClick={submitDraft}
            type="button"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
    {helpOpen ? (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 px-4 py-6 backdrop-blur-md">
        <section
          aria-labelledby="activity-help-title"
          aria-modal="true"
          className="hero-surface max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/70 p-5 shadow-2xl sm:p-6"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-semibold text-ink" id="activity-help-title">How an activity works</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-helper">
                An activity represents one process. It receives inputs and creates outputs. The product or service you enter is the main output of the activity; waste, co-products, and direct emissions can be added later when they are relevant.
              </p>
            </div>
            <button
              aria-label="Close activity help"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-mist text-lg text-slate transition hover:border-alert hover:text-alert"
              onClick={() => setHelpOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="mx-auto mt-4 max-w-[34rem] rounded-lg border border-mist bg-lab/40 p-3">
            <ActivityFlowDiagram />
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}
