import {
  Document,
  type DocumentProps,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { CURRENT_PROJECT_SCHEMA_VERSION } from "@/features/workbench/project-json";
import { getMoleculeRows } from "@/features/workbench/selectors";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

export type SupportiveInformationFile = {
  name: string;
  size: number;
  type: string;
  mergeStatus: "merged-pdf";
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 34,
    paddingHorizontal: 34,
    fontFamily: "Times-Roman",
    fontSize: 10,
    color: "#111111",
    lineHeight: 1.28,
  },
  footerLine: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 27,
    height: 0.75,
    backgroundColor: "#777777",
  },
  footerLeft: {
    position: "absolute",
    left: 34,
    bottom: 16,
    width: 380,
    fontSize: 8,
    color: "#333333",
  },
  footerRight: {
    position: "absolute",
    right: 34,
    bottom: 16,
    width: 170,
    textAlign: "right",
    fontSize: 8,
    color: "#333333",
  },
  coverTitle: {
    fontFamily: "Times-Bold",
    fontSize: 22,
    lineHeight: 1.2,
    marginBottom: 18,
  },
  coverSubtitle: {
    fontSize: 12,
    lineHeight: 1.35,
    marginBottom: 26,
  },
  coverTable: {
    width: "100%",
    borderWidth: 0.75,
    borderColor: "#111111",
  },
  coverRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: "#111111",
  },
  coverLabel: {
    width: "32%",
    padding: 7,
    borderRightWidth: 0.75,
    borderRightColor: "#111111",
    fontFamily: "Times-Bold",
  },
  coverValue: {
    width: "68%",
    padding: 7,
  },
  pageTitle: {
    fontFamily: "Times-Bold",
    fontSize: 15,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.35,
    marginBottom: 8,
  },
  treeLine: {
    fontSize: 10,
    lineHeight: 1.35,
    marginBottom: 2,
  },
  treeIngredientLine: {
    fontSize: 8.5,
    lineHeight: 1.25,
    marginBottom: 1,
  },
  moleculeHeader: {
    borderWidth: 0.75,
    borderColor: "#111111",
    padding: 8,
    marginBottom: 9,
  },
  moleculeTitle: {
    fontFamily: "Times-Bold",
    fontSize: 14,
    lineHeight: 1.2,
    marginBottom: 5,
  },
  metadataLine: {
    fontSize: 9.5,
    lineHeight: 1.3,
    marginBottom: 2,
  },
  tableTitle: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    marginBottom: 4,
    marginTop: 7,
  },
  table: {
    width: "100%",
    borderWidth: 0.75,
    borderColor: "#111111",
    marginBottom: 7,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: "#111111",
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  cell: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRightWidth: 0.75,
    borderRightColor: "#111111",
  },
  cellText: {
    fontSize: 7.5,
    lineHeight: 1.18,
  },
  lastCell: {
    borderRightWidth: 0,
  },
  headerCell: {
    fontFamily: "Times-Bold",
  },
  linkedTraceNumber: {
    fontFamily: "Times-Bold",
  },
  emptyTable: {
    borderWidth: 0.75,
    borderColor: "#111111",
    padding: 7,
    marginBottom: 7,
    fontSize: 9,
  },
  supportFileRow: {
    flexDirection: "row",
    borderBottomWidth: 0.75,
    borderBottomColor: "#111111",
  },
  supportFileName: {
    width: "46%",
    padding: 6,
    borderRightWidth: 0.75,
    borderRightColor: "#111111",
  },
  supportFileDetail: {
    width: "24%",
    padding: 6,
    borderRightWidth: 0.75,
    borderRightColor: "#111111",
  },
  supportFileStatus: {
    width: "30%",
    padding: 6,
  },
});

type ProjectDossierPdfDocumentProps = {
  project: ProjectRecord;
  exportedAt: string;
  supportiveFiles?: SupportiveInformationFile[];
};

type NumberedMolecule = {
  molecule: MoleculeRecord;
  number: string;
  depth: number;
  repeatedInPath: boolean;
};

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function text(value: string | null | undefined, fallback = "Not recorded") {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : fallback;
}

function truncate(value: string | null | undefined, maxLength = 180, fallback = "Not recorded") {
  const normalized = text(value, fallback);
  if (normalized.length <= maxLength) {
    return splitLongTokens(normalized);
  }
  return splitLongTokens(`${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`);
}

function fullCellText(value: string | null | undefined, fallback = "") {
  return splitLongTokens(text(value, fallback), 14);
}

function splitLongTokens(value: string, maxTokenLength = 18) {
  return value.replace(new RegExp(`([^\\s/_(),;:.-]{${maxTokenLength}})`, "g"), "$1 ");
}

function formatSupportFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "Size not recorded";
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function supportFileStatusLabel() {
  return "Uploaded PDF appended after a separator page with this document name.";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function compareByOrderAndName(left: MoleculeRecord, right: MoleculeRecord) {
  const leftOrder = left.rootOrder || Number.MAX_SAFE_INTEGER;
  const rightOrder = right.rootOrder || Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
}

function getChildren(project: ProjectRecord, moleculeId: string) {
  return project.links
    .slice()
    .sort((left, right) => {
      const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (orderDiff !== 0) {
        return orderDiff;
      }
      return left.id.localeCompare(right.id);
    })
    .filter((link) => link.parentMoleculeId === moleculeId)
    .map((link) => project.molecules.find((molecule) => molecule.id === link.childMoleculeId) ?? null)
    .filter((molecule): molecule is MoleculeRecord => molecule !== null)
    .filter((molecule, index, items) => items.findIndex((item) => item.id === molecule.id) === index);
}

function getRoots(project: ProjectRecord) {
  const explicitRoots = project.molecules.filter((molecule) => molecule.topLevel);
  const roots =
    explicitRoots.length > 0
      ? explicitRoots
      : project.molecules.filter(
          (molecule) => !project.links.some((link) => link.childMoleculeId === molecule.id),
        );
  return roots
    .filter((molecule, index, items) => items.findIndex((item) => item.id === molecule.id) === index)
    .sort(compareByOrderAndName);
}

function buildDepthFirstMolecules(project: ProjectRecord) {
  const entries: NumberedMolecule[] = [];
  const roots = getRoots(project);
  const rootIds = new Set(roots.map((root) => root.id));
  const remainingRoots = [
    ...roots,
    ...project.molecules
      .filter((molecule) => !rootIds.has(molecule.id))
      .filter((molecule) => !project.links.some((link) => link.childMoleculeId === molecule.id))
      .sort(compareByOrderAndName),
  ];

  const visit = (molecule: MoleculeRecord, number: string, depth: number, path: Set<string>) => {
    const repeatedInPath = path.has(molecule.id);
    entries.push({ molecule, number, depth, repeatedInPath });
    if (repeatedInPath) {
      return;
    }

    const nextPath = new Set(path);
    nextPath.add(molecule.id);
    getChildren(project, molecule.id).forEach((child, index) => {
      visit(child, `${number}.${index + 1}`, depth + 1, nextPath);
    });
  };

  remainingRoots.forEach((root, index) => {
    visit(root, String(index + 1), 0, new Set<string>());
  });

  return entries;
}

function buildMoleculeNumberIndex(entries: NumberedMolecule[]) {
  const index = new Map<string, string>();
  for (const entry of entries) {
    if (!index.has(entry.molecule.id)) {
      index.set(entry.molecule.id, entry.number);
    }
  }
  return index;
}

function sourceForRow(row: ReconstructionRow) {
  const values = [
    row.reference,
    row.sourceWorkbook,
    row.sourceSheet,
    row.sourceRowNumber !== null ? `row ${row.sourceRowNumber}` : "",
  ].filter((value) => normalizeWhitespace(String(value)).length > 0);
  return values.length > 0 ? values.join(" | ") : "Not recorded";
}

function notesForRow(row: ReconstructionRow) {
  const values = [row.notes, row.description].filter((value) => normalizeWhitespace(value).length > 0);
  return values.length > 0 ? values.join(" | ") : "Not recorded";
}

function quantityForRow(row: ReconstructionRow) {
  return row.totalValue || row.reactionValue || row.cleaningValue || "Not recorded";
}

function rowCells(row: ReconstructionRow) {
  return [
    quantityForRow(row),
    row.unit || row.scaledUnit,
    row.ecoinventName,
    sourceForRow(row),
    notesForRow(row),
  ];
}

function ingredientLine(row: ReconstructionRow, numberByMoleculeId: Map<string, string>) {
  const linkedNumber = row.linkedMoleculeId ? numberByMoleculeId.get(row.linkedMoleculeId) : null;
  const quantity = quantityForRow(row);
  const unit = row.unit || row.scaledUnit;
  const amount = quantity === "Not recorded" ? "" : ` - ${quantity}${unit ? ` ${unit}` : ""}`;
  const prefix = linkedNumber ? `linked ${linkedNumber} - ` : "";
  return `${prefix}${row.name}${amount}`;
}

function Footer({ project, exportedAt }: { project: ProjectRecord; exportedAt: string }) {
  return (
    <>
      <View fixed style={styles.footerLine} />
      <Text fixed style={styles.footerLeft}>
        {truncate(project.name, 80)} | Exported {formatDate(exportedAt)} | Schema {CURRENT_PROJECT_SCHEMA_VERSION}
      </Text>
    </>
  );
}

function CoverInfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={last ? [styles.coverRow, styles.lastRow] : styles.coverRow} wrap={false}>
      <Text style={styles.coverLabel}>{label}</Text>
      <Text style={styles.coverValue}>{truncate(value, 260)}</Text>
    </View>
  );
}

