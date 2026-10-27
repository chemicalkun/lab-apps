// Read-only diagnostic. Usage: node tests/diagnose-crm.js sample.crm calibration.anl [output.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const C=require('../Resources/www/gpc-core');
const [crmPath,anlPath,out]=process.argv.slice(2);
if(!crmPath||!anlPath)throw Error('Specify a CRM and its matching calibration ANL.');
const bytes=fs.readFileSync(crmPath),anlBytes=fs.readFileSync(anlPath),d=C.readCRM(bytes,path.basename(crmPath)),a=C.readANL(anlBytes,path.basename(anlPath));
const cal=C.fitPolynomial(a.peaks.map(p=>[p.time,p.storedM]),3);cal.name=path.basename(anlPath)+' / recorded masses / cubic refit';
const result=(calibration,start,end,baselineType,timeShift=0)=>{
 const r=C.calcAnalysis(d,calibration,{start,end,baselineType,timeShift});
 return {calibration:calibration.name,start,end,baselineType,timeShift,mn:r.mn,mw:r.mw,mz:r.mz,mp:r.mp,peakTime:r.peakTime,area:r.area};
};
let peak=0;for(let i=1;i<d.times.length;i++)if(d.signal[i]>d.signal[peak])peak=i;
// Independent summation implementation for the primary comparison, not a target-value fit.
function independent(cal,start,end,anchors=null){
 const points=d.times.map((t,i)=>[t,d.signal[i]]).filter(p=>p[0]>=start-1e-8&&p[0]<=end+1e-8);
 const [t0,y0]=anchors?.[0]||points[0],[t1,y1]=anchors?.[1]||points.at(-1);let s0=0,sn=0,s1=0;
 points.forEach(([t,y],i)=>{const base=y0+(y1-y0)*(t-t0)/(t1-t0),dt=i===0?(points[1][0]-t)/2:i===points.length-1?(t-points[i-1][0])/2:(points[i+1][0]-points[i-1][0])/2;
  const w=Math.max(0,y-base)*dt,M=10**cal.coefficients.reduce((s,c,k)=>s+c*t**k,0);s0+=w;sn+=w/M;s1+=w*M;
 });return {mn:s0/sn,mw:s1/s0};
}
const scenarios=[result(C.XLS_CAL,5,10,'endpoints'),result(cal,5,10,'endpoints'),result(cal,5,9.5,'endpoints'),result(cal,5,9.5,'zero'),result(cal,5,10,'zero'),result(cal,7.8,10.4,'endpoints')];
const independently=independent(cal,5,10);assert.ok(Math.abs(independently.mn-scenarios[1].mn)<1e-6);assert.ok(Math.abs(independently.mw-scenarios[1].mw)<1e-6);
const smallShift=2*d.metadata.duration/(d.times.length-1);
// Search for the four refitted coefficients as a consecutive binary block.
// Candidate detection is diagnostic only: no undocumented fields are auto-applied.
const storedCoefficientMatches=[];
for(let off=0;off<=bytes.length-32;off++){
 const candidate=Array.from({length:4},(_,i)=>bytes.readDoubleLE(off+8*i));
 if(candidate.every((v,i)=>Number.isFinite(v)&&Math.abs(v-cal.coefficients[i])<1e-6))storedCoefficientMatches.push({offset:off,coefficients:candidate});
}
// User clarified: integration 4–9.55 min; baseline anchors 0.1–18 min.
const confirmedOptions={start:4,end:9.55,baselineType:'range',baselineStart:.1,baselineEnd:18};
const confirmedComparisons=[['Default Excel',C.XLS_CAL],['CRM recorded March RI',cal]].map(([label,c])=>{
 const r=C.calcAnalysis(d,c,confirmedOptions);
 const b=r.baselineRange;
 const independentResult=independent(c,4,9.55,[[b.start,b.startSignal],[b.end,b.endSignal]]);
 assert.ok(Math.abs(independentResult.mn-r.mn)<1e-6);
 assert.ok(Math.abs(independentResult.mw-r.mw)<1e-6);
 return {label,calibration:c.name,...confirmedOptions,baselineRange:b,mn:r.mn,mw:r.mw,mz:r.mz,dispersity:r.dispersity,independentResult,calibrationExtrapolated:r.calibrationExtrapolated};
});
const nameBytes=Buffer.from(path.basename(anlPath),'ascii');
const report={sample:path.basename(crmPath),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),referenceMn:63500,referenceConditions:{integrationStart:4,integrationEnd:9.55,baselineStart:.1,baselineEnd:18,note:'Intervals reported by user; straight line through endpoint signals assumed; calibration/detector unconfirmed'},confirmedComparisons,
 parser:{durationMinutes:d.metadata.duration,points:d.times.length,signalOffset:d.metadata.offset,timeStepMinutes:d.times[1],peakIndex:peak,peakTimeMinutes:d.times[peak],headerUint32_5292:bytes.readUInt32LE(5292),headerUint32_5288:bytes.readUInt32LE(5288)},
 calibrationNameByteOffset:bytes.indexOf(nameBytes),calibration:cal,storedCoefficientMatches,scenarios,independent:independently,
 sensitivityOnly:{note:'These are sensitivity calculations, NOT corrections or a recommended shift.',smallShiftMinutes:smallShift,smallShiftResult:result(cal,5+smallShift,10+smallShift,'endpoints',smallShift)},
 limitations:['CRM format specification and sample-specific exported time/signal CSV were not supplied.','Only the first waveform is parsed; detector assignment needs original-software confirmation.','Intervals are now supplied. Remaining difference needs original calibration/detector and baseline endpoint convention confirmation.','No calibration or time-axis changes were applied to make the result match the target.']};
if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
