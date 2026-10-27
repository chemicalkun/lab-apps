/* Windows native bridge; scientific modules share the Mac implementation. */
(() => {
 'use strict';
 if(!window.chrome?.webview)return;
 let sequence=0;const pending=new Map();
 function request(kind,payload={}){return new Promise((resolve,reject)=>{const id=String(++sequence);pending.set(id,{resolve,reject});window.chrome.webview.postMessage({id,kind,payload});});}
 window.chrome.webview.addEventListener('message',e=>{const r=e.data,p=pending.get(r.id);if(!p)return;pending.delete(r.id);if(r.error)p.reject(Error(r.error));else p.resolve(r.value);});
 window.webkit={messageHandlers:{sessionSave:{postMessage:p=>request('sessionSave',p)},copyImage:{postMessage:p=>request('copyImage',p)},saveFile:{postMessage:p=>{request('saveFile',p).catch(e=>alert('保存できません：'+e.message));}}}};
 let selecting=false;
 document.addEventListener('click',async e=>{
  const input=e.target;if(!(input instanceof HTMLInputElement)||input.type!=='file')return;
  e.preventDefault();if(selecting)return;selecting=true;
  try{const files=await request('openFile',{accept:input.accept,multiple:input.multiple});if(!files.length)return;
   const transfer=new DataTransfer();for(const f of files){const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));transfer.items.add(new File([bytes],f.name));}
   input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  }catch(err){alert('読込エラー：'+err.message);}finally{selecting=false;}
 },true);
 document.addEventListener('keydown',e=>{
  if(!e.ctrlKey||e.altKey)return;
  const key=e.key.toLowerCase(),pages={'1':'navAnalysis','2':'navCalibration','3':'navGraph'};
  if(key==='o'){e.preventDefault();window.GPCUI?.openFile();}
  else if(key==='s'){e.preventDefault();window.GPCUI?.saveDocument();}
  else if(pages[key]){e.preventDefault();document.getElementById(pages[key]).click();}
  else if(key==='0'){e.preventDefault();document.getElementById(document.getElementById('graphPage').hidden?'resetView':'graphReset').click();}
 });
 window.GPCWindows={request,async flushAndClose(){try{const ok=await window.GPCSession.flush();await request(ok?'closeReady':'closeFailed');}catch{await request('closeFailed');}}};
})();
