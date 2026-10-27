import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import worker
from rdkit import Chem

class PresetTests(unittest.TestCase):
    def test_formula_and_connectivity(self):
        repeats={'pe':{'C':2,'H':4},'pp':{'C':3,'H':6},'ps':{'C':8,'H':8},'pmma':{'C':5,'H':8,'O':2},'peg':{'C':2,'H':4,'O':1},'pvc':{'C':2,'H':3,'Cl':1},'pan':{'C':3,'H':3,'N':1},'pva':{'C':2,'H':4,'O':1},'ptfe':{'C':2,'F':4}}
        for key, composition in repeats.items():
            for n in (1,2,5):
                with self.subTest(preset=key,n=n):
                    result=worker.build_polymer({'source':key,'degree':n})
                    mol=worker.molecule_from_graph(result['molecule'])
                    full=Chem.AddHs(mol)
                    expected={e:n*k for e,k in composition.items()};expected['H']=expected.get('H',0)+2
                    if key=='peg':expected['O']+=1
                    actual={e:sum(a.GetSymbol()==e for a in full.GetAtoms()) for e in expected}
                    self.assertEqual(actual,expected)
                    self.assertEqual(full.GetNumAtoms(),sum(expected.values()))
                    self.assertEqual(len(Chem.GetMolFrags(mol)),1)
                    self.assertEqual(sum(a.GetNumRadicalElectrons() for a in mol.GetAtoms()),0)
                    self.assertEqual(result['polymer']['preset'],key)
                    self.assertEqual(Chem.GetFormalCharge(mol),0)
                    if key=='peg':
                        oxygen=[a for a in mol.GetAtoms() if a.GetSymbol()=='O']
                        self.assertEqual(sum(a.GetTotalNumHs()==1 for a in oxygen),2)
                        self.assertEqual(sum(a.GetDegree()==2 for a in oxygen),n-1)
                        self.assertEqual(result['polymer']['termination'],'OH / OH')
                    patterns={'ps':'c1ccccc1','pmma':'C(=O)OC','pan':'C#N','pvc':'[Cl]','pva':'[OH]','ptfe':'[F]'}
                    if key in patterns:
                        self.assertEqual(len(mol.GetSubstructMatches(Chem.MolFromSmarts(patterns[key]))),n*(4 if key=='ptfe' else 1))
    def test_catalog_estimates_and_stereochemistry(self):
        for preset in worker.polymer_catalog():
            result=worker.build_polymer({'source':preset['id'],'degree':3})
            estimate=sum(preset['composition'].values())*3+sum(preset['endComposition'].values())
            self.assertEqual(result['total_atoms'],estimate)
            if preset['id'] in ('pp','ps','pmma','pvc','pan','pva'):
                self.assertIn('未指定',result['polymer']['stereoNote'])
                self.assertTrue(any('未指定' in w for w in result['warnings']))
    def test_each_preset_3d(self):
        for preset in worker.polymer_catalog():
            with self.subTest(preset=preset['id']):
                graph=worker.build_polymer({'source':preset['id'],'degree':2})['molecule']
                result=worker.prepare_molecule(worker.molecule_from_graph(graph),graph)
                self.assertEqual(len(result['atoms3d']),graph['polymer']['total_atoms'])
    def test_peg_dft_and_ptfe_hf(self):
        for source,method in [('peg','B3LYP'),('ptfe','HF')]:
            graph=worker.build_polymer({'source':source,'degree':1})['molecule']
            result=worker.calculate({'molecule':graph,'settings':{'method':method,'threads':1}})
            self.assertTrue(result['converged'])
            self.assertEqual(result['polymer']['preset'],source)
            self.assertEqual(result['formalism'],'RHF' if method=='HF' else 'RKS')

if __name__=='__main__':unittest.main()
