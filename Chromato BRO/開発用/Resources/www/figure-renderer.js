/* Shared deterministic figure rendering for both export entry points. */
(() => {
  'use strict';
  const width=2400;
  const number=value=>Number(value.toPrecision(5)).toLocaleString('ja-JP',{maximumFractionDigits:6});
  const fonts={system:'-apple-system, sans-serif',Arial:'Arial, sans-serif',Helvetica:'Helvetica, sans-serif',Times:'"Times New Roman", serif',Georgia:'Georgia, serif',Courier:'"Courier New", monospace'};
  function integerTicks(start,end,interval){
    if(interval!==undefined&&interval!==null&&String(interval).trim()!==''){
      const step=Number(interval);
      if(!Number.isSafeInteger(step)||step<1)throw Error('横軸の数字間隔は1以上の整数で指定してください。');
      const first=Math.ceil(start/step),last=Math.floor(end/step);
      if(last-first+1>200)throw Error('横軸の数字が多すぎます。表示間隔を広げてください。');
      return Array.from({length:Math.max(0,last-first+1)},(_,i)=>{const n=(first+i)*step;return Object.is(n,-0)?0:n;});
    }
    const target=Math.max(1,(end-start)/5),power=10**Math.floor(Math.log10(target));
    const step=[1,2,5,10].map(n=>n*power).find(n=>n>=target);
    const ticks=[];
    for(let t=Math.ceil(start/step)*step;t<=end&&ticks.length<100;t+=step){if(t>=start)ticks.push(Object.is(t,-0)?0:t);if(t+step===t)break;}
    return ticks;
  }
  function draw(canvas,source,settings={}){
    const ctx=canvas.getContext('2d');let height=1400;canvas.width=width;canvas.height=height;
    const shortened=(text,maxWidth)=>{let label=text;while(label.length&&ctx.measureText(label).width>maxWidth)label=label.slice(0,-1);return label===text?label:label.slice(0,-1)+'…';};
    const selected=source.datasets[source.selected];
    const datasets=source.overlay?source.datasets:[selected].filter(Boolean);
    const start=source.start,end=source.end;
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('表示時間は有限の数値で、終了を開始より大きくしてください。');
    const visible=datasets.filter(d=>d.times[0]<=end && d.times.at(-1)>=start);
    if(!visible.length)throw Error('この範囲に測定データがありません。');
    const corrected=settings.baselineCorrect===true;
    const baselineStart=Number(settings.baselineStart),baselineEnd=Number(settings.baselineEnd);
    const baselines=new Map();
    if(corrected){
      if(settings.baselineStart==null||settings.baselineEnd==null||String(settings.baselineStart).trim()===''||String(settings.baselineEnd).trim()===''||!Number.isFinite(baselineStart)||!Number.isFinite(baselineEnd)||baselineEnd<=baselineStart)
        throw Error('横軸の基準線は、始点より終点を後の時刻にしてください。');
      for(const d of datasets){
        if(baselineStart<d.times[0]||baselineEnd>d.times.at(-1))throw Error(`${d.name}：横軸の基準点が測定時間の範囲外です。`);
        const first=GPCCore.interp(d.times,d.signal,baselineStart),last=GPCCore.interp(d.times,d.signal,baselineEnd);
        baselines.set(d,{first,slope:(last-first)/(baselineEnd-baselineStart)});
      }
    }
    const signal=(d,t,v)=>{const b=baselines.get(d);return (b?v-(b.first+b.slope*(t-baselineStart)):v)+(d.yOffset??0);};
    let ymin=(corrected||settings.zeroAxis)?0:Infinity,ymax=(corrected||settings.zeroAxis)?0:-Infinity;
    for(const d of visible){
      const a=Math.max(start,d.times[0]),b=Math.min(end,d.times.at(-1));
      for(const v of [signal(d,a,GPCCore.interp(d.times,d.signal,a)),signal(d,b,GPCCore.interp(d.times,d.signal,b))]){ymin=Math.min(ymin,v);ymax=Math.max(ymax,v);}
      for(let i=0;i<d.times.length;i++)if(d.times[i]>=a&&d.times[i]<=b){const v=signal(d,d.times[i],d.signal[i]);ymin=Math.min(ymin,v);ymax=Math.max(ymax,v);}
    }
    const padding=Math.max((ymax-ymin)*.09,Math.max(Math.abs(ymin),Math.abs(ymax),1)*.001);
    ymin-=padding;ymax+=settings.zeroAxis?Math.max(padding,(ymax-ymin)*.5):padding;
    if(source.yRange){[ymin,ymax]=source.yRange;}
    if(![ymin,ymax,ymax-ymin,end-start].every(Number.isFinite)||ymax<=ymin)throw Error('表示範囲が不正です。');
    const bounded=(key,fallback,min,max)=>{const v=Number(settings[key]??fallback);if(!Number.isFinite(v)||v<min||v>max)throw Error('線幅・文字サイズの値が指定範囲外です。');return v;};
    const axisWidth=bounded('axisWidth',3,.5,20),curveWidth=bounded('curveWidth',4,.5,20),tickFontSize=bounded('tickFontSize',42,12,96),labelFontSize=bounded('labelFontSize',42,12,96);
    const legendSize=bounded('legendFontSize',42,12,96),legendDX=bounded('legendOffsetX',0,-2400,2400),legendDY=bounded('legendOffsetY',0,-1400,1400);
    const guideWidth=bounded('guideWidth',2,.5,20),guideOpacity=bounded('guideOpacity',55,0,100);
    const labelDX=bounded('labelOffsetX',0,-2400,2400),labelDY=bounded('labelOffsetY',0,-1400,1400);
    const fontFamily=fonts[settings.fontFamily??'system'];if(!fontFamily)throw Error('フォントを選択してください。');
    const ticks=integerTicks(start,end,settings.xTickInterval);
    const simple=settings.simple!==false;
    const axes=!simple&&settings.axes,legend=(!simple||settings.useColors)&&settings.legend;
    const legendItems=visible.slice(0,20);
    const title=String(settings.title||'');
    ctx.font=`${tickFontSize}px ${fontFamily}`;
    const halfTick=Math.max(0,...ticks.map(t=>ctx.measureText(String(t)).width/2))+20;
    const margin={left:Math.max(axes?210:85,halfTick),right:Math.max(80,halfTick),top:80,bottom:((axes||simple)?Math.max(160,tickFontSize+labelFontSize+93):65)};
    const tickOffset=tickFontSize+20;
    const w=width-margin.left-margin.right;
    if(settings.plotAspect){
      const ratio=Number(settings.plotAspect);
      if(!Number.isFinite(ratio)||ratio<.5||ratio>4)throw Error('グラフの縦横比は横÷縦で0.5〜4にしてください。');
      height=Math.round(w/ratio+margin.top+margin.bottom);canvas.height=height;
    }
    const h=height-margin.top-margin.bottom;
    const guides=[],horizontalGuides=[];
    if(settings.guides){
      const interval=Number(settings.guideInterval);
      if(!Number.isFinite(interval)||interval<=0)throw Error('補助線の間隔は0より大きい分数を入力してください。');
      const first=Math.ceil(start/interval),last=Math.floor(end/interval);
      if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last-first+1>500)throw Error('補助線が多すぎます。間隔を広げてください（最大500本）。');
      for(let i=first;i<=last;i++)guides.push(i*interval);
    }
    if(settings.horizontalGuides){
      const interval=Number(settings.horizontalInterval);
      if(!Number.isFinite(interval)||interval<=0)throw Error('横目盛線の間隔は0より大きい数値を入力してください。');
      const first=Math.ceil(ymin/interval),last=Math.floor(ymax/interval);
      if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last-first+1>500)throw Error('横目盛線が多すぎます。間隔を広げてください（最大500本）。');
      for(let i=first;i<=last;i++)horizontalGuides.push(i*interval);
    }
    const X=t=>margin.left+(t-start)/(end-start)*w,Y=v=>margin.top+(ymax-v)/(ymax-ymin)*h;
    const axisY=(corrected||settings.zeroAxis)?Y(0):margin.top+h,axisVisible=axisY>=margin.top&&axisY<=margin.top+h;
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    ctx.font=`${tickFontSize}px ${fontFamily}`;
    for(const t of ticks){
      const x=X(t);
      if(!simple&&settings.grid){ctx.strokeStyle='#e6eaf0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,margin.top);ctx.lineTo(x,margin.top+h);ctx.stroke();}
      if((axes||simple)&&axisVisible){
        ctx.fillStyle=simple?'#111':'#4e6078';ctx.textAlign='center';ctx.fillText(String(t),x,axisY+tickOffset);
        if(simple||corrected||settings.zeroAxis){ctx.strokeStyle='#111';ctx.lineWidth=axisWidth;ctx.beginPath();ctx.moveTo(x,axisY);ctx.lineTo(x,axisY+12);ctx.stroke();}
      }
    }
    let yTicks=Array.from({length:6},(_,i)=>ymin+(ymax-ymin)*i/5);
    if(settings.zeroAxis){
      const target=(ymax-ymin)/5,power=10**Math.floor(Math.log10(target));
      const step=[1,2,5,10].map(n=>n*power).filter(n=>n<=target).at(-1)||power;
      yTicks=[];for(let v=Math.ceil(ymin/step)*step;v<=ymax&&yTicks.length<100;v+=step){yTicks.push(v);if(v+step===v)break;}
    }
    if(!simple)for(const v of yTicks){
      const y=Y(v);
      if(settings.grid){ctx.strokeStyle='#e6eaf0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin.left,y);ctx.lineTo(margin.left+w,y);ctx.stroke();}
      if(axes){ctx.fillStyle='#4e6078';ctx.textAlign='right';ctx.fillText(number(v),margin.left-20,y+tickFontSize/3);}
    }
    if(axes){
      ctx.strokeStyle='#8998ab';ctx.lineWidth=axisWidth;if(!corrected&&!settings.zeroAxis)ctx.strokeRect(margin.left,margin.top,w,h);else{ctx.beginPath();ctx.moveTo(margin.left,margin.top+h);ctx.lineTo(margin.left,margin.top);ctx.lineTo(margin.left+w,margin.top);ctx.lineTo(margin.left+w,margin.top+h);ctx.stroke();}
      ctx.font=`32px ${fontFamily}`;ctx.save();ctx.translate(52,margin.top+h/2);ctx.rotate(-Math.PI/2);ctx.fillText(settings.ylabel||'検出器信号',0,0);ctx.restore();
    }
    if((simple||axes)&&axisVisible&&(simple||corrected||settings.zeroAxis)){
      ctx.strokeStyle='#111';ctx.lineWidth=axisWidth;ctx.beginPath();ctx.moveTo(margin.left,axisY);ctx.lineTo(margin.left+w,axisY);ctx.stroke();
    }
    // Include neighbouring samples and clip segments to retain narrow peaks and range boundaries.
    ctx.save();ctx.beginPath();ctx.rect(margin.left,margin.top,w,h);ctx.clip();
    if(guides.length||horizontalGuides.length){
      ctx.save();ctx.strokeStyle=`rgba(80,100,125,${guideOpacity/100})`;ctx.lineWidth=guideWidth;ctx.lineCap='round';ctx.setLineDash([1,Math.max(9,guideWidth*4)]);
      for(const v of horizontalGuides){ctx.beginPath();ctx.moveTo(margin.left,Y(v));ctx.lineTo(margin.left+w,Y(v));ctx.stroke();}
      for(const t of guides){ctx.beginPath();ctx.moveTo(X(t),margin.top);ctx.lineTo(X(t),margin.top+h);ctx.stroke();}
      ctx.restore();
    }
    for(const d of visible){
      ctx.beginPath();let started=false;
      for(let i=0;i<d.times.length;i++){
        if((i+1<d.times.length&&d.times[i+1]<start)||(i>0&&d.times[i-1]>end))continue;
        const x=X(d.times[i]),y=Y(signal(d,d.times[i],d.signal[i]));if(!started){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=simple&&!settings.useColors?'#111':d.color;ctx.lineWidth=curveWidth;ctx.lineJoin='round';ctx.stroke();
    }
    ctx.restore();
    let label=null;
    if(simple||axes){
      const text='elution time (min)';ctx.font=`${labelFontSize}px ${fontFamily}`;
      const metrics=ctx.measureText(text),ascent=metrics.actualBoundingBoxAscent??labelFontSize*.8,descent=metrics.actualBoundingBoxDescent??labelFontSize*.2;
      const defaultX=margin.left+w/2,defaultY=(axisVisible?axisY:margin.top+h)+tickOffset+tickFontSize*.25+ascent+10;
      const x=Math.max(metrics.width/2+12,Math.min(width-metrics.width/2-12,defaultX+labelDX));
      const y=Math.max(ascent+12,Math.min(height-descent-12,defaultY+labelDY));
      ctx.fillStyle=simple?'#111':'#304560';ctx.textAlign='center';ctx.fillText(text,x,y);
      label={x,y,left:x-metrics.width/2-8,top:y-ascent-8,width:metrics.width+16,height:ascent+descent+16,offsetX:x-defaultX,offsetY:y-defaultY};
    }
    let legendBox=null;
    if(legend){
      ctx.font=`${legendSize}px ${fontFamily}`;ctx.textAlign='left';
      const rowHeight=legendSize*1.4,rows=legendItems.length+(visible.length>20?1:0);
      const boxWidth=Math.min(width-24,Math.max(180,...legendItems.map(d=>ctx.measureText(d.legendName||d.name).width+94)));
      const boxHeight=rows*rowHeight+16;
      if(boxHeight>height-24)throw Error('凡例が画像に収まりません。文字サイズを小さくしてください。');
      const defaultX=width-margin.right-boxWidth,defaultY=margin.top+16;
      const x=Math.max(12,Math.min(width-boxWidth-12,defaultX+legendDX));
      const y=Math.max(12,Math.min(height-boxHeight-12,defaultY+legendDY));
      legendBox={left:x,top:y,width:boxWidth,height:boxHeight,offsetX:x-defaultX,offsetY:y-defaultY};
      legendItems.forEach((d,i)=>{
        const baseline=y+8+legendSize+i*rowHeight;
        ctx.strokeStyle=d.color;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x+8,baseline-legendSize*.3);ctx.lineTo(x+60,baseline-legendSize*.3);ctx.stroke();
        ctx.fillStyle='#304560';ctx.fillText(shortened(d.legendName||d.name,boxWidth-86),x+78,baseline);
      });
      if(visible.length>20)ctx.fillText(`ほか ${visible.length-20} ファイル`,x+8,y+8+legendSize+legendItems.length*rowHeight);
    }
    let titleBox=null;
    if(title.trim()){
      const size=bounded('titleFontSize',54,12,160),boxWidth=bounded('titleWidth',400,24,2200),boxHeight=bounded('titleHeight',100,24,1000);
      const dx=bounded('titleOffsetX',0,-2400,2400),dy=bounded('titleOffsetY',0,-6000,6000),family=fonts[settings.titleFontFamily??'system'];
      if(!family)throw Error('タイトルのフォントを選択してください。');
      if(boxHeight>height-24)throw Error('タイトル枠が画像に収まりません。高さを小さくしてください。');
      const defaultX=margin.left+20,defaultY=margin.top+20;
      const x=Math.max(12,Math.min(width-boxWidth-12,defaultX+dx)),y=Math.max(12,Math.min(height-boxHeight-12,defaultY+dy));
      titleBox={left:x,top:y,width:boxWidth,height:boxHeight,offsetX:x-defaultX,offsetY:y-defaultY};
      const layout=window.GPCTitleText.layout(ctx,title,settings.titleRuns||[],size,family,boxWidth);
      if(layout.height>boxHeight)throw Error('タイトルが枠に収まりません。枠を広げるか文字サイズを小さくしてください。');
      ctx.save();ctx.beginPath();ctx.rect(x,y,boxWidth,boxHeight);ctx.clip();
      if(settings.titleBorder){ctx.fillStyle='#fff';ctx.fillRect(x,y,boxWidth,boxHeight);ctx.strokeStyle='#304560';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,boxWidth-2,boxHeight-2);}
      ctx.fillStyle='#172e4e';ctx.textAlign='left';ctx.textBaseline='alphabetic';
      for(const run of layout.runs){ctx.font=`${run.size}px ${family}`;ctx.fillText(run.text,x+run.x,y+run.y);}ctx.restore();
    }
    return {left:margin.left,top:margin.top,width:w,height:h,xmin:start,xmax:end,ymin,ymax,axisY,axisVisible,baselineCorrected:corrected,label,legend:legendBox,title:titleBox};
  }
  // Crop only wholly white rows below the last drawn pixel. Curves, labels and legends are retained.
  function trimBottom(canvas,padding=24){
    const {width,height}=canvas,ctx=canvas.getContext('2d');
    const pixels=ctx.getImageData(0,0,width,height).data;
    let last=-1;
    outer:for(let y=height-1;y>=0;y--)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,alpha=pixels[i+3]/255;
      if(alpha>0&&Math.min(pixels[i],pixels[i+1],pixels[i+2])*alpha+255*(1-alpha)<254){last=y;break outer;}
    }
    if(last<0)return canvas;
    const targetHeight=Math.min(height,last+1+padding);if(targetHeight===height)return canvas;
    const result=document.createElement('canvas');result.width=width;result.height=targetHeight;
    result.getContext('2d').drawImage(canvas,0,0);return result;
  }
  function titleSize(canvas,text,runs,size,font,maxWidth=2200){if(!Number.isFinite(size)||size<12||size>160)throw Error('タイトルの文字サイズは12〜160pxで指定してください。');const ctx=canvas.getContext('2d'),family=fonts[font];if(!family)throw Error('タイトルのフォントを選択してください。');ctx.save();try{return window.GPCTitleText.layout(ctx,text,runs,size,family,maxWidth);}finally{ctx.restore();}}
  window.GPCFigure={titleSize,titleFonts:fonts,trimBottom,ticks:integerTicks,draw,create:(source,settings)=>{const canvas=document.createElement('canvas');draw(canvas,source,settings);return canvas;}};
})();
