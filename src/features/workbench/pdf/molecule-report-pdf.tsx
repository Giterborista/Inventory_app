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
import {
  getChildMolecules,
  getEffectiveResolutionStatus,
  getMoleculeRows,
  getMoleculeTraceability,
  getParentMolecules,
} from "@/features/workbench/selectors";
import { evidenceStrengthLabels, evidenceTypeLabels, resolutionLabels, reviewLabels } from "@/features/workbench/display";
import type { MoleculeLinkRecord, MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

const colors = {
  ink: "#132021",
  slate: "#4f6468",
  muted: "#708589",
  border: "#d7e2e3",
  panel: "#f6faf9",
  accent: "#0f6c66",
  page: "#f5f8f8",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.page,
    paddingTop: 34,
    paddingBottom: 38,
    paddingHorizontal: 32,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: colors.ink,
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    left: 32,
    right: 32,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    fontSize: 9,
    color: colors.muted,
  },
  reportHeader: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: colors.ink,
    marginBottom: 10,
    maxWidth: 340,
    lineHeight: 1.15,
  },
  reportSubtitle: {
    fontSize: 11,
    color: colors.slate,
    lineHeight: 1.55,
    maxWidth: 420,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  metaCard: {
    width: "31.8%",
    minHeight: 64,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
  },
  metaLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 6,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.ink,
  },
  section: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 4,
    color: colors.ink,
  },
  sectionIntro: {
    fontSize: 10,
    color: colors.slate,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailCard: {
    width: "48.8%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
  },
  detailCardWide: {
    width: "100%",
  },
  detailCardLabel: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 5,
  },
  detailCardValue: {
    fontSize: 10.5,
    color: colors.ink,
    lineHeight: 1.45,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 8.5,
    color: colors.accent,
    backgroundColor: "#f4fbfa",
  },
  traceabilityStatement: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#f4fbfa",
    borderWidth: 1,
    borderColor: "#cde7e3",
    fontSize: 10,
    lineHeight: 1.5,
    color: colors.ink,
  },
  listBlock: {
    marginTop: 10,
  },
  listItem: {
    fontSize: 10,
    color: colors.ink,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  inventorySectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.ink,
    marginBottom: 8,
  },
  inventoryTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10,
  },
  inventoryHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inventoryRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inventoryMainRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  inventoryDetailRow: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "#fbfdfd",
  },
  cell: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 9.2,
    lineHeight: 1.35,
    color: colors.ink,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: colors.muted,
  },
  cellOrder: { width: "7%" },
  cellName: { width: "28%" },
  cellReaction: { width: "11%" },
  cellCleaning: { width: "11%" },
  cellTotal: { width: "12%" },
  cellScaled: { width: "14%" },
  cellStatus: { width: "17%", borderRightWidth: 0 },
  tableSubtle: {
    marginTop: 2,
    fontSize: 8.2,
    color: colors.muted,
  },
  metadataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metadataItem: {
    width: "48.8%",
  },
  metadataLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 2,
  },
  metadataValue: {
    fontSize: 9.2,
    lineHeight: 1.35,
    color: colors.ink,
  },
  paragraphBlock: {
    marginBottom: 10,
  },
  paragraphLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  paragraphValue: {
    fontSize: 10.2,
    color: colors.ink,
    lineHeight: 1.55,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9.4,
    lineHeight: 1.55,
    color: colors.ink,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 9,
  },
  treeBlock: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  treeTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  treeLine: {
    fontFamily: "Courier",
    fontSize: 9.2,
    lineHeight: 1.45,
    color: colors.ink,
    marginBottom: 2,
  },
  mutedText: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 1.45,
  },
  breakBefore: {
    marginTop: 0,
  },
});

type MoleculeReportPdfDocumentProps = {
  project: ProjectRecord;
  molecule: MoleculeRecord;
  version: number;
  exportedAt: string;
};

