// Execute: node tests/test-core.js
const core = require('../Resources/www/gpc-core.js');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const crm=core.readCRM(fs.readFileSync(path.join(__dirname,'..','サンプルデータ','41.crm')),'41.crm');
assert.equal(crm.times.length,6001);
assert.equal(crm.metadata.duration,20);
assert.equal(crm.signal[0],0.09);assert.equal(crm.signal[3555],50.65);
assert.equal(crm.reference,true);
const cal=core.fitPolynomial(core.CAL_STANDARDS,3);
for(let k=0;k<4;k++)assert.ok(Math.abs(cal.coefficients[k]-core.XLS_CAL.coefficients[k])<1e-8, `fit coefficient ${k}`);
assert.ok(Math.abs(cal.r2-core.XLS_CAL.r2)<1e-7);
const r=core.calcAnalysis(crm,core.XLS_CAL,{mode:'excel',start:6,end:10.7});
for(const k of ['mn','mw','mz','dispersity']){
  const expected=core.EXCEL_REF.expected[k],relativeError=Math.abs(r[k]-expected)/Math.max(1,Math.abs(expected));
  assert.ok(relativeError<1e-8,`${k}: ${r[k]} expected ${expected}`);
}
assert.equal(r.physicalWarning,true);
const safe=core.calcAnalysis(crm,core.XLS_CAL,{mode:'research',start:7.8,end:10.4,baselineType:'endpoints'});
assert.ok(safe.mn>0&&safe.mw>=safe.mn&&safe.mz>=safe.mw);
assert.ok(safe.area>0);
const csv=core.readCSV('time,signal\n0,1\n1,2\n2,3\n','mock.csv');
assert.deepEqual(csv.times,[0,1,2]);assert.deepEqual(csv.signal,[1,2,3]);
assert.throws(()=>core.readCRM(new Uint8Array(100)),/短すぎ/);
const ri=core.readANL(fs.readFileSync(path.join(__dirname,'..','サンプルデータ','Pststandard_chcl3_RI_2026.1001.anl')),'Pststandard_chcl3_RI_2026.1001.anl');
const uv=core.readANL(fs.readFileSync(path.join(__dirname,'..','サンプルデータ','Pststandard_chcl3_UV_2026.1001.anl')),'Pststandard_chcl3_UV_2026.1001.anl');
assert.equal(ri.count,10); assert.equal(uv.count,10);
assert.equal(ri.detector,'RI');assert.equal(uv.detector,'UV');
assert.deepEqual(ri.peaks.map(p=>p.time),[4.93,5.16,5.46,5.93,6.63,7.52,8.4,8.83,9.52,9.89]);
assert.deepEqual(uv.peaks.map(p=>p.time),[4.87,5.10,5.39,5.86,6.55,7.45,8.33,8.86,9.44,9.81]);
assert.equal(ri.peaks[0].storedM,2610000);assert.equal(ri.peaks[6].storedM,16500);assert.equal(ri.peaks[9].storedM,1200);
assert.equal(ri.metadata.hasWaveform,false);
assert.throws(()=>core.readANL(Buffer.alloc(100),'bad.anl'),/短すぎ/);
const invalid=Buffer.from(fs.readFileSync(path.join(__dirname,'..','サンプルデータ','Pststandard_chcl3_RI_2026.1001.anl')));
invalid.writeUInt32LE(201,35740);
assert.throws(()=>core.readANL(invalid,'invalid.anl'),/ピーク数/);
console.log('PASS: CRM 6001-point signal reading, time axis 20 min, signal values');
console.log('PASS: 3rd-order regression coefficients and R² match workbook');
console.log(`PASS: Excel-compatible Mn=${r.mn.toFixed(6)}, Mw=${r.mw.toFixed(6)}, Mz=${r.mz.toFixed(6)}, Đ=${r.dispersity.toFixed(6)}`);
console.log(`PASS: Positive-only integration Mn=${safe.mn.toFixed(3)}, Mw=${safe.mw.toFixed(3)}, Mz=${safe.mz.toFixed(3)}`);
console.log('PASS: CSV reader and invalid CRM handling');
console.log('PASS: RI/UV ANL 10 peak positions and recorded weights; corrupt ANL rejected');

