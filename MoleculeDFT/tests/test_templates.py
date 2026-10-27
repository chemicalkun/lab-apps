"""Validate the actual editor catalog through RDKit's import pipeline."""
import ast
import contextlib
import io
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))
import worker


class TemplateTests(unittest.TestCase):
    def test_catalog_imports_as_connected_molecules(self):
        source = (ROOT / "web/app.js").read_text()
        templates = ast.literal_eval(re.search(r"const TEMPLATES=(\[.*?\n  \]);", source, re.S).group(1))
        self.assertEqual(len({row[0] for row in templates}), len(templates))
        for identifier, label, smiles in templates:
            with self.subTest(template=identifier), contextlib.redirect_stdout(io.StringIO()):
                data = worker.import_smiles({"smiles": smiles})
                graph = data["molecule"]
                checked = worker.check_structure({"molecule": graph, "settings": {"method": "HF"}})
                self.assertTrue(checked["valid"], label)
                self.assertTrue(graph["atoms"], label)


if __name__ == "__main__":
    unittest.main()
