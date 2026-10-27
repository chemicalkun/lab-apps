/* GPC Mac Analyzer – independent mathematical and file parsing core.
 * No vendor binary is executed. All computations run locally.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GPCCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAGIC = 346273615;
  const CAL_STANDARDS = [
    [4.93,2610000],[5.163333333,1410000],[5.46,809000],
    [5.933333333,370000],[6.626666667,153000],[7.516666667,52500],
    [8.403333333,13500],[8.933333333,7350],[9.516666667,2600],[9.89,1200]
  ];
  // The following calibration is the workbook's already computed LINEST output.
  const XLS_CAL = {
    name:'研究室Excel 2026-09-10', degree:3,
    // coefficient order: [D, C, B, A]; log10(M)=A*t^3+B*t^2+C*t+D
    coefficients:[17.693136023499818,-4.1962178463273219,0.49600349067857546,-0.022358996279591002],
    standards:CAL_STANDARDS, r2:0.99933306540029065,
    minTime:4.93,maxTime:9.89
  };
  const EXCEL_REF = {
    calibration: XLS_CAL,
    // Sheet '分子量計算' C: linear transform of CH1 raw signal in mV.
    normSlope:1.9793749134023473, normIntercept:-0.2553393638289028,
    baselineSlope:0.20600980243958514, baselineIntercept:-0.14530159978830642,
    // Excel's reference CSV carries two extra initial values vs the CRM array.
    timeOffsetPoints:2, start:6, end:10.7,
    expected:{mn:2628.909849866247,mw:3577.4548370262005,mz:-22812.960436568621,dispersity:1.3608130523031108}
  };
  const arrayBufferFrom = input => input instanceof ArrayBuffer ? input : input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength);
  // Full signal fingerprint, not just a few matching sample points.
  function isReferenceSignal(times,signal) {
    if(times.length!==6001||signal.length!==6001)return false;
    let hash=2166136261;
    for(let i=0;i<signal.length;i++){
      if(Math.abs(times[i]-i*20/6000)>1e-12)return false;
      const v=Math.round(signal[i]*1000);
      if(!Number.isFinite(signal[i])||Math.abs(v/1000-signal[i])>1e-12)return false;
      for(let b=0;b<4;b++)hash=Math.imul(hash^((v>>>(8*b))&255),16777619)>>>0;
    }
    return hash===2022857357;
  }
  function validateDataset(d) {
    if(!d||!Array.isArray(d.times)||!Array.isArray(d.signal)||d.times.length<3||d.times.length>200000||d.times.length!==d.signal.length)
      throw Error('測定データの配列が不正です（3〜200,000点）。');
    for(let i=0;i<d.times.length;i++)if(!Number.isFinite(d.times[i])||!Number.isFinite(d.signal[i])||(i>0&&d.times[i]<=d.times[i-1]))
      throw Error('保持時間は重複のない昇順、信号は有限の数値である必要があります。');
  }
  function validateCalibration(cal) {
    if(!cal||![1,2,3].includes(cal.degree)||!Array.isArray(cal.coefficients)||cal.coefficients.length!==cal.degree+1||!cal.coefficients.every(Number.isFinite)||
       !Number.isFinite(cal.minTime)||!Number.isFinite(cal.maxTime)||cal.maxTime<=cal.minTime||
       !Array.isArray(cal.standards)||cal.standards.length<cal.degree+1||cal.standards.length>2000||
       !cal.standards.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[1]>0))
      throw Error('較正曲線の係数・標準試料・時間範囲が不正です。');
  }
  function readCRM(buffer, name='data.crm') {
    const ab=arrayBufferFrom(buffer),view=new DataView(ab);
    if(view.byteLength<5332)throw Error('CRMファイルが短すぎます。');
    if(view.getUint32(0,true)!==MAGIC)throw Error('確認済みCRM形式と識別子が異なります。');
    const n=view.getUint32(5304,true);
    if(n<100 || n>200000)throw Error(`サンプル数が不正です (${n})。未対応のCRM構造かもしれません。`);
    const first=5328, need=first+4*n;
    if(need>view.byteLength)throw Error('CRMの測定データ領域がファイル長を超えています。');
    const duration=view.getFloat64(280,true);
    if(!(duration>0&&duration<=1440))throw Error('測定時間を特定できませんでした。異なるCRM形式の可能性があります。');
    const signal=Array.from({length:n},(_,i)=>view.getInt32(first+4*i,true)/1000);
    const times=Array.from({length:n},(_,i)=>i*duration/(n-1));
    const isReference = isReferenceSignal(times,signal);
    // A filename hint only. Do not infer or automatically apply calibration coefficients.
    const tail=Array.from(new Uint8Array(ab,need,Math.min(512,view.byteLength-need)),b=>String.fromCharCode(b)).join('');
    const calibrationFileHint=tail.match(/[A-Za-z0-9_ .()-]{1,160}\.anl\b/i)?.[0]?.trim()||null;
    return {
      name,format:'CRM',times,signal,reference:isReference,verified:isReference,
      metadata:{duration,points:n,offset:first,scale:0.001,magic:MAGIC,calibrationFileHint,
        figurePrefix:isReference?[view.getInt32(first-8,true)/1000,view.getInt32(first-4,true)/1000]:null,
        message:isReference?'同梱41.crmの全信号と一致（Excel由来の保存済み計算値を照合済み）':'同じバイナリレイアウトを仮定して読み込み。元ソフトによる照合が必要'},
    };
  }
  function readCSV(text,name='data.csv') {
    text=text.replace(/^\ufeff/,'');
    const rows=[];let columns=[0,1],headerSeen=false;
    for(const line of text.split(/\r?\n/)){
      let s=line.trim();if(!s||s.startsWith('#'))continue;
      let sep=s.includes('\t')?'\t':(s.includes(';')?';':',');
      const parts=s.split(sep).map(x=>x.trim().replace(/^"|"$/g,''));
      if(parts.length<2)continue;
      const headers=parts.map(p=>p.toLowerCase());
      if(!rows.length){
        if(!headerSeen&&['file name','date','comment'].includes(headers[0]))continue;
        const ti=headers.findIndex(h=>['rt','time','time_min','retention time','保持時間'].includes(h));
        const si=headers.findIndex(h=>['conc','signal','detector_signal','検出器信号','検出強度'].includes(h));
        if(ti>=0&&si>=0){columns=[ti,si];headerSeen=true;continue;}
      }
      const fields=columns.map(i=>parts[i]??'');
      const x=Number(fields[0]),y=Number(fields[1]);
      if(fields[0]!==''&&fields[1]!==''&&Number.isFinite(x)&&Number.isFinite(y))rows.push([x,y]);
      else if(rows.length||headerSeen||fields[0]===''||fields[1]==='')throw Error('CSVに空欄または不正な数値があります。保持時間・信号を確認してください。');
    }
    if(rows.length<3)throw Error('2列の数値CSVを検出できません。1列目=保持時間、2列目=検出器信号が必要です。');
    rows.sort((a,b)=>a[0]-b[0]);
    const clean=rows.filter((r,i)=>i===0||r[0]>rows[i-1][0]);
    if(clean.length!==rows.length)throw Error('CSVに重複した保持時間があります。');
    if(clean.length<3)throw Error('重複していない保持時間が3点以上必要です。');
    return {name,format:'CSV',times:clean.map(r=>r[0]),signal:clean.map(r=>r[1]),reference:false,verified:false,metadata:{duration:clean.at(-1)[0]-clean[0][0],points:clean.length,message:'CSVデータ（保持時間・信号列の値をそのまま使用）'}};
  }
  /**
   * The supplied 2026-10-01 Chromato-PRO .anl files contain a *processed*
   * 10-peak calibration table, not the detector's continuous waveform.
   * Layout identified independently from matched RI and UV files:
   *   u32@0: 3; u32@35740: peak count
   *   records begin @35808, 88-byte stride:
   *   u32@0: peak retention time in milliseconds (60000 ms/min)
   *   f64@16: stored standard molecular weight in g/mol
   * This parser intentionally accepts only the confirmed layout and checks
   * all bounds instead of guessing for unknown vendor file variants.
   */
  function readANL(buffer,name='standard.anl') {
    const ab=arrayBufferFrom(buffer),dv=new DataView(ab);
    const base=35808,stride=88;
    if(dv.byteLength<base+stride)throw Error('ANLのファイル長が短すぎます。今回確認した形式ではありません。');
    if(dv.getUint32(0,true)!==3)throw Error('未対応のANL識別子です。');
    // The files name their own original .anl near the start of the header.
    const ascii=Array.from(new Uint8Array(ab,24,150)).map(x=>String.fromCharCode(x)).join('');
    if(!ascii.toLowerCase().includes('.anl'))throw Error('ANLヘッダーを確認できません。');
    const count=dv.getUint32(35740,true);
    if(!(count>=2&&count<=100&&base+(count-1)*stride+24<=dv.byteLength))
      throw Error('ANLのピーク数またはデータ範囲が不正です。');
    const peaks=[];
    for(let i=0;i<count;i++){
      const off=base+i*stride;
      const ticks=dv.getInt32(off,true),time=ticks/60000;
      const storedM=dv.getFloat64(off+16,true);
      if(!(ticks>0&&ticks<=24*60*60000&&Number.isFinite(storedM)&&storedM>0&&storedM<1e15))
        throw Error(`ANLの${i+1}番目のピークが不正です。未対応の形式の可能性があります。`);
      if(peaks.length&&time<=peaks.at(-1).time)
        throw Error('ANLの保持時間の並びが不正です。');
      peaks.push({number:i+1,time,storedM});
    }
    const detector=/_RI(?:_|\.|-)/i.test(name)?'RI':/_UV(?:_|\.|-)/i.test(name)?'UV':'未判定';
    return {name,format:'ANL',detector,peaks,count,verified:count===10,
      metadata:{layout:'Chromato-PRO analysis/standard table (confirmed two samples)',
      hasWaveform:false,retentionUnit:'milliseconds',timeUnit:'minutes',
      message:'解析済みピーク時刻（生クロマトグラム波形ではありません）'}};
  }
  function polyVal(coef,x){let y=0;for(let k=coef.length-1;k>=0;k--)y=y*x+coef[k];return y;}
  function molecularWeight(cal,t){const logM=polyVal(cal.coefficients,t);return Math.abs(logM)<308?Math.pow(10,logM):NaN;}
  // Stable least-squares in centered, scaled coordinates. Returns original t coefficients.
  function fitPolynomial(standards,degree=3) {
    if(!Number.isInteger(degree)||degree<1||degree>3)throw Error('較正式の次数は1〜3で指定してください。');
    const pts=standards.filter(r=>r.length>=2&&Number.isFinite(+r[0])&&Number.isFinite(+r[1])&&+r[1]>0)
      .map(r=>[+r[0],Math.log10(+r[1])]);
    if(pts.length<degree+1)throw Error(`${degree}次較正には標準試料${degree+1}点以上が必要です。`);
    const xs=pts.map(r=>r[0]),xmin=Math.min(...xs),xmax=Math.max(...xs);
    if(xmax===xmin)throw Error('標準試料の保持時間がすべて同一です。');
    const center=(xmin+xmax)/2,scale=(xmax-xmin)/2;
    const size=degree+1,m=Array.from({length:size},()=>Array(size+1).fill(0));
    for(const [x,y] of pts){
      const u=(x-center)/scale,pp=Array.from({length:2*degree+1},(_,j)=>u**j);
      for(let j=0;j<size;j++){
        for(let k=0;k<size;k++)m[j][k]+=pp[j+k];
        m[j][size]+=y*pp[j];
      }
    }
    for(let j=0;j<size;j++){
      let pivot=j;
      for(let k=j+1;k<size;k++)if(Math.abs(m[k][j])>Math.abs(m[pivot][j]))pivot=k;
      if(Math.abs(m[pivot][j])<1e-12)throw Error('保持時間が重複し、較正できません。');
      [m[j],m[pivot]]=[m[pivot],m[j]];
      let v=m[j][j];for(let c=j;c<=size;c++)m[j][c]/=v;
      for(let r=0;r<size;r++){if(r===j)continue;const f=m[r][j];for(let c=j;c<=size;c++)m[r][c]-=f*m[j][c];}
    }
    const uc=m.map(r=>r[size]),cc=Array(size).fill(0);
    const choose=(n,k)=>{let v=1;for(let i=1;i<=k;i++)v=v*(n-i+1)/i;return v;};
    for(let j=0;j<size;j++)for(let k=0;k<=j;k++)cc[k]+=uc[j]*choose(j,k)*(-center)**(j-k)/scale**j;
    const mean=pts.reduce((a,p)=>a+p[1],0)/pts.length;
    const ss=pts.reduce((a,p)=>a+(p[1]-mean)**2,0);
    const err=pts.reduce((a,p)=>a+(p[1]-polyVal(cc,p[0]))**2,0);
    const r2=ss>0?1-err/ss:NaN;
    return {name:'ユーザー較正',degree,coefficients:cc,standards:pts.map((p,i)=>[p[0],10**p[1]]),minTime:xmin,maxTime:xmax,r2};
  }
  function linearBase(t, t0, y0, t1, y1){return t0===t1?y0:y0+(y1-y0)*(t-t0)/(t1-t0);}
  function interp(times,signals,t){if(t<=times[0])return signals[0];if(t>=times.at(-1))return signals.at(-1);
    let lo=0,hi=times.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<t)lo=mid;else hi=mid;}
    return linearBase(t,times[lo],signals[lo],times[hi],signals[hi]);}
  function calcAnalysis(dataset,cal,options={}){
    validateDataset(dataset);
    validateCalibration(cal);
    const mode=options.mode==='excel'?'excel':'research',reference=mode==='excel';
    if(reference&&(!dataset.reference||!isReferenceSignal(dataset.times,dataset.signal)))throw Error('Excel照合モードは対応する41.crmでのみ利用できます。');
    if(reference)cal=XLS_CAL;
    const start=+(options.start??(reference?6:7.8)),end=+(options.end??(reference?10.7:10.4));
    if(!Number.isFinite(start)||!Number.isFinite(end)||!(end>start))throw Error('積分時間は有限の数値で、終了時間は開始より大きくしてください。');
    if(!cal?.coefficients)throw Error('較正曲線が設定されていません。');
    const shift=reference?EXCEL_REF.timeOffsetPoints*(20/6000):+(options.timeShift??0);
    if(!Number.isFinite(shift))throw Error('時間補正値が不正です。');
    const times=dataset.times.map(t=>t+shift);
    const raw=dataset.signal;
    if(start<times[0]||end>times.at(-1))throw Error('積分範囲が測定データの外側にあります。');
    let inRange=[];
    for(let i=0;i<times.length;i++)if(times[i]>=start-1e-8&&times[i]<=end+1e-8)inRange.push(i);
    if(inRange.length<2)throw Error('積分範囲内にデータが2点以上必要です。');
    const baselineType=reference?'excel':(options.baselineType||'endpoints');
    if(!['excel','zero','manual','endpoints','range'].includes(baselineType))throw Error('ベースラインの方式が不正です。');
    if(baselineType==='manual'&&![+(options.baselineSlope??0),+(options.baselineIntercept??0)].every(Number.isFinite))throw Error('ベースライン係数は有限の数値で入力してください。');
    const t0=times[inRange[0]],t1=times[inRange.at(-1)];
    const x0=raw[inRange[0]],x1=raw[inRange.at(-1)];
    let baselineRange=null;
    if(baselineType==='range'){
      const b0=Number(options.baselineStart),b1=Number(options.baselineEnd);
      if(options.baselineStart==null||options.baselineEnd==null||String(options.baselineStart).trim()===''||String(options.baselineEnd).trim()===''||!Number.isFinite(b0)||!Number.isFinite(b1)||b1<=b0)
        throw Error('ベースライン区間は有限の数値で、終了時間は開始より大きくしてください。');
      if(b0<times[0]||b1>times.at(-1))throw Error('ベースライン区間が測定データの外側にあります。');
      baselineRange={start:b0,end:b1,startSignal:interp(times,raw,b0),endSignal:interp(times,raw,b1)};
    }
    const base=(t)=>{
      if(reference)return (EXCEL_REF.baselineSlope*t+EXCEL_REF.baselineIntercept-EXCEL_REF.normIntercept)/EXCEL_REF.normSlope;
      if(baselineType==='zero')return 0;
      if(baselineType==='manual')return +(options.baselineSlope||0)*t+(+(options.baselineIntercept||0));
      if(baselineRange)return linearBase(t,baselineRange.start,baselineRange.startSignal,baselineRange.end,baselineRange.endSignal);
      return linearBase(t,t0,x0,t1,x1);
    };
    let sum=0,sumOverM=0,sumM=0,sumM2=0,area=0,peakTime=NaN,peakSignal=-Infinity;
    const slice=[];
    for(let j=0;j<inRange.length;j++){
      const i=inRange[j],t=times[i], s=raw[i]-base(t);
      const w=reference?s:Math.max(0,s);
      const M=molecularWeight(cal,t);
      if(!Number.isFinite(M)||M<=0)throw Error(`${t.toFixed(3)}分の計算分子量が無効です。較正係数を確認してください。`);
      const dt=reference?1:(j===0?(times[inRange[1]]-times[i])/2:(j===inRange.length-1?(times[i]-times[inRange[j-1]])/2:(times[inRange[j+1]]-times[inRange[j-1]])/2));
      const wt=w*dt;
      sum+=wt;sumOverM+=wt/M;sumM+=wt*M;sumM2+=wt*M*M;
      // Excel moments retain the historical unweighted sum, but area has time units.
      const areaDt=j===0?(times[inRange[1]]-times[i])/2:j===inRange.length-1?(times[i]-times[inRange[j-1]])/2:(times[inRange[j+1]]-times[inRange[j-1]])/2;
      area+=Math.max(0,w)*areaDt;
      if(w>peakSignal){peakSignal=w;peakTime=t;}
      slice.push({t,signal:raw[i],baseline:base(t),corrected:w,mwBin:M,mass:wt});
    }
    if(sum<=0||sumOverM<=0||sumM<=0)throw Error('有効なピーク積分信号を得られませんでした。範囲とベースラインを再設定してください。');
    const mn=sum/sumOverM,mw=sumM/sum,mz=sumM2/sumM;
    const mp=molecularWeight(cal,peakTime);
    if(![mn,mw,mz,mp,area,mw/mn,sum].every(Number.isFinite))throw Error('計算値が数値範囲を超えています。較正係数・信号・積分範囲を確認してください。');
    const outside= start<cal.minTime-1e-6||end>cal.maxTime+1e-6;
    return {mn,mw,mz,mp,dispersity:mw/mn,area,peakTime,peakSignal,
      start,end,mode,baselineType,baselineRange,curve:slice,areaSigned:sum,calibrationExtrapolated:outside,
      negativeFraction: slice.filter(r=>r.corrected<0).length/slice.length,
      physicalWarning:mn<=0||mw<=0||mz<=0||mw<mn*(1-1e-12)||mz<mw*(1-1e-12), timeShift:shift};
  }
  return {MAGIC,CAL_STANDARDS,XLS_CAL,EXCEL_REF,readCRM,readCSV,readANL,polyVal,molecularWeight,fitPolynomial,calcAnalysis,interp,validateDataset,validateCalibration,isReferenceSignal};
});
