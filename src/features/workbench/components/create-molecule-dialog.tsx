"use client";

import { useEffect, useState } from "react";

import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { resolutionLabels, visibleResolutionOptions } from "@/features/workbench/display";
import { getCuratedPubChemSynonyms, getCuratedPubChemSynonymText } from "@/features/workbench/pubchem";
import type { MoleculeDraft, ProjectRecord, PubChemMatch, ResolutionStatus } from "@/features/workbench/types";

const emptyDraft: MoleculeDraft = {
  name: "",
  cas: "",
  iupac: "",
  synonyms: "",
  ecoinventAliases: "",
  ecoinventStatus: "missing",
  notes: "",
  topLevel: true,
  parentMoleculeId: "",
};

type CreateMoleculeDialogProps = {
  open: boolean;
  title: string;
  submitLabel: string;
  description: string;
  project: ProjectRecord;
  initialValues?: Partial<MoleculeDraft>;
  hideParentSelection?: boolean;
  onClose: () => void;
  onSubmit: (draft: MoleculeDraft) => void;
};

export function CreateMoleculeDialog({
  open,
  title,
  submitLabel,
  description,
  project,
  initialValues,
  hideParentSelection = false,
  onClose,
  onSubmit,
}: CreateMoleculeDialogProps) {
  const [draft, setDraft] = useState<MoleculeDraft>(emptyDraft);
  const [lookupOpen, setLookupOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft({
      ...emptyDraft,
      ...initialValues,
    });
  }, [initialValues, open]);

  if (!open) {
    return null;
  }

  const applyPubChemMatch = (match: PubChemMatch) => {
    setDraft((current) => ({
      ...current,
      name: current.name || match.title || match.iupacName || current.name,
      cas: current.cas || match.matchedCas,
      iupac: match.iupacName || current.iupac,
      synonyms: getCuratedPubChemSynonymText(match),
      ecoinventAliases: current.ecoinventAliases || current.name || match.title || "",
      pubchemMatch: match,
    }));
    setLookupOpen(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-4 backdrop-blur-sm sm:py-8">
        <div className="hero-surface flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2.2rem] border border-white/70 shadow-xl sm:max-h-[calc(100dvh-4rem)]">
          <div className="flex items-start justify-between gap-4 border-b border-mist/70 px-6 py-5">
            <div>
              <div className="section-title">Molecule editor</div>
              <h2 className="mt-2 text-[1.7rem] font-semibold text-ink">{title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate">{description}</p>
            </div>
            <button
              className="rounded-full border border-mist px-3 py-1 text-sm text-slate transition hover:border-slate hover:text-ink"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mist/80 bg-lab px-4 py-4">
                <div>
                  <div className="text-sm font-semibold text-ink">Optional identity enrichment</div>
                  <div className="mt-1 text-sm text-slate">
                    Search PubChem by CAS, name, IUPAC, or synonym and autofill this molecule form.
                  </div>
                </div>
                <button
                  className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                  onClick={() => setLookupOpen(true)}
                  type="button"
                >
                  Lookup in PubChem
                </button>
              </div>

              {draft.pubchemMatch ? (
                <div className="md:col-span-2 rounded-2xl border border-accent/20 bg-white px-4 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-ink">
                      {draft.pubchemMatch.title || draft.pubchemMatch.iupacName}
                    </div>
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                      CID {draft.pubchemMatch.cid}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-slate md:grid-cols-2">
                    <div>
                      <span className="font-medium text-ink">Formula:</span>{" "}
                      {draft.pubchemMatch.molecularFormula || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-ink">Molecular weight:</span>{" "}
                      {draft.pubchemMatch.molecularWeight || "—"}
                    </div>
                  </div>
                  {getCuratedPubChemSynonyms(draft.pubchemMatch).length > 0 ? (
                    <div className="mt-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                        Synonyms imported from PubChem
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getCuratedPubChemSynonyms(draft.pubchemMatch).map((synonym) => (
                          <span
                            key={synonym}
                            className="rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                          >
                            {synonym}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-ink">Molecule name</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="HTP02.1"
                  value={draft.name}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">CAS</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, cas: event.target.value }))}
                  placeholder="64-17-5"
                  value={draft.cas}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">IUPAC</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, iupac: event.target.value }))}
                  placeholder="Systematic chemical name"
                  value={draft.iupac}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Synonyms</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, synonyms: event.target.value }))}
                  placeholder="Comma-separated synonyms. PubChem matches will populate this automatically when available."
                  value={draft.synonyms}
                />
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Ecoinvent aliases or exact dataset wording</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, ecoinventAliases: event.target.value }))}
                  placeholder="Comma-separated names used during ecoinvent checking"
                  value={draft.ecoinventAliases}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">Ecoinvent status</span>
                <select
                  className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ecoinventStatus: event.target.value as ResolutionStatus,
                    }))
                  }
                  value={draft.ecoinventStatus}
                >
                  {visibleResolutionOptions.map((value) => (
                    <option key={value} value={value}>
                      {resolutionLabels[value]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-mist bg-lab px-4 py-3">
                <input
                  checked={draft.topLevel}
                  className="h-4 w-4 rounded border-mist text-accent focus:ring-accent"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      topLevel: event.target.checked,
                      parentMoleculeId: event.target.checked ? "" : current.parentMoleculeId,
                    }))
                  }
                  type="checkbox"
                />
                <div>
                  <div className="text-sm font-medium text-ink">Show as top-level molecule</div>
                  <div className="text-xs text-slate">Use this when the molecule should appear at the root of the hierarchy tree.</div>
                </div>
              </label>

              {!hideParentSelection ? (
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-ink">Optional parent molecule</span>
                  <select
                    className="mt-2 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        parentMoleculeId: event.target.value,
                        topLevel: event.target.value ? false : current.topLevel,
                      }))
                    }
                    value={draft.parentMoleculeId}
                  >
                    <option value="">No parent selected</option>
                    {project.molecules.map((molecule) => (
                      <option key={molecule.id} value={molecule.id}>
                        {molecule.name}{molecule.cas ? ` • ${molecule.cas}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink">Notes</span>
                <textarea
                  className="mt-2 min-h-28 w-full rounded-2xl border border-mist bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Short context for the new molecule record"
                  value={draft.notes}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-mist/70 px-6 py-4">
            <button
              className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-slate hover:text-ink"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-ink"
              onClick={() => onSubmit(draft)}
              type="button"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>

      <PubChemLookupDialog
        initialQuery={draft.cas || draft.name || draft.iupac}
        onClose={() => setLookupOpen(false)}
        onSelect={applyPubChemMatch}
        open={lookupOpen}
        title="Lookup molecule identity in PubChem"
      />
    </>
  );
}
