(() => {
 const $=id=>document.getElementById(id);
 // A wrapped macOS/Windows header must leave the full controls pane inside the viewport.
 const header=document.querySelector('body>header');
 if(header){const updateHeaderHeight=()=>document.documentElement.style.setProperty('--app-header-height',`${header.getBoundingClientRect().height}px`);new ResizeObserver(updateHeaderHeight).observe(header);window.addEventListener('resize',updateHeaderHeight);updateHeaderHeight();}
 let previousFocus=null;
 function showHelp(){previousFocus=document.activeElement;$('helpPanel').hidden=false;$('helpClose').focus();}
 function closeHelp(){$('helpPanel').hidden=true;previousFocus?.focus();}
 $('helpOpen').onclick=showHelp;$('helpClose').onclick=closeHelp;
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('helpPanel').hidden){e.preventDefault();closeHelp();}});
 // Constrain keyboard focus while the help dialog is open.
 $('helpPanel').addEventListener('keydown',e=>{if(e.key==='Tab'){const items=[...$('helpPanel').querySelectorAll('button,a[href]')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 window.GPCUI={showHelp,openFile:()=>{const id=!$('calibrationPage').hidden?'calANLFile':!$('graphPage').hidden?'graphFileInput':'fileInput';$(id).click();},saveDocument:()=>{const id=!$('calibrationPage').hidden?'calExportJSON':'jsonExport';$(id).click();}};
})();
