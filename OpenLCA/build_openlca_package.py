#!/usr/bin/env python3
"""Build an openLCA JSON-LD import package from a Proxy app project export.

This script intentionally lives in the OpenLCA exploration folder and only reads
or writes files in that folder. It creates a conservative candidate package:

- foreground proxy activities become openLCA Process objects
- foreground reference outputs become generated Product Flow objects
- ecoinvent inputs get default providers from UUID pairs in the ecoinvent LCIA index
- linked foreground rows get default providers to generated foreground processes
- unresolved/non-numeric rows are reported as conversion errors
"""

from __future__ import annotations

import argparse
import copy
import csv
import json
import math
import re
import shutil
import sys
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import openpyxl


BASE_DIR = Path(__file__).resolve().parent
PROJECTS_DIR = BASE_DIR / "projects"
REFERENCE_DATA_DIR = BASE_DIR / "reference-data"
DEFAULT_ECOINVENT_XLSX = BASE_DIR / "Cut-off Cumulative LCIA v3.12 2.xlsx"
DEFAULT_UUID_MATCHER_TABLE = REFERENCE_DATA_DIR / "UUID_matcher_table.csv"
DEFAULT_REFERENCE_METADATA = BASE_DIR / "ecoinvent_reference_metadata.json"

PACKAGE_SCHEMA_VERSION = "2.0"
PACKAGE_CONTEXT = "https://greendelta.github.io/olca-schema/context.jsonld"
PACKAGE_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://proxy-app.local/openlca-export")

@dataclass(frozen=True)
class UnitModel:
    unit_id: str
    unit_name: str
    flow_property_id: str
    flow_property_name: str
    unit_group_id: str
    unit_group_name: str
    generated: bool


@dataclass(frozen=True)
class EcoinventDataset:
    activity_uuid: str
    product_uuid: str
    activity_name: str
    geography: str
    reference_product: str
    unit: str
    amount: float

    @property
    def display_name(self) -> str:
        return f"{self.activity_name} {{{self.geography}}} | {self.reference_product}"


@dataclass(frozen=True)
class ProviderRef:
    provider_uuid: str
    provider_name: str
    flow_uuid: str
    flow_name: str
    activity_name: str
    geography: str
    unit: str
    source: str
    unit_id: str = ""
    flow_property_id: str = ""
    flow_property_name: str = ""
    quantitative_reference_is_input: bool | None = None
    flow_type: str = ""


ProviderIndex = dict[str, dict[Any, list[ProviderRef]]]


@dataclass(frozen=True)
class ReferenceUnit:
    unit_id: str
    unit_name: str
    unit_group_id: str
    unit_group_name: str
    conversion_factor: float


@dataclass(frozen=True)
class ReferenceMetadata:
    geography_aliases: dict[str, str]
    units_by_flow_property: dict[tuple[str, str], ReferenceUnit]


def slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return text or "openlca-package"


def stable_uuid(*parts: str) -> str:
    return str(uuid.uuid5(PACKAGE_NAMESPACE, "::".join(parts)))


def norm_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def norm_unit(value: Any) -> str:
    text = norm_text(value)
    text = re.sub(r"[×·∙⋅]", "*", text)
    text = re.sub(r"[‐‑–—]", "-", text)
    text = re.sub(r"\s*([*-])\s*", r"\1", text)
    aliases = {
        "item(s)": "item",
        "items": "item",
        "unit": "item",
        "units": "item",
        "kilogram": "kg",
        "kilograms": "kg",
        "gram": "g",
        "grams": "g",
        "litre": "l",
        "litres": "l",
        "liter": "l",
        "liters": "l",
        "m^3": "m3",
        "m³": "m3",
    }
    normalized = aliases.get(text, text)
    if normalized in {"tkm", "pkm", "vkm"}:
        return normalized

    words = [word for word in re.split(r"[.*\-\s]+", normalized) if word]
    if words and words[-1] in {"km", "kilometer", "kilometers", "kilometre", "kilometres"}:
        basis = words[:-1]
        if len(basis) == 1 and basis[0] in {"t", "ton", "tons", "tonne", "tonnes"}:
            return "tkm"
        if len(basis) == 2 and basis[0] == "metric" and basis[1] in {"t", "ton", "tons", "tonne", "tonnes"}:
            return "tkm"
        if len(basis) == 1 and basis[0] in {"p", "pax", "person", "persons", "passenger", "passengers"}:
            return "pkm"
        if len(basis) == 1 and basis[0] in {"v", "veh", "vehicle", "vehicles"}:
            return "vkm"

    return normalized


