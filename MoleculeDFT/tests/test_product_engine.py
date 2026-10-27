import copy
import math
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import worker
from rdkit import Chem

class ProductEngineTests(unittest.TestCase):
    def test_stereo_clean_and_wedge_graph_roundtrip(self):
        mol=Chem.MolFromSmiles('C[C@H](O)F')
        graph=worker.graph_from_molecule(mol)
        self.assertTrue(any(b.get('stereo') for b in graph['bonds']))
        bare=copy.deepcopy(graph);bare.pop('molblock');bare.pop('sourceGraph')
        self.assertEqual(Chem.MolToSmiles(worker.molecule_from_graph(bare),True),Chem.MolToSmiles(mol,True))
        clean=worker.clean_2d({'molecule':bare})
        self.assertEqual(clean['smiles'],Chem.MolToSmiles(mol,True))
        self.assertEqual([a['id'] for a in graph['atoms']],[a['id'] for a in clean['molecule']['atoms']])
        report=worker.check_structure({'molecule':clean['molecule'],'settings':{'method':'HF'}})
        self.assertEqual(len(report['stereo']),1)
        self.assertEqual(report['formula'],'C2H5FO')
    def test_clean_retains_polymer_model(self):
        graph=worker.build_polymer({'source':'pp','degree':4,'tacticity':'isotactic'})['molecule']
        cleaned=worker.clean_2d({'molecule':graph})['molecule']
        self.assertEqual(worker.polymer_metadata(cleaned)['tacticity'],'isotactic')
        self.assertEqual(Chem.MolToSmiles(worker.molecule_from_graph(graph),True),Chem.MolToSmiles(worker.molecule_from_graph(cleaned),True))
    def test_preflight_counts_and_limits(self):
        graph=worker.graph_from_molecule(Chem.MolFromSmiles('O'))
        r=worker.check_structure({'molecule':graph,'settings':{'method':'HF'}})
        self.assertEqual((r['total_atoms'],r['electrons'],r['basis_functions']),(3,10,7))
        with self.assertRaises(worker.ChemistryError):worker.check_structure({'molecule':graph,'settings':{'multiplicity':2}})
    def test_end_group_formulas(self):
        for ends,formula in [({'head':'OH','tail':'H'},'C4H10O'),({'head':'CH3','tail':'CH3'},'C6H14'),({'head':'OH','tail':'OH'},'C4H10O2')]:
            result=worker.build_polymer({'source':'pe','degree':2,'endGroups':ends})
            self.assertEqual(result['formula'],formula)
            self.assertEqual(result['polymer']['endGroups'],ends)
    def test_copolymer_sequence_and_seed(self):
        payload={'source':'pe','degree':3,'sourceB':'pp','degreeB':4,'architecture':'block'}
        result=worker.build_polymer(payload)
        self.assertEqual(result['polymer']['sequence'],['pe']*3+['pp']*4)
        self.assertEqual(result['formula'],'C18H38')
        payload.update(architecture='random',seed=77,tacticity='random')
        a=worker.build_polymer(payload);b=worker.build_polymer(payload)
        self.assertEqual(a['smiles'],b['smiles']);self.assertEqual(a['polymer']['sequence'],b['polymer']['sequence'])
        self.assertEqual(a['polymer']['sequence'].count('pe'),3)
        self.assertEqual(a['polymer']['sequence'].count('pp'),4)
        with self.assertRaises(worker.ChemistryError):worker.build_polymer(dict(payload,tacticity='isotactic'))
        with self.assertRaises(worker.ChemistryError):worker.build_polymer(dict(payload,source='peg'))
    def test_tacticity_relative_configurations(self):
        # Compare actual chiral tags in an identical atom ordering, rather than assuming all CIP R means isotactic.
        iso=worker.build_polymer({'source':'pp','degree':6,'tacticity':'isotactic'})
        syn=worker.build_polymer({'source':'pp','degree':6,'tacticity':'syndiotactic'})
        im=worker.molecule_from_graph(iso['molecule']);sm=worker.molecule_from_graph(syn['molecule'])
        ic=[a.GetChiralTag() for a in im.GetAtoms() if a.GetChiralTag()!=Chem.ChiralType.CHI_UNSPECIFIED]
        sc=[a.GetChiralTag() for a in sm.GetAtoms() if a.GetChiralTag()!=Chem.ChiralType.CHI_UNSPECIFIED]
        self.assertGreaterEqual(len(ic),4);self.assertEqual(len(set(ic)),1)
        self.assertTrue(all(a!=b for a,b in zip(sc,sc[1:])))
        self.assertNotEqual(iso['smiles'],syn['smiles'])
    def test_conformers_deduplicated_reproducible_and_selected(self):
        graph=worker.graph_from_molecule(Chem.MolFromSmiles('CCCC'))
        a=worker.conformer_search({'molecule':graph,'count':8,'seed':42});b=worker.conformer_search({'molecule':graph,'count':8,'seed':42})
        self.assertGreaterEqual(len(a['conformers']),2)
        energies=[c['energy_kcal_mol'] for c in a['conformers']]
        self.assertEqual(energies,sorted(energies));self.assertAlmostEqual(a['conformers'][0]['relative_energy_kcal_mol'],0)
        self.assertEqual([c['geometry']['coordinateHash'] for c in a['conformers']],[c['geometry']['coordinateHash'] for c in b['conformers']])
        chosen=a['conformers'][-1]['geometry']
        result=worker.calculate({'molecule':graph,'geometry':chosen,'settings':{'method':'HF','threads':1,'orbitalGrids':False}})
        self.assertEqual(result['initial_geometry_source'].split('/')[0].strip(),'Selected conformer')
        self.assertTrue(np.allclose([[v[k] for k in ('x','y','z')] for v in chosen['atoms3d']],[[v[k] for k in ('x','y','z')] for v in result['atoms3d']],atol=1e-8))
        altered=copy.deepcopy(chosen);altered['atoms3d'][0]['x']+=.3
        with self.assertRaises(worker.ChemistryError):worker.selected_geometry(worker.molecule_from_graph(graph),graph,altered)
    def test_geometry_hash_survives_native_number_roundtrip(self):
        atoms=[{"element":"C","x":1.2345678901234567,"y":-0.2345678901234567,"z":0.0}]
        bridged=[{**atoms[0],"x":1.234567890123457,"y":-0.2345678901234567,"z":0}]
        self.assertEqual(worker.geometry_digest(atoms),worker.geometry_digest(bridged))
        bridged[0]["x"]+=1e-4
        self.assertNotEqual(worker.geometry_digest(atoms),worker.geometry_digest(bridged))

    def test_conformer_assigned_chirality_survives(self):
        graph=worker.graph_from_molecule(Chem.MolFromSmiles('C[C@H](O)F'))
        result=worker.conformer_search({'molecule':graph,'count':3,'seed':42})
        for c in result['conformers']:
            worker.selected_geometry(worker.molecule_from_graph(graph),graph,c['geometry'])
    def test_mo_values_and_mulliken_against_independent_scf(self):
        from pyscf import gto,scf,lib
        lib.num_threads(1)
        graph=worker.graph_from_molecule(Chem.MolFromSmiles('O'))
        result=worker.calculate({'molecule':graph,'settings':{'method':'HF','threads':1,'gridSize':16}})
        mol=gto.M(atom=[(a['element'],[a[k] for k in ('x','y','z')]) for a in result['atoms3d']],basis='sto-3g',verbose=0)
        mf=scf.RHF(mol);mf.conv_tol=1e-9;mf.kernel()
        self.assertTrue(np.allclose(mf.mulliken_pop(verbose=0)[1],result['charges']['values'],atol=1e-7))
        self.assertAlmostEqual(sum(result['charges']['values']),0,places=7)
        for grid in result['orbital_grids']:
            self.assertEqual(len(grid['values']),16**3)
            indices=np.array([[2,4,7],[8,8,8],[10,6,9]])
            coords=np.array(grid['origin_bohr'])+indices@np.array(grid['axes_bohr'])
            ref=mol.eval_gto('GTOval_sph',coords)@mf.mo_coeff[:,grid['index']]
            actual=np.array(grid['values']).reshape(grid['shape'])[tuple(indices.T)]
            self.assertTrue(np.allclose(np.abs(ref),np.abs(actual),atol=1e-6))
    def test_open_shell_orbitals_have_both_spin_channels(self):
        graph=worker.graph_from_molecule(Chem.MolFromSmiles('[OH]'))
        result=worker.calculate({'molecule':graph,'settings':{'method':'HF','multiplicity':2,'threads':1,'gridSize':16}})
        self.assertEqual({g['spin'] for g in result['orbital_grids']},{'alpha','beta'})
        self.assertEqual(len(result['charges']['values']),2)

if __name__=='__main__':unittest.main()
