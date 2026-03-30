import { evidenceStrengthLabels, evidenceTypeLabels, resolutionLabels, reviewLabels } from "@/features/workbench/display";
import { createProjectDocument, parseProjectDocument } from "@/features/workbench/project-json";
import {
  getChildMolecules,
  getEffectiveResolutionStatus,
  getMoleculeTraceability,
  getMoleculeRows,
  getParentMolecules,
  getTopLevelMolecules,
  getUnresolvedMolecules,
} from "@/features/workbench/selectors";
import { normalizeProjectRecord } from "@/features/workbench/state-utils";
import type { MoleculeRecord, ProjectRecord, ReconstructionRow } from "@/features/workbench/types";

function safeText(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function escapeHtml(value: unknown) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function workbookName(value: unknown) {
  return safeText(value).toLowerCase().replaceAll(/\s+/g, "-");
}

export function buildProjectJsonExport(project: ProjectRecord) {
  const payload = JSON.stringify(createProjectDocument(normalizeProjectRecord(project)), null, 2);

  return {
    fileName: `${workbookName(project.name)}.json`,
    mimeType: "application/json;charset=utf-8",
    content: payload,
  };
}

export async function loadProjectJsonFile(file: File) {
  const content = await file.text();
  return parseProjectDocument(content);
}

export async function buildMoleculePdfExport(
  project: ProjectRecord,
  molecule: MoleculeRecord,
  version: number,
  exportedAt: string,
) {
  const [{ pdf }, { createMoleculeReportPdfElement }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/features/workbench/pdf/molecule-report-pdf"),
  ]);

  const fileName = `${workbookName(project.name)}_${workbookName(molecule.name)}_report.pdf`;
  const document = pdf(createMoleculeReportPdfElement({ exportedAt, molecule, project, version }));

  const content = await document.toBlob();

  return {
    fileName,
    mimeType: "application/pdf",
    content,
  };
}

