const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../Resources/www/gpc-core'),F=require('../Resources/www/figure-data');
const sample=name=>fs.readFileSync(path.join(__dirname,'../サンプルデータ',name));
const crm=C.readCRM(sample('41.crm'),'41.crm'),csv=C.readCSV(sample('41.csv').toString(),'41.csv');
const original=JSON.stringify(crm),analysis=C.calcAnalysis(crm,C.XLS_CAL,{start:6,end:10.7,mode:'excel'});
const forFigure=F.displayDataset({...crm,figurePrefix:crm.metadata.figurePrefix});
assert.deepEqual(forFigure.signal,csv.signal);assert.equal(forFigure.signal.length,6001);
forFigure.times.forEach((t,i)=>assert.ok(Math.abs(t-csv.times[i])<1e-12));
const a=F.normalize(forFigure,6,11),b=F.normalize(csv,6,11);
const near=(v,w,tol=1e-9)=>assert.ok(Math.abs(v-w)<tol,`${v} != ${w}`);
near(b.normalization.s0,.586);near(b.normalization.smax,42.362);near(b.normalization.peakTime,9.36333333333333);
near(C.interp(b.times,b.signal,6),0);near(Math.max(...b.signal),100);near(C.interp(b.times,b.signal,10),17.72070088088855);
near(C.interp(a.times,a.signal,10),17.72070088088855);a.signal.forEach((v,i)=>near(v,b.signal[i]));
assert.equal(JSON.stringify(crm),original);assert.deepEqual(C.calcAnalysis(crm,C.XLS_CAL,{start:6,end:10.7,mode:'excel'}),analysis);
// Formula fixtures, not engine-generated expectations: each peak reaches 100 independently.
const d={name:'A',times:[0,1,2,3],signal:[-2,-4,8,2]},e={name:'B',times:[0,1,2,3],signal:[10,8,30,12]};
assert.deepEqual(F.normalize(d,0,3).signal,[0,-20,100,40]);
assert.deepEqual(F.normalize(e,0,3).signal,[0,-10,100,10]);
const interpolated=F.normalize(d,.5,2.5);near(interpolated.normalization.s0,-3);near(interpolated.normalization.smax,8);near(interpolated.signal[0],0);near(interpolated.signal.at(-1),800/11);
const styles=new Map([['A',{visible:true,color:'#ff0000',shift:25}],['B',{visible:true,color:'#00ff00',shift:-10}]]);
const src={datasets:[d,e],selected:0,start:0,end:3,overlay:true};const before=JSON.stringify(src);
const prepared=F.prepare(src,'normalize',styles);
assert.equal(prepared.datasets[0].yOffset,25);assert.equal(prepared.datasets[1].yOffset,-10);assert.equal(Math.max(...prepared.datasets[0].signal)+25,125);
assert.equal(prepared.datasets[0].signal[1],-20);
styles.get('A').visible=false;assert.equal(F.prepare(src,'normalize',styles).datasets.length,1);
styles.get('B').visible=false;assert.throws(()=>F.prepare(src,'normalize',styles),/選択/);
assert.equal(JSON.stringify(src),before);
for(const dataset of [{...d,signal:[4,4,4,4]},{...d,signal:[4,3,2,1]}])assert.throws(()=>F.normalize(dataset,0,3),/開始信号以下/);
assert.throws(()=>F.normalize(d,.1,.2),/測定点/);assert.throws(()=>F.normalize(d,-1,2),/測定時間外/);assert.throws(()=>F.normalize(d,2,1),/不正/);
const changed=F.normalize(d,1,3);near(changed.normalization.s0,-4);near(changed.signal[0],0);near(Math.max(...changed.signal),100);
const knownColumns=C.readCSV('file name,test.crm\nComment,\nignored,Conc,Rt\n9,1,0\n9,2,1\n9,3,2');assert.deepEqual(knownColumns.signal,[1,2,3]);
const unverified=F.displayDataset({...d,figurePrefix:[.523,.52]});assert.deepEqual(unverified.signal,d.signal);
console.log('PASS: real 41.csv and verified 41.crm all 6001 input points and normalized curves match; 6 min=0, peak=100 at 9.363333 min, 10 min=17.7207008809');
console.log('PASS: independent normalization, interpolation, negative values, changed range, visibility/offset, errors and unchanged source/Excel analysis');

