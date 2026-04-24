"use client";

import { useRef, useState } from "react";

import { DocumentationPanel } from "@/features/workbench/components/documentation-panel";
import { PubChemLookupDialog } from "@/features/workbench/components/pubchem-lookup-dialog";
import { PatentExtractionPanel } from "@/features/workbench/components/patent-extraction-panel";
import { ReconstructionTable } from "@/features/workbench/components/reconstruction-table";
import { StatusBadge } from "@/features/workbench/components/status-badge";
import { TraceabilityPanel } from "@/features/workbench/components/traceability-panel";
import { resolutionLabels, resolutionTone, visibleResolutionOptions } from "@/features/workbench/display";
import { getCuratedPubChemSynonyms } from "@/features/workbench/pubchem";
import { getEffectiveResolutionStatus, getMoleculeTraceability } from "@/features/workbench/selectors";
import type { PasProfile } from "@/features/workbench/pas-defaults";
import type {
  DocumentationRecord,
  EcoinventCheckRecord,
  MoleculeRecord,
  MoleculeDraft,
  ProjectRecord,
  PubChemMatch,
  ReconstructionRow,
  ResolutionStatus,
  ReviewStatus,
} from "@/features/workbench/types";

type MoleculeWorkspaceProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  saveMessage: string;
  isExportingPdf: boolean;
  onBack: () => void;
  onDelete: () => void;
  onSaveProjectJson: () => void;
  onExportPdfReport: () => void;
  onImportMoleculeJson: (file: File) => void;
  onOpenMolecule: (moleculeId: string) => void;
  onAddManualParent: (parentMoleculeId: string) => void;
  onCreateParentMolecule: () => void;
  onRemoveManualParent: (parentMoleculeId: string) => void;
  onMoveRoot: (direction: "up" | "down") => void;
  onMoveChild: (childMoleculeId: string, direction: "up" | "down") => void;
  onUpdateMoleculeField: (
    field:
      | "name"
      | "cas"
      | "iupac"
      | "notes"
      | "synonyms"
      | "ecoinventAliases"
      | "ecoinventStatus"
      | "reviewStatus"
      | "needsReview"
      | "topLevel"
      | "scaleReferenceAmount"
      | "scaleTargetAmount"
      | "scaleUnit",
    value: string | string[] | ResolutionStatus | ReviewStatus | boolean,
  ) => void;
  onUpdateTopLevel: (topLevel: boolean) => void;
  onUpdateEcoinventCheck: (patch: Partial<EcoinventCheckRecord> | null) => void;
  onUpdateDocumentation: (
    field: keyof DocumentationRecord,
    value: DocumentationRecord[keyof DocumentationRecord],
  ) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: "up" | "down") => void;
  onSaveRow: (section: "INPUT" | "OUTPUT", values: Partial<ReconstructionRow>, rowId?: string) => void;
  onCreateChildFromRow: (
    rowId: string,
    values: Partial<ReconstructionRow> & { section: "INPUT" | "OUTPUT" },
    draft: Partial<MoleculeDraft>,
  ) => void;
  onApplyPasDefaults: (profile: PasProfile) => void;
  onAddExtractedRow: (
    section: "INPUT" | "OUTPUT",
    values: Partial<ReconstructionRow>,
    evidence?: {
      citation: string;
      summary: string;
    },
  ) => void;
  onRescaleRows: () => void;
};

