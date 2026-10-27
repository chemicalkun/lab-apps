/* MoleculeDFT — local, dependency-free molecular workspace. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clone = object => JSON.parse(JSON.stringify(object));
  const NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'molecule-dft.workspace.v1';
  const ELEMENTS = ['H','B','C','N','O','F','Si','P','S','Cl','Br','I'];
  const COLORS = {H:'#849385',C:'#354e3d',N:'#5b83b2',O:'#bc7363',F:'#7f9b5c',Cl:'#7f9b5c',Br:'#ac7553',I:'#8e79a5',S:'#b8a046',P:'#c38b52',B:'#ab9076',Si:'#a58b68'};
  const ICONS = {
    hexagon:'M12 3 20 7.5v9L12 21 4 16.5v-9Z M8 7l4-2 4 2 M18 10v5 M8 18l-2-1v-4',
    folder:'M3 7h7l2 2h9v11H3Z M3 7V5h7l2 2h8v2',plus:'M12 5v14 M5 12h14',
    shield:'M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z M8 12l3 3 5-6',help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 16h.01 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0',
    'arrow-up-right':'M6 18 18 6 M6 6h12v12','arrow-right':'M4 12h16 M14 6l6 6-6 6',
    import:'M12 3v12 M7 10l5 5 5-5 M4 15v6h16v-6',export:'M12 15V3 M7 8l5-5 5 5 M4 15v6h16v-6',
    'chevron-down':'m6 9 6 6 6-6',cube:'m12 3 9 5v9l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5',
    history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v6l4 2',cursor:'m5 3 14 10-7 1-3 7Z',bond:'M5 19 19 5',eraser:'m4 13 9-10 8 7-9 10H9Z M9 8l8 7 M12 20h9',
    undo:'M4 9h10a6 6 0 0 1 0 12 M4 9l5-5 M4 9l5 5',redo:'M20 9H10a6 6 0 0 0 0 12 M20 9l-5-5 M20 9l-5 5',
    maximize:'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',trash:'M3 6h18 M8 6V3h8v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    wave:'M2 12h4l3-8 6 16 3-8h4',sliders:'M5 3v4 M5 11v10 M12 3v10 M12 17v4 M19 3v3 M19 10v11 M2 7h6v4H2Z M9 13h6v4H9Z M16 6h6v4h-6Z',
    info:'M12 11v6 M12 7h.01 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0',sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z M20 2v4 M18 4h4',
    play:'m7 4 13 8-13 8Z',close:'m6 6 12 12 M6 18 18 6'
  };
  function icons(root=document) {
    root.querySelectorAll('i[data-icon]').forEach(el => {
      const svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS(NS,'path'); path.setAttribute('d',ICONS[el.dataset.icon]||ICONS.hexagon); svg.append(path); el.replaceChildren(svg);
    });
  }
  icons();
  const initialMolecule = {atoms:[{id:'o1',element:'O',x:0,y:-17,charge:0},{id:'h1',element:'H',x:-45,y:17,charge:0},{id:'h2',element:'H',x:45,y:17,charge:0}],bonds:[{id:'b1',a:'o1',b:'h1',order:1},{id:'b2',a:'o1',b:'h2',order:1}]};
  const state = {molecule:clone(initialMolecule),name:'水',info:{formula:'H2O',mass:null},prepared:null,result:null,input:null,history:[],log:'',undo:[],redo:[],tool:'bond',element:'C',order:1,selected:null,selectedIds:[],hoverAtom:null,hoverBond:null,collapsed:false,tab:'structure',busy:false,busyKind:null,ready:false,engine:null,zoom:1.5,center:{x:0,y:0},gesture:null,space:false,dirty:false,modelRotation:{x:-.28,y:.45},modelZoom:1,modelPan:{x:0,y:0}};
  let rightDragMoved=false;
  let sequence=0,toastTimer=null,saveTimer=null,modelDrag=null,clipboardFragment=null,typingBuffer='',typingTime=0;
  const listeners=new Map();
  function emit(event,detail={}) { for(const listener of listeners.get(event)||[]) {try{listener(detail);}catch(error){console.error(error);}} }
  function on(event,listener) {if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(listener);return ()=>listeners.get(event)?.delete(listener);}
  const nextId = prefix => `${prefix}${Date.now().toString(36)}${(++sequence).toString(36)}`;
  const svg = $('moleculeCanvas');
  const native = async (op,payload={}) => {
    if (typeof window.nativeRequest !== 'function') throw new Error('計算エンジンに接続されていません。MoleculeDFT.appから起動してください。');
    return window.nativeRequest(op,payload);
  };
  function toast(message,error=false) {
    clearTimeout(toastTimer); $('toast').textContent=message; $('toast').classList.toggle('error',error); $('toast').classList.remove('hidden');
    toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),error?8000:4200);
  }
  function reportError(error) { const message=error?.message||String(error); toast(message,true); $('statusMessage').textContent=message; }
  function settings() {
    return {method:$('methodSelect').value,basis:$('basisSelect').value,task:$('taskSelect').value,solvent:$('solventSelect').value,dispersion:$('dispersionSelect').value,charge:Number($('chargeInput').value),multiplicity:Number($('multiplicityInput').value),threads:Number($('threadsSelect').value),maxCycles:Number($('maxCyclesInput').value),maxSteps:Number($('maxStepsInput').value)};
  }
  const settingsIds={method:'methodSelect',basis:'basisSelect',task:'taskSelect',solvent:'solventSelect',dispersion:'dispersionSelect',charge:'chargeInput',multiplicity:'multiplicityInput',threads:'threadsSelect',maxCycles:'maxCyclesInput',maxSteps:'maxStepsInput'};
  function setSettings(value) {
    if(!value||typeof value!=='object') return;
    value={solvent:'vacuum',dispersion:'none',...value};
    Object.entries(settingsIds).forEach(([key,id])=>{ if(value[key]!==undefined) $(id).value=String(value[key]); });
    settingDescriptions();
  }
  function validateSettings() {
    const s=settings();
    for(const id of ['chargeInput','multiplicityInput','maxCyclesInput','maxStepsInput']) if(!$(id).value.trim()) throw new Error('電荷・多重度・反復数を入力してください。');
    if(!['B3LYP','PBE','PBE0','HF'].includes(s.method)||!['sto-3g','6-31g','6-31g(d)','6-31+g(d)','def2-svp','def2-tzvp'].includes(s.basis)||!['single','optimize','frequency'].includes(s.task)) throw new Error('計算条件を選び直してください。');
    for(const [key,min,max] of [['charge',-10,10],['multiplicity',1,11],['threads',1,8],['maxCycles',10,500],['maxSteps',1,200]]) if(!Number.isInteger(s[key])||s[key]<min||s[key]>max) throw new Error('電荷・多重度・詳細設定に有効な整数を入力してください。');
    if(!['vacuum','water','thf','toluene','chloroform','dmso'].includes(s.solvent)||!['none','d3bj2b'].includes(s.dispersion))throw new Error('計算環境と分散補正を選び直してください。');
    if(s.method==='HF'&&s.dispersion!=='none')throw new Error('HFでは分散補正を「なし」にしてください。');
    return s;
  }
  function settingDescriptions() {
    const hf=$('methodSelect').value==='HF';
    $('dispersionSelect').querySelector('[value=d3bj2b]').disabled=hf;
    $('methodNote').textContent=hf?'分子軌道法。閉殻はRHF、開殻はUHF。電子相関は含めません。':'Kohn–Sham軌道を求めるDFT計算です。';
    $('calculateButton').querySelector('span').textContent=(hf?'HF':'DFT')+'計算を実行';
    $('taskHint').textContent=$('taskSelect').value==='frequency'?'構造最適化後、同じ条件で振動数と虚振動を確認します（閉殻・50原子まで）。':$('taskSelect').value==='optimize'?'原子位置を変えながら、安定な構造を探索します。':'初期3D構造の全エネルギーを求めます。';
    $('basisNote').lastChild.textContent=$('basisSelect').value==='sto-3g'?'STO-3Gは動作確認向けの小さな基底です。':'分子が大きくなると計算時間とメモリ使用量が増えます。';
  }
  function validMolecule(molecule) {
    if(!molecule||!Array.isArray(molecule.atoms)||!Array.isArray(molecule.bonds)||molecule.atoms.length>2000||molecule.bonds.length>8000) throw new Error('分子構造の形式が正しくありません。');
    const ids=new Set();
    for(const atom of molecule.atoms) {
      if(typeof atom.id!=='string'||ids.has(atom.id)||!ELEMENTS.includes(atom.element)||!Number.isFinite(atom.x)||!Number.isFinite(atom.y)) throw new Error('未対応の元素、または不正な原子座標が含まれています。');
      if(!Number.isInteger(atom.charge||0)||Math.abs(atom.charge||0)>10) throw new Error('原子の形式電荷が正しくありません。');
      ids.add(atom.id);
    }
    const bondIds=new Set(); const pairs=new Set();
    for(const bond of molecule.bonds) {
      const pair=[bond.a,bond.b].sort().join('|');
      if(typeof bond.id!=='string'||bondIds.has(bond.id)||!ids.has(bond.a)||!ids.has(bond.b)||bond.a===bond.b||![1,2,3].includes(bond.order)||pairs.has(pair)) throw new Error('結合データが正しくありません。');
      bondIds.add(bond.id);pairs.add(pair);
    }
    return clone(molecule);
  }
  function projectData(includeHistory=true) {
    const value={schema:'MoleculeDFT.project',version:1,name:state.name,molecule:state.molecule,settings:settings(),info:state.info,prepared:state.prepared,result:state.result,input:state.input,log:state.log};
    if(includeHistory) value.history=state.history;
    return value;
  }
  function saveLocal() {
    clearTimeout(saveTimer); $('saveStatus').textContent='保存中…';
    saveTimer=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(projectData()));$('saveStatus').textContent='自動保存';}catch(error){$('saveStatus').textContent='自動保存できません';}},250);
  }
  function restoreProject(data,fromFile=false) {
    if(!data||data.schema!=='MoleculeDFT.project'||data.version!==1) throw new Error('MoleculeDFTのプロジェクトファイルではありません。');
    const graph=validMolecule(data.molecule);
    if(fromFile) pushUndo();
    state.molecule=graph;state.name=String(data.name||'名称未設定').slice(0,70);state.info=data.info||{};state.prepared=data.prepared||null;state.result=data.result||null;state.input=data.input||null;state.log=String(data.log||'').slice(-120000);
    state.history=Array.isArray(data.history)?data.history.slice(0,8).filter(item=>item&&item.molecule&&item.result):[];
    state.selected=null;state.selectedIds=[];state.collapsed=false;state.dirty=true;setSettings(data.settings);$('moleculeName').value=state.name;
    if(fromFile) {fit();saveLocal();toast('プロジェクトを読み込みました。');} emit('change',{kind:'restore'});
  }
  function snapshot() { return {molecule:clone(state.molecule),name:state.name,info:clone(state.info)}; }
  function pushUndo(value=snapshot()) {state.undo.push(value);if(state.undo.length>80)state.undo.shift();state.redo=[];}
  function invalidate(chemistry=true) {
    if(chemistry) {
      const hadStereo=Boolean(state.molecule.molblock||state.molecule.sourceGraph);
      delete state.molecule.molblock;delete state.molecule.sourceGraph;
      delete state.molecule.polymer;delete state.molecule.polymerGraph;
      // Any future import metadata must also be discarded on chemical editing.
      delete state.molecule.smiles;delete state.molecule.stereochemistry;
      for(const atom of state.molecule.atoms)delete atom.cip;
      state.collapsed=false;
      if(hadStereo && !state.molecule.bonds.some(b=>b.stereo)) toast('構造を変更しました。立体配置は構造チェックで確認してください。');
      state.info={};
    }
    state.prepared=null;state.result=null;state.input=null;state.dirty=true;
    $$('.example').forEach(el=>el.classList.remove('active'));
  }
  function changed(chemistry=true) {invalidate(chemistry);render();renderResults();saveLocal();emit('change',{kind:chemistry?'chemistry':'layout'});}
  function undo() {
    if(state.busy||!state.undo.length)return;state.redo.push(snapshot());const old=state.undo.pop();Object.assign(state,old);state.selected=null;state.selectedIds=[];state.collapsed=false;invalidate(false);$('moleculeName').value=state.name;render();renderResults();saveLocal();emit('change',{kind:'undo'});
  }
  function redo() {
    if(state.busy||!state.redo.length)return;state.undo.push(snapshot());const old=state.redo.pop();Object.assign(state,old);state.selected=null;state.selectedIds=[];state.collapsed=false;invalidate(false);$('moleculeName').value=state.name;render();renderResults();saveLocal();emit('change',{kind:'redo'});
  }
  function loadMolecule(molecule,name='名称未設定',info={}) {
    const graph=validMolecule(molecule);pushUndo();state.molecule=graph;state.name=name;state.info=info;state.prepared=null;state.result=null;state.input=null;state.selected=null;state.selectedIds=[];state.collapsed=false;state.dirty=false;
    $('moleculeName').value=name;$('chargeInput').value=Number.isInteger(info.charge)?info.charge:graph.atoms.reduce((sum,a)=>sum+(a.charge||0),0);$('multiplicityInput').value=1;
    $$('.example').forEach(el=>el.classList.remove('active'));setTab('structure');setTool('bond');fit();render();renderResults();saveLocal();emit('change',{kind:'load'});
  }
  let polymerUnit=null;
  function polymerOptions() {
    const drawn=$('polymerSource').value==='drawing';
    $('polymerAttachment').classList.toggle('hidden',!drawn);$('polymerPEPreview').classList.toggle('hidden',drawn);
    const n=Number($('polymerDegree').value);$('polymerNLabel').textContent=Number.isInteger(n)?n:'n';
    const preset=state.engine?.polymerPresets?.find(p=>p.id===$('polymerSource').value);
    let estimate='接続点の水素を置き換え、鎖の原子数と分子式を確定します。';
    if(!drawn&&preset){
      $('polymerPrefix').textContent=preset.prefix;$('polymerRepeat').textContent=preset.repeat;$('polymerSuffix').textContent=preset.suffix;
      const counts={...preset.endComposition};Object.entries(preset.composition).forEach(([e,k])=>counts[e]=(counts[e]||0)+n*k);
      const keys=Object.keys(counts).sort((a,b)=>(a==='C'?-2:a==='H'?-1:0)-(b==='C'?-2:b==='H'?-1:0)||a.localeCompare(b));
      estimate=Number.isInteger(n)&&n>=1&&n<=100?`${keys.map(e=>e+(counts[e]===1?'':counts[e])).join('')} · 水素込み ${Object.values(counts).reduce((a,b)=>a+b,0)} 原子`:'nは1〜100の整数です。';
    }
    $('polymerEstimate').textContent=estimate;
    $('polymerTermination').textContent=`両端：${preset?.termination||'H / H'}。`;
    $('polymerStereoNote').textContent=drawn?'接続点に指定された立体配置は使えません。':preset?.stereoNote||'';
    window.MoleculeDFTProduct?.polymerOptionsChanged?.();
  }
  function showPolymer(edit=false,useSelection=false,unitOverride=null) {
    if(state.busy)return;
    const previous=edit?state.molecule.polymer:null;
    polymerUnit=clone(unitOverride||previous?.unit||(useSelection?selectedFragment():state.molecule));
    const drawingOption=$('polymerSource').querySelector('option[value="drawing"]');if(drawingOption)drawingOption.textContent=useSelection?'選択した部分を単位にする':'今描いている構造を単位にする';
    $('polymerSource').value=previous?(previous.preset||(previous.name==='PE'?'pe':'drawing')):(useSelection||unitOverride?'drawing':'pe');
    $('polymerDegree').value=previous?.degree||5;
    for(const id of ['polymerHead','polymerTail']) {
      $(id).replaceChildren();polymerUnit.atoms.forEach((a,i)=>{if(a.element==='H')return;const option=document.createElement('option');option.value=a.id;option.textContent=`${i+1}: ${a.element}`;$(id).append(option);});
    }
    const choices=$('polymerTail').options;if(choices.length)$('polymerTail').selectedIndex=choices.length-1;
    if(previous){$('polymerHead').value=polymerUnit.atoms[previous.head_index]?.id||'';$('polymerTail').value=polymerUnit.atoms[previous.tail_index]?.id||'';}
    if(!previous){const ids=new Set(polymerUnit.atoms.map(a=>a.id)),boundary=[...new Set(state.molecule.bonds.filter(b=>ids.has(b.a)!==ids.has(b.b)).map(b=>ids.has(b.a)?b.a:b.b))];const ends=polymerUnit.atoms.filter(a=>a.element!=='H'&&polymerUnit.bonds.filter(b=>b.a===a.id||b.b===a.id).length===1).map(a=>a.id);const candidates=boundary.length===2?boundary:ends;if(candidates.length===2){$('polymerHead').value=candidates[0];$('polymerTail').value=candidates[1];}}
    $('pickHead').click();$('repeatPreviewResult').replaceChildren();
    $('repeatUnitOrigin').textContent=useSelection?`選択した ${polymerUnit.atoms.length} 原子を単位にします。外側との結合は除き、省略された水素を補います。`:'図の原子を順にクリック：① 接続点A → ② 接続点B。候補は変更できます。';
    renderPolymerUnit();
    window.MoleculeDFTProduct?.polymerOpened?.(previous);
    $('polymerError').classList.add('hidden');polymerOptions();$('polymerDialog').showModal();
  }
  async function buildPolymer() {
    if(state.busy)return;
    const degree=Number($('polymerDegree').value);
    if(!Number.isInteger(degree)||degree<1||degree>100){$('polymerError').textContent='nは1〜100の整数を入力してください。';$('polymerError').classList.remove('hidden');return;}
    setBusy(true,'polymer');$('polymerError').classList.add('hidden');$('statusMessage').textContent='有限鎖を生成中…';
    try{
      const data=await native('buildPolymer',{source:$('polymerSource').value,degree,molecule:polymerUnit,head:$('polymerHead').value,tail:$('polymerTail').value,...(window.MoleculeDFTProduct?.polymerPayload?.()||{})});
      loadMolecule(data.molecule,`${data.polymer.name} · n=${degree}`,data);
      $('polymerDialog').close();$('statusMessage').textContent=`${data.formula} / ${data.total_atoms}原子の有限鎖を生成しました`;
      if(!data.quantum_allowed)toast('描画できますが計算原子数の上限を超えています。重合度を小さくしてください。',true);
      render();saveLocal();
    }catch(error){$('polymerError').textContent=error.message;$('polymerError').classList.remove('hidden');reportError(error);}finally{setBusy(false);}
  }
  function newMolecule() {if(state.busy)return;loadMolecule({atoms:[],bonds:[]});$('statusMessage').textContent='新しい分子';}
  function atomById(id) {return state.molecule.atoms.find(atom=>atom.id===id);}
  function bondById(id) {return state.molecule.bonds.find(bond=>bond.id===id);}
  function svgElement(tag,attributes={}) {const el=document.createElementNS(NS,tag);Object.entries(attributes).forEach(([key,value])=>el.setAttribute(key,String(value)));return el;}
  function atomLabel(atom) {
    const degree=state.molecule.bonds.filter(b=>b.a===atom.id||b.b===atom.id).length;
    return atom.element==='C'&&degree>0&&!atom.charge?'':atom.element;
  }
  function formulaText(value) {return String(value||'—').replace(/[0-9]/g,d=>'₀₁₂₃₄₅₆₇₈₉'[Number(d)]);}
  function render() {
    const polymer=state.molecule.polymer;
    $('polymerBanner').classList.toggle('hidden',!polymer);
    if(polymer){$('polymerSummary').textContent=`${polymer.name} · n = ${polymer.degree} · ${polymer.termination} 終端`; $('polymerDetail').textContent=`有限鎖 / 水素込み ${polymer.total_atoms} 原子`; }
    const bondLayer=$('bondLayer'),atomLayer=$('atomLayer');bondLayer.replaceChildren();atomLayer.replaceChildren();
    for(const bond of state.molecule.bonds) {
      const a=atomById(bond.a),b=atomById(bond.b);if(!a||!b)continue;
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
      const cutA=atomLabel(a)?12:0,cutB=atomLabel(b)?12:0;
      const selected=(state.selected?.kind==='bond'&&state.selected.id===bond.id)||(state.selectedIds.includes(bond.a)&&state.selectedIds.includes(bond.b));
      if(selected) bondLayer.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#9bc6a9','stroke-width':12,'stroke-linecap':'round',opacity:.3}));
      const shifts=bond.order===3?[-5,0,5]:bond.order===2?[-3,3]:[0];
      if(bond.order===1&&bond.stereo){drawStereoBond(bondLayer,a,b,bond.stereo,cutA,cutB);} else for(const shift of shifts) bondLayer.append(svgElement('line',{x1:a.x+ux*cutA-uy*shift,y1:a.y+uy*cutA+ux*shift,x2:b.x-ux*cutB-uy*shift,y2:b.y-uy*cutB+ux*shift,stroke:'#455c45','stroke-width':1.55,'stroke-linecap':'round'}));
      bondLayer.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'transparent','stroke-width':15,'data-bond':bond.id,class:'bond-target'}));
    }
    for(const atom of state.molecule.atoms) {
      const group=svgElement('g',{'data-atom':atom.id,class:'atom-target'}); const selected=state.selectedIds.includes(atom.id)||(state.selected?.kind==='atom'&&state.selected.id===atom.id);
      group.append(svgElement('circle',{cx:atom.x,cy:atom.y,r:11,fill:'#c9f4e8',stroke:'#2aa989','stroke-width':2,class:'hover-glow'}));
      if(selected) group.append(svgElement('circle',{cx:atom.x,cy:atom.y,r:11,fill:'#d8f7db',stroke:'#4dab76','stroke-width':1.6,class:'selection-glow'}));
      if(valenceIssue(atom))group.append(svgElement('circle',{cx:atom.x,cy:atom.y,r:19,fill:'none',stroke:'#c26d56','stroke-width':2,'stroke-dasharray':'3 2'}));
      if(atom.cip){const cip=svgElement('text',{x:atom.x-19,y:atom.y-14,'font-size':10,fill:'#45748b','font-weight':600});cip.textContent=atom.cip;group.append(cip);}
      const label=atomLabel(atom);
      if(label) {
        group.append(svgElement('rect',{x:atom.x-(label.length>1?11:8),y:atom.y-10,width:label.length>1?22:16,height:20,rx:3,class:'atom-label-background'}));
        const text=svgElement('text',{x:atom.x,y:atom.y+5.3,'text-anchor':'middle','font-size':16,'font-weight':500,fill:COLORS[atom.element]||'#718665'});text.textContent=label;group.append(text);
      }
      if(atom.charge) {const t=svgElement('text',{x:atom.x+10,y:atom.y-8,'font-size':9,fill:COLORS[atom.element]||'#718665'});t.textContent=`${Math.abs(atom.charge)===1?'':Math.abs(atom.charge)}${atom.charge>0?'+':'−'}`;group.append(t);}
      group.append(svgElement('circle',{cx:atom.x,cy:atom.y,r:13,fill:'transparent'}));atomLayer.append(group);
    }
    $('atomCount').textContent=`${state.molecule.atoms.length} 原子`;$('bondCount').textContent=`${state.molecule.bonds.length} 結合`;
    $('formulaValue').textContent=formulaText(state.result?.formula||state.prepared?.formula||state.info.formula);
    const mass=state.prepared?.mass??state.info.mass;$('massValue').textContent=Number.isFinite(mass)?mass.toFixed(3):'—';
    $('moleculeBadge').textContent=['optimize','frequency'].includes(state.result?.task)&&state.result.geometry_converged?'構造最適化済':state.prepared||state.result?'3D生成済':'2D構造';
    $('emptyCanvas').classList.toggle('hidden',state.molecule.atoms.length>0||state.tab!=='structure');
    const selectedAtom=state.selected?.kind==='atom'?atomById(state.selected.id):null;
    $('selectionInspector').classList.toggle('hidden',!selectedAtom||state.tab!=='structure'||state.busy);
    if(selectedAtom) {$('selectionLabel').textContent=selectedAtom.element;$('atomChargeSelect').value=selectedAtom.charge||0;}
    $('undoButton').disabled=state.busy||!state.undo.length;$('redoButton').disabled=state.busy||!state.redo.length;
    $('historyCount').textContent=state.history.length;updateEditorStatus();renderCollapsed();updateControls();draw3D();
  }
  function resizeView() {
    const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const w=rect.width/state.zoom,h=rect.height/state.zoom;svg.setAttribute('viewBox',`${state.center.x-w/2} ${state.center.y-h/2} ${w} ${h}`);$('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
  }
  function fit() {
    if(state.tab==='model') {state.modelRotation={x:-.28,y:.45};state.modelZoom=1;state.modelPan={x:0,y:0};draw3D();return;}
    if(state.collapsed&&$('repeatLayer')?.children.length){const bounds=$('repeatLayer').getBBox(),rect=$('canvasArea').getBoundingClientRect();state.center={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};state.zoom=Math.max(.005,Math.min(1.75,(rect.width-120)/(bounds.width+40),(rect.height-125)/(bounds.height+40)));resizeView();return;}
    const atoms=state.collapsed&&state.molecule.polymer?.unit?.atoms?.length?state.molecule.polymer.unit.atoms:state.molecule.atoms;if(!atoms.length){state.center={x:0,y:0};state.zoom=1.5;resizeView();return;}
    const xs=atoms.map(a=>a.x),ys=atoms.map(a=>a.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    state.center={x:(minX+maxX)/2,y:(minY+maxY)/2};const rect=$('canvasArea').getBoundingClientRect();state.zoom=Math.min(1.75,Math.max(.005,Math.min((rect.width-120)/(maxX-minX+70),(rect.height-125)/(maxY-minY+60))));resizeView();
  }
  function zoom(amount) {if(state.tab==='model'){state.modelZoom=Math.max(.4,Math.min(3,state.modelZoom*amount));draw3D();return;}state.zoom=Math.min(4,Math.max(.005,state.zoom*amount));resizeView();}
  function zoomAt(amount,x,y,model=false) {
    if(state.gesture||!Number.isFinite(amount)||amount<=0)return;
    if(model){const rect=$('modelCanvas').getBoundingClientRect(),old=state.modelZoom;state.modelZoom=Math.max(.4,Math.min(3,old*amount));const ratio=state.modelZoom/old,px=x-rect.left-rect.width/2,py=y-rect.top-rect.height/2;state.modelPan={x:px-(px-state.modelPan.x)*ratio,y:py-(py-state.modelPan.y)*ratio};draw3D();return;}
    const before=point({clientX:x,clientY:y});state.zoom=Math.max(.005,Math.min(4,state.zoom*amount));resizeView();const after=point({clientX:x,clientY:y});state.center.x+=before.x-after.x;state.center.y+=before.y-after.y;resizeView();
  }
  window.onNativeMagnify=(x,y,factor)=>{if(document.querySelector('dialog[open]'))return false;const target=document.elementFromPoint(x,y)?.closest('#moleculeCanvas,#modelCanvas');if(!target)return false;zoomAt(factor,x,y,target.id==='modelCanvas');return true;};
  function point(event) {const matrix=svg.getScreenCTM();const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return matrix?p.matrixTransform(matrix.inverse()):{x:0,y:0};}
  function nearestAtom(p,exclude=null) {let best=null,distance=19/state.zoom+5;for(const atom of state.molecule.atoms){if(atom.id===exclude)continue;const d=Math.hypot(atom.x-p.x,atom.y-p.y);if(d<distance){distance=d;best=atom;}}return best;}
  function setTool(tool) {state.tool=tool;const templateActive=tool==='template';$('templateSelect')?.classList.toggle('active',templateActive);$('fiveRing')?.classList.toggle('active',templateActive&&$('templateSelect').value==='cyclopentyl');$$('.element').forEach(el=>el.classList.toggle('active',tool==='atom'&&el.dataset.element===state.element));$$('[data-tool]').forEach(el=>el.classList.toggle('active',el.dataset.tool===tool));$$('[data-editor-tool]').forEach(el=>el.classList.toggle('active',el.dataset.editorTool===tool));$$('[data-order]').forEach(el=>el.classList.toggle('active',tool==='bond'&&Number(el.dataset.order)===state.order));$$('[data-tool],[data-editor-tool],[data-order],.element,#fiveRing').forEach(el=>el.setAttribute('aria-pressed',String(el.classList.contains('active'))));if($('templateToggle')){$('templateToggle').textContent=TEMPLATES.find(t=>t[0]===$('templateSelect').value)?.[1]||'テンプレート';$('templateToggle').classList.toggle('active',templateActive);$('templateToggle').setAttribute('aria-pressed',String(templateActive));}if(tool==='idle'){state.selected=null;state.selectedIds=[];render();}$('canvasArea').dataset.tool=tool;const hints={idle:'ドラッグでキャンバスを移動 · 描画ツールを選んで再開',pan:'ドラッグで表示移動 · 右ドラッグ / Space + ドラッグでも移動',select:'囲んで選択 · 結合をダブルクリックで分子選択 · ⌘Dで複製 · Spaceで移動',bond:'クリックで延長 · ドラッグで方向指定 · ⌥で角度を自由に · 1 / 2 / 3で次数',atom:`クリックで ${state.element} を追加・置換`,erase:'原子または結合をクリックして削除',ring:'原子・結合から環を追加 · 近い辺へ吸着 · 押したまま回転',benzene:'原子・結合から芳香環を追加 · 近い辺へ吸着 · 押したまま回転',chain:'ドラッグでジグザグの炭素鎖 · Lで選択',wedge:'始点を手前側の中心原子にして、くさび結合を描く',dash:'始点を中心原子にして、破線くさび結合を描く',template:'押したまま回転 · 離して確定 · 続けて配置できます'};$('canvasHint').lastChild.textContent=hints[tool]||hints.select;}
  function toggleTool(tool){if(!state.busy)setTool(state.tool===tool?'idle':tool);}
  function toggleTemplate(id){if(state.busy)return;const same=state.tool==='template'&&$('templateSelect').value===id;$('templateSelect').value=id;setTool(same?'idle':'template');updateEditorStatus();}
  function chooseElement(element) {
    if(state.busy||!ELEMENTS.includes(element))return;state.element=element;
    const extraNeeded=!$$('.element:not(#extraElement)').some(el=>el.dataset.element===element);let extra=$('extraElement');
    if(extraNeeded&&!extra){extra=document.createElement('button');extra.id='extraElement';extra.className='tool element';extra.onclick=()=>{if(state.busy)return;if(state.tool==='atom'&&state.element===extra.dataset.element)setTool('idle');else chooseElement(extra.dataset.element);};$('elementSelect').before(extra);}
    if(extra){extra.classList.toggle('hidden',!extraNeeded);if(extraNeeded){extra.dataset.element=element;extra.textContent=element;extra.title=element+' を選択 / 再度クリックで解除';}}
    $$('.element').forEach(el=>el.classList.toggle('active',el.dataset.element===element));$('elementSelect').value=$$('.element').some(el=>el.dataset.element===element)?'':element;
    if(state.selected?.kind==='atom') {const atom=atomById(state.selected.id);if(atom&&atom.element!==element){pushUndo();atom.element=element;changed();}}
    setTool('atom');
  }
  function chooseOrder(order) {
    if(state.busy||state.collapsed)return;
    if(state.hoverBond){state.selected={kind:'bond',id:state.hoverBond};state.selectedIds=[];}
    state.order=order;$$('[data-order]').forEach(el=>el.classList.toggle('active',Number(el.dataset.order)===order));
    if(state.selected?.kind==='bond') {const bond=bondById(state.selected.id);if(bond&&bond.order!==order){pushUndo();bond.order=order;delete bond.stereo;changed();}}
    setTool('bond');
  }
  function addAtom(p,element=state.element) {const a={id:nextId('a'),element,x:p.x,y:p.y,charge:0};state.molecule.atoms.push(a);return a;}
  function addBond(a,b,order=state.order) {if(a.id===b.id)return;const existing=state.molecule.bonds.find(x=>(x.a===a.id&&x.b===b.id)||(x.a===b.id&&x.b===a.id));if(existing){existing.order=order;return existing;}const bond={id:nextId('b'),a:a.id,b:b.id,order};state.molecule.bonds.push(bond);return bond;}
  function deleteSelected() {
    if(state.busy||(!state.selected&&!state.selectedIds.length))return;
    pushUndo();const ids=new Set(state.selectedIds);if(state.selected?.kind==='atom')ids.add(state.selected.id);
    state.molecule.atoms=state.molecule.atoms.filter(a=>!ids.has(a.id));
    state.molecule.bonds=state.molecule.bonds.filter(b=>!ids.has(b.a)&&!ids.has(b.b)&&!(state.selected?.kind==='bond'&&state.selected.id===b.id));
    state.selected=null;state.selectedIds=[];changed();
  }
  function endpoint(start,p,free=false) {
    const dx=p.x-start.x,dy=p.y-start.y;
    let angle=Math.atan2(dy,dx);
    if(Math.hypot(dx,dy)<8){
      // Prefer 120° chain angles, then the least crowded standard direction.
      const neighbours=state.molecule.bonds.filter(b=>b.a===start.id||b.b===start.id).map(b=>atomById(b.a===start.id?b.b:b.a)).filter(Boolean);
      let best=-Infinity;
      for(let i=0;i<12;i++){
        const candidate=-Math.PI/6+i*Math.PI/6,x=start.x+56*Math.cos(candidate),y=start.y+56*Math.sin(candidate);
        let score=-i*.001;
        for(const atom of state.molecule.atoms)if(atom.id!==start.id)score-=4000/Math.max(1,(x-atom.x)**2+(y-atom.y)**2);
        if(neighbours.length===1){const n=neighbours[0],cos=((n.x-start.x)*Math.cos(candidate)+(n.y-start.y)*Math.sin(candidate))/(Math.hypot(n.x-start.x,n.y-start.y)||1);score-=5*Math.abs(cos+.5);}
        if(score>best){best=score;angle=candidate;}
      }
    }else if(!free)angle=Math.round(angle/(Math.PI/6))*Math.PI/6;
    return{x:start.x+56*Math.cos(angle),y:start.y+56*Math.sin(angle)};
  }
  function transformSelection(degrees=0,dx=0,dy=0) {
    if(state.busy||state.collapsed||(!state.selected&&!state.selectedIds.length))return;
    const ids=new Set(selectedFragment().atoms.map(a=>a.id)),atoms=state.molecule.atoms.filter(a=>ids.has(a.id));
    if(degrees&&atoms.length<2)return;
    const cx=atoms.reduce((n,a)=>n+a.x,0)/atoms.length,cy=atoms.reduce((n,a)=>n+a.y,0)/atoms.length,r=degrees*Math.PI/180;
    pushUndo();for(const a of atoms){const x=a.x-cx,y=a.y-cy;a.x=cx+x*Math.cos(r)-y*Math.sin(r)+dx;a.y=cy+x*Math.sin(r)+y*Math.cos(r)+dy;}
    changed(false);
  }
  function duplicateSelection() {
    if(state.busy||state.collapsed||(!state.selected&&!state.selectedIds.length))return;
    const fragment=selectedFragment(),xs=fragment.atoms.map(a=>a.x);
    const center={x:fragment.atoms.reduce((n,a)=>n+a.x,0)/fragment.atoms.length+Math.max(...xs)-Math.min(...xs)+56,y:fragment.atoms.reduce((n,a)=>n+a.y,0)/fragment.atoms.length};
    try{appendFragment(fragment,center);toast('選択した構造を複製しました。ドラッグで配置できます。');}catch(error){reportError(error);}
  }
  function selectConnected(id) {
    if(state.busy||state.collapsed||!atomById(id))return;
    const ids=new Set([id]),pending=[id],adjacency=new Map(state.molecule.atoms.map(a=>[a.id,[]]));
    for(const b of state.molecule.bonds){adjacency.get(b.a).push(b.b);adjacency.get(b.b).push(b.a);}
    while(pending.length)for(const next of adjacency.get(pending.pop()))if(!ids.has(next)){ids.add(next);pending.push(next);}
    state.selectedIds=[...ids];state.selected=null;setTool('select');render();
  }
  const placementCache=new Map();
  // Choose the middle of the largest free sector around an attachment atom.
  // For a terminal chain atom, prefer the usual 120 degree bond angle.
  function attachmentAngle(graph,root,chain=false){
    const neighbours=graph.bonds.filter(b=>b.a===root.id||b.b===root.id).map(b=>({atom:graph.atoms.find(a=>a.id===(b.a===root.id?b.b:b.a)),order:b.order})).filter(n=>n.atom);
    if(!neighbours.length)return 0;
    const tau=2*Math.PI,angles=neighbours.map(n=>(Math.atan2(n.atom.y-root.y,n.atom.x-root.x)+tau)%tau).sort((a,b)=>a-b);
    if(angles.length===1)return angles[0]+(chain&&neighbours[0].order!==3?2*Math.PI/3:Math.PI);
    let gap=-1,direction=0;
    for(let i=0;i<angles.length;i++){const next=angles[(i+1)%angles.length]+(i===angles.length-1?tau:0),space=next-angles[i];if(space>gap+1e-8){gap=space;direction=angles[i]+space/2;}}
    return direction;
  }
  function newPlacement(p,anchor,merge,name){
    return {kind:'placement',tool:state.tool,origin:{x:anchor?.x??p.x,y:anchor?.y??p.y},anchorId:anchor?.id,merge,angle:anchor?(attachmentAngle(state.molecule,anchor,!merge)*180/Math.PI+360)%360:0,name,loading:false,cancelled:false,released:false};
  }
  function templateGraph(template){
    const id=template[0];
    return placementCache.has(id)?Promise.resolve(placementCache.get(id)):native('importSmiles',{smiles:template[2]}).then(data=>{placementCache.set(id,data.molecule);return data.molecule;});
  }
  function placementGraph(g){
    const graph=clone(g.graph),root=graph.atoms[0];
    // Copy the pivot: referring to root itself would move the pivot on the first iteration.
    const rootPivot=g.anchorId||!g.merge;
    const base=rootPivot?{x:root.x,y:root.y}:{x:graph.atoms.reduce((n,a)=>n+a.x,0)/graph.atoms.length,y:graph.atoms.reduce((n,a)=>n+a.y,0)/graph.atoms.length};
    const direction=g.angle*Math.PI/180,r=direction-(rootPivot?attachmentAngle(graph,root,!g.merge)+Math.PI:0),offset=g.anchorId&&!g.merge?56:0;
    for(const a of graph.atoms){const x=a.x-base.x,y=a.y-base.y;a.x=g.origin.x+offset*Math.cos(direction)+x*Math.cos(r)-y*Math.sin(r);a.y=g.origin.y+offset*Math.sin(direction)+x*Math.sin(r)+y*Math.cos(r);}
    return graph;
  }
  function placementResult(g){
    const graph=placementGraph(g),map=g.anchorId&&g.merge?{[graph.atoms[0].id]:g.anchorId}:{};
    const fusion=g.merge&&!g.noSnap?window.MoleculeRingGeometry.findFusion(graph,state.molecule,{rootId:g.anchorId?graph.atoms[0].id:null,anchorId:g.anchorId,bondId:g.bondId,point:g.point||g.origin,zoom:state.zoom}):null;
    return fusion?{...fusion,fused:true}:{graph,map,blocked:!!g.bondId};
  }
  function showFusion(fusion){
    const layer=$('previewLayer'),bond=bondById(fusion.bondId);if(!bond)return;
    const a=atomById(bond.a),b=atomById(bond.b);
    layer.append(svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#5596c1','stroke-width':6/state.zoom,opacity:.3,'data-fusion-bond':bond.id}));
    for(const id of Object.values(fusion.map)){const atom=atomById(id);layer.append(svgElement('circle',{cx:atom.x,cy:atom.y,r:7/state.zoom,fill:'#5ca6de33',stroke:'#508dba','stroke-width':1/state.zoom,'data-placement-anchor':id}));}
  }
  function positionPlacementLabel(p){
    const location=svg.createSVGPoint();location.x=p.x;location.y=p.y;const screen=location.matrixTransform(svg.getScreenCTM()),area=$('canvasArea').getBoundingClientRect(),hud=$('placementAngle');
    hud.style.left=`${Math.max(8,Math.min(area.width-hud.offsetWidth-8,screen.x-area.left+18))}px`;hud.style.top=`${Math.max(8,Math.min(area.height-hud.offsetHeight-8,screen.y-area.top-34))}px`;
  }
  function updatePlacement(g,event){
    const p=event?point(event):g.origin,dx=p.x-g.origin.x,dy=p.y-g.origin.y;
    if(event){g.point={x:p.x,y:p.y};g.noSnap=event.altKey&&!g.bondId;}
    if(Math.hypot(dx,dy)*state.zoom>8){let angle=Math.atan2(dy,dx)*180/Math.PI;const axis=Math.round(angle/90)*90;if(!event.altKey&&Math.abs(angle-axis)<=5)angle=axis;else if(event.shiftKey)angle=Math.round(angle/15)*15;g.angle=(angle+360)%360;}
    const result=g.graph?placementResult(g):null,angle=(g.angle+(result?.rotation||0)+360)%360;
    const horizontal=Math.abs(angle%180)<.001,vertical=Math.abs(angle%180-90)<.001;
    $('placementAngle').classList.remove('hidden');$('placementAngle').textContent=`${angle.toFixed(1)}°${horizontal?' · 水平':vertical?' · 垂直':''}${result?.fused?' · 2原子共有':result?.blocked?' · 接続不可':''}${g.graph?'':' · 準備中…'}`;
    positionPlacementLabel(g.point||g.origin);
    const layer=$('previewLayer');layer.replaceChildren();
    if(result?.fused)showFusion(result);
    else if(g.anchorId||!g.merge)layer.append(svgElement('circle',{cx:g.origin.x,cy:g.origin.y,r:7/state.zoom,fill:'#5ca6de33',stroke:'#508dba','stroke-width':1/state.zoom,'data-placement-anchor':g.anchorId||'root'}));
    if(!g.graph)return;
    const graph=result.graph,byId=new Map(graph.atoms.map(a=>[a.id,a]));
    if(g.anchorId&&!g.merge){const a=graph.atoms[0];layer.append(svgElement('line',{x1:g.origin.x,y1:g.origin.y,x2:a.x,y2:a.y,stroke:'#408b70','stroke-width':1.8,'data-placement-connection':'true'}));}
    for(const b of graph.bonds){if(result.fused&&result.map[b.a]&&result.map[b.b])continue;const a=byId.get(b.a),c=byId.get(b.b),dx=c.x-a.x,dy=c.y-a.y,len=Math.hypot(dx,dy)||1;if(b.stereo){drawStereoBond(layer,a,c,b.stereo,0,0,'#408b70');continue;}for(const offset of b.order===3?[-4,0,4]:b.order===2?[-2.5,2.5]:[0])layer.append(svgElement('line',{x1:a.x-dy/len*offset,y1:a.y+dx/len*offset,x2:c.x-dy/len*offset,y2:c.y+dx/len*offset,stroke:'#408b70','stroke-width':1.8,'data-placement-bond':b.id}));}
    for(const a of graph.atoms)if(a.element!=='C'||graph.atoms.length===1){layer.append(svgElement('circle',{cx:a.x,cy:a.y,r:10,fill:'#f7faf4'}));const label=svgElement('text',{x:a.x,y:a.y+5,'font-size':15,'text-anchor':'middle',fill:COLORS[a.element]||'#408b70'});label.textContent=a.element;layer.append(label);}
  }
  function clearPlacement(g){
    if(state.gesture===g)state.gesture=null;$('previewLayer').replaceChildren();$('placementAngle').classList.add('hidden');
    if(!g.loading)setBusy(false);
  }
  function moveSelection(g,p,free=false){
    const ids=new Set(g.origins.map(a=>a.id));
    for(const origin of g.origins){const atom=atomById(origin.id);if(atom){atom.x=origin.x+p.x-g.start.x;atom.y=origin.y+p.y-g.start.y;}}
    if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>1)g.moved=true;
    const fragment={atoms:state.molecule.atoms.filter(a=>ids.has(a.id)),bonds:state.molecule.bonds.filter(b=>ids.has(b.a)&&ids.has(b.b))};
    const hasBoundary=state.molecule.bonds.some(b=>ids.has(b.a)!==ids.has(b.b));
    g.fusion=!free&&!hasBoundary&&g.moved?window.MoleculeRingGeometry.findFusion(fragment,state.molecule,{excludeIds:[...ids],zoom:state.zoom}):null;
    if(g.fusion)for(const a of g.fusion.graph.atoms){const atom=atomById(a.id);atom.x=a.x;atom.y=a.y;}
    render();$('previewLayer').replaceChildren();$('placementAngle').classList.toggle('hidden',!g.fusion);
    if(g.fusion){showFusion(g.fusion);$('placementAngle').textContent='2原子共有';positionPlacementLabel(p);}
  }
  function mergeMovedSelection(g){
    for(const b of state.molecule.bonds)if(g.fusion.targetOrders?.[b.id]!==undefined)b.order=g.fusion.targetOrders[b.id];
    const map=g.fusion.map,ids=new Set(g.origins.map(a=>a.id)),variants=new Map(g.fusion.graph.bonds.map(b=>[b.id,b]));
    const bonds=[...state.molecule.bonds.filter(b=>!ids.has(b.a)&&!ids.has(b.b)),...state.molecule.bonds.filter(b=>ids.has(b.a)||ids.has(b.b))],pairs=new Set();
    state.molecule.atoms=state.molecule.atoms.filter(a=>!map[a.id]);state.molecule.bonds=[];
    for(const bond of bonds){const b={...bond,...variants.get(bond.id),a:map[bond.a]||bond.a,b:map[bond.b]||bond.b},key=[b.a,b.b].sort().join('|');if(b.a===b.b||pairs.has(key))continue;pairs.add(key);state.molecule.bonds.push(b);}
    state.selectedIds=[...new Set(state.selectedIds.map(id=>map[id]||id))];state.selected=null;
  }
  function commitPlacement(g){
    if(g.cancelled||state.gesture!==g)return;
    const result=placementResult(g),graph=result.graph,anchor=atomById(g.anchorId),map=new Map(Object.entries(result.map));
    if(result.blocked){g.cancelled=true;clearPlacement(g);toast('この結合には環を共有できません。元素・原子価・重なりを確認してください。',true);return;}
    if(state.molecule.atoms.length+graph.atoms.length-map.size>2000){g.cancelled=true;clearPlacement(g);toast('描画は2000原子までです。',true);return;}
    pushUndo();for(const b of state.molecule.bonds)if(result.targetOrders?.[b.id]!==undefined)b.order=result.targetOrders[b.id];for(const a of graph.atoms){if(map.has(a.id))continue;const id=nextId('a');map.set(a.id,id);state.molecule.atoms.push({...a,id});}
    for(const b of graph.bonds){const a=map.get(b.a),c=map.get(b.b);if(state.molecule.bonds.some(existing=>(existing.a===a&&existing.b===c)||(existing.a===c&&existing.b===a)))continue;state.molecule.bonds.push({...b,id:nextId('b'),a,b:c});}
    if(anchor&&!g.merge)addBond(anchor,atomById(map.get(graph.atoms[0].id)),1);
    state.selected=null;state.selectedIds=[];clearPlacement(g);changed();setTool(g.tool);$('statusMessage').textContent=`${g.name} を ${((g.angle+(result.rotation||0)+360)%360).toFixed(1)}° で配置しました${result.fused?' · 2原子を共有':''}`;
  }
  function beginPlacement(event,p,anchor,bond){
    const tool=state.tool,id=$('templateSelect').value,template=TEMPLATES.find(t=>t[0]===id);
    if(tool==='template'&&!template){toast('テンプレートを選んでください。');return;}
    const g=newPlacement(p,anchor,tool!=='template'||RING_TEMPLATES.has(id),tool==='benzene'?'ベンゼン環':tool==='ring'?'六員環':template[1]);if(g.merge&&bond&&!anchor&&!event.altKey)g.bondId=bond.id;state.gesture=g;capturePointer(event);
    if(tool!=='template'){
      g.graph={atoms:Array.from({length:6},(_,i)=>({id:'p'+i,element:'C',charge:0,x:56*Math.cos(Math.PI+i*Math.PI/3),y:56*Math.sin(Math.PI+i*Math.PI/3)})),bonds:Array.from({length:6},(_,i)=>({id:'pb'+i,a:'p'+i,b:'p'+((i+1)%6),order:tool==='benzene'&&i%2===0?2:1}))};
      setBusy(true,'placement');updatePlacement(g,event);return;
    }
    g.loading=!placementCache.has(id);setBusy(true,'placement');
    updatePlacement(g,event);
    templateGraph(template).then(graph=>{g.graph=graph;g.loading=false;if(g.cancelled){clearPlacement(g);return;}if(g.released)commitPlacement(g);else updatePlacement(g,null);}).catch(error=>{g.loading=false;g.cancelled=true;clearPlacement(g);reportError(error);});
  }
  window.addEventListener('blur',()=>{const g=state.gesture;if(g?.kind==='placement'){g.cancelled=true;clearPlacement(g);}});
  function capturePointer(event){try{svg.setPointerCapture(event.pointerId);}catch(error){if(error.name!=='NotFoundError')throw error;}}
  svg.addEventListener('pointerdown',event=>{
    if(state.busy||event.button>2)return;if(event.button===2)rightDragMoved=false;svg.querySelectorAll('.hovered').forEach(node=>node.classList.remove('hovered'));event.preventDefault();svg.focus();const p=point(event);const atomId=event.target.closest('[data-atom]')?.dataset.atom;const bondId=event.target.closest('[data-bond]')?.dataset.bond;const atom=atomById(atomId);
    if(state.space||event.button===1||event.button===2||['pan','idle'].includes(state.tool)){state.gesture={kind:'pan',screen:{x:event.clientX,y:event.clientY},center:{...state.center}};capturePointer(event);return;}
    if(state.collapsed){toast('構造を編集するには「全鎖表示」に切り替えてください。');return;}
    if(state.tool==='select'||(event.shiftKey&&!atom&&!bondId)) {
      if(atom){
        if(event.shiftKey){state.selectedIds=state.selectedIds.includes(atom.id)?state.selectedIds.filter(id=>id!==atom.id):[...state.selectedIds,atom.id];}
        else if(!state.selectedIds.includes(atom.id))state.selectedIds=[atom.id];
        state.selected=state.selectedIds.length===1?{kind:'atom',id:state.selectedIds[0]}:null;
        state.gesture={kind:'move',start:{x:p.x,y:p.y},origins:state.molecule.atoms.filter(a=>state.selectedIds.includes(a.id)).map(a=>({id:a.id,x:a.x,y:a.y})),snapshot:snapshot(),moved:false};
      } else if(bondId){state.selected={kind:'bond',id:bondId};state.selectedIds=[];}
      else {if(!event.shiftKey)state.selectedIds=[];state.selected=null;state.gesture={kind:'marquee',start:{x:p.x,y:p.y},base:[...state.selectedIds],point:{x:p.x,y:p.y}};}
      if(state.gesture)capturePointer(event);render();return;
    }
    state.selectedIds=[];
    if(state.tool==='erase'){state.selected=atom?{kind:'atom',id:atom.id}:bondId?{kind:'bond',id:bondId}:null;deleteSelected();return;}
    if(state.tool==='atom'){if(atom&&atom.element===state.element){state.selected={kind:'atom',id:atom.id};state.selectedIds=[atom.id];render();return;}pushUndo();if(atom)atom.element=state.element;else state.selected={kind:'atom',id:addAtom(p).id};changed();return;}
    if(['ring','benzene','template'].includes(state.tool)){beginPlacement(event,p,atom,bondById(bondId));return;}
    if(['bond','wedge','dash','chain'].includes(state.tool)) {
      if(bondId&&!atom&&state.tool!=='chain'){pushUndo();const bond=bondById(bondId);if(state.tool==='wedge'||state.tool==='dash'){bond.order=1;const stereo=state.tool==='wedge'?'up':'down';if(bond.stereo===stereo)[bond.a,bond.b]=[bond.b,bond.a];bond.stereo=stereo;}else{bond.order=bond.order===state.order?bond.order%3+1:state.order;delete bond.stereo;}state.selected={kind:'bond',id:bond.id};changed();return;}
      state.gesture={kind:state.tool==='chain'?'chain':'bond',stereo:state.tool==='wedge'?'up':state.tool==='dash'?'down':null,start:atom||{x:p.x,y:p.y},existingId:atom?.id||null,point:p};capturePointer(event);renderPreview(p);
    }
  });
  svg.addEventListener('pointermove',event=>{
    const p=point(event);state.hoverAtom=event.target.closest('[data-atom]')?.dataset.atom||null;state.hoverBond=event.target.closest('[data-bond]')?.dataset.bond||null;
    for(const target of svg.querySelectorAll('.atom-target'))target.classList.toggle('hovered',!state.busy&&!state.collapsed&&!state.gesture&&!state.space&&!['idle','pan'].includes(state.tool)&&target.dataset.atom===state.hoverAtom);
    if(!state.gesture)return;const g=state.gesture;
    if(g.kind==='placement'){updatePlacement(g,event);return;}
    if(g.kind==='pan'){if(Math.hypot(event.clientX-g.screen.x,event.clientY-g.screen.y)>4)rightDragMoved=true;state.center={x:g.center.x-(event.clientX-g.screen.x)/state.zoom,y:g.center.y-(event.clientY-g.screen.y)/state.zoom};resizeView();}
    else if(g.kind==='move')moveSelection(g,p,event.altKey);
    else if(g.kind==='marquee'){g.point={x:p.x,y:p.y};const minX=Math.min(p.x,g.start.x),maxX=Math.max(p.x,g.start.x),minY=Math.min(p.y,g.start.y),maxY=Math.max(p.y,g.start.y);state.selectedIds=[...new Set([...g.base,...state.molecule.atoms.filter(a=>a.x>=minX&&a.x<=maxX&&a.y>=minY&&a.y<=maxY).map(a=>a.id)])];render();$('previewLayer').replaceChildren(svgElement('rect',{x:minX,y:minY,width:maxX-minX,height:maxY-minY,fill:'#73a58b22',stroke:'#518e72','stroke-width':1/state.zoom,'stroke-dasharray':`${4/state.zoom} ${3/state.zoom}`}));}
    else if(g.kind==='bond'||g.kind==='chain'){g.point=p;g.free=event.altKey;renderPreview(p);}
  });
  svg.addEventListener('contextmenu',event=>event.preventDefault());
  svg.addEventListener('pointerleave',()=>{state.hoverAtom=null;state.hoverBond=null;svg.querySelectorAll('.hovered').forEach(node=>node.classList.remove('hovered'));});
  svg.addEventListener('dblclick',event=>{if(state.busy||state.collapsed)return;const id=event.target.closest('[data-atom]')?.dataset.atom;const bond=bondById(event.target.closest('[data-bond]')?.dataset.bond);if(bond&&state.tool==='select')selectConnected(bond.a);else if(id&&event.altKey&&state.tool==='select')selectConnected(id);else if(id)showAtomEditor(id);});
  function chainPoints(start,p) {
    const dx=p.x-start.x,dy=p.y-start.y,length=Math.hypot(dx,dy),angle=Math.round(Math.atan2(dy,dx)/(Math.PI/6))*Math.PI/6;
    const count=Math.max(1,Math.min(100,Math.round(length/(56*Math.cos(Math.PI/6))))),ux=Math.cos(angle),uy=Math.sin(angle),step=56*Math.cos(Math.PI/6);
    return Array.from({length:count+1},(_,i)=>({x:start.x+ux*i*step-uy*(i%2?28:0),y:start.y+uy*i*step+ux*(i%2?28:0)}));
  }
  function renderPreview(p) {
    const g=state.gesture;if(!g||!['bond','chain'].includes(g.kind))return;const layer=$('previewLayer');layer.replaceChildren();
    if(g.kind==='chain'){const points=chainPoints(g.start,p);layer.append(svgElement('polyline',{points:points.map(a=>`${a.x},${a.y}`).join(' '),fill:'none',stroke:'#598f72','stroke-width':2,'stroke-dasharray':'4 3'}));const last=points[points.length-1];const text=svgElement('text',{x:last.x+12,y:last.y-14,'font-size':12,fill:'#366b52'});text.textContent=`${points.length-1} 結合`;layer.append(text);return;}
    const snap=Math.hypot(p.x-g.start.x,p.y-g.start.y)>=8?nearestAtom(p,g.existingId):null,end=snap||endpoint(g.start,p,g.free);
    if(g.stereo)drawStereoBond(layer,g.start,end,g.stereo,0,0,'#82a974');else layer.append(svgElement('line',{x1:g.start.x,y1:g.start.y,x2:end.x,y2:end.y,stroke:'#82a974','stroke-width':2,'stroke-dasharray':'4 3'}));
    layer.append(svgElement('circle',{cx:end.x,cy:end.y,r:snap?18:8,fill:'#bdd1aa',stroke:snap?'#3c8a67':'none','stroke-width':2,opacity:snap?.6:.4}));
    if(snap){const text=svgElement('text',{x:end.x+21,y:end.y-18,'font-size':11,fill:'#3c745a'});text.textContent='ここに接続';layer.append(text);}
  }
  function finishGesture(event,cancelled=false) {
    const g=state.gesture;if(!g)return;if(g.kind==='placement'){if(cancelled){g.cancelled=true;clearPlacement(g);}else{updatePlacement(g,event);g.released=true;if(g.graph)commitPlacement(g);}return;}state.gesture=null;$('previewLayer').replaceChildren();$('placementAngle').classList.add('hidden');
    if(cancelled){if(g.kind==='marquee'){state.selectedIds=g.base;state.selected=null;}if(g.snapshot)state.molecule=g.snapshot.molecule;render();return;}
    if(g.kind==='move'){moveSelection(g,point(event),event.altKey);if(g.moved){pushUndo(g.snapshot);if(g.fusion)mergeMovedSelection(g);changed(!!g.fusion);}$('previewLayer').replaceChildren();$('placementAngle').classList.add('hidden');}
    if(g.kind==='marquee'){const p=point(event),x0=Math.min(g.start.x,p.x),x1=Math.max(g.start.x,p.x),y0=Math.min(g.start.y,p.y),y1=Math.max(g.start.y,p.y);state.selectedIds=[...new Set([...g.base,...state.molecule.atoms.filter(a=>a.x>=x0&&a.x<=x1&&a.y>=y0&&a.y<=y1).map(a=>a.id)])];setTool('select');state.selected=state.selectedIds.length===1?{kind:'atom',id:state.selectedIds[0]}:null;render();}
    if(g.kind==='bond') {
      pushUndo();const a=atomById(g.existingId)||addAtom(g.start);const p=point(event);const b=(Math.hypot(p.x-a.x,p.y-a.y)>=8?nearestAtom(p,a.id):null)||addAtom(endpoint(a,p,event.altKey));const bond=addBond(a,b,g.stereo?1:state.order);if(g.stereo)bond.stereo=g.stereo;else delete bond.stereo;state.selected={kind:'bond',id:bond.id};changed();
    }
    if(g.kind==='chain'){
      const points=chainPoints(g.start,point(event));if(state.molecule.atoms.length+points.length>2000){toast('描画は2000原子までです。',true);return;}
      pushUndo();let previous=atomById(g.existingId)||addAtom(points[0],'C');const selected=[previous.id];for(const p of points.slice(1)){const next=addAtom(p,'C');addBond(previous,next,1);selected.push(next.id);previous=next;}state.selected=null;state.selectedIds=selected;changed();
    }
  }
  svg.addEventListener('pointerup',event=>{finishGesture(event);if(event.button===2&&!rightDragMoved)window.MoleculeLibrary?.openContext(event);});svg.addEventListener('pointercancel',event=>finishGesture(event,true));svg.addEventListener('pointerleave',()=>{state.hoverAtom=null;state.hoverBond=null;svg.querySelectorAll('.hovered').forEach(node=>node.classList.remove('hovered'));});
  svg.addEventListener('wheel',event=>{event.preventDefault();if(state.gesture)return;if(event.ctrlKey){zoomAt(Math.exp(-event.deltaY*.01),event.clientX,event.clientY);return;}const unit=event.deltaMode===1?16:event.deltaMode===2?svg.clientHeight:1;state.center.x+=(event.shiftKey?event.deltaY:event.deltaX)*unit/state.zoom;state.center.y+=(event.shiftKey?0:event.deltaY)*unit/state.zoom;resizeView();},{passive:false});
  function setTab(tab) {
    state.tab=tab;$$('[data-tab]').forEach(el=>{const active=el.dataset.tab===tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',active);});
    $('moleculeCanvas').classList.toggle('hidden',tab!=='structure');$('modelCanvas').classList.toggle('hidden',tab!=='model');$('historyPanel').classList.toggle('hidden',tab!=='history');$('drawingToolbar').style.visibility=tab==='structure'?'visible':'hidden';
    $('canvasEyebrow').textContent=tab==='structure'?'MOLECULAR SKETCH':'MOLECULAR GEOMETRY';$('canvasDescription').textContent=tab==='structure'?'構造式から、分子の性質へ。':'ドラッグで回転 · スワイプで移動 · ピンチでズーム';
    $('canvasDescription').parentElement.classList.toggle('hidden',tab==='history');
    document.querySelector('.canvas-bottom').classList.toggle('hidden',tab==='history');
    $('canvasHint').classList.toggle('hidden',tab!=='structure');$('editorActions')?.classList.toggle('hidden',tab!=='structure');if(tab==='history')renderHistory();render();resizeView();emit('tab',{tab});
  }
  function setBusy(busy,kind=null) {
    const placing=busy&&kind==='placement';
    state.busy=busy;state.busyKind=busy?kind:null;document.body.classList.toggle('busy',busy);$('structureState').textContent=placing?'配置中':busy?'処理中':'編集可能';
    $$('input:not(#calculationHelpSearch),select,.drawing-toolbar button,.example,#newButton,#openProjectButton,#importButton,#openMolButton,#smilesImportButton,#atomChargeSelect,#deleteSelectionButton,#polymerButton,#editPolymerButton,#buildPolymerButton').forEach(el=>el.disabled=busy);
    $('cancelButton').classList.toggle('hidden',!busy);$('calculateButton').classList.toggle('hidden',busy);$('cancelButton').disabled=false;
    $('cancelButton').lastChild.textContent=placing?'配置を取り消す':'計算を中止';$('cancelButton').querySelector('.spinner').classList.toggle('hidden',placing);
    updateControls();render();emit('busy',{busy,kind});
  }
  function updateControls() {
    for(const id of ['polymerButton','editPolymerButton','buildPolymerButton'])$(id).disabled=!state.ready||state.busy;
    const overLimit=state.molecule.polymer?.total_atoms>(state.engine?.maxQuantumAtoms||600);
    const usable=state.ready&&!state.busy&&state.molecule.atoms.length>0&&!overLimit;
    $('runEstimate').lastElementChild.textContent=overLimit?'計算上限を超えています。重合度を小さくしてください。':state.molecule.polymer?'有限鎖を計算 · 長い鎖は時間がかかります':'小さな分子からお試しください';
    $('calculateButton').disabled=!usable;$('prepareButton').disabled=!usable;$('prepareModelButton').disabled=!usable;$('undoButton').disabled=state.busy||!state.undo.length;$('redoButton').disabled=state.busy||!state.redo.length;
  }
  async function importSmiles(smiles,name) {
    if(state.busy)return;if(!smiles.trim())throw new Error('SMILESを入力してください。');
    setBusy(true,'import');$('statusMessage').textContent='分子を読み込み中…';
    try{const data=await native('importSmiles',{smiles:smiles.trim()});loadMolecule(data.molecule,name||data.formula||'読み込んだ分子',data);if(data.atoms3d?.length)state.prepared=data;$('statusMessage').textContent='構造を読み込みました';render();saveLocal();return data;}
    finally{setBusy(false);}
  }
  async function openFile() {
    if(state.busy)return;
    try{
      const file=await native('openFile');if(!file||file.cancelled||!file.text)return;
      if(/\.json$/i.test(file.name)){restoreProject(JSON.parse(file.text),true);render();renderResults();}
      else{setBusy(true,'import');const data=await native('importMol',{molblock:file.text});loadMolecule(data.molecule,file.name.replace(/\.[^.]+$/,''),data);if(data.atoms3d?.length)state.prepared=data;render();saveLocal();}
      $('importDialog').close();
    }catch(error){reportError(error);}finally{setBusy(false);}
  }
  async function prepare() {
    if(state.busy||!state.molecule.atoms.length)return;
    setBusy(true,'prepare');$('statusMessage').textContent='水素を補い、初期3D構造を生成中…';
    try{const data=await native('prepare',{molecule:clone(state.molecule),settings:validateSettings()});applyPrepared(data);setTab('model');$('statusMessage').textContent='力場による初期3D構造を生成しました';}
    catch(error){reportError(error);}finally{setBusy(false);}
  }
  async function calculate() {
    if(state.busy||!state.molecule.atoms.length)return;
    let input;try{input={molecule:clone(state.molecule),settings:validateSettings()};}catch(error){reportError(error);return;}
    state.result=null;state.input=null;state.log='';renderResults();setBusy(true,'calculate');$('resultStatus').textContent='計算中';$('resultStatus').className='result-status running';$('statusMessage').textContent=`${input.settings.method}計算を実行中…`;$('runNote').textContent='SCF計算中。分子と設定は計算終了まで固定されます。';
    $('resultPlaceholder').querySelector('h3').textContent='分子の電子状態を計算しています。';$('resultPlaceholder').querySelector('p').textContent='進行状況はログで確認できます。初回や大きな分子では時間がかかります。';
    try{
      const result=await native('calculate',input);applyResult(result,input);
      $('statusMessage').textContent=result.converged?(['optimize','frequency'].includes(result.task)&&!result.geometry_converged?'構造最適化が未収束です':'計算が完了しました'):'SCFが収束しませんでした';
      render();renderResults();renderHistory();saveLocal();toast(result.converged?'計算が完了しました。収束状態と結果を確認してください。':'SCF未収束です。ログと計算条件を確認してください。',!result.converged);
    }catch(error){state.result=null;renderResults();$('resultStatus').textContent=/cancel|中止|キャンセル/i.test(error.message)?'中止':'エラー';$('resultStatus').className='result-status warning';reportError(error);saveLocal();}
    finally{setBusy(false);$('runNote').textContent='計算はこのMacのCPUで実行されます。';}
  }
  async function cancel() {
    if(!state.busy)return;if(state.gesture?.kind==='placement'){const g=state.gesture;g.cancelled=true;clearPlacement(g);if(!g.loading)return;}$('cancelButton').disabled=true;$('statusMessage').textContent='計算を中止しています…';
    try{await native('cancel');}catch(error){reportError(error);$('cancelButton').disabled=false;}
  }
  function formatNumber(value,digits=3) {return Number.isFinite(value)?value.toFixed(digits):'—';}
  function renderResults() {
    const r=state.result;$('resultCards').classList.toggle('hidden',!r);$('resultPlaceholder').classList.toggle('hidden',!!r);$('resultWarnings').classList.add('hidden');
    $('resultStatus').className='result-status';$('resultStatus').textContent='計算前';
    $('resultPlaceholder').querySelector('h3').textContent='分子のエネルギーを、ここに。';$('resultPlaceholder').querySelector('p').textContent='構造と条件を確認し、右側の計算実行ボタンを押してください。';
    if(r){
      const converged=r.converged&&(!['optimize','frequency'].includes(r.task)||r.geometry_converged);$('resultStatus').textContent=converged?'収束済':r.converged?'構造未収束':'SCF未収束';$('resultStatus').classList.add(converged?'success':'warning');
      $('energyValue').textContent=formatNumber(r.energy_hartree,8);$('resultMethod').textContent=`${r.method} / ${r.basis}${r.formalism?' · '+r.formalism:''} · ${['optimize','frequency'].includes(r.task)?'構造最適化':'1点計算'} · ${r.environment?.label||'真空'}${r.environment?.dispersion==='d3bj2b'?' · D3(BJ)':''}`;
      const orbitals=Array.isArray(r.orbitals)?r.orbitals:[];
      $('gapValue').textContent=orbitals.length>1?orbitals.map(o=>`${o.spin==='beta'?'β':'α'} ${formatNumber(o.gap_ev,2)}`).join(' / '):formatNumber(orbitals[0]?.gap_ev,3);
      $('gapValue').style.fontSize=orbitals.length>1?'12px':'';
      $('orbitalValues').textContent=orbitals.map(o=>`${orbitals.length>1?(o.spin==='beta'?'β ':'α '):''}H ${formatNumber(o.homo_ev,2)} / L ${formatNumber(o.lumo_ev,2)} eV`).join(' · ');
      const dipole=Array.isArray(r.dipole_debye)?Math.hypot(...r.dipole_debye):null;$('dipoleValue').textContent=formatNumber(dipole,3);
      $('resultTiming').textContent=`${formatNumber(r.elapsed_seconds,1)} 秒${Number.isFinite(r.scf_cycles)?` · SCF ${r.scf_cycles} 回`:''}`;
      const warnings=[...(r.warnings||[])];if(!r.converged)warnings.unshift('SCFが収束していません。この値を収束済みの結果として扱わないでください。');if(['optimize','frequency'].includes(r.task)&&!r.geometry_converged)warnings.unshift('構造最適化が収束していません。表示しているのは最後の試行構造です。');
      if(warnings.length){$('resultWarnings').textContent=warnings.join(' ');$('resultWarnings').classList.remove('hidden');}
    }
    renderVibrations(r);updateLog();
  }
  function renderVibrations(result) {
    let area=$('vibrationResults');if(!area){area=document.createElement('details');area.id='vibrationResults';$('resultWarnings').before(area);}
    area.replaceChildren();area.classList.toggle('hidden',!result?.vibrations);if(!result?.vibrations){window.MoleculeVibrations?.mount(area,null);return;}
    const v=result.vibrations,summary=document.createElement('summary');summary.textContent=`振動解析 · ${v.frequencies_cm1.length} モード · 虚振動 ${v.imaginary_count} 個`;area.append(summary);
    const note=document.createElement('p');note.textContent=v.note+(v.zpe_hartree===null?'':` ZPE = ${v.zpe_hartree.toFixed(8)} Hartree`);area.append(note);
    const table=document.createElement('table');const head=document.createElement('tr');for(const text of ['モード','振動数 / cm⁻¹','換算質量 / u']){const th=document.createElement('th');th.textContent=text;head.append(th);}table.append(head);
    v.frequencies_cm1.forEach((frequency,i)=>{const row=document.createElement('tr');for(const text of [i+1,frequency<0?`${Math.abs(frequency).toFixed(2)} i`:frequency.toFixed(2),v.reduced_masses_amu[i].toFixed(3)]){const td=document.createElement('td');td.textContent=text;row.append(td);}table.append(row);});area.append(table);window.MoleculeVibrations?.mount(area,result);
  }
  function updateLog() {$('logContent').textContent=state.log||'計算を開始すると、PySCFの実行ログが表示されます。';$('logContent').scrollTop=$('logContent').scrollHeight;}
  window.onNativeLog=text=>{state.log=(state.log+String(text)).slice(-120000);updateLog();};
  function renderHistory() {
    const panel=$('historyPanel');panel.replaceChildren();$('historyCount').textContent=state.history.length;
    if(!state.history.length){const empty=document.createElement('div');empty.className='history-empty';empty.innerHTML='<i data-icon="history"></i><span>計算の記録は、ここに。<br>計算を実行すると構造・条件・結果を保存します。</span>';panel.append(empty);icons(empty);return;}
    const info=document.createElement('p');info.className='history-info';info.textContent='直近8件の計算を保存しています。「開く」で、その計算の入力構造・条件・結果を復元します。';panel.append(info);
    for(const item of state.history){
      const card=document.createElement('div');card.className='history-card';const icon=document.createElement('div');icon.className='history-card-symbol';icon.innerHTML='<i data-icon="hexagon"></i>';
      const text=document.createElement('div');const h=document.createElement('h3');h.textContent=item.name;const p=document.createElement('p');p.textContent=`${item.result.method} / ${item.result.basis} · ${new Date(item.date).toLocaleString('ja-JP')}`;text.append(h,p);
      const energy=document.createElement('div');energy.className='history-energy';const value=document.createElement('strong');value.textContent=`${formatNumber(item.result.energy_hartree,6)} Eh`;const status=document.createElement('small');status.textContent=item.result.converged&&(!['optimize','frequency'].includes(item.result.task)||item.result.geometry_converged)?'収束済':'未収束';energy.append(value,status);
      const open=document.createElement('button');open.textContent='開く';open.disabled=state.busy;open.onclick=()=>{if(state.busy)return;pushUndo();state.molecule=validMolecule(item.molecule);state.name=item.name;state.result=clone(item.result);state.input={molecule:clone(item.molecule),settings:clone(item.settings),...(item.geometry?{geometry:clone(item.geometry)}:{})};state.prepared=null;state.info={formula:item.result.formula,smiles:item.result.smiles};state.log=item.log||'';state.selected=null;state.selectedIds=[];state.collapsed=false;$('moleculeName').value=state.name;setSettings(item.settings);setTab('structure');fit();renderResults();saveLocal();emit('change',{kind:'history'});emit('result',{result:state.result,input:state.input});};
      card.append(icon,text,energy,open);panel.append(card);icons(card);
    }
  }
  function modelData() {return state.result?.atoms3d?.length?state.result:state.prepared?.atoms3d?.length?state.prepared:null;}
  function draw3D() {
    const data=modelData();$('modelEmpty').classList.toggle('hidden',state.tab!=='model'||!!data);$('modelLegend').classList.toggle('hidden',state.tab!=='model'||!data);
    if(state.tab!=='model'||!data)return;
    $('geometryLabel').textContent=['optimize','frequency'].includes(state.result?.task)?(state.result.geometry_converged?'量子化学最適化構造':'最適化の最終試行構造（未収束）'):'力場で生成した初期構造';
    const canvas=$('modelCanvas'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;if(!rect.width||!rect.height)return;
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,rect.width,rect.height);
    const baseAtoms=data.atoms3d,atoms=window.MoleculeVibrations?.atoms(data)||baseAtoms,center={x:0,y:0,z:0};baseAtoms.forEach(a=>{center.x+=a.x/baseAtoms.length;center.y+=a.y/baseAtoms.length;center.z+=a.z/baseAtoms.length;});
    const radius=Math.max(1,...baseAtoms.map(a=>Math.hypot(a.x-center.x,a.y-center.y,a.z-center.z)));const scale=Math.min((rect.width-110)/(radius*2+2),(rect.height-105)/(radius*2+2))*state.modelZoom;
    const cx=Math.cos(state.modelRotation.x),sx=Math.sin(state.modelRotation.x),cy=Math.cos(state.modelRotation.y),sy=Math.sin(state.modelRotation.y);
    const points=atoms.map(a=>{let x=a.x-center.x,y=a.y-center.y,z=a.z-center.z;const rx=x*cy+z*sy,rz=-x*sy+z*cy,ry=y*cx-rz*sx,zz=y*sx+rz*cx;return{x:rect.width/2+state.modelPan.x+rx*scale,y:rect.height/2+state.modelPan.y-ry*scale,z:zz,element:a.element};});
    const objects=[];(data.bonds3d||[]).forEach(b=>{if(points[b.a]&&points[b.b])objects.push({kind:'bond',a:points[b.a],b:points[b.b],z:(points[b.a].z+points[b.b].z)/2,order:b.order});});points.forEach(p=>objects.push({kind:'atom',...p}));objects.sort((a,b)=>a.z-b.z);
    const colors={H:'#f2f3e9',C:'#668072',N:'#7598ca',O:'#d88773',S:'#d7bd61',P:'#d29c68',F:'#9cb77f',Cl:'#9cb77f',Br:'#b88765',I:'#a597bc'};
    for(const item of objects){
      if(item.kind==='bond') {const gradient=ctx.createLinearGradient(item.a.x,item.a.y,item.b.x,item.b.y);gradient.addColorStop(0,colors[item.a.element]||'#97a889');gradient.addColorStop(1,colors[item.b.element]||'#97a889');ctx.strokeStyle=gradient;ctx.lineWidth=Math.max(3,scale*.13);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(item.a.x,item.a.y);ctx.lineTo(item.b.x,item.b.y);ctx.stroke();}
      else {const r=Math.max(3,(item.element==='H'?.2:.32)*scale);const gradient=ctx.createRadialGradient(item.x-r*.32,item.y-r*.36,r*.05,item.x,item.y,r);gradient.addColorStop(0,item.element==='H'?'#ffffff':'#e1e8d7');gradient.addColorStop(.42,colors[item.element]||'#b4c19f');gradient.addColorStop(1,item.element==='H'?'#bec9b6':'#536a50');ctx.fillStyle=gradient;ctx.shadowColor='#34452a14';ctx.shadowBlur=5;ctx.shadowOffsetY=2;ctx.beginPath();ctx.arc(item.x,item.y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#556d461f';ctx.lineWidth=.6;ctx.stroke();}
    }
  }
  $('modelCanvas').addEventListener('pointerdown',event=>{modelDrag={x:event.clientX,y:event.clientY,pan:event.button===2,offset:{...state.modelPan},rotation:{...state.modelRotation}};$('modelCanvas').setPointerCapture(event.pointerId);});
  $('modelCanvas').addEventListener('pointermove',event=>{if(!modelDrag)return;if(modelDrag.pan){state.modelPan={x:modelDrag.offset.x+event.clientX-modelDrag.x,y:modelDrag.offset.y+event.clientY-modelDrag.y};draw3D();return;}state.modelRotation={x:modelDrag.rotation.x+(event.clientY-modelDrag.y)*.01,y:modelDrag.rotation.y+(event.clientX-modelDrag.x)*.01};draw3D();});
  $('modelCanvas').addEventListener('pointerup',()=>modelDrag=null);$('modelCanvas').addEventListener('pointercancel',()=>modelDrag=null);$('modelCanvas').addEventListener('contextmenu',event=>event.preventDefault());$('modelCanvas').addEventListener('wheel',event=>{event.preventDefault();if(event.ctrlKey){zoomAt(Math.exp(-event.deltaY*.01),event.clientX,event.clientY,true);return;}const unit=event.deltaMode===1?16:event.deltaMode===2?$('modelCanvas').clientHeight:1;state.modelPan.x-=(event.shiftKey?event.deltaY:event.deltaX)*unit;state.modelPan.y-=(event.shiftKey?0:event.deltaY)*unit;draw3D();},{passive:false});
  function molfile() {
    const m=state.molecule;if(!m.atoms.length)throw new Error('書き出す構造がありません。');if(m.atoms.length>999||m.bonds.length>999)throw new Error('MOL V2000の上限を超えています。');
    // Imported stereochemistry is retained in an unchanged connection table.
    if(m.molblock)return m.molblock;
    const pad=(value,len)=>String(value).padStart(len,' ');const lines=[state.name,'  MoleculeDFT  2D','',`${pad(m.atoms.length,3)}${pad(m.bonds.length,3)}  0  0  0  0            999 V2000`];
    m.atoms.forEach(a=>lines.push(`${pad((a.x/56*1.5).toFixed(4),10)}${pad((-a.y/56*1.5).toFixed(4),10)}    0.0000 ${a.element.padEnd(3,' ')} 0  0  0  0  0  0  0  0  0  0  0  0`));
    m.bonds.forEach(b=>lines.push(`${pad(m.atoms.findIndex(a=>a.id===b.a)+1,3)}${pad(m.atoms.findIndex(a=>a.id===b.b)+1,3)}${pad(b.order,3)}${pad(b.stereo==='up'?1:b.stereo==='down'?6:0,3)}  0  0  0`));
    const charges=m.atoms.map((a,i)=>({index:i+1,charge:a.charge||0})).filter(a=>a.charge);for(let i=0;i<charges.length;i+=8){const batch=charges.slice(i,i+8);lines.push(`M  CHG${pad(batch.length,3)}${batch.map(c=>` ${pad(c.index,3)} ${pad(c.charge,3)}`).join('')}`);}lines.push('M  END');return lines.join('\n')+'\n';
  }
  async function exportFile(kind) {
    $('exportMenu').classList.add('hidden');try{
      let text,extension;const name=(state.name||'molecule').replace(/[\/:*?"<>|]/g,'_');
      if(kind==='project'){text=JSON.stringify(projectData(),null,2);extension='json';}
      else if(kind==='mol'){text=molfile();extension='mol';}
      else if(kind==='xyz'){const data=modelData();if(!data?.xyz)throw new Error('3D座標を生成するか、DFT計算を実行してください。');text=data.xyz;extension='xyz';}
      else{if(!state.result)throw new Error('書き出す計算結果がありません。');text=JSON.stringify({schema:'MoleculeDFT.result',version:1,name:state.name,input:state.input,result:state.result,log:state.log},null,2);extension='results.json';}
      const response=await native('saveFile',{name:`${name}.${extension}`,text});if(response?.saved)toast('ファイルを書き出しました。');
    }catch(error){reportError(error);}
  }
  function addHistory(result,input,{name=state.name,log=state.log}={}) {
    const entry={id:nextId('calculation'),name,date:new Date().toISOString(),molecule:clone(input.molecule),settings:clone(input.settings),result:clone(result),log};
    if(input.geometry)entry.geometry=clone(input.geometry);
    state.history.unshift(entry);state.history=state.history.slice(0,8);renderHistory();return entry;
  }
  function applyResult(result,input,{name,log,history=true}={}) {
    state.result=clone(result);state.input=clone(input);state.prepared=null;
    if(log!==undefined)state.log=String(log);if(name!==undefined){state.name=name;$('moleculeName').value=name;}
    state.info={...state.info,formula:result.formula,smiles:result.smiles,...(Number.isFinite(result.mass)?{mass:result.mass}:{})};
    if(history)addHistory(result,input,{name:state.name,log:state.log});
    render();renderResults();saveLocal();emit('result',{result:state.result,input:state.input});
  }
  function applyPrepared(data) {
    state.prepared=clone(data);state.info={...state.info,...data};state.result=null;state.input=null;render();renderResults();saveLocal();emit('prepared',{prepared:state.prepared});
  }
  function drawStereoBond(layer,a,b,stereo,cutA=0,cutB=0,color='#455c45') {
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const start={x:a.x+ux*cutA,y:a.y+uy*cutA},end={x:b.x-ux*cutB,y:b.y-uy*cutB};
    if(stereo==='up')layer.append(svgElement('polygon',{points:`${start.x},${start.y} ${end.x-uy*6},${end.y+ux*6} ${end.x+uy*6},${end.y-ux*6}`,fill:color}));
    else for(let i=1;i<=8;i++){const t=i/8,x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t;layer.append(svgElement('line',{x1:x-uy*6*t,y1:y+ux*6*t,x2:x+uy*6*t,y2:y-ux*6*t,stroke:color,'stroke-width':1.3}));}
  }
  function valenceIssue(atom) {
    const order=state.molecule.bonds.reduce((sum,b)=>sum+(b.a===atom.id||b.b===atom.id?b.order:0),0);
    const maximum={H:1,B:atom.charge<0?4:3,C:4,N:atom.charge>0?4:3,O:atom.charge>0?3:atom.charge<0?1:2,F:1,Si:4,P:5,S:6,Cl:1,Br:1,I:1}[atom.element];
    return maximum!==undefined&&order>maximum?`${atom.element} の結合次数合計 ${order} が ${maximum} を超えています。`:null;
  }
  function updateEditorStatus() {
    if(!$('editorSelectionStatus'))return;
    const count=state.selectedIds.length||Number(!!state.selected),issues=state.molecule.atoms.filter(valenceIssue);
    $('editorSelectionStatus').textContent=count?`${count} 選択`:'範囲選択できます';
    $('editorValenceStatus').textContent=issues.length?`結合過多 ${issues.length} 原子`:'';
    $('editorValenceStatus').classList.toggle('hidden',!issues.length);
    for(const id of ['editorDuplicate','editorRotateLeft','editorRotateRight'])$(id).disabled=state.busy||state.collapsed||!count;
    $('selectionRepeat').disabled=state.busy||state.collapsed||!count;$('marqueeButton').disabled=state.busy||state.collapsed;
    $('editorCopy').disabled=state.busy||!count;$('editorCut').disabled=state.busy||!count;$('editorPaste').disabled=state.busy;
    $('cleanStructure').disabled=state.busy||!state.ready||!state.molecule.atoms.length;
    $('checkDrawing').disabled=state.busy||!state.ready||!state.molecule.atoms.length;
    $('toggleRepeat').classList.toggle('hidden',!state.molecule.polymer);$('toggleRepeat').textContent=state.collapsed?'全鎖表示':'繰り返し単位で表示';
    $('repeatEditUnit').classList.toggle('hidden',!state.collapsed||!state.molecule.polymer?.unit);
    $$('[data-editor-tool],#templateSelect,#fiveRing,#templateToggle,#templateMenuButton').forEach(el=>{el.disabled=state.busy||state.collapsed;});
    $$('[data-editor-tool]').forEach(el=>el.classList.toggle('active',el.dataset.editorTool===state.tool));
  }
  function selectedFragment() {
    const ids=new Set(state.selectedIds);if(state.selected?.kind==='atom')ids.add(state.selected.id);else if(state.selected?.kind==='bond'){const b=bondById(state.selected.id);if(b){ids.add(b.a);ids.add(b.b);}}
    if(!ids.size)throw new Error('コピーする原子をクリックするか、ドラッグで範囲を選択してください。');
    if(ids.size===state.molecule.atoms.length)return clone(state.molecule);
    return {atoms:clone(state.molecule.atoms.filter(a=>ids.has(a.id))),bonds:clone(state.molecule.bonds.filter(b=>ids.has(b.a)&&ids.has(b.b)))};
  }
  async function fragmentPNG(fragment) {
    const atoms=fragment.atoms,map=new Map(atoms.map(a=>[a.id,a]));
    const label=a=>a.element==='C'&&!a.charge&&fragment.bonds.some(b=>b.a===a.id||b.b===a.id)?'':a.element;
    const minX=Math.min(...atoms.map(a=>a.x))-35,minY=Math.min(...atoms.map(a=>a.y))-35;
    const width=Math.max(...atoms.map(a=>a.x))-minX+35,height=Math.max(...atoms.map(a=>a.y))-minY+35;
    const scale=Math.min(3,4096/Math.max(width,height));
    const drawing=svgElement('svg',{xmlns:'http://www.w3.org/2000/svg',viewBox:`${minX} ${minY} ${width} ${height}`,width:Math.ceil(width*scale),height:Math.ceil(height*scale)});
    for(const bond of fragment.bonds){
      const a=map.get(bond.a),b=map.get(bond.b);if(!a||!b)continue;
      const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,cutA=label(a)?12:0,cutB=label(b)?12:0;
      if(bond.order===1&&bond.stereo)drawStereoBond(drawing,a,b,bond.stereo,cutA,cutB);
      else for(const shift of bond.order===3?[-5,0,5]:bond.order===2?[-3,3]:[0])drawing.append(svgElement('line',{x1:a.x+ux*cutA-uy*shift,y1:a.y+uy*cutA+ux*shift,x2:b.x-ux*cutB-uy*shift,y2:b.y-uy*cutB+ux*shift,stroke:'#25382d','stroke-width':1.6,'stroke-linecap':'round'}));
    }
    for(const atom of atoms){
      if(label(atom)){const t=svgElement('text',{x:atom.x,y:atom.y+5,'text-anchor':'middle','font-family':'Arial, sans-serif','font-size':16,fill:'#25382d'});t.textContent=label(atom);drawing.append(t);}
      if(atom.charge){const t=svgElement('text',{x:atom.x+11,y:atom.y-8,'font-family':'Arial, sans-serif','font-size':10,fill:'#25382d'});t.textContent=`${Math.abs(atom.charge)===1?'':Math.abs(atom.charge)}${atom.charge>0?'+':'−'}`;drawing.append(t);}
    }
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(drawing)],{type:'image/svg+xml'}));
    try {
      const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('構造式画像を生成できませんでした。'));image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);canvas.getContext('2d').drawImage(image,0,0);
      return canvas.toDataURL('image/png').split(',')[1];
    } finally {URL.revokeObjectURL(url);}
  }
  async function copySelection() {
    if(state.busy||state.collapsed)return;
    const fragment=selectedFragment(),text=JSON.stringify({schema:'MoleculeDFT.fragment',version:1,molecule:fragment});
    const png=await fragmentPNG(fragment);
    const result=await native('writeClipboard',{text,png});
    if(!result.copied)throw new Error('クリップボードにコピーできませんでした。');
    clipboardFragment=fragment;
    toast(`${fragment.atoms.length} 原子をコピーしました。アプリ内には構造、他のアプリには画像として貼り付けできます。`);
  }
  async function cutSelection() {if(state.busy||state.collapsed)return;const before=JSON.stringify(state.molecule);await copySelection();if(before===JSON.stringify(state.molecule))deleteSelected();}
  async function pasteSelection(textOverride=null) {
    if(state.busy||state.collapsed)return;
    let text=textOverride;
    if(text===null){try{text=(await native('readClipboard')).text;}catch(error){try{text=await navigator.clipboard.readText();}catch(ignored){text=null;}}}
    let fragment=null;
    if(text?.trim()){
      try{const data=JSON.parse(text);if(data.schema==='MoleculeDFT.fragment'||data.schema==='MoleculeDFT.project')fragment=validMolecule(data.molecule);}catch(error){}
      if(!fragment){setBusy(true,'import');try{const data=await native(/V2000|V3000/.test(text)?'importMol':'importSmiles',/V2000|V3000/.test(text)?{molblock:text}:{smiles:text.trim()});fragment=data.molecule;}finally{setBusy(false);}}
    } else if(text===null)fragment=clipboardFragment;
    if(!fragment)throw new Error('クリップボードに構造がありません。SMILES・MOL・アプリ内の構造を貼り付けできます。');
    appendFragment(fragment,{x:state.center.x+45,y:state.center.y+35});toast(`${fragment.atoms.length} 原子を貼り付けました。`);
  }
  function appendFragment(fragment,p,anchorId=null) {
    const graph=validMolecule(fragment);if(state.molecule.atoms.length+graph.atoms.length>2000)throw new Error('描画は2000原子までです。');
    if(!graph.atoms.length)return;
    pushUndo();const anchor=atomById(anchorId),base=anchor?graph.atoms[0]:{x:graph.atoms.reduce((s,a)=>s+a.x,0)/graph.atoms.length,y:graph.atoms.reduce((s,a)=>s+a.y,0)/graph.atoms.length};
    const target=anchor?endpoint(anchor,{x:anchor.x+80,y:anchor.y-46}):p,mapping=new Map();
    for(const original of graph.atoms){const a={...original,id:nextId('a'),x:original.x-base.x+target.x,y:original.y-base.y+target.y};delete a.cip;mapping.set(original.id,a.id);state.molecule.atoms.push(a);}
    for(const original of graph.bonds)state.molecule.bonds.push({...original,id:nextId('b'),a:mapping.get(original.a),b:mapping.get(original.b)});
    if(anchor)addBond(anchor,atomById(mapping.get(graph.atoms[0].id)),1);
    state.selectedIds=[...mapping.values()];state.selected=null;state.collapsed=false;changed();setTool('select');
  }
  function selectAll() {if(state.busy||state.collapsed)return;state.selectedIds=state.molecule.atoms.map(a=>a.id);state.selected=null;setTool('select');render();}
  const TEMPLATES=[
    ['cyclopropyl','三員環','C1CC1'],['cyclobutyl','四員環','C1CCC1'],['cycloheptyl','七員環','C1CCCCCC1'],['cyclooctyl','八員環','C1CCCCCCC1'],['phenyl','ベンゼン環','c1ccccc1'],['cyclopentyl','五員環','C1CCCC1'],['cyclohexyl','六員環','C1CCCCC1'],
    ['cyclopentene','シクロペンテン','C1=CCCC1'],['cyclohexene','シクロヘキセン','C1=CCCCC1'],['naphthalene','ナフタレン','c1ccc2ccccc2c1'],
    ['pyridine','ピリジン','c1ccncc1'],['pyrrole','ピロール','c1cc[nH]c1'],['furan','フラン','c1ccoc1'],['thiophene','チオフェン','c1ccsc1'],['thf','テトラヒドロフラン','C1CCOC1'],['piperidine','ピペリジン','C1CCNCC1'],['morpholine','モルホリン','C1COCCN1'],
    ['vinyl','ビニル −CH=CH₂','C=C'],['ethynyl','エチニル −C≡CH','C#C'],['acetyl','アセチル −C(=O)CH₃','C(=O)C'],['aldehyde','アルデヒド −CHO','C=O'],['cf3','トリフルオロメチル −CF₃','C(F)(F)F'],['sulfone','スルホン −S(=O)₂CH₃','S(=O)(=O)C'],
    ['ester','エステル −C(=O)OCH₃','C(=O)OC'],['amide','アミド −C(=O)NH₂','C(=O)N'],['carboxyl','カルボキシ −COOH','C(=O)O'],
    ['nitrile','ニトリル −C≡N','C#N'],['methoxy','メトキシ −OCH₃','OC'],['hydroxyl','ヒドロキシ −OH','O'],['amine','アミノ −NH₂','N']
  ];
  const RING_TEMPLATES=new Set(['cyclopropyl','cyclobutyl','cyclopentyl','cyclohexyl','cycloheptyl','cyclooctyl','cyclopentene','cyclohexene','phenyl','naphthalene','pyridine','pyrrole','furan','thiophene','thf','piperidine','morpholine']);
  async function insertTemplate(id,p={x:state.center.x,y:state.center.y},anchorId=null) {
    if(state.busy)return;const template=TEMPLATES.find(t=>t[0]===id);if(!template)throw new Error('テンプレートを選んでください。');
    $('templateSelect').value=id;setTool('template');
    const g=newPlacement(p,atomById(anchorId),RING_TEMPLATES.has(id),template[1]);g.loading=true;state.gesture=g;setBusy(true,'placement');
    try{g.graph=await templateGraph(template);g.loading=false;if(!g.cancelled)commitPlacement(g);}finally{g.loading=false;clearPlacement(g);}
  }
  async function clean2D() {
    if(state.busy||!state.molecule.atoms.length)return;setBusy(true,'clean');
    try{const data=await native('clean2D',{molecule:clone(state.molecule)});pushUndo();state.molecule=validMolecule(data.molecule);state.info={...state.info,formula:data.formula||state.info.formula,smiles:data.smiles||state.info.smiles};state.selected=null;state.selectedIds=[];state.collapsed=false;fit();render();saveLocal();emit('change',{kind:'layout'});toast('結合長・角度・立体表示を整えました。');}catch(error){reportError(error);}finally{setBusy(false);}
  }
  async function checkStructure() {
    if(state.busy||!state.molecule.atoms.length)return;setBusy(true,'check');
    try{const data=await native('checkStructure',{molecule:clone(state.molecule),settings:validateSettings()});for(const a of state.molecule.atoms)delete a.cip;for(const item of data.stereo||[]){const atom=atomById(item.atom_id);if(atom)atom.cip=item.cip;}
      if(data.formula)state.info.formula=data.formula;render();saveLocal();const note=(data.warnings||[]).join(' ');toast(note||'結合・電荷・スピンを確認しました。指定済みの立体配置は R/S で表示します。');emit('checked',data);return data;
    }catch(error){reportError(error);}finally{setBusy(false);}
  }
  function typeElement(key) {
    const now=Date.now(),candidate=(now-typingTime<700?typingBuffer:'')+key;
    const match=ELEMENTS.find(e=>e.toLowerCase()===candidate),single=ELEMENTS.find(e=>e.toLowerCase()===key);
    typingBuffer=match||ELEMENTS.some(e=>e.toLowerCase().startsWith(candidate))?candidate:key;typingTime=now;
    const element=match||single;if(!element)return;
    if(state.hoverAtom){state.selected={kind:'atom',id:state.hoverAtom};state.selectedIds=[state.hoverAtom];}
    chooseElement(element);render();
  }
  function showAtomEditor(id) {const atom=atomById(id);if(!atom)return;$('atomEditInput').value=atom.element;$('atomEditDialog').dataset.atomId=id;$('atomEditError').textContent='';$('atomEditDialog').showModal();setTimeout(()=>{$('atomEditInput').focus();$('atomEditInput').select();},20);}
  async function previewRepeat() {
    if(state.busy)return;
    const target=$('repeatPreviewResult');target.textContent='接続を確認中…';$('previewRepeat').disabled=true;setBusy(true,'repeat-preview');
    try{
      const data=await native('buildPolymer',{...(window.MoleculeDFTProduct?.polymerPayload?.()||{}),source:'drawing',architecture:'homopolymer',degree:2,molecule:clone(polymerUnit),head:$('polymerHead').value,tail:$('polymerTail').value});
      const graph=data.molecule,atoms=graph.atoms,x=atoms.map(a=>a.x),y=atoms.map(a=>a.y),minX=Math.min(...x),minY=Math.min(...y);
      const drawing=svgElement('svg',{viewBox:`${minX-24} ${minY-24} ${Math.max(80,Math.max(...x)-minX+48)} ${Math.max(80,Math.max(...y)-minY+48)}`,role:'img','aria-label':'2単位を実際に接続した構造'});
      const byId=new Map(atoms.map(a=>[a.id,a]));
      for(const b of graph.bonds){const a=byId.get(b.a),c=byId.get(b.b),dx=c.x-a.x,dy=c.y-a.y,length=Math.hypot(dx,dy)||1;for(const shift of b.order===3?[-4,0,4]:b.order===2?[-2.5,2.5]:[0])drawing.append(svgElement('line',{x1:a.x-dy/length*shift,y1:a.y+dx/length*shift,x2:c.x-dy/length*shift,y2:c.y+dx/length*shift,stroke:'#416a51','stroke-width':1.5}));}
      for(const a of atoms)if(a.element!=='C'){drawing.append(svgElement('circle',{cx:a.x,cy:a.y,r:9,fill:'#f4f8f0'}));const label=svgElement('text',{x:a.x,y:a.y+4,'font-size':12,'text-anchor':'middle',fill:COLORS[a.element]||'#416a51'});label.textContent=a.element;drawing.append(label);}
      const caption=document.createElement('p');caption.textContent=`接続できました · 2単位 · ${data.formula||data.prepared?.formula||graph.polymer?.formula||''}（結合を確認する模式図）`;target.replaceChildren(caption,drawing);target.scrollIntoView({block:'nearest'});
    }catch(error){target.textContent='接続できません：'+(error.message||String(error));}
    finally{setBusy(false);$('previewRepeat').disabled=false;}
  }
  function renderPolymerUnit() {
    $('repeatPreviewResult')?.replaceChildren();if($('repeatConnectionStatus'))$('repeatConnectionStatus').textContent=`接続：この単位の B → 次の単位の A（水素を置換）` ;const preview=$('polymerUnitPreview');preview.replaceChildren();const atoms=polymerUnit?.atoms||[];if(!atoms.length)return;
    const minX=Math.min(...atoms.map(a=>a.x)),maxX=Math.max(...atoms.map(a=>a.x)),minY=Math.min(...atoms.map(a=>a.y)),maxY=Math.max(...atoms.map(a=>a.y));
    preview.setAttribute('viewBox',`${minX-45} ${minY-45} ${Math.max(110,maxX-minX+90)} ${Math.max(100,maxY-minY+90)}`);
    for(const b of polymerUnit.bonds){const a=atoms.find(x=>x.id===b.a),c=atoms.find(x=>x.id===b.b);if(!a||!c)continue;const dx=c.x-a.x,dy=c.y-a.y,len=Math.hypot(dx,dy)||1;for(const shift of b.order===3?[-5,0,5]:b.order===2?[-3,3]:[0])preview.append(svgElement('line',{x1:a.x-dy/len*shift,y1:a.y+dx/len*shift,x2:c.x-dy/len*shift,y2:c.y+dx/len*shift,stroke:'#799083','stroke-width':2}));}
    atoms.forEach((a,i)=>{const head=a.id===$('polymerHead').value,tail=a.id===$('polymerTail').value;const group=svgElement('g',{'data-polymer-atom':a.id,class:a.element==='H'?'polymer-hydrogen':'polymer-attachment-target',role:'button',tabindex:a.element==='H'?-1:0,'aria-label':`${i+1} ${a.element} を接続点に指定`});group.append(svgElement('circle',{cx:a.x,cy:a.y,r:17,fill:head?'#d6eadd':tail?'#e3e4f2':'#f8fbf8',stroke:head?'#498868':tail?'#777cb0':'#cadace','stroke-width':head||tail?2.5:1}));const text=svgElement('text',{x:a.x,y:a.y+4,'text-anchor':'middle','font-size':10,fill:'#264e42'});text.textContent=`${i+1}:${a.element}`;group.append(text);if(head||tail){const mark=svgElement('text',{x:a.x,y:a.y-23,'text-anchor':'middle','font-size':12,'font-weight':700,fill:head?'#3a775a':'#666aa1'});mark.textContent=head&&tail?'A/B':head?'A':'B';group.append(mark);}preview.append(group);});
  }
  function toggleRepeat() {if(!state.molecule.polymer||state.busy)return;state.collapsed=!state.collapsed;state.selected=null;state.selectedIds=[];render();fit();}
  function renderCollapsed() {
    const layer=$('repeatLayer');if(!layer)return;layer.replaceChildren();$('bondLayer').classList.toggle('hidden',state.collapsed);$('atomLayer').classList.toggle('hidden',state.collapsed);
    if(!state.collapsed||!state.molecule.polymer)return;
    const polymer=state.molecule.polymer,unit=polymer.unit;if(!unit?.atoms?.length)return;
    if(polymer.architecture&&polymer.architecture!=='homopolymer'){
      const center=unit.atoms.reduce((p,a)=>({x:p.x+a.x/unit.atoms.length,y:p.y+a.y/unit.atoms.length}),{x:0,y:0});
      const title=svgElement('text',{x:center.x,y:center.y-15,'text-anchor':'middle','font-size':22,fill:'#35654f'});
      title.textContent=polymer.architecture==='block'?`[ ${polymer.preset.toUpperCase()} ]${polymer.degreeA} — [ ${polymer.sourceB.toUpperCase()} ]${polymer.degreeB}`:`[ ${polymer.preset.toUpperCase()} / ${polymer.sourceB.toUpperCase()} ] · ${polymer.degree}単位`;
      const note=svgElement('text',{x:center.x,y:center.y+18,'text-anchor':'middle','font-size':10,fill:'#65816d'});note.textContent=`${polymer.termination} · ${polymer.architecture==='random'?'保存した乱数配列':'ブロック配列'} · ${polymer.total_atoms}原子`;
      layer.append(title,note);return;
    }
    const atoms=unit.atoms,minX=Math.min(...atoms.map(a=>a.x)),maxX=Math.max(...atoms.map(a=>a.x)),minY=Math.min(...atoms.map(a=>a.y)),maxY=Math.max(...atoms.map(a=>a.y));
    for(const b of unit.bonds){const a=atoms.find(x=>x.id===b.a),c=atoms.find(x=>x.id===b.b);if(!a||!c)continue;const dx=c.x-a.x,dy=c.y-a.y,len=Math.hypot(dx,dy)||1;for(const offset of b.order===2?[-3,3]:b.order===3?[-5,0,5]:[0])layer.append(svgElement('line',{x1:a.x-dy/len*offset,y1:a.y+dx/len*offset,x2:c.x-dy/len*offset,y2:c.y+dx/len*offset,stroke:'#455c45','stroke-width':1.6}));}
    for(const a of atoms)if(a.element!=='C'){layer.append(svgElement('circle',{cx:a.x,cy:a.y,r:11,fill:'#fcfdf9'}));const t=svgElement('text',{x:a.x,y:a.y+5,'text-anchor':'middle','font-size':16,fill:COLORS[a.element]||'#455c45'});t.textContent=a.element;layer.append(t);}
    for(const side of [-1,1]){const x=side<0?minX-28:maxX+28,y=minY-30,h=maxY-minY+60;layer.append(svgElement('path',{d:`M ${x-side*12} ${y} H ${x} V ${y+h} H ${x-side*12}`,fill:'none',stroke:'#44765c','stroke-width':2}));}
    const degree=svgElement('text',{x:maxX+35,y:maxY+35,'font-size':17,fill:'#44765c'});degree.textContent=String(polymer.degree||'n');layer.append(degree);
    const note=svgElement('text',{x:(minX+maxX)/2,y:maxY+75,'text-anchor':'middle','font-size':11,fill:'#78916e'});note.textContent=`${polymer.termination} 終端 · 計算は展開した ${polymer.total_atoms} 原子`;
    if(polymer.architecture&&polymer.architecture!=='homopolymer'&&polymer.architecture!=='homo'){degree.textContent='A';note.textContent=`${polymer.name} / 配列は高分子設定で確認 · 計算は全鎖`;}layer.append(note);
  }
  function installEditorUI() {
    const endpointFields=$('polymerAttachment').querySelector('.polymer-fields');const numberPicker=document.createElement('details');numberPicker.className='repeat-number-picker';const numberSummary=document.createElement('summary');numberSummary.textContent='番号で接続点を選ぶ';endpointFields.before(numberPicker);numberPicker.append(numberSummary,endpointFields);
    const link=document.createElement('link');link.rel='stylesheet';link.href='editor-v2.css';document.head.append(link);
    const bar=document.createElement('div');bar.id='editorActions';bar.className='editor-actions';bar.innerHTML=`<div class="editor-action-group"><button data-tool="select" id="marqueeButton" title="空白からドラッグで範囲選択 (V)。描画中はShift + ドラッグ">囲んで選択</button><button id="selectionRepeat" title="選択した部分だけを繰り返し単位に指定">選択部を単位に</button><button id="editorCopy" title="選択範囲をコピー (⌘C)">コピー</button><button id="editorDuplicate" title="選択範囲を複製 (⌘D)">複製</button><button id="editorRotateLeft" title="選択範囲を左へ30°回転 ([)" aria-label="左へ30度回転">↶30°</button><button id="editorRotateRight" title="選択範囲を右へ30°回転 (])" aria-label="右へ30度回転">↷30°</button><button id="editorCut" title="切り取り (⌘X)">切取</button><button id="editorPaste" title="SMILES・MOLも貼り付けできます (⌘V)">貼付</button><button id="cleanStructure" title="結合長と角度を自動で整形">自動整形</button></div><div class="editor-action-group"><button data-editor-tool="chain" title="ドラッグで連続炭素鎖 (L)">鎖 ∿</button><button data-editor-tool="wedge" title="実線くさび：始点の中心原子から手前への結合">くさび ▲</button><button data-editor-tool="dash" title="破線くさび：始点の中心原子から奥への結合">破線 ⋰</button><button id="fiveRing" title="五員環を配置">五員環 ⬟</button><select id="templateSelect" aria-label="官能基・環のテンプレート"><option value="">テンプレート</option></select></div><div class="editor-action-group editor-action-end"><span id="editorSelectionStatus"></span><button id="checkDrawing">構造チェック</button><span id="editorValenceStatus" class="hidden"></span></div>`;
    $('drawingToolbar').after(bar);const ringGroup=document.querySelector('[data-tool="benzene"]').parentElement;ringGroup.append($('fiveRing'),$('templateSelect'));$('fiveRing').className='tool ring-five';const fiveIcon=svgElement('svg',{viewBox:'0 0 24 24',width:22,height:22,'aria-hidden':'true'});fiveIcon.append(svgElement('polygon',{points:'12,2 22,9 18,21 6,21 2,9',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linejoin':'round'}));$('fiveRing').replaceChildren(fiveIcon);$('fiveRing').setAttribute('aria-label','五員環');const pan=document.createElement('button');pan.id='panTool';pan.dataset.tool='pan';pan.className='tool pan-tool';pan.textContent='移動';pan.title='表示移動 (G) / 右ドラッグ / Space + ドラッグ';pan.setAttribute('aria-label','描画エリアをドラッグで移動');pan.onclick=()=>toggleTool('pan');document.querySelector('[data-tool="select"]').parentElement.append(pan);const hud=document.createElement('div');hud.id='placementAngle';hud.className='placement-angle hidden';hud.setAttribute('role','status');$('canvasArea').append(hud);$('marqueeButton').onclick=()=>toggleTool('select');$('selectionRepeat').onclick=()=>showPolymer(false,true);for(const t of TEMPLATES){const option=document.createElement('option');option.value=t[0];option.textContent=t[1];$('templateSelect').append(option);}
    const picker=document.createElement('span');picker.className='template-picker';picker.innerHTML='<button id="templateToggle" title="選択中の原子団を再度押すと解除" aria-pressed="false">テンプレート</button><button id="templateMenuButton" aria-label="原子団・環を選ぶ" aria-expanded="false" aria-controls="templateMenu">▾</button>';$('templateSelect').after(picker);$('templateSelect').classList.add('hidden');
    const menu=document.createElement('div');menu.id='templateMenu';menu.className='template-menu hidden';menu.setAttribute('role','menu');document.body.append(menu);
    const closeMenu=()=>{menu.classList.add('hidden');$('templateMenuButton').setAttribute('aria-expanded','false');};
    const openMenu=()=>{if(state.busy)return;if(!menu.classList.contains('hidden')){closeMenu();return;}menu.replaceChildren();for(const [id,label] of TEMPLATES){const button=document.createElement('button');button.textContent=label;button.dataset.template=id;button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(state.tool==='template'&&$('templateSelect').value===id));button.onclick=()=>{toggleTemplate(id);closeMenu();$('templateToggle').focus();};menu.append(button);}const rect=picker.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(innerWidth-238,rect.left))}px`;menu.style.top=`${rect.bottom+5}px`;menu.style.maxHeight=`${Math.max(100,innerHeight-rect.bottom-20)}px`;menu.classList.remove('hidden');$('templateMenuButton').setAttribute('aria-expanded','true');(menu.querySelector('[aria-checked="true"]')||menu.querySelector('button')).focus();};
    $('templateToggle').onclick=()=>{if($('templateSelect').value)toggleTemplate($('templateSelect').value);else openMenu();};$('templateMenuButton').onclick=openMenu;
    document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!picker.contains(event.target))closeMenu();});window.addEventListener('blur',closeMenu);window.addEventListener('resize',closeMenu);
    menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);if(event.key==='Escape'){event.stopPropagation();closeMenu();$('templateMenuButton').focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1)+items.length)%items.length;items[next].focus();}});
    $('editorDuplicate').onclick=duplicateSelection;$('editorRotateLeft').onclick=()=>transformSelection(-30);$('editorRotateRight').onclick=()=>transformSelection(30);
    $('editorCopy').onclick=()=>copySelection().catch(reportError);$('editorCut').onclick=()=>cutSelection().catch(reportError);$('editorPaste').onclick=()=>pasteSelection().catch(reportError);$('cleanStructure').onclick=clean2D;$('checkDrawing').onclick=checkStructure;
    $$('[data-editor-tool]').forEach(button=>button.onclick=()=>{if(!state.busy){toggleTool(button.dataset.editorTool);updateEditorStatus();}});$('fiveRing').onclick=()=>toggleTemplate('cyclopentyl');$('templateSelect').onchange=()=>{if($('templateSelect').value)setTool('template');updateEditorStatus();};
    const repeat=svgElement('g',{id:'repeatLayer'});svg.insertBefore(repeat,$('previewLayer'));
    const toggle=document.createElement('button');toggle.id='toggleRepeat';toggle.textContent='繰り返し単位で表示';toggle.onclick=toggleRepeat;$('polymerBanner').insertBefore(toggle,$('editPolymerButton'));
    const editUnit=document.createElement('button');editUnit.id='repeatEditUnit';editUnit.textContent='単位を編集';editUnit.className='hidden';editUnit.onclick=()=>{const poly=state.molecule.polymer;if(poly?.unit)loadMolecule(poly.unit,`${poly.name} の繰り返し単位`,{});};$('polymerBanner').append(editUnit);
    const attach=document.createElement('div');attach.className='attachment-picker';attach.innerHTML='<span>① A → ② B の順にクリック</span><button id="pickHead" class="active" aria-pressed="true">接続点 A</button><button id="pickTail" aria-pressed="false">接続点 B</button>'; $('polymerUnitPreview').before(attach);const origin=document.createElement('p');origin.id='repeatUnitOrigin';origin.className='dialog-copy';attach.before(origin);const verify=document.createElement('div');verify.innerHTML='<div class="attachment-picker"><button id="swapAttachments">A / Bを交換</button><button id="previewRepeat">2単位の接続を確認</button></div><p id="repeatConnectionStatus" role="status"></p><div id="repeatPreviewResult" aria-live="polite"></div>';$('polymerAttachment').append(verify);$('swapAttachments').onclick=()=>{const a=$('polymerHead').value;$('polymerHead').value=$('polymerTail').value;$('polymerTail').value=a;renderPolymerUnit();};$('previewRepeat').onclick=previewRepeat;
    let endpoint='head';const pick=which=>{endpoint=which;$('pickHead').classList.toggle('active',which==='head');$('pickTail').classList.toggle('active',which==='tail');$('pickHead').setAttribute('aria-pressed',which==='head');$('pickTail').setAttribute('aria-pressed',which==='tail');};$('pickHead').onclick=()=>pick('head');$('pickTail').onclick=()=>pick('tail');
    const chooseAttachment=target=>{const id=target.closest('[data-polymer-atom]')?.dataset.polymerAtom;if(!id||polymerUnit?.atoms.find(a=>a.id===id)?.element==='H')return;$(endpoint==='head'?'polymerHead':'polymerTail').value=id;renderPolymerUnit();pick(endpoint==='head'?'tail':'head');};
    $('polymerUnitPreview').addEventListener('click',event=>chooseAttachment(event.target));$('polymerUnitPreview').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();chooseAttachment(event.target);}});$('polymerHead').addEventListener('change',renderPolymerUnit);$('polymerTail').addEventListener('change',renderPolymerUnit);
    const dialog=document.createElement('dialog');dialog.id='atomEditDialog';dialog.className='atom-edit-dialog';dialog.innerHTML='<form method="dialog"><h2>原子を変更</h2><p>元素記号を入力してください。例：C、O、Cl、Br、Si</p><input id="atomEditInput" aria-label="元素記号" maxlength="2" autocomplete="off"><p id="atomEditError" class="inline-error"></p><div class="dialog-actions"><button value="cancel" class="button quiet">キャンセル</button><button id="applyAtomEdit" class="button primary" value="apply">変更する</button></div></form>';document.body.append(dialog);
    dialog.querySelector('form').addEventListener('submit',event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();const value=$('atomEditInput').value.trim(),element=ELEMENTS.find(e=>e.toLowerCase()===value.toLowerCase());if(!element){$('atomEditError').textContent='対応する元素記号を入力してください。';return;}const atom=atomById(dialog.dataset.atomId);if(atom){pushUndo();atom.element=element;changed();}dialog.close();});
    const help=document.createElement('div');help.innerHTML='<h3>描画・選択を速く</h3><p>空白から囲んで範囲選択、Shiftクリックで追加します。選択範囲はまとめて移動・削除・⌘C／⌘X／⌘V。⌘Aで全選択。鎖ツール（L）はドラッグの長さで炭素鎖を描きます。原子上で C → l と続けて入力すると Cl に変更。ダブルクリックでも元素を入力できます。環・原子団は押したまま回転し、離して確定。原子団は根元から接続し、配置後も同じツールで続けて置けます。環の辺を近づけると2原子を共有し、青い2点で表示します。Bで結合ツールに戻ります。「自動整形」で重なりと角度を整えます。</p><h3>立体配置・高分子</h3><p>くさびの細い側が中心原子です。くさびツールで同じ結合を再度クリックすると向きを反転します。「構造チェック」で R/S を確認。赤い点線は描画中の結合過多の目安です。高分子は繰り返し単位表示と全鎖表示を切り替え、接続点 A/B は図上で選べます。</p>';document.querySelector('.help-content')?.append(help);
  }

  function showImport() {if(state.busy)return;$('importError').classList.add('hidden');$('importDialog').showModal();setTimeout(()=>$('smilesInput').focus(),50);}
  const exampleNames={water:'水',ethanol:'エタノール',benzene:'ベンゼン',aspirin:'アスピリン'};
  const exampleSmiles={water:'O',ethanol:'CCO',benzene:'c1ccccc1',aspirin:'CC(=O)Oc1ccccc1C(=O)O'};
  $$('.example').forEach(button=>button.onclick=async()=>{try{await importSmiles(exampleSmiles[button.dataset.example],exampleNames[button.dataset.example]);button.classList.add('active');}catch(error){reportError(error);}});
  $$('[data-tool]').forEach(el=>el.onclick=()=>{toggleTool(el.dataset.tool);});$$('[data-order]').forEach(el=>el.onclick=()=>{if(!state.busy){if(state.tool==='bond'&&state.order===Number(el.dataset.order))setTool('idle');else chooseOrder(Number(el.dataset.order));}});$$('[data-element]').forEach(el=>el.onclick=()=>{if(state.busy)return;if(state.tool==='atom'&&state.element===el.dataset.element)setTool('idle');else chooseElement(el.dataset.element);});
  $('polymerButton').onclick=()=>showPolymer();$('editPolymerButton').onclick=()=>showPolymer(true);$('polymerSource').onchange=polymerOptions;$('polymerDegree').oninput=polymerOptions;$('buildPolymerButton').onclick=buildPolymer;
  $('polymerDialog').addEventListener('change',()=>$('repeatPreviewResult').replaceChildren());
  $('elementSelect').onchange=event=>{const element=event.target.value;if(!element||state.busy)return;if(state.tool==='atom'&&state.element===element)setTool('idle');else chooseElement(element);event.target.value='';};$('atomChargeSelect').onchange=event=>{const a=atomById(state.selected?.id);if(a){pushUndo();a.charge=Number(event.target.value);changed();}};
  $('deleteSelectionButton').onclick=deleteSelected;$('undoButton').onclick=undo;$('redoButton').onclick=redo;$('newButton').onclick=newMolecule;
  $$('[data-tab]').forEach(el=>el.onclick=()=>setTab(el.dataset.tab));$('workspaceButton').onclick=()=>setTab('structure');$('zoomInButton').onclick=()=>zoom(1.2);$('zoomOutButton').onclick=()=>zoom(1/1.2);$('fitButton').onclick=fit;
  $('importButton').onclick=showImport;$('emptyImportButton').onclick=showImport;$('openProjectButton').onclick=openFile;$('openMolButton').onclick=openFile;
  $('smilesImportButton').onclick=async()=>{try{$('importError').classList.add('hidden');await importSmiles($('smilesInput').value);$('importDialog').close();}catch(error){$('importError').textContent=error.message;$('importError').classList.remove('hidden');}};
  $$('[data-smiles]').forEach(el=>el.onclick=()=>{$('smilesInput').value=el.dataset.smiles;$('smilesInput').focus();});
  $('helpButton').onclick=()=>$('helpDialog').showModal();$$('[data-close-dialog]').forEach(el=>el.onclick=()=>$(el.dataset.closeDialog).close());
  $('prepareButton').onclick=()=>{if(modelData())setTab('model');else prepare();};$('prepareModelButton').onclick=prepare;$('calculateButton').onclick=calculate;$('cancelButton').onclick=cancel;$('viewResultModel').onclick=()=>setTab('model');
  $('moleculeName').oninput=event=>{state.name=event.target.value;saveLocal();emit('change',{kind:'name'});};
  Object.values(settingsIds).forEach(id=>$(id).addEventListener('change',()=>{if(state.result){state.result=null;state.input=null;renderResults();draw3D();toast('計算条件を変更しました。再計算すると結果を更新します。');}settingDescriptions();saveLocal();emit('change',{kind:'settings'});}));
  $('exportButton').onclick=event=>{event.stopPropagation();$('exportMenu').classList.toggle('hidden');};$$('[data-export]').forEach(el=>el.onclick=()=>exportFile(el.dataset.export));document.addEventListener('click',event=>{if(!event.target.closest('.export-wrap'))$('exportMenu').classList.add('hidden');});
  $$('[data-result-tab]').forEach(el=>el.onclick=()=>{$$('[data-result-tab]').forEach(x=>x.classList.toggle('active',x===el));$('resultSummary').classList.toggle('hidden',el.dataset.resultTab!=='summary');$('resultLog').classList.toggle('hidden',el.dataset.resultTab!=='log');updateLog();});
  $('copyLogButton').onclick=async()=>{try{await navigator.clipboard.writeText(state.log);toast('ログをコピーしました。');}catch(error){await native('saveFile',{name:'calculation.log',text:state.log}).catch(reportError);}};
  document.addEventListener('keydown',event=>{
    const editing=/INPUT|SELECT|TEXTAREA/.test(event.target.tagName);const command=event.metaKey||event.ctrlKey;
    if(command&&event.key==='Enter'){event.preventDefault();calculate();return;}
    if(command&&event.key.toLowerCase()==='s'){event.preventDefault();exportFile('project');return;}
    if(editing||document.querySelector('dialog[open]'))return;
    if(state.gesture?.kind==='placement'){if(event.key==='Escape'){event.preventDefault();state.gesture.cancelled=true;clearPlacement(state.gesture);}return;}
    if(event.code==='Space'){event.preventDefault();state.space=true;svg.style.cursor='grab';return;}
    if(state.busy)return;
    if(command&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return;}
    if(command&&event.key.toLowerCase()==='o'){event.preventDefault();openFile();return;}
    if(command&&event.key.toLowerCase()==='n'){event.preventDefault();newMolecule();return;}
    if(command&&event.key.toLowerCase()==='a'){event.preventDefault();selectAll();return;}
    if(command&&['c','x','v'].includes(event.key.toLowerCase())){event.preventDefault();({c:copySelection,x:cutSelection,v:pasteSelection})[event.key.toLowerCase()]().catch(reportError);return;}
    if(command&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateSelection();return;}
    if(command)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const step=event.shiftKey?10:1;transformSelection(0,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0);return;}
    if(event.key==='['||event.key===']'){event.preventDefault();transformSelection(event.key==='['?-30:30);return;}
    const key=event.key.toLowerCase();if(key==='g')setTool('pan');else if(key==='v')setTool('select');else if(key==='b'&&!state.hoverAtom&&!state.selected&&typingBuffer!=='b')setTool('bond');else if(key==='e')setTool('erase');else if(key==='l'&&!(typingBuffer==='c'&&Date.now()-typingTime<700))setTool('chain');else if(['1','2','3'].includes(key))chooseOrder(Number(key));else if(/^[a-z]$/.test(key))typeElement(key);else if(key==='delete'||key==='backspace'){event.preventDefault();deleteSelected();}else if(key==='escape'){state.selected=null;state.selectedIds=[];state.collapsed=false;setTool('select');render();fit();}else if(key==='+'||key==='=')zoom(1.2);else if(key==='-')zoom(1/1.2);
  });
  document.addEventListener('keyup',event=>{if(event.code==='Space'){state.space=false;svg.style.cursor='';}});window.addEventListener('blur',()=>{state.space=false;svg.style.cursor='';});
  window.onNativeMenu=action=>{const actions={new:newMolecule,open:openFile,save:()=>exportFile('project'),undo,redo,calculate,copy:()=>copySelection().catch(reportError),cut:()=>cutSelection().catch(reportError),paste:()=>pasteSelection().catch(reportError),selectAll,help:()=>$('helpDialog').showModal()};actions[action]?.();};
  new ResizeObserver(()=>{resizeView();draw3D();}).observe($('canvasArea'));
  window.MoleculeDFT={redrawModel:draw3D,validateFragment:validMolecule,selectedFragment,insertLibraryFragment:fragment=>{if(state.busy)return;appendFragment(fragment,{...state.center});},showPolymerUnit:(unit,head,tail)=>{showPolymer(false,false,unit);if(head)$('polymerHead').value=head;if(tail)$('polymerTail').value=tail;renderPolymerUnit();},debugState:()=>clone({...state,gesture:null,settings:settings()}),loadMolecule,calculate,prepare,importSmiles,setTool,setTab,molfile,undo,redo,native,settings,validateSettings,setSettings,setBusy,applyResult,applyPrepared,addHistory,render,renderResults,saveLocal,reportError,toast,projectData,restoreProject,on,copySelection,cutSelection,pasteSelection,selectAll,templates:()=>clone(TEMPLATES),duplicateSelection,transformSelection,selectConnected,deleteSelected,clean2D,checkStructure,insertTemplate,chainPoints,selectAtoms:ids=>{state.selectedIds=ids.filter(id=>atomById(id));state.selected=state.selectedIds.length===1?{kind:'atom',id:state.selectedIds[0]}:null;render();},toggleRepeat,showPolymer,buildPolymer};
  try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)restoreProject(JSON.parse(saved));}catch(error){toast('前回の自動保存を読み込めませんでした。新しい作業を開始します。',true);}
  installEditorUI();settingDescriptions();render();renderResults();renderHistory();setTool('bond');requestAnimationFrame(fit);
  native('status').then(status=>{state.engine=status;state.ready=!!status.ready;const source=$('polymerSource');source.replaceChildren();for(const p of status.polymerPresets||[]){const option=document.createElement('option');option.value=p.id;option.textContent=`${p.name} / ${p.label}`;source.append(option);}const custom=document.createElement('option');custom.value='drawing';custom.textContent='今描いている構造を単位にする';source.append(custom);$('engineDot').className=`status-dot ${state.ready?'ready':'error'}`;$('engineStatus').textContent=state.ready?`PySCF ${status.versions?.pyscf||''} · ローカル実行`:status.message||`エンジン未準備: ${(status.missing||[]).join(', ')}`;if(!state.ready)$('statusMessage').textContent='READMEの初期設定を確認してください';updateControls();emit('ready',status);}).catch(error=>{state.ready=false;$('engineDot').classList.add('error');$('engineStatus').textContent='計算エンジン未接続';$('statusMessage').textContent='MoleculeDFT.appから起動してください';updateControls();});
})();
