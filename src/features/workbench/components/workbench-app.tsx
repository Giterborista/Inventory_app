"use client";

import { useEffect, useState } from "react";

import {
  ChildDependencyDialog,
  type ChildDependencyRowDraft,
  type ChildDependencySubmission,
} from "@/features/workbench/components/child-dependency-dialog";
import { CreateMoleculeDialog } from "@/features/workbench/components/create-molecule-dialog";
import { Dashboard } from "@/features/workbench/components/dashboard";
import { MoleculeWorkspace } from "@/features/workbench/components/molecule-workspace";
import {
  addManualParentLink,
  applyPasDefaults,
  addEvidenceRecord,
  createChildDependency,
  createMolecule,
  deleteMolecule,
  deleteReconstructionRow,
  importMoleculeSubtree,
  linkExistingChildDependency,
  moveChildMolecule,
  moveRootMolecule,
  moveReconstructionRow,
  recordExport,
  removeManualParentLink,
  rescaleMoleculeRows,
  saveReconstructionRow,
  selectMolecule,
  setMoleculeTopLevel,
  updateProjectName,
  updateEcoinventCheck,
  updateDocumentation,
  updateMoleculeField,
} from "@/features/workbench/operations";
import {
  buildMoleculePdfExport,
  buildProjectHtmlReportExport,
  buildProjectJsonExport,
  downloadBrowserFile,
  loadProjectJsonFile,
  openPrintReport,
} from "@/features/workbench/exporters";
import { getMoleculeById, getUnresolvedMolecules } from "@/features/workbench/selectors";
import { createEmptyWorkbenchState, makeClientId, nowIso } from "@/features/workbench/state-utils";
import type { MoleculeDraft, ReconstructionRow, WorkbenchState } from "@/features/workbench/types";

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
  const [createDialogTitle, setCreateDialogTitle] = useState("Create molecule");
  const [createDialogDescription, setCreateDialogDescription] = useState(
    "Create a molecule workbook directly in the browser and continue in its workspace.",
  );
  const [createDialogSubmitLabel, setCreateDialogSubmitLabel] = useState("Open workspace");
  const [createDialogInitialValues, setCreateDialogInitialValues] = useState<Partial<MoleculeDraft>>({});
  const [pendingChildRowId, setPendingChildRowId] = useState<string | null>(null);
  const [pendingParentChildId, setPendingParentChildId] = useState<string | null>(null);
  const [cascadeParentMoleculeId, setCascadeParentMoleculeId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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
  const filteredMolecules = !searchQuery.trim()
    ? state.project.molecules
    : state.project.molecules.filter((molecule) => {
        const query = searchQuery.trim().toLowerCase();
        const moleculeTokens = [
          molecule.name,
          molecule.cas,
          molecule.iupac,
          molecule.sourceWorkbook,
          molecule.ecoinventCheck?.datasetName ?? "",
          molecule.ecoinventCheck?.searchQuery ?? "",
          ...molecule.ecoinventAliases,
          ...molecule.synonyms,
          ...molecule.rows.flatMap((row) => [row.name, ...(row.synonyms ?? []), row.ro, row.cas, row.reference]),
        ]
          .join(" ")
          .toLowerCase();

        return moleculeTokens.includes(query);
      });
  const unresolvedMolecules = getUnresolvedMolecules(state.project);

  const openMolecule = (moleculeId: string) => {
    applyStateChange((current) => selectMolecule(current, moleculeId), { markDirty: false });
  };

  const openCreateDialog = (initialValues?: Partial<MoleculeDraft>, rowId?: string) => {
    const childMode = Boolean(rowId);
    setCreateDialogTitle(childMode ? "Create child molecule" : "Create molecule");
    setCreateDialogDescription(
      childMode
        ? "Create and link a child molecule placeholder without leaving the current workspace."
        : "Create a new molecule workbook in the current JSON session and open its workspace.",
    );
    setCreateDialogSubmitLabel(childMode ? "Create and link" : "Open workspace");
    setCreateDialogInitialValues(childMode ? { topLevel: false, ...(initialValues ?? {}) } : (initialValues ?? {}));
    setPendingChildRowId(rowId ?? null);
    setPendingParentChildId(null);
    setCreateDialogOpen(true);
  };

  const openCreateParentDialog = (childMoleculeId: string) => {
    setCreateDialogTitle("Create parent molecule");
    setCreateDialogDescription(
      "Create a new parent molecule and link the current molecule beneath it so the main process chain stays explicit in the hierarchy.",
    );
    setCreateDialogSubmitLabel("Create parent");
    setCreateDialogInitialValues({ topLevel: true });
    setPendingChildRowId(null);
    setPendingParentChildId(childMoleculeId);
    setCreateDialogOpen(true);
  };

  const handleImportSubtree = async (
    file: File,
    options?: {
      parentMoleculeId?: string;
      sourceRowId?: string;
      rowValues?: ChildDependencyRowDraft;
      replaceMoleculeId?: string;
      navigateToImported?: boolean;
    },
  ) => {
    try {
      const importedState = await loadProjectJsonFile(file);
      applyStateChange((current) =>
        importMoleculeSubtree(current, importedState, {
          parentMoleculeId: options?.parentMoleculeId,
          sourceRowId: options?.sourceRowId,
          rowValues: options?.rowValues,
          replaceMoleculeId: options?.replaceMoleculeId,
          navigateToImported: options?.navigateToImported,
        }),
      );
      setCascadeParentMoleculeId(null);
      setCreateDialogOpen(false);
      setPendingChildRowId(null);
      setPendingParentChildId(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The selected JSON subtree could not be imported.";
      window.alert(message);
    }
  };

  const handleCascadeChildSubmit = async (payload: ChildDependencySubmission) => {
    if (payload.mode === "import") {
      await handleImportSubtree(payload.file, {
        parentMoleculeId: payload.parentMoleculeId,
        rowValues: payload.row,
      });
      return;
    }

    applyStateChange((current) => {
      if (payload.mode === "existing") {
        return linkExistingChildDependency(
          current,
          payload.parentMoleculeId,
          payload.childMoleculeId,
          payload.row,
        );
      }

      return createChildDependency(current, payload.parentMoleculeId, payload.molecule, payload.row);
    });

    setCascadeParentMoleculeId(null);
  };

  const handleCreateMolecule = (draft: MoleculeDraft) => {
    applyStateChange((current) =>
      createMolecule(current, draft, {
        parentMoleculeId: pendingChildRowId ? current.selectedMoleculeId ?? undefined : undefined,
        sourceRowId: pendingChildRowId ?? undefined,
        childMoleculeId: pendingParentChildId ?? undefined,
        navigateToNew: pendingChildRowId ? false : true,
      }),
    );

    setCreateDialogOpen(false);
    setPendingChildRowId(null);
    setPendingParentChildId(null);
  };

  const openProjectJson = async (file: File) => {
    if (!confirmDiscardUnsavedChanges()) {
      return;
    }

    try {
      const nextState = await loadProjectJsonFile(file);
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

  const exportPdfReport = async () => {
    if (!selectedMolecule) {
      return;
    }

    setIsExportingPdf(true);
    try {
      const nextVersion = (selectedMolecule.exports.at(-1)?.version ?? 0) + 1;
      const exportedAt = nowIso();
      const report = await buildMoleculePdfExport(state.project, selectedMolecule, nextVersion, exportedAt);
      downloadBrowserFile(report.fileName, report.mimeType, report.content);

      applyStateChange(
        (current) =>
          recordExport(current, selectedMolecule.id, {
            id: makeClientId("export"),
            version: nextVersion,
            exportedAt,
            format: "pdf",
            fileName: report.fileName,
          }),
        { markDirty: true },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The PDF report could not be generated for this molecule.";
      window.alert(message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const openProjectDossier = () => {
    const exportedAt = nowIso();
    const report = buildProjectHtmlReportExport(state.project, exportedAt);
    const opened = openPrintReport(report.content, report.fileName);
    if (!opened) {
      downloadBrowserFile(report.fileName, report.mimeType, report.content);
    }
  };

  const saveMessage =
    sessionState === "dirty"
      ? "Session only • unsaved changes"
      : sessionState === "saved"
        ? "Session only • JSON saved"
        : sessionState === "opened"
          ? "Session only • JSON opened"
          : "Session only • no browser storage";

  const addExtractedRow = (
    moleculeId: string,
    section: "INPUT" | "OUTPUT",
    values: Partial<ReconstructionRow>,
    evidence?: {
      citation: string;
      summary: string;
    },
  ) => {
    applyStateChange((current) => {
      const rowId = values.id ?? makeClientId("row");
      let nextState = saveReconstructionRow(current, moleculeId, section, { ...values, id: rowId });

      if (evidence) {
        nextState = addEvidenceRecord(nextState, moleculeId, {
          rowId,
          citation: evidence.citation,
          type: "patent",
          strength: "moderate",
          summary: evidence.summary,
          identifier: "",
          locator: "",
          url: "",
          isPrimary: false,
          sourceWorkbook: "Patent assistant",
          sourceSheet: "Pasted text",
          sourceRowNumber: null,
        });
      }

      return nextState;
    });
  };

  return (
    <>
      {selectedMolecule ? (
        <MoleculeWorkspace
          molecule={selectedMolecule}
          onAddManualParent={(parentMoleculeId) =>
            applyStateChange((current) => addManualParentLink(current, selectedMolecule.id, parentMoleculeId))
          }
          onCreateParentMolecule={() => openCreateParentDialog(selectedMolecule.id)}
          onBack={() =>
            applyStateChange((current) => selectMolecule(current, null), { markDirty: false })
          }
          onDelete={() => {
            if (!window.confirm(`Delete ${selectedMolecule.name}? This will unlink it from any parent rows.`)) {
              return;
            }
            applyStateChange((current) => {
              setUndoState({
                label: `Deleted molecule ${selectedMolecule.name}`,
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
          onAddExtractedRow={(section, values, evidence) =>
            addExtractedRow(selectedMolecule.id, section, values, evidence)
          }
          onCreateChildFromRow={(rowId, _values, draft) => {
            openCreateDialog(
              {
                topLevel: false,
                ...draft,
              },
              rowId,
            );
          }}
          onApplyPasDefaults={(profile) =>
            applyStateChange((current) => applyPasDefaults(current, selectedMolecule.id, profile))
          }
          onMoveChild={(childMoleculeId, direction) =>
            applyStateChange((current) => moveChildMolecule(current, selectedMolecule.id, childMoleculeId, direction))
          }
          onMoveRoot={(direction) =>
            applyStateChange((current) => moveRootMolecule(current, selectedMolecule.id, direction))
          }
          onMoveRow={(rowId, direction) =>
            applyStateChange((current) => moveReconstructionRow(current, selectedMolecule.id, rowId, direction))
          }
          isExportingPdf={isExportingPdf}
          onExportPdfReport={exportPdfReport}
          onImportMoleculeJson={(file) =>
            void handleImportSubtree(file, {
              replaceMoleculeId: selectedMolecule.id,
            })
          }
          onOpenMolecule={openMolecule}
          onRemoveManualParent={(parentMoleculeId) =>
            applyStateChange((current) => removeManualParentLink(current, selectedMolecule.id, parentMoleculeId))
          }
          onRescaleRows={() =>
            applyStateChange((current) => rescaleMoleculeRows(current, selectedMolecule.id))
          }
          onSaveProjectJson={downloadProjectJson}
          onSaveRow={(section, values, rowId) =>
            applyStateChange((current) => saveReconstructionRow(current, selectedMolecule.id, section, values, rowId))
          }
          onUpdateDocumentation={(field, value) =>
            applyStateChange((current) => updateDocumentation(current, selectedMolecule.id, field, value))
          }
          onUpdateEcoinventCheck={(patch) =>
            applyStateChange((current) => updateEcoinventCheck(current, selectedMolecule.id, patch))
          }
          onUpdateMoleculeField={(field, value) =>
            applyStateChange((current) => updateMoleculeField(current, selectedMolecule.id, field, value))
          }
          onUpdateTopLevel={(topLevel) =>
            applyStateChange((current) => setMoleculeTopLevel(current, selectedMolecule.id, topLevel))
          }
          project={state.project}
          saveMessage={saveMessage}
        />
      ) : (
        <Dashboard
          onAddChildDependency={setCascadeParentMoleculeId}
          onCreateParentMolecule={openCreateParentDialog}
          filteredMolecules={filteredMolecules}
          onCreateMolecule={() => openCreateDialog()}
          onNewProject={createNewProject}
          onOpenMolecule={openMolecule}
          onOpenProjectJson={(file) => void openProjectJson(file)}
          onOpenProjectReport={openProjectDossier}
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

      <ChildDependencyDialog
        onClose={() => setCascadeParentMoleculeId(null)}
        onSubmit={handleCascadeChildSubmit}
        open={Boolean(cascadeParentMoleculeId)}
        parentMolecule={getMoleculeById(state.project, cascadeParentMoleculeId)}
        project={state.project}
      />

      <CreateMoleculeDialog
        description={createDialogDescription}
        hideParentSelection={Boolean(pendingChildRowId)}
        initialValues={createDialogInitialValues}
        onClose={() => {
          setCreateDialogOpen(false);
          setPendingChildRowId(null);
          setPendingParentChildId(null);
        }}
        onImportJson={(file) =>
          void handleImportSubtree(file, {
            parentMoleculeId: pendingChildRowId ? state.selectedMoleculeId ?? undefined : undefined,
            sourceRowId: pendingChildRowId ?? undefined,
            replaceMoleculeId: pendingParentChildId ?? undefined,
            navigateToImported: pendingChildRowId ? false : true,
          })
        }
        onSubmit={handleCreateMolecule}
        open={createDialogOpen}
        project={state.project}
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