const longer={name:'longer',times:[-1,0,1,2,3,4],signal:[0,1,2,3,4,5]};
const full=F.prepare({datasets:[d,longer],selected:0,overlay:true,start:-1,end:4},'normalize',new Map());
assert.deepEqual(full.datasets.map(v=>[v.times[0],v.times.at(-1)]),[[0,3],[-1,4]]);
assert.ok(full.datasets.every(v=>Math.max(...v.signal)===100));
console.log('PASS: full-range overlay normalizes each sample within its measured interval without extrapolation');

// Navigation holds the normalization reference while changing the viewport.
{
 const F=require('../Resources/www/figure-data');
 const d={name:'fixed',times:[0,1,2,3,4],signal:[0,10,2,5,0],color:'#123456'};
 const styles=new Map([['fixed',{visible:true,color:'#123456',shift:0}]]);
 const source={datasets:[d],selected:0,overlay:true,start:0,end:4,normalizationRange:[0,4]};
 const initial=F.prepare(source,'normalize',styles);
 for(const [start,end] of [[2,3],[1.5,3.5],[0,2]]){
   const moved=F.prepare({...source,start,end},'normalize',styles);
   assert.deepEqual(moved.datasets[0].signal,initial.datasets[0].signal);
   assert.equal(moved.datasets[0].signal[3],50);
 }
 console.log('PASS: fixed normalization preserves all curve values across cropped/shifted viewports');
}

// Sloping baseline plus known triangular peaks, with fixed normalization during zoom.
{
 const a={name:'tiltA',times:[0,1,2,3,4],signal:[10,17,24,21,18]};
 const b={name:'tiltB',times:[0,1,2,3,4],signal:[30,42,54,46,38]};
 const before=JSON.stringify([a,b]);
 const source={datasets:[a,b],overlay:true,selected:0,start:0,end:4,normalizationRange:[0,4],normalizationMethod:'endpoints'};
 const p=F.prepare(source,'normalize',new Map());
 for(const d of p.datasets)assert.deepEqual(d.signal,[0,50,100,50,0]);
 const cropped=F.prepare({...source,start:1,end:3},'normalize',new Map());
 assert.deepEqual(cropped.datasets,p.datasets);
 assert.equal(JSON.stringify([a,b]),before);
 const start=F.prepare({...source,normalizationMethod:'start'},'normalize',new Map());
 near(start.datasets[0].signal[0],0);near(Math.max(...start.datasets[0].signal),100);
 assert.notEqual(start.datasets[0].signal.at(-1),0);
 const offgrid=F.prepare({...source,normalizationRange:[.5,3.5]},'normalize',new Map());
 near(C.interp(offgrid.datasets[0].times,offgrid.datasets[0].signal,.5),0);
 near(C.interp(offgrid.datasets[0].times,offgrid.datasets[0].signal,3.5),0);
 assert.throws(()=>F.prepare({...source,datasets:[{name:'flat',times:[0,1,2,3,4],signal:[1,2,3,4,5]}]},'normalize',new Map()),/規格化/);
 console.log('PASS: endpoint baseline normalization, independent peaks, interpolation, fixed zoom, zero denominator and unchanged input');
}

{
 const a={name:'two peaks',times:[0,1,2,3,4,5,6],signal:[10,20,30,10,110,20,10]};
 const b={...a,name:'dilute',signal:a.signal.map(v=>v*2)};
 const before=JSON.stringify([a,b]);
 const source={datasets:[a,b],overlay:true,selected:0,start:0,end:6,normalizationRange:[0,6],normalizationPeakRange:[1,3]};
 const out=F.prepare(source,'normalize',new Map());
 for(const d of out.datasets){near(d.signal[2],100);near(d.signal[4],500);near(d.normalization.peakTime,2);near(d.signal[0],0);}
 assert.deepEqual(F.prepare({...source,start:1,end:3},'normalize',new Map()).datasets,out.datasets);
 assert.equal(JSON.stringify([a,b]),before);
 const corrected=F.prepare({...source,normalizationMethod:'endpoints'},'normalize',new Map());
 near(corrected.datasets[0].signal[2],100);near(corrected.datasets[0].signal[4],500);
 assert.throws(()=>F.prepare({...source,normalizationPeakRange:[3,1]},'normalize',new Map()),/ピーク範囲/);
 assert.throws(()=>F.prepare({...source,normalizationPeakRange:[8,10]},'normalize',new Map()),/ピーク範囲/);
 assert.throws(()=>F.prepare({...source,datasets:[{...a,signal:a.signal.map(()=>10)}]},'normalize',new Map()),/規格化/);
 console.log('PASS: chosen peak defines 100 independently per sample, taller outside peaks preserved, fixed zoom, baseline independence and unchanged input');
}
