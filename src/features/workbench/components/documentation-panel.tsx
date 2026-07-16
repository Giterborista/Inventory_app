"use client";

import { useEffect, useRef, useState } from "react";

import type { DocumentationRecord } from "@/features/workbench/types";

type DocumentationPanelProps = {
  documentation: DocumentationRecord;
  moleculeNotes: string;
  onChange: (field: keyof DocumentationRecord, value: DocumentationRecord[keyof DocumentationRecord]) => void;
  onNotesChange: (value: string) => void;
  focusMissingField?: number;
};

const fieldClassName =
  "mt-3 w-full rounded-md border border-mist bg-white px-3 py-3 text-sm leading-6 text-ink outline-none transition focus:border-slate";

export function DocumentationPanel({
  documentation,
  onChange,
  focusMissingField,
}: DocumentationPanelProps) {
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const traceabilityRef = useRef<HTMLTextAreaElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!focusMissingField) {
      return;
    }
    const target = !documentation.referenceAndScope.trim() ? contextRef.current : traceabilityRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
    target?.classList.add("project-issue-highlight");
    const timer = window.setTimeout(() => target?.classList.remove("project-issue-highlight"), 2400);
    return () => {
      window.clearTimeout(timer);
      target?.classList.remove("project-issue-highlight");
    };
  }, [documentation.referenceAndScope, focusMissingField]);

  return (
    <>
      <section className="overflow-hidden bg-white">
        <div className="flex items-center justify-end px-5 pt-4 text-xs text-slate sm:px-6">
          <span>Saved automatically</span>
        </div>

        <div className="mx-auto max-w-4xl px-5 pb-7 pt-3 sm:px-6">
          <section>
            <div className="relative flex items-center gap-2">
              <label className="text-sm font-semibold text-ink" htmlFor="activity-context-boundary">Activity context and boundary</label>
              <button
                aria-label="About activity-level traceability"
                className="grid h-6 w-6 place-items-center rounded-sm border border-helper/45 text-xs font-bold text-helper transition hover:border-helper hover:bg-helper-soft"
                onClick={() => setHelpOpen(true)}
                type="button"
              >?</button>
              {helpOpen ? (
                <aside className="theme-popover absolute left-0 top-9 z-30 w-[min(26rem,calc(100vw-4rem))] rounded-md border border-helper/45 p-4 text-sm leading-6 text-slate" role="note">
                  <span className="theme-popover absolute -top-2 left-40 h-4 w-4 rotate-45 border-l border-t border-helper/45" />
                  <div className="flex items-start justify-between gap-3"><span className="font-semibold text-ink">Activity-level traceability</span><button aria-label="Close activity traceability help" className="grid h-6 w-6 place-items-center text-base text-slate hover:text-ink" onClick={() => setHelpOpen(false)} type="button">×</button></div>
                  <p className="mt-2">Describe the activity as a whole: where and when it occurs, the technology and boundary used, and the evidence supporting the reconstruction. Details about one flow belong in that input or output.</p>
                </aside>
              ) : null}
            </div>
            <span className="mt-1 block text-xs leading-5 text-slate">
              Describe the location, time period, technology, operating conditions, and what is included or excluded.
            </span>
            <textarea
              ref={contextRef}
              className={`${fieldClassName} min-h-40`}
              id="activity-context-boundary"
              onChange={(event) => onChange("referenceAndScope", event.target.value)}
              placeholder="Describe the activity context and boundary"
              value={documentation.referenceAndScope}
            />
            <p className="mt-2 text-xs leading-5 text-slate">Example: Pilot-scale membrane production in Switzerland, 2025; preparation and curing included, packaging excluded.</p>
          </section>

          <section className="mt-7 border-t border-mist/60 pt-6">
            <label className="text-sm font-semibold text-ink" htmlFor="activity-sources-assumptions">Sources, calculations and assumptions</label>
            <span className="mt-1 block text-xs leading-5 text-slate">
              Cite the main sources and explain calculations, assumptions, proxies, and missing information.
            </span>
            <textarea
              ref={traceabilityRef}
              className={`${fieldClassName} min-h-40`}
              id="activity-sources-assumptions"
              onChange={(event) => onChange("calculationNotes", event.target.value)}
              placeholder="Record sources, calculations and assumptions"
              value={documentation.calculationNotes}
            />
            <p className="mt-2 text-xs leading-5 text-slate">Example: Supplier material data; energy calculated from equipment power and operating time; transport distance estimated.</p>
          </section>
        </div>
      </section>

    </>
  );
}
