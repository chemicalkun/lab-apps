/* Shared plot navigation in CSS pixels; selection boxes never enter exported canvases. */
(() => {
  'use strict';
  window.GPCPlotInteraction = function(canvas, options) {
    const overlay=document.createElement('div');overlay.className='plot-selection';overlay.hidden=true;canvas.parentElement.append(overlay);
    let drag=null, gesture=null;
    const touches=new Map();let pinch=null;
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    const inside=(p,f)=>f&&p.x>=f.left&&p.x<=f.left+f.width&&p.y>=f.top&&p.y<=f.top+f.height;
    const bounded=(p,f)=>({x:clamp(p.x,f.left,f.left+f.width),y:clamp(p.y,f.top,f.top+f.height)});
    const values=(p,f)=>({x:f.xmin+(p.x-f.left)/f.width*(f.xmax-f.xmin),y:f.ymax-(p.y-f.top)/f.height*(f.ymax-f.ymin)});
    function cancel(){drag=null;overlay.hidden=true;canvas.style.cursor="";}
    function apply(b,kind='zoom'){
      if(!Object.values(b).every(Number.isFinite)||b.xmax-b.xmin<1e-9||b.ymax-b.ymin<1e-12)return;
      const limits=options.limits?.();
      if(limits){const span=b.xmax-b.xmin,total=limits[1]-limits[0];if(span>=total){b.xmin=limits[0];b.xmax=limits[1];}else{if(b.xmin<limits[0]){b.xmin=limits[0];b.xmax=b.xmin+span;}if(b.xmax>limits[1]){b.xmax=limits[1];b.xmin=b.xmax-span;}}}
      options.change(b,kind);
    }
    function zoom(f,p,factor){
      if(!f||!Number.isFinite(factor)||factor<=0)return;
      const a=values(bounded(p,f),f);
      apply({xmin:a.x+(f.xmin-a.x)*factor,xmax:a.x+(f.xmax-a.x)*factor,ymin:a.y+(f.ymin-a.y)*factor,ymax:a.y+(f.ymax-a.y)*factor});
    }
    function drawBox(p){
      const f=drag.frame,a=drag.start,b=bounded(p,f),range=drag.mode==='integrate'||drag.mode==='baseline'||drag.mode==='peak';
      const rect=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect();
      Object.assign(overlay.style,{left:(rect.left-parent.left+Math.min(a.x,b.x))+'px',top:(rect.top-parent.top+(range?f.top:Math.min(a.y,b.y)))+'px',width:Math.abs(a.x-b.x)+'px',height:(range?f.height:Math.abs(a.y-b.y))+'px'});
      overlay.dataset.mode=drag.mode;overlay.hidden=false;
    }
    canvas.addEventListener('pointerdown',e=>{
      const f=options.frame(),p=point(e);if(!inside(p,f)||(e.button!==0&&e.button!==2))return;
      if(e.pointerType==='touch'){
        touches.set(e.pointerId,p);
        if(touches.size===2){cancel();const [a,b]=[...touches.values()];pinch={frame:f,point:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance:Math.hypot(a.x-b.x,a.y-b.y)};}
      }
      canvas.setPointerCapture(e.pointerId);
      if(touches.size<2)drag={id:e.pointerId,start:p,frame:f,mode:e.button===2?'pan':options.mode?.()||'zoom'};
      if(e.button===2)canvas.style.cursor="grabbing";
      e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=>{
      const p=point(e);
      if(touches.has(e.pointerId))touches.set(e.pointerId,p);
      if(pinch&&touches.size===2){const[a,b]=[...touches.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>1)zoom(pinch.frame,pinch.point,pinch.distance/distance);return;}
      if(drag&&drag.id===e.pointerId){
        if(drag.mode==='pan'){
          const f=drag.frame,dx=(p.x-drag.start.x)/f.width*(f.xmax-f.xmin);
          apply({xmin:f.xmin-dx,xmax:f.xmax-dx,ymin:f.ymin,ymax:f.ymax},'pan');
        }else drawBox(p);
      }
    });
    canvas.addEventListener('pointerup',e=>{
      touches.delete(e.pointerId);
      if(pinch){pinch=null;cancel();return;}
      if(!drag||drag.id!==e.pointerId)return;
      const d=drag,p=bounded(point(e),d.frame);cancel();
      if(d.mode==='pan')return;
      if(Math.abs(p.x-d.start.x)<6)return;
      const a=values(d.start,d.frame),b=values(p,d.frame);
      if(d.mode==='peak')options.peak?.(Math.min(a.x,b.x),Math.max(a.x,b.x));
      else if(d.mode==='integrate')options.integrate?.(Math.min(a.x,b.x),Math.max(a.x,b.x));
      else if(d.mode==='baseline')options.baseline?.(Math.min(a.x,b.x),Math.max(a.x,b.x));
      else if(Math.abs(p.y-d.start.y)>=6)apply({xmin:Math.min(a.x,b.x),xmax:Math.max(a.x,b.x),ymin:Math.min(a.y,b.y),ymax:Math.max(a.y,b.y)});
    });
    for(const type of ['pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{touches.delete(e.pointerId);pinch=null;cancel();});
    canvas.addEventListener('contextmenu',e=>{if(inside(point(e),options.frame()))e.preventDefault();});
    canvas.addEventListener('wheel',e=>{
      if(!e.ctrlKey||gesture)return;const f=options.frame(),p=point(e);if(!inside(p,f))return;
      e.preventDefault();cancel();zoom(f,p,Math.exp(clamp(e.deltaY*(e.deltaMode===1?16:1),-200,200)*.005));
    },{passive:false});
    canvas.addEventListener('gesturestart',e=>{const f=options.frame(),p=point(e);if(!inside(p,f))return;e.preventDefault();cancel();gesture={frame:f,point:p};},{passive:false});
    canvas.addEventListener('gesturechange',e=>{if(!gesture)return;e.preventDefault();zoom(gesture.frame,gesture.point,1/e.scale);},{passive:false});
    canvas.addEventListener('gestureend',e=>{if(gesture)e.preventDefault();gesture=null;},{passive:false});
    canvas.addEventListener('dblclick',e=>{if(inside(point(e),options.frame())){cancel();options.reset?.();}});
    window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
    window.addEventListener('blur',()=>{cancel();gesture=null;touches.clear();pinch=null;});
    return {cancel,isInteracting:()=>!!drag||!!gesture||!!pinch};
  };
})();
