/* Reorder page tabs without changing the current page or analysis data. */
(() => {
 'use strict';
 const nav=document.querySelector('.nav-main'),defaults=['navGraph','navAnalysis','navCalibration'];
 let pending=null,drag=null,timer=null,suppressClick=false;
 const order=()=>[...nav.querySelectorAll('.nav-btn')].map(b=>b.id);
 function validate(value){if(!Array.isArray(value)||value.length!==3||new Set(value).size!==3||value.some(id=>!defaults.includes(id)))throw Error('ページ順序が不正です。');}
 function restore(value){validate(value);for(const id of value)nav.append(document.getElementById(id));}
 function finish(cancel=false){
   clearTimeout(timer);pending=null;
   if(drag){if(cancel)restore(drag.original);drag.button.classList.remove('nav-moving');drag=null;window.dispatchEvent(new Event('gpc-state-changed'));}
   nav.style.cursor='';
 }
 function start(){if(!pending)return;drag={...pending,original:order()};nav.setPointerCapture(pending.id);suppressClick=true;drag.button.classList.add('nav-moving');nav.style.cursor='grabbing';}
 nav.addEventListener('pointerdown',e=>{
   const button=e.target.closest('.nav-btn');if(!button||![0,2].includes(e.button))return;
   finish();suppressClick=false;pending={id:e.pointerId,button,x:e.clientX,y:e.clientY};
   if(e.button===2){e.preventDefault();start();}else timer=setTimeout(start,450);
 });
 nav.addEventListener('pointermove',e=>{
   if(!pending||e.pointerId!==pending.id)return;
   if(!drag){if(Math.hypot(e.clientX-pending.x,e.clientY-pending.y)>8)finish();return;}
   e.preventDefault();
   const others=[...nav.querySelectorAll('.nav-btn')].filter(b=>b!==drag.button);
   const next=others.find(b=>{const r=b.getBoundingClientRect();return e.clientX<r.left+r.width/2;});
   nav.insertBefore(drag.button,next||null);
 });
 window.addEventListener('pointerup',()=>finish());
 for(const type of ['pointercancel','lostpointercapture'])nav.addEventListener(type,()=>finish(true));
 nav.addEventListener('contextmenu',e=>e.preventDefault());
 nav.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
 window.addEventListener('blur',()=>finish(true));
 window.addEventListener('keydown',e=>{if(e.key==='Escape')finish(true);});
 for(const button of nav.querySelectorAll('.nav-btn'))button.title='長押し・右ドラッグで並べ替え';
 window.GPCPageOrder={snapshot:order,restore,validate,openFirst:()=>document.getElementById(order()[0]).click()};
})();