function SupportiveInformationSection({
  exportedAt,
  project,
  supportiveFiles,
}: {
  exportedAt: string;
  project: ProjectRecord;
  supportiveFiles: SupportiveInformationFile[];
}) {
  if (supportiveFiles.length === 0) {
    return null;
  }

  return (
    <Page size="A4" style={styles.page} wrap>
      <Footer project={project} exportedAt={exportedAt} />
      <Text style={styles.pageTitle}>Supportive information</Text>
      <Text style={styles.paragraph}>
        The PDF files below were selected by the user at dossier export time. Each supporting document is appended after
        a separator page that records the document name for traceability.
      </Text>
      <View style={styles.table}>
        <View style={styles.row}>
          <View style={styles.supportFileName}>
            <Text style={[styles.cellText, styles.headerCell]}>File name</Text>
          </View>
          <View style={styles.supportFileDetail}>
            <Text style={[styles.cellText, styles.headerCell]}>Type / size</Text>
          </View>
          <View style={styles.supportFileStatus}>
            <Text style={[styles.cellText, styles.headerCell]}>Dossier handling</Text>
          </View>
        </View>
        {supportiveFiles.map((file, index) => (
          <View
            key={`${file.name}-${index}`}
            style={index === supportiveFiles.length - 1 ? [styles.supportFileRow, styles.lastRow] : styles.supportFileRow}
            wrap={false}
          >
            <View style={styles.supportFileName}>
              <Text style={styles.cellText}>{fullCellText(file.name, "Unnamed file")}</Text>
            </View>
            <View style={styles.supportFileDetail}>
              <Text style={styles.cellText}>
                {fullCellText(file.type || "Unknown type")}{"\n"}
                {formatSupportFileSize(file.size)}
              </Text>
            </View>
            <View style={styles.supportFileStatus}>
              <Text style={styles.cellText}>{supportFileStatusLabel()}</Text>
            </View>
          </View>
        ))}
      </View>
    </Page>
  );
}

