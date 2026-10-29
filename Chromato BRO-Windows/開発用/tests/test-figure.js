// Rendering-contract tests with a recording canvas (no browser dependencies).
const assert=require('node:assert/strict');
global.window={GPCTitleText:require('../Resources/www/title-text')};global.GPCCore=require('../Resources/www/gpc-core');
require('../Resources/www/figure-renderer');
const paints=[],texts=[],strokes=[],paths=[];let path=[];
const ctx=new Proxy({font:'',beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},measureText(text){return {width:String(text).length*parseFloat(this.font||'28')*.6};},fillText(text,x,y){texts.push({text,font:this.font,x,y});},stroke(){paints.push({width:this.lineWidth,color:this.strokeStyle});strokes.push(this.lineWidth);paths.push(path.slice());},strokeRect(){strokes.push(this.lineWidth);}}, {get(target,key){return key in target?target[key]:()=>{};}});
const canvas={getContext:()=>ctx};
const source={datasets:[{times:[0,10,20],signal:[0,1,0],color:'#123',name:'test'}],selected:0,overlay:false,start:0,end:20};
function draw(s=source,settings={}){paints.length=0;texts.length=0;strokes.length=0;paths.length=0;return window.GPCFigure.draw(canvas,s,settings);}
draw();assert.deepEqual(texts.map(t=>t.text),['0','5','10','15','20','elution time (min)']);
assert.equal(strokes.at(-1),4);
const frame=draw(source,{axisWidth:8,curveWidth:11,tickFontSize:72,fontFamily:'Times'});
assert.ok(texts.slice(0,-1).every(t=>t.font==='72px "Times New Roman", serif'));
assert.ok(strokes.slice(0,-1).every(w=>w===8));assert.equal(strokes.at(-1),11);
assert.ok(texts.every(t=>t.y<1400));assert.ok(frame.height>0);
draw({...source,start:7.2,end:8.7});assert.deepEqual(texts.map(t=>t.text),['8','elution time (min)']);
draw({...source,start:.1,end:.9});assert.deepEqual(texts.map(t=>t.text),['elution time (min)']);
draw({...source,start:-1.2,end:2.2});assert.deepEqual(texts.map(t=>t.text),['-1','0','1','2','elution time (min)']);
for(const key of ['axisWidth','curveWidth','tickFontSize','labelFontSize'])for(const value of [NaN,0,1000])assert.throws(()=>draw(source,{[key]:value}),/指定範囲/);
assert.throws(()=>draw(source,{fontFamily:'not-a-font'}),/フォント/);
draw(source,{simple:false,axes:true,grid:true,legend:true});assert.ok(texts.some(t=>t.text==='elution time (min)'));
console.log('PASS: integer tick placement (including fractional/narrow/negative ranges), axis label, independent line widths, font/size settings, margins and invalid settings');

for(const simple of [true,false]){
  draw(source,{simple,axes:true,tickFontSize:28,labelFontSize:96,fontFamily:'Arial'});
  const label=texts.find(t=>t.text==='elution time (min)');
  assert.equal(label.font,'96px Arial, sans-serif');assert.ok(label.y+24<1400);
  assert.equal(texts.find(t=>t.text==='0').font,'28px Arial, sans-serif');
}
console.log('PASS: independent X label size in simple/detail styles and bottom margin at maximum size');

// Sloping baselines are removed independently; original data and negative residuals survive.
const peak={name:'a',times:[0,1,2],signal:[2,5,4],color:'#111'};
const shifted={name:'b',times:[0,1,2],signal:[10,14,14],color:'#222'};
const pair={datasets:[peak,shifted],selected:0,overlay:true,start:0,end:2};
const original=JSON.stringify(pair);
const baselineSettings={baselineCorrect:true,baselineStart:0,baselineEnd:2};
const correctedFrame=draw(pair,baselineSettings),curves=paths.slice(-2);
assert.deepEqual(curves[0],curves[1]);
assert.equal(curves[0][0][1],correctedFrame.axisY);assert.equal(curves[0][2][1],correctedFrame.axisY);
const pixelY=v=>correctedFrame.top+(correctedFrame.ymax-v)/(correctedFrame.ymax-correctedFrame.ymin)*correctedFrame.height;
assert.equal(curves[0][1][1],pixelY(2));assert.equal(JSON.stringify(pair),original);
const interpolated=draw({...pair,overlay:false},{...baselineSettings,baselineStart:.5,baselineEnd:1.5});
assert.ok(paths.at(-1)[0][1]>interpolated.axisY,'Negative residual must not be clipped to zero');
assert.ok(paths.at(-1)[1][1]<interpolated.axisY);
for(const [baselineStart,baselineEnd] of [[null,2],['',2],[NaN,2],[2,0],[-1,2],[0,3]])
  assert.throws(()=>draw(pair,{baselineCorrect:true,baselineStart,baselineEnd}),/基準/);
