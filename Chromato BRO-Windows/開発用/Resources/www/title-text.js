/* Structured title text. No HTML is stored or evaluated. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;root.GPCTitleText=api;})(typeof window==='object'?window:globalThis,()=>{
 const scripts=['normal','sub','super'];
 function validate(runs){if(!Array.isArray(runs)||runs.length>500||runs.some(r=>!r||typeof r.text!=='string'||!scripts.includes(r.script))||runs.reduce((n,r)=>n+r.text.length,0)>500)throw Error('タイトルの文字装飾が不正です。');return runs;}
 function chars(runs){return runs.flatMap(r=>Array.from(r.text,c=>({text:c,script:r.script})));}
 function pack(items){const result=[];for(const c of items){if(result.at(-1)?.script===c.script)result.at(-1).text+=c.text;else result.push({...c});}return result;}
 function sync(text,runs=[]){validate(runs);const old=chars(runs),next=Array.from(text);let a=0,b=0;while(a<old.length&&a<next.length&&old[a].text===next[a])a++;while(b<old.length-a&&b<next.length-a&&old.at(-1-b).text===next.at(-1-b))b++;const removed=old.slice(a,old.length-b),insertStyle=removed.length&&removed.every(c=>c.script===removed[0].script)?removed[0].script:'normal';return pack(next.map((c,i)=>i<a?old[i]:i>=next.length-b?old[old.length-(next.length-i)]:{text:c,script:insertStyle}));}
 function format(text,runs,start,end,script){if(!scripts.includes(script))throw Error('文字装飾が不正です。');let at=0;return pack(chars(sync(text,runs)).map(c=>{const from=at;at+=c.text.length;return {...c,script:from<end&&at>start?script:c.script};}));}
 function layout(ctx,text,runs,size,family,maxWidth=2200){
  const items=chars(sync(text,runs)),padding=6,available=maxWidth-padding*2,lines=[];let line=[],x=0;
  function finish(){lines.push(line);line=[];x=0;}
  for(const c of items){if(c.text==='\n'){finish();continue;}const fontSize=c.script==='normal'?size:size*.7,shift=c.script==='sub'?size*.22:c.script==='super'?-size*.35:0;ctx.font=`${fontSize}px ${family}`;const m=ctx.measureText(c.text),w=m.width;if(w>available)throw Error('タイトル枠が狭すぎます。幅を広げてください。');if(line.length&&x+w>available)finish();line.push({...c,size:fontSize,shift,x,width:w,ascent:m.actualBoundingBoxAscent??fontSize*.8,descent:m.actualBoundingBoxDescent??fontSize*.2});x+=w;}
  finish();let y=padding,width=0;const output=[];
  for(const row of lines){const ascent=Math.max(size*.7,...row.map(c=>c.ascent-c.shift)),descent=Math.max(0,...row.map(c=>c.descent+c.shift));let last=null;for(const c of row){if(last&&last.script===c.script)last.text+=c.text;else {last={text:c.text,script:c.script,size:c.size,x:padding+c.x,y:y+ascent+c.shift};output.push(last);}width=Math.max(width,c.x+c.width);}y+=ascent+descent+size*.12;}
  return {runs:output,width:Math.ceil(Math.max(24,width+padding*2)),height:Math.ceil(Math.max(24,y-size*.12+padding))};
 }
 return {validate,sync,format,layout};
});
