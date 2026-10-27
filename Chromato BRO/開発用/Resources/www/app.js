/* GPC Analyzer user interface. No network access required. */
(() => {
'use strict';
const C=window.GPCCore;
const $=id=>document.getElementById(id);
const DEFAULT_CAL={...structuredClone(C.XLS_CAL),name:'PSstandard（標準初期値）',standardType:'PSstandard',isDefault:true};
const state={datasets:[],selected:-1,cal:structuredClone(DEFAULT_CAL),last:null,view:[0,20],drag:null,hover:null};
const colors=['#2b72d6','#de8766','#08a59a','#9259cb','#c09d2a','#5d85a1'];
function numeric(v,d=3){return Number.isFinite(v)?Number(v).toLocaleString('ja-JP',{maximumFractionDigits:d,minimumFractionDigits:Math.min(d,0)}):'—';}
function scientific(v){if(!Number.isFinite(v))return '—';if(Math.abs(v)>=1e6||Math.abs(v)<.01&&v!==0)return v.toExponential(4);return numeric(v,4);}
function selected(){return state.datasets[state.selected]||null;}
function setStatus(text,isError=false){$('readInfo').textContent=text;$('readInfo').className=isError?'error':'hint';}
function resetCal(){state.cal=structuredClone(DEFAULT_CAL);$('standards').value=C.CAL_STANDARDS.map(p=>`${p[0]}, ${p[1]}`).join('\n');$('degree').value='3';$('calStatus').textContent='適用中：標準初期値（測定条件を確認してください）';refresh();}
function fitCal(){try{
  const pairs=[];for(const line of $('standards').value.split(/\r?\n/)){
    if(!line.trim()||line.trim().startsWith('#'))continue;
    const p=line.trim().split(/[\s,;\t]+/).map(Number);
    if(p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[1]<=0)throw Error('各行を「保持時間, 正の分子量」で記入してください。');
    pairs.push(p.slice(0,2));
  }
  state.cal=C.fitPolynomial(pairs,Number($('degree').value));
  $('calStatus').textContent=`${state.cal.degree}次較正：${pairs.length}点、R²=${state.cal.r2.toFixed(6)}`;
  refresh();
}catch(e){$('calStatus').textContent='較正エラー：'+e.message;}}
function removeDataset(index){
  if(index<0||index>=state.datasets.length)return;
  const name=state.datasets[index].name;
  state.datasets.splice(index,1);
  if(index<state.selected)state.selected--;
  else if(index===state.selected)state.selected=Math.min(index,state.datasets.length-1);
  if(!state.datasets.length)state.selected=-1;
  viewY=null;state.hover=null;state.drag=null;
  refresh();setStatus(`${name}を一覧から削除しました。元ファイルは変更していません。`);
  window.dispatchEvent(new Event('gpc-datasets-changed'));
}
function removeAllDatasets(){
  if(!state.datasets.length)return;
  state.datasets=[];state.selected=-1;viewY=null;state.hover=null;state.drag=null;
  refresh();setStatus('全ての測定データを一覧から削除しました。');
  window.dispatchEvent(new Event('gpc-datasets-changed'));
}
$('removeAllFiles').onclick=removeAllDatasets;
function updateFileList(){
  $('removeAllFiles').disabled=!state.datasets.length;
  $('files').replaceChildren();
  state.datasets.forEach((d,i)=>{
    const row=document.createElement('div');row.className='file-row';
    const btn=document.createElement('button');btn.className='file-item'+(i===state.selected?' active':'');
    const dot=document.createElement('span');dot.style.cssText=`background:${colors[i%colors.length]};width:8px;height:8px;border-radius:50%;flex:0 0 8px`;
    const name=document.createElement('span');name.textContent=d.name;
    const ext=document.createElement('small');ext.textContent=d.format;
    btn.append(dot,name,ext);btn.onclick=()=>{state.selected=i;refresh()};
    const remove=document.createElement('button');remove.className='file-remove';remove.type='button';remove.textContent='削除';remove.setAttribute('aria-label',`${d.name}を一覧から削除`);remove.onclick=()=>removeDataset(i);
    row.append(btn,remove);$('files').appendChild(row);
  });
}
async function importFiles(files){
  if(!files?.length)return {good:0,errors:[],message:''};
  let good=0,err=[];
  for(const file of Array.from(files)){
    try{
      const crm=/\.crm$/i.test(file.name);
      const data=crm?C.readCRM(await file.arrayBuffer(),file.name):C.readCSV(await file.text(),file.name);
      const existing=state.datasets.findIndex(d=>d.name===data.name);
      if(existing>=0){state.datasets[existing]=data;state.selected=existing;}
      else{state.datasets.push(data);state.selected=state.datasets.length-1;}
      good++;
      if(state.datasets.length===1){state.view=[data.times[0],data.times.at(-1)];$('viewStart').value=state.view[0];$('viewEnd').value=state.view[1];}
    }catch(e){err.push(`${file.name}: ${e.message}`);}
  }
  // All user-facing analysis uses research processing.
  if(good){viewY=null;refresh();window.dispatchEvent(new Event('gpc-datasets-changed'));}
  const message=good?`${good}ファイル読込完了 / ${state.datasets.length}ファイルを保持`+(err.length?' ／ '+err.join(' ／ '):''):err.join(' ／ ');
  setStatus(message,!!err.length);return {good,errors:err,message};
}
function refresh(){
  const data=selected(),mode='research';
  $('baseMode').disabled=false;
  $('dragBaseline').disabled=!data;
  $('dragBaseline').title='始点から終点まで横にドラッグして指定します。';
  if($('dragBaseline').disabled&&$('plotDragMode').dataset.mode==='baseline')$('dragZoom').click();
  $('baseRange').style.display=$('baseMode').value!=='range'?'none':'grid';
  $('baseCoeffs').style.display=$('baseMode').value!=='manual'?'none':'grid';
  $('datasetTitle').textContent=data?`${data.name} · ${data.metadata.points.toLocaleString()}点 · ${numeric(data.metadata.duration)} min · ${data.format}`:'ファイルを読み込んで解析を開始';
  $('verification').textContent=data?.format==='CRM'&&!data.reference?'形式・条件の確認が必要':data?'読込済み':'未読込';
  $('modeInfo').textContent='積分範囲とベースラインを指定してください。';
  if(data){$('readInfo').className='hint';$('readInfo').textContent='';}
  state.last=null;
  const error=$('errBox');error.style.display='none';error.replaceChildren();
  if(data){try{
    for(const id of ['start','end',...($('baseMode').value==='manual'?['baseSlope','baseIntercept']:[])])if($(id).value.trim()==='')throw Error('積分時刻・ベースラインの数値を入力してください。');
    state.last=C.calcAnalysis(data,state.cal,{
      mode,start:Number($('start').value),end:Number($('end').value),baselineType:$('baseMode').value,
      baselineSlope:Number($('baseSlope').value),baselineIntercept:Number($('baseIntercept').value),
      baselineStart:$('baseStart').value,baselineEnd:$('baseEnd').value
    });
  }catch(e){error.style.display='block';const warn=document.createElement('div');warn.className='error';warn.textContent=e.message;error.appendChild(warn);}}
  renderNumbers();drawChrom();drawCal();updateFileList();window.dispatchEvent(new Event('gpc-state-changed'));
}
function renderNumbers(){
  const r=state.last,d=selected(),cal=state.cal;
  for(const name of ['mn','mw','mz','dispersity','mp'])$(name).textContent=r?numeric(r[name],name==='dispersity'?4:1):'—';
  $('statFile').textContent=d?.name||'—';
  $('statCalibration').textContent=window.GPCCalibrationMeta.label(cal);
  $('statArea').textContent=r?scientific(r.area)+' signal·min':'—';
  $('statPeakTime').textContent=r?numeric(r.peakTime,3)+' min':'—';
  $('statPeakSignal').textContent=r?numeric(r.peakSignal,3):'—';
  $('statBounds').textContent=r?`${numeric(r.start,3)} — ${numeric(r.end,3)} min`:'—';
  $('statBaseline').textContent=r?(r.baselineRange?`${numeric(r.baselineRange.start,3)} — ${numeric(r.baselineRange.end,3)} min の信号を結ぶ直線`:({endpoints:'積分区間両端の直線',manual:'指定の傾き・切片',zero:'0基準'})[r.baselineType]):'—';
  $('statExtrap').textContent=r?(r.calibrationExtrapolated?'あり（要注意）':'なし'):'—';
  $('statPoints').textContent=r?numeric(r.curve.length,0):'—';
  $('calR2').textContent=`R² ${Number.isFinite(cal.r2)?cal.r2.toFixed(6):'—'}`;
  const coeff=cal.coefficients;const terms=coeff.map((v,i)=>`${v>=0&&i>0?'+ ':''}${v.toPrecision(6)}${i?'×t'+(i>=2?'^'+i:''):''}`);
  $('equation').textContent='log₁₀(M) = '+terms.join(' ');
  $('calRange').textContent=`標準試料の時間範囲：${numeric(cal.minTime,2)}〜${numeric(cal.maxTime,2)} min / Mは標準物質換算`;
  const info=$('notice');info.replaceChildren();
  const messages=[];
  if(d){

    if(r?.physicalWarning)messages.push('Mz≤0またはMw＜Mnなど物理的に不合理な結果です。負信号の取扱い、積分区間、ベースラインを見直してください。');
    if(cal.isDefault||cal.name===C.XLS_CAL.name)messages.push('標準初期値の検量線を使用中です。測定条件に合う検量線を適用してください。');
  }
  $('analysisWarnings').hidden=!messages.length&&$('errBox').style.display==='none';
  for(const s of messages){const p=document.createElement('p');p.textContent=s;p.style.margin='4px 0 10px';info.append(p);}
}
function canvasSetup(id){
  const can=$(id),rect=can.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(rect.width,200),h=Math.max(rect.height,100);can.width=Math.round(w*dpr);can.height=Math.round(h*dpr);
  const ctx=can.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  return {can,ctx,w,h};
}
function plotFrame(ctx,w,h,bounds,opts={}){
  const {xmin,xmax,ymin,ymax}=bounds;
  const m={l:64,r:22,t:22,b:52};const pw=w-m.l-m.r,ph=h-m.t-m.b;
  const X=t=>m.l+(t-xmin)/(xmax-xmin)*pw,Y=v=>m.t+(ymax-v)/(ymax-ymin)*ph;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.font='11px -apple-system,Arial';
  const xticks=opts.xTicks||Array.from({length:6},(_,i)=>xmin+(xmax-xmin)*i/5);
  for(const tx of xticks){const xx=X(tx);ctx.strokeStyle='#ebf0f7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,m.t);ctx.lineTo(xx,m.t+ph);ctx.stroke();ctx.fillStyle='#8291a3';ctx.textAlign='center';ctx.fillText(numeric(tx,2),xx,h-27);}
  for(let i=0;i<=5;i++){const val=ymin+(ymax-ymin)*i/5,yy=Y(val);ctx.strokeStyle='#ebf0f7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(m.l,yy);ctx.lineTo(m.l+pw,yy);ctx.stroke();ctx.fillStyle='#8291a3';ctx.textAlign='right';ctx.fillText(Math.abs(val)<1000?numeric(val,1):val.toExponential(1),m.l-9,yy+4);}
  ctx.strokeStyle='#d4e0ee';ctx.strokeRect(m.l,m.t,pw,ph);
  ctx.fillStyle='#5b6c82';ctx.textAlign='center';ctx.fillText(opts.xlabel||'保持時間 [min]',m.l+pw/2,h-6);
  ctx.save();ctx.translate(16,m.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText(opts.ylabel||'検出強度',0,0);ctx.restore();
  return {m,pw,ph,X,Y};
}
let viewCanvas=null, viewY=null;
function drawChrom(){
  const {ctx,w,h}=canvasSetup('chromChart'),d=selected(),r=state.last;
  if(!d){ctx.fillStyle='#788ba4';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText('CRM / CSVファイルを選択してください',w/2,h/2);viewCanvas=null;return;}
  let xmin=+($('viewStart').value),xmax=+($('viewEnd').value);
  if(!Number.isFinite(xmin)||!Number.isFinite(xmax)||!(xmax>xmin)){xmin=d.times[0];xmax=d.times.at(-1);}
  let ds=$('overlay').checked?state.datasets:[d];
  let ymin=Infinity,ymax=-Infinity;
  for(const data of ds){for(let i=0;i<data.times.length;i++){
    const t=data.times[i];if(t<xmin||t>xmax)continue;
    const v=data.signal[i];if(v<ymin)ymin=v;if(v>ymax)ymax=v;
  }}
  if(!Number.isFinite(ymin)||!Number.isFinite(ymax)){ymin=-1;ymax=1;}
  const pad=Math.max(1e-6,(ymax-ymin)*.12);ymax+=pad;ymin-=pad;
  if(ymax===ymin)ymax+=1;
  if(viewY){[ymin,ymax]=viewY;}
  let xTicks;
  try{if($('analysisTickInterval').value!=='')xTicks=window.GPCFigure.ticks(xmin,xmax,$('analysisTickInterval').value);}
  catch(e){ctx.fillStyle='#a32626';ctx.font='14px sans-serif';ctx.fillText(e.message,30,45);viewCanvas=null;return;}
  const frame=plotFrame(ctx,w,h,{xmin,xmax,ymin,ymax},{xTicks});viewCanvas={...frame,xmin,xmax,ymin,ymax};
  if(r){let a=frame.X(Math.max(xmin,r.start)),b=frame.X(Math.min(xmax,r.end));if(b>a){ctx.fillStyle='rgba(52,111,202,.08)';ctx.fillRect(a,frame.m.t,b-a,frame.ph);}}
  ctx.save();ctx.beginPath();ctx.rect(frame.m.l,frame.m.t,frame.pw,frame.ph);ctx.clip();
  ds.forEach((data,k)=>{
    const color=colors[state.datasets.indexOf(data)%colors.length];
    ctx.beginPath();let started=false;
    const decimate=1;
    for(let i=0;i<data.times.length;i+=decimate){
      const t=data.times[i];if((i+1<data.times.length&&data.times[i+1]<xmin)||(i>0&&data.times[i-1]>xmax))continue;
      const x=frame.X(t),y=frame.Y(data.signal[i]);if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=color;ctx.lineWidth=data===d?1.8:1.0;ctx.globalAlpha=data===d?1:.72;ctx.stroke();ctx.globalAlpha=1;
  });
  if(r){
    ctx.beginPath();let moved=false;
    for(const point of (r.baselineRange?[{t:r.baselineRange.start,baseline:r.baselineRange.startSignal},{t:r.baselineRange.end,baseline:r.baselineRange.endSignal}]:r.curve)){const x=frame.X(point.t),y=frame.Y(point.baseline);if(!moved){ctx.moveTo(x,y);moved=true;}else ctx.lineTo(x,y);}
    ctx.strokeStyle='#f0983b';ctx.lineWidth=1.3;ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
    const anchors=r.baselineRange?[{t:r.baselineRange.start,baseline:r.baselineRange.startSignal},{t:r.baselineRange.end,baseline:r.baselineRange.endSignal}]:r.baselineType==='endpoints'?[r.curve[0],r.curve.at(-1)]:[];
    for(const p of anchors){ctx.beginPath();ctx.arc(frame.X(p.t),frame.Y(p.baseline),4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();}
  }
  ctx.restore();
  if(state.drag){let {x0,x1}=state.drag;ctx.fillStyle='rgba(22,99,225,.13)';ctx.fillRect(Math.min(x0,x1),frame.m.t,Math.abs(x1-x0),frame.ph);}
  ctx.font='11px sans-serif';ctx.textAlign='left';
  let lx=frame.m.l+8;
  ds.slice(0,6).forEach((data,k)=>{ctx.fillStyle=colors[state.datasets.indexOf(data)%colors.length];ctx.fillRect(lx,8,13,3);ctx.fillStyle='#526981';const label=data.name.slice(0,20);ctx.fillText(label,lx+17,12);lx+=Math.min(160,35+label.length*7);});
  if(state.hover&&Number.isFinite(state.hover.x)){
    ctx.strokeStyle='#5b8cbe';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(state.hover.x,frame.m.t);ctx.lineTo(state.hover.x,frame.m.t+frame.ph);ctx.stroke();ctx.setLineDash([]);
  }
}
function drawCal(){
  const {ctx,w,h}=canvasSetup('calChart'),c=state.cal;
  const pts=c.standards.map(([t,m])=>[t,Math.log10(m)]),yl=pts.map(p=>p[1]);
  const xmin=c.minTime-.24,xmax=c.maxTime+.24,ymin=Math.min(...yl)-.22,ymax=Math.max(...yl)+.22;
  const f=plotFrame(ctx,w,h,{xmin,xmax,ymin,ymax},{xlabel:'保持時間 [min]',ylabel:'log₁₀(M)'});
  ctx.strokeStyle='#336dd2';ctx.lineWidth=2;ctx.beginPath();
  for(let j=0;j<=200;j++){const t=xmin+(xmax-xmin)*j/200;let y=C.polyVal(c.coefficients,t);if(j===0)ctx.moveTo(f.X(t),f.Y(y));else ctx.lineTo(f.X(t),f.Y(y));}ctx.stroke();
  for(const [t,m] of pts){ctx.beginPath();ctx.arc(f.X(t),f.Y(m),4,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#ec8739';ctx.lineWidth=2;ctx.stroke();}
}
function download(name,content,mime='text/csv;charset=utf-8'){
  const blob=new Blob([mime.includes('csv')?'\ufeff':'',content],{type:mime});
  if(window.GPCNativeExport?.(name,blob))return;
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function baseName(){return (selected()?.name||'GPC').replace(/\.[^.]+$/,'').replace(/[^\w\p{L}\p{N}-]+/gu,'_');}
function exportDistribution(){if(!state.last){alert('解析結果がありません。');return;}
  const rows=['time_min,detector_signal,baseline,corrected_signal,molecular_weight_g_mol,mass_weight'];
  for(const r of state.last.curve)rows.push([r.t,r.signal,r.baseline,r.corrected,r.mwBin,r.mass].map(v=>v.toPrecision(12)).join(','));
  download(baseName()+'_distribution.csv',rows.join('\n'));
}
function exportSummary(){if(!state.last){alert('解析結果がありません。');return;}
  const r=state.last,cal=state.cal,rows=[['sample','analysis_mode','calibration','start_min','end_min','Mn','Mw','Mz','Mp','Mw_div_Mn','area','calibration_extrapolation','physical_warning','area_unit','baseline_type','baseline_start_min','baseline_end_min'],
  [selected().name,r.mode,window.GPCCalibrationMeta.label(cal),r.start,r.end,r.mn,r.mw,r.mz,r.mp,r.dispersity,r.area,r.calibrationExtrapolated,r.physicalWarning,'signal*min',r.baselineType,r.baselineRange?.start??'',r.baselineRange?.end??'']];
  download(baseName()+'_result.csv',rows.map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\n'));
}
function projectSnapshot(){return {format:'GPCA-project-v1',created:new Date().toISOString(),datasets:state.datasets,selected:state.selected,
    calibration:state.cal,options:{mode:'research',start:$('start').value,end:$('end').value,baselineType:$('baseMode').value,
    baselineSlope:$('baseSlope').value,baselineIntercept:$('baseIntercept').value,baselineStart:$('baseStart').value,baselineEnd:$('baseEnd').value,overlay:$('overlay').checked,viewStart:$('viewStart').value,viewEnd:$('viewEnd').value,viewY:viewY?.slice()||null}};
}
function exportProject(){download('GPC_project.json',JSON.stringify({...projectSnapshot(),workspace:window.GPCSession?.workspace()},null,2),'application/json');}
function restoreProject(p,{allowDraft=false}={}){if(p.format!=='GPCA-project-v1'||!Array.isArray(p.datasets)||!p.calibration?.coefficients)throw Error('対応していないプロジェクト形式です。');
  C.validateCalibration(p.calibration);window.GPCCalibrationMeta.validate(p.calibration);
  for(const d of p.datasets){
    C.validateDataset(d);
    if(typeof d.name!=='string'||!['CRM','CSV'].includes(d.format))throw Error('測定データの名前または形式が不正です。');
    d.reference=d.format==='CRM'&&C.isReferenceSignal(d.times,d.signal);d.verified=d.reference;
    d.metadata={...d.metadata,points:d.times.length,duration:d.times.at(-1)-d.times[0],message:'保存済みプロジェクトから復元'};
  }
  if(!Number.isInteger(p.selected)||(p.datasets.length?(p.selected<0||p.selected>=p.datasets.length):p.selected!==-1))throw Error('選択中の測定データが不正です。');
  const opts=p.options||{};
  if(opts.mode!=null&&!['research','excel'].includes(opts.mode))throw Error('解析モードが不正です。');
  if(opts.baselineType!=null&&!['endpoints','manual','zero','range'].includes(opts.baselineType))throw Error('ベースライン方式が不正です。');
  for(const k of ['start','end','baselineSlope','baselineIntercept','baselineStart','baselineEnd','viewStart','viewEnd'])if(opts[k]!=null&&!allowDraft&&(String(opts[k]).trim()===''||!Number.isFinite(Number(opts[k]))))throw Error('解析条件が不正です：'+k);
  if(opts.viewY!=null&&(!Array.isArray(opts.viewY)||opts.viewY.length!==2||!opts.viewY.every(Number.isFinite)||opts.viewY[1]<=opts.viewY[0]))throw Error('縦軸の表示範囲が不正です。');
  if(opts.baselineType==='range'&&p.datasets.length&&!allowDraft){
    if(opts.baselineStart==null||opts.baselineEnd==null)throw Error('ベースライン区間がありません。');
    C.calcAnalysis(p.datasets[p.selected],p.calibration,{...opts,mode:'research'});
  }
  state.datasets=p.datasets;state.selected=p.datasets.length?Math.max(0,Math.min(state.datasets.length-1,p.selected||0)):-1;state.cal=p.calibration;if(state.cal.name===C.XLS_CAL.name)state.cal={...state.cal,name:DEFAULT_CAL.name,isDefault:true};
  $('degree').value=String(state.cal.degree);
  $('standards').value=state.cal.standards.map(p=>`${p[0]}, ${p[1]}`).join('\n');
  const options=p.options||{};
  for(const key of ['start','end','baseMode','baseSlope','baseIntercept','baseStart','baseEnd','viewStart','viewEnd']){
    const propMap={baseMode:'baselineType',baseSlope:'baselineSlope',baseIntercept:'baselineIntercept',baseStart:'baselineStart',baseEnd:'baselineEnd'};let val=options[propMap[key]||key];if(val!=null)$(key).value=val;
  }
  $('overlay').checked=options.overlay!==false;viewY=opts.viewY?.slice()||null;refresh();window.dispatchEvent(new Event('gpc-datasets-changed'));setStatus('プロジェクトを復元しました。');
}
async function loadProject(file){try{const p=JSON.parse(await file.text());if(p.workspace)window.GPCSession.validateWorkspace(p.workspace);restoreProject(p);if(p.workspace)window.GPCSession.restoreWorkspace(p.workspace);}catch(e){setStatus('プロジェクト読込エラー：'+e.message,true);}}
function hook(){
  $('chooseFile').onclick=()=>$('fileInput').click();
  $('fileInput').onchange=async e=>{await importFiles(e.target.files);e.target.value='';};
  const drop=$('drop');
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('on');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('on'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('on');importFiles(e.dataTransfer.files);});
  for(const id of ['analysisTickInterval','start','end','baseMode','baseSlope','baseIntercept','baseStart','baseEnd','viewStart','viewEnd','overlay']){
    $(id).addEventListener('change',refresh);
  }
  $('update').onclick=refresh;
  $('resetView').onclick=()=>{if(!selected())return;const ds=$('overlay').checked?state.datasets:[selected()];$('viewStart').value=Math.min(...ds.map(d=>d.times[0]));$('viewEnd').value=Math.max(...ds.map(d=>d.times.at(-1)));viewY=null;drawChrom();};
  for(const id of ['viewStart','viewEnd','overlay'])$(id).addEventListener('change',()=>{viewY=null;drawChrom();});
  $('fit').onclick=fitCal;$('restoreCal').onclick=resetCal;
  $('csvExport').onclick=exportDistribution;$('summaryExport').onclick=exportSummary;
  $('jsonExport').onclick=exportProject;
  $('jsonImport').onclick=()=>$('jsonFile').click();$('jsonFile').onchange=async e=>{if(e.target.files[0])await loadProject(e.target.files[0]);e.target.value='';};
  async function exportChrom(copy){
    if(!selected()){alert('ファイルを読み込んでください。');return;}
    try{
      const image=window.GPCFigure.trimBottom(window.GPCFigure.create(window.GPC_APP_BRIDGE.getGraphData(),{simple:true,xTickInterval:$('analysisTickInterval').value}));
      const blob=await new Promise((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(Error('画像を作成できませんでした。')),'image/png'));
      if(copy){await window.GPCCopyImage(blob);setStatus('画像をコピーしました。貼り付け先で ⌘V を押してください。');return;}
      const name=baseName()+'_chromatogram.png';if(window.GPCNativeExport?.(name,blob))return;
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setStatus('画像出力エラー：'+e.message,true);}
  }
  $('pngExport').onclick=()=>exportChrom(false);$('pngCopy').onclick=()=>exportChrom(true);
  $('printReport').onclick=()=>window.print();
  const canvas=$('chromChart'),hover=$('hover');
  function position(e){const rc=canvas.getBoundingClientRect();return {x:e.clientX-rc.left,y:e.clientY-rc.top};}
  function atTime(x){if(!viewCanvas)return null;return viewCanvas.xmin+(Math.max(viewCanvas.m.l,Math.min(x,viewCanvas.m.l+viewCanvas.pw))-viewCanvas.m.l)/viewCanvas.pw*(viewCanvas.xmax-viewCanvas.xmin);}
  const navigation=window.GPCPlotInteraction(canvas,{
    frame:()=>viewCanvas&&({left:viewCanvas.m.l,top:viewCanvas.m.t,width:viewCanvas.pw,height:viewCanvas.ph,xmin:viewCanvas.xmin,xmax:viewCanvas.xmax,ymin:viewCanvas.ymin,ymax:viewCanvas.ymax}),
    limits:()=>{const ds=$('overlay').checked?state.datasets:[selected()].filter(Boolean);return ds.length?[Math.min(...ds.map(d=>d.times[0])),Math.max(...ds.map(d=>d.times.at(-1)))]:null;},
    mode:()=>$('plotDragMode').dataset.mode,
    change:b=>{$('viewStart').value=b.xmin;$('viewEnd').value=b.xmax;viewY=[b.ymin,b.ymax];state.hover=null;hover.style.display='none';drawChrom();},
    integrate:(start,end)=>{$('start').value=start.toFixed(6);$('end').value=end.toFixed(6);refresh();},
    baseline:(start,end)=>{
      if(!selected())return;
      $('baseMode').value='range';$('baseStart').value=start.toFixed(6);$('baseEnd').value=end.toFixed(6);refresh();
    },
    reset:()=>$('resetView').click()
  });
  for(const [id,mode] of [['dragZoom','zoom'],['dragIntegrate','integrate'],['dragBaseline','baseline']])$(id).onclick=()=>{
    navigation.cancel();$('plotDragMode').dataset.mode=mode;
    $('dragZoom').setAttribute('aria-pressed',String(mode==='zoom'));$('dragIntegrate').setAttribute('aria-pressed',String(mode==='integrate'));$('dragBaseline').setAttribute('aria-pressed',String(mode==='baseline'));
    state.hover=null;hover.style.display='none';drawChrom();
  };
  canvas.addEventListener('pointermove',e=>{
    const p=position(e),v=viewCanvas;if(!v)return;
    if(navigation.isInteracting()){hover.style.display='none';return;}
    if(p.x<v.m.l||p.x>v.m.l+v.pw||p.y<v.m.t||p.y>v.m.t+v.ph){hover.style.display='none';state.hover=null;drawChrom();return;}
    const t=atTime(p.x),d=selected(),s=C.interp(d.times,d.signal,t);
    state.hover={x:p.x};hover.style.display='block';hover.style.left=Math.min(p.x+18,v.m.l+v.pw-154)+'px';hover.style.top=Math.max(0,p.y-42)+'px';
    hover.textContent=`t = ${numeric(t,3)} min  /  Signal = ${numeric(s,3)}`;
    drawChrom();
  });
  canvas.addEventListener('pointerleave',()=>{if(state.drag)return;state.hover=null;hover.style.display='none';drawChrom();});
  window.addEventListener('resize',()=>{drawChrom();drawCal()});
}
hook();resetCal();
// Dedicated calibration page reads/writes the same calibration as the analysis view.
window.GPC_APP_BRIDGE={projectSnapshot,restoreProject,exportProject,importFiles,removeDataset,removeAllDatasets,selectDataset:(index)=>{if(!Number.isInteger(index)||index<0||index>=state.datasets.length)return;state.selected=index;refresh();window.dispatchEvent(new Event('gpc-datasets-changed'));},getCalibration:()=>structuredClone(state.cal),getGraphData:()=>({yRange:viewY?.slice()||null,datasets:state.datasets.map((d,i)=>({name:d.name,times:d.times.slice(),signal:d.signal.slice(),color:colors[i%colors.length],figurePrefix:d.metadata?.figurePrefix})),selected:state.selected,overlay:$('overlay').checked,start:Number($('viewStart').value),end:Number($('viewEnd').value)}),applyCalibration:(cal)=>{state.cal=structuredClone(cal);$('degree').value=String(cal.degree);$('standards').value=cal.standards.map(([t,m])=>`${t}, ${m}`).join('\n');$('calStatus').textContent=`適用中：${cal.name} / R² ${cal.r2.toFixed(6)}`;refresh();window.dispatchEvent(new Event('gpc-calibration-changed'));},refresh};
// Lightweight diagnostics for automated acceptance tests (read-only).
if(window.GPC_BOOTSTRAP?.testing)window.__GPC_APP_TEST__={get view(){return viewCanvas;},get state(){return state;},get results(){return state.last;},loadBinary:(buf,name)=>{
  const data=C.readCRM(buf,name);state.datasets=[data];state.selected=0;refresh();return data;}};
})();
