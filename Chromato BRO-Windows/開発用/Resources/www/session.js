/* Local session persistence. Analysis is always recalculated from the saved inputs. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),bridge=window.GPC_APP_BRIDGE;
 const ids=['graphTitleFormat','graphTitleAutoFit','graphTitleSize','graphTitleFont','graphTitleWidth','graphTitleHeight','graphTitleX','graphTitleY','graphTitleBorder','graphAutoNormalize','graphGuideWidth','graphGuideOpacity','graphPeakStart','graphPeakEnd','analysisTickInterval','graphTickInterval','start','end','baseMode','baseSlope','baseIntercept','baseStart','baseEnd','viewStart','viewEnd','overlay','degree','standards','calANLDetector','calUseStoredMasses','calPeakStart','calPeakEnd','calPeakDirection','graphMode','graphStyle','graphTitle','graphStart','graphEnd','graphOverlay','graphAxes','graphGrid','graphLegend','graphLegendSize','graphLegendX','graphLegendY','graphAxisWidth','graphCurveWidth','graphTickSize','graphLabelSize','graphFont','graphBaseline','graphBaseStart','graphBaseEnd','graphLabelX','graphLabelY','graphAutoY','graphNormStart','graphNormEnd','graphNormChoice','graphNormMethod','graphYMin','graphYMax','graphGuides','graphHorizontalInterval','graphGuideInterval','graphAspect'];
 let restoring=true,blocked=false,timer=null,queue=Promise.resolve(),last='';
 function message(text){$('sessionStatus').textContent=text;$('sessionStatus').hidden=!text;}
 function workspace(){return {calibrationLibrary:window.GPCCalibrationLibrary.snapshot(),pageOrder:window.GPCPageOrder.snapshot(),controls:Object.fromEntries(ids.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])),draft:window.GPCCalibrationSession.snapshot(),figure:window.GPCFigureSession.snapshot(),page:['navAnalysis','navCalibration','navGraph'].find(id=>$(id).classList.contains('active'))||'navAnalysis'};}
 function validateWorkspace(w){
   if(!w||typeof w.controls!=='object'||!['navAnalysis','navCalibration','navGraph'].includes(w.page))throw Error('保存された画面設定が不正です。');
   if(w.calibrationLibrary!==undefined)window.GPCCalibrationLibrary.validate(w.calibrationLibrary);
   if(w.controls.graphTitleFormat!==undefined)window.GPCTitleText.validate(JSON.parse(w.controls.graphTitleFormat));
   if(w.pageOrder!==undefined)window.GPCPageOrder.validate(w.pageOrder);
   for(const [id,value] of Object.entries(w.controls)){
     if(id==='mode')continue; // Ignore legacy Excel-mode preference.
     if(!ids.includes(id))throw Error('未対応の設定です：'+id);
     const el=$(id);if(el.type==='checkbox'?typeof value!=='boolean':typeof value!=='string')throw Error('設定値が不正です：'+id);
     if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value))throw Error('選択肢が不正です：'+id);
   }
   if(!['normalize','baseline','raw'].includes(w.controls.graphMode)||!['simple','detail'].includes(w.controls.graphStyle))throw Error('概形の表示方法が不正です。');
   window.GPCCalibrationSession.validate(w.draft);window.GPCFigureSession.validate(w.figure);
 }
 function restoreWorkspace(w){
   validateWorkspace(w);
   if(!('graphTitleFormat' in w.controls))$('graphTitleFormat').value='[]';
   for(const id of ['graphPeakStart','graphPeakEnd'])if(!(id in w.controls))$(id).value='';
   if(w.calibrationLibrary!==undefined)window.GPCCalibrationLibrary.restore(w.calibrationLibrary);
   if(w.pageOrder)window.GPCPageOrder.restore(w.pageOrder);
   for(const [id,value] of Object.entries(w.controls).filter(([id])=>id!=='mode'))if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;
   bridge.refresh();window.GPCCalibrationSession.restore(w.draft);window.GPCFigureSession.restore(w.figure);$(w.page).click();
 }
 function snapshot(){return {format:'GPC-session-v1',project:bridge.projectSnapshot(),workspace:workspace()};}
 function flush(){
   clearTimeout(timer);
   if(restoring||blocked)return Promise.resolve(false);
   const handler=window.webkit?.messageHandlers.sessionSave;
   if(!handler)return Promise.resolve(true);
   const payload=snapshot();delete payload.project.created;
   const serialized=JSON.stringify(payload);
   queue=queue.then(async()=>{
     if(serialized===last)return true;
     try{await handler.postMessage(JSON.parse(serialized));last=serialized;message('');return true;}
     catch(e){message('自動保存できません：'+e.message+' プロジェクトを別名で保存してください。');return false;}
   });return queue;
 }
 function schedule(){if(!restoring&&!blocked){clearTimeout(timer);timer=setTimeout(flush,500);}}
 function restore(saved){validateWorkspace(saved.workspace);bridge.restoreProject(saved.project,{allowDraft:true});restoreWorkspace(saved.workspace);}
 window.GPCSession={flush,workspace,validateWorkspace,restoreWorkspace,snapshot,restore};
 const bootstrap=window.GPC_BOOTSTRAP||{};
 try{if(bootstrap.error)throw Error(bootstrap.error);if(bootstrap.session)restore(bootstrap.session);}
 catch(e){blocked=true;message('前回の状態を復元できません：'+e.message+' 保存済みファイルは保持しています。ヘルプの保存先を確認してください。');}
 window.GPCPageOrder.openFirst();
 restoring=false;
 for(const type of ['input','change','click','pointerup'])document.addEventListener(type,schedule);
 for(const type of ['gpc-datasets-changed','gpc-state-changed'])window.addEventListener(type,schedule);
})();