// Independent analytic fixtures: these expectations are not copied from the engine.
function near(actual, expected, tolerance=1e-10) {
  assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)), `${actual} != ${expected}`);
}
for (const degree of [1,2,3]) {
  const coefficients = [6,-.4,.015,-.0005].slice(0,degree+1);
  const points = [1,2,3,4,5,6].map(t=>[t,10**coefficients.reduce((s,c,i)=>s+c*t**i,0)]);
  const fit = core.fitPolynomial(points,degree);
  fit.coefficients.forEach((c,i)=>near(c,coefficients[i]));near(fit.r2,1);
}
assert.throws(()=>core.fitPolynomial([[1,10],[1,20],[2,30],[2,40]],3),/重複/);
const flatCal={degree:1,coefficients:[2,0],standards:[[0,100],[3,100]],minTime:0,maxTime:3};
const irregular={times:[0,1,3],signal:[1,2,4]};
const analytic=core.calcAnalysis(irregular,flatCal,{start:0,end:3,baselineType:'zero'});
near(analytic.area,7.5);near(analytic.mn,100);near(analytic.mw,100);near(analytic.mz,100);near(analytic.dispersity,1);
// Three bins: dt=[0.5,1,0.5], M=[100,10,1], mass=[0.5,2,1.5].
const binCal={degree:1,coefficients:[2,-1],standards:[[0,100],[2,1]],minTime:0,maxTime:2};
const bins=core.calcAnalysis({times:[0,1,2],signal:[1,2,3]},binCal,{start:0,end:2,baselineType:'zero'});
near(bins.mn,4/(.5/100+2/10+1.5));near(bins.mw,71.5/4);near(bins.mz,5201.5/71.5);
const clipped=core.calcAnalysis({times:[0,1,3],signal:[-1,2,4]},flatCal,{start:0,end:3,baselineType:'zero'});
near(clipped.area,7);assert.equal(clipped.physicalWarning,false);
assert.throws(()=>core.calcAnalysis({...irregular,signal:[-1,-2,-3]},flatCal,{start:0,end:3,baselineType:'zero'}),/有効/);
for(const signal of [[1,NaN,3],[1,Infinity,3],[1,null,3]])assert.throws(()=>core.calcAnalysis({...irregular,signal},flatCal),/有限/);
assert.throws(()=>core.calcAnalysis({...irregular,times:[0,1,1]},flatCal),/昇順/);
assert.throws(()=>core.calcAnalysis(irregular,flatCal,{start:0,end:3,baselineType:'manual',baselineSlope:NaN}),/係数/);
assert.throws(()=>core.calcAnalysis(irregular,{...flatCal,coefficients:[200,0]},{start:0,end:3,baselineType:'zero'}),/数値範囲/);
for(const text of ['time,signal\n0,1\n1,\n2,3','0,1\n1,2\n1,3','0,1\n1,NaN\n2,3'])assert.throws(()=>core.readCSV(text),/不正|空欄|重複/);
const mutated=structuredClone(crm);mutated.signal[100] += .001;
assert.equal(core.isReferenceSignal(mutated.times,mutated.signal),false);
assert.throws(()=>core.calcAnalysis(mutated,core.XLS_CAL,{mode:'excel',start:6,end:10.7}),/41.crm/);
const locked=core.calcAnalysis(crm,flatCal,{mode:'excel',start:6,end:10.7});near(locked.mn,r.mn);
// Integrate the displayed corrected signal independently to verify area units.
let referenceArea=0;
for(let i=1;i<r.curve.length;i++)referenceArea+=(Math.max(0,r.curve[i-1].corrected)+Math.max(0,r.curve[i].corrected))/2*(r.curve[i].t-r.curve[i-1].t);
near(r.area,referenceArea);
console.log('PASS: analytic 1/2/3 degree fits, irregular-time trapezoids, independent moments, clipping, invalid input and overflow rejection, full reference fingerprint, Excel area units');

// Embedded calibration names are informational, never automatically applied.
const hintFixture=Buffer.from(fs.readFileSync(path.join(__dirname,'..','サンプルデータ','41.crm')));
Buffer.from('Pststandard_chcl3_RI_2026.0305.anl').copy(hintFixture,29348);
const hintData=core.readCRM(hintFixture,'hint.crm');
assert.equal(hintData.metadata.calibrationFileHint,'Pststandard_chcl3_RI_2026.0305.anl');
assert.deepEqual(hintData.times,crm.times);assert.deepEqual(hintData.signal,crm.signal);
console.log('PASS: informational calibration filename does not change waveform or time axis');

// Baseline anchors are independent of integration limits; off-grid anchors interpolate.
const separateData={times:[0,1,2,3,4],signal:[0,2,5,4,4]};
const rangeOptions={start:1,end:3,baselineType:'range',baselineStart:.5,baselineEnd:3.5};
const separate=core.calcAnalysis(separateData,flatCal,rangeOptions);
assert.deepEqual(separate.baselineRange,{start:.5,end:3.5,startSignal:1,endSignal:4});
assert.deepEqual(separate.curve.map(p=>p.baseline),[1.5,2.5,3.5]);
near(separate.area,3);near(separate.mn,100);near(separate.mw,100);
near(core.calcAnalysis(separateData,flatCal,{start:1,end:3,baselineType:'endpoints'}).area,2);
const sameLine=core.calcAnalysis(separateData,flatCal,{start:1,end:3,baselineType:'manual',baselineSlope:1,baselineIntercept:.5});
near(sameLine.area,separate.area);
for(const [baselineStart,baselineEnd] of [[null,3],['',3],[NaN,3],[3,3],[3,2],[-1,3],[0,5]])
  assert.throws(()=>core.calcAnalysis(separateData,flatCal,{...rangeOptions,baselineStart,baselineEnd}),/ベースライン区間/);
const narrower=core.calcAnalysis(separateData,flatCal,{...rangeOptions,start:1,end:2});
assert.deepEqual(narrower.baselineRange,separate.baselineRange);
near(narrower.curve[0].baseline,separate.curve[0].baseline);
console.log('PASS: independent baseline interval, off-grid interpolation, hand-calculated area, unchanged anchors and invalid-range rejection');
