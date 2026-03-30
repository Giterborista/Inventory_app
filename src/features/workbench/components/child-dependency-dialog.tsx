"use client";

import { useEffect, useMemo, useState } from "react";

import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import { resolutionLabels, resolutionTone, visibleResolutionOptions } from "@/features/workbench/display";
import { getCuratedPubChemSynonyms, getCuratedPubChemSynonymText } from "@/features/workbench/pubchem";
import type {
  MoleculeDraft,
  MoleculeRecord,
  ProjectRecord,
  PubChemMatch,
  ResolutionStatus,
} from "@/features/workbench/types";

export type ChildDependencyRowDraft = {
  totalValue: string;
  unit: string;
  reference: string;
  description: string;
  notes: string;
};

export type ChildDependencySubmission =
  | {
      mode: "existing";
      parentMoleculeId: string;
      childMoleculeId: string;
      row: ChildDependencyRowDraft;
    }
  | {
      mode: "new";
      parentMoleculeId: string;
      molecule: MoleculeDraft;
      row: ChildDependencyRowDraft;
    };

type ChildDependencyDialogProps = {
  open: boolean;
  parentMolecule: MoleculeRecord | null;
  project: ProjectRecord;
  onClose: () => void;
  onSubmit: (payload: ChildDependencySubmission) => void;
};

const emptyRowDraft: ChildDependencyRowDraft = {
  totalValue: "",
  unit: "kg",
  reference: "",
  description: "",
  notes: "",
};

const emptyMoleculeDraft: MoleculeDraft = {
  name: "",
  cas: "",
  iupac: "",
  synonyms: "",
  ecoinventAliases: "",
  notes: "",
  ecoinventStatus: "missing",
  topLevel: false,
  parentMoleculeId: "",
};

