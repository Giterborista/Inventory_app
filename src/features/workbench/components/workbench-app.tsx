"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateMoleculeDialog } from "@/features/workbench/components/create-molecule-dialog";
import { Dashboard } from "@/features/workbench/components/dashboard";
import { GuidedTutorial } from "@/features/workbench/components/guided-tutorial";
import type { ProjectChecksFilter } from "@/features/workbench/components/project-checks-drawer";
import type { InventoryFixRequest } from "@/features/workbench/components/reconstruction-table";
import { ObjectInventory } from "@/features/workbench/components/object-inventory";
import { SupportiveInformationDialog } from "@/features/workbench/components/supportive-information-dialog";
import {
  applyPasDefaults,
  addManualParentLink,
  createMolecule,
  deleteMolecule,
  deleteReconstructionRow,
  ensureLinkedObjectReferenceOutput,
  ensureLinkedObjectReferenceOutputs,
  importMoleculeSubtree,
  rescaleMoleculeRows,
  saveReconstructionRow,
  selectMolecule,
  updateProjectName,
  updateDocumentation,
  updateMoleculeField,
} from "@/features/workbench/operations";
import {
  buildProjectPdfExport,
  buildProjectJsonExport,
  downloadBrowserFile,
  loadProjectJsonFile,
} from "@/features/workbench/exporters";
import { getHierarchySearchMatches, getMoleculeById, getProjectSearchResults, getUnresolvedMolecules, validateProject } from "@/features/workbench/selectors";
import type { ProjectSearchResult, ProjectValidationIssue } from "@/features/workbench/selectors";
import { createEmptyWorkbenchState, makeClientId, nowIso } from "@/features/workbench/state-utils";
import type { MoleculeDraft, ReconstructionRow, ReconstructionSection, WorkbenchState } from "@/features/workbench/types";

type SessionState = "clean" | "dirty" | "opened" | "saved";
type UndoState = {
  label: string;
  state: WorkbenchState;
} | null;

const BROWSER_DRAFT_KEY = "proxy-reconstruction-studio:project-draft:v1";

