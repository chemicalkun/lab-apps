const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const sent=[],handlers={},events={};let closed=false;
const context={window:{chrome:{webview:{postMessage:m=>sent.push(m),addEventListener:(type,fn)=>handlers[type]=fn}},GPCSession:{flush:async()=>true}},document:{addEventListener:(t,f)=>events[t]=f},console,alert:()=>{},Map,Promise,Error};
vm.runInNewContext(fs.readFileSync('Resources/www/windows-bridge.js','utf8'),context);
(async()=>{
 const p=context.window.webkit.messageHandlers.sessionSave.postMessage({format:'GPC-session-v1'});const m=sent.pop();assert.equal(m.kind,'sessionSave');handlers.message({data:{id:m.id,value:true}});assert.equal(await p,true);
 const q=context.window.webkit.messageHandlers.copyImage.postMessage({base64:'test'});const n=sent.pop();handlers.message({data:{id:n.id,error:'clipboard busy'}});await assert.rejects(q,/clipboard busy/);
 context.window.GPCWindows.flushAndClose();await new Promise(r=>setImmediate(r));assert.equal(sent.pop().kind,'closeReady');
 context.window.GPCSession.flush=async()=>false;context.window.GPCWindows.flushAndClose();await new Promise(r=>setImmediate(r));assert.equal(sent.pop().kind,'closeFailed');
 console.log('PASS: Windows bridge RPC matching, errors and save-before-close handshake');
})().catch(e=>{console.error(e);process.exitCode=1;});