function renderInventoryTable(rows: ReconstructionRow[]) {
  if (rows.length === 0) {
    return `<p class="muted">No rows recorded.</p>`;
  }

  return `<table class="inventory-table">
    <thead>
      <tr>
        <th>#</th>
        <th>Material</th>
        <th>Reaction</th>
        <th>Cleaning</th>
        <th>Total qty</th>
        <th>Rescaled</th>
        <th>Ecoinvent</th>
      </tr>
    </thead>
    <tbody>
      ${rows
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
                  `${row.sourceWorkbook}${row.sourceSheet ? ` • ${row.sourceSheet}` : ""}${row.sourceRowNumber ? ` • row ${row.sourceRowNumber}` : ""}`,
                ]
              : null,
          ].filter((entry): entry is [string, string] => Boolean(entry));

          const metadataMarkup =
            metadata.length > 0
              ? `<div class="inventory-meta">
                  ${metadata
                    .map(
                      ([label, value]) => `<div class="inventory-meta-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`,
                    )
                    .join("")}
                </div>`
              : `<div class="muted">No additional row metadata recorded.</div>`;

          return `
            <tr class="inventory-main-row">
              <td>${row.order}</td>
              <td>
                <strong>${escapeHtml(row.name || "")}</strong>
                <div class="table-subtle">${escapeHtml(row.unit || "")}</div>
              </td>
              <td>${escapeHtml(row.reactionValue || "")}</td>
              <td>${escapeHtml(row.cleaningValue || "")}</td>
              <td>${escapeHtml(row.totalValue || "")}</td>
              <td>${escapeHtml(row.totalScaledValue || "")}${row.scaledUnit ? ` ${escapeHtml(row.scaledUnit)}` : ""}</td>
              <td>
                <strong>${escapeHtml(row.rawEcoinventStatus || resolutionLabels[row.ecoinventStatus])}</strong>
                ${row.linkedMoleculeId ? '<div class="table-subtle">Tracked molecule link</div>' : ""}
              </td>
            </tr>
            <tr class="inventory-detail-row">
              <td></td>
              <td colspan="6">${metadataMarkup}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  </table>`;
}

function formatExportDate(value: string) {
  return new Date(value).toLocaleString();
}

function collectProjectMoleculeOrder(project: ProjectRecord) {
  const ordered: MoleculeRecord[] = [];
  const seen = new Set<string>();

  const visit = (molecule: MoleculeRecord) => {
    if (seen.has(molecule.id)) {
      return;
    }
    seen.add(molecule.id);
    ordered.push(molecule);
    for (const child of getChildMolecules(project, molecule.id)) {
      visit(child);
    }
  };

  for (const root of getTopLevelMolecules(project)) {
    visit(root);
  }

  for (const molecule of project.molecules) {
    visit(molecule);
  }

  return ordered;
}

function renderCascadeList(project: ProjectRecord, molecule: MoleculeRecord): string {
  const children = getChildMolecules(project, molecule.id);
  const status = resolutionLabels[getEffectiveResolutionStatus(project, molecule)];
  const childMarkup =
    children.length > 0
      ? `<ul class="cascade-list">
          ${children.map((child) => renderCascadeList(project, child)).join("")}
        </ul>`
      : "";

  return `<li>
    <div class="cascade-node">
      <span class="cascade-name">${escapeHtml(molecule.name)}</span>
      <span class="cascade-meta">${escapeHtml(molecule.cas || "No CAS")} • ${escapeHtml(status)}</span>
    </div>
    ${childMarkup}
  </li>`;
}

function renderDocumentationBlock(molecule: MoleculeRecord) {
  const items = [
    ["Reference and scope", molecule.documentation.referenceAndScope],
    ["Functional unit", molecule.documentation.functionalUnit],
    ["PAS assumptions", molecule.documentation.pasAssumptions],
    ["Balanced equation", molecule.documentation.balancedEquation],
    ["Calculation notes", molecule.documentation.calculationNotes],
  ].filter(([, value]) => safeText(value).trim());

  const explanationTable =
    molecule.documentation.explanationLines.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Step</th><th>Parameter / decision</th><th>Rule / calculation</th><th>Result</th><th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            ${molecule.documentation.explanationLines
              .map(
                (line) => `<tr>
                  <td>${escapeHtml(line.step)}</td>
                  <td>${escapeHtml(line.parameterDecision)}</td>
                  <td>${escapeHtml(line.ruleCalculation)}</td>
                  <td>${escapeHtml(line.result)}</td>
                  <td>${escapeHtml(line.explanation)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
      : "";

  if (items.length === 0 && !explanationTable) {
    return `<p class="muted">No molecule documentation recorded.</p>`;
  }

  return `
    ${items
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}</strong><br />${label === "Balanced equation" ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value)}</p>`,
      )
      .join("")}
    ${explanationTable}
  `;
}

function renderEvidenceList(molecule: MoleculeRecord) {
  if (molecule.evidence.length === 0) {
    return `<p class="muted">No evidence recorded.</p>`;
  }

  return `<ul>
    ${molecule.evidence
      .map(
        (record) =>
          `<li>${escapeHtml(record.citation)}${record.identifier ? ` (${escapeHtml(record.identifier)})` : ""} • ${escapeHtml(
            evidenceTypeLabels[record.type],
          )} • ${escapeHtml(evidenceStrengthLabels[record.strength])}</li>`,
      )
      .join("")}
  </ul>`;
}

export function buildProjectHtmlReportExport(project: ProjectRecord, exportedAt: string) {
  const orderedMolecules = collectProjectMoleculeOrder(project);
  const topLevelMolecules = getTopLevelMolecules(project);
  const unresolvedMolecules = getUnresolvedMolecules(project);
  const dependencyRows = project.links
    .map((link) => {
      const parent = project.molecules.find((molecule) => molecule.id === link.parentMoleculeId);
      const child = project.molecules.find((molecule) => molecule.id === link.childMoleculeId);
      const sourceRow = link.sourceRowId
        ? parent?.rows.find((row) => row.id === link.sourceRowId) ?? null
        : null;
      return { link, parent, child, sourceRow };
    })
    .filter((entry) => entry.parent && entry.child);

  const ecoinventMappings = orderedMolecules.flatMap((molecule) => {
    const moleculeLevel =
      molecule.ecoinventCheck?.datasetName || molecule.ecoinventAliases.length > 0
        ? [
            {
              scope: "Molecule",
              molecule: molecule.name,
              query: molecule.ecoinventCheck?.searchQuery || "",
              dataset: molecule.ecoinventCheck?.datasetName || "",
              status: resolutionLabels[molecule.ecoinventStatus],
              matchedBy: molecule.ecoinventCheck?.matchedBy || "",
            },
          ]
        : [];

    const rowLevel = molecule.rows
      .filter((row) => row.ecoinventName)
      .map((row) => ({
        scope: `${row.section} row`,
        molecule: molecule.name,
        query: row.name,
        dataset: row.ecoinventName,
        status: resolutionLabels[row.ecoinventStatus],
        matchedBy: "manual row mapping",
      }));

    return [...moleculeLevel, ...rowLevel];
  });

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(project.name)} project dossier</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; margin: 0; color: #132021; background: #f4f8f8; }
      main { max-width: 190mm; margin: 0 auto; padding: 18px; }
      h1, h2, h3, h4, p { margin: 0; }
      .cover, .section, .molecule-section, .annex-section { background: #ffffff; border: 1px solid #d8e4e5; border-radius: 18px; padding: 18px; margin-bottom: 16px; box-shadow: 0 10px 24px rgba(18, 34, 35, 0.05); }
      .cover { min-height: 70vh; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
      .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #5d7275; }
      .title { margin-top: 16px; font-size: 42px; line-height: 1.08; font-weight: 700; max-width: 12ch; }
      .subtitle { margin-top: 16px; max-width: 60ch; font-size: 15px; line-height: 1.6; color: #4c6165; }
      .small { color: #5d7275; font-size: 13px; line-height: 1.7; }
      .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
      .meta-card { border: 1px solid #d8e4e5; border-radius: 16px; padding: 16px; background: #f8fbfb; }
      .meta-card strong { display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #5d7275; margin-bottom: 8px; }
      .meta-card span { font-size: 24px; font-weight: 700; color: #132021; }
      .section h2, .molecule-section h2, .annex-section h2 { font-size: 24px; margin-bottom: 10px; }
      .section h3, .molecule-section h3, .annex-section h3 { font-size: 16px; margin-bottom: 8px; }
      .section-intro { font-size: 14px; line-height: 1.6; color: #4c6165; margin-bottom: 14px; max-width: 72ch; }
      .toc-list, .cascade-list, ul { margin: 12px 0 0 20px; padding: 0; }
      .toc-list li, .cascade-list li, ul li { margin: 8px 0; line-height: 1.6; }
      .cascade-list { list-style: none; margin-left: 0; }
      .cascade-list ul { list-style: none; margin-left: 24px; padding-left: 18px; border-left: 1px solid #d8e4e5; }
      .cascade-node { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; }
      .cascade-name { font-weight: 700; }
      .cascade-meta { font-size: 13px; color: #5d7275; }
      .molecule-index { color: #5d7275; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 10px; }
      .molecule-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 14px; margin-bottom: 18px; }
      .molecule-title h2 { margin: 0; }
      .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; border: 1px solid #d8e4e5; font-size: 12px; color: #29494b; background: #f8fbfb; }
      .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
      .detail-card { border: 1px solid #d8e4e5; border-radius: 14px; padding: 12px; background: #fbfdfd; }
      .detail-card strong { display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #5d7275; margin-bottom: 8px; }
      .detail-card div { font-size: 13px; line-height: 1.6; color: #132021; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
      th, td { border: 1px solid #d8e4e5; padding: 8px 9px; vertical-align: top; text-align: left; font-size: 11px; overflow-wrap: anywhere; word-break: break-word; }
      th { background: #f6faf9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #4c6165; }
      .inventory-table th:nth-child(1) { width: 6%; }
      .inventory-table th:nth-child(2) { width: 25%; }
      .inventory-table th:nth-child(3),
      .inventory-table th:nth-child(4),
      .inventory-table th:nth-child(5),
      .inventory-table th:nth-child(6) { width: 11%; }
      .inventory-table th:nth-child(7) { width: 25%; }
      .inventory-main-row td { background: #ffffff; }
      .inventory-detail-row td { background: #fbfdfd; border-top: none; padding-top: 6px; padding-bottom: 10px; }
      .inventory-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
      .inventory-meta-item strong { display: block; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: #5d7275; margin-bottom: 2px; }
      .inventory-meta-item span { display: block; font-size: 11px; line-height: 1.45; color: #132021; }
      .table-subtle { margin-top: 2px; font-size: 10px; line-height: 1.4; color: #5d7275; }
      code { font-family: "IBM Plex Mono", monospace; white-space: pre-wrap; font-size: 13px; }
      .muted { color: #5d7275; font-size: 14px; line-height: 1.7; }
      .page-break { page-break-before: always; }
      .annex-label { font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #5d7275; margin-bottom: 8px; }
      @media print {
        body { background: #ffffff; }
        main { max-width: none; padding: 0; }
        .cover, .section, .molecule-section, .annex-section { box-shadow: none; margin-bottom: 8mm; }
        .cover { min-height: calc(297mm - 24mm); }
        .molecule-section, .annex-section { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="cover">
        <div>
          <div class="eyebrow">Project dossier</div>
          <h1 class="title">${escapeHtml(project.name)}</h1>
          <p class="subtitle">Traceable project report generated directly from the molecule workbooks, hierarchy links, reconstruction rows, ecoinvent mapping notes, and evidence records currently stored in the project.</p>
        </div>
        <div>
          <div class="meta-grid">
            <div class="meta-card"><strong>Total molecules</strong><span>${project.molecules.length}</span></div>
            <div class="meta-card"><strong>Root molecules</strong><span>${topLevelMolecules.length}</span></div>
            <div class="meta-card"><strong>Dependency links</strong><span>${project.links.length}</span></div>
            <div class="meta-card"><strong>Tracked unresolved</strong><span>${unresolvedMolecules.length}</span></div>
          </div>
          <p class="small" style="margin-top: 24px;">Generated ${escapeHtml(formatExportDate(exportedAt))}</p>
        </div>
      </section>

      <section class="section">
        <div class="eyebrow">Document structure</div>
        <h2>Contents</h2>
        <ul class="toc-list">
          <li>1. Project overview</li>
          <li>2. Dependency cascade</li>
          <li>3. Molecule workbook sections</li>
          <li>Annex A. Molecule register</li>
          <li>Annex B. Dependency matrix</li>
          <li>Annex C. Ecoinvent mapping register</li>
          <li>Annex D. Evidence register</li>
        </ul>
      </section>

      <section class="section">
        <div class="eyebrow">Section 1</div>
        <h2>Project overview</h2>
        <p class="section-intro">This overview summarizes the current project state without adding interpretation beyond what is already recorded in the molecule workspaces and hierarchy links.</p>
        <div class="detail-grid">
          <div class="detail-card"><strong>Project name</strong><div>${escapeHtml(project.name)}</div></div>
          <div class="detail-card"><strong>Generated</strong><div>${escapeHtml(formatExportDate(exportedAt))}</div></div>
          <div class="detail-card"><strong>Top-level molecules</strong><div>${topLevelMolecules.map((molecule) => escapeHtml(molecule.name)).join(", ") || "None recorded"}</div></div>
          <div class="detail-card"><strong>Open tracked molecules</strong><div>${unresolvedMolecules.map((molecule) => escapeHtml(molecule.name)).join(", ") || "None"}</div></div>
        </div>
      </section>

      <section class="section">
        <div class="eyebrow">Section 2</div>
        <h2>Dependency cascade</h2>
        <p class="section-intro">Top-level molecules are shown first. Child molecules appear beneath the molecules they are used to build.</p>
        <ul class="cascade-list">
          ${topLevelMolecules.map((molecule) => renderCascadeList(project, molecule)).join("")}
        </ul>
      </section>

      ${orderedMolecules
        .map((molecule, index) => {
          const traceability = getMoleculeTraceability(project, molecule);
          const inputRows = getMoleculeRows(molecule, "INPUT");
          const outputRows = getMoleculeRows(molecule, "OUTPUT");
          const effectiveStatus = getEffectiveResolutionStatus(project, molecule);

          return `
            <section class="molecule-section page-break">
              <div class="molecule-index">Molecule ${index + 1}</div>
              <div class="molecule-title">
                <h2>${escapeHtml(molecule.name)}</h2>
                <span class="pill">${escapeHtml(resolutionLabels[effectiveStatus])}</span>
                ${molecule.placeholder ? '<span class="pill">Placeholder record</span>' : ""}
              </div>

              <div class="detail-grid">
                <div class="detail-card"><strong>CAS</strong><div>${escapeHtml(molecule.cas || "Not recorded")}</div></div>
                <div class="detail-card"><strong>IUPAC</strong><div>${escapeHtml(molecule.iupac || "Not recorded")}</div></div>
                <div class="detail-card"><strong>Synonyms</strong><div>${escapeHtml(molecule.synonyms.join(", ") || "None recorded")}</div></div>
                <div class="detail-card"><strong>Ecoinvent aliases</strong><div>${escapeHtml(molecule.ecoinventAliases.join(", ") || "None recorded")}</div></div>
                <div class="detail-card"><strong>Exact ecoinvent dataset</strong><div>${escapeHtml(molecule.ecoinventCheck?.datasetName || "Not recorded")}</div></div>
                <div class="detail-card"><strong>Source workbook</strong><div>${escapeHtml(molecule.sourceWorkbook || "Manual entry")}${molecule.sourceSheet ? ` • ${escapeHtml(molecule.sourceSheet)}` : ""}</div></div>
                <div class="detail-card"><strong>Parent molecules</strong><div>${traceability.parents.map((parent) => escapeHtml(parent.name)).join(", ") || "None"}</div></div>
                <div class="detail-card"><strong>Child molecules</strong><div>${traceability.children.map((child) => escapeHtml(child.name)).join(", ") || "None"}</div></div>
              </div>

              <h3>INPUT</h3>
              ${renderInventoryTable(inputRows)}

              <h3 style="margin-top: 20px;">OUTPUT</h3>
              ${renderInventoryTable(outputRows)}

              <h3 style="margin-top: 20px;">Reconstruction documentation</h3>
              ${renderDocumentationBlock(molecule)}

              <h3 style="margin-top: 20px;">Traceability and evidence</h3>
              <div class="detail-grid">
                <div class="detail-card"><strong>Parents</strong><div>${traceability.parents.map((parent) => escapeHtml(parent.name)).join(", ") || "None"}</div></div>
                <div class="detail-card"><strong>Children</strong><div>${traceability.children.map((child) => escapeHtml(child.name)).join(", ") || "None"}</div></div>
                <div class="detail-card"><strong>Unresolved children</strong><div>${traceability.unresolvedChildren.map((child) => escapeHtml(child.name)).join(", ") || "None"}</div></div>
                <div class="detail-card"><strong>Reuse count</strong><div>${traceability.reusedByCount}</div></div>
              </div>
              ${renderEvidenceList(molecule)}
            </section>
          `;
        })
        .join("")}

      <section class="annex-section page-break">
        <div class="annex-label">Annex A</div>
        <h2>Molecule register</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>CAS</th><th>IUPAC</th><th>Status</th><th>Placeholder</th><th>Parents</th><th>Children</th><th>Workbook</th>
            </tr>
          </thead>
          <tbody>
            ${orderedMolecules
              .map((molecule) => {
                const traceability = getMoleculeTraceability(project, molecule);
                return `<tr>
                  <td>${escapeHtml(molecule.name)}</td>
                  <td>${escapeHtml(molecule.cas || "")}</td>
                  <td>${escapeHtml(molecule.iupac || "")}</td>
                  <td>${escapeHtml(resolutionLabels[getEffectiveResolutionStatus(project, molecule)])}</td>
                  <td>${molecule.placeholder ? "Yes" : "No"}</td>
                  <td>${traceability.parents.length}</td>
                  <td>${traceability.children.length}</td>
                  <td>${escapeHtml(molecule.sourceWorkbook || "Manual entry")}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </section>

      <section class="annex-section">
        <div class="annex-label">Annex B</div>
        <h2>Dependency matrix</h2>
        ${
          dependencyRows.length > 0
            ? `<table>
                <thead>
                  <tr>
                    <th>Parent molecule</th><th>Child molecule</th><th>Link method</th><th>Source row</th><th>Reference quantity</th><th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  ${dependencyRows
                    .map(
                      ({ link, parent, child, sourceRow }) => `<tr>
                        <td>${escapeHtml(parent?.name || "")}</td>
                        <td>${escapeHtml(child?.name || "")}</td>
                        <td>${escapeHtml(link.linkMethod)}</td>
                        <td>${escapeHtml(sourceRow?.name || "")}</td>
                        <td>${escapeHtml(sourceRow?.totalValue || "")} ${escapeHtml(sourceRow?.unit || "")}</td>
                        <td>${escapeHtml(link.confidence)}</td>
                      </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>`
            : `<p class="muted">No dependency links recorded.</p>`
        }
      </section>

      <section class="annex-section">
        <div class="annex-label">Annex C</div>
        <h2>Ecoinvent mapping register</h2>
        ${
          ecoinventMappings.length > 0
            ? `<table>
                <thead>
                  <tr>
                    <th>Scope</th><th>Molecule</th><th>Query / row</th><th>Dataset</th><th>Status</th><th>Matched by</th>
                  </tr>
                </thead>
                <tbody>
                  ${ecoinventMappings
                    .map(
                      (mapping) => `<tr>
                        <td>${escapeHtml(mapping.scope)}</td>
                        <td>${escapeHtml(mapping.molecule)}</td>
                        <td>${escapeHtml(mapping.query || "")}</td>
                        <td>${escapeHtml(mapping.dataset || "")}</td>
                        <td>${escapeHtml(mapping.status)}</td>
                        <td>${escapeHtml(mapping.matchedBy || "")}</td>
                      </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>`
            : `<p class="muted">No ecoinvent mapping information recorded.</p>`
        }
      </section>

      <section class="annex-section">
        <div class="annex-label">Annex D</div>
        <h2>Evidence register</h2>
        ${
          orderedMolecules.some((molecule) => molecule.evidence.length > 0)
            ? `<table>
                <thead>
                  <tr>
                    <th>Molecule</th><th>Scope</th><th>Type</th><th>Citation</th><th>Identifier</th><th>Strength</th><th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderedMolecules
                    .flatMap((molecule) =>
                      molecule.evidence.map(
                        (record) => `<tr>
                          <td>${escapeHtml(molecule.name)}</td>
                          <td>${record.rowId ? "Row" : "Molecule"}</td>
                          <td>${escapeHtml(evidenceTypeLabels[record.type])}</td>
                          <td>${escapeHtml(record.citation)}</td>
                          <td>${escapeHtml(record.identifier)}</td>
                          <td>${escapeHtml(evidenceStrengthLabels[record.strength])}</td>
                          <td>${escapeHtml(record.summary)}</td>
                        </tr>`,
                      ),
                    )
                    .join("")}
                </tbody>
              </table>`
            : `<p class="muted">No evidence records are stored in this project.</p>`
        }
      </section>
    </main>
  </body>
</html>`;

  return {
    fileName: `${workbookName(project.name)}-project-dossier.html`,
    mimeType: "text/html;charset=utf-8",
    content: html,
  };
}

export function buildHtmlReportExport(
  project: ProjectRecord,
  molecule: MoleculeRecord,
  version: number,
  exportedAt: string,
) {
  const traceability = getMoleculeTraceability(project, molecule);
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const outputRows = getMoleculeRows(molecule, "OUTPUT");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(molecule.name)} reconstruction report</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: "IBM Plex Sans", "Segoe UI", sans-serif; margin: 0; padding: 12mm; color: #132021; background: #ffffff; }
      h1, h2, h3 { margin: 0 0 10px; }
      .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 16px 0 18px; }
      .meta-item, .section { border: 1px solid #d9e6e7; border-radius: 14px; padding: 14px; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
      th, td { border: 1px solid #d9e6e7; padding: 7px 8px; vertical-align: top; text-align: left; font-size: 11px; overflow-wrap: anywhere; word-break: break-word; }
      th { background: #f6fbfb; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
      .inventory-table th:nth-child(1) { width: 6%; }
      .inventory-table th:nth-child(2) { width: 25%; }
      .inventory-table th:nth-child(3),
      .inventory-table th:nth-child(4),
      .inventory-table th:nth-child(5),
      .inventory-table th:nth-child(6) { width: 11%; }
      .inventory-table th:nth-child(7) { width: 25%; }
      .inventory-main-row td { background: #ffffff; }
      .inventory-detail-row td { background: #fbfdfd; border-top: none; padding-top: 6px; padding-bottom: 10px; }
      .inventory-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
      .inventory-meta-item strong { display: block; font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: #5d7275; margin-bottom: 2px; }
      .inventory-meta-item span { display: block; font-size: 11px; line-height: 1.45; color: #132021; }
      .table-subtle { margin-top: 2px; font-size: 10px; line-height: 1.4; color: #5d7275; }
      .small { color: #4b6165; font-size: 12px; }
      ul { margin: 8px 0 0 18px; padding: 0; }
      code { font-family: "IBM Plex Mono", monospace; white-space: pre-wrap; }
      @media print {
        body { padding: 0; }
        .section, .meta-item { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(molecule.name)}</h1>
    <div class="small">Workbook-style reconstruction report v${version} generated ${new Date(exportedAt).toLocaleString()}</div>

    <div class="meta">
      <div class="meta-item"><strong>Project</strong><div>${escapeHtml(project.name)}</div></div>
      <div class="meta-item"><strong>CAS</strong><div>${escapeHtml(molecule.cas || "Not recorded")}</div></div>
      <div class="meta-item"><strong>IUPAC</strong><div>${escapeHtml(molecule.iupac || "Not recorded")}</div></div>
      <div class="meta-item"><strong>Synonyms</strong><div>${escapeHtml(molecule.synonyms.join(", ") || "None recorded")}</div></div>
      <div class="meta-item"><strong>Ecoinvent aliases</strong><div>${escapeHtml(molecule.ecoinventAliases.join(", ") || "None recorded")}</div></div>
      <div class="meta-item"><strong>Ecoinvent status</strong><div>${escapeHtml(resolutionLabels[molecule.ecoinventStatus])}</div></div>
      <div class="meta-item"><strong>Exact ecoinvent dataset</strong><div>${escapeHtml(
        molecule.ecoinventCheck?.datasetName || "Not recorded",
      )}</div></div>
      <div class="meta-item"><strong>Review status</strong><div>${escapeHtml(reviewLabels[molecule.reviewStatus])}</div></div>
      <div class="meta-item"><strong>Source workbook</strong><div>${escapeHtml(molecule.sourceWorkbook || "Manual entry")}</div></div>
      <div class="meta-item"><strong>Source sheet</strong><div>${escapeHtml(molecule.sourceSheet || "")}</div></div>
    </div>

    <div class="section">
      <h2>INPUT</h2>
      ${renderInventoryTable(inputRows)}
    </div>

    <div class="section">
      <h2>OUTPUT</h2>
      ${renderInventoryTable(outputRows)}
    </div>

    <div class="section">
      <h2>Documentation</h2>
      <p><strong>Reference and scope</strong><br />${escapeHtml(molecule.documentation.referenceAndScope || "Not recorded")}</p>
      <p><strong>Functional unit</strong><br />${escapeHtml(molecule.documentation.functionalUnit || "Not recorded")}</p>
      <p><strong>PAS assumptions</strong><br />${escapeHtml(molecule.documentation.pasAssumptions || "Not recorded")}</p>
      <p><strong>Balanced equation</strong><br /><code>${escapeHtml(molecule.documentation.balancedEquation || "Not recorded")}</code></p>
      <p><strong>Calculation notes</strong><br />${escapeHtml(molecule.documentation.calculationNotes || "Not recorded")}</p>
      <p><strong>Ecoinvent search query</strong><br />${escapeHtml(molecule.ecoinventCheck?.searchQuery || "Not recorded")}</p>
      <p><strong>Matched by</strong><br />${escapeHtml(molecule.ecoinventCheck?.matchedBy || "Not recorded")}</p>
      <p><strong>Decision note</strong><br />${escapeHtml(molecule.ecoinventCheck?.decisionNote || "Not recorded")}</p>
      ${
        molecule.documentation.explanationLines.length > 0
          ? `<table>
              <thead>
                <tr>
                  <th>Step</th><th>Parameter / decision</th><th>Rule / calculation</th><th>Result</th><th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                ${molecule.documentation.explanationLines
                  .map(
                    (line) => `<tr>
                      <td>${escapeHtml(line.step)}</td>
                      <td>${escapeHtml(line.parameterDecision)}</td>
                      <td>${escapeHtml(line.ruleCalculation)}</td>
                      <td>${escapeHtml(line.result)}</td>
                      <td>${escapeHtml(line.explanation)}</td>
                    </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>`
          : "<p><strong>Calculation explanation</strong><br />No explanation lines recorded.</p>"
      }
    </div>

    <div class="section">
      <h2>Traceability and evidence</h2>
      <p><strong>Parent molecules</strong></p>
      <ul>${traceability.parents.map((parent) => `<li>${escapeHtml(parent.name)}</li>`).join("") || "<li>None</li>"}</ul>
      <p><strong>Child molecules</strong></p>
      <ul>${traceability.children.map((child) => `<li>${escapeHtml(child.name)}</li>`).join("") || "<li>None</li>"}</ul>
      <p><strong>Reuse</strong><br />${
        traceability.reusedByCount > 0 ? `Used in ${traceability.reusedByCount} parent molecules` : "Not reused elsewhere"
      }</p>
      <p><strong>Evidence</strong></p>
      <ul>
        ${
          molecule.evidence.length > 0
            ? molecule.evidence
                .map(
                  (record) =>
                    `<li>${escapeHtml(record.citation)} (${escapeHtml(evidenceTypeLabels[record.type])}, ${escapeHtml(
                      evidenceStrengthLabels[record.strength],
                    )})</li>`,
                )
                .join("")
            : "<li>No evidence recorded.</li>"
        }
      </ul>
    </div>
  </body>
</html>`;

  return {
    fileName: `${workbookName(molecule.name)}-v${version}.html`,
    mimeType: "text/html;charset=utf-8",
    content: html,
  };
}

export function downloadBrowserFile(fileName: string, mimeType: string, content: string | ArrayBuffer | Blob) {
  const file = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function openPrintReport(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!printWindow) {
    URL.revokeObjectURL(url);
    return false;
  }

  const revoke = () => window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  printWindow.addEventListener("load", revoke, { once: true });
  printWindow.document.title = fileName;
  return true;
}