export function WorkbenchApp() {
  const [state, setState] = useState<WorkbenchState>(() => createEmptyWorkbenchState());
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionState, setSessionState] = useState<SessionState>("clean");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogTitle, setCreateDialogTitle] = useState("Create activity");
  const [createDialogSubmitLabel, setCreateDialogSubmitLabel] = useState("Create activity");
  const [createDialogInitialValues, setCreateDialogInitialValues] = useState<Partial<MoleculeDraft>>({});
  const [pendingParentChildId, setPendingParentChildId] = useState<string | null>(null);
  const [autoOpenRowEditorSection, setAutoOpenRowEditorSection] = useState<ReconstructionSection | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [isExportingProjectPdf, setIsExportingProjectPdf] = useState(false);
  const [supportiveInformationDialogOpen, setSupportiveInformationDialogOpen] = useState(false);
  const [browserDraftReady, setBrowserDraftReady] = useState(false);
  const [browserDraftRecovered, setBrowserDraftRecovered] = useState(false);
  const [projectChecksOpen, setProjectChecksOpen] = useState(false);
  const [projectChecksFilter, setProjectChecksFilter] = useState<ProjectChecksFilter>("all");
  const [projectChecksActivityId, setProjectChecksActivityId] = useState("");
  const [pendingProjectIssue, setPendingProjectIssue] = useState<ProjectValidationIssue | null>(null);
  const [pendingSearchFocus, setPendingSearchFocus] = useState<{ activityId: string; request: InventoryFixRequest } | null>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const browserDraftSaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!undoState) return;
    const timer = window.setTimeout(() => setUndoState(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoState]);

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(BROWSER_DRAFT_KEY);
      if (savedDraft) {
        const draftFile = new File([savedDraft], "browser-draft.json", { type: "application/json" });
        void loadProjectJsonFile(draftFile).then((recoveredState) => {
          const hasMeaningfulDraft =
            recoveredState.project.molecules.length > 0 ||
            recoveredState.project.name.trim() !== "Untitled proxy project";
          if (hasMeaningfulDraft) {
            setState(ensureLinkedObjectReferenceOutputs(recoveredState));
            setSessionState("opened");
            setBrowserDraftRecovered(true);
          }
          setBrowserDraftReady(true);
        }).catch(() => setBrowserDraftReady(true));
        return;
      }
    } catch {
      // Browser storage may be disabled. The downloadable JSON workflow remains available.
    }
    setBrowserDraftReady(true);
  }, []);

  useEffect(() => {
    if (!browserDraftReady) {
      return undefined;
    }

    if (browserDraftSaveTimer.current !== null) {
      window.clearTimeout(browserDraftSaveTimer.current);
    }
    browserDraftSaveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(BROWSER_DRAFT_KEY, buildProjectJsonExport(state.project).content);
      } catch {
        // Downloadable project JSON remains the fallback when browser storage is unavailable.
      }
    }, 250);

    return () => {
      if (browserDraftSaveTimer.current !== null) {
        window.clearTimeout(browserDraftSaveTimer.current);
      }
    };
  }, [browserDraftReady, state.project]);

  useEffect(() => {
    if (sessionState !== "dirty") {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sessionState]);

  const applyStateChange = (
    updater: (current: WorkbenchState) => WorkbenchState,
    options?: {
      markDirty?: boolean;
    },
  ) => {
    setState((current) => updater(current));
    if (options?.markDirty ?? true) {
      setSessionState("dirty");
    }
  };

  const replaceSessionState = (nextState: WorkbenchState, nextSessionState: Exclude<SessionState, "dirty">) => {
    setState(nextState);
    setSessionState(nextSessionState);
    setUndoState(null);
    setBrowserDraftRecovered(false);
  };

  const downloadProjectJson = () => {
    const projectJson = buildProjectJsonExport(state.project);
    downloadBrowserFile(projectJson.fileName, projectJson.mimeType, projectJson.content);
    setSessionState("saved");
  };

  const confirmDiscardUnsavedChanges = () => {
    if (sessionState !== "dirty") {
      return true;
    }

    return window.confirm(
      "Open another project? The current browser draft will be replaced. Export JSON first if you need to keep or share it.",
    );
  };

  const selectedMolecule = getMoleculeById(state.project, state.selectedMoleculeId);
  const pendingParentSource = pendingParentChildId
    ? state.project.molecules.find((molecule) => molecule.id === pendingParentChildId) ?? null
    : null;
  const filteredMolecules = getHierarchySearchMatches(state.project, searchQuery);
  const searchResults = useMemo(() => getProjectSearchResults(state.project, searchQuery), [searchQuery, state.project]);
  const unresolvedMolecules = getUnresolvedMolecules(state.project);
  const projectIssues = useMemo(() => validateProject(state.project), [state.project]);

  const navigateTutorial = useCallback((nextStep: number) => {
    setTutorialStep(nextStep);
    setState((current) => {
      const mainActivity = current.project.molecules.find((molecule) => molecule.topLevel) ?? current.project.molecules[0];
      if (nextStep <= 6) return selectMolecule(current, null);
      if (mainActivity) return selectMolecule(current, mainActivity.id);
      return current;
    });
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("lci:tutorial-step", { detail: { step: nextStep } })), 0);
  }, []);

  const startTutorial = async () => {
    if (!confirmDiscardUnsavedChanges()) return;
    try {
      const response = await fetch("/tutorials/gps-tracker-embedded-in-a-3dprinted-box.json");
      if (!response.ok) throw new Error("The example project could not be loaded.");
      const file = new File([await response.blob()], "gps-tracker-embedded-in-a-3dprinted-box.json", { type: "application/json" });
      const tutorialState = ensureLinkedObjectReferenceOutputs(await loadProjectJsonFile(file));
      replaceSessionState(selectMolecule(tutorialState, null), "opened");
      setSearchQuery("");
      setTutorialStep(0);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The example project could not be loaded.");
    }
  };

  const openMolecule = (moleculeId: string) => {
    setAutoOpenRowEditorSection(null);
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), moleculeId), {
      markDirty: false,
    });
    if (tutorialStep === 6) navigateTutorial(7);
  };

  const openProjectSearchResult = (result: ProjectSearchResult) => {
    if (result.kind === "activity" || !result.rowId || !result.section) {
      openMolecule(result.activityId);
      return;
    }

    setAutoOpenRowEditorSection(null);
    setPendingSearchFocus({
      activityId: result.activityId,
      request: {
        key: Date.now(),
        kind: "row",
        section: result.section,
        rowId: result.rowId,
        panel: result.kind === "ecoinvent_dataset" ? "dataset" : "details",
      },
    });
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), result.activityId), {
      markDirty: false,
    });
  };

  const openMoleculeForFix = (moleculeId: string, section: ReconstructionSection) => {
    setAutoOpenRowEditorSection(section);
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), moleculeId), {
      markDirty: false,
    });
  };

  const openProjectIssue = (issue: ProjectValidationIssue) => {
    setPendingProjectIssue(issue);
    const targetActivityId = issue.target.activityId ?? issue.activityId;
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), targetActivityId), {
      markDirty: false,
    });
  };

  const closeObjectInventory = () => {
    applyStateChange((current) => selectMolecule(current, null), { markDirty: false });
  };

  const openCreateDialog = (parentMoleculeId?: string) => {
    const isFirstActivity = state.project.molecules.length === 0 && !parentMoleculeId;
    setCreateDialogTitle(parentMoleculeId ? "Add child activity" : isFirstActivity ? "Add first activity" : "Add activity");
    setCreateDialogSubmitLabel(parentMoleculeId ? "Add child activity" : isFirstActivity ? "Add" : "Add activity");
    setCreateDialogInitialValues(parentMoleculeId ? { topLevel: false, parentMoleculeId } : { topLevel: true, parentMoleculeId: "" });
    setPendingParentChildId(null);
    setCreateDialogOpen(true);
  };

  const openCreateParentDialog = (childMoleculeId: string) => {
    setCreateDialogTitle("Create parent activity");
    setCreateDialogSubmitLabel("Create activity");
    setCreateDialogInitialValues({ topLevel: true });
    setPendingParentChildId(childMoleculeId);
    setCreateDialogOpen(true);
  };

  const handleImportSubtree = async (
    file: File,
    options?: {
      replaceMoleculeId?: string;
      navigateToImported?: boolean;
    },
  ) => {
    try {
      const importedState = await loadProjectJsonFile(file);
      applyStateChange((current) =>
        importMoleculeSubtree(current, importedState, {
          replaceMoleculeId: options?.replaceMoleculeId,
          navigateToImported: options?.navigateToImported,
        }),
      );
      setCreateDialogOpen(false);
      setPendingParentChildId(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The selected JSON subtree could not be imported.";
      window.alert(message);
    }
  };

  const handleImportActivityForInput = async (
    file: File,
    parentMoleculeId: string,
    rowId: string,
    values: Partial<ReconstructionRow> & { section: ReconstructionSection },
  ) => {
    const importedState = await loadProjectJsonFile(file);
    applyStateChange((current) => {
      const rowExists = current.project.molecules
        .find((molecule) => molecule.id === parentMoleculeId)
        ?.rows.some((row) => row.id === rowId);
      return importMoleculeSubtree(current, importedState, {
        parentMoleculeId,
        sourceRowId: rowExists ? rowId : undefined,
        rowValues: rowExists ? undefined : {
          totalValue: values.totalValue ?? "",
          unit: values.unit ?? "kg",
          reference: values.reference ?? "",
          description: values.description ?? "",
          notes: values.notes ?? "",
        },
        navigateToImported: false,
      });
    });
  };

  const handleCreateMolecule = (draft: MoleculeDraft) => {
    applyStateChange((current) =>
      createMolecule(current, draft, {
        childMoleculeId: pendingParentChildId ?? undefined,
        navigateToNew: true,
      }),
    );

    setCreateDialogOpen(false);
    setPendingParentChildId(null);
  };

  const completeMoleculeDraft = (draft: Partial<MoleculeDraft>): MoleculeDraft => ({
    activityType: draft.activityType?.trim() || "Production of",
    referenceProductName: (draft.referenceProductName || draft.name)?.trim() || "Untitled activity",
    referenceAmount: draft.referenceAmount?.trim() || "1",
    referenceUnit: draft.referenceUnit?.trim() || "kg",
    objectKind: draft.objectKind ?? "generic_object",
    name: draft.name?.trim() || `Production of ${(draft.referenceProductName || "Untitled output").trim()}`,
    cas: draft.cas ?? "",
    iupac: draft.iupac ?? "",
    smiles: draft.smiles ?? "",
    synonyms: draft.synonyms ?? "",
    ecoinventAliases: draft.ecoinventAliases ?? "",
    notes: draft.notes ?? "",
    ecoinventStatus: draft.ecoinventStatus ?? "unchecked",
    topLevel: draft.topLevel ?? false,
    parentMoleculeId: draft.parentMoleculeId ?? "",
    pubchemMatch: draft.pubchemMatch ?? null,
    ecoinventCheck: draft.ecoinventCheck ?? null,
  });

  const openProjectJson = async (file: File) => {
    if (!confirmDiscardUnsavedChanges()) {
      return;
    }

    try {
      const nextState = ensureLinkedObjectReferenceOutputs(await loadProjectJsonFile(file));
      replaceSessionState(nextState, "opened");
      setSearchQuery("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The selected JSON file could not be opened.";
      window.alert(message);
    }
  };

  const createNewProject = () => {
    const hasCurrentProject =
      state.project.molecules.length > 0 || state.project.name.trim() !== "Untitled proxy project";
    if (
      hasCurrentProject &&
      !window.confirm(
        "Start a new empty project? The current browser draft will be replaced. Export JSON first if you need to keep it.",
      )
    ) {
      return;
    }

    replaceSessionState(createEmptyWorkbenchState(), "clean");
    setSearchQuery("");
    setProjectChecksOpen(false);
    setProjectChecksActivityId("");
    setPendingProjectIssue(null);
  };

  const openProjectDossier = async (supportiveFiles: File[] = []) => {
    setIsExportingProjectPdf(true);
    try {
      const exportedAt = nowIso();
      const report = await buildProjectPdfExport(state.project, exportedAt, supportiveFiles);
      downloadBrowserFile(report.fileName, report.mimeType, report.content);
      setSupportiveInformationDialogOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The minimum project dossier PDF could not be generated.";
      window.alert(message);
    } finally {
      setIsExportingProjectPdf(false);
    }
  };

  return (
    <>
      {selectedMolecule ? (
        <ObjectInventory
          molecule={selectedMolecule}
          projectIssueFocus={pendingProjectIssue}
          onProjectIssueFocusHandled={() => setPendingProjectIssue(null)}
          searchFocusRequest={pendingSearchFocus?.activityId === selectedMolecule.id ? pendingSearchFocus.request : null}
          onSearchFocusRequestHandled={() => setPendingSearchFocus(null)}
          autoOpenRowEditor={autoOpenRowEditorSection}
          onAutoOpenRowEditorHandled={() => setAutoOpenRowEditorSection(null)}
          onBack={closeObjectInventory}
          onDelete={() => {
            if (!window.confirm(`Delete ${selectedMolecule.name}? It will be removed from the project and unlinked from every parent activity.`)) {
              return;
            }
            applyStateChange((current) => {
              setUndoState({
                label: `Deleted activity ${selectedMolecule.name}`,
                state: current,
              });
              return deleteMolecule(current, selectedMolecule.id);
            });
          }}
          onDeleteRow={(rowId) =>
            applyStateChange((current) => {
              const row = selectedMolecule.rows.find((item) => item.id === rowId);
              setUndoState({
                label: `Deleted row ${row?.name || rowId}`,
                state: current,
              });
              return deleteReconstructionRow(current, selectedMolecule.id, rowId);
            })
          }
          onCreateChildFromRow={(rowId, _values, draft) => {
            const newMoleculeId = makeClientId("molecule");
            applyStateChange((current) =>
              createMolecule(current, completeMoleculeDraft({ topLevel: false, ...draft }), {
                parentMoleculeId: selectedMolecule.id,
                sourceRowId: rowId,
                navigateToNew: false,
                newMoleculeId,
              }),
            );
            return newMoleculeId;
          }}
          onImportActivityFromFile={(file, rowId, values) => handleImportActivityForInput(file, selectedMolecule.id, rowId, values)}
          onApplyPasDefaults={(profile) =>
            applyStateChange((current) => applyPasDefaults(current, selectedMolecule.id, profile))
          }
          onOpenMolecule={openMolecule}
          onOpenMoleculeForFix={openMoleculeForFix}
          onRescaleRows={() =>
            applyStateChange((current) => rescaleMoleculeRows(current, selectedMolecule.id))
          }
          onSaveProjectJson={downloadProjectJson}
          onSaveRow={(section, values, rowId) =>
            applyStateChange((current) => {
              const nextState = saveReconstructionRow(current, selectedMolecule.id, section, values, rowId);
              if (section === "INPUT" && values.linkedMoleculeId) {
                const linkedState = addManualParentLink(nextState, values.linkedMoleculeId, selectedMolecule.id);
                const savedRowId = rowId ?? values.id;
                return savedRowId
                  ? ensureLinkedObjectReferenceOutput(linkedState, selectedMolecule.id, savedRowId)
                  : linkedState;
              }
              return nextState;
            })
          }
          onUpdateDocumentation={(field, value) =>
            applyStateChange((current) => updateDocumentation(current, selectedMolecule.id, field, value))
          }
          onUpdateMoleculeField={(field, value) =>
            applyStateChange((current) => updateMoleculeField(current, selectedMolecule.id, field, value))
          }
          project={state.project}
        />
      ) : (
        <Dashboard
          onCreateParentMolecule={openCreateParentDialog}
          filteredMolecules={filteredMolecules}
          isExportingProjectPdf={isExportingProjectPdf}
          onCreateMolecule={(parentMoleculeId) => openCreateDialog(parentMoleculeId)}
          onNewProject={createNewProject}
          onOpenMolecule={openMolecule}
          onOpenSearchResult={openProjectSearchResult}
          onStartTutorial={() => void startTutorial()}
          onOpenProjectJson={(file) => void openProjectJson(file)}
          onOpenProjectReport={() => setSupportiveInformationDialogOpen(true)}
          onSaveProjectJson={downloadProjectJson}
          onUpdateProjectName={(value) =>
            applyStateChange((current) => updateProjectName(current, value))
          }
          onSearchQueryChange={setSearchQuery}
          project={state.project}
          searchQuery={searchQuery}
          searchResults={searchResults}
          unresolvedMolecules={unresolvedMolecules}
          browserDraftRecovered={browserDraftRecovered}
          projectChecksActivityId={projectChecksActivityId}
          projectChecksFilter={projectChecksFilter}
          projectChecksOpen={projectChecksOpen}
          projectIssues={projectIssues}
          onOpenProjectIssue={openProjectIssue}
          onProjectChecksActivityChange={setProjectChecksActivityId}
          onProjectChecksFilterChange={setProjectChecksFilter}
          onProjectChecksOpenChange={setProjectChecksOpen}
          saveStatusLabel={
            sessionState === "dirty"
              ? "Saved automatically in this browser"
              : sessionState === "saved"
                ? "Project downloaded"
                : browserDraftRecovered
                  ? "Recovered from this browser"
                  : "Saved automatically in this browser"
          }
        />
      )}

      <SupportiveInformationDialog
        isExporting={isExportingProjectPdf}
        onClose={() => setSupportiveInformationDialogOpen(false)}
        onSubmit={(files) => void openProjectDossier(files)}
        open={supportiveInformationDialogOpen}
      />

      <CreateMoleculeDialog
        initialValues={createDialogInitialValues}
        onClose={() => {
          setCreateDialogOpen(false);
          setPendingParentChildId(null);
        }}
        onSubmit={handleCreateMolecule}
        open={createDialogOpen}
        parentSourceActivity={pendingParentSource ? {
          activityName: pendingParentSource.name || "Untitled activity",
          outputName: pendingParentSource.referenceProductName || pendingParentSource.name,
        } : undefined}
        showGettingStartedGuidance={state.project.molecules.length === 0}
        submitLabel={createDialogSubmitLabel}
        title={createDialogTitle}
      />

      {tutorialStep !== null ? (
        <GuidedTutorial
          onKeepExample={() => setTutorialStep(null)}
          onSkip={() => setTutorialStep(null)}
          onStartNewProject={() => {
            replaceSessionState(createEmptyWorkbenchState(), "clean");
            setSearchQuery("");
            setTutorialStep(null);
          }}
          onStepChange={navigateTutorial}
          step={tutorialStep}
        />
      ) : null}

      {undoState ? (
        <div
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[70] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-4 rounded-lg border border-mist/80 bg-white py-3 pl-4 pr-12 shadow-xl"
          role="status"
        >
          <span className="min-w-0 flex-1 text-sm text-ink">{undoState.label}</span>
          <button
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1f4b87]"
            onClick={() => {
              setState(undoState.state);
              setSessionState("dirty");
              setUndoState(null);
            }}
            type="button"
          >
            Recover
          </button>
          <button
            aria-label="Dismiss deletion message"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-slate transition hover:bg-lab hover:text-ink"
            onClick={() => setUndoState(null)}
            type="button"
          >
            <svg aria-hidden="true" className="absolute inset-0 h-8 w-8 -rotate-90" viewBox="0 0 32 32">
              <circle className="undo-countdown-track" cx="16" cy="16" fill="none" r="13" strokeWidth="1.5" />
              <circle className="undo-countdown-ring" cx="16" cy="16" fill="none" pathLength="100" r="13" strokeLinecap="round" strokeWidth="1.5" />
            </svg>
            <span aria-hidden="true" className="relative text-base leading-none">×</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
