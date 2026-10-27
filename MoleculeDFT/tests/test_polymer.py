import copy
import math
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
import worker
from rdkit import Chem

class PolymerTests(unittest.TestCase):
    def test_pe_formula_connectivity_and_end_groups(self):
        for n in (1,2,5,20,100):
            with self.subTest(n=n):
                data=worker.build_polymer({'degree':n})
                mol=worker.molecule_from_graph(data['molecule'])
                self.assertEqual(data['formula'],f'C{2*n}H{4*n+2}')
                self.assertEqual(data['total_atoms'],6*n+2)
                self.assertEqual(mol.GetNumBonds(),2*n-1)
                self.assertEqual(sorted(a.GetTotalNumHs() for a in mol.GetAtoms()),[2]*(2*n-2)+[3,3])
                self.assertEqual(data['molecule']['polymer']['degree'],n)
        self.assertFalse(data['quantum_allowed'])

    def test_custom_drawn_ethane_matches_pe(self):
        graph={'atoms':[{'id':'a','element':'C','x':0,'y':0,'charge':0},{'id':'b','element':'C','x':56,'y':0,'charge':0}], 'bonds':[{'id':'ab','a':'a','b':'b','order':1}]}
        result=worker.build_polymer({'source':'drawing','molecule':graph,'head':'a','tail':'b','degree':5})
        self.assertEqual(result['smiles'],'CCCCCCCCCC')
        self.assertEqual(result['formula'],'C10H22')

    def test_bracket_hydrogens_consumed_without_radicals(self):
        unit=worker.graph_from_molecule(Chem.MolFromSmiles('[CH3][CH3]'))
        result=worker.build_polymer({'source':'drawing','molecule':unit,'head':'a0','tail':'a1','degree':3})
        mol=worker.molecule_from_graph(result['molecule'])
        self.assertEqual(result['formula'],'C6H14')
        self.assertEqual(sum(a.GetNumRadicalElectrons() for a in mol.GetAtoms()),0)

    def test_invalid_degree_and_attachment_are_rejected(self):
        for degree in (0,101,2.5,True):
            with self.assertRaises(worker.ChemistryError):worker.build_polymer({'degree':degree})
        unit=worker.graph_from_molecule(Chem.MolFromSmiles('CC(C)(C)C'))
        with self.assertRaisesRegex(worker.ChemistryError,'水素'):
            worker.build_polymer({'source':'drawing','molecule':unit,'head':'a1','tail':'a0','degree':2})

    def test_chiral_attachment_not_silently_reinterpreted(self):
        unit=worker.graph_from_molecule(Chem.MolFromSmiles('C[C@H](O)F'))
        with self.assertRaisesRegex(worker.ChemistryError,'立体配置'):
            worker.build_polymer({'source':'drawing','molecule':unit,'head':'a1','tail':'a0','degree':2})

    def test_stale_repeat_metadata_rejected(self):
        data=worker.build_polymer({'degree':3})
        graph=copy.deepcopy(data['molecule']);graph.pop('molblock');graph.pop('sourceGraph');graph['atoms'][0]['element']='O'
        with self.assertRaises(worker.ChemistryError):worker.polymer_metadata(graph)
        graph=copy.deepcopy(data['molecule']);graph['atoms'][0]['x']+=12
        self.assertEqual(worker.polymer_metadata(graph)['degree'],3)

    def test_old_120_atom_limit_is_lifted_for_pe(self):
        data=worker.build_polymer({'degree':20})
        result=worker.prepare_molecule(worker.molecule_from_graph(data['molecule']),data['molecule'])
        self.assertEqual(len(result['atoms3d']),122)
        self.assertEqual(result['polymer']['degree'],20)

    def test_large_chain_remains_drawable_but_quantum_limit_enforced(self):
        data=worker.build_polymer({'degree':100})
        with self.assertRaisesRegex(worker.ChemistryError,'600'):
            worker.prepare_molecule(worker.molecule_from_graph(data['molecule']),data['molecule'])

    def test_pe_hf_matches_independent_rhf_reference(self):
        from pyscf import gto,scf,lib
        lib.num_threads(1)
        graph=worker.build_polymer({'degree':2})['molecule']
        result=worker.calculate({'molecule':graph,'settings':{'method':'HF','threads':1}})
        mol=gto.M(atom=[(a['element'],(a['x'],a['y'],a['z'])) for a in result['atoms3d']],basis='sto-3g',unit='Angstrom',verbose=0)
        ref=scf.RHF(mol);ref.conv_tol=1e-9;energy=ref.kernel()
        self.assertTrue(ref.converged)
        self.assertAlmostEqual(result['energy_hartree'],energy,places=8)
        self.assertEqual(result['formalism'],'RHF');self.assertEqual(result['polymer']['degree'],2)
        self.assertIsNone(result['settings']['gridLevel'])
        self.assertEqual(result['formula'],'C4H10')
        self.assertEqual(result['orbital_type'],'Hartree–Fock MO')

    def test_hf_optimization_and_uhf(self):
        graph=worker.import_smiles({'smiles':'O'})['molecule']
        result=worker.calculate({'molecule':graph,'settings':{'method':'HF','task':'optimize','threads':1}})
        self.assertTrue(result['geometry_converged']);self.assertEqual(result['formalism'],'RHF')
        graph=worker.import_smiles({'smiles':'[OH]'})['molecule']
        result=worker.calculate({'molecule':graph,'settings':{'method':'HF','multiplicity':2,'threads':1}})
        self.assertEqual(result['formalism'],'UHF');self.assertEqual(len(result['orbitals']),2)
        self.assertTrue(math.isfinite(result['spin_square']))

    def test_basis_limit_reports_before_scf(self):
        graph=worker.build_polymer({'degree':1})['molecule']
        with patch.object(worker,'MAX_BASIS_FUNCTIONS',1),self.assertRaisesRegex(worker.ChemistryError,'基底関数'):
            worker.calculate({'molecule':graph,'settings':{'method':'HF','threads':1}})

if __name__=='__main__':unittest.main()
