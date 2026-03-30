"use client";

import type { DocumentationRecord } from "@/features/workbench/types";

type DocumentationPanelProps = {
  documentation: DocumentationRecord;
  moleculeNotes: string;
  onChange: (field: keyof DocumentationRecord, value: DocumentationRecord[keyof DocumentationRecord]) => void;
  onNotesChange: (value: string) => void;
};

const fieldClassName =
  "mt-2 w-full rounded-2xl border border-mist/80 bg-lab px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-accent";

export function DocumentationPanel({
  documentation,
  moleculeNotes,
  onChange,
  onNotesChange,
}: DocumentationPanelProps) {
  return (
    <section className="panel-surface rounded-[2.1rem] border border-white/70 p-6">
      <div>
        <div className="section-title">Unified documentation</div>
        <h2 className="mt-3 text-[1.75rem] font-semibold text-ink">Reconstruction documentation</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate">
          Keep the origin, source, assumptions, explanation, and important notes for this molecule in one unified section.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Reaction / origin of the molecule</span>
          <textarea
            className={`${fieldClassName} min-h-32`}
            onChange={(event) => onChange("referenceAndScope", event.target.value)}
            placeholder="Describe the molecule origin, transformation, or reconstruction context"
            value={documentation.referenceAndScope}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Source used</span>
          <textarea
            className={`${fieldClassName} min-h-32`}
            onChange={(event) => onChange("functionalUnit", event.target.value)}
            placeholder="Primary patent, article, internal memo, or source reference"
            value={documentation.functionalUnit}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <label className="block">
          <span className="text-sm font-medium text-ink">Assumptions</span>
          <textarea
            className={`${fieldClassName} min-h-36`}
            onChange={(event) => onChange("pasAssumptions", event.target.value)}
            placeholder="Yield assumptions, proxy logic, or missing-information assumptions"
            value={documentation.pasAssumptions}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Balanced reaction</span>
          <textarea
            className={`${fieldClassName} min-h-36 font-mono text-xs`}
            onChange={(event) => onChange("balancedEquation", event.target.value)}
            placeholder="Balanced reaction or stoichiometric expression if available"
            value={documentation.balancedEquation}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-5">
        <label className="block">
          <span className="text-sm font-medium text-ink">Explanation of calculations or reconstruction logic</span>
          <textarea
            className={`${fieldClassName} min-h-44`}
            onChange={(event) => onChange("calculationNotes", event.target.value)}
            placeholder="Explain how the row amounts, scaling, and reconstruction logic were derived"
            value={documentation.calculationNotes}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">Important notes</span>
          <textarea
            className={`${fieldClassName} min-h-28`}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Anything important that a reviewer should understand immediately"
            value={moleculeNotes}
          />
        </label>

      </div>
    </section>
  );
}
