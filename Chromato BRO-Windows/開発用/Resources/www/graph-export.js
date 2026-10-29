/* Figure preview uses the same image renderer as analysis exports. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),canvas=$('graphCanvas');
  const labelHandle=$('graphLabelHandle'),legendHandle=$('graphLegendHandle'),titleHandle=$('graphTitleHandle');
  let titleDrag=null,draggedFile=null,titleEditing=null;
  const titleEditor=$('graphTitleInlineEditor'),titleTools=$('graphTitleInlineTools');
  let legendDrag=null;
  let labelDrag=null;
  let source=null,initialized=false,ready=false,busy=false,frame=null,prepared=null;
  const styles=new Map();
  function status(text,error=false){$('graphStatus').textContent=text;$('graphStatus').className=error?'error':'hint';}
  function buttons(){for(const id of ['graphSave','graphCopy'])$(id).disabled=!ready||busy;$('graphCSV').disabled=!ready||busy||$('graphMode').value!=='normalize';}
  function syncLabel(){
    syncLegend();syncTitle();
    const label=ready&&frame?.label;
    labelHandle.hidden=!label;if(!label)return;
    const rect=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height;
    Object.assign(labelHandle.style,{left:(rect.left-parent.left+label.left*sx)+'px',top:(rect.top-parent.top+label.top*sy)+'px',width:label.width*sx+'px',height:label.height*sy+'px'});
  }
  function syncLegend(){
    const label=ready&&frame?.legend;
    legendHandle.hidden=!label;if(!label)return;
    const rect=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height;
    Object.assign(legendHandle.style,{left:(rect.left-parent.left+label.left*sx)+'px',top:(rect.top-parent.top+label.top*sy)+'px',width:label.width*sx+'px',height:label.height*sy+'px'});
  }
  function syncTitle(){
    const label=ready&&frame?.title;
    titleHandle.hidden=!label||!!titleEditing;$('graphTitleResize').hidden=!label||!!titleEditing;
    const box=label||titleEditing?.origin;if(!box)return;
    const rect=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height,left=rect.left-parent.left+box.left*sx,top=rect.top-parent.top+box.top*sy;
    Object.assign(titleHandle.style,{left:left+'px',top:top+'px',width:box.width*sx+'px',height:box.height*sy+'px'});
    Object.assign($('graphTitleResize').style,{left:(left+box.width*sx-16)+'px',top:(top+box.height*sy-16)+'px'});
    if(titleEditing){
      const editWidth=Math.min(rect.width,Math.max(120,box.width*sx)),editHeight=Math.max(42,box.height*sy),edge=rect.left-parent.left+rect.width;
      Object.assign(titleEditor.style,{left:Math.min(left,edge-editWidth)+'px',top:top+'px',width:editWidth+'px',height:editHeight+'px',fontSize:Math.max(12,$('graphTitleSize').valueAsNumber*sx)+'px',fontFamily:window.GPCFigure.titleFonts[$('graphTitleFont').value]});
      Object.assign(titleTools.style,{left:Math.max(0,Math.min(left,edge-320))+'px',top:(top>80?top-80:top+editHeight+4)+'px'});
      const preview=$('graphTitleInlinePreview');preview.replaceChildren();for(const run of titleRuns()){const span=document.createElement(run.script==='sub'?'sub':run.script==='super'?'sup':'span');span.textContent=run.text;preview.append(span);}
    }
  }
  function titleRuns(){const runs=window.GPCTitleText.sync($('graphTitle').value,JSON.parse($('graphTitleFormat').value||'[]'));$('graphTitleFormat').value=JSON.stringify(runs);return runs;}
  function startTitleEdit(){
    if(!frame?.title||titleEditing)return;
    titleEditing={origin:{...frame.title},values:Object.fromEntries(['graphTitle','graphTitleFormat','graphTitleWidth','graphTitleHeight'].map(id=>[id,$(id).value])),auto:$('graphTitleAutoFit').checked};
    titleEditor.value=$('graphTitle').value;titleEditor.maxLength=500;titleEditor.hidden=false;titleTools.hidden=false;syncTitle();titleEditor.focus();titleEditor.select();
  }
  function finishTitleEdit(cancel=false){
    if(!titleEditing)return;const saved=titleEditing;titleEditing=null;
    if(cancel){for(const [id,value] of Object.entries(saved.values))$(id).value=value;$('graphTitleAutoFit').checked=saved.auto;}
    titleEditor.hidden=true;titleTools.hidden=true;render();window.dispatchEvent(new Event('gpc-state-changed'));
  }
  titleEditor.addEventListener('input',()=>{$('graphTitle').value=titleEditor.value;render();});
  titleEditor.addEventListener('keydown',e=>{if(e.key==='Escape'||(e.key==='Enter'&&!e.shiftKey)){e.preventDefault();e.stopPropagation();finishTitleEdit(e.key==='Escape');}});
  $('graphTitleEditDone').onclick=()=>finishTitleEdit();
  document.addEventListener('pointerdown',e=>{if(titleEditing&&e.target!==titleEditor&&!titleTools.contains(e.target)&&!e.target.closest('[data-title-script]'))finishTitleEdit();},true);
  for(const button of document.querySelectorAll('[data-title-script]')){
    button.addEventListener('mousedown',e=>e.preventDefault());
    button.onclick=()=>{const input=titleEditing?titleEditor:$('graphTitle'),start=input.selectionStart,end=input.selectionEnd;
      if(start===end){status('下付き・上付きにする文字を選択してください。');input.focus();return;}
      $('graphTitle').value=input.value;$('graphTitleFormat').value=JSON.stringify(window.GPCTitleText.format(input.value,titleRuns(),start,end,button.dataset.titleScript));render();input.focus();input.setSelectionRange(start,end);window.dispatchEvent(new Event('gpc-state-changed'));
    };
  }
  $('graphTitleFit').onclick=()=>{$('graphTitleAutoFit').checked=true;render();window.dispatchEvent(new Event('gpc-state-changed'));};
  function readSource(){
    source=window.GPC_APP_BRIDGE.getGraphData();
    const names=new Set(source.datasets.map(d=>d.name));
    for(const name of styles.keys())if(!names.has(name))styles.delete(name);
    for(const d of source.datasets)if(!styles.has(d.name))styles.set(d.name,{visible:true,color:d.color,shift:0,label:d.name});
    const selectedName=source.datasets[source.selected]?.name,rank=new Map([...styles.keys()].map((name,i)=>[name,i]));
    source.datasets=source.datasets.map((d,i)=>({...d,sourceIndex:i})).sort((a,b)=>rank.get(a.name)-rank.get(b.name));
    source.selected=source.datasets.findIndex(d=>d.name===selectedName);
    fileList();
  }
  function moveFile(name,index){
    const list=[...styles],at=list.findIndex(([n])=>n===name);if(at<0)return;
    const [entry]=list.splice(at,1);list.splice(Math.max(0,Math.min(index,list.length)),0,entry);styles.clear();for(const [n,v] of list)styles.set(n,v);
    readSource();render();window.dispatchEvent(new Event('gpc-state-changed'));
  }
  function fileList(){
    $('graphRemoveAll').disabled=!source?.datasets.length;
    $('graphFiles').replaceChildren();
    for(const [i,d] of (source?.datasets||[]).entries()){
      const style=styles.get(d.name),row=document.createElement('div');row.className='graph-file'+(i===source.selected?' selected':'');row.dataset.index=i;
      const order=document.createElement('div');order.className='graph-file-order';
      const handle=document.createElement('button');handle.className='secondary reorder-handle';handle.textContent='↕ 並べ替え';handle.draggable=true;handle.setAttribute('aria-label',d.name+'をドラッグで並べ替え');
      handle.ondragstart=e=>{draggedFile=d.name;e.dataTransfer.setData('text/plain',d.name);e.dataTransfer.effectAllowed='move';};handle.ondragend=()=>{draggedFile=null;for(const r of $('graphFiles').children)r.classList.remove('drag-over');};
      row.ondragover=e=>{if(draggedFile){e.preventDefault();row.classList.add('drag-over');}};row.ondragleave=()=>row.classList.remove('drag-over');
      row.ondrop=e=>{e.preventDefault();row.classList.remove('drag-over');if(draggedFile)moveFile(draggedFile,i);draggedFile=null;};
      const up=document.createElement('button'),down=document.createElement('button');up.textContent='↑';down.textContent='↓';up.className=down.className='secondary';up.disabled=i===0;down.disabled=i===source.datasets.length-1;up.setAttribute('aria-label',d.name+'を上へ');down.setAttribute('aria-label',d.name+'を下へ');up.classList.add('file-move-up');down.classList.add('file-move-down');up.onclick=()=>moveFile(d.name,i-1);down.onclick=()=>moveFile(d.name,i+1);order.append(handle,up,down);row.append(order);
      const line=document.createElement('div');line.className='file-row';
      const visible=document.createElement('input');visible.type='checkbox';visible.checked=style.visible;visible.className='graph-visible';visible.setAttribute('aria-label',d.name+'を表示');visible.onchange=()=>{style.visible=visible.checked;render();};
      const choose=document.createElement('button');choose.className='file-item';choose.textContent=d.name;choose.onclick=()=>window.GPC_APP_BRIDGE.selectDataset(d.sourceIndex);
      const remove=document.createElement('button');remove.className='file-remove';remove.textContent='削除';remove.setAttribute('aria-label',d.name+'を一覧から削除');remove.onclick=()=>{window.GPC_APP_BRIDGE.removeDataset(d.sourceIndex);$('graphImportStatus').textContent=d.name+'を一覧から削除しました。元ファイルは保持しています。';$('graphImportStatus').className='hint';};
      line.append(visible,choose,remove);row.append(line);
      const controls=document.createElement('div');controls.className='graph-file-controls';
      const colorLabel=document.createElement('label');colorLabel.textContent='色';const color=document.createElement('input');color.type='color';color.value=style.color;color.className='graph-color';color.setAttribute('aria-label',d.name+'の色');color.oninput=()=>{style.color=color.value;render();};colorLabel.append(color);
      const shiftLabel=document.createElement('label');shiftLabel.textContent='y軸移動 '+($('graphMode').value==='normalize'?'[%]':'[信号]');const shift=document.createElement('input');shift.type='number';shift.step='any';shift.className='input graph-shift';shift.value=style.shift;shift.setAttribute('aria-label',d.name+'のy軸移動量');shift.oninput=()=>{style.shift=shift.valueAsNumber;render();};shiftLabel.append(shift);
      controls.append(colorLabel,shiftLabel);row.append(controls);
      const legendLabel=document.createElement('label');legendLabel.className='graph-legend-editor';legendLabel.textContent='凡例名';
      const legendInput=document.createElement('input');legendInput.type='text';legendInput.className='input graph-legend-name';legendInput.maxLength=100;legendInput.value=style.label??d.name;legendInput.setAttribute('aria-label',d.name+'の凡例名');legendInput.oninput=()=>{style.label=legendInput.value;render();};legendLabel.append(legendInput);row.append(legendLabel);$('graphFiles').append(row);
    }
  }
  function initializeRange(){
    if(!initialized&&source?.datasets.length){
      fullRange();
      initialized=true;
    }
  }
  function clearNormalization(){$('graphNormStart').value='';$('graphNormEnd').value='';}
  function render({expandTitle=false}={}){
    ready=false;frame=null;prepared=null;buttons();status('');canvas.hidden=true;$('graphEmpty').hidden=false;
    $('graphGuideToggle').setAttribute('aria-pressed',String($('graphGuides').checked));$('graphGuideToggle').textContent='縦目盛線：'+($('graphGuides').checked?'ON':'OFF');
    $('graphHorizontalToggle').setAttribute('aria-pressed',String($('graphGrid').checked));$('graphHorizontalToggle').textContent='横目盛線：'+($('graphGrid').checked?'ON':'OFF');
    $('graphDragPeak').disabled=!source?.datasets.length;
    const mode=$('graphMode').value,normalized=mode==='normalize',baseline=mode==='baseline';
    for(const group of document.querySelectorAll('[data-choice]'))for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.value===$(group.dataset.choice).value));
    $('graphBaselineSection').hidden=!baseline;
    for(const id of ['graphBaseStart','graphBaseEnd'])$(id).disabled=!$('graphBaseline').checked;
    for(const id of ['graphYMin','graphYMax'])$(id).disabled=$('graphAutoY').checked;
    const simple=$('graphStyle').value==='simple';$('graphDetails').hidden=simple;
    for(const id of ['graphAxes'])$(id).disabled=simple;
    $('graphLegend').disabled=false;for(const label of document.querySelectorAll('.graph-legend-editor'))label.hidden=!$('graphLegend').checked;
    $('graphModeInfo').textContent=normalized?($('graphNormMethod').value==='endpoints'?'指定した両端の基準線で補正し、各試料の最大を100に揃えています。':'各試料の開始点を0、最大を100に揃えています。'):baseline?'従来の始点・終点の基準線を差し引く表示です。':'元の信号に表示専用のy軸移動量を加えます。';
    if(normalized)$('graphModeInfo').textContent+=$('graphAutoNormalize').checked?' ズーム時は表示範囲で再規格化します。':' ズーム時も基準を維持します。';
    if(normalized&&$('graphPeakStart').value!==''&&$('graphPeakEnd').value!=='')$('graphModeInfo').textContent+=' 指定したピーク範囲内の最大を100にしています。';
    if(!source?.datasets.length){$('graphEmpty').textContent='「CRM / CSVを読み込む」から測定データを選んでください。';$('graphSource').textContent='';syncLabel();return;}
    const overlay=$('graphOverlay').checked;
    $('graphSource').textContent=overlay?`読み込み済み ${source.datasets.length} ファイル`:`選択中：${source.datasets[source.selected]?.name||'—'}`;
    try{
      const formattedTitle=titleRuns();
      if(($('graphTitleAutoFit').checked||expandTitle)&&$('graphTitle').value.trim()){
        const size=window.GPCFigure.titleSize(canvas,$('graphTitle').value,formattedTitle,$('graphTitleSize').valueAsNumber,$('graphTitleFont').value);$('graphTitleWidth').value=$('graphTitleAutoFit').checked?size.width:Math.max($('graphTitleWidth').valueAsNumber,size.width);$('graphTitleHeight').value=Math.min(1000,$('graphTitleAutoFit').checked?size.height:Math.max($('graphTitleHeight').valueAsNumber,size.height));
      }
      const bounds=$('graphAutoY').checked?null:[$('graphYMin').valueAsNumber,$('graphYMax').valueAsNumber];
      const normalizationRange=$('graphNormStart').value!==''&&$('graphNormEnd').value!==''?[Number($('graphNormStart').value),Number($('graphNormEnd').value)]:[Math.min(...source.datasets.map(d=>d.times[0])),Math.max(...source.datasets.map(d=>d.times.at(-1)))];
      const peakA=$('graphPeakStart').value,peakB=$('graphPeakEnd').value;
      if((peakA==='')!==(peakB===''))throw Error('ピーク範囲は開始・終了の両方を指定してください。');
      const normalizationPeakRange=peakA===''?null:[Number(peakA),Number(peakB)];
      prepared=window.GPCFigureData.prepare({...source,normalizationPeakRange,normalizationRange,normalizationMethod:$('graphNormMethod').value,start:$('graphStart').valueAsNumber,end:$('graphEnd').valueAsNumber,overlay,yRange:bounds},mode,styles);
      frame=window.GPCFigure.draw(canvas,prepared,
        {plotAspect:$('graphAspect').value,guideWidth:$('graphGuideWidth').valueAsNumber,guideOpacity:$('graphGuideOpacity').valueAsNumber,guides:$('graphGuides').checked,guideInterval:$('graphGuideInterval').valueAsNumber,zeroAxis:normalized,useColors:true,ylabel:normalized?'規格化信号強度（%）':'検出強度',labelOffsetX:$('graphLabelX').valueAsNumber,labelOffsetY:$('graphLabelY').valueAsNumber,baselineCorrect:baseline&&$('graphBaseline').checked,baselineStart:$('graphBaseStart').valueAsNumber,baselineEnd:$('graphBaseEnd').valueAsNumber,axisWidth:$('graphAxisWidth').valueAsNumber,curveWidth:$('graphCurveWidth').valueAsNumber,xTickInterval:$('graphTickInterval').value,tickFontSize:$('graphTickSize').valueAsNumber,labelFontSize:$('graphLabelSize').valueAsNumber,fontFamily:$('graphFont').value,simple,axes:$('graphAxes').checked,horizontalGuides:$('graphGrid').checked,horizontalInterval:$('graphHorizontalInterval').valueAsNumber,legendFontSize:$('graphLegendSize').valueAsNumber,legendOffsetX:$('graphLegendX').valueAsNumber,legendOffsetY:$('graphLegendY').valueAsNumber,legend:$('graphLegend').checked,titleRuns:formattedTitle,titleFontSize:$('graphTitleSize').valueAsNumber,titleFontFamily:$('graphTitleFont').value,titleWidth:$('graphTitleWidth').valueAsNumber,titleHeight:$('graphTitleHeight').valueAsNumber,titleOffsetX:$('graphTitleX').valueAsNumber,titleOffsetY:$('graphTitleY').valueAsNumber,titleBorder:$('graphTitleBorder').checked,title:$('graphTitle').value});
      if(frame.title){$('graphTitleWidth').value=frame.title.width;$('graphTitleHeight').value=frame.title.height;}
      $('graphImageSize').textContent=`PNG · 横${canvas.width} px`;
      canvas.hidden=false;$('graphEmpty').hidden=true;ready=true;
      if((normalized||frame.baselineCorrected)&&!frame.axisVisible)status('現在の拡大範囲に横軸（0）がありません。縦軸の範囲を調整してください。');

    }catch(e){prepared=null;$('graphEmpty').textContent=e.message;status(e.message,true);}
    buttons();syncLabel();
  }
  function autoNormalize(){
    if(!$('graphAutoNormalize').checked||$('graphMode').value!=='normalize')return false;
    const start=$('graphStart').valueAsNumber,end=$('graphEnd').valueAsNumber;if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
    $('graphNormStart').value=start;$('graphNormEnd').value=end;$('graphPeakStart').value=start;$('graphPeakEnd').value=end;$('graphNormMethod').value=$('graphNormChoice').value;$('graphAutoY').checked=true;return true;
  }
  function syncRange(){clearNormalization();readSource();$('graphStart').value=source.start;$('graphEnd').value=source.end;render();}
  function fullRange(){
    clearNormalization();
    if(!source?.datasets.length)return;
    const ds=($('graphOverlay').checked?source.datasets:[source.datasets[source.selected]]).filter(d=>styles.get(d.name)?.visible!==false);
    if(!ds.length)return;
    $('graphStart').value=Math.min(...ds.map(d=>d.times[0]));
    $('graphEnd').value=Math.max(...ds.map(d=>d.times.at(-1)));
    $('graphAutoY').checked=true;
  }
  function reset(){fullRange();autoNormalize();render();}
  function show(){
    readSource();
    initializeRange();
    for(const id of ['analysisPage','calibrationPage'])$(id).hidden=true;
    for(const id of ['navAnalysis','navCalibration'])$(id).classList.remove('active');
    $('graphPage').hidden=false;$('navGraph').classList.add('active');render();window.scrollTo(0,0);
  }
  async function output(copy) {
    if(!ready||busy)return;
    busy=true;buttons();status(copy?'画像をコピーしています…':'画像を作成しています…');
    try {
      // Snapshot before yielding so rapid edits cannot change the in-flight image.
      const image=window.GPCFigure.trimBottom(canvas);
      $('graphImageSize').textContent=`PNG · ${image.width} × ${image.height} px`;
      const blob=await new Promise((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(Error('画像を作成できませんでした。')),'image/png'));
      if(copy){await window.GPCCopyImage(blob);status('画像をコピーしました。貼り付け先で Ctrl+V を押してください。');}
      else {
        const name=(source.datasets[source.selected]?.name||'GPC').replace(/\.[^.]+$/,'').replace(/[^\w\p{L}\p{N}-]+/gu,'_')+'_graph.png';
        if(window.GPCNativeExport?.(name,blob))status('保存ダイアログで保存先を指定してください。');
        else {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('PNG画像を出力しました。');}
      }
    }catch(e){status('画像出力エラー：'+e.message,true);}
    finally{busy=false;buttons();}
  }

  for(const id of ['graphTitleAutoFit','graphTitleSize','graphTitleFont','graphTitleWidth','graphTitleHeight','graphTitleX','graphTitleY','graphTitleBorder','graphAutoNormalize','graphGuideWidth','graphGuideOpacity','graphPeakStart','graphPeakEnd','graphTickInterval','graphLegendSize','graphLegendX','graphLegendY','graphTitle','graphStart','graphEnd','graphOverlay','graphAxes','graphGrid','graphLegend','graphStyle','graphAxisWidth','graphCurveWidth','graphTickSize','graphLabelSize','graphFont','graphBaseline','graphBaseStart','graphBaseEnd','graphLabelX','graphLabelY','graphAutoY','graphYMin','graphYMax','graphGuides','graphGuideInterval','graphHorizontalInterval','graphAspect'])$(id).addEventListener('input',()=>{if(id==='graphTitleWidth'||id==='graphTitleHeight')$('graphTitleAutoFit').checked=false;if(id==='graphStart'||id==='graphEnd')autoNormalize();render({expandTitle:id==='graphTitleSize'||id==='graphTitleFont'});});
  $('graphHorizontalToggle').onclick=()=>{$('graphGrid').checked=!$('graphGrid').checked;$('graphGrid').dispatchEvent(new Event('input',{bubbles:true}));};
  $('graphNormalizeRange').onclick=()=>{$('graphNormMethod').value=$('graphNormChoice').value;$('graphNormStart').value=$('graphStart').value;$('graphNormEnd').value=$('graphEnd').value;$('graphMode').value='normalize';$('graphAutoY').checked=true;fileList();render();};
  $('graphGuideToggle').onclick=()=>{$('graphGuides').checked=!$('graphGuides').checked;$('graphGuides').dispatchEvent(new Event('input',{bubbles:true}));};
  $('graphMode').onchange=()=>{clearNormalization();$('graphAutoY').checked=true;fileList();render();};
  for(const group of document.querySelectorAll('[data-choice]'))for(const button of group.querySelectorAll('button'))button.onclick=()=>{const control=$(group.dataset.choice);control.value=button.dataset.value;control.dispatchEvent(new Event(group.dataset.choice==='graphMode'?'change':'input'));};
  $('graphRemoveAll').onclick=()=>{window.GPC_APP_BRIDGE.removeAllDatasets();$('graphImportStatus').textContent='全ての測定データを一覧から削除しました。';};
  $('graphChooseFile').onclick=()=>$('graphFileInput').click();
  $('graphFileInput').onchange=async e=>{
    if(!e.target.files.length)return;
    $('graphChooseFile').disabled=true;
    try{
      const report=await window.GPC_APP_BRIDGE.importFiles(e.target.files);
      if(report.good){readSource();initializeRange();render();}
      $('graphImportStatus').textContent=report.message;$('graphImportStatus').className=report.errors.length?'error':'hint';
    }catch(error){$('graphImportStatus').textContent='読込エラー：'+error.message;$('graphImportStatus').className='error';}
    finally{e.target.value='';$('graphChooseFile').disabled=false;}
  };
  function resetLabel(){$('graphLabelX').value='0';$('graphLabelY').value='0';render();}
  $('graphLabelReset').onclick=resetLabel;
  labelHandle.addEventListener('dblclick',resetLabel);
  labelHandle.addEventListener('pointerdown',e=>{
    if(e.button!==0||!frame?.label)return;
    e.preventDefault();navigation.cancel();
    const r=canvas.getBoundingClientRect();
    labelDrag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:frame.label.offsetX,dy:frame.label.offsetY,sx:canvas.width/r.width,sy:canvas.height/r.height,oldX:$('graphLabelX').value,oldY:$('graphLabelY').value};
    labelHandle.setPointerCapture(e.pointerId);labelHandle.classList.add('moving');
  });
  labelHandle.addEventListener('pointermove',e=>{
    if(!labelDrag||labelDrag.id!==e.pointerId)return;
    $('graphLabelX').value=Math.max(-2400,Math.min(2400,labelDrag.dx+(e.clientX-labelDrag.x)*labelDrag.sx)).toFixed(1);
    $('graphLabelY').value=Math.max(-1400,Math.min(1400,labelDrag.dy+(e.clientY-labelDrag.y)*labelDrag.sy)).toFixed(1);render();
  });
  function endLabel(cancel=false){
    if(!labelDrag)return;const previous=labelDrag;labelDrag=null;labelHandle.classList.remove('moving');
    if(cancel){$('graphLabelX').value=previous.oldX;$('graphLabelY').value=previous.oldY;render();}
  }
  labelHandle.addEventListener('pointerup',()=>endLabel());
  for(const type of ['pointercancel','lostpointercapture'])labelHandle.addEventListener(type,()=>endLabel(true));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')endLabel(true);});
  window.addEventListener('blur',()=>endLabel(true));
  labelHandle.addEventListener('keydown',e=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!direction||!frame?.label)return;e.preventDefault();
    const step=e.shiftKey?10:1;
    $('graphLabelX').value=Math.max(-2400,Math.min(2400,frame.label.offsetX+direction[0]*step));
    $('graphLabelY').value=Math.max(-1400,Math.min(1400,frame.label.offsetY+direction[1]*step));render();
  });
  function resetLegend(){$('graphLegendX').value='0';$('graphLegendY').value='0';render();}
  $('graphLegendReset').onclick=resetLegend;
  legendHandle.addEventListener('dblclick',resetLegend);
  legendHandle.addEventListener('pointerdown',e=>{
    if(e.button!==0||!frame?.legend)return;
    e.preventDefault();navigation.cancel();
    const r=canvas.getBoundingClientRect();
    legendDrag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:frame.legend.offsetX,dy:frame.legend.offsetY,sx:canvas.width/r.width,sy:canvas.height/r.height,oldX:$('graphLegendX').value,oldY:$('graphLegendY').value};
    legendHandle.setPointerCapture(e.pointerId);legendHandle.classList.add('moving');
  });
  legendHandle.addEventListener('pointermove',e=>{
    if(!legendDrag||legendDrag.id!==e.pointerId)return;
    $('graphLegendX').value=Math.max(-2400,Math.min(2400,legendDrag.dx+(e.clientX-legendDrag.x)*legendDrag.sx)).toFixed(1);
    $('graphLegendY').value=Math.max(-1400,Math.min(1400,legendDrag.dy+(e.clientY-legendDrag.y)*legendDrag.sy)).toFixed(1);render();
  });
  function endLegend(cancel=false){
    if(!legendDrag)return;const previous=legendDrag;legendDrag=null;legendHandle.classList.remove('moving');
    if(cancel){$('graphLegendX').value=previous.oldX;$('graphLegendY').value=previous.oldY;render();}
  }
  legendHandle.addEventListener('pointerup',()=>endLegend());
  for(const type of ['pointercancel','lostpointercapture'])legendHandle.addEventListener(type,()=>endLegend(true));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')endLegend(true);});
  window.addEventListener('blur',()=>endLegend(true));
  legendHandle.addEventListener('keydown',e=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!direction||!frame?.legend)return;e.preventDefault();
    const step=e.shiftKey?10:1;
    $('graphLegendX').value=Math.max(-2400,Math.min(2400,frame.legend.offsetX+direction[0]*step));
    $('graphLegendY').value=Math.max(-1400,Math.min(1400,frame.legend.offsetY+direction[1]*step));render();
  });
  function resetTitle(){$('graphTitleX').value='0';$('graphTitleY').value='0';render();}
  $('graphTitleReset').onclick=resetTitle;
  titleHandle.addEventListener('dblclick',startTitleEdit);
  titleHandle.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();startTitleEdit();}});
  titleHandle.addEventListener('pointerdown',e=>{
    if(e.button!==0||!frame?.title)return;
    e.preventDefault();navigation.cancel();
    const r=canvas.getBoundingClientRect();
    titleDrag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:frame.title.offsetX,dy:frame.title.offsetY,sx:canvas.width/r.width,sy:canvas.height/r.height,oldX:$('graphTitleX').value,oldY:$('graphTitleY').value};
    titleHandle.setPointerCapture(e.pointerId);titleHandle.classList.add('moving');
  });
  titleHandle.addEventListener('pointermove',e=>{
    if(!titleDrag||titleDrag.id!==e.pointerId)return;
    $('graphTitleX').value=Math.max(-2400,Math.min(2400,titleDrag.dx+(e.clientX-titleDrag.x)*titleDrag.sx)).toFixed(1);
    $('graphTitleY').value=Math.max(-6000,Math.min(6000,titleDrag.dy+(e.clientY-titleDrag.y)*titleDrag.sy)).toFixed(1);render();
  });
  function endTitle(cancel=false){
    if(!titleDrag)return;const previous=titleDrag;titleDrag=null;titleHandle.classList.remove('moving');
    if(cancel){$('graphTitleX').value=previous.oldX;$('graphTitleY').value=previous.oldY;render();}
  }
  titleHandle.addEventListener('pointerup',()=>endTitle());
  for(const type of ['pointercancel','lostpointercapture'])titleHandle.addEventListener(type,()=>endTitle(true));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')endTitle(true);});
  window.addEventListener('blur',()=>endTitle(true));
  titleHandle.addEventListener('keydown',e=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!direction||!frame?.title)return;e.preventDefault();
    const step=e.shiftKey?10:1;
    $('graphTitleX').value=Math.max(-2400,Math.min(2400,frame.title.offsetX+direction[0]*step));
    $('graphTitleY').value=Math.max(-6000,Math.min(6000,frame.title.offsetY+direction[1]*step));render();
  });
  let titleResize=null;const resizeHandle=$('graphTitleResize');
  resizeHandle.addEventListener('pointerdown',e=>{if(e.button!==0||!frame?.title)return;e.preventDefault();navigation.cancel();const rect=canvas.getBoundingClientRect();titleResize={id:e.pointerId,x:e.clientX,y:e.clientY,width:frame.title.width,height:frame.title.height,auto:$('graphTitleAutoFit').checked,sx:canvas.width/rect.width,sy:canvas.height/rect.height};resizeHandle.setPointerCapture(e.pointerId);});
  resizeHandle.addEventListener('pointermove',e=>{
    if(!titleResize||e.pointerId!==titleResize.id)return;const d=titleResize;
    const width=Math.round(Math.max(24,Math.min(2200,d.width+(e.clientX-d.x)*d.sx))),height=Math.round(Math.max(24,Math.min(1000,canvas.height-24,d.height+(e.clientY-d.y)*d.sy)));
    try{const layout=window.GPCFigure.titleSize(canvas,$('graphTitle').value,titleRuns(),$('graphTitleSize').valueAsNumber,$('graphTitleFont').value,width);if(layout.height>Math.min(1000,canvas.height-24))return;$('graphTitleAutoFit').checked=false;$('graphTitleWidth').value=width;$('graphTitleHeight').value=Math.max(height,layout.height);render();}catch(_e){/* A box cannot be narrower than a glyph. */}
  });
  function finishTitleResize(cancel=false){if(!titleResize)return;const d=titleResize;titleResize=null;if(cancel){$('graphTitleWidth').value=d.width;$('graphTitleHeight').value=d.height;$('graphTitleAutoFit').checked=d.auto;render();}}
  resizeHandle.addEventListener('pointerup',()=>finishTitleResize());for(const event of ['pointercancel','lostpointercapture'])resizeHandle.addEventListener(event,()=>finishTitleResize(true));window.addEventListener('keydown',e=>{if(e.key==='Escape')finishTitleResize(true);});window.addEventListener('blur',()=>finishTitleResize(true));
  new ResizeObserver(syncLabel).observe(canvas);
  $('navGraph').onclick=show;$('graphSync').onclick=syncRange;$('graphReset').onclick=reset;
  $('graphSave').onclick=()=>output(false);$('graphCopy').onclick=()=>output(true);
  $('graphProjectSave').onclick=()=>window.GPC_APP_BRIDGE.exportProject();
  $('graphProjectOpen').onclick=()=>$('graphProjectInput').click();
  $('graphProjectInput').onchange=async e=>{
    try{const file=e.target.files[0];if(!file)return;const project=JSON.parse(await file.text());
      if(project.workspace)window.GPCSession.validateWorkspace(project.workspace);
      window.GPC_APP_BRIDGE.restoreProject(project);
      if(project.workspace)window.GPCSession.restoreWorkspace(project.workspace);
      show();status('プロジェクトを復元しました。');
    }catch(error){status('プロジェクト読込エラー：'+error.message,true);}finally{e.target.value='';}
  };
  $('graphCSV').onclick=()=>{if(!prepared||!ready||$('graphMode').value!=='normalize')return;const rows=[['sample','time_min','signal','y_shift','display_signal','mode']];for(const d of prepared.datasets)for(let i=0;i<d.times.length;i++)if(d.times[i]>=prepared.start&&d.times[i]<=prepared.end)rows.push([d.name,d.times[i],d.signal[i],d.yOffset,d.signal[i]+d.yOffset,$('graphMode').value]);
    const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');
    window.GPCNativeExport?.('GPC_figure.csv',new Blob([csv],{type:'text/csv;charset=utf-8'}));
  };
  window.GPCFigureSession={snapshot:()=>[...styles].map(([name,s])=>({name,...s,shift:Number.isFinite(s.shift)?s.shift:null})),validate:entries=>{if(!Array.isArray(entries)||entries.length>10000||entries.some(s=>typeof s.name!=='string'||typeof s.visible!=='boolean'||(s.label!=null&&(typeof s.label!=='string'||s.label.length>100))||!/^#[0-9a-f]{6}$/i.test(s.color)||(s.shift!==null&&!Number.isFinite(s.shift))))throw Error('保存された概形設定が不正です。');},restore:entries=>{window.GPCFigureSession.validate(entries);styles.clear();for(const s of entries)styles.set(s.name,{visible:s.visible,color:s.color,shift:s.shift===null?NaN:s.shift,label:s.label??s.name});readSource();initialized=!!source.datasets.length;render();}};

  const navigation=window.GPCPlotInteraction(canvas,{
    mode:()=>$('graphDragMode').dataset.mode,
    frame:()=>{if(!frame||!ready)return null;const r=canvas.getBoundingClientRect();return {...frame,left:frame.left*r.width/canvas.width,top:frame.top*r.height/canvas.height,width:frame.width*r.width/canvas.width,height:frame.height*r.height/canvas.height};},
    limits:()=>{const ds=$('graphOverlay').checked?source?.datasets:[source?.datasets[source.selected]].filter(Boolean);return ds?.length?[Math.min(...ds.map(d=>d.times[0])),Math.max(...ds.map(d=>d.times.at(-1)))]:null;},
    peak:(start,end)=>{$('graphPeakStart').value=start.toFixed(6);$('graphPeakEnd').value=end.toFixed(6);$('graphMode').value='normalize';$('graphAutoY').checked=true;fileList();render();},
    baseline:(start,end)=>{$('graphBaseline').checked=true;$('graphBaseStart').value=start.toFixed(6);$('graphBaseEnd').value=end.toFixed(6);$('graphAutoY').checked=true;render();},
    change:(b,kind)=>{$('graphStart').value=b.xmin;$('graphEnd').value=b.xmax;if(kind==='pan'||!autoNormalize()){$('graphAutoY').checked=false;$('graphYMin').value=b.ymin;$('graphYMax').value=b.ymax;}render();},reset
  });
  for(const [id,mode] of [['graphDragZoom','zoom'],['graphDragPeak','peak']])$(id).onclick=()=>{navigation.cancel();$('graphDragMode').dataset.mode=mode;for(const button of $('graphDragMode').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.id===id));};
  $('graphPeakClear').onclick=()=>{$('graphPeakStart').value='';$('graphPeakEnd').value='';$('graphAutoY').checked=true;render();};
  window.addEventListener('gpc-datasets-changed',()=>{
    readSource();
    if(!source.datasets.length)initialized=false;
    initializeRange();render();
  });
  if(window.GPC_BOOTSTRAP?.testing)window.__GPC_GRAPH_TEST__={get frame(){return frame;},get prepared(){return prepared;}};
})();
