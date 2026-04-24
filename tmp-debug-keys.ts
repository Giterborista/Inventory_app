import { readFileSync } from "node:fs";

import { parseProjectDocument } from "@/features/workbench/project-json";
import { getChildMolecules, getLinkedMolecule, getMoleculeRows, getTopLevelMolecules } from "@/features/workbench/selectors";

const raw = readFileSync(
  "/Users/bafr/Desktop/Proxy_app/Proxy_JSON_Troubleshooting/htp02-project-with-dipotassium-phosphate-5.json",
  "utf8",
);

const state = parseProjectDocument(raw);
const project = state.project;

const duplicates: Array<{ parent: string; key: string; details: string[] }> = [];

for (const molecule of project.molecules) {
  const inputRows = getMoleculeRows(molecule, "INPUT");
  const displayEntries = inputRows.map((row) => {
    const linked = getLinkedMolecule(project, row);
    if (linked) {
      return {
        kind: "molecule" as const,
        key: `${molecule.id}-${row.id ?? linked.id}`,
        detail: `${row.name} -> ${linked.name} [row:${row.id}] [child:${linked.id}]`,
      };
    }

    return {
      kind: "ingredient" as const,
      key: row.id,
      detail: `${row.name} [row:${row.id}]`,
    };
  });

  const byKey = new Map<string, string[]>();
  for (const entry of displayEntries) {
    const current = byKey.get(entry.key) ?? [];
    current.push(entry.detail);
    byKey.set(entry.key, current);
  }

  for (const [key, details] of byKey.entries()) {
    if (details.length > 1) {
      duplicates.push({ parent: molecule.name, key, details });
    }
  }
}

console.log("TOP LEVEL", getTopLevelMolecules(project).map((molecule) => `${molecule.name}|${molecule.id}`));
console.log("DUPLICATES", JSON.stringify(duplicates, null, 2));

for (const molecule of project.molecules) {
  const children = getChildMolecules(project, molecule.id);
  const childIds = children.map((child) => child.id);
  const duplicateChildIds = childIds.filter((id, index) => childIds.indexOf(id) !== index);
  if (duplicateChildIds.length > 0) {
    console.log("DUP CHILD IDS", molecule.name, duplicateChildIds);
  }
}
