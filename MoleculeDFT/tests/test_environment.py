import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
import worker
from pyscf import gto,dft,lib
lib.num_threads(2)
class Environment(unittest.TestCase):
 def test_energy_gradient_and_metadata(self):
  mol=gto.M(atom='O 0 0 0; H 0 .76 .59; H 0 -.76 .59',basis='sto-3g',verbose=0)
  def run(solvent,disp,geometry=mol):
   mf=dft.RKS(geometry);mf.xc='b3lyp';mf.conv_tol=1e-11
   return worker.apply_environment(mf,{'solvent':solvent,'dispersion':disp}).run()
  vacuum=run('vacuum','none');corrected=run('water','d3bj2b')
  self.assertLess(corrected.e_tot,vacuum.e_tot)
  self.assertLess(corrected.scf_summary['dispersion'],0)
  grad=corrected.nuc_grad_method().kernel()
  coords=mol.atom_coords();step=1e-4
  energies=[]
  for sign in [-1,1]:
   xyz=coords.copy();xyz[1,1]+=sign*step
   displaced=mol.copy().set_geom_(xyz,unit='Bohr')
   energies.append(run('water','d3bj2b',displaced).e_tot)
  self.assertAlmostEqual((energies[1]-energies[0])/(2*step),grad[1,1],delta=2e-5)
 def test_combined_optimization_and_frequencies(self):
  graph=worker.import_smiles({'smiles':'O'})['molecule']
  r=worker.calculate({'molecule':graph,'settings':{'method':'B3LYP','task':'frequency','basis':'sto-3g','solvent':'water','dispersion':'d3bj2b','orbitalGrids':False}})
  self.assertTrue(r['geometry_converged']);self.assertEqual(len(r['vibrations']['frequencies_cm1']),3)
  self.assertEqual(r['environment']['model'],'IEF-PCM');self.assertLess(r['environment']['dispersion_energy_hartree'],0)
  self.assertEqual(r['versions']['dftd3'],'1.2.1')
 def test_invalid_combination(self):
  with self.assertRaises(worker.ChemistryError):worker.validate_settings({'method':'HF','dispersion':'d3bj2b'},[{'element':'O'}],0)
if __name__=='__main__':unittest.main()
