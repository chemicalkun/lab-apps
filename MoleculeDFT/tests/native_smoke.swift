// Included only in the separate native test app by test-native.command.
#if DFT_NATIVE_TEST
private var dftSmokeStarted = false

extension MoleculeDFTDelegate {
    func runNativeSmoke() {
        guard !dftSmokeStarted else { return }
        dftSmokeStarted = true
        window.setContentSize(NSSize(width: 1420, height: 920))
        let script = #"""
        // A user switching applications must not cancel synthetic test gestures.
        // Keep synthetic blur events available for explicit cancellation tests.
        window.addEventListener('blur',event=>{if(event.isTrusted)event.stopImmediatePropagation();},true);
        const checks = [];
        const assert = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
        const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
        const until = async (predicate, description, timeout = 90000) => {
            const start = Date.now();
            while (!predicate()) {
                if (Date.now() - start > timeout) throw Error('Timeout: ' + description + '; status=' + document.getElementById('statusMessage')?.textContent);
                await pause(100);
            }
        };
        const $ = id => document.getElementById(id);
        await until(() => window.MoleculeDFT && /PySCF/.test($('engineStatus').textContent), 'engine ready');
        const state = () => window.MoleculeDFT.debugState();
        const graph = () => state().molecule;
        assert(document.documentElement.scrollWidth <= innerWidth + 1, '1420 px window has no horizontal overflow');
        assert(!document.querySelector('#elementSelect option[value="Fe"]'), 'unsupported transition-metal options are absent');
        window.confirm = () => true;

        // Check selection before the longer quantum chemistry checks.
        window.MoleculeDFT.loadMolecule({atoms:[0,1,2,3].map(i=>({id:'early'+i,element:'C',x:i*56,y:0,charge:0})),bonds:[0,1,2].map(i=>({id:'eb'+i,a:'early'+i,b:'early'+(i+1),order:1}))});
        const earlyCanvas=$('moleculeCanvas');
        const earlyPoint=(x,y)=>{const p=earlyCanvas.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(earlyCanvas.getScreenCTM());};
        const earlyA=earlyPoint(35,-24),earlyB=earlyPoint(133,24);
        for(const [type,p] of [['pointerdown',earlyA],['pointermove',earlyB],['pointerup',earlyB]])earlyCanvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1,shiftKey:true}));
        assert(state().selectedIds.length===2,'early Shift rectangle: '+JSON.stringify({ids:state().selectedIds,tool:state().tool,atoms:graph().atoms.length,a:{x:earlyA.x,y:earlyA.y},b:{x:earlyB.x,y:earlyB.y}}));
        const moveA=earlyPoint(56,0),moveB=earlyPoint(76,18);
        document.querySelector('[data-atom="early1"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:moveA.x,clientY:moveA.y,button:0,pointerId:1}));
        earlyCanvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:moveB.x,clientY:moveB.y,button:0,pointerId:1}));
        earlyCanvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:moveB.x,clientY:moveB.y,button:0,pointerId:1}));
        assert(graph().atoms.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y))&&graph().atoms[1].x>70&&graph().atoms[2].x>125&&graph().atoms[0].x===0,'pointer drag moves selected atoms together with finite coordinates');
        window.MoleculeDFT.undo();assert(graph().atoms[1].x===56&&graph().atoms[2].x===112,'undo restores the complete group drag');

        const ensureTool=tool=>{if(state().tool!==tool)document.querySelector('[data-tool="'+tool+'"]').click();};
        const ensureFive=()=>{if(state().tool!=='template'||$('templateSelect').value!=='cyclopentyl')$('fiveRing').click();};
        // v2.3 placement is a transaction: preview, rotate, then one undoable commit.
        const placementPointer=(type,x,y,extra={})=>{const p=earlyPoint(x,y);earlyCanvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1,...extra}));};
        const ringGroup=document.querySelector('[data-tool="benzene"]').parentElement;
        assert($('fiveRing').parentElement===ringGroup&&$('templateSelect').parentElement===ringGroup,'five-member ring and templates sit beside the aromatic ring');
        window.onNativeMenu('new');ensureTool('benzene');placementPointer('pointerdown',0,0);placementPointer('pointermove',90,2);
        assert(graph().atoms.length===0&&$('placementAngle').textContent.includes('水平'),'ring rotation is previewed with horizontal detection before committing');
        assert($('structureState').textContent==='配置中'&&$('cancelButton').textContent==='配置を取り消す','placement is labelled as drawing rather than a running calculation');
        placementPointer('pointerup',90,2);assert(graph().atoms.length===6&&graph().bonds.length===6&&!state().busy,'release commits the benzene ring once');
        assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C6H6','rotated aromatic ring retains valid bond orders');
        window.MoleculeDFT.undo();assert(graph().atoms.length===0,'ring placement is one undo step');
        ensureFive();placementPointer('pointerdown',0,0);placementPointer('pointermove',2,90);await until(()=>!$('placementAngle').textContent.includes('準備中'),'five ring preview ready');
        assert(graph().atoms.length===0&&$('placementAngle').textContent.includes('垂直'),'asynchronous template preview keeps vertical rotation');
        placementPointer('pointerup',2,90);await until(()=>!state().busy,'five ring placement');assert(graph().atoms.length===5&&$('statusMessage').textContent.includes('90.0'),'five-member ring commits at the displayed 90 degree angle');
        window.MoleculeDFT.undo();ensureFive();placementPointer('pointerdown',0,0);placementPointer('pointermove',70,70);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!state().busy,'placement cancel');assert(graph().atoms.length===0&&$('placementAngle').classList.contains('hidden'),'Escape cancels template placement without changing the molecule');
        ensureTool('ring');placementPointer('pointerdown',0,0);placementPointer('pointermove',90,3,{altKey:true});assert(!$('placementAngle').textContent.includes('水平'),'Option bypasses horizontal snapping');placementPointer('pointercancel',90,3);assert(graph().atoms.length===0&&!state().busy,'pointer cancellation discards ring preview');
        $('templateSelect').value='furan';$('templateSelect').dispatchEvent(new Event('change'));placementPointer('pointerdown',0,0);placementPointer('pointerup',70,70);await until(()=>!state().busy,'quick template release');assert(graph().atoms.length===5&&graph().atoms.some(a=>a.element==='O'),'release while template loads commits the correct graph');
        const originalPanGraph=JSON.stringify(graph()),originalPanCenter=state().center;const panPoint=earlyPoint(0,0);$('panTool').click();earlyCanvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:panPoint.x,clientY:panPoint.y,button:0,pointerId:1}));earlyCanvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:panPoint.x+55,clientY:panPoint.y+25,button:0,pointerId:1}));earlyCanvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:panPoint.x+55,clientY:panPoint.y+25,button:0,pointerId:1}));
        assert(state().center.x<originalPanCenter.x&&state().center.y<originalPanCenter.y&&JSON.stringify(graph())===originalPanGraph,'pan tool moves the view without modifying coordinates');
        window.MoleculeDFT.setTool('bond');const centerBeforeRight=state().center;const rp=earlyPoint(0,0);earlyCanvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:rp.x,clientY:rp.y,button:2,pointerId:1}));earlyCanvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rp.x+35,clientY:rp.y,button:2,pointerId:1}));earlyCanvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:rp.x+35,clientY:rp.y,button:2,pointerId:1}));assert(state().center.x<centerBeforeRight.x&&JSON.stringify(graph())===originalPanGraph,'right drag pans while the bond tool remains selected');

        // v2.4: anchored placement must keep its pivot, attachmentLengths and attachment chemistry.
        const placementAtomDown=atom=>{const p=earlyPoint(atom.x,atom.y);document.querySelector('[data-atom="'+atom.id+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));};
        const attachmentLengths=m=>m.bonds.map(b=>{const a=m.atoms.find(a=>a.id===b.a),c=m.atoms.find(a=>a.id===b.b);return Math.hypot(a.x-c.x,a.y-c.y);});
        window.onNativeMenu('new');await window.MoleculeDFT.insertTemplate('cyclopentyl',{x:130,y:-60});
        const parentRing=graph(),parentCenter={x:130,y:-60};
        for(const anchor of parentRing.atoms){
            window.MoleculeDFT.loadMolecule(parentRing,'spiro rings');ensureFive();placementAtomDown(anchor);
            await until(()=>$('previewLayer').querySelectorAll('[data-placement-bond]').length===5,'anchored ring preview');
            const preview=[...$('previewLayer').querySelectorAll('[data-placement-bond]')].map(line=>['x1','y1','x2','y2'].map(key=>Number(line.getAttribute(key))));
            assert(graph().atoms.length===5&&$('previewLayer').querySelector('[data-placement-anchor]').getAttribute('data-placement-anchor')===anchor.id,'ring preview highlights the existing attachment atom without changing the graph');
            placementPointer('pointerup',anchor.x,anchor.y);
            const attached=graph(),added=attached.atoms.slice(5),byId=new Map(attached.atoms.map(a=>[a.id,a]));
            assert(attached.atoms.length===9&&attached.bonds.length===10&&attached.bonds.filter(b=>b.a===anchor.id||b.b===anchor.id).length===4,'five-member rings share exactly one atom, with no extra connecting bond');
            assert(JSON.stringify(attached.atoms.slice(0,5))===JSON.stringify(parentRing.atoms)&&attachmentLengths(attached).every(l=>Math.abs(l-56)<.02),'attachment preserves the parent coordinates and every ring bond length');
            const dx=anchor.x-parentCenter.x,dy=anchor.y-parentCenter.y;
            assert(added.every(a=>(a.x-anchor.x)*dx+(a.y-anchor.y)*dy>0),'new ring grows outside the parent at every pentagon vertex');
            assert(attached.bonds.slice(5).every((b,i)=>{const a=byId.get(b.a),c=byId.get(b.b);return [a.x,a.y,c.x,c.y].every((n,j)=>Math.abs(n-preview[i][j])<1e-6);}),'committed ring is identical to the preview');
        }
        assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C9H16','shared five-member rings validate as spiro C9H16 through RDKit');
        const spiroGraph=graph();window.MoleculeDFT.undo();assert(graph().atoms.length===5,'one undo removes the attached ring');window.MoleculeDFT.redo();assert(JSON.stringify(graph())===JSON.stringify(spiroGraph),'redo restores the same spiro graph');
        window.MoleculeDFT.loadMolecule(parentRing,'rotate at atom');const ringAnchor=parentRing.atoms[2];ensureFive();placementAtomDown(ringAnchor);placementPointer('pointermove',ringAnchor.x+2,ringAnchor.y+90);await until(()=>$('previewLayer').querySelectorAll('[data-placement-bond]').length===5,'rotated anchor preview');placementPointer('pointerup',ringAnchor.x+2,ringAnchor.y+90);
        assert(graph().atoms.slice(5).every(a=>a.y>ringAnchor.y)&&attachmentLengths(graph()).every(l=>Math.abs(l-56)<.02)&&graph().atoms[2].x===ringAnchor.x&&graph().atoms[2].y===ringAnchor.y,'dragging an attached ring rotates around its fixed atom and extends along the indicated direction');
        window.MoleculeDFT.loadMolecule(parentRing,'six member attachment');ensureTool('ring');placementAtomDown(ringAnchor);placementPointer('pointerup',ringAnchor.x,ringAnchor.y);
        assert(graph().atoms.length===10&&attachmentLengths(graph()).every(l=>Math.abs(l-56)<.02),'dedicated six-member ring uses the same shared-atom placement');
        window.MoleculeDFT.loadMolecule(parentRing,'aromatic attachment');ensureTool('benzene');placementAtomDown(ringAnchor);placementPointer('pointerup',ringAnchor.x,ringAnchor.y);
        assert(graph().atoms.length===10&&graph().bonds.filter(b=>b.order===2).length===3&&!$('editorValenceStatus').classList.contains('hidden'),'aromatic attachment retains double bonds and visibly flags excessive valence');
        let aromaticError='';try{await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}});}catch(error){aromaticError=error.message;}
        assert(aromaticError.length>0,'chemically invalid aromatic spiro carbon cannot pass calculation validation');
        // Delayed functional-group load, released before import completes.
        window.MoleculeDFT.loadMolecule(parentRing,'functional group');$('templateSelect').value='methoxy';$('templateSelect').dispatchEvent(new Event('change'));placementAtomDown(ringAnchor);placementPointer('pointerup',ringAnchor.x,ringAnchor.y);await until(()=>!state().busy,'attached methoxy quick release');
        const methoxy=graph(),oxygen=methoxy.atoms[5],methyl=methoxy.atoms[6],parentToO={x:oxygen.x-ringAnchor.x,y:oxygen.y-ringAnchor.y};
        assert(methoxy.atoms.length===7&&oxygen.element==='O'&&methoxy.bonds.some(b=>(b.a===ringAnchor.id&&b.b===oxygen.id)||(b.b===ringAnchor.id&&b.a===oxygen.id)),'functional group connects from the clicked atom through its designated root atom');
        assert(attachmentLengths(methoxy).every(l=>Math.abs(l-56)<.02)&&(methyl.x-oxygen.x)*parentToO.x+(methyl.y-oxygen.y)*parentToO.y>0,'methoxy extends outward with normal bond attachmentLengths after asynchronous placement');
        assert((await window.nativeRequest('checkStructure',{molecule:methoxy,settings:{method:'HF'}})).formula==='C6H12O','attached methoxy group validates with the expected formula');
        // Every catalog item follows the same attachment rules through the public insertion path.
        for(const [id,label,smiles] of window.MoleculeDFT.templates()){
            const original={id:'catalogRoot',element:'C',x:147,y:-83,charge:0};window.MoleculeDFT.loadMolecule({atoms:[original],bonds:[]},label);
            await window.MoleculeDFT.insertTemplate(id,{x:0,y:0},original.id);
            const m=graph(),ring=/[1-9]/.test(smiles),degree=m.bonds.filter(b=>b.a===original.id||b.b===original.id).length;
            assert(JSON.stringify(m.atoms[0])===JSON.stringify(original)&&degree===(ring?2:1)&&attachmentLengths(m).every(l=>Math.abs(l-56)<.02)&&new Set(m.atoms.map(a=>a.id)).size===m.atoms.length,'catalog attachment preserves root, topology and attachmentLengths: '+id);
        }

        // v2.5: shared edges, persistent template tool, and a fixed group root.
        const fusedParent={atoms:[{id:'f0',element:'C',charge:0,x:0,y:0}],bonds:[]};
        for(let i=0;i<4;i++){const previous=fusedParent.atoms[i],angle=(90+i*72)*Math.PI/180;fusedParent.atoms.push({id:'f'+(i+1),element:'C',charge:0,x:previous.x+56*Math.cos(angle),y:previous.y+56*Math.sin(angle)});}
        for(let i=0;i<5;i++)fusedParent.bonds.push({id:'fb'+i,a:'f'+i,b:'f'+((i+1)%5),order:1});
        window.MoleculeDFT.loadMolecule(fusedParent,'fused pentagons');ensureFive();placementAtomDown(fusedParent.atoms[0]);placementPointer('pointermove',80,80);
        await until(()=>$('previewLayer').querySelector('[data-fusion-bond]'),'nearby edge snaps');
        assert($('previewLayer').querySelectorAll('[data-placement-anchor]').length===2&&$('placementAngle').textContent.includes('2原子共有'),'nearby ring vertices highlight both shared atoms and their bond');
        assert(!$('placementAngle').textContent.includes('離して配置')&&$('previewLayer').querySelectorAll('line:not([data-placement-bond]):not([data-fusion-bond]):not([data-placement-connection])').length===0,'preview has no direction line through the ring or large placement instruction');
        placementPointer('pointerup',80,80);
        assert(graph().atoms.length===8&&graph().bonds.length===9&&graph().bonds.filter(b=>(b.a==='f0'&&b.b==='f1')||(b.a==='f1'&&b.b==='f0')).length===1,'nearby pentagons commit eight atoms and one shared edge without duplicates');
        assert(graph().atoms.slice(0,5).every((a,i)=>a.x===fusedParent.atoms[i].x&&a.y===fusedParent.atoms[i].y)&&attachmentLengths(graph()).every(l=>Math.abs(l-56)<.02),'shared-edge snapping preserves the original ring and all bond lengths');
        assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C8H14','fused pentagons validate as C8H14');
        const fusedPentagons=graph();window.__nativeFusionScene=fusedPentagons;window.MoleculeDFT.undo();assert(graph().atoms.length===5,'one undo removes a fused ring');window.MoleculeDFT.redo();assert(JSON.stringify(graph())===JSON.stringify(fusedPentagons),'redo restores fused topology');
        window.MoleculeDFT.loadMolecule(fusedParent);ensureFive();placementAtomDown(fusedParent.atoms[0]);placementPointer('pointermove',80,80);placementPointer('pointermove',80,80,{altKey:true});
        assert(!$('previewLayer').querySelector('[data-fusion-bond]'),'Option temporarily disables shared-edge snapping');placementPointer('pointercancel',80,80);assert(graph().atoms.length===5,'cancelling snapped placement keeps the original molecule');
        const downOnBond=bond=>{const m=graph(),a=m.atoms.find(a=>a.id===bond.a),b=m.atoms.find(a=>a.id===bond.b),p=earlyPoint((a.x+b.x)/2,(a.y+b.y)/2);document.querySelector('[data-bond="'+bond.id+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
        ensureFive();let bondRelease=downOnBond(graph().bonds[0]);placementPointer('pointerup',bondRelease.x,bondRelease.y);await until(()=>!state().busy,'direct bond ring placement');
        assert(graph().atoms.length===8&&graph().bonds.length===9&&state().tool==='template'&&$('fiveRing').classList.contains('active'),'placing on a bond fuses the ring and keeps its tool selected');
        // Aromatic fusion must keep a valid Kekule graph on either bond order.
        window.onNativeMenu('new');ensureTool('benzene');placementPointer('pointerdown',0,0);placementPointer('pointerup',0,0);const aromaticParent=graph();
        for(const order of [1,2]){window.MoleculeDFT.loadMolecule(aromaticParent);window.MoleculeDFT.setTool('benzene');bondRelease=downOnBond(graph().bonds.find(b=>b.order===order));placementPointer('pointerup',bondRelease.x,bondRelease.y);assert(graph().atoms.length===10&&graph().bonds.length===11&&$('editorValenceStatus').classList.contains('hidden'),'aromatic fusion on bond order '+order+' avoids excessive valence');assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C10H8','aromatic fusion on bond order '+order+' validates as naphthalene');}
        // Separately drawn rings can also be moved onto a common edge.
        const movedSource={atoms:fusedPentagons.atoms.map((a,i)=>({...a,id:'m'+i,x:a.x+170,y:a.y+80})).filter((a,i)=>i===0||i===1||i>=5),bonds:fusedPentagons.bonds.slice(5).map((b,i)=>({...b,id:'mb'+i,a:'m'+fusedPentagons.atoms.findIndex(a=>a.id===b.a),b:'m'+fusedPentagons.atoms.findIndex(a=>a.id===b.b)}))};
        movedSource.bonds.push({id:'mshared',a:'m0',b:'m1',order:1});
        const separateRings={atoms:[...fusedParent.atoms,...movedSource.atoms],bonds:[...fusedParent.bonds,...movedSource.bonds]};
        window.MoleculeDFT.loadMolecule(separateRings);window.MoleculeDFT.selectAtoms(movedSource.atoms.map(a=>a.id));window.MoleculeDFT.setTool('select');placementAtomDown(movedSource.atoms[0]);placementPointer('pointermove',4,3);
        assert(graph().atoms.length===10&&$('previewLayer').querySelector('[data-fusion-bond]'),'moving a separate ring previews shared-edge snapping before merging atoms');placementPointer('pointerup',4,3);
        assert(graph().atoms.length===8&&graph().bonds.length===9&&(await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C8H14','moving rings together merges exactly two atoms and one bond');window.MoleculeDFT.undo();assert(JSON.stringify(graph())===JSON.stringify(separateRings),'undo restores both separate rings and their original coordinates');
        window.MoleculeDFT.selectAtoms(movedSource.atoms.map(a=>a.id));window.MoleculeDFT.setTool('select');placementAtomDown(movedSource.atoms[0]);placementPointer('pointermove',4,3);placementPointer('pointercancel',4,3);assert(JSON.stringify(graph())===JSON.stringify(separateRings),'pointer cancellation restores a dragged ring before fusion');
        window.onNativeMenu('new');$('templateSelect').value='nitrile';$('templateSelect').dispatchEvent(new Event('change'));placementPointer('pointerdown',70,-40);placementPointer('pointermove',70,50);await until(()=>!$('placementAngle').textContent.includes('準備中'),'nitrile held rotation');
        assert(graph().atoms.length===0&&$('previewLayer').querySelectorAll('[data-placement-bond]').length===3&&$('placementAngle').textContent.includes('垂直'),'holding a group rotates its preview before placing it');placementPointer('pointerup',70,50);
        assert(graph().atoms.length===2&&graph().atoms[0].element==='C'&&Math.abs(graph().atoms[0].x-70)<1&&Math.abs(graph().atoms[0].y+40)<1&&Math.abs(graph().atoms[1].x-70)<1&&graph().atoms[1].y>15,'a standalone group rotates around its clicked root atom');
        assert(state().tool==='template'&&$('templateSelect').value==='nitrile'&&$('templateSelect').classList.contains('active')&&!document.querySelector('.element.active'),'placed group remains selected without a misleading active element button');
        placementPointer('pointerdown',-90,0);placementPointer('pointerup',-90,0);await until(()=>!state().busy,'repeat group placement');assert(graph().atoms.length===4&&graph().bonds.length===2&&state().tool==='template','another group can be placed without selecting the template again');
        window.MoleculeDFT.loadMolecule(fusedParent);$('templateSelect').value='nitrile';$('templateSelect').dispatchEvent(new Event('change'));placementAtomDown(fusedParent.atoms[0]);placementPointer('pointermove',90,0);await until(()=>!$('placementAngle').textContent.includes('準備中'),'attached nitrile preview');placementPointer('pointerup',90,0);
        assert(graph().atoms[5].element==='C'&&Math.abs(graph().atoms[5].x-56)<.01&&graph().atoms[6].element==='N'&&Math.abs(graph().atoms[6].x-112)<.01&&state().tool==='template','attached groups rotate from the existing atom and remain selected');
        assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).formula==='C6H9N','attached nitrile retains correct connectivity and formula');

        // v2.6: active tools glow, toggle off, and leave a navigation-only canvas.
        window.onNativeMenu('new');const oxygenTool=document.querySelector('[data-element="O"]');oxygenTool.click();
        assert(state().tool==='atom'&&oxygenTool.getAttribute('aria-pressed')==='true'&&getComputedStyle(oxygenTool).boxShadow!=='none','selected element is visibly illuminated and exposes its selected state');
        oxygenTool.click();assert(state().tool==='idle'&&!oxygenTool.classList.contains('active'),'clicking the selected element again clears the drawing tool');
        const benzeneTool=document.querySelector('[data-tool="benzene"]');benzeneTool.click();benzeneTool.click();assert(state().tool==='idle'&&!benzeneTool.classList.contains('active'),'aromatic ring toggles off on a second click');
        $('fiveRing').click();$('fiveRing').click();assert(state().tool==='idle'&&!$('fiveRing').classList.contains('active'),'five-member ring toggles off on a second click');
        $('templateMenuButton').click();document.querySelector('#templateMenu [data-template="methoxy"]').click();assert(state().tool==='template'&&$('templateToggle').classList.contains('active'),'choosing a group from the picker illuminates the current group');
        $('templateMenuButton').click();document.querySelector('#templateMenu [data-template="methoxy"]').click();assert(state().tool==='idle'&&!$('templateToggle').classList.contains('active'),'choosing the same group from its menu clears selection');
        $('templateToggle').click();$('templateToggle').click();assert(state().tool==='idle','current group button also toggles selection without changing the group');
        $('elementSelect').value='Cl';$('elementSelect').dispatchEvent(new Event('change'));assert($('extraElement').textContent==='Cl'&&$('extraElement').classList.contains('active'),'extended element has its own illuminated toggle');$('elementSelect').value='Cl';$('elementSelect').dispatchEvent(new Event('change'));assert(state().tool==='idle','reselecting the same extended element also clears selection');
        window.MoleculeDFT.loadMolecule(fusedParent);window.MoleculeDFT.selectAtoms(['f0']);assert(document.querySelector('[data-atom="f0"] .selection-glow')&&getComputedStyle(document.querySelector('[data-atom="f0"] .selection-glow')).filter!=='none','selected canvas atom has a luminous halo');
        benzeneTool.click();benzeneTool.click();const idleGraph=JSON.stringify(graph()),idleCenter=state().center,panningAtom=graph().atoms[0];placementAtomDown(panningAtom);placementPointer('pointermove',panningAtom.x+35,panningAtom.y+20);placementPointer('pointerup',panningAtom.x+35,panningAtom.y+20);
        assert(JSON.stringify(graph())===idleGraph&&state().center.x!==idleCenter.x&&state().selectedIds.length===0,'dragging over an atom with no active tool pans the canvas without changing or selecting atoms');
        const idleView=state().center;placementPointer('pointerdown',180,100);placementPointer('pointermove',210,125);placementPointer('pointerup',210,125);assert(JSON.stringify(graph())===idleGraph&&state().center.x!==idleView.x,'blank-area dragging also pans in the deselected state');
        benzeneTool.click();assert(state().tool==='benzene'&&benzeneTool.classList.contains('active'),'a tool can be reactivated after panning');document.querySelector('[data-element="C"]').click();

        // Hover predicts the exact atom target without modifying the graph.
        const hoverGraph=JSON.stringify(graph()),hoverSelected=JSON.stringify(state().selectedIds);
        const hoverTarget=document.querySelector('[data-atom="f0"]');
        hoverTarget.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:500,clientY:400}));
        assert(hoverTarget.classList.contains('hovered')&&getComputedStyle(hoverTarget.querySelector('.hover-glow')).opacity!=='0','hover illuminates the atom before clicking');
        assert(JSON.stringify(graph())===hoverGraph&&JSON.stringify(state().selectedIds)===hoverSelected,'hover leaves molecule and selection unchanged');
        $('moleculeCanvas').dispatchEvent(new PointerEvent('pointerleave'));
        assert(!document.querySelector('.atom-target.hovered'),'leaving the canvas clears hover');
        window.MoleculeDFT.setTool('idle');hoverTarget.dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));assert(!document.querySelector('.atom-target.hovered'),'navigation mode does not suggest atom editing');
        window.MoleculeDFT.setTool('atom');
        const divider=$('resultsDivider'),resultPanel=$('resultsPanel'),originalHeight=resultPanel.getBoundingClientRect().height,originalCanvas=$('canvasArea').getBoundingClientRect().height;
        divider.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:77,button:0,clientY:400}));
        divider.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:77,clientY:450}));
        divider.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77,clientY:450}));await pause(50);
        assert(resultPanel.getBoundingClientRect().height<originalHeight&&$('canvasArea').getBoundingClientRect().height>originalCanvas,'dragging the divider down expands the drawing canvas');
        assert(JSON.stringify(graph())===hoverGraph,'resizing preserves the molecule');
        divider.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Home'}));assert(resultPanel.getBoundingClientRect().height===60,'divider can minimize results with a keyboard');
        divider.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'End'}));assert($('canvasArea').getBoundingClientRect().height>=220,'divider preserves minimum drawing space');
        divider.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await pause(50);assert(Math.abs(resultPanel.getBoundingClientRect().height-originalHeight)<2,'double click restores the standard result height');

        // Exercise the actual editor pointer handlers and undo/redo state.
        window.onNativeMenu('new');
        await pause(100);
        assert(state().tool==='bond','new drawing starts in bond extension mode');
        ensureTool('bond');
        const canvas = $('moleculeCanvas');
        const box = canvas.getBoundingClientRect();
        const cy = box.top + box.height / 2;
        const x0 = box.left + box.width / 2 - 38;
        const x1 = x0 + 76;
        const pointer = (type, x, buttons) => canvas.dispatchEvent(new PointerEvent(type, {bubbles:true, clientX:x, clientY:cy, button:0, buttons, pointerId:1, pointerType:'mouse', isPrimary:true}));
        pointer('pointerdown', x0, 1); pointer('pointermove', x1, 1); pointer('pointerup', x1, 0);
        assert(graph().atoms.length === 2 && graph().bonds.length === 1, 'drawing a bond creates two connected atoms');
        $('undoButton').click();
        assert(graph().atoms.length === 0, 'undo restores the empty drawing');
        $('redoButton').click();
        assert(graph().atoms.length === 2 && graph().bonds.length === 1, 'redo restores the bond');

        // Use the drawn ethane connection table as a custom repeat unit.
        $('polymerButton').click();
        $('polymerSource').value='drawing';$('polymerSource').dispatchEvent(new Event('change'));
        $('polymerDegree').value='5';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.degree===5,'custom repeat unit builder');
        assert(graph().atoms.length===10&&state().info.formula==='C10H22','drawn two-carbon unit produces hydrogen-capped n=5 chain');
        $('editPolymerButton').click();$('polymerDegree').value='2';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.degree===2,'edit repeat count');
        assert(graph().atoms.length===4,'changing n uses the original repeat unit, not the expanded chain');

        $('polymerButton').click();$('polymerSource').value='pe';$('polymerDegree').value='100';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.degree===100,'long PE drawing');
        assert(graph().polymer.total_atoms===602&&$('calculateButton').disabled,'over-limit chain remains drawable while calculation is disabled');
        const view=$('moleculeCanvas').viewBox.baseVal;
        assert(graph().atoms.every(a=>a.x>=view.x&&a.x<=view.x+view.width&&a.y>=view.y&&a.y<=view.y+view.height),'fit-to-view contains the whole long polymer chain');

        // Import through the visible controls, using real RDKit in the native worker.
        $('importButton').click();
        $('smilesInput').value = 'O';
        $('smilesImportButton').click();
        await until(() => !state().busy && state().prepared?.formula === 'H2O', 'SMILES import and explicit hydrogens');
        assert(graph().atoms.length === 1 && state().prepared.atoms3d.length === 3, 'water import adds two hydrogens to the 3D geometry');
        assert(!$('importDialog').open, 'successful import closes the dialog');

        // Validation errors must cross the real Swift promise bridge.
        let parityError = '';
        try { await window.nativeRequest('calculate', {molecule:graph(), settings:{multiplicity:2, threads:1}}); }
        catch (error) { parityError = error.message; }
        assert(/電子数|多重度/.test(parityError), 'invalid electron/spin parity rejects through the native bridge');

        $('prepareButton').click();
        await until(() => !state().busy && state().prepared?.atoms3d?.length === 3, '3D preparation');
        assert(!$('modelCanvas').classList.contains('hidden'), '3D preparation opens the model');
        $('methodSelect').value = 'B3LYP';
        $('basisSelect').value = 'sto-3g';
        $('taskSelect').value = 'single';
        $('chargeInput').value = '0';
        $('multiplicityInput').value = '1';
        $('threadsSelect').value = '1';
        for (const id of ['methodSelect','basisSelect','taskSelect','chargeInput','multiplicityInput','threadsSelect']) $(id).dispatchEvent(new Event('change',{bubbles:true}));
        $('calculateButton').click();
        await until(() => !state().busy && state().result?.converged, 'real water DFT calculation', 120000);
        const result = state().result;
        assert(result.energy_hartree < -74 && result.energy_hartree > -76, 'real B3LYP/STO-3G water energy is physically plausible');
        assert(result.formula === 'H2O' && result.electrons === 10, 'calculation retains water stoichiometry and electron count');
        assert(result.geometry_converged === null, 'single point is not marked as DFT geometry optimization');
        assert(result.orbitals[0].gap_ev > 0 && result.dipole_debye.length === 3, 'orbital and dipole results are finite and complete');
        assert(Math.abs(Number($('energyValue').textContent) - result.energy_hartree) < 0.00001, 'energy card shows the computed result');
        assert($('logContent').textContent.includes('SCF'), 'real PySCF logs reach the page');

        // Verify serialization from visible export actions; native file dialogs are manual.
        const exports = [];
        const request = window.nativeRequest;
        window.nativeRequest = (op,payload) => op === 'saveFile' ? (exports.push(payload), Promise.resolve({saved:true})) : request(op,payload);
        for (const kind of ['project','mol','xyz','result']) {
            document.querySelector('[data-export="'+kind+'"]').click();
            await pause(30);
        }
        window.nativeRequest = request;
        assert(exports.length === 4, 'project, MOL, XYZ and result serialization succeed');
        const savedProject = JSON.parse(exports[0].text);
        assert(savedProject.input.settings.method === 'B3LYP' && savedProject.result.energy_hartree === result.energy_hartree, 'project export retains input conditions and calculated energy');
        assert(exports[2].text.split('\n')[0] === '3', 'XYZ export includes both hydrogens');
        const molRoundtrip = await request('importMol', {molblock:exports[1].text});
        assert(molRoundtrip.formula === 'H2O', 'exported MOL round-trips through RDKit');
        const resultFile = JSON.parse(exports[3].text);
        assert(resultFile.log.includes('SCF') && resultFile.result.versions.pyscf, 'result export retains execution log and engine version');

        // Cancellation must terminate a real process and permit the next request.
        const cancelled = window.nativeRequest('calculate', {molecule:graph(), settings:{task:'optimize',threads:1,maxSteps:100}}).then(() => 'unexpected success', error => error.message);
        await pause(120);
        const cancelReply = await window.nativeRequest('cancel');
        const cancellationMessage=await cancelled;assert(cancelReply.cancelled === true && /中止/.test(cancellationMessage), 'native cancellation rejects the running calculation: '+cancellationMessage);
        const status = await window.nativeRequest('status');
        assert(status.ready === true, 'engine accepts a request after cancellation');
        // Create PE through its preset and calculate with genuine HF molecular orbitals.
        $('polymerButton').click();$('polymerSource').value='pe';$('polymerDegree').value='2';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.name==='PE','PE preset');
        assert(graph().polymer.total_atoms===14&&graph().polymer.termination==='H / H','PE reports finite-chain size and end groups');
        $('methodSelect').value='HF';$('methodSelect').dispatchEvent(new Event('change'));
        assert($('calculateButton').textContent.includes('HF'),'HF is identified on the run button');
        $('calculateButton').click();
        await until(()=>!state().busy&&state().result?.method==='HF','PE HF calculation',120000);
        assert(state().result.formalism==='RHF'&&state().result.polymer.degree===2,'HF result retains polymer provenance and RHF formalism');
        assert(Math.abs(state().result.energy_hartree+155.463715837777)<1e-6,'PE HF energy matches independent RHF reference');
        assert(!$('polymerBanner').classList.contains('hidden'),'finite-chain banner remains visible with the calculation result');
        let polymerProject;
        window.nativeRequest=(op,payload)=>op==='saveFile'?(polymerProject=JSON.parse(payload.text),Promise.resolve({saved:true})):request(op,payload);
        document.querySelector('[data-export="project"]').click();await pause(30);window.nativeRequest=request;
        assert(polymerProject.molecule.polymer.degree===2&&polymerProject.molecule.polymer.unit.atoms.length===2&&polymerProject.result.polymer.degree===2,'project export preserves repeat unit, degree and result provenance');
        $('polymerButton').click();
        assert($('polymerSource').options.length===10,'nine polymer presets and custom drawing are available');
        $('polymerSource').value='pmma';$('polymerSource').dispatchEvent(new Event('change'));$('polymerDegree').value='2';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.preset==='pmma','PMMA preset');
        assert(graph().polymer.total_atoms===32,'PMMA repeat formula and end groups');
        $('editPolymerButton').click();assert($('polymerSource').value==='pmma','editing retains PMMA preset');
        assert($('polymerStereoNote').textContent.includes('未指定'),'tacticity limitation is visible');
        $('polymerDegree').value='3';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.degree===3,'PMMA degree update');
        assert(graph().polymer.total_atoms===47,'PMMA degree uses original repeat');
        $('polymerButton').click();$('polymerSource').value='peg';$('polymerDegree').value='2';$('polymerSource').dispatchEvent(new Event('change'));
        assert($('polymerEstimate').textContent.includes('C4H10O3'),'PEG preview includes diol caps');
        $('buildPolymerButton').click();await until(()=>!state().busy&&graph().polymer?.preset==='peg','PEG preset');
        assert($('polymerSummary').textContent.includes('OH / OH'),'PEG banner shows hydroxyl ends');
        $('calculateButton').click();await until(()=>!state().busy&&state().result?.polymer?.preset==='peg','PEG HF calculation',120000);
        assert(state().result.converged&&state().result.formula==='C4H10O3','PEG diol real HF calculation converges');
        // Product v2: edit fragments through the system clipboard and preserve stereochemistry.
        const editor=window.MoleculeDFT, product=window.MoleculeDFTProduct;
        assert(product && product.state().restored,'native workspace restoration initialized');
        await editor.importSmiles('CCO','editor checks');
        const wheelBefore=state(),wheelGraph=JSON.stringify(graph());$('moleculeCanvas').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:12,deltaY:40}));assert(state().zoom===wheelBefore.zoom&&state().center.y!==wheelBefore.center.y&&JSON.stringify(graph())===wheelGraph,'scroll pans the drawing without zooming or changing coordinates');
        editor.selectAtoms(graph().atoms.slice(0,2).map(a=>a.id));
        for(const type of ['pointerdown','pointerup'])$('moleculeCanvas').dispatchEvent(new PointerEvent(type,{bubbles:true,button:2,pointerId:71,clientX:600,clientY:400}));
        assert(!$('structureContextMenu').classList.contains('hidden'),'right click opens a structure context menu');$('saveSelectionToLibrary').click();await pause(30);assert($('saveMonomerDialog').open,'selection can be saved from the context menu');$('monomerName').value='Saved PE unit';$('saveMonomerConfirm').click();await until(()=>!$('saveMonomerDialog').open,'library saved');
        const libraryEntry=product.state().library.find(e=>e.name==='Saved PE unit');assert(libraryEntry?.molecule.atoms.length===2,'library stores only the selected fragment');
        const savedLibrary=await window.nativeRequest('loadWorkspace');assert(savedLibrary.workspace.library.some(e=>e.id===libraryEntry.id),'library is stored in native workspace');
        $('openMonomerLibrary').click();await pause(30);assert($('monomerLibrary').open&&$('monomerLibrary').textContent.includes('Saved PE unit'),'saved monomers can be browsed');$('monomerLibrary').close();
        editor.showPolymerUnit(libraryEntry.molecule,libraryEntry.head,libraryEntry.tail);assert($('polymerSource').value==='drawing'&&$('polymerHead').value===libraryEntry.head,'library repeat unit restores connection points');assert([...$('polymerEndHead').options].some(o=>o.value==='library:'+libraryEntry.id),'saved groups are selectable as end groups');$('polymerEndHead').value='OCOCH3';$('polymerEndTail').value='H';assert(product.polymerPayload().endGroups.head==='OCOCH3','acetoxy end is selectable independently');const acetoxy=await window.nativeRequest('buildPolymer',{source:'pe',degree:2,endGroups:product.polymerPayload().endGroups});assert(acetoxy.formula==='C6H12O2','bundled engine builds oxygen-linked acetoxy end with correct formula');$('polymerDialog').close();
        await product.restoreWorkspace();assert(product.state().library.some(e=>e.id===libraryEntry.id),'library survives workspace restoration');
        editor.showPolymerUnit(libraryEntry.molecule,libraryEntry.head,libraryEntry.tail);const capCount=product.state().library.length;const detachedCap={name:'Detached cap',molecule:libraryEntry.molecule,root:libraryEntry.tail};product.polymerOpened({endGroups:{head:detachedCap,tail:'NH2'}});assert(product.polymerPayload().endGroups.head.root===libraryEntry.tail&&product.polymerPayload().endGroups.tail==='NH2'&&product.state().library.length===capCount,'saved custom ends restore without silently adding library entries');$('polymerDialog').close();
        editor.selectAll();await editor.copySelection();
        const clip=await window.nativeRequest('readClipboard');
        assert(JSON.parse(clip.text).molecule.atoms.length===3,'system clipboard contains selected structural fragment');
        assert(clip.types.includes('public.png')&&clip.types.includes('public.tiff')&&clip.types.includes('jp.moleculedft.fragment')&&!clip.types.includes('public.utf8-plain-text'),'clipboard offers native structure plus PNG and TIFF without pasting JSON into external apps');
        await editor.pasteSelection();assert(graph().atoms.length===6,'paste duplicates selected fragment with unique IDs');
        assert(new Set(graph().atoms.map(a=>a.id)).size===6,'pasted atom IDs remain unique');
        editor.deleteSelected();assert(graph().atoms.length===3,'group deletion removes only pasted atoms');
        editor.undo();assert(graph().atoms.length===6,'undo restores group deletion');editor.redo();
        await editor.clean2D();assert(graph().molblock&&state().info.formula==='C2H6O','clean2D returns validated structured molecule');
        await editor.importSmiles('C[C@H](O)F','stereo checks');await editor.checkStructure();
        assert(graph().atoms.some(a=>a.cip)&&graph().bonds.some(b=>b.stereo),'imported stereocenter displays wedge and CIP label');
        const stereoBefore=(await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).smiles;
        await editor.clean2D();
        assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).smiles===stereoBefore,'automatic layout preserves assigned chirality');
        // Chain drawing through actual pointer events.
        window.onNativeMenu('new');editor.setTool('chain');
        const chainBox=canvas.getBoundingClientRect(),chainY=chainBox.top+chainBox.height/2,chainX=chainBox.left+chainBox.width/2-120;
        for(const [type,x,buttons] of [['pointerdown',chainX,1],['pointermove',chainX+240,1],['pointerup',chainX+240,0]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:x,clientY:chainY,button:0,buttons,pointerId:1,pointerType:'mouse',isPrimary:true}));
        assert(graph().atoms.length>=4&&graph().bonds.length===graph().atoms.length-1,'dragging chain tool produces connected zigzag backbone');
        editor.selectAll();editor.deleteSelected();await editor.insertTemplate('ester');
        assert(graph().atoms.some(a=>a.element==='O')&&graph().bonds.some(b=>b.order===2),'ester template places carbonyl and oxygen atoms');
        // Advanced polymer UI must persist exact composition, ends and configuration.
        $('polymerButton').click();$('polymerSource').value='pp';$('polymerSource').dispatchEvent(new Event('change'));
        $('polymerDegree').value='3';$('polymerArchitecture').value='block';$('polymerArchitecture').dispatchEvent(new Event('change'));
        $('polymerSourceB').value='ps';$('polymerDegreeB').value='2';$('polymerEndHead').value='OH';$('buildPolymerButton').click();
        await until(()=>!state().busy&&graph().polymer?.architecture==='block','block copolymer');
        assert(state().info.formula==='C25H36O'&&graph().polymer.sequence.join(',')==='pp,pp,pp,ps,ps','block copolymer preserves composition and hydroxyl cap');
        editor.toggleRepeat();assert(state().collapsed&&$('repeatLayer').textContent.includes('PS'),'collapsed copolymer identifies both units');editor.toggleRepeat();
        $('editPolymerButton').click();assert($('polymerDegree').value==='3'&&$('polymerDegreeB').value==='2'&&$('polymerEndHead').value==='OH','copolymer edit restores independent counts and cap');$('polymerDialog').close();
        // Discover and select genuine conformers, then queue distinct inputs.
        await editor.importSmiles('CCCC','butane conformers');
        $('conformersButton').click();await pause(50);$('conformerCount').value='8';$('searchConformers').click();
        await until(()=>!state().busy&&product.state().conformers?.conformers?.length>=2,'distinct butane conformers');
        const candidates=product.state().conformers.conformers;
        $('select-conformer-'+candidates[0].id).click();await pause(100);
        assert(product.state().selectedGeometry?.geometry.coordinateHash===candidates[0].geometry.coordinateHash,'selected conformer is retained for quantum calculation');
        assert(state().prepared.bonds3d.length>0,'selected conformer model includes bonds');
        $('methodSelect').value='HF';$('methodSelect').dispatchEvent(new Event('change'));
        const q1=product.enqueue({molecule:graph(),settings:editor.settings(),geometry:candidates[0].geometry},'conformer A');
        const q2=product.enqueue({molecule:graph(),settings:editor.settings(),geometry:candidates[1].geometry},'conformer B');
        await product.runQueue();
        const jobs=product.state().jobs;
        assert(jobs.find(j=>j.id===q1.id).status==='completed'&&jobs.find(j=>j.id===q2.id).status==='completed','queued conformers both complete sequentially');
        assert(state().input.geometry.coordinateHash===candidates[1].geometry.coordinateHash,'result provenance retains chosen geometry');
        assert(Number.isFinite(state().result.mass)&&state().result.mass>58,'queued result retains molecular mass');
        assert(state().result.charges.values.length===14&&Math.abs(state().result.charges.values.reduce((a,b)=>a+b,0))<1e-6,'Mulliken charges cover all atoms and sum to molecular charge');
        product.showProperties();await pause(100);
        assert($('propertyCanvas').width>0&&state().result.orbital_grids.length===2,'actual HOMO/LUMO grids render to a canvas');
        $('showCharges').click();assert($('chargeRows').children.length===14,'charge table shows every atom');$('propertiesDialog').close();
        product.showComparison();assert($('comparisonRows').children.length>=2,'calculated conformers appear in comparison');$('compareDialog').close();
        const report=product.reportHTML();assert(report.includes('coordinateHash')&&report.includes('SCF')&&report.includes('Mulliken'),'report retains geometry provenance, logs and charge analysis');
        await product.persistNow();const persisted=await window.nativeRequest('loadWorkspace');
        assert(persisted.workspace.schema==='MoleculeDFT.workspace'&&persisted.workspace.jobs.some(j=>j.id===q2.id&&j.result),'native atomic snapshot contains completed queue results');
        assert(persisted.workspace.jobs.find(j=>j.id===q1.id).result.orbital_grids.length===2,'non-latest job retains orbital grids in native persistent storage');
        assert(persisted.recovery.operation==='calculate'&&persisted.recovery.status==='completed'&&persisted.recovery.result.ok,'native journal independently retains successful execution');
        const fake=JSON.parse(JSON.stringify(persisted.workspace));fake.jobs.push({id:'interrupted-test',name:'interrupted',status:'running',input:{molecule:graph(),settings:editor.settings()},created:new Date().toISOString(),log:'saved before interruption'});
        await window.nativeRequest('saveWorkspace',{workspace:fake});await product.restoreWorkspace();
        assert(product.state().jobs.find(j=>j.id==='interrupted-test').status==='interrupted','recovery turns running job into explicit interrupted state without auto-execution');
        const release=await window.nativeRequest('releaseStatus');assert(release.distribution==='local'&&release.updateMode==='unavailable','local build does not claim Developer ID trust or notarized updates');
        await product.showPreflight();assert($('preflightBody').textContent.includes('C4H10'),'preflight reports current formula and quantum dimensions');$('preflightDialog').close();
        // v2.1: help is offline and contextual; keyboard/pointer actions use the real WKWebView.
        const saved21=JSON.parse(JSON.stringify(editor.projectData()));
        for(const [select,button,values] of [['methodSelect','methodHelp',['HF','B3LYP','PBE','PBE0']],['basisSelect','basisHelp',['sto-3g','6-31g','6-31g(d)','6-31+g(d)','def2-svp','def2-tzvp']]]){
            for(const value of values){$(select).value=value;$(button).click();assert($('calculationHelp').open&&document.querySelector('#calculationHelpNav [aria-current="true"]')?.dataset.page===value,'context help opens '+value);assert($('calculationHelpArticle').querySelectorAll('section').length>=3,'help explains meaning and limits: '+value);$('calculationHelp').close();}
        }
        window.MoleculeDFTHelp.open();$('calculationHelpSearch').value='三重ゼータの意味では';$('calculationHelpSearch').dispatchEvent(new Event('input'));
        assert($('calculationHelpNav').querySelectorAll('button').length===1&&$('calculationHelpNav').querySelector('button').dataset.page==='sto-3g','help searches explanatory text');
        $('calculationHelpSearch').value='nothingmatches123';$('calculationHelpSearch').dispatchEvent(new Event('input'));assert($('guideSearchCount').textContent.includes('ありません'),'help handles no search results');$('calculationHelp').close();
        let rejectedReference=false;try{await window.nativeRequest('openReference',{url:'file:///etc/passwd'});}catch{rejectedReference=true;}assert(rejectedReference,'reference bridge rejects arbitrary URLs');
        editor.loadMolecule({atoms:[{id:'clickC',element:'C',x:0,y:0,charge:0}],bonds:[]},'click extension');editor.setTool('bond');
        const screenPoint=a=>{const p=canvas.createSVGPoint();p.x=a.x;p.y=a.y;return p.matrixTransform(canvas.getScreenCTM());};
        const clickAtom=id=>{const a=graph().atoms.find(a=>a.id===id),p=screenPoint(a);document.querySelector('[data-atom="'+id+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));};
        clickAtom('clickC');clickAtom('clickC');clickAtom('clickC');
        assert(graph().atoms.length===4&&new Set(graph().atoms.map(a=>a.x.toFixed(3)+','+a.y.toFixed(3))).size===4,'repeated click extension avoids overlapping atoms');
        const extension=await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}});assert(extension.formula==='C4H10','click extension produces a valid connected molecule');
        editor.setTool('select');const bondTarget=document.querySelector('[data-bond]');bondTarget.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));assert(state().selectedIds.length===4,'double-click bond selects entire connected fragment');
        const original=JSON.parse(JSON.stringify(graph()));canvas.focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'d',metaKey:true,bubbles:true}));assert(graph().atoms.length===8&&state().selectedIds.length===4,'Command D duplicates and selects fragment');
        const originalIds=new Set(original.atoms.map(a=>a.id));const copied=graph().atoms.filter(a=>!originalIds.has(a.id));assert(copied.every(a=>a.x>Math.max(...original.atoms.map(a=>a.x))),'duplicate is placed without overlaying original');
        editor.undo();assert(graph().atoms.length===4,'duplicate is one undo step');editor.redo();assert(graph().atoms.length===8,'duplicate redo restores topology');editor.undo();editor.selectAll();
        const beforeMove=graph().atoms[0];document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));assert(Math.abs(graph().atoms[0].x-beforeMove.x-10)<1e-8,'Shift arrow moves selection by ten drawing units');editor.undo();editor.selectAll();
        const lengths=graph().bonds.map(b=>{const a=graph().atoms.find(a=>a.id===b.a),c=graph().atoms.find(a=>a.id===b.b);return Math.hypot(a.x-c.x,a.y-c.y);});$('editorRotateRight').click();
        assert(graph().bonds.every((b,i)=>{const a=graph().atoms.find(a=>a.id===b.a),c=graph().atoms.find(a=>a.id===b.b);return Math.abs(Math.hypot(a.x-c.x,a.y-c.y)-lengths[i])<1e-8;}),'selection rotation preserves internal bond lengths');editor.undo();
        // WebKit rounds synthetic MouseEvent coordinates to CSS pixels.
        const currentBox=canvas.getBoundingClientRect(),mouse={x:Math.round(currentBox.left+currentBox.width*.7),y:Math.round(currentBox.top+currentBox.height*.3)};
        const navigationBefore=state();canvas.dispatchEvent(new WheelEvent('wheel',{clientX:mouse.x,clientY:mouse.y,deltaY:-100,cancelable:true,bubbles:true}));assert(state().zoom===navigationBefore.zoom&&Math.abs(state().center.y-navigationBefore.center.y+100/navigationBefore.zoom)<.001,'wheel translates the viewport by the scroll distance');$('zoomInButton').click();assert(state().zoom>navigationBefore.zoom,'plus control zooms the drawing');$('zoomOutButton').click();assert(Math.abs(state().zoom-navigationBefore.zoom)<1e-8,'minus control restores the previous zoom');
        const b=graph().bonds[0];document.querySelector('[data-bond="'+b.id+'"]').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'2',bubbles:true}));assert(graph().bonds.find(x=>x.id===b.id).order===2,'hover bond keyboard shortcut edits its bond order');canvas.dispatchEvent(new PointerEvent('pointerleave'));editor.undo();
        editor.setBusy(true,'test');const locked=JSON.stringify(graph());editor.selectAll();editor.duplicateSelection();editor.transformSelection(30);assert(JSON.stringify(graph())===locked,'new editing commands respect calculation lock');window.MoleculeDFTHelp.open('HF');assert(!$('calculationHelpSearch').disabled,'help remains searchable while a calculation runs');$('calculationHelp').close();editor.setBusy(false);
        editor.loadMolecule({atoms:[{id:'freeC',element:'C',x:0,y:0,charge:0}],bonds:[]},'free angle');editor.setTool('bond');const fp=screenPoint(graph().atoms[0]),fx=Math.round(fp.x+80),fy=Math.round(fp.y+17);
        document.querySelector('[data-atom="freeC"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:fp.x,clientY:fp.y,button:0,pointerId:1}));canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:fx,clientY:fy,button:0,pointerId:1,altKey:true}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:fx,clientY:fy,button:0,pointerId:1,altKey:true}));
        const fa=graph().atoms[0],fb=graph().atoms[1],angle=Math.atan2(fb.y-fa.y,fb.x-fa.x)*180/Math.PI;assert(angle>5&&angle<25&&Math.abs(Math.hypot(fb.x-fa.x,fb.y-fa.y)-56)<.001,'Option drag keeps fixed bond length with an unsnapped angle');
        await editor.importSmiles('C[C@H](O)F','rotation stereo');const chirality=(await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).smiles;editor.selectAll();editor.transformSelection(30);assert((await window.nativeRequest('checkStructure',{molecule:graph(),settings:{method:'HF'}})).smiles===chirality,'rigid rotation preserves stereochemistry');
        // v2.2: real rectangle gesture in both drawing and selection modes.
        editor.loadMolecule({atoms:[0,1,2,3].map(i=>({id:'r'+i,element:'C',x:i*56,y:0,charge:0})),bonds:[0,1,2].map(i=>({id:'rb'+i,a:'r'+i,b:'r'+(i+1),order:1}))},'repeat selection');
        assert(state().tool==='bond','loaded structures default to extending bonds');
        const dragRect=(start,end,shift=false,move=true)=>{const a=screenPoint(start),b=screenPoint(end);canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:a.x,clientY:a.y,button:0,pointerId:1,shiftKey:shift}));if(move)canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.x,clientY:b.y,button:0,pointerId:1,shiftKey:shift}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:b.x,clientY:b.y,button:0,pointerId:1,shiftKey:shift}));};
        dragRect({x:35,y:-24},{x:133,y:24},true);
        assert(state().selectedIds.length===2&&state().selectedIds.includes('r1')&&state().selectedIds.includes('r2')&&graph().atoms.length===4,'Shift rectangle selects a repeat fragment without drawing a bond');
        assert(state().tool==='select','rectangle selection enables moving the selected fragment');
        $('selectionRepeat').click();assert($('polymerSource').value==='drawing'&&$('polymerHead').options.length===2,'selected atoms alone become the repeat unit');
        assert($('polymerHead').value==='r1'&&$('polymerTail').value==='r2','cut boundary atoms suggest the two connection points');
        $('previewRepeat').click();await until(()=>!state().busy&&$('repeatPreviewResult').textContent.includes('接続できました'),'repeat connection preview');assert($('repeatPreviewResult').textContent.includes('C4H10')&&$('repeatPreviewResult').querySelector('svg'),'two-unit preview validates and displays actual linked molecule');
        $('swapAttachments').click();assert($('polymerHead').value==='r2'&&$('polymerTail').value==='r1'&&!$('repeatPreviewResult').textContent,'swapping A/B invalidates the old connection preview');
        $('polymerDegree').value='3';$('buildPolymerButton').click();await until(()=>!state().busy&&graph().polymer?.degree===3,'selected repeat build');assert(state().info.formula==='C6H14','selected two-carbon fragment builds a three-unit chain');
        editor.loadMolecule({atoms:[{id:'a',element:'C',x:0,y:0,charge:0},{id:'b',element:'C',x:56,y:0,charge:0}],bonds:[{id:'ab',a:'a',b:'b',order:1}]},'reverse selection');ensureTool('select');dragRect({x:85,y:30},{x:-25,y:-30},false,false);assert(state().selectedIds.length===2,'reverse rectangle uses final pointer position even without a move event');
        window.onNativeMenu('new');ensureFive();assert($('templateSelect').value==='cyclopentyl'&&state().tool==='template','visible five-member ring shortcut selects the template');
        await editor.insertTemplate('cyclopentyl');assert(graph().atoms.length===5&&graph().bonds.length===5&&state().tool==='template','five-member ring inserts and remains selected for another placement');
        assert(editor.templates().length===30&&$('templateSelect').options.length===31,'thirty templates are available');
        await editor.importSmiles('O','vibration check');editor.setSettings({task:'frequency',method:'B3LYP',basis:'sto-3g',charge:0,multiplicity:1,solvent:'water',dispersion:'d3bj2b'});
        assert(editor.validateSettings().task==='frequency','frequency task is selectable and valid');
        await editor.calculate();assert(state().result?.vibrations?.frequencies_cm1.length===3&&state().result.geometry_converged,'bundled engine computes three water vibration modes after optimization');
        assert($('vibrationResults').textContent.includes('ZPE')&&$('vibrationResults').querySelectorAll('tr').length===4,'results display frequencies and ZPE');
        assert(product.reportHTML().includes('frequencies_cm1'),'report includes vibration data');assert(state().result.environment.model==='IEF-PCM'&&state().result.environment.dispersion_energy_hartree<0,'bundled solvent and D3 corrections survive optimization and Hessian analysis');assert(product.reportHTML().includes('d3bj2b'),'report preserves environmental model');
        const vibrationProject=editor.projectData();editor.restoreProject(vibrationProject);assert(state().result.vibrations.normal_modes.length===3,'project roundtrip preserves vibration modes');
        window.vibrationTestProject=vibrationProject;

        editor.restoreProject(saved21);editor.render();editor.renderResults();
        await product.persistNow();
        $('tab-structure').click();
        $('toast').classList.add('hidden');
        await pause(150);
        return checks.map(text => 'PASS: ' + text).join('\n');
        """#
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .failure(let error):
                fputs("FAIL WKWebView smoke: \(error)\n", stderr)
                self.writeSmokeSnapshot(name: "failure") { exit(1) }
            case .success(let value):
                guard let png = NSPasteboard.general.data(forType: .png), let bitmap = NSBitmapImageRep(data: png), bitmap.hasAlpha, (bitmap.colorAt(x: 0, y: 0)?.alphaComponent ?? 1) == 0 else { fputs("FAIL clipboard transparency\n", stderr); exit(1) }
                if let root = ProcessInfo.processInfo.environment["DFT_TEST_ROOT"] { try? png.write(to: URL(fileURLWithPath: root + "/build/native-test/transparent-clipboard.png")) }
                print("PASS: clipboard PNG retains a fully transparent background")
                print(value)
                fflush(stdout)
                self.captureSmokeScreens()
            }
        }
    }

    private func writeSmokeSnapshot(name: String, completion: @escaping () -> Void) {
        webView.takeSnapshot(with: nil) { image, error in
            guard let root = ProcessInfo.processInfo.environment["DFT_TEST_ROOT"],
                  let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff),
                  let png = bitmap.representation(using: .png, properties: [:]) else {
                fputs("FAIL snapshot: \(String(describing: error))\n", stderr); exit(1)
            }
            do {
                let output = URL(fileURLWithPath: root).appendingPathComponent("build/native-test")
                try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
                try png.write(to: output.appendingPathComponent(name + ".png"))
                completion()
            } catch { fputs("FAIL snapshot write: \(error)\n", stderr); exit(1) }
        }
    }

    private func captureSmokeScreens(index: Int = 0) {
        let screens = [("structure", "tab-structure", 1420, 920), ("model", "tab-model", 1420, 920), ("compact", "tab-structure", 1060, 740), ("orbitals", "propertiesButton", 1420, 920), ("charges", "propertiesButton", 1420, 920), ("polymer-builder", "polymerButton", 1060, 740), ("calculation-help", "basisHelp", 1060, 740), ("drawing-help", "drawingHelp", 1420, 920), ("repeat-connection", "selectionRepeat", 1060, 740), ("attachment-preview", "tab-structure", 1420, 920), ("spiro-attachment", "tab-structure", 1060, 740), ("group-placement", "tab-structure", 1420, 920), ("fused-rings", "tab-structure", 1060, 740), ("selected-atom", "tab-structure", 1060, 740), ("idle-pan", "tab-structure", 1060, 740), ("hover-expanded", "tab-structure", 1420, 920), ("vibrations", "tab-structure", 1420, 920), ("monomer-library", "openMonomerLibrary", 1060, 740)]
        guard index < screens.count else {
            print("PASS: real AppKit / WKWebView / Swift process bridge / RDKit / PySCF; file dialogs require manual verification")
            fflush(stdout)
            NSApp.terminate(nil)
            return
        }
        let (name, button, width, height) = screens[index]
        window.setContentSize(NSSize(width: width, height: height))
        let script = #"""
        document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        if(name==='repeat-connection'){window.MoleculeDFT.loadMolecule({atoms:[{id:'x',element:'C',x:0,y:0,charge:0},{id:'y',element:'C',x:56,y:0,charge:0}],bonds:[{id:'xy',a:'x',b:'y',order:1}]});window.MoleculeDFT.selectAll();}
        document.getElementById(button).click();await new Promise(resolve=>setTimeout(resolve,200));
        if(name==='repeat-connection'){document.getElementById('previewRepeat').click();while(window.MoleculeDFT.debugState().busy)await new Promise(resolve=>setTimeout(resolve,100));}
        if(button==='propertiesButton'){document.getElementById(name==='charges'?'showCharges':'showOrbitals').click();await new Promise(resolve=>setTimeout(resolve,150));}
        if(name==='spiro-attachment'||name==='attachment-preview'){
            const radius=56/(2*Math.sin(Math.PI/5));
            window.MoleculeDFT.loadMolecule({atoms:Array.from({length:5},(_,i)=>({id:'sp'+i,element:'C',charge:0,x:radius*Math.cos(Math.PI/2+i*2*Math.PI/5),y:radius*Math.sin(Math.PI/2+i*2*Math.PI/5)})),bonds:Array.from({length:5},(_,i)=>({id:'sb'+i,a:'sp'+i,b:'sp'+((i+1)%5),order:1}))},'環の共有・メトキシ基の接続');
            await window.MoleculeDFT.insertTemplate('cyclopentyl',{x:0,y:0},'sp0');
            await window.MoleculeDFT.insertTemplate('methoxy',{x:0,y:0},'sp3');
            document.getElementById('fitButton').click();
            for(let i=0;i<4;i++)document.getElementById('zoomInButton').click();
            if(name==='attachment-preview'){
                const canvas=document.getElementById('moleculeCanvas'),anchor=window.MoleculeDFT.debugState().molecule.atoms.slice(5,9).sort((a,b)=>b.x-a.x)[0];
                const screen=(x,y)=>{const p=canvas.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(canvas.getScreenCTM());};
                document.getElementById('fiveRing').click();let p=screen(anchor.x,anchor.y);
                document.querySelector('[data-atom="'+anchor.id+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));
                p=screen(anchor.x+90,anchor.y+52);canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1,shiftKey:true}));
                await new Promise(resolve=>setTimeout(resolve,100));
            }
        }
        if(name==='fused-rings'||name==='group-placement'){
            window.MoleculeDFT.loadMolecule(window.__nativeFusionScene,'2原子を共有した環');
            document.getElementById('fitButton').click();for(let i=0;i<2;i++)document.getElementById('zoomInButton').click();
            if(name==='group-placement'){
                const select=document.getElementById('templateSelect');select.value='nitrile';select.dispatchEvent(new Event('change'));
                const canvas=document.getElementById('moleculeCanvas'),anchor=window.MoleculeDFT.debugState().molecule.atoms.slice().sort((a,b)=>b.x-a.x)[0];
                const screen=(x,y)=>{const p=canvas.createSVGPoint();p.x=x;p.y=y;return p.matrixTransform(canvas.getScreenCTM());};
                let p=screen(anchor.x,anchor.y);document.querySelector('[data-atom="'+anchor.id+'"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));
                p=screen(anchor.x+90,anchor.y);canvas.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:p.x,clientY:p.y,button:0,pointerId:1}));await new Promise(resolve=>setTimeout(resolve,150));
            }
        }
        if(name==='vibrations'){window.MoleculeDFT.restoreProject(window.vibrationTestProject);window.MoleculeDFT.render();window.MoleculeDFT.renderResults();window.MoleculeDFT.setTab('model');document.getElementById('resultsDivider').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));document.getElementById('vibrationResults').open=true;}if(name==='hover-expanded'){window.MoleculeDFT.setTool('atom');document.getElementById('resultsDivider').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));document.querySelector('[data-atom="f0"]').dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));}if(name==='selected-atom'){window.MoleculeDFT.selectAtoms(['f0']);window.MoleculeDFT.setTool('benzene');}if(name==='idle-pan')window.MoleculeDFT.setTool('idle');
        if(document.documentElement.scrollWidth>innerWidth+1)throw Error('Horizontal overflow');return true;
        """#
        webView.callAsyncJavaScript(script, arguments: ["button": button, "name": name], in: nil, in: .page) { result in
            if case .failure(let error) = result { fputs("FAIL layout \(name): \(error)\n", stderr); exit(1) }
            self.writeSmokeSnapshot(name: name) {
                print("PASS: \(name) layout at \(width) × \(height)")
                self.captureSmokeScreens(index: index + 1)
            }
        }
    }
}

DispatchQueue.main.asyncAfter(deadline: .now() + 360) {
    fputs("FAIL: native smoke timed out after 360 seconds\n", stderr)
    exit(1)
}
#endif
