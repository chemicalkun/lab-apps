"""Check newly exposed bases through the real preflight and SCF paths."""
import contextlib
import io
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "engine"))
import worker


class ExtendedBasisTests(unittest.TestCase):
    def test_water_basis_dimensions_and_hf(self):
        with contextlib.redirect_stdout(io.StringIO()):
            graph = worker.import_smiles({"smiles": "O"})["molecule"]
            for basis, count in [("6-31g(d)", 18), ("6-31+g(d)", 22), ("def2-tzvp", 43)]:
                with self.subTest(basis=basis):
                    settings = {"method": "HF", "basis": basis, "threads": 1, "orbitalGrids": False}
                    checked = worker.check_structure({"molecule": graph, "settings": settings})
                    self.assertEqual(checked["basis_functions"], count)
                    result = worker.calculate({"molecule": graph, "settings": settings})
                    self.assertTrue(result["converged"])
                    self.assertEqual(result["basis_functions"], count)
                    self.assertEqual(result["basis"], basis)
                    self.assertTrue(-77 < result["energy_hartree"] < -75)

    def test_iodine_def2_tzvp_uses_ecp(self):
        with contextlib.redirect_stdout(io.StringIO()):
            graph = worker.import_smiles({"smiles": "I"})["molecule"]
            checked = worker.check_structure({"molecule": graph, "settings": {"method": "HF", "basis": "def2-tzvp"}})
            self.assertEqual(checked["electrons"], 54)
            self.assertEqual(checked["explicit_electrons"], 26)
            self.assertTrue(any("28" in warning and "ECP" in warning for warning in checked["warnings"]))
            settings = {"method": "HF", "basis": "def2-tzvp", "threads": 1, "orbitalGrids": False}
            result = worker.calculate({"molecule": graph, "settings": settings})
            self.assertTrue(result["converged"])
            self.assertTrue(any("ECP" in warning for warning in result["warnings"]))


if __name__ == "__main__":
    unittest.main()