def norm_geo(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parens = re.findall(r"\(([^()]*)\)", text)
    if parens:
        text = parens[-1].strip()
    return re.sub(r"\s+", " ", text).strip().upper()


def normalize_geography_alias(value: Any) -> str:
    normalized = norm_text(value)
    normalized = re.sub(r"\bw\s*/\s*o\b", "without", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def load_reference_metadata(path: Path) -> ReferenceMetadata:
    payload = json.loads(path.read_text(encoding="utf-8"))
    geography_aliases: dict[str, str] = {}
    for location in payload.get("locations", []):
        canonical = norm_text(location.get("name"))
        if not canonical:
            continue
        for alias in (location.get("name"), location.get("code"), location.get("id")):
            normalized = normalize_geography_alias(alias)
            if normalized:
                geography_aliases[normalized] = canonical

    units_by_flow_property: dict[tuple[str, str], ReferenceUnit] = {}
    for group in payload.get("unitGroups", []):
        group_id = str(group.get("id") or "").strip()
        group_name = str(group.get("name") or "").strip()
        flow_property_id = str(group.get("flowPropertyId") or "").strip()
        if not group_id or not flow_property_id:
            continue
        for unit in group.get("units", []):
            unit_id = str(unit.get("id") or "").strip()
            unit_name = str(unit.get("name") or "").strip()
            if not unit_id or not unit_name:
                continue
            reference_unit = ReferenceUnit(
                unit_id=unit_id,
                unit_name=unit_name,
                unit_group_id=group_id,
                unit_group_name=group_name,
                conversion_factor=float(unit.get("conversionFactor") or 1),
            )
            raw_synonyms = unit.get("synonyms") or []
            synonyms = raw_synonyms if isinstance(raw_synonyms, list) else [raw_synonyms]
            aliases = [unit_name, *synonyms]
            for alias in aliases:
                units_by_flow_property[(flow_property_id, norm_unit(alias))] = reference_unit
    return ReferenceMetadata(geography_aliases, units_by_flow_property)


def canonical_geography(value: Any, metadata: ReferenceMetadata | None) -> str:
    candidates = [
        normalize_geography_alias(value),
        normalize_geography_alias(norm_geo(value)),
    ]
    candidates = [candidate for candidate in candidates if candidate]
    if not candidates:
        return ""
    if metadata is None:
        return candidates[-1]
    for candidate in candidates:
        canonical = metadata.geography_aliases.get(candidate)
        if canonical:
            return canonical
    return candidates[-1]


def parse_exact_ecoinvent_name(value: str) -> tuple[str, str, str]:
    text = str(value or "").strip()
    if not text:
        return "", "", ""
    parts = [part.strip() for part in text.split("|")]
    left = parts[0] if parts else ""
    product = parts[1] if len(parts) > 1 else ""
    activity = left
    geography = ""
    match = re.match(r"^(.*?)\s*\{(.+)\}\s*$", left)
    if match:
        activity = match.group(1).strip()
        geography = match.group(2).strip()
    return activity, geography, product


def parse_amount(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if math.isfinite(float(value)) else None
    text = str(value or "").strip().replace(",", ".")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def parse_optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    text = norm_text(value)
    if text in {"true", "1", "yes"}:
        return True
    if text in {"false", "0", "no"}:
        return False
    return None


def ref(type_name: str, object_id: str, name: str) -> dict[str, str]:
    return {"@type": type_name, "@id": object_id, "name": name}


def row_amount(row: dict[str, Any]) -> float | None:
    scaled_amount = parse_amount(row.get("totalScaledValue"))
    if scaled_amount is not None:
        return scaled_amount
    return parse_amount(row.get("totalValue"))


def row_unit(row: dict[str, Any]) -> str:
    return str(row.get("scaledUnit") or row.get("unit") or "").strip()


def output_rows(molecule: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in molecule.get("rows", []) if row.get("section") == "OUTPUT"]


def close_amount(left: float, right: float, relative_tolerance: float = 1e-6) -> bool:
    return math.isclose(left, right, rel_tol=relative_tolerance, abs_tol=1e-12)


def reference_output(molecule: dict[str, Any]) -> dict[str, Any] | None:
    outputs = output_rows(molecule)
    if not outputs:
        return None

    main_output_row_id = str(molecule.get("mainOutputRowId") or molecule.get("referenceOutputRowId") or "").strip()
    if main_output_row_id:
        matches = [row for row in outputs if str(row.get("id") or "").strip() == main_output_row_id]
        return matches[0] if len(matches) == 1 else None

    role_matches = [row for row in outputs if row.get("outputRole") == "main"]
    if len(role_matches) == 1:
        return role_matches[0]
    if len(role_matches) > 1:
        return None

    legacy_explicit = [row for row in outputs if row.get("isReferenceOutput") is True]
    if len(legacy_explicit) == 1:
        return legacy_explicit[0]
    if len(legacy_explicit) > 1:
        return None

    reference_name = norm_text(molecule.get("referenceProductName"))
    name_matches = [row for row in outputs if reference_name and norm_text(row.get("name")) == reference_name]
    if len(name_matches) == 1:
        return name_matches[0]
    if len(outputs) == 1:
        return outputs[0]
    return None


def source_row_amount(row: dict[str, Any], molecule: dict[str, Any], reference: dict[str, Any]) -> float | None:
    scaled = parse_amount(row.get("totalScaledValue"))
    raw = parse_amount(row.get("totalValue"))
    reference_scaled = parse_amount(reference.get("totalScaledValue"))
    reference_raw = parse_amount(reference.get("totalValue"))
    if raw is None:
        return scaled
    if reference_raw is None or reference_scaled is None or reference_raw == 0:
        return scaled if scaled is not None else raw
    expected = raw * reference_scaled / reference_raw
    if scaled is None:
        return expected
    if not close_amount(reference_scaled / reference_raw, 1.0) and close_amount(scaled, raw):
        return expected
    return scaled


def prepare_project_document(project_document: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    prepared = copy.deepcopy(project_document)
    corrections: list[dict[str, Any]] = []
    molecules = prepared.get("project", {}).get("molecules", [])
    foreground_names: dict[str, set[str]] = {}
    for molecule in molecules:
        for candidate_name in (molecule.get("name"), molecule.get("referenceProductName")):
            normalized = norm_text(candidate_name)
            if normalized:
                foreground_names.setdefault(normalized, set()).add(str(molecule.get("id")))

    for molecule in molecules:
        for row in molecule.get("rows", []):
            if (
                row.get("section") != "INPUT"
                or row.get("linkedMoleculeId")
                or row.get("ecoinventName")
                or row.get("needsReview") is True
            ):
                continue
            candidates = set(foreground_names.get(norm_text(row.get("name")), set()))
            candidates.discard(str(molecule.get("id")))
            if len(candidates) == 1:
                linked_id = next(iter(candidates))
                row["linkedMoleculeId"] = linked_id
                corrections.append(
                    {
                        "molecule": molecule.get("name"),
                        "row": row.get("name"),
                        "type": "linked-exact-foreground-name",
                        "linkedMoleculeId": linked_id,
                    }
                )

    for molecule in molecules:
        rows = molecule.setdefault("rows", [])
        outputs = output_rows(molecule)
        if not outputs:
            synthetic = {
                "id": f"row-{stable_uuid('synthetic-reference-output', str(molecule.get('id')))}",
                "name": molecule.get("referenceProductName") or molecule.get("name"),
                "section": "OUTPUT",
                "order": 1,
                "totalValue": molecule.get("scaleReferenceAmount") or molecule.get("scaleTargetAmount") or "1",
                "totalScaledValue": molecule.get("scaleTargetAmount") or molecule.get("scaleReferenceAmount") or "1",
                "unit": molecule.get("scaleUnit") or "item",
                "scaledUnit": molecule.get("scaleUnit") or "item",
                "isReferenceOutput": True,
                "openLcaSynthetic": True,
            }
            rows.append(synthetic)
            outputs = [synthetic]
            corrections.append({"molecule": molecule.get("name"), "type": "synthetic-reference-output"})

        selected = reference_output(molecule)
        if selected is None:
            raise ValueError(
                f"Activity {molecule.get('name') or molecule.get('id')} has multiple outputs but no unambiguous main output. "
                "Set mainOutputRowId and mark exactly one OUTPUT row with outputRole='main'."
            )

        molecule["mainOutputRowId"] = selected.get("id")
        molecule["referenceProductName"] = selected.get("name") or molecule.get("referenceProductName") or molecule.get("name")

        if row_amount(selected) is None:
            unnamed_positive = [
                row for row in outputs
                if row is not selected and not norm_text(row.get("name")) and (row_amount(row) or 0) > 0
            ]
            if len(unnamed_positive) == 1:
                donor = unnamed_positive[0]
                for field in ("totalValue", "totalScaledValue", "unit", "scaledUnit"):
                    if donor.get(field) not in (None, ""):
                        selected[field] = donor[field]
                rows.remove(donor)
                outputs.remove(donor)
                corrections.append({"molecule": molecule.get("name"), "type": "merged-unnamed-reference-output"})
            else:
                selected["totalValue"] = molecule.get("scaleReferenceAmount") or molecule.get("scaleTargetAmount") or "1"
                selected["totalScaledValue"] = molecule.get("scaleTargetAmount") or molecule.get("scaleReferenceAmount") or "1"
                corrections.append({"molecule": molecule.get("name"), "type": "filled-reference-output-amount"})

        for row in outputs:
            row["isReferenceOutput"] = row is selected
            row["outputRole"] = "main" if row is selected else "other"

        reference_raw = parse_amount(selected.get("totalValue"))
        reference_scaled = parse_amount(selected.get("totalScaledValue"))
        if reference_raw is None and reference_scaled is not None:
            selected["totalValue"] = selected["totalScaledValue"]
            reference_raw = reference_scaled
        if reference_scaled is None and reference_raw is not None:
            selected["totalScaledValue"] = selected["totalValue"]
            reference_scaled = reference_raw
        if reference_raw is not None:
            molecule["scaleReferenceAmount"] = str(selected["totalValue"])
        if reference_scaled is not None:
            molecule["scaleTargetAmount"] = str(selected["totalScaledValue"])
        molecule["scaleUnit"] = row_unit(selected) or molecule.get("scaleUnit") or "item"

        if reference_raw is None or reference_scaled is None or reference_raw == 0:
            continue
        factor = reference_scaled / reference_raw
        for row in rows:
            raw = parse_amount(row.get("totalValue"))
            scaled = parse_amount(row.get("totalScaledValue"))
            if raw is None:
                continue
            expected = raw * factor
            if scaled is None or (not close_amount(factor, 1.0) and close_amount(scaled, raw)):
                row["totalScaledValue"] = format(expected, ".12g")
                corrections.append(
                    {
                        "molecule": molecule.get("name"),
                        "row": row.get("name"),
                        "type": "recalculated-scaled-amount",
                    }
                )

    prepared["openLcaPreparation"] = {
        "version": 1,
        "referenceOutput": "Explicit isReferenceOutput flags inferred from molecule and output metadata.",
        "corrections": corrections,
    }
    return prepared, corrections


UNIT_TO_BASE: dict[str, tuple[str, float]] = {
    "mg": ("mass", 1e-6),
    "g": ("mass", 1e-3),
    "kg": ("mass", 1.0),
    "t": ("mass", 1e3),
    "kj": ("energy", 1e-3),
    "mj": ("energy", 1.0),
    "gj": ("energy", 1e3),
    "kwh": ("energy", 3.6),
    "ml": ("volume", 1e-6),
    "l": ("volume", 1e-3),
    "m3": ("volume", 1.0),
    "item": ("items", 1.0),
}


def convert_amount(amount: float, source_unit: str, target_unit: str) -> float:
    source = norm_unit(source_unit)
    target = norm_unit(target_unit)
    if source == target or not source or not target:
        return amount
    source_model = UNIT_TO_BASE.get(source)
    target_model = UNIT_TO_BASE.get(target)
    if source_model is None or target_model is None or source_model[0] != target_model[0]:
        raise ValueError(f"cannot convert {source_unit or '(missing unit)'} to {target_unit or '(missing unit)'}")
    return amount * source_model[1] / target_model[1]


def load_project(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        document = json.load(file)
    if "project" not in document:
        raise ValueError(f"{path.name} does not look like a Proxy app project export.")
    return document


def select_project_json() -> Path:
    candidates = sorted(
        PROJECTS_DIR.glob("*/input/*.json"),
        key=lambda path: (path.parent.parent.name.casefold(), path.name.casefold()),
    )
    if not candidates:
        raise SystemExit(f"No project JSON files found in {PROJECTS_DIR}")

    print("Select the project JSON to convert:")
    for number, path in enumerate(candidates, start=1):
        print(f"  {number}. {path.parent.parent.name} — {path.name}")

    try:
        selection = input("Enter number: ").strip()
        index = int(selection) - 1
        if index < 0:
            raise ValueError
        return candidates[index]
    except (ValueError, IndexError, EOFError):
        raise SystemExit("Invalid project JSON selection.") from None


def load_ecoinvent_index(path: Path) -> dict[tuple[str, str, str, str], EcoinventDataset]:
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["LCIA"]
    index: dict[tuple[str, str, str, str], EcoinventDataset] = {}

    for row in sheet.iter_rows(min_row=5, values_only=True):
        if not any(row):
            continue
        combined, activity, geography, product, unit, amount = row[:6]
        if not combined or "_" not in str(combined):
            continue
        activity_uuid, product_uuid = str(combined).split("_", 1)
        dataset = EcoinventDataset(
            activity_uuid=activity_uuid,
            product_uuid=product_uuid,
            activity_name=str(activity or "").strip(),
            geography=str(geography or "").strip(),
            reference_product=str(product or "").strip(),
            unit=str(unit or "").strip(),
            amount=float(amount or 1),
        )
        key = (
            norm_text(dataset.activity_name),
            norm_geo(dataset.geography),
            norm_text(dataset.reference_product),
            norm_unit(dataset.unit),
        )
        index[key] = dataset
    return index


def provider_key(activity: str, geography: str, product: str, unit: str) -> tuple[str, str, str, str]:
    return (norm_text(activity), norm_geo(geography), norm_text(product), norm_unit(unit))


def provider_keys_for_dataset(dataset: EcoinventDataset) -> list[tuple[str, str, str, str]]:
    return [provider_key(dataset.activity_name, dataset.geography, dataset.reference_product, dataset.unit)]


def split_activity_geography(value: str) -> tuple[str, str]:
    text = str(value or "").strip()
    match = re.match(r"^(.*?)\s*\{([^{}]+)\}\s*$", text)
    if not match:
        return text, ""
    return match.group(1).strip(), match.group(2).strip()


def provider_keys_for_process(process: dict[str, Any], exchange: dict[str, Any]) -> list[tuple[str, str, str, str]]:
    flow = exchange.get("flow") or {}
    unit = (exchange.get("unit") or {}).get("name", "")
    process_name = str(process.get("name") or "")
    flow_name = str(flow.get("name") or "")
    activity_from_exact, geography_from_exact, product_from_exact = parse_exact_ecoinvent_name(process_name)
    activity_from_braces, geography_from_braces = split_activity_geography(process_name)

    keys = [
        provider_key(activity_from_exact, geography_from_exact, product_from_exact or flow_name, unit),
        provider_key(activity_from_braces, geography_from_braces, flow_name, unit),
        provider_key(process_name, "", flow_name, unit),
    ]
    deduped: list[tuple[str, str, str, str]] = []
    for key in keys:
        if key not in deduped:
            deduped.append(key)
    return deduped


def empty_provider_index() -> ProviderIndex:
    return {"by_flow_uuid": {}, "by_match_key": {}}


def add_provider_ref(
    index: ProviderIndex,
    provider: ProviderRef,
    keys: list[tuple[str, str, str, str]] | None = None,
) -> None:
    if provider.flow_uuid:
        index["by_flow_uuid"].setdefault(provider.flow_uuid, [])
        index["by_flow_uuid"][provider.flow_uuid].append(provider)
    for key in keys or []:
        index["by_match_key"].setdefault(key, [])
        index["by_match_key"][key].append(provider)


def load_provider_index_from_csv(path: Path) -> ProviderIndex:
    index = empty_provider_index()
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            provider_uuid = str(row.get("provider_uuid") or row.get("providerUuid") or row.get("process_uuid") or row.get("processUuid") or "").strip()
            provider_name = str(row.get("provider_name") or row.get("providerName") or row.get("process_name") or row.get("processName") or "").strip()
            flow_uuid = str(row.get("flow_uuid") or row.get("flowUuid") or row.get("product_uuid") or row.get("productUuid") or "").strip()
            flow_name = str(row.get("flow_name") or row.get("flowName") or row.get("reference_product") or row.get("referenceProduct") or "").strip()
            if not provider_uuid or not flow_uuid:
                continue
            activity = str(row.get("activity") or row.get("activity_name") or row.get("activityName") or provider_name).strip()
            geography = str(row.get("geography") or row.get("geo") or "").strip()
            unit = str(row.get("unit") or row.get("reference_product_unit") or row.get("referenceProductUnit") or "").strip()
            unit_id = str(row.get("unit_id") or row.get("unitId") or "").strip()
            flow_property_id = str(row.get("flow_property_id") or row.get("flowPropertyId") or "").strip()
            flow_property_name = str(row.get("flow_property_name") or row.get("flowPropertyName") or "").strip()
            quantitative_reference_is_input = parse_optional_bool(
                row.get("quantitative_reference_is_input") or row.get("quantitativeReferenceIsInput")
            )
            flow_type = str(row.get("flow_type") or row.get("flowType") or "").strip()
            provider = ProviderRef(
                provider_uuid=provider_uuid,
                provider_name=provider_name or activity,
                flow_uuid=flow_uuid,
                flow_name=flow_name,
                activity_name=activity,
                geography=geography,
                unit=unit,
                source=path.name,
                unit_id=unit_id,
                flow_property_id=flow_property_id,
                flow_property_name=flow_property_name,
                quantitative_reference_is_input=quantitative_reference_is_input,
                flow_type=flow_type,
            )
            keys = [provider_key(activity, geography, flow_name, unit)] if activity and flow_name and unit else []
            add_provider_ref(index, provider, keys)
    return index


def merge_provider_indexes(target: ProviderIndex, source: ProviderIndex) -> None:
    for group, entries in source.items():
        for key, providers in entries.items():
            target[group].setdefault(key, [])
            target[group][key].extend(providers)


def process_quantitative_reference(process: dict[str, Any]) -> dict[str, Any] | None:
    exchanges = process.get("exchanges") or []
    for exchange in exchanges:
        if exchange.get("isQuantitativeReference"):
            return exchange
    for exchange in exchanges:
        if not exchange.get("isInput") and exchange.get("flow"):
            return exchange
    return None


def index_process_object(
    index: ProviderIndex,
    process: dict[str, Any],
    source_label: str,
) -> None:
    process_id = str(process.get("@id") or "").strip()
    process_name = str(process.get("name") or "").strip()
    exchange = process_quantitative_reference(process)
    if not process_id or not exchange:
        return
    flow = exchange.get("flow") or {}
    flow_uuid = str(flow.get("@id") or "").strip()
    flow_name = str(flow.get("name") or "").strip()
    unit_name = str((exchange.get("unit") or {}).get("name") or flow.get("refUnit") or "").strip()
    unit_id = str((exchange.get("unit") or {}).get("@id") or "").strip()
    flow_property = exchange.get("flowProperty") or {}
    flow_property_id = str(flow_property.get("@id") or "").strip()
    flow_property_name = str(flow_property.get("name") or "").strip()
    if not flow_uuid:
        return
    activity_from_name, _, product_from_name = parse_exact_ecoinvent_name(process_name)
    location = process.get("location") or {}
    geography = str(location.get("name") or "").strip()
    provider = ProviderRef(
        provider_uuid=process_id,
        provider_name=process_name,
        flow_uuid=flow_uuid,
        flow_name=flow_name,
        activity_name=activity_from_name or process_name,
        geography=geography,
        unit=unit_name,
        source=source_label,
        unit_id=unit_id,
        flow_property_id=flow_property_id,
        flow_property_name=flow_property_name,
        quantitative_reference_is_input=bool(exchange.get("isInput")),
        flow_type=str(flow.get("flowType") or ""),
    )
    add_provider_ref(index, provider, provider_keys_for_process(process, exchange))


def load_provider_index_from_jsonld_dir(path: Path) -> ProviderIndex:
    index = empty_provider_index()
    process_dir = path / "processes" if (path / "processes").is_dir() else path
    if not process_dir.is_dir():
        return index
    for process_file in process_dir.glob("*.json"):
        try:
            process = json.loads(process_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        index_process_object(index, process, str(path.name))
    return index


def load_provider_index_from_jsonld_zip(path: Path) -> ProviderIndex:
    index = empty_provider_index()
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        return index
    with archive:
        for name in archive.namelist():
            if "/processes/" not in f"/{name}" and not name.startswith("processes/"):
                continue
            if not name.endswith(".json"):
                continue
            try:
                process = json.loads(archive.read(name).decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            index_process_object(index, process, path.name)
    return index


def load_provider_index(path: Path | None) -> ProviderIndex:
    index = empty_provider_index()
    if path is None:
        return index
    if path.is_dir():
        merge_provider_indexes(index, load_provider_index_from_jsonld_dir(path))
        for candidate in sorted(path.iterdir()):
            if candidate.suffix.lower() == ".csv":
                merge_provider_indexes(index, load_provider_index_from_csv(candidate))
            elif candidate.suffix.lower() == ".zip":
                merge_provider_indexes(index, load_provider_index_from_jsonld_zip(candidate))
        return index
    if path.suffix.lower() == ".csv":
        return load_provider_index_from_csv(path)
    if path.suffix.lower() == ".zip":
        return load_provider_index_from_jsonld_zip(path)
    return index


def geography_label(row: dict[str, Any], dataset: EcoinventDataset) -> str:
    return str(row.get("ecoinventGeography") or dataset.geography or "").strip()


def geography_score(
    provider_geography: str,
    requested_geography: str,
    reference_metadata: ReferenceMetadata | None = None,
) -> int:
    provider_text = norm_text(provider_geography)
    requested_text = norm_text(requested_geography)
    if not provider_text or not requested_text:
        return 0
    if provider_text == requested_text:
        return 40
    provider_geo = canonical_geography(provider_geography, reference_metadata)
    requested_geo = canonical_geography(requested_geography, reference_metadata)
    if provider_geo and requested_geo and provider_geo == requested_geo:
        return 30
    return 0


def provider_score(
    provider: ProviderRef,
    dataset: EcoinventDataset,
    requested_geography: str,
    reference_metadata: ReferenceMetadata | None = None,
) -> int:
    score = 0
    if provider.flow_uuid == dataset.product_uuid:
        score += 100
    if norm_text(provider.activity_name) == norm_text(dataset.activity_name):
        score += 70
    if norm_text(provider.flow_name) == norm_text(dataset.reference_product):
        score += 50
    if norm_unit(provider.unit) == norm_unit(dataset.unit):
        score += 20
    score += geography_score(provider.geography, requested_geography, reference_metadata)
    return score


def resolve_provider(
    dataset: EcoinventDataset,
    provider_index: ProviderIndex,
    row: dict[str, Any],
    desired_quantitative_reference_is_input: bool,
    reference_metadata: ReferenceMetadata | None = None,
) -> ProviderRef:
    requested_geography = geography_label(row, dataset)
    candidates: list[ProviderRef] = []
    candidates.extend(provider_index["by_flow_uuid"].get(dataset.product_uuid, []))
    for key in provider_keys_for_dataset(dataset):
        candidates.extend(provider_index["by_match_key"].get(key, []))

    unique_candidates: dict[str, ProviderRef] = {}
    for candidate in candidates:
        unique_candidates.setdefault(candidate.provider_uuid, candidate)
    if unique_candidates:
        direction_matches = {
            provider_uuid: candidate
            for provider_uuid, candidate in unique_candidates.items()
            if candidate.quantitative_reference_is_input is desired_quantitative_reference_is_input
        }
        if direction_matches:
            unique_candidates = direction_matches
        if requested_geography:
            geography_matches = {
                provider_uuid: candidate
                for provider_uuid, candidate in unique_candidates.items()
                if geography_score(candidate.geography, requested_geography, reference_metadata) > 0
            }
            if geography_matches:
                unique_candidates = geography_matches
            else:
                unique_candidates = {}
        if not unique_candidates:
            return ProviderRef(
                provider_uuid=dataset.activity_uuid,
                provider_name=dataset.display_name,
                flow_uuid=dataset.product_uuid,
                flow_name=dataset.reference_product,
                activity_name=dataset.activity_name,
                geography=dataset.geography,
                unit=dataset.unit,
                source="ecoinvent-lcia-index-fallback",
            )
        return max(
            unique_candidates.values(),
            key=lambda candidate: (
                provider_score(candidate, dataset, requested_geography, reference_metadata),
                norm_text(candidate.provider_name).startswith("market for"),
                candidate.provider_name,
            ),
        )

    return ProviderRef(
        provider_uuid=dataset.activity_uuid,
        provider_name=dataset.display_name,
        flow_uuid=dataset.product_uuid,
        flow_name=dataset.reference_product,
        activity_name=dataset.activity_name,
        geography=dataset.geography,
        unit=dataset.unit,
        source="ecoinvent-lcia-index-fallback",
    )


def match_ecoinvent_row(
    row: dict[str, Any],
    ecoinvent_index: dict[tuple[str, str, str, str], EcoinventDataset],
) -> EcoinventDataset | None:
    activity_from_name, geography_from_name, product_from_name = parse_exact_ecoinvent_name(row.get("ecoinventName", ""))
    activity_names = [activity_from_name, row.get("ecoinventName", ""), row.get("name", "")]
    geographies = [row.get("ecoinventGeography", ""), geography_from_name]
    products = [row.get("ecoinventReferenceProduct", ""), product_from_name, row.get("name", "")]
    units = [row.get("ecoinventUnit", ""), row.get("scaledUnit", ""), row.get("unit", "")]

    def find_match(candidate_activities: list[Any], candidate_products: list[Any]) -> EcoinventDataset | None:
        for activity in candidate_activities:
            for geography in geographies:
                for product in candidate_products:
                    for unit in units:
                        key = (norm_text(activity), norm_geo(geography), norm_text(product), norm_unit(unit))
                        if key in ecoinvent_index:
                            return ecoinvent_index[key]
        return None

    direct_match = find_match(activity_names, products)
    if direct_match:
        return direct_match

    # Legacy project exports sometimes stored "product {geo} | activity"
    # instead of "activity {geo} | product". Only try the reversed pair after
    # the explicit/current representation has failed.
    if activity_from_name and product_from_name:
        return find_match([product_from_name], [activity_from_name])
    return None


def unit_model(unit: str) -> UnitModel:
    normalized = norm_unit(unit)
    display = str(unit or "").strip() or "item"

    if normalized in {"item", "unit"}:
        return UnitModel(
            unit_id=stable_uuid("unit", "item"),
            unit_name="item",
            flow_property_id=stable_uuid("flow-property", "number-of-items"),
            flow_property_name="Number of items",
            unit_group_id=stable_uuid("unit-group", "number-of-items"),
            unit_group_name="Units of items",
            generated=True,
        )
    return UnitModel(
        unit_id=stable_uuid("unit", normalized),
        unit_name=display,
        flow_property_id=stable_uuid("flow-property", f"quantity-{normalized}"),
        flow_property_name=f"Quantity ({display})",
        unit_group_id=stable_uuid("unit-group", normalized),
        unit_group_name=f"Units of {display}",
        generated=True,
    )


def external_flow_property_unit_model(unit: str, provider: ProviderRef) -> UnitModel:
    normalized = norm_unit(unit)
    display = str(unit or "").strip() or normalized or "item"
    return UnitModel(
        unit_id=stable_uuid("unit", normalized, provider.flow_property_id),
        unit_name=display,
        flow_property_id=provider.flow_property_id,
        flow_property_name=provider.flow_property_name,
        unit_group_id=stable_uuid("unit-group", normalized, provider.flow_property_id),
        unit_group_name=f"{provider.flow_property_name or 'Flow property'} units ({display} reference)",
        generated=False,
    )


def flow_property_factor(model: UnitModel) -> dict[str, Any]:
    return {
        "@type": "FlowPropertyFactor",
        "isRefFlowProperty": True,
        "conversionFactor": 1.0,
        "flowProperty": ref("FlowProperty", model.flow_property_id, model.flow_property_name),
    }


def build_flow_property(model: UnitModel) -> dict[str, Any]:
    return {
        "@type": "FlowProperty",
        "@id": model.flow_property_id,
        "name": model.flow_property_name,
        "unitGroup": ref("UnitGroup", model.unit_group_id, model.unit_group_name),
    }


def build_unit_group(model: UnitModel) -> dict[str, Any]:
    return {
        "@type": "UnitGroup",
        "@id": model.unit_group_id,
        "name": model.unit_group_name,
        "defaultFlowProperty": ref("FlowProperty", model.flow_property_id, model.flow_property_name),
        "units": [
            {
                "@type": "Unit",
                "@id": model.unit_id,
                "name": model.unit_name,
                "conversionFactor": 1.0,
                "referenceUnit": True,
            }
        ],
    }


def build_proxy_flow(molecule: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    model = unit_model(row_unit(output) or molecule.get("scaleUnit") or "item")
    flow_id = stable_uuid("proxy-flow", molecule["id"])
    description = "\n".join(
        part
        for part in [
            f"Proxy app foreground reference flow for {molecule.get('name', '')}.",
            molecule.get("notes", ""),
            output.get("notes", ""),
        ]
        if str(part).strip()
    )
    return {
        "@type": "Flow",
        "@id": flow_id,
        "name": output.get("name") or molecule.get("referenceProductName") or molecule.get("name"),
        "description": description,
        "flowType": "PRODUCT_FLOW",
        "cas": molecule.get("cas", ""),
        "formula": output.get("formula") or "",
        "synonyms": "; ".join(molecule.get("synonyms") or []),
        "flowProperties": [flow_property_factor(model)],
        "otherProperties": {
            "proxyAppMoleculeId": molecule.get("id"),
            "proxyAppOutputRowId": output.get("id"),
            "proxyAppOutputRole": output.get("outputRole"),
            "proxyAppObjectKind": molecule.get("objectKind"),
        },
    }


def build_description(molecule: dict[str, Any]) -> str:
    documentation = molecule.get("documentation") or {}
    ledger = documentation.get("evidenceLedger") or {}
    ledger_code = ledger.get("code", "") if isinstance(ledger, dict) else str(ledger or "")
    parts = [
        molecule.get("notes", ""),
        documentation.get("referenceAndScope", ""),
        documentation.get("functionalUnit", ""),
        documentation.get("pasAssumptions", ""),
        documentation.get("balancedEquation", ""),
        documentation.get("calculationNotes", ""),
        f"Evidence Ledger: {ledger_code}" if str(ledger_code).strip() else "",
    ]
    lines = [str(part).strip() for part in parts if str(part or "").strip()]
    return "\n\n".join(lines)


def exchange_description(row: dict[str, Any], extra: str = "") -> str:
    ledger = row.get("evidenceLedger") or {}
    ledger_code = ledger.get("code", "") if isinstance(ledger, dict) else str(ledger or "")
    parts = [
        row.get("description", ""),
        row.get("notes", ""),
        row.get("reference", ""),
        f"Evidence Ledger: {ledger_code}" if str(ledger_code).strip() else "",
        extra,
        f"Proxy app row id: {row.get('id')}",
    ]
    return "\n\n".join(str(part).strip() for part in parts if str(part or "").strip())


def build_package(
    project_document: dict[str, Any],
    ecoinvent_index: dict[tuple[str, str, str, str], EcoinventDataset],
    provider_index: ProviderIndex,
    reference_metadata: ReferenceMetadata | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    project = project_document["project"]
    molecules = project.get("molecules", [])
    molecules_by_id = {molecule["id"]: molecule for molecule in molecules}
    process_ids = {molecule["id"]: stable_uuid("proxy-process", molecule["id"]) for molecule in molecules}

    diagnostics: dict[str, Any] = {
        "projectName": project.get("name"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "molecules": len(molecules),
            "projectLinks": len(project.get("links", [])),
            "matchedEcoinventRows": 0,
            "linkedProxyRows": 0,
            "backgroundProviderRefs": 0,
            "providerRefsFromProviderIndex": 0,
            "providerRefsFromLciaFallback": 0,
            "secondaryOutputsPreserved": 0,
            "wasteTreatmentProviderRefs": 0,
            "unitConversions": 0,
            "unitConversionErrors": 0,
            "providerDirectionErrors": 0,
            "invalidReferenceOutputs": 0,
            "unresolvedRows": 0,
            "skippedRows": 0,
        },
        "matchedEcoinventRows": [],
        "linkedProxyRows": [],
        "backgroundProviderRefs": [],
        "unresolvedRows": [],
        "skippedRows": [],
        "unitConversionErrors": [],
        "providerDirectionErrors": [],
        "invalidReferenceOutputs": [],
        "warnings": [],
    }

    flows: dict[str, dict[str, Any]] = {}
    flow_properties: dict[str, dict[str, Any]] = {}
    unit_groups: dict[str, dict[str, Any]] = {}
    processes: dict[str, dict[str, Any]] = {}
    proxy_flow_ids: dict[str, str] = {}

    def register_unit_model(model: UnitModel) -> None:
        if model.generated:
            flow_properties[model.flow_property_id] = build_flow_property(model)
            unit_groups[model.unit_group_id] = build_unit_group(model)

    # Build foreground flows first.
    for molecule in molecules:
        output = reference_output(molecule)
        if not output:
            diagnostics["warnings"].append(f"Molecule {molecule.get('name')} has no OUTPUT row; a synthetic reference output is used.")
            output = {
                "id": f"{molecule['id']}:synthetic-output",
                "name": molecule.get("referenceProductName") or molecule.get("name"),
                "unit": molecule.get("scaleUnit") or "item",
                "scaledUnit": molecule.get("scaleUnit") or "item",
                "totalValue": molecule.get("scaleReferenceAmount") or 1,
                "totalScaledValue": molecule.get("scaleReferenceAmount") or 1,
            }
        flow = build_proxy_flow(molecule, output)
        flows[flow["@id"]] = flow
        proxy_flow_ids[molecule["id"]] = flow["@id"]
        register_unit_model(unit_model(row_unit(output) or molecule.get("scaleUnit") or "item"))

    # Build foreground processes and exchanges.
    for molecule in molecules:
        process_id = process_ids[molecule["id"]]
        exchanges: list[dict[str, Any]] = []
        internal_id = 0
        output = reference_output(molecule)

        # Quantitative reference output.
        output_amount = row_amount(output or {}) if output else None
        if output_amount is None:
            output_amount = parse_amount(molecule.get("scaleReferenceAmount")) or 1.0
            diagnostics["warnings"].append(
                f"Molecule {molecule.get('name')} reference output has no numeric amount; using {output_amount}."
            )
        if output_amount <= 0:
            diagnostics["counts"]["invalidReferenceOutputs"] += 1
            diagnostics["invalidReferenceOutputs"].append(
                {"molecule": molecule.get("name"), "row": (output or {}).get("name"), "amount": output_amount}
            )
        output_unit = row_unit(output or {}) or molecule.get("scaleUnit") or "item"
        output_model = unit_model(output_unit)
        register_unit_model(output_model)
        internal_id += 1
        output_exchange = {
            "@type": "Exchange",
            "internalId": internal_id,
            "amount": output_amount,
            "isAvoidedProduct": False,
            "isInput": False,
            "isQuantitativeReference": True,
            "flow": ref("Flow", proxy_flow_ids[molecule["id"]], (output or {}).get("name") or molecule.get("referenceProductName") or molecule.get("name")),
            "unit": ref("Unit", output_model.unit_id, output_model.unit_name),
            "flowProperty": ref("FlowProperty", output_model.flow_property_id, output_model.flow_property_name),
            "description": exchange_description(output or {}, "Quantitative reference generated from Proxy app output row."),
        }
        exchanges.append(output_exchange)

        exchange_rows = [
            row
            for row in molecule.get("rows", [])
            if row.get("section") == "INPUT" or (row.get("section") == "OUTPUT" and row is not output)
        ]
        for row in sorted(exchange_rows, key=lambda item: (item.get("section") != "INPUT", item.get("order") or 0)):
            is_secondary_output = row.get("section") == "OUTPUT"
            amount = source_row_amount(row, molecule, output or {})
            if amount is None:
                diagnostics["counts"]["skippedRows"] += 1
                diagnostics["skippedRows"].append(
                    {
                        "molecule": molecule.get("name"),
                        "row": row.get("name"),
                        "rowId": row.get("id"),
                        "reason": "No numeric totalScaledValue or totalValue",
                        "rawAmount": row.get("totalScaledValue") or row.get("totalValue"),
                    }
                )
                continue

            internal_id += 1
            linked_id = row.get("linkedMoleculeId")
            exchange_flow_ref: dict[str, str]
            provider_ref: dict[str, str] | None = None
            input_unit = row_unit(row)
            model = unit_model(input_unit)
            unit_ref = ref("Unit", model.unit_id, model.unit_name)
            flow_property_ref = ref("FlowProperty", model.flow_property_id, model.flow_property_name)
            register_generated_unit = True
            extra_description = "Non-reference Proxy app output preserved as an openLCA output." if is_secondary_output else ""

            def convert_exchange_amount(target_unit: str) -> None:
                nonlocal amount
                try:
                    converted = convert_amount(amount, input_unit, target_unit)
                except ValueError as exc:
                    diagnostics["counts"]["unitConversionErrors"] += 1
                    diagnostics["unitConversionErrors"].append(
                        {
                            "molecule": molecule.get("name"),
                            "row": row.get("name"),
                            "sourceUnit": input_unit,
                            "targetUnit": target_unit,
                            "reason": str(exc),
                        }
                    )
                    return
                if not close_amount(converted, amount):
                    diagnostics["counts"]["unitConversions"] += 1
                amount = converted

            if linked_id and linked_id in molecules_by_id:
                child = molecules_by_id[linked_id]
                exchange_flow_ref = ref("Flow", proxy_flow_ids[linked_id], child.get("referenceProductName") or child.get("name"))
                if not is_secondary_output:
                    provider_ref = ref("Process", process_ids[linked_id], child.get("name") or linked_id)
                child_output = reference_output(child)
                target_unit = row_unit(child_output or row) or input_unit
                convert_exchange_amount(target_unit)
                model = unit_model(target_unit)
                unit_ref = ref("Unit", model.unit_id, model.unit_name)
                flow_property_ref = ref("FlowProperty", model.flow_property_id, model.flow_property_name)
                diagnostics["counts"]["linkedProxyRows"] += 1
                diagnostics["linkedProxyRows"].append(
                    {
                        "consumer": molecule.get("name"),
                        "row": row.get("name"),
                        "provider": child.get("name"),
                        "amount": amount,
                        "unit": model.unit_name,
                    }
                )
            elif row.get("ecoinventStatus") == "present" and row.get("ecoinventName"):
                match = match_ecoinvent_row(row, ecoinvent_index)
                if match:
                    provider = resolve_provider(
                        match,
                        provider_index,
                        row,
                        desired_quantitative_reference_is_input=is_secondary_output,
                        reference_metadata=reference_metadata,
                    )
                    exchange_flow_ref = ref("Flow", match.product_uuid, match.reference_product)
                    reference_unit = None
                    if reference_metadata and provider.flow_property_id:
                        reference_unit = reference_metadata.units_by_flow_property.get(
                            (provider.flow_property_id, norm_unit(input_unit))
                        )
                    # Preserve the row unit when it is a unit in the provider flow
                    # property's ecoinvent unit group. Otherwise convert to the
                    # provider quantitative-reference unit.
                    target_unit = reference_unit.unit_name if reference_unit else (provider.unit or match.unit or input_unit)
                    if reference_unit is None:
                        convert_exchange_amount(target_unit)
                    model = unit_model(target_unit)
                    unit_ref = ref("Unit", model.unit_id, model.unit_name)
                    flow_property_ref = ref("FlowProperty", model.flow_property_id, model.flow_property_name)
                    if reference_unit and provider.flow_property_id:
                        unit_ref = ref("Unit", reference_unit.unit_id, reference_unit.unit_name)
                        flow_property_ref = ref("FlowProperty", provider.flow_property_id, provider.flow_property_name)
                        register_generated_unit = False
                    elif (
                        provider.unit_id
                        and provider.flow_property_id
                        and norm_unit(provider.unit) == norm_unit(target_unit)
                    ):
                        unit_ref = ref("Unit", provider.unit_id, provider.unit)
                        flow_property_ref = ref("FlowProperty", provider.flow_property_id, provider.flow_property_name)
                        register_generated_unit = False
                    elif provider.flow_property_id:
                        model = external_flow_property_unit_model(target_unit, provider)
                        unit_ref = ref("Unit", model.unit_id, model.unit_name)
                        flow_property_ref = ref("FlowProperty", model.flow_property_id, model.flow_property_name)
                        unit_groups[model.unit_group_id] = build_unit_group(model)
                        register_generated_unit = False
                    direction_is_valid = provider.quantitative_reference_is_input is is_secondary_output
                    if direction_is_valid or (not is_secondary_output and provider.quantitative_reference_is_input is None):
                        provider_ref = ref("Process", provider.provider_uuid, provider.provider_name)
                    elif is_secondary_output and provider.quantitative_reference_is_input is False:
                        provider_ref = None
                    else:
                        diagnostics["counts"]["providerDirectionErrors"] += 1
                        diagnostics["providerDirectionErrors"].append(
                            {
                                "molecule": molecule.get("name"),
                                "row": row.get("name"),
                                "provider": provider.provider_name,
                                "sourceSection": row.get("section"),
                                "providerReferenceIsInput": provider.quantitative_reference_is_input,
                            }
                        )
                    uuid_description = f"ecoinvent UUID pair: {match.activity_uuid}_{match.product_uuid}"
                    extra_description = "\n\n".join(part for part in [extra_description, uuid_description] if part)
                    diagnostics["counts"]["matchedEcoinventRows"] += 1
                    if provider_ref:
                        diagnostics["counts"]["backgroundProviderRefs"] += 1
                        if is_secondary_output:
                            diagnostics["counts"]["wasteTreatmentProviderRefs"] += 1
                        if provider.source == "ecoinvent-lcia-index-fallback":
                            diagnostics["counts"]["providerRefsFromLciaFallback"] += 1
                        else:
                            diagnostics["counts"]["providerRefsFromProviderIndex"] += 1
                    diagnostics["matchedEcoinventRows"].append(
                        {
                            "consumer": molecule.get("name"),
                            "row": row.get("name"),
                            "activityUuid": match.activity_uuid,
                            "productUuid": match.product_uuid,
                            "activity": match.activity_name,
                            "geography": match.geography,
                            "referenceProduct": match.reference_product,
                            "unit": match.unit,
                        }
                    )
                    diagnostics["backgroundProviderRefs"].append(
                        {
                            "consumer": molecule.get("name"),
                            "row": row.get("name"),
                            "providerType": "Process",
                            "providerUuid": provider.provider_uuid,
                            "providerName": provider.provider_name,
                            "providerSource": provider.source,
                            "providerAttached": provider_ref is not None,
                            "providerGeography": provider.geography,
                            "lciaActivityUuid": match.activity_uuid,
                            "flowUuid": match.product_uuid,
                            "flowName": match.reference_product,
                            "amount": amount,
                            "unit": target_unit,
                            "sourceSection": row.get("section"),
                            "providerReferenceIsInput": provider.quantitative_reference_is_input,
                        }
                    )
                else:
                    unresolved_flow_id = stable_uuid("unresolved-flow", molecule["id"], row["id"])
                    exchange_flow_ref = ref("Flow", unresolved_flow_id, row.get("name") or "Unresolved input")
                    flows[unresolved_flow_id] = {
                        "@type": "Flow",
                        "@id": unresolved_flow_id,
                        "name": row.get("name") or "Unresolved input",
                        "description": exchange_description(row, "Unmatched ecoinvent-present row; generated as a local foreground flow."),
                        "flowType": "PRODUCT_FLOW",
                        "flowProperties": [flow_property_factor(model)],
                        "otherProperties": {"proxyAppRowId": row.get("id"), "unresolvedEcoinventName": row.get("ecoinventName")},
                    }
                    if not is_secondary_output:
                        diagnostics["counts"]["unresolvedRows"] += 1
                        diagnostics["unresolvedRows"].append(
                            {
                                "molecule": molecule.get("name"),
                                "row": row.get("name"),
                                "rowId": row.get("id"),
                                "reason": "No ecoinvent UUID match",
                                "ecoinventName": row.get("ecoinventName"),
                            }
                        )
            else:
                unresolved_flow_id = stable_uuid("unresolved-flow", molecule["id"], row["id"])
                exchange_flow_ref = ref("Flow", unresolved_flow_id, row.get("name") or "Unresolved input")
                flows[unresolved_flow_id] = {
                    "@type": "Flow",
                    "@id": unresolved_flow_id,
                    "name": row.get("name") or "Unresolved input",
                    "description": exchange_description(row, "No linked proxy provider or ecoinvent match; generated as a local foreground flow."),
                    "flowType": "PRODUCT_FLOW",
                    "flowProperties": [flow_property_factor(model)],
                    "otherProperties": {"proxyAppRowId": row.get("id")},
                }
                if not is_secondary_output:
                    diagnostics["counts"]["unresolvedRows"] += 1
                    diagnostics["unresolvedRows"].append(
                        {
                            "molecule": molecule.get("name"),
                            "row": row.get("name"),
                            "rowId": row.get("id"),
                            "reason": "No linked proxy provider or ecoinvent mapping",
                        }
                    )

            if register_generated_unit:
                register_unit_model(model)
            exchange = {
                "@type": "Exchange",
                "internalId": internal_id,
                "amount": amount,
                "isAvoidedProduct": False,
                "isInput": not is_secondary_output,
                "isQuantitativeReference": False,
                "flow": exchange_flow_ref,
                "unit": unit_ref,
                "flowProperty": flow_property_ref,
                "description": exchange_description(row, extra_description),
            }
            if provider_ref:
                exchange["defaultProvider"] = provider_ref
            exchanges.append(exchange)
            if is_secondary_output:
                diagnostics["counts"]["secondaryOutputsPreserved"] += 1

        processes[process_id] = {
            "@type": "Process",
            "@id": process_id,
            "name": molecule.get("name") or molecule["id"],
            "description": build_description(molecule),
            "processType": "UNIT_PROCESS",
            "lastInternalId": internal_id,
            "exchanges": exchanges,
            "processDocumentation": {
                "copyright": False,
                "creationDate": project_document.get("exportedAt") or project.get("createdAt"),
                "dataSetOwner": "Proxy app generated foreground model",
                "intendedApplication": "Import into an openLCA database containing the referenced background providers.",
            },
            "otherProperties": {
                "proxyAppMoleculeId": molecule.get("id"),
                "proxyAppMainOutputRowId": molecule.get("mainOutputRowId"),
                "proxyAppObjectKind": molecule.get("objectKind"),
                "proxyAppReviewStatus": molecule.get("reviewStatus"),
                "proxyAppEcoinventStatus": molecule.get("ecoinventStatus"),
            },
        }

    package = {
        "flows": flows,
        "flow_properties": flow_properties,
        "unit_groups": unit_groups,
        "processes": processes,
    }
    diagnostics["counts"].update(
        {
            "generatedFlows": len(flows),
            "generatedFlowProperties": len(flow_properties),
            "generatedUnitGroups": len(unit_groups),
            "generatedProcesses": len(processes),
        }
    )
    diagnostics["readyForOpenLcaImportTest"] = True
    diagnostics["readyForCompleteLcaCalculation"] = (
        diagnostics["counts"]["skippedRows"] == 0
        and diagnostics["counts"]["unresolvedRows"] == 0
        and diagnostics["counts"]["unitConversionErrors"] == 0
        and diagnostics["counts"]["providerDirectionErrors"] == 0
        and diagnostics["counts"]["invalidReferenceOutputs"] == 0
    )
    diagnostics["requiresOpenLcaSupplyChainLinking"] = diagnostics["counts"]["backgroundProviderRefs"] > 0
    return package, diagnostics


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, ensure_ascii=False)
        file.write("\n")


def write_provider_index_csv(path: Path, provider_index: dict[str, dict[Any, list[ProviderRef]]]) -> None:
    providers: dict[str, ProviderRef] = {}
    for entries in provider_index.values():
        for provider_list in entries.values():
            for provider in provider_list:
                providers.setdefault(provider.provider_uuid, provider)

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "provider_uuid",
                "provider_name",
                "activity_name",
                "geography",
                "flow_uuid",
                "flow_name",
                "unit",
                "unit_id",
                "flow_property_id",
                "flow_property_name",
                "quantitative_reference_is_input",
                "flow_type",
                "source",
            ],
        )
        writer.writeheader()
        for provider in sorted(providers.values(), key=lambda item: (item.activity_name, item.geography, item.flow_name, item.provider_uuid)):
            writer.writerow(
                {
                    "provider_uuid": provider.provider_uuid,
                    "provider_name": provider.provider_name,
                    "activity_name": provider.activity_name,
                    "geography": provider.geography,
                    "flow_uuid": provider.flow_uuid,
                    "flow_name": provider.flow_name,
                    "unit": provider.unit,
                    "unit_id": provider.unit_id,
                    "flow_property_id": provider.flow_property_id,
                    "flow_property_name": provider.flow_property_name,
                    "quantitative_reference_is_input": provider.quantitative_reference_is_input,
                    "flow_type": provider.flow_type,
                    "source": provider.source,
                }
            )


def write_package_files(output_root: Path, package: dict[str, dict[str, Any]], diagnostics: dict[str, Any]) -> None:
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    write_json(
        output_root / "olca-schema.json",
        {
            "@context": PACKAGE_CONTEXT,
            "@type": "Database",
            "name": diagnostics["projectName"],
            "version": PACKAGE_SCHEMA_VERSION,
            "description": "Generated Proxy app openLCA JSON-LD package.",
        },
    )

    for folder, objects in package.items():
        for object_id, payload in objects.items():
            write_json(output_root / folder / f"{object_id}.json", payload)


def zip_directory(source_dir: Path, target_zip: Path) -> None:
    if target_zip.exists():
        target_zip.unlink()
    with zipfile.ZipFile(target_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source_dir).as_posix())


def conversion_errors(diagnostics: dict[str, Any], provider_index: ProviderIndex, package: dict[str, dict[str, Any]]) -> list[str]:
    counts = diagnostics["counts"]
    errors: list[str] = []

    if counts["molecules"] == 0:
        errors.append("Project contains no molecules/processes.")
    if not package["processes"]:
        errors.append("Generated package contains no foreground processes.")
    if not provider_index["by_flow_uuid"] and not provider_index["by_match_key"]:
        errors.append("Provider matcher table is empty; ecoinvent provider UUIDs cannot be resolved.")
    if counts["skippedRows"]:
        errors.append(f"{counts['skippedRows']} exchange row(s) were skipped because their amounts are not numeric.")
        for row in diagnostics["skippedRows"]:
            errors.append(f"Skipped row: {row['molecule']} / {row['row']} ({row['reason']}: {row.get('rawAmount', '')}).")
    if counts["unresolvedRows"]:
        errors.append(f"{counts['unresolvedRows']} exchange row(s) could not be matched to foreground or ecoinvent providers.")
        for row in diagnostics["unresolvedRows"]:
            errors.append(f"Unresolved row: {row['molecule']} / {row['row']} ({row['reason']}).")
    if counts["unitConversionErrors"]:
        errors.append(f"{counts['unitConversionErrors']} exchange unit conversion(s) failed.")
        for row in diagnostics["unitConversionErrors"]:
            errors.append(
                f"Unit conversion: {row['molecule']} / {row['row']} "
                f"({row['sourceUnit']} -> {row['targetUnit']}: {row['reason']})."
            )
    if counts["providerDirectionErrors"]:
        errors.append(f"{counts['providerDirectionErrors']} provider direction mismatch(es) were found.")
        for row in diagnostics["providerDirectionErrors"]:
            errors.append(
                f"Provider direction: {row['molecule']} / {row['row']} -> {row['provider']} "
                f"(source {row['sourceSection']}, provider reference isInput={row['providerReferenceIsInput']})."
            )
    if counts["invalidReferenceOutputs"]:
        errors.append(f"{counts['invalidReferenceOutputs']} process reference output(s) have zero or negative amounts.")
        for row in diagnostics["invalidReferenceOutputs"]:
            errors.append(f"Invalid reference output: {row['molecule']} / {row['row']} = {row['amount']}.")
    if counts["providerRefsFromLciaFallback"]:
        errors.append(
            f"{counts['providerRefsFromLciaFallback']} provider reference(s) used LCIA UUID fallback instead of Unit JSON providers."
        )
    for row in diagnostics["backgroundProviderRefs"]:
        if row.get("providerAttached") and row.get("providerSource") == "ecoinvent-lcia-index-fallback":
            errors.append(f"Fallback provider: {row['consumer']} / {row['row']} -> {row['providerName']}.")
    if counts["backgroundProviderRefs"] and counts["providerRefsFromProviderIndex"] == 0:
        errors.append("Background inputs exist, but none were resolved from the Unit JSON provider matcher table.")
    return errors


def print_errors(errors: list[str]) -> None:
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build an openLCA JSON-LD package from Proxy app project JSON.")
    parser.add_argument(
        "--project-json",
        type=Path,
        default=None,
        help="Project JSON in projects/<project-id>/input/. When omitted, a numbered selection is shown.",
    )
    parser.add_argument("--ecoinvent-xlsx", type=Path, default=DEFAULT_ECOINVENT_XLSX)
    parser.add_argument(
        "--reference-metadata",
        type=Path,
        default=DEFAULT_REFERENCE_METADATA,
        help="Compact ecoinvent location and unit metadata used for geography aliases and compatible units.",
    )
    parser.add_argument(
        "--provider-index",
        type=Path,
        default=None,
        help="Optional CSV, openLCA JSON-LD zip, or JSON-LD directory used to resolve real provider process UUIDs.",
    )
    parser.add_argument(
        "--rebuild-uuid-matcher-table",
        action="store_true",
        help="Rebuild reference-data/UUID_matcher_table.csv from ecoinvent Unit process JSON files.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace the generated output for the selected input. Use only to deliberately rebuild that exact version.",
    )
    args = parser.parse_args()

    project_json = (args.project_json or select_project_json()).resolve()
    ecoinvent_xlsx = args.ecoinvent_xlsx.resolve()
    reference_metadata_path = args.reference_metadata.resolve()
    provider_index_csv = DEFAULT_UUID_MATCHER_TABLE.resolve()
    if args.provider_index:
        provider_index_path = args.provider_index.resolve()
        should_write_provider_index_csv = False
    elif args.rebuild_uuid_matcher_table or not provider_index_csv.exists():
        provider_index_path = BASE_DIR
        should_write_provider_index_csv = True
    else:
        provider_index_path = provider_index_csv.resolve()
        should_write_provider_index_csv = False

    for path in [project_json, ecoinvent_xlsx, reference_metadata_path, *([provider_index_path] if provider_index_path else [])]:
        if BASE_DIR not in [path, *path.parents]:
            raise SystemExit(f"Refusing to access path outside OpenLCA folder: {path}")

    try:
        project_id = project_json.relative_to(PROJECTS_DIR).parts[0]
        if project_json.parent.name != "input":
            raise ValueError
    except ValueError as exc:
        raise SystemExit(
            f"Project JSON must be stored in {PROJECTS_DIR}/<project-id>/input/: {project_json}"
        ) from exc

    try:
        source_project_document = load_project(project_json)
        project_document, preparation_corrections = prepare_project_document(source_project_document)
        ecoinvent_index = load_ecoinvent_index(ecoinvent_xlsx)
        provider_index = load_provider_index(provider_index_path)
        reference_metadata = load_reference_metadata(reference_metadata_path)
    except Exception as exc:
        print_errors([str(exc)])
        raise SystemExit(1) from exc

    package, diagnostics = build_package(project_document, ecoinvent_index, provider_index, reference_metadata)
    diagnostics["counts"]["providerIndexByFlowUuid"] = len(provider_index["by_flow_uuid"])
    diagnostics["counts"]["providerIndexByMatchKey"] = len(provider_index["by_match_key"])
    diagnostics["counts"]["providerIndexProcesses"] = len(
        {
            provider.provider_uuid
            for entries in provider_index.values()
            for provider_list in entries.values()
            for provider in provider_list
        }
    )

    # Keep an input and its generated folder visibly paired. Input filenames are
    # already restricted to project/version/scenario names, so no extra slugging
    # is needed here.
    package_name = project_json.stem
    project_output_dir = PROJECTS_DIR / project_id / "generated" / package_name
    if project_output_dir.exists():
        if not args.replace:
            raise SystemExit(
                f"Generated output already exists: {project_output_dir}\n"
                "Create a new input version to preserve the existing result, or rerun with --replace."
            )
        shutil.rmtree(project_output_dir)
    project_output_dir.mkdir(parents=True)
    prepared_json_path = project_output_dir / f"{package_name}-openlca-prepared.json"
    write_json(prepared_json_path, project_document)
    diagnostics["counts"]["preparationCorrections"] = len(preparation_corrections)

    # Keep this muted by default: the UUID matcher table only needs rebuilding
    # when the ecoinvent Unit JSON source changes.
    if should_write_provider_index_csv:
        write_provider_index_csv(provider_index_csv, provider_index)

    zip_path = project_output_dir / f"{package_name}-openlca-jsonld.zip"
    with tempfile.TemporaryDirectory(prefix="openlca-jsonld-", dir=project_output_dir) as temporary_dir:
        package_dir = Path(temporary_dir) / "package"
        write_package_files(package_dir, package, diagnostics)
        zip_directory(package_dir, zip_path)

    errors = conversion_errors(diagnostics, provider_index, package)
    print_errors(errors)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
