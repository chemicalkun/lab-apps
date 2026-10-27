"""Scientific/regression checks; run with the local environment's Python.

    .venv/bin/python -m unittest discover -s tests -p test_engine.py -v
"""
import copy
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
import worker


def atom(element="C", name="a0", charge=0):
    return {"id": name, "element": element, "x": 0, "y": 0, "charge": charge}


def graph(atoms, bonds=()):
    return {"atoms": atoms, "bonds": [dict(id=f"b{i}", a=a, b=b, order=order)
                                      for i, (a, b, order) in enumerate(bonds)]}


class StructureTests(unittest.TestCase):
    def test_manual_carbon_gains_four_hydrogens(self):
        result = worker.dispatch({"op": "prepare", "payload": {"molecule": graph([atom()])}})
        self.assertEqual(result["formula"], "CH4")
        self.assertEqual(len(result["atoms3d"]), 5)
        self.assertEqual(len(result["bonds3d"]), 4)
        self.assertEqual(result["xyz"].splitlines()[0], "5")
        for bond in result["bonds3d"]:
            first, second = [result["atoms3d"][bond[key]] for key in ("a", "b")]
            length = math.dist([first[k] for k in "xyz"], [second[k] for k in "xyz"])
            self.assertTrue(1.0 < length < 1.2)

    def test_aromatic_import_preserves_formula_and_bonds(self):
        result = worker.import_smiles({"smiles": "c1ccccc1"})
        self.assertEqual(result["formula"], "C6H6")
        self.assertEqual(sorted(b["order"] for b in result["molecule"]["bonds"]), [1, 1, 1, 2, 2, 2])
        restored = worker.prepare_molecule(worker.molecule_from_graph(result["molecule"]))
        self.assertEqual(restored["smiles"], result["smiles"])

    def test_stereochemistry_and_radicals_survive_round_trip(self):
        for smiles in ("C[C@H](O)F", "C/C=C/C", "[CH3]", "[NH4+]", "[13CH4]"):
            with self.subTest(smiles=smiles):
                result = worker.import_smiles({"smiles": smiles})
                moved = copy.deepcopy(result["molecule"])
                moved["atoms"][0]["x"] += 100
                restored = worker.prepare_molecule(worker.molecule_from_graph(moved))
                self.assertEqual(restored["smiles"], result["smiles"])
                self.assertEqual(restored["formula"], result["formula"])

    def test_changed_graph_cannot_reuse_import_metadata(self):
        molecule = worker.import_smiles({"smiles": "CCO"})["molecule"]
        molecule["atoms"][0]["element"] = "N"
        with self.assertRaises(worker.ChemistryError):
            worker.molecule_from_graph(molecule)

    def test_mol_import_preserves_chirality(self):
        original = worker.import_smiles({"smiles": "C[C@H](O)F"})
        result = worker.import_mol({"molblock": original["molblock"]})
        self.assertEqual(original["smiles"], result["smiles"])

    def test_bad_valence_is_rejected(self):
        atoms = [atom(name=f"a{i}") for i in range(6)]
        bonds = [("a0", f"a{i}", 1) for i in range(1, 6)]
        with self.assertRaises(worker.ChemistryError):
            worker.molecule_from_graph(graph(atoms, bonds))

    def test_disconnected_structure_is_rejected(self):
        with self.assertRaises(worker.ChemistryError):
            worker.import_smiles({"smiles": "CC.O"})

    def test_invalid_smiles_and_unsupported_element_rejected(self):
        for smiles in ("not-a-smiles", "C1CC", "[Fe]"):
            with self.subTest(smiles=smiles), self.assertRaises(worker.ChemistryError):
                worker.import_smiles({"smiles": smiles})

    def test_invalid_bonds_are_rejected(self):
        for bonds in (("a0", "a0", 1), ("a0", "missing", 1), ("a0", "a1", 4)):
            with self.subTest(bonds=bonds), self.assertRaises(worker.ChemistryError):
                worker.molecule_from_graph(graph([atom(name="a0"), atom(name="a1")], [bonds]))

    def test_spin_electron_parity_and_ranges(self):
        water = worker.import_smiles({"smiles": "O"})
        for settings in ({"multiplicity": 2}, {"threads": 0}, {"maxCycles": 1.5}, {"charge": 10}, {"method": "arbitrary"}):
            with self.subTest(settings=settings), self.assertRaises(worker.ChemistryError):
                worker.validate_settings(settings, water["atoms3d"], 0)
        radical = worker.import_smiles({"smiles": "[OH]"})
        settings = worker.validate_settings({"multiplicity": 2}, radical["atoms3d"], 0)
        self.assertEqual(settings["electrons"], 9)
        self.assertEqual(settings["spin"], 1)

    def test_cli_malformed_request_produces_protocol_error(self):
        result = subprocess.run([sys.executable, str(Path(worker.__file__))], input="{bad json", text=True, capture_output=True, check=True)
        response = json.loads(result.stdout.split("__RESULT__")[-1])
        self.assertIs(response["ok"], False)
        self.assertTrue(response["error"])


class CalculationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.water = worker.import_smiles({"smiles": "O"})["molecule"]

    def test_real_water_single_point(self):
        result = worker.calculate({"molecule": self.water, "settings": {"method": "B3LYP", "basis": "sto-3g", "threads": 1}})
        self.assertTrue(result["converged"])
        self.assertIsNone(result["geometry_converged"])
        self.assertTrue(-76 < result["energy_hartree"] < -74)
        self.assertEqual(result["electrons"], 10)
        self.assertEqual(result["formula"], "H2O")
        self.assertEqual(len(result["dipole_debye"]), 3)
        self.assertEqual(result["orbitals"][0]["spin"], "restricted")
        self.assertGreater(result["orbitals"][0]["gap_ev"], 0)

    def test_scf_nonconvergence_never_returns_success(self):
        with self.assertRaisesRegex(worker.ChemistryError, "SCF"):
            worker.calculate({"molecule": self.water, "settings": {"maxCycles": 1, "threads": 1}})

    def test_real_unrestricted_radical(self):
        hydroxyl = worker.import_smiles({"smiles": "[OH]"})["molecule"]
        result = worker.calculate({"molecule": hydroxyl, "settings": {"method": "PBE", "multiplicity": 2, "threads": 1}})
        self.assertTrue(result["converged"])
        self.assertEqual([o["spin"] for o in result["orbitals"]], ["alpha", "beta"])
        self.assertTrue(-76 < result["energy_hartree"] < -73)
        self.assertAlmostEqual(result["spin_square"], .75, delta=.1)

    def test_geometry_nonconvergence_never_returns_success(self):
        with self.assertRaisesRegex(Exception, "収束|converg"):
            worker.calculate({"molecule": self.water, "settings": {"task": "optimize", "maxSteps": 1, "threads": 1}})

    def test_real_water_optimization(self):
        result = worker.calculate({"molecule": self.water, "settings": {"task": "optimize", "maxSteps": 30, "threads": 1}})
        self.assertTrue(result["converged"])
        self.assertTrue(result["geometry_converged"])
        self.assertEqual(result["geometry_source"], "PySCF / geomeTRIC")
        self.assertIn("ETKDGv3", result["initial_geometry_source"])
        self.assertEqual(result["settings"]["gridLevel"], 3)
        self.assertEqual(result["settings"]["scfTolerance"], 1e-9)
        self.assertNotEqual(result["xyz"].splitlines()[2:], result["initial_xyz"].splitlines()[2:])
        self.assertTrue(any("振動解析" in message for message in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
