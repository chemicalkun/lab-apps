/* Independent, local-only GPC calibration editor — v3.0; ANL 10-peak importer. */
(() => {
'use strict';
const $=id=>document.getElementById(id), C=window.GPCCore;
const bridge=window.GPC_APP_BRIDGE, M=window.GPCCalibrationMeta;
function readMeta(){return {standardType:'PSstandard',measuredDate:$('calMeasuredDate').value,measuredTime:$('calMeasuredTime').value,dateSource:$('calDateSource').value,detector:$('calMetaDetector').value};}
function writeMeta(cal){$('calMeasuredDate').value=cal.measuredDate||'';$('calMeasuredTime').value=cal.measuredTime||'';$('calDateSource').value=cal.dateSource||'';$('calMetaDetector').value=cal.detector||'';dateNote();}
function dateNote(){$('calDateNote').textContent=$('calDateSource').value==='filename'?'ファイル名の日付を転記しています。実際の測定日時を確認してください。':'測定日時が不明な場合は空欄にしてください。';}

if(!C||!bridge)throw Error('GPC解析エンジンの初期化に失敗しました。');
let rows=[],preview=null,dirty=false,applied=true,initialized=false;
let anlData=null;
const coefficientNames=['D (定数項)','C (t)','B (t²)','A (t³)'];
const asNum=v=>Number(v);
const fm=(v,d=5)=>Number.isFinite(v)?v.toLocaleString('ja-JP',{maximumFractionDigits:d}):'—';
const full=v=>Number.isFinite(v)?v.toPrecision(12):'—';
function cloneRows(cal){
 const rr=Array.isArray(cal.standardRows)&&cal.standardRows.length?cal.standardRows:cal.standards.map(([t,m],i)=>({name:`標準 ${i+1}`,t,m,used:true}));
 return rr.map((r,i)=>({name:String(r.name??`標準 ${i+1}`),t:r.t==null?NaN:Number(r.t),m:r.m==null?NaN:Number(r.m),used:r.used!==false}));
}
function setMsg(message='',error=false){const el=$('calError');el.textContent=message;el.className=error?'cal-error':'cal-error success';}
function clearANL(){anlData=null;$('calANLPeaks').hidden=true;$('calANLInfo').textContent='RI用・UV用のどちらか1ファイル、または両方同時に選択できます。保持時間を更新し、入力済み分子量は行順に保持します。';}
function setDirty(flag=true){dirty=flag;if(flag){$('calApply').disabled=true;$('calFitStatus').textContent='入力変更あり';$('calAppliedBadge').textContent='未適用の変更があります';$('calAppliedBadge').classList.add('pending');}}
function readRows(){
 const table=$('calTableBody');const next=[];
 for(const tr of table.querySelectorAll('tr')){
  const name=tr.querySelector('.standard-name').textContent.trim(),tInput=tr.querySelector('.standard-time').value,mInput=tr.querySelector('.standard-weight').value;
  const t=tInput.trim()===''?NaN:Number(tInput),m=mInput.trim()===''?NaN:Number(mInput),used=tr.querySelector('.standard-used').checked;
  next.push({name:name||`標準 ${next.length+1}`,t,m,used});
 }
 return next;
}
function tableRender(){
 $('calNameDisplay').textContent=$('calName').value;
 const tbody=$('calTableBody');tbody.replaceChildren();
 rows.forEach((r,i)=>{
  const tr=document.createElement('tr');if(!r.used)tr.classList.add('disabled');
  const td1=document.createElement('td');const check=document.createElement('input');check.className='standard-used';check.type='checkbox';check.checked=r.used;check.setAttribute('aria-label',`標準 ${i+1} を較正に使用`);td1.append(check);
  const no=document.createElement('td');no.className='cal-readonly';no.textContent=String(i+1).padStart(2,'0');
  const makeInput=(cl,value,type,aria)=>{const td=document.createElement('td');const inp=document.createElement('input');inp.className=cl;inp.type=type;inp.value=Number.isFinite(value)||typeof value==='string'?String(value):'';inp.setAttribute('aria-label',aria);if(type==='number'){inp.step='any';inp.inputMode='decimal';}td.append(inp);return td;};
  const name=document.createElement('td');name.className='standard-name cal-readonly';name.textContent=r.name;name.style.overflowWrap='anywhere';
  const tm=makeInput('standard-time',r.t,'number',`標準 ${i+1} の保持時間`);
  const mw=makeInput('standard-weight',r.m,'number',`標準 ${i+1} の分子量`);
  const log=document.createElement('td');log.className='cal-readonly row-log';log.textContent=r.m>0?fm(Math.log10(r.m),5):'—';
  const residual=document.createElement('td');residual.className='cal-readonly row-residual';residual.textContent=preview&&r.used&&r.m>0?fm(Math.log10(r.m)-C.polyVal(preview.coefficients,r.t),6):'—';
  const remove=document.createElement('td');const btn=document.createElement('button');btn.className='small-remove';btn.textContent='×';btn.type='button';btn.title='この標準を削除';btn.setAttribute('aria-label',`標準 ${i+1} を削除`);btn.onclick=()=>{rows=readRows();rows.splice(i,1);preview=null;setDirty();tableRender();updateStats();};remove.append(btn);
  tr.append(td1,no,name,tm,mw,log,residual,remove);tbody.append(tr);
 });
 updateStats();
}
function updateStats(){const active=rows.filter(r=>r.used).length;$('calActiveCount').textContent=`使用 ${active} / 全 ${rows.length} 点`;
 if(preview&&!dirty){
  $('calR2Big').textContent=fm(preview.r2,7);$('calRmse').textContent=fm(preview.rmse,6);
  $('calTimeLimits').textContent=`${fm(preview.minTime,3)}–${fm(preview.maxTime,3)} min`;
  $('calEquationFull').textContent=equation(preview);const coeff=$('calCoefficients');coeff.replaceChildren();preview.coefficients.forEach((v,i)=>{const div=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=coefficientNames[i];strong.textContent=full(v);div.append(small,strong);coeff.append(div);});
 }else{
  $('calR2Big').textContent='—';$('calRmse').textContent='—';$('calTimeLimits').textContent='—';$('calEquationFull').textContent='検量線を計算してください。';$('calCoefficients').replaceChildren();
 }
 draw();
}
function equation(cal){return 'log₁₀(M) = '+cal.coefficients.map((v,i)=>`${i>0&&v>=0?'+ ':''}${full(v)}${i===0?'':i===1?' × t':` × t^${i}`}`).join(' ');}
function initDraft(cal){clearANL();writeMeta(cal);initialized=true;rows=cloneRows(cal);$('calDegree').value=String(cal.degree);$('calName').value=cal.name||'ユーザー検量線';preview=null;dirty=false;applied=true;tableRender();setMsg('この検量線は現在の解析に適用されています。');recalculate(false,true);}
function checkRows(rr,degree){
 if(rr.length>2000)throw Error('標準試料の上限は2,000点です。');
 const pts=[];
 for(let i=0;i<rr.length;i++){
  const r=rr[i];if(!r.used)continue;
  if(!Number.isFinite(r.t)||r.t<0)throw Error(`${i+1}行目：保持時間には0以上の数値を入力してください。`);
  if(!Number.isFinite(r.m)||r.m<=0)throw Error(`${i+1}行目：分子量には正の数値を入力してください。`);
  if(!Number.isFinite(Math.log10(r.m)))throw Error(`${i+1}行目：分子量が大きすぎます。`);
  pts.push([r.t,r.m]);
 }
 if(pts.length<degree+1)throw Error(`${degree}次較正には${degree+1}点以上の有効な標準試料が必要です。`);
 if(new Set(pts.map(r=>r[0])).size<degree+1)throw Error('有効な標準試料の保持時間が重複しています。異なる時間を入力してください。');
 return pts;
}
function recalculate(userAction=true,preserveApplied=false){
 try{
  rows=readRows();const degree=Number($('calDegree').value);const std=checkRows(rows,degree);
  const cal=C.fitPolynomial(std,degree);cal.name=$('calName').value.trim()||'PSstandard';const meta=readMeta();M.validate(meta);Object.assign(cal,meta);cal.standardRows=structuredClone(rows);
  cal.rmse=Math.sqrt(std.reduce((sum,[t,m])=>sum+(Math.log10(m)-C.polyVal(cal.coefficients,t))**2,0)/std.length);
  preview=cal;dirty=false;
  $('calFitStatus').textContent=`${degree}次 / ${std.length}点`;
  // A new fit is a draft until explicitly applied; opening the current fit is different.
  if(!preserveApplied){applied=false;$('calAppliedBadge').textContent='検量線は未適用';$('calAppliedBadge').classList.add('pending');}
  else {$('calAppliedBadge').textContent='現在の解析へ適用済み';$('calAppliedBadge').classList.remove('pending');}
  $('calApply').disabled=preserveApplied;
  setMsg(userAction?'計算が完了しました。「この検量線を解析に適用」で解析結果を更新できます。':'現在の解析に設定されている検量線を表示しています。');
  tableRender();
 }catch(e){preview=null;dirty=true;$('calFitStatus').textContent='計算エラー';$('calApply').disabled=true;setMsg(e.message,true);tableRender();return false;}
 return true;
}
function apply(){if(!preview||dirty){setMsg('先に「検量線を計算」を押してください。',true);return;}
 const candidate=structuredClone(preview);candidate.standardRows=structuredClone(rows);
 bridge.applyCalibration(candidate);let libraryError="";try{window.GPCCalibrationLibrary?.remember(candidate);}catch(e){libraryError=e.message;}applied=true;$('calAppliedBadge').textContent='現在の解析へ適用済み';$('calAppliedBadge').classList.remove('pending');$('calApply').disabled=true;
 setMsg(libraryError?'解析に適用しましたが、一覧に保存できません：'+libraryError:'検量線を解析に反映し、保存一覧に追加しました。',!!libraryError);
}
function canvasSetup(id){const canvas=$(id),rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.max(rect.width,250),h=Math.max(rect.height,150);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return {canvas,c,w,h};}
function frame(c,w,h,x0,x1,y0,y1,lab){
 const m={l:69,r:25,t:27,b:45},W=w-m.l-m.r,H=h-m.t-m.b,X=x=>m.l+(x-x0)/(x1-x0)*W,Y=y=>m.t+(y1-y)/(y1-y0)*H;
 c.fillStyle='#fff';c.fillRect(0,0,w,h);c.font='11px -apple-system, sans-serif';
 for(let i=0;i<=5;i++){const x=x0+(x1-x0)*i/5,y=y0+(y1-y0)*i/5;
 c.strokeStyle='#edf2f7';c.lineWidth=1;c.beginPath();c.moveTo(X(x),m.t);c.lineTo(X(x),m.t+H);c.stroke();c.beginPath();c.moveTo(m.l,Y(y));c.lineTo(m.l+W,Y(y));c.stroke();
 c.fillStyle='#71849a';c.textAlign='center';c.fillText(fm(x,2),X(x),h-22);c.textAlign='right';c.fillText(fm(y,3),m.l-10,Y(y)+4);}
 c.strokeStyle='#ccd9e7';c.strokeRect(m.l,m.t,W,H);c.textAlign='center';c.fillStyle='#617891';c.fillText('保持時間 t [min]',m.l+W/2,h-4);
 c.save();c.translate(17,m.t+H/2);c.rotate(-Math.PI/2);c.fillText(lab,0,0);c.restore();return {X,Y};
}
function draw(){if($('calibrationPage').hidden)return;
 const tab=readRows(),valid=tab.filter(r=>Number.isFinite(r.t)&&Number.isFinite(r.m)&&r.m>0),used=valid.filter(r=>r.used),exclude=valid.filter(r=>!r.used);
 const times=valid.map(r=>r.t),logs=valid.map(r=>Math.log10(r.m)),c1=canvasSetup('calEditorChart');
 if(!valid.length){
  c1.c.fillStyle='#6f8195';c1.c.textAlign='center';c1.c.fillText('分子量を入力してください',c1.w/2,c1.h/2);
  const c2=canvasSetup('calResidualChart');c2.c.fillStyle='#6f8195';c2.c.textAlign='center';
  c2.c.fillText('分子量入力後に残差を表示します',c2.w/2,c2.h/2);
  $('calResidualNote').textContent='10点の分子量を入力して「検量線を計算」を押してください。';
  return;
 }
 let xmin=Math.min(...times),xmax=Math.max(...times),ymin=Math.min(...logs),ymax=Math.max(...logs);
 if(preview){for(let i=0;i<=180;i++){const x=preview.minTime+(preview.maxTime-preview.minTime)*i/180,y=C.polyVal(preview.coefficients,x);if(Number.isFinite(y)){ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}}}
 let px=Math.max(.2,(xmax-xmin)*.075),py=Math.max(.16,(ymax-ymin)*.12);if(xmin===xmax)px=.5;if(ymin===ymax)py=.5;
 xmin-=px;xmax+=px;ymin-=py;ymax+=py;
 const f=frame(c1.c,c1.w,c1.h,xmin,xmax,ymin,ymax,'log₁₀(M [g/mol])');
 if(preview){c1.c.strokeStyle='#286ed2';c1.c.lineWidth=2.8;c1.c.beginPath();let started=false;
  for(let i=0;i<=260;i++){const t=preview.minTime+(preview.maxTime-preview.minTime)*i/260,y=C.polyVal(preview.coefficients,t);if(!Number.isFinite(y))continue;const X=f.X(t),Y=f.Y(y);if(!started){c1.c.moveTo(X,Y);started=true;}else c1.c.lineTo(X,Y);}c1.c.stroke();}
 for(const [points,color,rad] of [[exclude,'#b0bdc9',4],[used,'#ef8c4f',5]])for(const r of points){const x=f.X(r.t),y=f.Y(Math.log10(r.m));c1.c.beginPath();c1.c.arc(x,y,rad,0,Math.PI*2);c1.c.fillStyle='#fff';c1.c.fill();c1.c.strokeStyle=color;c1.c.lineWidth=2.4;c1.c.stroke();}
 const c2=canvasSetup('calResidualChart'),res=preview?used.map(r=>[r.t,Math.log10(r.m)-C.polyVal(preview.coefficients,r.t)]):[];
 let spread=res.length?Math.max(.005,...res.map(r=>Math.abs(r[1])))*1.3:.1;
 const f2=frame(c2.c,c2.w,c2.h,xmin,xmax,-spread,spread,'残差 [log₁₀(M)]');
 c2.c.beginPath();c2.c.moveTo(f2.X(xmin),f2.Y(0));c2.c.lineTo(f2.X(xmax),f2.Y(0));c2.c.setLineDash([5,5]);c2.c.strokeStyle='#92a7bb';c2.c.lineWidth=1.4;c2.c.stroke();c2.c.setLineDash([]);
 for(const [t,r] of res){c2.c.beginPath();c2.c.arc(f2.X(t),f2.Y(r),4.3,0,2*Math.PI);c2.c.fillStyle='#ed925b';c2.c.fill();}
 $('calResidualNote').textContent=preview?`残差最大絶対値 ${fm(Math.max(...res.map(r=>Math.abs(r[1])),0),6)} log₁₀(M) ／ RMSE ${fm(preview.rmse,6)}`:'「検量線を計算」で残差を表示します。';
}
function showCalibration(){ $('graphPage').hidden=true;$('navGraph').classList.remove('active'); $('analysisPage').hidden=true;$('calibrationPage').hidden=false;$('navAnalysis').classList.remove('active');$('navCalibration').classList.add('active');if(!initialized||(applied&&!dirty))initDraft(bridge.getCalibration());requestAnimationFrame(()=>{draw();drawANLPeaks();});window.scrollTo(0,0);}
function showAnalysis(){ $('graphPage').hidden=true;$('navGraph').classList.remove('active'); $('calibrationPage').hidden=true;$('analysisPage').hidden=false;$('navCalibration').classList.remove('active');$('navAnalysis').classList.add('active');bridge.refresh();window.scrollTo(0,0);}
function saveAs(name,content,mime){const blob=content instanceof Blob?content:new Blob([content],{type:mime||'text/plain;charset=utf-8'});if(window.GPCNativeExport?.(name,blob))return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function csvQuote(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
function csvLines(s){return s.replace(/^\ufeff/,'').split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#')).map(line=>{
 // Supports commas, tabs and semicolons; quoted commas only for comma input.
 const delim=line.includes('\t')?'\t':line.includes(';')&&!line.includes(',')?';':',';let out=[],str='',quoted=false;
 for(let i=0;i<line.length;i++){let char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){str+='"';i++;}else quoted=!quoted;}else if(char===delim&&!quoted){out.push(str.trim());str='';}else str+=char;}out.push(str.trim());return out;
 });}
