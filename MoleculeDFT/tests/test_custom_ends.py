import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import worker
class Ends(unittest.TestCase):
 def test_independent_amino_and_hydroxyl(self):
  r=worker.build_polymer({'source':'pe','degree':2,'endGroups':{'head':'NH2','tail':'OH'}})
  self.assertEqual(r['formula'],'C4H11NO');self.assertEqual(r['molecule']['polymer']['termination'],'NH2 / OH')
 def test_saved_methoxy_cap(self):
  cap=worker.import_smiles({'smiles':'CO'})['molecule'];root=next(a['id'] for a in cap['atoms'] if a['element']=='O')
  r=worker.build_polymer({'source':'pe','degree':2,'endGroups':{'head':{'name':'methoxy','molecule':cap,'root':root},'tail':'H'}})
  self.assertEqual(r['formula'],'C5H12O');self.assertEqual(r['molecule']['polymer']['endGroups']['head']['root'],root)
 def test_acetoxy_end(self):
  from rdkit import Chem
  for ends,formula in [({'head':'OCOCH3','tail':'H'},'C6H12O2'),({'head':'OCOCH3','tail':'OCOCH3'},'C8H14O4')]:
   r=worker.build_polymer({'source':'pe','degree':2,'endGroups':ends})
   self.assertEqual(r['formula'],formula)
   mol=worker.molecule_from_graph(r['molecule'])
   matches=mol.GetSubstructMatches(Chem.MolFromSmarts('[C]-[O]-[C](=[O])-[CH3]'))
   self.assertEqual(len(matches),1 if ends['tail']=='H' else 2)
 def test_invalid_root(self):
  cap=worker.import_smiles({'smiles':'CO'})['molecule']
  with self.assertRaises(worker.ChemistryError):worker.build_polymer({'source':'pe','degree':2,'endGroups':{'head':{'molecule':cap,'root':'bad'},'tail':'H'}})
if __name__=='__main__':unittest.main()
