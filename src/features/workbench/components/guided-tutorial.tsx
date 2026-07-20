"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TutorialStep = {
  title: string;
  body: string;
  target?: string;
  interactive?: boolean;
  requiresAction?: boolean;
  advanceWhenVisible?: string;
  advanceWhenHidden?: string;
};

const steps: TutorialStep[] = [
  { title: "Project overview", body: "This is the complete project workspace. The left sidebar contains project actions, while the main area shows the activities and their connections.", target: '[data-tutorial="dashboard-page"]' },
  { title: "Application controls", body: "This area identifies the Inventory Builder. You can try the Light and Dark control here before selecting Next.", target: '[data-tutorial="sidebar-brand"]', interactive: true },
  { title: "Project actions", body: "Download, open, report, and new-project commands are kept together in the left sidebar.", target: '[data-tutorial="sidebar-actions"]' },
  { title: "Automatic saving", body: "This status confirms when the current project is stored automatically in this browser.", target: '[data-tutorial="sidebar-save-status"]' },
  { title: "Connected activity system", body: "The main workspace shows how foreground activities form one product system. Inputs from linked activities connect the stages of the value chain.", target: '[data-tutorial="project-workspace"]' },
  { title: "Tree and graph views", body: "Switch between Tree and Graph to inspect the same activity system from two perspectives.", target: '[data-tutorial="structure-view-controls"]', interactive: true },
  { title: "Open the main activity", body: "Select Production of Research GPS box to inspect the activity at the centre of this example.", target: '[data-tutorial="main-activity"]', interactive: true, requiresAction: true },
  { title: "Activity page", body: "This page contains the selected activity's inputs, outputs, scope, sources, and project navigation. Select Next when you are ready to inspect its controls.", target: '[data-tutorial="activity-page"]' },
  { title: "Project structure", body: "The sidebar keeps the full project structure available while you work inside one activity.", target: '[data-tutorial="activity-sidebar"]' },
  { title: "Add an input", body: "Select Add input to describe a material, component, energy flow, service, or other resource used by this activity.", target: '[data-tutorial="add-input"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="row-editor-dialog"]' },
  { title: "Input page", body: "The input editor is organised into Details, Data source, and Documentation. Review the complete form, then select Next to enter the example.", target: '[data-tutorial="row-editor-dialog"]' },
  { title: "Describe the input", body: "Add Polycarbonate for handlers, enter 0.15 as the amount, choose kg, then select Next: Data source.", target: '[data-tutorial="row-editor-dialog"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="row-editor-dataset"]' },
  { title: "Choose a data source", body: "Use ecoinvent for a background dataset, link or import a foreground activity, or choose No suitable dataset to model a new activity.", target: '[data-tutorial="row-editor-dataset"]' },
  { title: "Search ecoinvent", body: "Select Link an ecoinvent dataset to search the background database.", target: '[data-tutorial="ecoinvent-option"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="ecoinvent-dialog"]' },
  { title: "ecoinvent search page", body: "This page searches background datasets and lets you compare activity type, sector, technology, unit, and geography. Select Next to begin the search.", target: '[data-tutorial="ecoinvent-dialog"]' },
  { title: "Search for the main material", body: "Search for polycarbonate rather than the complete component name, then run the search.", target: '[data-tutorial="ecoinvent-search"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="ecoinvent-results"]' },
  { title: "Choose the dataset and geography", body: "Open the first suitable result, choose its geography, and select the European dataset when available.", target: '[data-tutorial="ecoinvent-results"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="linked-dataset"]' },
  { title: "Continue to documentation", body: "The dataset is linked. Select Next: Documentation.", target: '[data-tutorial="row-editor-next-documentation"]', interactive: true, requiresAction: true, advanceWhenVisible: '[data-tutorial="row-editor-notes"]' },
  { title: "Document the amount", body: "Choose Measured, enter “Measured on a scale” as the description, then select Add input.", target: '[data-tutorial="row-editor-dialog"]', interactive: true, requiresAction: true, advanceWhenHidden: '[data-tutorial="row-editor-dialog"]' },
  { title: "Continue with your own system", body: "Explore the completed example. When ready, start a new project and create your own connected activity system." },
];

type GuidedTutorialProps = {
  step: number;
  onStepChange: (step: number) => void;
  onSkip: () => void;
  onKeepExample: () => void;
  onStartNewProject: () => void;
};

