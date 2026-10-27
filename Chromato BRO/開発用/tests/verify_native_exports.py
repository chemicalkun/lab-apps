from pathlib import Path
import csv, json, math
root = Path(__file__).resolve().parents[1] / 'build/native-test'
with (root/'41_result.csv').open(encoding='utf-8-sig') as f:
    r = next(csv.DictReader(f))
assert r['analysis_mode'] == 'research'
assert r['calibration'] == '2026/10/01 14:23:45 · PSstandard / RI'
assert r['physical_warning'] == 'false'
assert r['area_unit'] == 'signal*min'
assert float(r['Mn'])>0 and float(r['Mz'])>=float(r['Mw'])>=float(r['Mn'])
for name in ['41_chromatogram.png', 'GPC_calibration_curve.png', 'WKWebView.png']:
    assert (root/name).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
project=json.loads((root/'GPC_project.json').read_text())
assert project['format']=='GPCA-project-v1'
assert project['options']['baselineType']=='range'
assert float(project['options']['baselineStart'])==.1 and float(project['options']['baselineEnd'])==18
assert json.loads((root/'GPC_calibration.json').read_text())['format'] == 'GPCA-calibration-v2'
with (root/'41_distribution.csv').open(encoding='utf-8-sig') as f:
    rows=list(csv.DictReader(f))
assert len(rows) == 781  # 7.8–10.4 min, 300 points/min with both endpoints
assert all(math.isfinite(float(v)) for row in rows for v in row.values())
print('PASS: saved native CSV contents, calibration measurement date attribution, JSON and PNG signatures')

import struct
figure=(root/'41_graph.png').read_bytes()
assert figure.startswith(b'\x89PNG\r\n\x1a\n')
image_width,image_height=struct.unpack('>II',figure[16:24])
assert image_width==2400 and 0<image_height<=1400
assert len(figure)>10000
print('PASS: figure export PNG retains 2400px width, valid compact height and image content')


with (root/'GPC_figure.csv').open(encoding='utf-8-sig') as f:
    normalized=list(csv.DictReader(f))
assert len(normalized)==3002
for name,shift in [('41.crm',0),('41.csv',15)]:
    sample=[r for r in normalized if r['sample']==name]
    assert max(float(r['signal']) for r in sample)==100
    assert min(float(r['signal']) for r in sample)<0
    at10=next(r for r in sample if float(r['time_min'])==10)
    assert abs(float(at10['signal'])-17.72070088088855)<1e-9
    assert all(abs(float(r['display_signal'])-float(r['signal'])-shift)<1e-9 for r in sample)
print('PASS: normalized CSV values, negative signals, sample colors independent of numerical output')
