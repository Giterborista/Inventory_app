import unittest

import build_openlca_package as generator


class OpenLcaGeneratorTests(unittest.TestCase):
    def test_evidence_ledger_codes_are_attached_to_openlca_descriptions(self):
        molecule = {
            "notes": "Activity note",
            "documentation": {
                "referenceAndScope": "Pilot activity in Switzerland.",
                "evidenceLedger": {"code": "D-PIL-V-PRIM@internal-run-42"},
            },
        }
        row = {
            "id": "electricity-row",
            "description": "Measured electricity consumption.",
            "evidenceLedger": {"code": "D-PIL-0-PROXY@meter-log-7"},
        }

        self.assertIn("Evidence Ledger: D-PIL-V-PRIM@internal-run-42", generator.build_description(molecule))
        self.assertIn("Evidence Ledger: D-PIL-0-PROXY@meter-log-7", generator.exchange_description(row))

    def test_reference_output_is_inferred_and_stale_scaling_is_repaired(self):
        document = {
            "project": {
                "molecules": [
                    {
                        "id": "molecule-a",
                        "name": "Product A",
                        "referenceProductName": "Product A",
                        "scaleReferenceAmount": "1",
                        "scaleTargetAmount": "1",
                        "scaleUnit": "kg",
                        "rows": [
                            {
                                "id": "input",
                                "name": "Material",
                                "section": "INPUT",
                                "order": 1,
                                "totalValue": "23",
                                "totalScaledValue": "23",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            },
                            {
                                "id": "waste",
                                "name": "Wastewater treatment",
                                "section": "OUTPUT",
                                "order": 1,
                                "totalValue": "0",
                                "totalScaledValue": "0",
                                "unit": "m3",
                                "scaledUnit": "m3",
                                "ecoinventName": "treatment of wastewater",
                            },
                            {
                                "id": "product",
                                "name": "Product A",
                                "section": "OUTPUT",
                                "order": 3,
                                "totalValue": "537.4",
                                "totalScaledValue": "1",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            },
                        ],
                    }
                ]
            }
        }

        prepared, _ = generator.prepare_project_document(document)
        molecule = prepared["project"]["molecules"][0]
        reference = generator.reference_output(molecule)
        material = next(row for row in molecule["rows"] if row["id"] == "input")

        self.assertEqual(reference["id"], "product")
        self.assertTrue(reference["isReferenceOutput"])
        self.assertAlmostEqual(float(material["totalScaledValue"]), 23 / 537.4)
        self.assertEqual(molecule["scaleReferenceAmount"], "537.4")

    def test_compatible_units_are_converted(self):
        self.assertAlmostEqual(generator.convert_amount(65, "kWh", "MJ"), 234)
        self.assertAlmostEqual(generator.convert_amount(102, "g", "kg"), 0.102)
        with self.assertRaises(ValueError):
            generator.convert_amount(1, "kg", "MJ")

    def test_ecoinvent_geography_codes_select_the_matching_provider(self):
        dataset = generator.EcoinventDataset(
            activity_uuid="activity",
            product_uuid="electricity-flow",
            activity_name="market group for electricity, medium voltage",
            geography="CH",
            reference_product="electricity, medium voltage",
            unit="kWh",
            amount=1,
        )
        index = generator.empty_provider_index()
        metadata = generator.ReferenceMetadata(
            geography_aliases={"ch": "switzerland", "switzerland": "switzerland"},
            units_by_flow_property={},
        )
        for provider_id, geography in (("saskatchewan", "Canada, Saskatchewan"), ("switzerland", "Switzerland")):
            generator.add_provider_ref(
                index,
                generator.ProviderRef(
                    provider_uuid=provider_id,
                    provider_name="market group for electricity, medium voltage",
                    flow_uuid="electricity-flow",
                    flow_name="electricity, medium voltage",
                    activity_name="market group for electricity, medium voltage",
                    geography=geography,
                    unit="MJ",
                    source="test",
                    quantitative_reference_is_input=False,
                    flow_type="PRODUCT_FLOW",
                ),
            )

        provider = generator.resolve_provider(
            dataset,
            index,
            {"ecoinventGeography": "CH"},
            desired_quantitative_reference_is_input=False,
            reference_metadata=metadata,
        )

        self.assertEqual(provider.provider_uuid, "switzerland")
        self.assertEqual(generator.canonical_geography("CH", metadata), generator.canonical_geography("Switzerland", metadata))
        self.assertEqual(generator.geography_score("Canada, Saskatchewan", "CH", metadata), 0)

    def test_geography_labels_and_legacy_dataset_names_are_normalized(self):
        metadata = generator.ReferenceMetadata(
            geography_aliases={
                "glo": "global",
                "global": "global",
                "rer": "europe",
                "europe": "europe",
                "rer without ru": "europe without russia",
                "europe without russia": "europe without russia",
            },
            units_by_flow_property={},
        )
        self.assertEqual(generator.canonical_geography("Global (GLO)", metadata), "global")
        self.assertEqual(generator.canonical_geography("Europe (RER)", metadata), "europe")
        self.assertEqual(generator.canonical_geography("RER w/o RU", metadata), "europe without russia")

        dataset = generator.EcoinventDataset(
            activity_uuid="water-activity",
            product_uuid="water-flow",
            activity_name="water production, ultrapure",
            geography="RER",
            reference_product="water, ultrapure",
            unit="kg",
            amount=1,
        )
        index = {
            generator.provider_key(dataset.activity_name, dataset.geography, dataset.reference_product, dataset.unit): dataset
        }
        row = {
            "name": "Water",
            "unit": "kg",
            "ecoinventName": "Water, ultrapure {RER} | water production, ultrapure | Cut-off, U",
        }
        self.assertEqual(generator.match_ecoinvent_row(row, index), dataset)

    def test_all_project_geography_labels_resolve_with_reference_metadata(self):
        expected = {
            "RER": "europe",
            "Europe without Switzerland": "europe without switzerland",
            "GLO": "global",
            "RER w/o RU": "europe without russia",
            "RoW": "rest of world",
            "Global (GLO)": "global",
            "Europe (RER)": "europe",
            "CH": "switzerland",
        }
        metadata = generator.ReferenceMetadata(
            geography_aliases={
                generator.normalize_geography_alias(label): canonical
                for label, canonical in expected.items()
            } | {canonical: canonical for canonical in expected.values()},
            units_by_flow_property={},
        )

        for label, canonical in expected.items():
            with self.subTest(label=label):
                self.assertEqual(generator.canonical_geography(label, metadata), canonical)

    def test_background_exchange_preserves_compatible_ecoinvent_unit(self):
        dataset = generator.EcoinventDataset(
            activity_uuid="activity",
            product_uuid="electricity-flow",
            activity_name="market group for electricity, medium voltage",
            geography="RER",
            reference_product="electricity, medium voltage",
            unit="kWh",
            amount=1,
        )
        ecoinvent_index = {generator.provider_key(dataset.activity_name, "RER", dataset.reference_product, "kWh"): dataset}
        provider = generator.ProviderRef(
            provider_uuid="europe-provider",
            provider_name="market group for electricity, medium voltage",
            flow_uuid="electricity-flow",
            flow_name="electricity, medium voltage",
            activity_name=dataset.activity_name,
            geography="Europe",
            unit="MJ",
            source="test",
            unit_id="mj-unit",
            flow_property_id="energy-property",
            flow_property_name="Energy",
            quantitative_reference_is_input=False,
            flow_type="PRODUCT_FLOW",
        )
        provider_index = generator.empty_provider_index()
        generator.add_provider_ref(provider_index, provider, generator.provider_keys_for_dataset(dataset))
        metadata = generator.ReferenceMetadata(
            geography_aliases={"rer": "europe", "europe": "europe"},
            units_by_flow_property={
                ("energy-property", "kwh"): generator.ReferenceUnit(
                    unit_id="kwh-unit",
                    unit_name="kWh",
                    unit_group_id="energy-units",
                    unit_group_name="Units of energy",
                    conversion_factor=3.6,
                )
            },
        )
        document = {
            "project": {
                "name": "Electricity test",
                "links": [],
                "molecules": [
                    {
                        "id": "process",
                        "name": "Product",
                        "referenceProductName": "Product",
                        "scaleUnit": "kg",
                        "rows": [
                            {
                                "id": "electricity",
                                "name": "Electricity",
                                "section": "INPUT",
                                "order": 1,
                                "totalValue": "65",
                                "totalScaledValue": "65",
                                "unit": "kWh",
                                "scaledUnit": "kWh",
                                "ecoinventStatus": "present",
                                "ecoinventName": "market group for electricity, medium voltage {RER} | electricity, medium voltage | Cut-off, U",
                                "ecoinventGeography": "RER",
                                "ecoinventReferenceProduct": "electricity, medium voltage",
                                "ecoinventUnit": "kWh",
                            },
                            {
                                "id": "product",
                                "name": "Product",
                                "section": "OUTPUT",
                                "order": 1,
                                "totalValue": "1",
                                "totalScaledValue": "1",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            },
                        ],
                    }
                ],
            }
        }
        prepared, _ = generator.prepare_project_document(document)
        package, _ = generator.build_package(prepared, ecoinvent_index, provider_index, metadata)
        process_id = generator.stable_uuid("proxy-process", "process")
        electricity = next(exchange for exchange in package["processes"][process_id]["exchanges"] if exchange["isInput"])

        self.assertEqual(electricity["amount"], 65)
        self.assertEqual(electricity["unit"]["name"], "kWh")
        self.assertEqual(electricity["unit"]["@id"], "kwh-unit")
        self.assertEqual(electricity["flowProperty"]["@id"], "energy-property")
        self.assertEqual(electricity["defaultProvider"]["@id"], "europe-provider")
        generated_unit_names = {
            unit["name"]
            for group in package["unit_groups"].values()
            for unit in group.get("units", [])
        }
        self.assertNotIn("kWh", generated_unit_names)

    def test_linked_foreground_amount_uses_child_unit(self):
        document = {
            "project": {
                "name": "Unit test",
                "molecules": [
                    {
                        "id": "parent",
                        "name": "Parent",
                        "referenceProductName": "Parent",
                        "scaleUnit": "kg",
                        "rows": [
                            {
                                "id": "parent-input",
                                "name": "Child",
                                "section": "INPUT",
                                "order": 1,
                                "totalValue": "102",
                                "totalScaledValue": "102",
                                "unit": "g",
                                "scaledUnit": "g",
                            },
                            {
                                "id": "parent-output",
                                "name": "Parent",
                                "section": "OUTPUT",
                                "order": 1,
                                "totalValue": "1",
                                "totalScaledValue": "1",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            },
                        ],
                    },
                    {
                        "id": "child",
                        "name": "Child",
                        "referenceProductName": "Child",
                        "scaleUnit": "kg",
                        "rows": [
                            {
                                "id": "child-output",
                                "name": "Child",
                                "section": "OUTPUT",
                                "order": 1,
                                "totalValue": "1",
                                "totalScaledValue": "1",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            }
                        ],
                    },
                ],
                "links": [],
            }
        }
        prepared, _ = generator.prepare_project_document(document)
        package, _ = generator.build_package(prepared, {}, generator.empty_provider_index())
        parent_id = generator.stable_uuid("proxy-process", "parent")
        linked = next(exchange for exchange in package["processes"][parent_id]["exchanges"] if exchange["isInput"])

        self.assertAlmostEqual(linked["amount"], 0.102)
        self.assertEqual(linked["unit"]["name"], "kg")

    def test_exact_name_does_not_autolink_a_row_marked_for_review(self):
        document = {
            "project": {
                "molecules": [
                    {
                        "id": "parent",
                        "name": "Parent",
                        "referenceProductName": "Parent",
                        "rows": [
                            {"id": "input", "name": "Child", "section": "INPUT", "needsReview": True},
                            {"id": "output", "name": "Parent", "section": "OUTPUT", "totalValue": "1", "unit": "kg"},
                        ],
                    },
                    {
                        "id": "child",
                        "name": "Child",
                        "referenceProductName": "Child",
                        "rows": [
                            {"id": "child-output", "name": "Child", "section": "OUTPUT", "totalValue": "1", "unit": "kg"}
                        ],
                    },
                ]
            }
        }

        prepared, _ = generator.prepare_project_document(document)
        row = prepared["project"]["molecules"][0]["rows"][0]

        self.assertIsNone(row.get("linkedMoleculeId"))

    def test_secondary_waste_stays_output_with_treatment_provider(self):
        dataset = generator.EcoinventDataset(
            activity_uuid="activity",
            product_uuid="waste-flow",
            activity_name="treatment of waste",
            geography="RER",
            reference_product="waste",
            unit="kg",
            amount=1,
        )
        ecoinvent_index = {generator.provider_key("treatment of waste", "RER", "waste", "kg"): dataset}
        provider = generator.ProviderRef(
            provider_uuid="treatment-process",
            provider_name="treatment of waste | waste | Cutoff, U",
            flow_uuid="waste-flow",
            flow_name="waste",
            activity_name="treatment of waste",
            geography="RER",
            unit="kg",
            source="test",
            quantitative_reference_is_input=True,
            flow_type="WASTE_FLOW",
        )
        provider_index = generator.empty_provider_index()
        generator.add_provider_ref(provider_index, provider, generator.provider_keys_for_dataset(dataset))
        document = {
            "project": {
                "name": "Waste test",
                "links": [],
                "molecules": [
                    {
                        "id": "process",
                        "name": "Product",
                        "referenceProductName": "Product",
                        "scaleUnit": "kg",
                        "rows": [
                            {
                                "id": "product",
                                "name": "Product",
                                "section": "OUTPUT",
                                "order": 1,
                                "totalValue": "1",
                                "totalScaledValue": "1",
                                "unit": "kg",
                                "scaledUnit": "kg",
                            },
                            {
                                "id": "waste",
                                "name": "Waste treatment",
                                "section": "OUTPUT",
                                "order": 2,
                                "totalValue": "2",
                                "totalScaledValue": "2",
                                "unit": "kg",
                                "scaledUnit": "kg",
                                "ecoinventStatus": "present",
                                "ecoinventName": "treatment of waste {RER} | waste | Cut-off, U",
                                "ecoinventGeography": "RER",
                                "ecoinventReferenceProduct": "waste",
                                "ecoinventUnit": "kg",
                            },
                        ],
                    }
                ],
            }
        }
        prepared, _ = generator.prepare_project_document(document)
        package, _ = generator.build_package(prepared, ecoinvent_index, provider_index)
        process_id = generator.stable_uuid("proxy-process", "process")
        waste = next(exchange for exchange in package["processes"][process_id]["exchanges"] if exchange["flow"]["@id"] == "waste-flow")

        self.assertFalse(waste["isInput"])
        self.assertEqual(waste["defaultProvider"]["@id"], "treatment-process")


if __name__ == "__main__":
    unittest.main()