export function MoleculeWorkspace({
  project,
  molecule,
  saveMessage,
  isExportingPdf,
  onBack,
  onDelete,
  onSaveProjectJson,
  onExportPdfReport,
  onImportMoleculeJson,
  onOpenMolecule,
  onAddManualParent,
  onCreateParentMolecule,
  onRemoveManualParent,
  onMoveRoot,
  onMoveChild,
  onUpdateMoleculeField,
  onUpdateTopLevel,
  onUpdateEcoinventCheck,
  onUpdateDocumentation,
  onDeleteRow,
  onMoveRow,
  onSaveRow,
  onCreateChildFromRow,
  onApplyPasDefaults,
  onAddExtractedRow,
  onRescaleRows,
}: MoleculeWorkspaceProps) {
  const [lookupOpen, setLookupOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const traceability = getMoleculeTraceability(project, molecule);
  const effectiveStatus = getEffectiveResolutionStatus(project, molecule);
  const hierarchyLabel =
    traceability.parents.length === 0
      ? "Primary root molecule in the current project narrative"
      : traceability.parents.length === 1
        ? `Used upstream by ${traceability.parents[0]?.name ?? "another molecule"}`
        : `Reused across ${traceability.parents.length} parent molecules`;

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <div className="mx-auto max-w-[104rem] space-y-6">
        <section className="hero-surface rounded-[2.35rem] border border-white/70 p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full border border-mist/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                  onClick={onBack}
                  type="button"
                >
                  Back to project overview
                </button>
                <span className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate shadow-sm">
                  {saveMessage}
                </span>
                <span className="rounded-full border border-mist/80 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate shadow-sm">
                  {project.name}
                </span>
              </div>

              <div className="mt-6">
                <div className="section-title">Molecule workspace</div>
                <h1 className="mt-3 max-w-5xl text-4xl font-semibold text-ink md:text-[3rem]">{molecule.name}</h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-slate">
                  One wide scientific workspace for reconstruction, documentation, hierarchy control, and export. The
                  row-level table remains central; traceability and supporting rationale stay visible without fragmenting
                  the workflow.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  onImportMoleculeJson(file);
                  event.target.value = "";
                }}
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
              />
              <button
                className="rounded-full border border-alert/20 bg-white/80 px-4 py-3 text-sm font-medium text-alert transition hover:bg-alert/10"
                onClick={onDelete}
                type="button"
              >
                Delete molecule
              </button>
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                Import molecule JSON
              </button>
              <button
                className="rounded-full border border-mist/80 bg-white/80 px-4 py-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
                disabled={isExportingPdf}
                onClick={() => void onExportPdfReport()}
                type="button"
              >
                {isExportingPdf ? "Generating PDF…" : "Export PDF report"}
              </button>
              <button
                className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/15 transition hover:bg-ink"
                onClick={onSaveProjectJson}
                type="button"
              >
                Save project JSON
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_minmax(22rem,0.78fr)]">
            <section className="rounded-[1.9rem] border border-white/70 bg-white/78 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="section-title">Identity</div>
                <button
                  className="rounded-full border border-mist/80 bg-white px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                  onClick={() => setLookupOpen(true)}
                  type="button"
                >
                  Lookup in PubChem
                </button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-ink">Molecule name</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateMoleculeField("name", event.target.value)}
                    value={molecule.name}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">CAS</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 font-mono text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateMoleculeField("cas", event.target.value)}
                    value={molecule.cas}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-ink">IUPAC</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) => onUpdateMoleculeField("iupac", event.target.value)}
                    value={molecule.iupac}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-ink">Synonyms</span>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) =>
                      onUpdateMoleculeField(
                        "synonyms",
                        event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="Comma-separated synonyms. PubChem matches can populate this automatically."
                    value={molecule.synonyms.join(", ")}
                  />
                </label>
                {molecule.synonyms.length > 0 ? (
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">
                      Visible molecule synonyms
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {molecule.synonyms.map((synonym) => (
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
                <label className="block md:col-span-2">
                  <span className="text-sm font-medium text-ink">Ecoinvent aliases / alternate names</span>
                  <input
                    className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                    onChange={(event) =>
                      onUpdateMoleculeField(
                        "ecoinventAliases",
                        event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      )
                    }
                    placeholder="Comma-separated alternate names used in ecoinvent or internal matching"
                    value={molecule.ecoinventAliases.join(", ")}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-[1.9rem] border border-white/70 bg-white/78 p-5 shadow-sm">
                <div className="section-title">Status and context</div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-mist/80 bg-lab px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Hierarchy position</div>
                    <div className="mt-2 text-sm font-medium text-ink">{hierarchyLabel}</div>
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Ecoinvent status</span>
                    <select
                      className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) =>
                        onUpdateMoleculeField("ecoinventStatus", event.target.value as ResolutionStatus)
                      }
                      value={molecule.ecoinventStatus}
                    >
                      {visibleResolutionOptions.map((value) => (
                        <option key={value} value={value}>
                          {resolutionLabels[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-ink">Exact ecoinvent name</span>
                    <input
                      className="mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm text-ink outline-none transition focus:border-accent"
                      onChange={(event) => onUpdateEcoinventCheck({ datasetName: event.target.value })}
                      placeholder="Exact dataset or exact name used for this molecule"
                      value={molecule.ecoinventCheck?.datasetName ?? ""}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={resolutionLabels[effectiveStatus]} tone={resolutionTone(effectiveStatus)} />
                    {molecule.placeholder ? <StatusBadge label="Placeholder record" tone="ink" /> : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.9rem] border border-white/70 bg-white/78 p-5 shadow-sm">
                <div className="section-title">Hierarchy controls</div>
                <div className="mt-4 space-y-4">
                  <label className="flex items-center gap-3 rounded-2xl border border-mist/80 bg-lab px-4 py-4">
                    <input
                      checked={molecule.topLevel}
                      className="h-4 w-4 rounded border-mist text-accent focus:ring-accent"
                      onChange={(event) => onUpdateTopLevel(event.target.checked)}
                      type="checkbox"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">Show as top-level molecule</div>
                      <div className="mt-1 text-xs text-slate">
                        Keep this molecule visible at the root of the project tree, even if it is reused further upstream.
                      </div>
                    </div>
                  </label>
                  {molecule.topLevel ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-full border border-mist/80 px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => onMoveRoot("up")}
                        type="button"
                      >
                        Move root up
                      </button>
                      <button
                        className="rounded-full border border-mist/80 px-4 py-2 text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                        onClick={() => onMoveRoot("down")}
                        type="button"
                      >
                        Move root down
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </section>

        <ReconstructionTable
          molecule={molecule}
          onDeleteRow={onDeleteRow}
          onMoveRow={onMoveRow}
          onOpenMolecule={onOpenMolecule}
          onCreateChildFromRow={onCreateChildFromRow}
          onApplyPasDefaults={onApplyPasDefaults}
          onRescale={onRescaleRows}
          onSaveRow={onSaveRow}
          onUpdateScaleField={(field, value) => onUpdateMoleculeField(field, value)}
          project={project}
        />

        <PatentExtractionPanel
          documentation={molecule.documentation}
          molecule={molecule}
          onAddExtractedRow={onAddExtractedRow}
          onUpdateDocumentation={onUpdateDocumentation}
          project={project}
        />

        <DocumentationPanel
          documentation={molecule.documentation}
          moleculeNotes={molecule.notes}
          onChange={onUpdateDocumentation}
          onNotesChange={(value) => onUpdateMoleculeField("notes", value)}
        />

        <TraceabilityPanel
          molecule={molecule}
          onAddManualParent={onAddManualParent}
          onCreateParentMolecule={onCreateParentMolecule}
          onMoveChild={onMoveChild}
          onOpenMolecule={onOpenMolecule}
          onRemoveManualParent={onRemoveManualParent}
          project={project}
        />
      </div>
      <PubChemLookupDialog
        initialQuery={molecule.cas || molecule.name || molecule.iupac}
        onClose={() => setLookupOpen(false)}
        onSelect={(match: PubChemMatch) => {
          const nextSynonyms = Array.from(new Set([...molecule.synonyms, ...getCuratedPubChemSynonyms(match)]));
          const nextAliases = Array.from(
            new Set([...(molecule.ecoinventAliases ?? []), ...(match.title ? [match.title] : [])]),
          );

          onUpdateMoleculeField("name", molecule.name || match.title || match.iupacName || molecule.name);
          onUpdateMoleculeField("cas", molecule.cas || match.matchedCas);
          onUpdateMoleculeField("iupac", match.iupacName || molecule.iupac);
          onUpdateMoleculeField("synonyms", nextSynonyms);
          onUpdateMoleculeField("ecoinventAliases", nextAliases);
          setLookupOpen(false);
        }}
        open={lookupOpen}
        title="Enrich molecule identity from PubChem"
      />
    </main>
  );
}
