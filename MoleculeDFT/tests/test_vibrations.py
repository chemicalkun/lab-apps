"""Real optimized HF/DFT vibrations and projection/imaginary-mode regression checks."""
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
import worker
from pyscf import gto

class Vibrations(unittest.TestCase):
    def test_real_water_hf_and_dft(self):
        graph = worker.import_smiles({'smiles':'O'})['molecule']
        for method in ['HF', 'B3LYP']:
            with self.subTest(method=method):
                result = worker.calculate({'molecule':graph,'settings':{'method':method,'basis':'sto-3g','task':'frequency','orbitalGrids':False}})
                v = result['vibrations']
                self.assertTrue(result['geometry_converged'])
                self.assertEqual(len(v['frequencies_cm1']), 3)
                self.assertEqual(v['imaginary_count'], 0)
                self.assertTrue(1000 < min(v['frequencies_cm1']) < 2500)
                self.assertTrue(2500 < max(v['frequencies_cm1']) < 5500)
                self.assertTrue(.01 < v['zpe_hartree'] < .04)
                self.assertEqual(np.asarray(v['normal_modes']).shape, (3,3,3))
                self.assertFalse(any('実施していないため' in w for w in result['warnings']))

    def test_projection_and_imaginary_modes(self):
        for atoms,count in [('H 0 0 0; H 0 0 .74',1),('O 0 0 0; H 0 .76 .59; H 0 -.76 .59',3)]:
            mol=gto.M(atom=atoms,basis='sto-3g',verbose=0)
            # Negative Cartesian curvature; remove rigid translations and rotations.
            h=(-np.eye(3*mol.natm)).reshape(mol.natm,3,mol.natm,3).transpose(0,2,1,3)
            v=worker.analyze_vibrations(mol,h)
            self.assertEqual(len(v['frequencies_cm1']),count)
            self.assertEqual(v['imaginary_count'],count)
            self.assertIsNone(v['zpe_hartree'])

    def test_unsupported_spin_and_size(self):
        with self.assertRaises(worker.ChemistryError):
            worker.validate_settings({'task':'frequency','multiplicity':2},[{'element':'O'},{'element':'H'}],0)
        with self.assertRaises(worker.ChemistryError):
            worker.validate_settings({'task':'frequency'},[{'element':'C'}]*51,0)

if __name__=='__main__': unittest.main()
