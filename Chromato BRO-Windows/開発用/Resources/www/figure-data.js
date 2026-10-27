/* Display-only normalization; never writes to measurement arrays or calibration. */
(function(root,factory){const api=factory(typeof module==='object'?require('./gpc-core'):root.GPCCore);if(typeof module==='object')module.exports=api;root.GPCFigureData=api;})(typeof window==='object'?window:globalThis,function(C){
 'use strict';
 function displayDataset(d){
   // Only 41.crm is verified against all 6001 points of the original vendor CSV.
   // Preserve legacy analysis arrays. Do not infer offsets for unknown CRM files.
   const aligned=d.figurePrefix?.[0]===.523&&d.figurePrefix?.[1]===.52&&C.isReferenceSignal(d.times,d.signal);
   return aligned?{...d,signal:[...d.figurePrefix,...d.signal.slice(0,-2)],alignment:'41.crm: CSV照合済み概形用信号'}:{...d,alignment:'入力の保持時間・信号を使用'};
 }
 function normalize(d,start,end,peakRange){
   C.validateDataset(d);
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('表示開始・終了時間が不正です。');
   const indices=[];for(let i=0;i<d.times.length;i++)if(d.times[i]>=start&&d.times[i]<=end)indices.push(i);
   if(!indices.length)throw Error(`${d.name}：表示範囲内に測定点がありません。`);
   if(start<d.times[0]||end>d.times.at(-1))throw Error(`${d.name}：表示範囲が測定時間外です。外挿での規格化は行いません。`);
   const s0=C.interp(d.times,d.signal,start),last=C.interp(d.times,d.signal,end);
   const peakStart=peakRange?peakRange[0]:start,peakEnd=peakRange?peakRange[1]:end;
   if(![peakStart,peakEnd].every(Number.isFinite)||peakEnd<=peakStart)throw Error(`${d.name}：最大100にするピーク範囲が不正です。`);
   if(peakStart<d.times[0]||peakEnd>d.times.at(-1))throw Error(`${d.name}：ピーク範囲が測定時間外です。`);
   const candidates=[];for(let i=0;i<d.times.length;i++)if(d.times[i]>=peakStart&&d.times[i]<=peakEnd)candidates.push(i);
   if(!candidates.length)throw Error(`${d.name}：ピーク範囲内に測定点がありません。`);
   let smax=C.interp(d.times,d.signal,peakStart),peakTime=peakStart;
   for(const i of candidates)if(d.signal[i]>smax){smax=d.signal[i];peakTime=d.times[i];}
   const peakLast=C.interp(d.times,d.signal,peakEnd);if(peakLast>smax){smax=peakLast;peakTime=peakEnd;}
   if(!(smax>s0))throw Error(`${d.name}：最大信号が開始信号以下のため規格化できません（一定・下降信号など）。`);
   const span=smax-s0;if(!Number.isFinite(span))throw Error(`${d.name}：信号値が数値範囲を超えています。`);
   const times=[start],rawSignal=[s0];
   for(const i of indices)if(d.times[i]>start&&d.times[i]<end){times.push(d.times[i]);rawSignal.push(d.signal[i]);}
   times.push(end);rawSignal.push(last);
   const signal=rawSignal.map(v=>(v-s0)/span*100);
   if(!signal.every(Number.isFinite))throw Error(`${d.name}：規格化値が数値範囲を超えています。`);
   return {...d,times,signal,rawSignal,normalization:{start,end,s0,smax,peakTime,...(peakRange?{peakStart,peakEnd}:{})}};
 }
 function prepare(source,mode,styles){
   const chosen=source.overlay?source.datasets:source.datasets.filter((_,i)=>i===source.selected);
   const datasets=[];
   for(const d of chosen){
     const style=styles.get(d.name)||{visible:true,color:d.color,shift:0};if(!style.visible)continue;
     if(!Number.isFinite(style.shift))throw Error(`${d.name}：y軸移動量を数値で入力してください。`);
     const range=source.normalizationRange||[source.start,source.end];
     let raw=displayDataset(d);
     if(mode==='normalize'&&source.normalizationMethod==='endpoints'){
       const a=Math.max(range[0],d.times[0]),b=Math.min(range[1],d.times.at(-1));
       if(!(b>a))throw Error(`${d.name}：基準範囲が測定時間と重なりません。`);
       const ya=C.interp(raw.times,raw.signal,a),yb=C.interp(raw.times,raw.signal,b);
       raw={...raw,signal:raw.signal.map((v,i)=>v-(ya+(yb-ya)*(raw.times[i]-a)/(b-a)))};
     }
     let plotted=mode==='normalize'?normalize(raw,Math.max(range[0],d.times[0]),Math.min(range[1],d.times.at(-1)),source.normalizationPeakRange?[Math.max(source.normalizationPeakRange[0],d.times[0]),Math.min(source.normalizationPeakRange[1],d.times.at(-1))]:null):{...d};
     if(mode==='normalize'&&source.normalizationRange){
       const {s0,smax}=plotted.normalization;
       plotted={...plotted,times:raw.times,rawSignal:raw.signal,signal:raw.signal.map(v=>(v-s0)/(smax-s0)*100)};
       if(!plotted.signal.every(Number.isFinite))throw Error(`${d.name}：規格化値が数値範囲を超えています。`);
     }
     datasets.push({...plotted,color:style.color,yOffset:style.shift,legendName:style.label||d.name});
   }
   if(!datasets.length)throw Error('表示する測定データを選択してください。');
   return {...source,datasets,selected:0,overlay:true};
 }
 return {normalize,displayDataset,prepare};
});
