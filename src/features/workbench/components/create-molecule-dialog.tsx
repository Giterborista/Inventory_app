"use client";

import { useEffect, useRef, useState } from "react";

import type { MoleculeDraft } from "@/features/workbench/types";

const emptyDraft: MoleculeDraft = {
  activityType: "Production of",
  referenceProductName: "",
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
  description: string;
  initialValues?: Partial<MoleculeDraft>;
  showImportOption?: boolean;
  onClose: () => void;
  onSubmit: (draft: MoleculeDraft) => void;
  onImportJson?: (file: File) => void;
};

export function CreateMoleculeDialog({
  open,
  title,
  submitLabel,
  initialValues,
  showImportOption = true,
  onClose,
  onSubmit,
  onImportJson,
}: CreateMoleculeDialogProps) {
  const [draft, setDraft] = useState<MoleculeDraft>(emptyDraft);
  const importInputRef = useRef<HTMLInputElement>(null);

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
  }, [initialValues, open]);

  if (!open) {
    return null;
  }

  const submitDraft = () => {
    const referenceProductName = draft.referenceProductName.trim();
    onSubmit({
      ...draft,
      activityType: draft.activityType.trim() || "Production of",
      referenceProductName,
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-6 backdrop-blur-sm">
      <div className="hero-surface flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-white/70 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-mist/70 px-6 py-5">
          <div>
            <h2 className="text-[1.7rem] font-semibold text-ink">{title}</h2>
          </div>
          <button
            className="rounded-md border border-mist px-3 py-1 text-sm text-slate transition hover:border-slate hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-lg border border-mist/80 bg-white p-4 shadow-sm md:col-span-2">
              <div className="text-base font-semibold text-ink">Create new activity</div>

              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-ink">Activity type</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-mist bg-white px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-accent"
                    onChange={(event) => setDraft((current) => ({ ...current, activityType: event.target.value }))}
                    placeholder="Production of"
                    value={draft.activityType}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-ink">Produced item or activity result</span>
                  <input
                    className="mt-2 w-full rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        referenceProductName: event.target.value,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Concrete block, CO2 capture membrane, HTP02 in toluene"
                    value={draft.referenceProductName}
                  />
                  <div className="mt-2 text-xs leading-5 text-slate">
                    This becomes the activity output and the basis for the inventory rows.
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-ink">Notes</span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-lg border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Optional activity context"
                    value={draft.notes}
                  />
                </label>
              </div>
            </section>

            {showImportOption && onImportJson ? (
              <section className="rounded-lg border border-mist/80 bg-lab p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">Import existing JSON</div>
                    <div className="mt-1 text-xs leading-5 text-slate">
                      Use this when you already have an exported activity subtree.
                    </div>
                  </div>
                  <div>
                    <input
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        onImportJson(file);
                        event.target.value = "";
                      }}
                      ref={importInputRef}
                      type="file"
                    />
                    <button
                      className="rounded-md border border-mist bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-accent hover:text-accent active:scale-95"
                      onClick={() => importInputRef.current?.click()}
                      type="button"
                    >
                      Import JSON
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-mist/70 px-6 py-4">
          <button
            className="rounded-md border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-slate hover:text-ink"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!draft.referenceProductName.trim()}
            onClick={submitDraft}
            type="button"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
