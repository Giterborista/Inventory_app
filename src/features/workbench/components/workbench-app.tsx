"use client";

import { useEffect, useState } from "react";

import { CreateMoleculeDialog } from "@/features/workbench/components/create-molecule-dialog";
import { Dashboard } from "@/features/workbench/components/dashboard";
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
import { getHierarchySearchMatches, getMoleculeById, getUnresolvedMolecules } from "@/features/workbench/selectors";
import { createEmptyWorkbenchState, nowIso } from "@/features/workbench/state-utils";
import type { MoleculeDraft, ReconstructionSection, WorkbenchState } from "@/features/workbench/types";

type SessionState = "clean" | "dirty" | "opened" | "saved";
type UndoState = {
  label: string;
  state: WorkbenchState;
} | null;

export function WorkbenchApp() {
  const [state, setState] = useState<WorkbenchState>(() => createEmptyWorkbenchState());
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionState, setSessionState] = useState<SessionState>("clean");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogTitle, setCreateDialogTitle] = useState("Create activity");
  const [createDialogDescription, setCreateDialogDescription] = useState("");
  const [createDialogSubmitLabel, setCreateDialogSubmitLabel] = useState("Create activity");
  const [createDialogInitialValues, setCreateDialogInitialValues] = useState<Partial<MoleculeDraft>>({});
  const [pendingParentChildId, setPendingParentChildId] = useState<string | null>(null);
  const [autoOpenRowEditorSection, setAutoOpenRowEditorSection] = useState<ReconstructionSection | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [isExportingProjectPdf, setIsExportingProjectPdf] = useState(false);
  const [supportiveInformationDialogOpen, setSupportiveInformationDialogOpen] = useState(false);

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

    return window.confirm("Replace the current session? Unsaved JSON changes will be lost.");
  };

  const selectedMolecule = getMoleculeById(state.project, state.selectedMoleculeId);
  const filteredMolecules = getHierarchySearchMatches(state.project, searchQuery);
  const unresolvedMolecules = getUnresolvedMolecules(state.project);

  const openMolecule = (moleculeId: string) => {
    setAutoOpenRowEditorSection(null);
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), moleculeId), {
      markDirty: false,
    });
  };

  const openInputRowEditorForMolecule = (moleculeId: string) => {
    setAutoOpenRowEditorSection("INPUT");
    applyStateChange((current) => selectMolecule(ensureLinkedObjectReferenceOutputs(current), moleculeId), {
      markDirty: false,
    });
  };

  const closeObjectInventory = () => {
    applyStateChange((current) => selectMolecule(current, null), { markDirty: false });
  };

  const openCreateDialog = (initialValues?: Partial<MoleculeDraft>) => {
    setCreateDialogTitle("Create activity");
    setCreateDialogDescription("");
    setCreateDialogSubmitLabel("Create activity");
    setCreateDialogInitialValues(initialValues ?? {});
    setPendingParentChildId(null);
    setCreateDialogOpen(true);
  };

  const openCreateParentDialog = (childMoleculeId: string) => {
    setCreateDialogTitle("Create parent activity");
    setCreateDialogDescription("");
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
    objectKind: draft.objectKind ?? "generic_object",
    name: (draft.referenceProductName || draft.name)?.trim() || "Untitled activity",
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
    if (!window.confirm("Start a new empty project? Unsaved session changes will be replaced.")) {
      return;
    }

    replaceSessionState(createEmptyWorkbenchState(), "clean");
    setSearchQuery("");
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
          autoOpenRowEditor={autoOpenRowEditorSection}
          onAutoOpenRowEditorHandled={() => setAutoOpenRowEditorSection(null)}
          onBack={closeObjectInventory}
          onDelete={() => {
            if (!window.confirm(`Delete ${selectedMolecule.name}? This will unlink it from any parent rows.`)) {
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
            applyStateChange((current) =>
              createMolecule(current, completeMoleculeDraft({ topLevel: false, ...draft }), {
                parentMoleculeId: selectedMolecule.id,
                sourceRowId: rowId,
                navigateToNew: false,
              }),
            );
          }}
          onApplyPasDefaults={(profile) =>
            applyStateChange((current) => applyPasDefaults(current, selectedMolecule.id, profile))
          }
          onOpenMolecule={openMolecule}
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
          onAddInputRow={openInputRowEditorForMolecule}
          onCreateParentMolecule={openCreateParentDialog}
          filteredMolecules={filteredMolecules}
          isExportingProjectPdf={isExportingProjectPdf}
          onCreateMolecule={() => openCreateDialog()}
          onNewProject={createNewProject}
          onOpenMolecule={openMolecule}
          onOpenProjectJson={(file) => void openProjectJson(file)}
          onOpenProjectReport={() => setSupportiveInformationDialogOpen(true)}
          onSaveProjectJson={downloadProjectJson}
          onUpdateProjectName={(value) =>
            applyStateChange((current) => updateProjectName(current, value))
          }
          onSearchQueryChange={setSearchQuery}
          project={state.project}
          searchQuery={searchQuery}
          unresolvedMolecules={unresolvedMolecules}
        />
      )}

      <SupportiveInformationDialog
        isExporting={isExportingProjectPdf}
        onClose={() => setSupportiveInformationDialogOpen(false)}
        onSubmit={(files) => void openProjectDossier(files)}
        open={supportiveInformationDialogOpen}
      />

      <CreateMoleculeDialog
        description={createDialogDescription}
        initialValues={createDialogInitialValues}
        onClose={() => {
          setCreateDialogOpen(false);
          setPendingParentChildId(null);
        }}
        onImportJson={(file) =>
          void handleImportSubtree(file, {
            replaceMoleculeId: pendingParentChildId ?? undefined,
            navigateToImported: true,
          })
        }
        onSubmit={handleCreateMolecule}
        open={createDialogOpen}
        showImportOption={!pendingParentChildId}
        submitLabel={createDialogSubmitLabel}
        title={createDialogTitle}
      />

      {undoState ? (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-4 rounded-full border border-mist/80 bg-white px-5 py-3 shadow-xl">
          <span className="text-sm text-ink">{undoState.label}</span>
          <button
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent"
            onClick={() => {
              setState(undoState.state);
              setSessionState("dirty");
              setUndoState(null);
            }}
            type="button"
          >
            Undo
          </button>
          <button
            className="text-sm text-slate transition hover:text-ink"
            onClick={() => setUndoState(null)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </>
  );
}
