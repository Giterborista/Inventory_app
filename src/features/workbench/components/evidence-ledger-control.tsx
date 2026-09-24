"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  createEmptyEvidenceLedger,
  describeEvidenceLedger,
  encodeEvidenceLedger,
  evidenceClassInfo,
  evidenceGateInfo,
  evidenceScaleInfo,
  finalizeEvidenceLedger,
  scaledEvidenceClasses,
  validateEvidenceLedger,
} from "@/features/workbench/evidence-ledger";
import type {
  EvidenceLedgerClass,
  EvidenceLedgerOutcome,
  EvidenceLedgerRecord,
  EvidenceLedgerScale,
} from "@/features/workbench/types";

type EvidenceLedgerControlProps = {
  contextLabel: string;
  value: EvidenceLedgerRecord | null;
  onChange: (value: EvidenceLedgerRecord | null) => void;
};

const fieldClassName =
  "mt-2 w-full rounded-md border border-mist bg-lab px-3 py-2.5 text-sm text-ink outline-none transition focus:border-[#3f9b82]";

function BuilderDialog({
  contextLabel,
  initialValue,
  onApply,
  onClose,
}: {
  contextLabel: string;
  initialValue: EvidenceLedgerRecord | null;
  onApply: (value: EvidenceLedgerRecord) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EvidenceLedgerRecord>(initialValue ?? createEmptyEvidenceLedger());
  const errors = useMemo(() => validateEvidenceLedger(draft), [draft]);
  const preview = useMemo(() => encodeEvidenceLedger(draft), [draft]);
  const description = useMemo(() => describeEvidenceLedger(draft), [draft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const setClass = (cls: EvidenceLedgerClass) => {
    setDraft((current) => ({
      ...current,
      cls,
      scale: scaledEvidenceClasses.has(cls) ? current.scale : "",
      gate: cls === "P" ? null : current.gate,
      year: cls === "P" ? current.year : "",
      q: cls === "P" && current.q,
      f: cls === "P" && current.f,
      s: cls === "P" && current.s,
      c: cls === "P" && current.c,
    }));
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/55 px-4 py-6 backdrop-blur-sm">
      <div aria-labelledby="evidence-ledger-builder-title" aria-modal="true" className="hero-surface flex max-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-white/60 shadow-2xl" role="dialog">
        <header className="flex items-start justify-between gap-4 border-b border-mist/70 px-5 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase text-[#68bca3]">Evidence Ledger</div>
            <h2 className="mt-1 text-xl font-semibold text-ink" id="evidence-ledger-builder-title">Create evidence code</h2>
            <p className="mt-1 text-sm text-slate">Record the source quality and modelling decision for this {contextLabel}.</p>
          </div>
          <button aria-label="Close evidence code builder" className="grid h-8 w-8 place-items-center rounded-sm text-lg text-slate hover:bg-white/5 hover:text-ink" onClick={onClose} type="button">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-6">
            <fieldset>
              <legend className="text-sm font-semibold text-ink">What kind of evidence is this?</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(Object.entries(evidenceClassInfo) as Array<[Exclude<EvidenceLedgerClass, "">, { label: string; tier: string }]>).map(([key, info]) => (
                  <button
                    aria-pressed={draft.cls === key}
                    className={`rounded-md border px-3 py-3 text-left transition ${draft.cls === key ? "border-[#3f9b82] bg-[#247a65]/15" : "border-mist hover:border-[#3f9b82]/70"}`}
                    key={key}
                    onClick={() => setClass(key)}
                    type="button"
                  >
                    <span className="font-mono text-sm font-bold text-[#68bca3]">{key}</span>
                    <span className="ml-2 text-sm font-semibold text-ink">{info.label}</span>
                    <span className="mt-1 block text-xs text-slate">{info.tier}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {draft.cls && scaledEvidenceClasses.has(draft.cls) ? (
              <label className="block">
                <span className="text-sm font-semibold text-ink">What scale does the source represent?</span>
                <select className={fieldClassName} onChange={(event) => setDraft((current) => ({ ...current, scale: event.target.value as EvidenceLedgerScale }))} value={draft.scale}>
                  <option value="">Omit scale</option>
                  {(Object.entries(evidenceScaleInfo) as Array<[Exclude<EvidenceLedgerScale, "">, string]>).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            ) : null}

            {draft.cls === "P" ? (
              <fieldset className="rounded-md border border-mist/70 p-4">
                <legend className="px-1 text-sm font-semibold text-ink">Patent precision</legend>
                <label className="mt-2 block">
                  <span className="text-xs font-medium text-slate">Publication year</span>
                  <input className={fieldClassName} inputMode="numeric" maxLength={4} onChange={(event) => setDraft((current) => ({ ...current, year: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="2025" value={draft.year} />
                </label>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {([
                    ["q", "Q", "Quantities are precise"],
                    ["f", "F", "Mechanism is precise"],
                    ["s", "S", "Substance identity is precise"],
                    ["c", "C", "Campaign-scale plausibility"],
                  ] as const).map(([field, letter, label]) => (
                    <label className="flex items-center gap-3 rounded-sm border border-mist px-3 py-2.5 text-sm text-ink" key={field}>
                      <input checked={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.checked }))} type="checkbox" />
                      <span><strong className="font-mono text-[#68bca3]">{letter}</strong> - {label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : draft.cls ? (
              <fieldset>
                <legend className="text-sm font-semibold text-ink">Source-specific quality gate</legend>
                <p className="mt-1 text-xs leading-5 text-slate">{evidenceGateInfo[draft.cls]?.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {([
                    [true, "Passed"],
                    [false, "Failed / unverified"],
                    [null, "Not recorded"],
                  ] as const).map(([value, label]) => (
                    <button className={`rounded-sm border px-3 py-2 text-sm font-semibold ${draft.gate === value ? "border-[#3f9b82] bg-[#247a65]/15 text-ink" : "border-mist text-slate"}`} key={label} onClick={() => setDraft((current) => ({ ...current, gate: value }))} type="button">{label}</button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-ink">Route role <span className="font-normal text-slate">(optional)</span></span>
                <input className={fieldClassName} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value.toUpperCase() }))} placeholder="1 or N2" value={draft.role} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink">Route <span className="font-normal text-slate">(optional)</span></span>
                <input className={fieldClassName} onChange={(event) => setDraft((current) => ({ ...current, route: event.target.value.toUpperCase() }))} placeholder="BASE or SENS1" value={draft.route} />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-ink">How is this evidence used?</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([[
                  "PRIM", "Primary evidence"
                ], ["PROXY", "Transparent proxy"], ["EXCL", "Excluded"]] as Array<[EvidenceLedgerOutcome, string]>).map(([value, label]) => (
                  <button className={`rounded-sm border px-3 py-2 text-sm font-semibold ${draft.outcome === value ? "border-[#3f9b82] bg-[#247a65]/15 text-ink" : "border-mist text-slate"}`} key={value} onClick={() => setDraft((current) => ({ ...current, outcome: value }))} type="button">{label}</button>
                ))}
              </div>
              {draft.outcome === "EXCL" ? <input className={fieldClassName} onChange={(event) => setDraft((current) => ({ ...current, exclusionReason: event.target.value }))} placeholder="Reason for exclusion" value={draft.exclusionReason} /> : null}
            </fieldset>

            <label className="block">
              <span className="text-sm font-semibold text-ink">Findable source identifier <span className="font-normal text-slate">(optional)</span></span>
              <span className="mt-1 block text-xs leading-5 text-slate">DOI, patent publication number, report ID, or internal disclosure slug.</span>
              <input className={fieldClassName} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="10.1000/example or WO2025123456A1" value={draft.reference} />
            </label>

            <section className="rounded-md border border-[#3f9b82]/55 bg-[#247a65]/10 p-4" aria-live="polite">
              <div className="text-xs font-semibold uppercase text-[#68bca3]">Generated code</div>
              <div className="mt-2 break-all font-mono text-base font-semibold text-ink">{preview || "Complete the required fields"}</div>
              {description ? <p className="mt-2 text-xs leading-5 text-slate">{description}</p> : null}
              {errors.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-mist/70 px-5 py-4 sm:px-6">
          <button className="rounded-sm px-4 py-2 text-sm font-semibold text-slate hover:bg-white/5 hover:text-ink" onClick={onClose} type="button">Cancel</button>
          <button className="rounded-sm bg-[#247a65] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d6755] disabled:cursor-not-allowed disabled:opacity-45" disabled={errors.length > 0} onClick={() => onApply(finalizeEvidenceLedger(draft))} type="button">Attach evidence code</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function EvidenceLedgerControl({ contextLabel, value, onChange }: EvidenceLedgerControlProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-7 border-t border-mist/60 pt-6">
      {value?.code ? (
        <div className="mb-3 rounded-md border border-[#3f9b82]/45 bg-[#247a65]/10 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase text-[#68bca3]">Evidence code</div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-ink">{value.code}</div>
            </div>
            <button className="text-xs font-semibold text-alert hover:underline" onClick={() => onChange(null)} type="button">Remove</button>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs leading-5 text-slate">Create a compact, traceable code describing the evidence source and how it is used.</p>
      )}
      <button className="w-full rounded-sm bg-[#247a65] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1d6755]" onClick={() => setOpen(true)} type="button">
        {value?.code ? "Edit evidence code" : "Create evidence code"}
      </button>
      {open ? <BuilderDialog contextLabel={contextLabel} initialValue={value} onApply={(entry) => { onChange(entry); setOpen(false); }} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