function safeText(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : "Not recorded";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function hierarchyRole(project: ProjectRecord, molecule: MoleculeRecord) {
  const parents = getParentMolecules(project, molecule.id);
  if (parents.length === 0 && molecule.topLevel) {
    return "Top-level molecule";
  }
  if (parents.length === 0) {
    return "Root molecule";
  }
  if (molecule.topLevel) {
    return "Top-level and linked child molecule";
  }
  return "Child molecule";
}

function completenessSummary(molecule: MoleculeRecord) {
  const inputRows = getMoleculeRows(molecule, "INPUT").length;
  const outputRows = getMoleculeRows(molecule, "OUTPUT").length;
  const documentationFields = [
    molecule.documentation.referenceAndScope,
    molecule.documentation.functionalUnit,
    molecule.documentation.pasAssumptions,
    molecule.documentation.balancedEquation,
    molecule.documentation.calculationNotes,
    molecule.notes,
  ].filter((value) => value.trim()).length;

  return `${inputRows} input row${inputRows === 1 ? "" : "s"}, ${outputRows} output row${
    outputRows === 1 ? "" : "s"
  }, ${documentationFields} documentation field${documentationFields === 1 ? "" : "s"} filled`;
}

function buildHierarchyLines(
  project: ProjectRecord,
  molecule: MoleculeRecord,
  direction: "children" | "parents",
  depth = 0,
  visited = new Set<string>(),
): string[] {
  if (visited.has(molecule.id)) {
    return [`${"  ".repeat(depth)}↳ ${molecule.name} (already shown)`];
  }
  visited.add(molecule.id);

  const currentLine = `${"  ".repeat(depth)}${depth === 0 ? "" : "↳ "}${molecule.name}${
    molecule.cas ? ` [${molecule.cas}]` : ""
  }`;
  const relatives =
    direction === "children" ? getChildMolecules(project, molecule.id) : getParentMolecules(project, molecule.id);

  const descendantLines = relatives.flatMap((relative) =>
    buildHierarchyLines(project, relative, direction, depth + 1, visited),
  );

  return [currentLine, ...descendantLines];
}

function linkDescriptions(project: ProjectRecord, molecule: MoleculeRecord): string[] {
  const relatedLinks = project.links.filter(
    (link) => link.parentMoleculeId === molecule.id || link.childMoleculeId === molecule.id,
  );

  if (relatedLinks.length === 0) {
    return ["No explicit molecule-to-molecule links are recorded for this molecule."];
  }

  return relatedLinks.map((link) => {
    const parent = project.molecules.find((candidate) => candidate.id === link.parentMoleculeId);
    const child = project.molecules.find((candidate) => candidate.id === link.childMoleculeId);
    const sourceRow =
      link.sourceRowId && parent ? parent.rows.find((row) => row.id === link.sourceRowId) ?? null : null;

    return `${safeText(parent?.name)} → ${safeText(child?.name)}${
      sourceRow ? ` via row "${sourceRow.name}"` : " via manual hierarchy link"
    }`;
  });
}

function buildTraceabilityStatement(project: ProjectRecord, molecule: MoleculeRecord) {
  const traceability = getMoleculeTraceability(project, molecule);
  return `This molecule is recorded in project "${project.name}" with ${traceability.parents.length} direct parent ${
    traceability.parents.length === 1 ? "molecule" : "molecules"
  }, ${traceability.children.length} direct child ${
    traceability.children.length === 1 ? "molecule" : "molecules"
  }, and a review status of ${reviewLabels[molecule.reviewStatus].toLowerCase()}.`;
}

function DetailCard({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={wide ? [styles.detailCard, styles.detailCardWide] : styles.detailCard}>
      <Text style={styles.detailCardLabel}>{label}</Text>
      <Text style={styles.detailCardValue}>{safeText(value)}</Text>
    </View>
  );
}

function InventoryTable({ rows, title }: { rows: ReconstructionRow[]; title: string }) {
  if (rows.length === 0) {
    return (
      <View style={styles.paragraphBlock}>
        <Text style={styles.inventorySectionTitle}>{title}</Text>
        <Text style={styles.mutedText}>No rows recorded.</Text>
      </View>
    );
  }

  return (
    <View style={styles.paragraphBlock}>
      <Text style={styles.inventorySectionTitle}>{title}</Text>
      <View style={styles.inventoryTable}>
        <View style={styles.inventoryHeaderRow} fixed>
          <Text style={[styles.cell, styles.cellOrder, styles.headerCell]}>#</Text>
          <Text style={[styles.cell, styles.cellName, styles.headerCell]}>Material</Text>
          <Text style={[styles.cell, styles.cellReaction, styles.headerCell]}>Reaction</Text>
          <Text style={[styles.cell, styles.cellCleaning, styles.headerCell]}>Cleaning</Text>
          <Text style={[styles.cell, styles.cellTotal, styles.headerCell]}>Total qty</Text>
          <Text style={[styles.cell, styles.cellScaled, styles.headerCell]}>Rescaled</Text>
          <Text style={[styles.cell, styles.cellStatus, styles.headerCell]}>Ecoinvent</Text>
        </View>

        {rows
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((row) => {
            const metadata = [
              row.ro ? ["RO", row.ro] : null,
              row.cas ? ["CAS", row.cas] : null,
              row.iupac ? ["IUPAC", row.iupac] : null,
              row.synonyms.length > 0 ? ["Synonyms", row.synonyms.join(", ")] : null,
              row.reference ? ["Reference", row.reference] : null,
              row.description ? ["Description", row.description] : null,
              row.notes ? ["Notes", row.notes] : null,
              row.ecoinventName ? ["Exact ecoinvent name", row.ecoinventName] : null,
              row.sourceWorkbook
                ? [
                    "Origin",
                    `${row.sourceWorkbook}${row.sourceSheet ? ` • ${row.sourceSheet}` : ""}${
                      row.sourceRowNumber ? ` • row ${row.sourceRowNumber}` : ""
                    }`,
                  ]
                : null,
            ].filter((entry): entry is [string, string] => Boolean(entry));

            return (
              <View key={row.id} style={styles.inventoryRow} wrap={false}>
                <View style={styles.inventoryMainRow}>
                  <Text style={[styles.cell, styles.cellOrder]}>{String(row.order)}</Text>
                  <View style={[styles.cell, styles.cellName]}>
                    <Text>{safeText(row.name)}</Text>
                    <Text style={styles.tableSubtle}>{safeText(row.unit)}</Text>
                  </View>
                  <Text style={[styles.cell, styles.cellReaction]}>{safeText(row.reactionValue)}</Text>
                  <Text style={[styles.cell, styles.cellCleaning]}>{safeText(row.cleaningValue)}</Text>
                  <Text style={[styles.cell, styles.cellTotal]}>{safeText(row.totalValue)}</Text>
                  <Text style={[styles.cell, styles.cellScaled]}>
                    {safeText(row.totalScaledValue)}
                    {row.scaledUnit ? ` ${row.scaledUnit}` : ""}
                  </Text>
                  <View style={[styles.cell, styles.cellStatus]}>
                    <Text>{safeText(row.rawEcoinventStatus || resolutionLabels[row.ecoinventStatus])}</Text>
                    {row.linkedMoleculeId ? <Text style={styles.tableSubtle}>Tracked molecule link</Text> : null}
                  </View>
                </View>
                <View style={styles.inventoryDetailRow}>
                  {metadata.length > 0 ? (
                    <View style={styles.metadataGrid}>
                      {metadata.map(([label, value]) => (
                        <View key={`${row.id}-${label}`} style={styles.metadataItem}>
                          <Text style={styles.metadataLabel}>{label}</Text>
                          <Text style={styles.metadataValue}>{safeText(value)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.mutedText}>No additional row metadata recorded.</Text>
                  )}
                </View>
              </View>
            );
          })}
      </View>
    </View>
  );
}

function DocumentationBlock({ molecule }: { molecule: MoleculeRecord }) {
  const paragraphs = [
    ["Source used", molecule.documentation.functionalUnit],
    ["Reaction / origin of the molecule", molecule.documentation.referenceAndScope],
    ["Assumptions", molecule.documentation.pasAssumptions],
    ["Explanation of reconstruction logic", molecule.documentation.calculationNotes],
    ["Important notes", molecule.notes],
  ].filter(([, value]) => value.trim().length > 0);

  return (
    <View>
      {paragraphs.length > 0 ? (
        paragraphs.map(([label, value]) => (
          <View key={label} style={styles.paragraphBlock}>
            <Text style={styles.paragraphLabel}>{label}</Text>
            <Text style={styles.paragraphValue}>{safeText(value)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.mutedText}>No unified documentation text recorded.</Text>
      )}

      <View style={styles.paragraphBlock}>
        <Text style={styles.paragraphLabel}>Balanced reaction</Text>
        <Text style={styles.codeBlock}>{safeText(molecule.documentation.balancedEquation)}</Text>
      </View>

      <View style={styles.paragraphBlock}>
        <Text style={styles.paragraphLabel}>Rationale for decisions</Text>
        <Text style={styles.paragraphValue}>Not recorded in the current workspace model.</Text>
      </View>

      <View style={styles.paragraphBlock}>
        <Text style={styles.paragraphLabel}>Reviewer notes</Text>
        <Text style={styles.paragraphValue}>Not recorded in the current workspace model.</Text>
      </View>

      <View style={styles.paragraphBlock}>
        <Text style={styles.paragraphLabel}>Calculation explanation table</Text>
        {molecule.documentation.explanationLines.length > 0 ? (
          <View style={styles.inventoryTable}>
            <View style={styles.inventoryHeaderRow}>
              <Text style={[styles.cell, { width: "14%" }, styles.headerCell]}>Step</Text>
              <Text style={[styles.cell, { width: "26%" }, styles.headerCell]}>Parameter / decision</Text>
              <Text style={[styles.cell, { width: "24%" }, styles.headerCell]}>Rule / calculation</Text>
              <Text style={[styles.cell, { width: "14%" }, styles.headerCell]}>Result</Text>
              <Text style={[styles.cell, { width: "22%", borderRightWidth: 0 }, styles.headerCell]}>Explanation</Text>
            </View>
            {molecule.documentation.explanationLines
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((line) => (
                <View key={line.id} style={styles.inventoryMainRow} wrap={false}>
                  <Text style={[styles.cell, { width: "14%" }]}>{safeText(line.step)}</Text>
                  <Text style={[styles.cell, { width: "26%" }]}>{safeText(line.parameterDecision)}</Text>
                  <Text style={[styles.cell, { width: "24%" }]}>{safeText(line.ruleCalculation)}</Text>
                  <Text style={[styles.cell, { width: "14%" }]}>{safeText(line.result)}</Text>
                  <Text style={[styles.cell, { width: "22%", borderRightWidth: 0 }]}>{safeText(line.explanation)}</Text>
                </View>
              ))}
          </View>
        ) : (
          <Text style={styles.mutedText}>No structured explanation lines recorded.</Text>
        )}
      </View>
    </View>
  );
}

export function MoleculeReportPdfDocument({
  project,
  molecule,
  version,
  exportedAt,
}: MoleculeReportPdfDocumentProps) {
  const traceability = getMoleculeTraceability(project, molecule);
  const effectiveStatus = getEffectiveResolutionStatus(project, molecule);
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const outputRows = getMoleculeRows(molecule, "OUTPUT");
  const parents = getParentMolecules(project, molecule.id);
  const children = getChildMolecules(project, molecule.id);
  const primaryEvidence = traceability.primaryEvidence;
  const upstreamLines = buildHierarchyLines(project, molecule, "children");
  const downstreamLines = buildHierarchyLines(project, molecule, "parents");
  const links = linkDescriptions(project, molecule);

  return (
    <Document
      author="Proxy Reconstruction Studio"
      creator="Proxy Reconstruction Studio"
      producer="Proxy Reconstruction Studio"
      title={`${molecule.name} reconstruction report`}
      subject="Molecule reconstruction report"
    >
      <Page size="A4" style={styles.page} wrap>
        <View fixed style={styles.footer}>
          <Text>{`${project.name} • ${molecule.name}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>

        <View style={styles.reportHeader}>
          <Text style={styles.eyebrow}>Molecule reconstruction report</Text>
          <Text style={styles.reportTitle}>{molecule.name}</Text>
          <Text style={styles.reportSubtitle}>
            Structured molecule report generated directly from the current workspace data. Every field shown below is
            drawn from the stored molecule, hierarchy, row, documentation, and evidence records.
          </Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Project</Text>
              <Text style={styles.metaValue}>{project.name}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Molecule</Text>
              <Text style={styles.metaValue}>{molecule.name}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Generated</Text>
              <Text style={styles.metaValue}>{formatDate(exportedAt)}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Version</Text>
              <Text style={styles.metaValue}>{`v${version}`}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>1. Molecule identity</Text>
          <Text style={styles.sectionIntro}>
            Identity fields, hierarchy role, and direct connected molecules as currently recorded in the project.
          </Text>
          <View style={styles.detailGrid}>
            <DetailCard label="Molecule name" value={molecule.name} />
            <DetailCard label="CAS" value={molecule.cas} />
            <DetailCard label="IUPAC" value={molecule.iupac} />
            <DetailCard label="Synonyms" value={molecule.synonyms.join(", ")} />
            <DetailCard label="Ecoinvent status" value={resolutionLabels[effectiveStatus]} />
            <DetailCard label="Hierarchy role" value={hierarchyRole(project, molecule)} />
            <DetailCard label="Parent molecule(s)" value={parents.map((parent) => parent.name).join(", ")} />
            <DetailCard label="Child molecule(s)" value={children.map((child) => child.name).join(", ")} />
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>2. Traceability summary</Text>
          <Text style={styles.sectionIntro}>
            Project context, direct molecule links, and deterministic relationship statements generated from the stored
            dependency records.
          </Text>
          <View style={styles.detailGrid}>
            <DetailCard label="Project context" value={`${project.name} • ${project.id}`} />
            <DetailCard label="Direct parent molecule" value={parents.map((parent) => parent.name).join(", ")} />
            <DetailCard label="Direct child molecules" value={children.map((child) => child.name).join(", ")} />
            <DetailCard
              label="Where this molecule is reused"
              value={
                traceability.reusedByCount > 0
                  ? `Used in ${traceability.reusedByCount} parent molecule${traceability.reusedByCount === 1 ? "" : "s"}`
                  : "Not reused by another molecule"
              }
            />
          </View>
          <View style={styles.traceabilityStatement}>
            <Text>{buildTraceabilityStatement(project, molecule)}</Text>
          </View>
          <View style={styles.listBlock}>
            <Text style={styles.paragraphLabel}>Link descriptions</Text>
            {links.map((line, index) => (
              <Text key={`${molecule.id}-link-${index}`} style={styles.listItem}>
                • {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.section} break>
          <Text style={styles.sectionTitle}>3. Reconstruction table</Text>
          <Text style={styles.sectionIntro}>
            INPUT and OUTPUT rows are shown with original quantities, rescaled quantities, and row-level traceability.
          </Text>
          <InventoryTable rows={inputRows} title="INPUT" />
          <InventoryTable rows={outputRows} title="OUTPUT" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Unified documentation</Text>
          <Text style={styles.sectionIntro}>
            One continuous documentation block pulled from the molecule workspace without adding unstored interpretation.
          </Text>
          <DocumentationBlock molecule={molecule} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Dependency overview</Text>
          <Text style={styles.sectionIntro}>
            Short upstream and downstream hierarchy summaries derived from the same parent-child links used by the live
            cascade and graph views.
          </Text>
          <View style={styles.treeBlock}>
            <Text style={styles.treeTitle}>Upstream dependencies</Text>
            {upstreamLines.map((line, index) => (
              <Text key={`upstream-${index}`} style={styles.treeLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.treeBlock}>
            <Text style={styles.treeTitle}>Downstream usage</Text>
            {downstreamLines.map((line, index) => (
              <Text key={`downstream-${index}`} style={styles.treeLine}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Metadata and audit</Text>
          <Text style={styles.sectionIntro}>
            Export metadata and structural identifiers captured at the moment of PDF generation.
          </Text>
          <View style={styles.detailGrid}>
            <DetailCard label="Export timestamp" value={formatDate(exportedAt)} />
            <DetailCard label="Molecule ID" value={molecule.id} />
            <DetailCard label="Project ID" value={project.id} />
            <DetailCard label="JSON schema version" value={`v${CURRENT_PROJECT_SCHEMA_VERSION}`} />
            <DetailCard label="Review status" value={reviewLabels[molecule.reviewStatus]} />
            <DetailCard label="Status / completeness" value={completenessSummary(molecule)} />
            <DetailCard
              label="Primary evidence"
              value={
                primaryEvidence
                  ? `${primaryEvidence.citation} • ${evidenceTypeLabels[primaryEvidence.type]} • ${evidenceStrengthLabels[primaryEvidence.strength]}`
                  : "Not recorded"
              }
              wide
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function createMoleculeReportPdfElement(
  props: MoleculeReportPdfDocumentProps,
): ReactElement<DocumentProps> {
  return <MoleculeReportPdfDocument {...props} />;
}