function parseCSV(text){const csv=csvLines(text),out=[];
 for(const p of csv){if(p.length<2)continue;
  let name,t,m;
  if(p.length>=3&&!Number.isNaN(Number(p[1]))&&!Number.isNaN(Number(p[2]))&&p[1].trim()!==''&&p[2].trim()!==''){name=p[0];t=Number(p[1]);m=Number(p[2]);}
  else if(!Number.isNaN(Number(p[0]))&&!Number.isNaN(Number(p[1]))&&p[0].trim()!==''&&p[1].trim()!==''){name=`標準 ${out.length+1}`;t=Number(p[0]);m=Number(p[1]);}
  else if(/(retention|保持時間|time|weight|分子量)/i.test(p.join(',')))continue;
  else throw Error(`${out.length+1}データ行付近の値を読めません。列は「保持時間,分子量」または「名前,保持時間,分子量」にしてください。`);
  const used=p.length>=4&&!Number.isNaN(Number(p[3]))?Number(p[3])!==0:true;out.push({name,t,m,used});
 }
 if(!out.length)throw Error('読み込める標準試料がありません。');if(out.length>2000)throw Error('標準試料は2,000点以下にしてください。');return out;
}
function findPeak(data,start,end,direction='positive'){
 if(!(Number.isFinite(start)&&Number.isFinite(end)&&start<end))throw Error('ピーク検索時間を正しく指定してください。');
 const idx=[];for(let i=0;i<data.times.length;i++){const t=data.times[i];if(t>=start&&t<=end)idx.push(i);}
 if(idx.length<3)throw Error('検索範囲内に測定点が3点以上ありません。');
 const first=idx[0],last=idx.at(-1), t0=data.times[first],t1=data.times[last],y0=data.signal[first],y1=data.signal[last];
 let best=-1,bestValue=0;
 for(let j=1;j<idx.length-1;j++){const i=idx[j],t=data.times[i],base=y0+(y1-y0)*(t-t0)/(t1-t0);
  const height=data.signal[i]-base,score=direction==='negative'?-height:direction==='absolute'?Math.abs(height):height;
  if(score>bestValue){bestValue=score;best=i;}
 }
 if(best<0)throw Error('指定された向きのピークを見つけられませんでした。検索範囲と向きを確認してください。');
 return {time:data.times[best],height:bestValue};
}
async function importMeasurements(fileList){
 try{const start=Number($('calPeakStart').value),end=Number($('calPeakEnd').value),direction=$('calPeakDirection').value;
  if(!(end>start))throw Error('ピーク検索終了時間は開始より大きくしてください。');
  rows=readRows();const results=[],fail=[];
  for(const f of fileList){try{
   const crm=/\.crm$/i.test(f.name),dataset=crm?C.readCRM(await f.arrayBuffer(),f.name):C.readCSV(await f.text(),f.name);
   const p=findPeak(dataset,start,end,direction);rows.push({name:f.name.replace(/\.[^.]+$/,''),t:p.time,m:NaN,used:true});results.push(`${f.name}: ${fm(p.time,3)} min`);
  }catch(e){fail.push(f.name+'：'+e.message);}}
  if(results.length){preview=null;setDirty();tableRender();setMsg(`取り込み ${results.length}件：${results.join(' / ')}。各行に既知の標準分子量を入力してから再計算してください。`+(fail.length?' ／ エラー：'+fail.join(' / '):''),!!fail.length);}
  else setMsg('ピークを取り込めませんでした：'+fail.join(' / '),true);
 }catch(e){setMsg('ピーク読込エラー：'+e.message,true);}
}
// ANL contains previously assigned ten peak times; unlike CRM we do not try
// to "detect" a fabricated signal trace. Masses are blank unless opted in.
async function importANLFiles(fileList){
 try{
  if(!fileList.length)return;
  const parsed=[],failed=[];
  for(const f of fileList){
   try{if(!/\.anl$/i.test(f.name))throw Error('.anlファイルを選択してください。');
    parsed.push(C.readANL(await f.arrayBuffer(),f.name));}
   catch(e){failed.push(`${f.name}: ${e.message}`);}
  }
  if(!parsed.length)throw Error(failed.join(' / ')||'読み込めるANLファイルがありません。');
  const preferred=$('calANLDetector').value;
  const selected=parsed.find(f=>f.detector===preferred)||parsed[0];
  const useStored=$('calUseStoredMasses').checked;
  const previous=(dirty||$('calName').value!=='PSstandard（標準初期値）')?readRows():[];
  $('calName').value=selected.name;
  rows=selected.peaks.map((p,i)=>({name:selected.name,t:p.time,m:previous[i]?previous[i].m:(useStored?p.storedM:NaN),used:true}));
  writeMeta({measuredDate:M.filenameDate(selected.name),dateSource:M.filenameDate(selected.name)?'filename':'',detector:selected.detector});
  anlData=selected;preview=null;setDirty();tableRender();
  $('calANLPeaks').hidden=false;
  $('calANLPeaksCount').textContent=`${selected.count}ピーク`;
  $('calANLPeaksTitle').textContent=`${selected.detector}検出器・ピーク保持時間`;
  $('calANLInfo').textContent=`${selected.name}：${selected.count}ピークの保持時間を読み込みました。`+
   (previous.length?'入力済みの分子量をピーク順に引き継ぎました。':useStored?'ファイル内の分子量を転記しました。':'既知の分子量を入力してください。')+
   (failed.length?' 読み込めなかったファイル：'+failed.join(' / '):'');

  setMsg(`${selected.count}ピークの保持時間を${selected.detector}から読み込みました。`+
   '分子量を確認し、「検量線を計算」を押してください。');
  drawANLPeaks();
 }catch(e){setMsg('ANL読込エラー：'+e.message,true);}
}
function drawANLPeaks(){
 if(!anlData||$('calANLPeaks').hidden||$('calibrationPage').hidden)return;
 const cv=$('calANLPeaksCanvas'),rect=cv.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(340,rect.width),h=105;
 cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
 const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
 const p=anlData.peaks,first=p[0].time,last=p.at(-1).time,
  extra=Math.max(.3,(last-first)*.07),left=first-extra,right=last+extra,
  X=t=>48+(t-left)/(right-left)*(w-69);
 g.fillStyle='#fff';g.fillRect(0,0,w,h);g.strokeStyle='#d6e1ed';g.lineWidth=1;
 g.beginPath();g.moveTo(48,77);g.lineTo(w-21,77);g.stroke();
 g.fillStyle='#647c96';g.font='10px -apple-system,sans-serif';
 for(let k=0;k<=5;k++){const t=left+(right-left)*k/5,x=X(t);g.fillText(t.toFixed(2),x-13,99);g.beginPath();g.moveTo(x,75);g.lineTo(x,80);g.stroke();}
 for(const r of p){const x=X(r.time);g.strokeStyle='#2374c9';g.lineWidth=2;
  g.beginPath();g.moveTo(x,75);g.lineTo(x,38);g.stroke();g.fillStyle='#1760a5';
  g.beginPath();g.arc(x,37,3,0,Math.PI*2);g.fill();g.textAlign='center';
  g.font='bold 10px -apple-system,sans-serif';g.fillText(String(r.number),x,22);}
 g.textAlign='start';g.fillStyle='#647c96';g.font='10px -apple-system,sans-serif';g.fillText('min',w-17,100);
}
function exportedCal(){if(!preview||dirty)throw Error('先に「検量線を計算」を押してください。');return {format:'GPCA-calibration-v2',created:new Date().toISOString(),calibration:preview,standardRows:rows};}
function importJSON(text,filename=""){const p=JSON.parse(text);const cal=p.format==='GPCA-calibration-v2'?p.calibration:p;
 if(!cal||!Array.isArray(cal.standards)||![1,2,3].includes(Number(cal.degree))||!Array.isArray(cal.coefficients))throw Error('GPC Analyzerの検量線JSONではありません。');
 const fileDate=M.filenameDate(filename);if(fileDate){cal.measuredDate=fileDate;cal.measuredTime='';cal.dateSource='filename';}
 M.validate(cal);writeMeta(cal);
 rows=Array.isArray(p.standardRows)?cloneRows({standardRows:p.standardRows}):cloneRows(cal);clearANL();
 $('calDegree').value=String(cal.degree);$('calName').value=cal.name||'読み込み検量線';preview=null;dirty=true;applied=false;tableRender();recalculate(true);
}
function init(){
 $('navAnalysis').onclick=showAnalysis;$('navCalibration').onclick=showCalibration;
 $('calTableBody').addEventListener('input',e=>{if(e.target.matches('input')){rows=readRows();preview=null;setDirty();updateStats();}});
 $('calTableBody').addEventListener('change',e=>{if(e.target.classList.contains('standard-used')){rows=readRows();preview=null;setDirty();tableRender();}});
 $('calDegree').onchange=()=>{rows=readRows();preview=null;setDirty();updateStats();};
 for(const id of ['calMeasuredDate','calMeasuredTime'])$(id).oninput=()=>{$('calDateSource').value='manual';dateNote();rows=readRows();preview=null;setDirty();updateStats();};
 $('calName').oninput=()=>{rows=readRows();preview=null;setDirty();updateStats();};
 $('calCalculate').onclick=()=>recalculate();$('calApply').onclick=apply;
 $('calClearRows').onclick=()=>{clearANL();rows=[];preview=null;setDirty();tableRender();setMsg('行をクリアしました。CRM / CSVの標準試料を追加するか、行を追加して値を入力してください。');};
 $('calImportCRM').onclick=()=>$('calMeasurements').click();$('calMeasurements').onchange=async e=>{if(e.target.files?.length)await importMeasurements(Array.from(e.target.files));e.target.value='';};
 $('calImportANL').onclick=()=>$('calANLFile').click();
 $('calANLFile').onchange=async e=>{if(e.target.files?.length)await importANLFiles(Array.from(e.target.files));e.target.value='';};
 $('calAddRow').onclick=()=>{rows=readRows();rows.push({name:`標準 ${rows.length+1}`,t:NaN,m:NaN,used:true});preview=null;setDirty();tableRender();$('calTableBody').lastElementChild?.querySelector('.standard-time')?.focus();};
 $('calRestore').onclick=()=>{clearANL();writeMeta({});rows=cloneRows(C.XLS_CAL);$('calDegree').value='3';$('calName').value='PSstandard（標準初期値）';preview=null;dirty=true;applied=false;tableRender();recalculate(true);setMsg('標準試料10点を初期値に戻しました。解析には「この検量線を解析に適用」を押してください。');};
 $('calExportCSV').onclick=()=>{rows=readRows();saveAs('GPC_calibration_standards.csv','\ufeff'+['name,retention_time_min,molecular_weight_g_mol,used,log10M,residual_log10M',...rows.map(r=>[csvQuote(r.name),r.t,r.m,r.used?1:0,r.m>0?Math.log10(r.m):'',preview&&!dirty&&r.m>0?Math.log10(r.m)-C.polyVal(preview.coefficients,r.t):''].join(','))].join('\r\n'),'text/csv;charset=utf-8');};
 $('calExportJSON').onclick=()=>{try{saveAs('GPC_calibration.json',JSON.stringify(exportedCal(),null,2),'application/json');}catch(e){setMsg(e.message,true);}};
 $('calImportCSV').onclick=()=>$('calCSVFile').click();$('calCSVFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{rows=parseCSV(await file.text()).map(r=>({...r,name:file.name}));$('calName').value=file.name;clearANL();writeMeta({measuredDate:M.filenameDate(file.name),dateSource:M.filenameDate(file.name)?'filename':''});preview=null;setDirty();tableRender();if(recalculate())setMsg(`CSVから${rows.length}点読み込みました。計算結果を確認して解析に適用してください。`);}catch(ex){setMsg('CSV読込エラー：'+ex.message,true);}e.target.value='';};
 $('calImportJSON').onclick=()=>$('calJSONFile').click();$('calJSONFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{importJSON(await file.text(),file.name);}catch(ex){setMsg('JSON読込エラー：'+ex.message,true);}e.target.value='';};
 $('calCopyEquation').onclick=()=>{if(!preview||dirty){setMsg('先に検量線を計算してください。',true);return;}const t=[preview.name,equation(preview),`R²=${full(preview.r2)}`,`RMSE=${full(preview.rmse)}`].join('\n');const fallback=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0;left:-1000px';document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(_e){}ta.remove();setMsg(ok?'較正式と係数をコピーしました。':'コピーできませんでした。検量線CSV出力をご利用ください。',!ok);};if(navigator.clipboard?.writeText){navigator.clipboard.writeText(t).then(()=>setMsg('較正式と係数をコピーしました。')).catch(fallback);}else fallback();};
 $('calExportPNG').onclick=()=>{const cv=$('calEditorChart');cv.toBlob(blob=>{if(blob)saveAs('GPC_calibration_curve.png',blob,'image/png');},'image/png');};
 window.addEventListener('resize',()=>{if(!$('calibrationPage').hidden){draw();drawANLPeaks();}});
 initDraft(bridge.getCalibration());
}
init();
window.GPCCalibrationEditor={current:()=>{if(!preview||dirty)throw Error('先に「検量線を計算」を押してください。');return {...structuredClone(preview),standardRows:structuredClone(rows)};}};
window.GPCCalibrationSession={
 snapshot:()=>({...readMeta(),rows:readRows().map(r=>({...r,t:Number.isFinite(r.t)?r.t:null,m:Number.isFinite(r.m)?r.m:null})),name:$('calName').value,degree:$('calDegree').value,dirty,applied}),
 validate:d=>{M.validate({...d,measuredTime:d?.measuredDate?d.measuredTime:''});if(!d||!Array.isArray(d.rows)||d.rows.length>2000||!['1','2','3'].includes(String(d.degree))||typeof d.name!=='string'||typeof d.dirty!=='boolean'||typeof d.applied!=='boolean')throw Error('保存された検量線編集状態が不正です。');for(const r of d.rows)if(typeof r.name!=='string'||typeof r.used!=='boolean'||![r.t,r.m].every(v=>v===null||Number.isFinite(v)))throw Error('保存された標準試料が不正です。');},
 restore:d=>{window.GPCCalibrationSession.validate(d);clearANL();writeMeta(d);rows=cloneRows({standardRows:d.rows,standards:[]});$('calName').value=d.name;$('calDegree').value=d.degree;initialized=true;preview=null;applied=d.applied;dirty=d.dirty;tableRender();if(!dirty)recalculate(false,applied);else setDirty();}
};
if(window.GPC_BOOTSTRAP?.testing)window.__GPC_CAL_TEST__={get rows(){return rows;},get preview(){return preview;},get dirty(){return dirty;},get anlData(){return anlData;},parseCSV,findPeak,importANLFiles,recalculate,showCalibration,showAnalysis};
})();
