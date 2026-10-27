/* Named calibration collection; coefficients are applied without refitting. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),bridge=window.GPC_APP_BRIDGE,C=window.GPCCore;
 let entries=[];
 const clone=value=>structuredClone(value);
 const key=cal=>JSON.stringify([cal.name,cal.coefficients,cal.measuredDate||'',cal.detector||'']);
 function validate(list){
  if(!Array.isArray(list)||list.length>200)throw Error('保存できる検量線は200件までです。');
  const ids=new Set();
  for(const item of list){
   if(!item||typeof item.id!=='string'||!item.id||item.id.length>100||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>120)throw Error('保存した検量線の名前・識別子が不正です。');
   ids.add(item.id);C.validateCalibration(item.calibration);window.GPCCalibrationMeta.validate(item.calibration);
   if(!Number.isFinite(item.calibration.r2))throw Error('保存した検量線のR²が不正です。');
  }
 }
 const id=()=>crypto.randomUUID();
 function notice(text,error=false){$('calLibraryStatus').textContent=text;$('calLibraryStatus').className=error?'error':'hint';}
 function render(){
  const select=$('calLibrarySelect'),current=bridge.getCalibration();select.replaceChildren(new Option('検量線を選択',''));
  for(const item of entries){const cal=item.calibration;select.add(new Option(item.name+' · '+window.GPCCalibrationMeta.label(cal),item.id));}
  const active=entries.find(e=>key(e.calibration)===key(current));select.value=active?.id||'';
  $('calLibraryDelete').disabled=!select.value;
 }
 function remember(cal,name=cal.name){
  C.validateCalibration(cal);window.GPCCalibrationMeta.validate(cal);
  name=String(name||'検量線').trim().slice(0,120)||'検量線';
  const saved=clone(cal);saved.name=name;
  const existing=entries.find(e=>e.name===name&&JSON.stringify(e.calibration)===JSON.stringify(saved));
  if(existing){render();return existing.id;}
  const next=[...entries,{id:id(),name,calibration:saved}];validate(next);entries=next;render();
  document.dispatchEvent(new Event('input',{bubbles:true}));return entries.at(-1).id;
 }
 function restore(incoming){
  validate(incoming);const next=clone(entries);
  for(const item of incoming){
   const old=next.find(e=>e.id===item.id);
   if(old&&JSON.stringify(old)===JSON.stringify(item))continue;
   const entry=clone(item);if(old)entry.id=id();
   if(!next.some(e=>e.name===entry.name&&JSON.stringify(e.calibration)===JSON.stringify(entry.calibration)))next.push(entry);
  }
  validate(next);entries=next;render();
 }
 $('calLibrarySave').onclick=()=>{try{const cal=bridge.getCalibration();const savedId=remember(cal,$('calLibraryName').value||cal.name);$('calLibrarySelect').value=savedId;$('calLibraryDelete').disabled=false;$('calLibraryName').value='';notice('現在の検量線を保存しました。');}catch(e){notice(e.message,true);}};
 $('calLibrarySelect').onchange=()=>{try{const item=entries.find(e=>e.id===$('calLibrarySelect').value);if(!item){$('calLibraryDelete').disabled=true;return;}bridge.applyCalibration(clone(item.calibration));$('calLibrarySelect').value=item.id;$('calLibraryDelete').disabled=false;notice('適用中：'+item.name);}catch(e){notice(e.message,true);}};
 $('calLibraryDelete').onclick=()=>{const chosen=$('calLibrarySelect').value;if(!chosen)return;entries=entries.filter(e=>e.id!==chosen);render();notice('保存一覧から削除しました。適用中の検量線は維持しています。');};
 $('calEditorLibrarySave').onclick=()=>{
  const status=$('calEditorLibraryStatus');
  try{const cal=window.GPCCalibrationEditor.current();remember(cal,$('calEditorLibraryName').value||cal.name);$('calEditorLibraryName').value='';status.textContent='検量線を保存一覧に追加しました。';status.className='hint';}
  catch(e){status.textContent=e.message;status.className='error';}
 };
 window.addEventListener('gpc-calibration-changed',render);
 window.GPCCalibrationLibrary={snapshot:()=>clone(entries),validate,restore,remember};render();
})();
