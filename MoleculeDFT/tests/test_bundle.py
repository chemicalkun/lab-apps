"""Exercise the shipped executable, including dynamic quantum-chemistry modules."""
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'build/Molecule DFT.app/Contents/Resources/engine/DFTEngine/DFTEngine'

def call(op, payload=None):
    env = os.environ.copy()
    for key in ('PYTHONPATH', 'PYTHONHOME', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH'):
        env.pop(key, None)
    env.update(OMP_NUM_THREADS='2', OPENBLAS_NUM_THREADS='2', MKL_NUM_THREADS='2')
    with tempfile.TemporaryDirectory(prefix='dft-bundle-test-') as tmp:
        run = subprocess.run([str(ENGINE)], input=json.dumps({'op': op, 'payload': payload or {}}),
                             text=True, capture_output=True, cwd=tmp, env=env, timeout=240)
    records = [line[10:] for line in run.stdout.splitlines() if line.startswith('__RESULT__')]
    assert run.returncode == 0 and records, (run.returncode, run.stdout[-3000:], run.stderr[-3000:])
    result = json.loads(records[-1])
    assert result['ok'], result
    return result['data']

status = call('status')
assert status['ready'], status
water = call('importSmiles', {'smiles': 'O'})
assert water['formula'] == 'H2O'
settings = dict(method='B3LYP', basis='sto-3g', charge=0, multiplicity=1, threads=2, maxCycles=100, maxSteps=50)
results = {}
for task in ('single', 'optimize'):
    result = call('calculate', {'molecule': water['molecule'], 'settings': dict(settings, task=task)})
    assert result['converged'] and math.isfinite(result['energy_hartree'])
    assert -76 < result['energy_hartree'] < -74
    if task == 'optimize':
        assert result['geometry_converged']
        assert result['energy_hartree'] <= results['single']['energy_hartree'] + 1e-7
    results[task] = result
    print('PASS bundled water', task, result['energy_hartree'], flush=True)
radical = call('importSmiles', {'smiles': '[OH]'})
open_shell = call('calculate', {'molecule': radical['molecule'], 'settings': dict(settings, task='single', multiplicity=2)})
assert len(open_shell['orbitals']) == 2 and 'spin_square' in open_shell
results['open_shell'] = open_shell
print('PASS bundled UKS', open_shell['energy_hartree'], flush=True)
pe = call('buildPolymer', {'source':'pe','degree':2})
assert pe['formula'] == 'C4H10' and pe['total_atoms'] == 14
for method in ('HF','B3LYP'):
    result = call('calculate', {'molecule':pe['molecule'], 'settings':dict(settings,method=method,task='single')})
    assert result['converged'] and result['polymer']['degree'] == 2
    assert result['formalism'] == ('RHF' if method == 'HF' else 'RKS')
    if method == 'HF': assert abs(result['energy_hartree'] + 155.463715837777) < 1e-6
    results['pe_'+method] = result
    print('PASS bundled PE n=2', method, result['energy_hartree'], flush=True)
hf_opt = call('calculate', {'molecule':water['molecule'], 'settings':dict(settings,method='HF',task='optimize')})
assert hf_opt['geometry_converged'] and hf_opt['formalism'] == 'RHF'
results['hf_optimization'] = hf_opt
print('PASS bundled HF geometry optimization',hf_opt['energy_hartree'],flush=True)
assert len(status['polymerPresets']) == 9
for source, formula, method in [('peg','C2H6O2','B3LYP'),('ptfe','C2H2F4','HF')]:
    data = call('buildPolymer', {'source':source,'degree':1})
    assert data['formula'] == formula
    result = call('calculate', {'molecule':data['molecule'],'settings':dict(settings,method=method,task='single')})
    assert result['converged'] and result['polymer']['preset'] == source
    results[source] = result
    print('PASS bundled',source,method,result['energy_hartree'],flush=True)
out = ROOT / 'build/validation/bundled-results.json'
for basis, count in [('6-31g(d)',18), ('6-31+g(d)',22), ('def2-tzvp',43)]:
    assert basis in status['bases']
    result = call('calculate', {'molecule':water['molecule'], 'settings':dict(settings,basis=basis,task='single')})
    assert result['converged'] and result['basis_functions'] == count
    assert -78 < result['energy_hartree'] < -75
    results['water_'+basis] = result
    print('PASS bundled B3LYP',basis,count,result['energy_hartree'],flush=True)
iodine = call('importSmiles', {'smiles':'I'})
checked = call('checkStructure', {'molecule':iodine['molecule'], 'settings':dict(settings,basis='def2-tzvp')})
assert checked['electrons'] == 54 and checked['explicit_electrons'] == 26
print('PASS bundled iodine def2-TZVP ECP electron accounting',flush=True)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'status': status, 'calculations': results}, ensure_ascii=False, indent=2))
print('PASS independent bundled runtime; evidence:', out)