export function ChildDependencyDialog({
  open,
  parentMolecule,
  project,
  onClose,
  onSubmit,
}: ChildDependencyDialogProps) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMoleculeId, setSelectedMoleculeId] = useState<string | null>(null);
  const [moleculeDraft, setMoleculeDraft] = useState<MoleculeDraft>(emptyMoleculeDraft);
  const [rowDraft, setRowDraft] = useState<ChildDependencyRowDraft>(emptyRowDraft);
  const [lookupOpen, setLookupOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode("existing");
    setSearchQuery("");
    setSelectedMoleculeId(null);
    setMoleculeDraft(emptyMoleculeDraft);
    setRowDraft(emptyRowDraft);
    setLookupOpen(false);
  }, [open, parentMolecule?.id]);

  const searchResults = useMemo(() => {
    if (!parentMolecule) {
      return [];
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return project.molecules
      .filter((molecule) => molecule.id !== parentMolecule.id)
      .filter((molecule) =>
        [molecule.name, molecule.cas, molecule.iupac, ...molecule.synonyms, ...molecule.ecoinventAliases]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 8);
  }, [parentMolecule, project.molecules, searchQuery]);

  const selectedMolecule =
    project.molecules.find((molecule) => molecule.id === selectedMoleculeId) ?? null;

  const applyPubChemMatch = (match: PubChemMatch) => {
    setMoleculeDraft((current) => ({
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

  if (!open || !parentMolecule) {
    return null;
  }

  const canSubmit =
    mode === "existing"
      ? Boolean(selectedMoleculeId && rowDraft.totalValue.trim())
      : Boolean(moleculeDraft.name.trim() && rowDraft.totalValue.trim());

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-4 backdrop-blur-sm sm:py-8">
        <div className="hero-surface flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[2.2rem] border border-white/70 shadow-xl sm:max-h-[calc(100dvh-4rem)]">
          <div className="flex items-start justify-between gap-4 border-b border-mist/70 px-6 py-5">
            <div>
              <div className="section-title">Child dependency</div>
              <h2 className="mt-2 text-[1.7rem] font-semibold text-ink">Add child molecule to {parentMolecule.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
                Create or reuse an upstream molecule directly from the cascade tree. Saving once adds the child molecule
                and creates a linked INPUT row in the parent workbook.
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap gap-3">
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "existing" ? "bg-ink text-white shadow-lg shadow-ink/10" : "bg-white/80 text-slate hover:text-ink"
                }`}
                onClick={() => setMode("existing")}
                type="button"
              >
                Link existing molecule
              </button>
              <button
                className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                  mode === "new" ? "bg-ink text-white shadow-lg shadow-ink/10" : "bg-white/80 text-slate hover:text-ink"
                }`}
                onClick={() => setMode("new")}
                type="button"
              >
                Create new child molecule
              </button>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-5">
                {mode === "existing" ? (
                  <section className="rounded-3xl border border-mist/80 bg-lab p-4">
                    <div className="text-sm font-semibold text-ink">Find an existing molecule</div>
                    <p className="mt-1 text-sm text-slate">
                      Search by name, CAS, IUPAC, or synonym, then link that molecule into the parent reconstruction.
                    </p>
                    <input
                      className="mt-3 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by name, CAS, IUPAC, or synonym"
                      value={searchQuery}
                    />
                    {selectedMolecule ? (
                      <div className="mt-3 rounded-2xl border border-accent/20 bg-white px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-ink">{selectedMolecule.name}</div>
                            <div className="mt-1 text-xs text-slate">
                              {[selectedMolecule.cas, selectedMolecule.iupac].filter(Boolean).join(" • ") || "Linked molecule"}
                            </div>
                          </div>
                          <StatusBadge
                            label={resolutionLabels[selectedMolecule.ecoinventStatus]}
                            tone={resolutionTone(selectedMolecule.ecoinventStatus)}
                          />
                        </div>
                      </div>
                    ) : null}
                    {searchResults.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {searchResults.map((molecule) => (
                          <button
                            key={molecule.id}
                            className="block w-full rounded-2xl border border-mist/80 bg-white px-4 py-3 text-left shadow-sm transition hover:border-accent"
                            onClick={() => setSelectedMoleculeId(molecule.id)}
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-ink">{molecule.name}</div>
                                <div className="mt-1 text-xs text-slate">
                                  {[molecule.cas, molecule.iupac].filter(Boolean).join(" • ") || "No CAS / IUPAC"}
                                </div>
                              </div>
                              <StatusBadge
                                label={resolutionLabels[molecule.ecoinventStatus]}
                                tone={resolutionTone(molecule.ecoinventStatus)}
                              />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : searchQuery.trim() ? (
                      <div className="mt-3 rounded-2xl border border-dashed border-mist bg-white px-4 py-4 text-sm text-slate">
                        No existing molecule matched that search.
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <section className="rounded-3xl border border-mist/80 bg-lab p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">Create new child molecule</div>
                        <p className="mt-1 text-sm text-slate">
                          Define the missing upstream molecule here, then link it to the parent workbook in the same save.
                        </p>
                      </div>
                      <button
                        className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => setLookupOpen(true)}
                        type="button"
                      >
                        Lookup in PubChem
                      </button>
                    </div>
                    {moleculeDraft.pubchemMatch ? (
                      <div className="mt-4 rounded-2xl border border-accent/20 bg-white px-4 py-4 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-ink">
                            {moleculeDraft.pubchemMatch.title || moleculeDraft.pubchemMatch.iupacName}
                          </div>
                          <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                            CID {moleculeDraft.pubchemMatch.cid}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-2 text-sm text-slate md:grid-cols-2">
                          <div>
                            <span className="font-medium text-ink">Formula:</span>{" "}
                            {moleculeDraft.pubchemMatch.molecularFormula || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-ink">Molecular weight:</span>{" "}
                            {moleculeDraft.pubchemMatch.molecularWeight || "—"}
                          </div>
                        </div>
                        {getCuratedPubChemSynonyms(moleculeDraft.pubchemMatch).length > 0 ? (
                          <div className="mt-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                              Synonyms imported from PubChem
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {getCuratedPubChemSynonyms(moleculeDraft.pubchemMatch).map((synonym) => (
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
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-medium text-ink">Name</span>
                        <input
                          className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) => setMoleculeDraft((current) => ({ ...current, name: event.target.value }))}
                          value={moleculeDraft.name}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-ink">CAS</span>
                        <input
                          className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) => setMoleculeDraft((current) => ({ ...current, cas: event.target.value }))}
                          value={moleculeDraft.cas}
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-sm font-medium text-ink">IUPAC</span>
                        <input
                          className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) => setMoleculeDraft((current) => ({ ...current, iupac: event.target.value }))}
                          value={moleculeDraft.iupac}
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-sm font-medium text-ink">Synonyms</span>
                        <textarea
                          className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) => setMoleculeDraft((current) => ({ ...current, synonyms: event.target.value }))}
                          placeholder="Comma-separated synonyms"
                          value={moleculeDraft.synonyms}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-ink">Ecoinvent status</span>
                        <select
                          className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) =>
                            setMoleculeDraft((current) => ({
                              ...current,
                              ecoinventStatus: event.target.value as ResolutionStatus,
                            }))
                          }
                          value={moleculeDraft.ecoinventStatus}
                        >
                          {visibleResolutionOptions.map((value) => (
                            <option key={value} value={value}>
                              {resolutionLabels[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block md:col-span-2">
                        <span className="text-sm font-medium text-ink">Notes</span>
                        <textarea
                          className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                          onChange={(event) => setMoleculeDraft((current) => ({ ...current, notes: event.target.value }))}
                          value={moleculeDraft.notes}
                        />
                      </label>
                    </div>
                  </section>
                )}

                <section className="rounded-3xl border border-mist/80 bg-lab p-4">
                  <div className="text-sm font-semibold text-ink">Parent INPUT row</div>
                  <p className="mt-1 text-sm text-slate">
                    Capture the row details once. This will be added directly to {parentMolecule.name} as a linked INPUT row.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-ink">Quantity</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                        onChange={(event) => setRowDraft((current) => ({ ...current, totalValue: event.target.value }))}
                        value={rowDraft.totalValue}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-ink">Unit</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                        onChange={(event) => setRowDraft((current) => ({ ...current, unit: event.target.value }))}
                        value={rowDraft.unit}
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-ink">Reference</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                        onChange={(event) => setRowDraft((current) => ({ ...current, reference: event.target.value }))}
                        value={rowDraft.reference}
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-ink">Description</span>
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                        onChange={(event) => setRowDraft((current) => ({ ...current, description: event.target.value }))}
                        value={rowDraft.description}
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-sm font-medium text-ink">Notes</span>
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-2xl border border-mist bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                        onChange={(event) => setRowDraft((current) => ({ ...current, notes: event.target.value }))}
                        value={rowDraft.notes}
                      />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-3xl border border-mist/80 bg-lab p-5">
                  <div className="section-title">Parent context</div>
                  <h3 className="mt-3 text-lg font-semibold text-ink">{parentMolecule.name}</h3>
                  <div className="mt-2 text-sm text-slate">
                    {[parentMolecule.cas, parentMolecule.iupac].filter(Boolean).join(" • ") || "No identity detail yet"}
                  </div>
                  <div className="mt-4">
                    <StatusBadge
                      label={resolutionLabels[parentMolecule.ecoinventStatus]}
                      tone={resolutionTone(parentMolecule.ecoinventStatus)}
                    />
                  </div>
                </section>

                <section className="rounded-3xl border border-mist/80 bg-lab p-5">
                  <div className="section-title">What happens on save</div>
                  <ul className="mt-3 space-y-3 text-sm leading-6 text-slate">
                    <li>1. The child molecule is linked under the selected parent in the cascade hierarchy.</li>
                    <li>2. A linked INPUT row is created in the parent reconstruction table.</li>
                    <li>3. The graph and traceability views update from the same project data.</li>
                  </ul>
                </section>
              </aside>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-mist/70 px-6 py-4">
            <button
              className="rounded-full border border-mist px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-ink disabled:cursor-not-allowed disabled:bg-mist"
              disabled={!canSubmit}
              onClick={() =>
                onSubmit(
                  mode === "existing" && selectedMoleculeId
                    ? {
                        mode: "existing",
                        parentMoleculeId: parentMolecule.id,
                        childMoleculeId: selectedMoleculeId,
                        row: rowDraft,
                      }
                    : {
                        mode: "new",
                        parentMoleculeId: parentMolecule.id,
                        molecule: {
                          ...moleculeDraft,
                          topLevel: false,
                          parentMoleculeId: parentMolecule.id,
                        },
                        row: rowDraft,
                      },
                )
              }
              type="button"
            >
              Create linked child
            </button>
          </div>
        </div>
      </div>

      <PubChemLookupDialog
        initialQuery={moleculeDraft.cas || moleculeDraft.name || moleculeDraft.iupac}
        onClose={() => setLookupOpen(false)}
        onSelect={applyPubChemMatch}
        open={lookupOpen}
        title={`Lookup child molecule for ${parentMolecule.name}`}
      />
    </>
  );
}