const offscreen=draw({...pair,yRange:[.5,1.5]},baselineSettings);
assert.equal(offscreen.axisVisible,false);
assert.deepEqual(texts.map(t=>t.text),['elution time (min)']);
console.log('PASS: per-curve baseline subtraction, interpolated endpoints, zero-axis alignment, preserved negative signal and source, independent zoom and invalid anchors');
const closeLabel=draw(pair,baselineSettings);
assert.ok(closeLabel.label.y-closeLabel.axisY<120,'Default label follows the zero axis closely');
const defaultLabel=draw(source).label;
const movedLabel=draw(source,{labelOffsetX:80,labelOffsetY:-35}).label;
assert.equal(movedLabel.x-defaultLabel.x,80);assert.equal(movedLabel.y-defaultLabel.y,-35);
const clampedLabel=draw(source,{labelOffsetX:2400,labelOffsetY:1400}).label;
assert.ok(clampedLabel.left+clampedLabel.width<=2400&&clampedLabel.top+clampedLabel.height<=1400,'Moved label remains in image');
for(const settings of [{labelOffsetX:NaN},{labelOffsetY:1500}])assert.throws(()=>draw(source,settings),/指定範囲/);
assert.equal(draw(source,{simple:false,axes:false}).label,null);
console.log('PASS: axis-relative compact label position, independent movement, image bounds and hidden-axis mode');

const normalizedSource={datasets:[{name:'A',times:[6,9,11],signal:[0,100,0],color:'#ff0000',yOffset:0},{name:'B',times:[6,9,11],signal:[0,100,0],color:'#0000ff',yOffset:15}],selected:0,overlay:true,start:6,end:11,yRange:[0,130]};
const nf=draw(normalizedSource,{zeroAxis:true,useColors:true,simple:true});
const normalizedCurves=paths.slice(-2);
assert.ok(Math.abs(normalizedCurves[0][1][1]-normalizedCurves[1][1][1]-nf.height*15/130)<1e-10);
draw({...normalizedSource,yRange:[0,110]},{zeroAxis:true,useColors:true,simple:false,axes:true,ylabel:'規格化信号強度（%）'});
assert.ok(texts.some(t=>t.text==='100')&&texts.some(t=>t.text==='規格化信号強度（%）'));
assert.equal(texts.find(t=>t.text==='100').font,'42px -apple-system, sans-serif');
console.log('PASS: normalized percent axis includes 100, 42px default and per-dataset vertical movement');
const shiftedFull=draw({...normalizedSource,datasets:[normalizedSource.datasets[1]],yRange:null},{zeroAxis:true,simple:true});
assert.ok(shiftedFull.ymin<0&&shiftedFull.ymax>115&&shiftedFull.axisVisible,'Automatic full view retains zero axis and shifted peak');

draw({...normalizedSource,datasets:[{...normalizedSource.datasets[0],legendName:'試料A'}]},{zeroAxis:true,useColors:true,simple:true,legend:true});
assert.ok(texts.some(t=>t.text==='試料A')&&!texts.some(t=>t.text==='A'),'Custom legend is used in exported figure');

// Plot geometry is independent of margins and scientific source values.
const beforeGeometry=JSON.stringify(source);
for(const plotAspect of [.75,1,4/3,16/9,2]){
 const f=draw(source,{plotAspect,guides:true,guideInterval:2.5});
 assert.ok(Math.abs(f.width/f.height-plotAspect)<.003);
 assert.ok(canvas.height<8192);
 const vertical=paths.filter(p=>p.length===2&&p[0][0]===p[1][0]&&p[0][1]===f.top&&p[1][1]===f.top+f.height);
 assert.equal(vertical.length,9);
 assert.ok(Math.abs(vertical[1][0][0]-(f.left+f.width*2.5/20))<1e-8);
}
assert.equal(JSON.stringify(source),beforeGeometry);
for(const guideInterval of [0,-1,NaN,.00001])assert.throws(()=>draw(source,{guides:true,guideInterval}),/補助線/);
for(const plotAspect of [-1,.1,5,'bad'])assert.throws(()=>draw(source,{plotAspect}),/縦横比/);
const airy=draw({...normalizedSource,overlay:false,yRange:null},{zeroAxis:true});assert.ok(airy.ymax>=150);
const manual=draw({...normalizedSource,yRange:[0,110]},{zeroAxis:true});assert.equal(manual.ymax,110);
draw();assert.equal(canvas.height,1400);
console.log('PASS: plot aspect ratios, bounded vertical guide spacing, normalized headroom, manual bounds and immutable source');

