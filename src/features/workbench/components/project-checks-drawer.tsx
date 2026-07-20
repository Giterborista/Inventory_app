"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ProjectIssueSeverity, ProjectValidationIssue } from "@/features/workbench/selectors";
import type { ProjectRecord } from "@/features/workbench/types";

export type ProjectChecksFilter = "all" | ProjectIssueSeverity;

type ProjectChecksDrawerProps = {
  open: boolean;
  project: ProjectRecord;
  issues: ProjectValidationIssue[];
  filter: ProjectChecksFilter;
  activityFilterId: string;
  onFilterChange: (filter: ProjectChecksFilter) => void;
  onClearActivityFilter: () => void;
  onClose: () => void;
  onOpenIssue: (issue: ProjectValidationIssue) => void;
};

function activityLabel(project: ProjectRecord, activityId: string) {
  const activity = project.molecules.find((candidate) => candidate.id === activityId);
  if (!activity) return "Unknown activity";
  return activity.name || "Untitled activity";
}

function actionLabel(issue: ProjectValidationIssue) {
  if (issue.target.field === "connection") return "Fix";
  if (issue.target.tab === "scope") return "Open scope & sources";
  if (issue.target.flowId) return issue.target.tab === "outputs" ? "Open output" : "Open input";
  return issue.target.tab === "outputs" ? "Open outputs" : "Open inputs";
}

export function ProjectChecksDrawer({
  open,
  project,
  issues,
  filter,
  activityFilterId,
  onFilterChange,
  onClearActivityFilter,
  onClose,
  onOpenIssue,
}: ProjectChecksDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [connectionGuideIssue, setConnectionGuideIssue] = useState<ProjectValidationIssue | null>(null);
  const affectedActivityCount = new Set(issues.map((issue) => issue.activityId)).size;
  const filteredIssues = useMemo(
    () => issues.filter((issue) =>
      (filter === "all" || issue.severity === filter) &&
      (!activityFilterId || issue.activityId === activityFilterId),
    ),
    [activityFilterId, filter, issues],
  );
  const groupedIssues = useMemo(() => {
    const groups = new Map<string, ProjectValidationIssue[]>();
    filteredIssues.forEach((issue) => groups.set(issue.activityId, [...(groups.get(issue.activityId) ?? []), issue]));
    return [...groups.entries()];
  }, [filteredIssues]);

  useEffect(() => {
    if (!open) return;
    setConnectionGuideIssue(null);
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const closeDrawer = () => {
    setConnectionGuideIssue(null);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <button aria-label="Close error center" className="absolute inset-0 cursor-default bg-ink/20" onClick={closeDrawer} type="button" />
      <aside
        aria-labelledby="error-center-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-[min(31rem,100vw)] flex-col border-l border-mist bg-white"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-mist/70 px-5 py-5">
          <div>
            <h2 className="text-lg font-semibold text-ink" id="error-center-title">Error center</h2>
            <p className="mt-1 text-sm text-slate" aria-live="polite">
              {issues.length > 0
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"} across ${affectedActivityCount} activit${affectedActivityCount === 1 ? "y" : "ies"}`
                : "All current activity checks have passed."}
            </p>
          </div>
          <button ref={closeButtonRef} aria-label="Close error center" className="grid h-9 w-9 place-items-center rounded-md border border-mist/70 text-lg text-slate hover:bg-lab hover:text-ink" onClick={closeDrawer} type="button">×</button>
        </header>

        {connectionGuideIssue ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <button className="text-xs font-semibold text-slate transition hover:text-ink" onClick={() => setConnectionGuideIssue(null)} type="button">← Back to issues</button>
            <h3 className="mt-5 text-lg font-semibold text-ink">How to connect activities</h3>
            <p className="mt-2 text-sm leading-6 text-slate">
              Activities become connected when the main output of one activity is used as an input by another activity.
            </p>
            <ol className="mt-5 space-y-4 text-sm leading-6 text-slate">
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lab text-xs font-semibold text-ink">1</span><span>Open the activity that uses the other activity&apos;s main output.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lab text-xs font-semibold text-ink">2</span><span>Select <strong className="text-ink">Add input</strong>.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lab text-xs font-semibold text-ink">3</span><span>In Data source, choose the second option: <strong className="text-ink">Link or import an activity</strong>.</span></li>
              <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lab text-xs font-semibold text-ink">4</span><span>Search for the supplying activity, select it, and save the input.</span></li>
            </ol>
            <div className="mt-5 border-l-2 border-accent bg-accent-soft/50 px-4 py-3 text-xs leading-5 text-slate">
              No direction is assumed. Continue only if this activity uses another activity&apos;s main output. Otherwise, return to the errors and select Fix for the other disconnected activity.
            </div>
            <button
              className="mt-6 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]"
              onClick={() => onOpenIssue(connectionGuideIssue)}
              type="button"
            >
              Open this activity&apos;s inputs
            </button>
          </div>
        ) : issues.length === 0 ? (
          <div className="px-5 py-6">
            <p className="text-sm font-medium text-ink">All current activity checks have passed.</p>
            <p className="mt-2 text-sm text-slate">Checks update automatically as the project changes.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-mist/60 px-5 py-3">
              <div aria-label="Filter project issues" className="flex flex-wrap items-center gap-1" role="group">
                {(["all", "error", "warning"] as const).map((value) => (
                  <button
                    aria-pressed={filter === value}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-lab text-ink ring-1 ring-mist" : "text-slate hover:bg-lab hover:text-ink"}`}
                    key={value}
                    onClick={() => onFilterChange(value)}
                    type="button"
                  >
                    {value === "all" ? "All" : value === "error" ? "Errors" : "Warnings"}
                  </button>
                ))}
              </div>
              {activityFilterId ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-mist/70 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-slate">Activity: <strong className="font-semibold text-ink">{activityLabel(project, activityFilterId)}</strong></span>
                  <button className="shrink-0 font-semibold text-accent hover:underline" onClick={onClearActivityFilter} type="button">Show all</button>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {groupedIssues.length > 0 ? groupedIssues.map(([activityId, activityIssues]) => (
                <details className="border-b border-mist/60" key={activityId} open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm">
                    <span className="min-w-0 truncate font-semibold text-ink">{activityLabel(project, activityId)}</span>
                    <span className="shrink-0 text-xs font-semibold text-alert">{activityIssues.length} issue{activityIssues.length === 1 ? "" : "s"}</span>
                  </summary>
                  <div className="pb-3">
                    {activityIssues.map((issue) => (
                      <div className="border-t border-mist/50 py-3 pl-1" key={issue.id}>
                        <div className="flex items-start gap-3">
                          <span aria-label={issue.severity} className={`mt-1 h-2 w-2 shrink-0 rounded-full ${issue.severity === "error" ? "bg-alert" : "bg-scale-2"}`} role="img" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm leading-5 text-ink">{issue.message}</p>
                            <button className="mt-1.5 text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" onClick={() => issue.target.field === "connection" ? setConnectionGuideIssue(issue) : onOpenIssue(issue)} type="button">
                              {actionLabel(issue)}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )) : (
                <p className="py-5 text-sm text-slate">No issues match the selected filter.</p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