function TableHeader() {
  return (
    <View style={styles.row} wrap={false}>
      {[
        ["Name", "18%"],
        ["Amount", "10%"],
        ["Unit", "8%"],
        ["Exact ecoinvent name", "24%"],
        ["Source", "20%"],
        ["Notes", "20%"],
      ].map(([label, width], index, items) => (
        <View
          key={label}
          style={[
            styles.cell,
            styles.headerCell,
            { width },
            index === items.length - 1 ? styles.lastCell : {},
          ]}
        >
          <Text style={[styles.cellText, styles.headerCell]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function InventoryTable({
  rows,
  title,
  numberByMoleculeId,
}: {
  rows: ReconstructionRow[];
  title: string;
  numberByMoleculeId: Map<string, string>;
}) {
  const orderedRows = rows.slice().sort((left, right) => left.order - right.order);
  if (orderedRows.length === 0) {
    return (
      <View wrap={false}>
        <Text style={styles.tableTitle}>{title}</Text>
        <Text style={styles.emptyTable}>No rows recorded.</Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.tableTitle}>{title}</Text>
      <View style={styles.table}>
        <TableHeader />
        {orderedRows.map((row, rowIndex) => (
          <View
            key={row.id}
            style={rowIndex === orderedRows.length - 1 ? [styles.row, styles.lastRow] : styles.row}
            wrap={false}
          >
            {[
              "name",
              ...rowCells(row),
            ].map((cell, cellIndex) => {
              const widths = ["18%", "10%", "8%", "24%", "20%", "20%"];
              const linkedNumber = row.linkedMoleculeId ? numberByMoleculeId.get(row.linkedMoleculeId) : null;
              return (
                <View
                  key={`${row.id}-${cellIndex}`}
                  style={[
                    styles.cell,
                    { width: widths[cellIndex] },
                    cellIndex === widths.length - 1 ? styles.lastCell : {},
                  ]}
                >
                  {cellIndex === 0 ? (
                    <Text style={styles.cellText}>
                      {linkedNumber ? (
                        <>
                          <Text style={styles.linkedTraceNumber}>{linkedNumber}</Text>
                          {"\n"}
                        </>
                      ) : null}
                      {fullCellText(row.name)}
                    </Text>
                  ) : (
                    <Text style={styles.cellText}>{fullCellText(String(cell), "")}</Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );
}

function MoleculeSection({
  entry,
  project,
  exportedAt,
  numberByMoleculeId,
}: {
  entry: NumberedMolecule;
  project: ProjectRecord;
  exportedAt: string;
  numberByMoleculeId: Map<string, string>;
}) {
  const { molecule, number, repeatedInPath } = entry;
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const outputRows = getMoleculeRows(molecule, "OUTPUT");
  const exactMoleculeDataset = molecule.ecoinventCheck?.datasetName || molecule.ecoinventAliases[0] || "";

  return (
    <Page size="A4" style={styles.page} wrap>
      <Footer project={project} exportedAt={exportedAt} />
      <View style={styles.moleculeHeader} wrap={false}>
        <Text style={styles.moleculeTitle}>{number}. {fullCellText(molecule.name)}</Text>
        <Text style={styles.metadataLine}>CAS: {fullCellText(molecule.cas, "Not recorded")}</Text>
        <Text style={styles.metadataLine}>IUPAC: {fullCellText(molecule.iupac, "Not recorded")}</Text>
        <Text style={styles.metadataLine}>Exact ecoinvent name: {fullCellText(exactMoleculeDataset, "Not recorded")}</Text>
        <Text style={styles.metadataLine}>Molecule notes: {fullCellText(molecule.notes, "Not recorded")}</Text>
        {repeatedInPath ? (
          <Text style={styles.metadataLine}>Trace note: repeated molecule detected in this path; downstream expansion stopped here.</Text>
        ) : null}
      </View>
      <InventoryTable rows={inputRows} title="INPUT" numberByMoleculeId={numberByMoleculeId} />
      <InventoryTable rows={outputRows} title="OUTPUT" numberByMoleculeId={numberByMoleculeId} />
    </Page>
  );
}

export function ProjectDossierPdfDocument({ project, exportedAt, supportiveFiles = [] }: ProjectDossierPdfDocumentProps) {
  const entries = buildDepthFirstMolecules(project);
  const numberByMoleculeId = buildMoleculeNumberIndex(entries);
  const totalRows = project.molecules.reduce((sum, molecule) => sum + molecule.rows.length, 0);

  return (
    <Document
      author="Proxy Reconstruction Studio"
      creator="Proxy Reconstruction Studio"
      producer="Proxy Reconstruction Studio"
      title={`${project.name} LCA modelling dossier`}
      subject="Depth-first LCA modelling dossier"
    >
      <Page size="A4" style={styles.page} wrap>
        <Footer project={project} exportedAt={exportedAt} />
        <Text style={styles.coverTitle}>Project dossier for LCA inventory review</Text>
        <Text style={styles.coverSubtitle}>
          Depth-first trace of the modelled molecule cascade. Each molecule is printed with its input and output
          inventory rows, exact ecoinvent mapping where recorded, source, notes, amounts, and units.
        </Text>
        <View style={styles.coverTable}>
          <CoverInfoRow label="Project" value={project.name} />
          <CoverInfoRow label="Export date" value={formatDate(exportedAt)} />
          <CoverInfoRow label="Molecules" value={String(project.molecules.length)} />
          <CoverInfoRow label="Inventory rows" value={String(totalRows)} />
          <CoverInfoRow label="Trace sections" value={String(entries.length)} />
          <CoverInfoRow label="Supportive files" value={String(supportiveFiles.length)} />
          <CoverInfoRow label="Schema version" value={String(CURRENT_PROJECT_SCHEMA_VERSION)} last />
        </View>
      </Page>

      <SupportiveInformationSection
        exportedAt={exportedAt}
        project={project}
        supportiveFiles={supportiveFiles}
      />

      <Page size="A4" style={styles.page} wrap>
        <Footer project={project} exportedAt={exportedAt} />
        <Text style={styles.pageTitle}>Modelling cascade</Text>
        <Text style={styles.paragraph}>
          The numbering follows a depth-first reading order. A branch is followed until its recorded children are
          complete; the document then returns to the previous level and continues with the next branch.
        </Text>
        {entries.map((entry) => {
          const inputRows = getMoleculeRows(entry.molecule, "INPUT");
          return (
            <View key={`${entry.number}-${entry.molecule.id}`}>
              <Text style={[styles.treeLine, { marginLeft: Math.min(entry.depth, 7) * 14 }]}>
                {entry.number}. {truncate(entry.molecule.name, 150)}
              </Text>
              {inputRows.map((row) => (
                <Text
                  key={`${entry.number}-${row.id}`}
                  style={[styles.treeIngredientLine, { marginLeft: Math.min(entry.depth + 1, 8) * 14 }]}
                >
                  - {truncate(ingredientLine(row, numberByMoleculeId), 170)}
                </Text>
              ))}
            </View>
          );
        })}
      </Page>

      {entries.map((entry) => (
        <MoleculeSection
          key={`${entry.number}-${entry.molecule.id}`}
          entry={entry}
          project={project}
          exportedAt={exportedAt}
          numberByMoleculeId={numberByMoleculeId}
        />
      ))}
    </Document>
  );
}

export function createProjectDossierPdfElement(
  props: ProjectDossierPdfDocumentProps,
): ReactElement<DocumentProps> {
  return <ProjectDossierPdfDocument {...props} />;
}