for(const simple of [true,false]){
 const f=draw(source,{simple,horizontalGuides:true,horizontalInterval:.5});
 const lines=paths.filter(p=>p.length===2&&p[0][1]===p[1][1]&&p[0][0]===f.left&&p[1][0]===f.left+f.width);
 assert.ok(lines.length>=3);
}
for(const horizontalInterval of [0,-1,NaN,.000001])assert.throws(()=>draw(source,{horizontalGuides:true,horizontalInterval}),/横目盛線/);
console.log('PASS: horizontal dotted guides in both styles and invalid interval rejection');

{
 const f=draw(source,{useColors:true,legend:true,legendFontSize:64});
 assert.ok(texts.some(t=>t.text==='test'&&t.font.startsWith('64px')));
 assert.ok(f.legend.left>=0&&f.legend.top>=0&&f.legend.left+f.legend.width<=canvas.width&&f.legend.top+f.legend.height<=canvas.height);
 const shifted=draw(source,{useColors:true,legend:true,legendFontSize:64,legendOffsetX:-150,legendOffsetY:90});
 assert.equal(shifted.legend.left,f.legend.left-150);assert.equal(shifted.legend.top,f.legend.top+90);
 assert.equal(draw(source,{legend:false}).legend,null);
 assert.throws(()=>draw(source,{legendFontSize:0}),/指定範囲/);
 console.log('PASS: image legend font size, placement, bounds and visibility');
}

{
 const f=draw(source,{xTickInterval:2});
 assert.deepEqual(texts.filter(t=>/^\d+$/.test(t.text)).map(t=>t.text),['0','2','4','6','8','10','12','14','16','18','20']);
 draw({...source,start:3.1,end:10.5},{xTickInterval:3});assert.deepEqual(texts.map(t=>t.text),['6','9','elution time (min)']);
 for(const x of [0,-1,.5,NaN,Infinity])assert.throws(()=>draw(source,{xTickInterval:x}),/数字間隔/);
 assert.throws(()=>draw({...source,start:0,end:1000},{xTickInterval:1}),/多すぎ/);
 console.log('PASS: manual integer tick intervals, alignment and excessive/invalid tick rejection');
}

{
 draw(source,{guides:true,guideInterval:2,horizontalGuides:true,horizontalInterval:.5,guideWidth:7,guideOpacity:80});
 const guides=paints.filter(p=>p.color==='rgba(80,100,125,0.8)');assert.ok(guides.length>0);assert.ok(guides.every(p=>p.width===7));
 for(const s of [{guideWidth:0},{guideWidth:21},{guideOpacity:-1},{guideOpacity:101}])assert.throws(()=>draw(source,s),/指定範囲/);
 console.log('PASS: guide thickness and opacity applied to both directions, invalid settings rejected');
}

{
 const f=draw(source,{simple:true,title:'GPC(CHCl3)',titleFontSize:60,titleFontFamily:'Times',titleWidth:1000,titleHeight:180,titleBorder:true});
 assert.ok(f.title&&f.title.left>=f.left&&f.title.top>=f.top);
 assert.ok(texts.some(t=>t.text==='GPC(CHCl3)'&&t.font==='60px "Times New Roman", serif'));
 const moved=draw(source,{title:'GPC(CHCl3)',titleOffsetX:80,titleOffsetY:100,titleWidth:1000,titleHeight:180});
 assert.equal(moved.title.left,f.title.left+80);assert.equal(moved.title.top,f.title.top+100);
 assert.equal(draw(source,{title:''}).title,null);
 const grown=draw(source,{title:'GPC(CHCl3)',titleHeight:40,titleFontSize:100});
 assert.ok(grown.title.height>40&&grown.title.top+grown.title.height<=canvas.height-12);
 const narrow=draw(source,{title:'X',titleWidth:24,titleHeight:24,titleFontSize:160});
 assert.ok(narrow.title.width>=108&&narrow.title.height>24);
 const lines=draw(source,{title:'CHCl3\nGPC',titleRuns:[{text:'CHCl',script:'normal'},{text:'3',script:'sub'},{text:'\nGPC',script:'normal'}],titleWidth:120,titleHeight:24,titleFontSize:96,titleOffsetX:2400,titleOffsetY:6000});
 assert.ok(lines.title.height>100&&lines.title.left+lines.title.width<=2400-12&&lines.title.top+lines.title.height<=canvas.height-12);
 assert.throws(()=>draw(source,{title:'test',titleWidth:23}),/指定範囲/);
 console.log('PASS: title inside simple graph, independent font/size, box position/size, visibility, automatic frame growth and image-edge containment');
}
