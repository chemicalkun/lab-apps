(() => {
 const $=id=>document.getElementById(id);
 // Fill the viewport below each pane's current top, including when it sticks after scrolling.
 const panes=[document.querySelector('#analysisPage>aside'),document.querySelector('.graph-settings')].filter(Boolean);
 let sidebarFrame=0;
 function scheduleSidebarHeight(){if(sidebarFrame)return;sidebarFrame=requestAnimationFrame(()=>{
  sidebarFrame=0;const heights=panes.filter(p=>p.getClientRects().length).map(p=>[p,Math.max(120,Math.floor(innerHeight-Math.max(16,p.getBoundingClientRect().top)-16))]);
  for(const [pane,height] of heights){const value=`${height}px`;if(pane.style.getPropertyValue('--sidebar-height')!==value)pane.style.setProperty('--sidebar-height',value);}
 });}
 const header=document.querySelector('body>header');
 if(header){const updateHeaderHeight=()=>{document.documentElement.style.setProperty('--app-header-height',`${header.getBoundingClientRect().height}px`);scheduleSidebarHeight();};new ResizeObserver(updateHeaderHeight).observe(header);updateHeaderHeight();}
 window.addEventListener('resize',scheduleSidebarHeight);window.addEventListener('scroll',scheduleSidebarHeight,{passive:true});
 window.addEventListener('gpc-state-changed',scheduleSidebarHeight);
 const pageObserver=new MutationObserver(scheduleSidebarHeight);
 for(const page of ['analysisPage','graphPage','calibrationPage'])pageObserver.observe($(page),{attributes:true,attributeFilter:['hidden']});
 scheduleSidebarHeight();
 let previousFocus=null;
 function showHelp(){previousFocus=document.activeElement;$('helpPanel').hidden=false;$('helpClose').focus();}
 function closeHelp(){$('helpPanel').hidden=true;previousFocus?.focus();}
 $('helpOpen').onclick=showHelp;$('helpClose').onclick=closeHelp;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('helpPanel').hidden){e.preventDefault();closeHelp();}});
 // Constrain keyboard focus while the help dialog is open.
 $('helpPanel').addEventListener('keydown',e=>{if(e.key==='Tab'){const items=[...$('helpPanel').querySelectorAll('button,a[href]')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 window.GPCUI={showHelp,openFile:()=>{const id=!$('calibrationPage').hidden?'calANLFile':!$('graphPage').hidden?'graphFileInput':'fileInput';$(id).click();},saveDocument:()=>{const id=!$('calibrationPage').hidden?'calExportJSON':'jsonExport';$(id).click();}};
})();