export function GuidedTutorial({ step, onStepChange, onSkip, onKeepExample, onStartNewProject }: GuidedTutorialProps) {
  const current = steps[step] ?? steps[0];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const targetWasVisible = useRef(false);
  const advanceTargetWasVisible = useRef(false);
  const lastStep = step === steps.length - 1;
  const previousStep = step === 17 ? 15 : step - 1;

  useEffect(() => {
    targetWasVisible.current = false;
    advanceTargetWasVisible.current = Boolean(
      current.advanceWhenVisible && document.querySelector(current.advanceWhenVisible),
    );
    const update = () => {
      const target = current.target ? document.querySelector<HTMLElement>(current.target) : null;
      const rect = target?.getBoundingClientRect() ?? null;
      const visible = Boolean(rect && rect.width > 0 && rect.height > 0);
      setTargetRect(visible ? rect : null);
      if (visible) targetWasVisible.current = true;

      const advanceTargetVisible = Boolean(
        current.advanceWhenVisible && document.querySelector(current.advanceWhenVisible),
      );
      if (current.advanceWhenVisible && advanceTargetVisible && !advanceTargetWasVisible.current) {
        onStepChange(Math.min(step + 1, steps.length - 1));
        return;
      }
      advanceTargetWasVisible.current = advanceTargetVisible;
      if (current.advanceWhenHidden && targetWasVisible.current && !document.querySelector(current.advanceWhenHidden)) {
        onStepChange(Math.min(step + 1, steps.length - 1));
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const timer = window.setInterval(update, 250);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.clearInterval(timer);
    };
  }, [current, onStepChange, step]);

  useEffect(() => {
    if (!current.target) return undefined;
    const targetSelector = current.target;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      const rect = target?.getBoundingClientRect();
      if (target && rect && rect.height < window.innerHeight * 0.9) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [current.target, step]);

  const spotlight = useMemo(() => {
    if (!targetRect) return null;
    const padding = 7;
    const left = Math.max(0, targetRect.left - padding);
    const top = Math.max(0, targetRect.top - padding);
    const right = Math.min(window.innerWidth, targetRect.right + padding);
    const bottom = Math.min(window.innerHeight, targetRect.bottom + padding);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }, [targetRect]);

  const cardAtTop = Boolean(spotlight && spotlight.top > window.innerHeight * 0.52);
  const arrowPlacement = spotlight?.left && spotlight.left > 54
    ? "left"
    : spotlight?.top && spotlight.top > 54
      ? "top"
      : "bottom";
  const arrowStyle = spotlight
    ? arrowPlacement === "left"
      ? { left: Math.max(8, spotlight.left - 46), top: spotlight.top + Math.max(0, spotlight.height / 2 - 18) }
      : arrowPlacement === "top"
        ? { left: spotlight.left + Math.max(0, spotlight.width / 2 - 18), top: Math.max(8, spotlight.top - 46) }
        : { left: spotlight.left + Math.max(0, spotlight.width / 2 - 18), top: Math.min(window.innerHeight - 44, spotlight.bottom + 8) }
    : undefined;

  return (
    <div aria-live="polite" className="fixed inset-0 z-[120] pointer-events-none">
      {spotlight ? (
        <>
          <div className="pointer-events-auto fixed left-0 right-0 top-0 bg-ink/80 backdrop-blur-[1px]" style={{ height: spotlight.top }} />
          <div className="pointer-events-auto fixed bottom-0 left-0 right-0 bg-ink/80 backdrop-blur-[1px]" style={{ top: spotlight.bottom }} />
          <div className="pointer-events-auto fixed left-0 bg-ink/80 backdrop-blur-[1px]" style={{ top: spotlight.top, width: spotlight.left, height: spotlight.height }} />
          <div className="pointer-events-auto fixed right-0 bg-ink/80 backdrop-blur-[1px]" style={{ top: spotlight.top, left: spotlight.right, height: spotlight.height }} />
          <div className="fixed rounded-md border-2 border-accent shadow-[0_0_0_3px_rgba(196,72,72,0.2)]" style={{ left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height }} />
          {!current.interactive ? <div className="pointer-events-auto fixed" style={{ left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height }} /> : null}
          <div className="fixed grid h-9 w-9 place-items-center rounded-full bg-accent text-xl font-bold text-white shadow-lg" style={arrowStyle} aria-hidden="true">{arrowPlacement === "left" ? "→" : arrowPlacement === "top" ? "↓" : "↑"}</div>
        </>
      ) : <div className="pointer-events-auto fixed inset-0 bg-ink/80 backdrop-blur-[1px]" />}

      <section className={`pointer-events-auto fixed left-1/2 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-white/20 bg-white p-5 shadow-2xl ${cardAtTop ? "top-4" : "bottom-4"}`} role="dialog" aria-label="Guided tutorial">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-semibold uppercase text-accent">Tutorial · {step + 1} of {steps.length}</span>
          <button className="text-xs font-semibold text-slate transition hover:text-ink" onClick={onSkip} type="button">Skip tutorial</button>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-ink">{current.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate">{current.body}</p>
        {current.requiresAction ? <p className="mt-2 text-xs font-semibold text-accent">Use the highlighted area to continue.</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {lastStep ? <span /> : <button className="rounded-md border border-mist px-3 py-2 text-sm font-semibold text-slate transition hover:border-slate hover:text-ink disabled:opacity-40" disabled={step === 0} onClick={() => onStepChange(previousStep)} type="button">Previous</button>}
          {lastStep ? (
            <div className="flex flex-wrap gap-2">
              <button className="rounded-md border border-mist px-3 py-2 text-sm font-semibold text-slate transition hover:border-slate hover:text-ink" onClick={onKeepExample} type="button">Keep exploring example</button>
              <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]" onClick={onStartNewProject} type="button">Start my project</button>
            </div>
          ) : current.requiresAction ? null : (
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ad4141]" onClick={() => onStepChange(step + 1)} type="button">Next</button>
          )}
        </div>
      </section>
    </div>
  );
}
