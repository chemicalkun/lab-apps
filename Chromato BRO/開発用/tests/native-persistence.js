const $=id=>document.getElementById(id),check=(ok,m)=>{if(!ok)throw Error(m);};
const wait=async f=>{for(let i=0;i<150&&!f();i++)await new Promise(r=>setTimeout(r,20));check(f(),'Timed out');};
if(phase==='write'){
 const bytes=Uint8Array.from(atob(fixtures['41.crm']),c=>c.charCodeAt(0));
 await window.GPC_APP_BRIDGE.importFiles([new File([bytes],'41.crm')]);
 const cal=window.GPC_APP_BRIDGE.getCalibration();cal.name='再起動テスト検量線';cal.measuredDate='2026-10-01';cal.measuredTime='14:23:45';cal.dateSource='manual';cal.detector='RI';window.GPC_APP_BRIDGE.applyCalibration(cal);
 $('start').value='4';$('end').value='9.55';$('baseMode').value='range';$('baseStart').value='0.1';$('baseEnd').value='18';window.GPC_APP_BRIDGE.refresh();
 $('navCalibration').click();const mass=$('calTableBody').querySelector('.standard-weight');mass.value='';mass.dispatchEvent(new Event('input',{bubbles:true}));$('calANLDetector').value='UV';$('calMeasuredDate').value='';$('calMeasuredDate').oninput();
 $('navGraph').click();$('graphNormStart').value='0';$('graphNormEnd').value='20';$('graphStart').value='6';$('graphEnd').value='11';$('graphTickSize').value='52';$('graphLabelX').value='40';$('graphAspect').value='1';$('graphGuides').checked=true;$('graphGuideInterval').value='0.5';$('graphLegend').checked=true;
 const row=$('graphFiles').querySelector('.graph-file');row.querySelector('.graph-legend-name').value='試料A';row.querySelector('.graph-legend-name').oninput();row.querySelector('.graph-color').value='#00aa99';row.querySelector('.graph-color').oninput();row.querySelector('.graph-shift').value='12';row.querySelector('.graph-shift').oninput();
 const csvBytes=Uint8Array.from(atob(fixtures['41.csv']),c=>c.charCodeAt(0));await window.GPC_APP_BRIDGE.importFiles([new File([csvBytes],'41.csv')]);window.GPC_APP_BRIDGE.selectDataset(0);$('graphFiles').lastElementChild.querySelector('.file-move-up').click();
 window.GPCPageOrder.restore(['navAnalysis','navGraph','navCalibration']);
 const second=structuredClone(cal);second.name='保持する検量線2';second.coefficients[0]+=.1;window.GPCCalibrationLibrary.remember(cal);window.GPCCalibrationLibrary.remember(second);$('graphTitle').value='GPC(CHCl3)';$('graphTitleAutoFit').checked=false;$('graphTitleFormat').value=JSON.stringify(window.GPCTitleText.format('GPC(CHCl3)',[],8,9,'sub'));$('graphTitleSize').value='60';$('graphTitleFont').value='Times';$('graphTitleWidth').value='1000';$('graphTitleHeight').value='180';$('graphTitleX').value='30';$('graphTitleY').value='40';$('graphAutoNormalize').checked=true;$('graphGuideWidth').value='4';$('graphGuideOpacity').value='80';$('analysisTickInterval').value='2';$('graphTickInterval').value='3';$('graphPeakStart').value='6';$('graphPeakEnd').value='11';
 check(await window.GPCSession.flush(),'Native session save');
 // Project files also carry appearance settings and draft rows.
 window.GPC_APP_BRIDGE.exportProject();await wait(()=>window.__nativeExportNames?.includes('GPC_project.json'));
 return 'PASS: saved measurement, applied calibration, unfinished calibration draft, analysis and figure settings';
}
if(phase==='draft'){
 check(!$('sessionStatus').textContent,'Incomplete input is restored without blocking storage');
 check($('start').value===''&&window.__GPC_APP_TEST__.results===null,'Incomplete input retains visible calculation error');
 $('start').value='4';window.GPC_APP_BRIDGE.refresh();check(await window.GPCSession.flush(),'Incomplete input can be corrected and saved');
 return 'PASS: unfinished numeric input survives restart, shows error and remains editable';
}
const saved=window.GPCSession.snapshot();
check(JSON.parse($('graphTitleFormat').value).some(r=>r.text==='3'&&r.script==='sub'),'Title subscript survives restart');
check(saved.workspace.figure[0].name==='41.csv'&&$('graphFiles').firstElementChild.querySelector('.file-item').textContent==='41.csv','Legend and file order survive restart');
check($('graphTitle').value==='GPC(CHCl3)'&&$('graphTitleSize').value==='60'&&$('graphTitleFont').value==='Times'&&$('graphTitleX').value==='30'&&$('graphAutoNormalize').checked,'Title settings and automatic normalization survive restart');
check($('graphGuideWidth').value==='4'&&$('graphGuideOpacity').value==='80','Guide style survives restart');
check($('graphPeakStart').value==='6'&&$('graphPeakEnd').value==='11','Peak reference survives restart');
check(saved.workspace.calibrationLibrary.length===2&&$('calLibrarySelect').options.length===3,'Multiple calibrations survive fresh-process restart');
check($('analysisTickInterval').value==='2'&&$('graphTickInterval').value==='3','Tick intervals survive restart');
check(!$('sessionStatus')?.textContent,'No restoration error');
check(saved.project.datasets.length===2&&saved.project.datasets[0].signal.length===6001,'Measurements restored');
check(saved.project.calibration.measuredDate==='2026-10-01'&&saved.project.calibration.measuredTime==='14:23:45','Calibration provenance persisted');
check(saved.project.calibration.name==='再起動テスト検量線','Applied calibration restored');
check($('baseMode').value==='range'&&$('start').value==='4'&&$('end').value==='9.55'&&$('baseStart').value==='0.1'&&$('baseEnd').value==='18','Analysis settings restored');
check($('graphTickSize').value==='52'&&$('graphLabelX').value==='40'&&$('graphLegend').checked&&$('graphStart').value==='6'&&$('graphEnd').value==='11','Figure controls restored');
check($('graphAspect').value==='1'&&$('graphGuides').checked&&$('graphGuideInterval').value==='0.5','Aspect and dotted guides restored');
check($('graphNormStart').value==='0'&&$('graphNormEnd').value==='20','Fixed normalization reference restored');
check(saved.workspace.figure.find(s=>s.name==='41.crm').label==='試料A'&&saved.project.datasets[0].name==='41.crm','Legend name restored independently of filename');
check(saved.workspace.figure.find(s=>s.name==='41.crm').color==='#00aa99'&&saved.workspace.figure.find(s=>s.name==='41.crm').shift===12,'Per-sample style restored');
check(saved.workspace.draft.measuredDate===''&&saved.workspace.draft.measuredTime==='14:23:45','Unfinished date input preserved separately from applied calibration');
check(saved.workspace.draft.dirty&&saved.workspace.draft.rows[0].m===null&&$('calANLDetector').value==='UV','Unfinished calibration draft retained without applying');
check(!$('analysisPage').hidden&&window.GPCPageOrder.snapshot()[0]==='navAnalysis','Restart opens first page, not last active graph');
check(window.__GPC_APP_TEST__.results.mn>0,'Restored analysis recalculated');
const expected=window.GPCCore.calcAnalysis(saved.project.datasets[0],saved.project.calibration,{mode:'research',start:4,end:9.55,baselineType:'range',baselineStart:.1,baselineEnd:18});
check(window.__GPC_APP_TEST__.results.mn===expected.mn,'Restored numeric result');
$('start').value='';window.GPC_APP_BRIDGE.refresh();check(await window.GPCSession.flush(),'Second-launch save including incomplete numeric field');
return 'PASS: fresh-process restoration of data, calibration, unfinished rows, UI settings and recalculated result';
