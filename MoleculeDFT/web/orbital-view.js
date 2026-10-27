/* Local, dependency-free rendering of actual scalar molecular-orbital grids. */
(function(root){
'use strict';
const BOHR=0.529177210903;
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
function mesh(grid,iso){
 const [nx,ny,nz]=grid.shape, triangles=[];
 if(![nx,ny,nz].every(n=>Number.isInteger(n)&&n>=2&&n<=64)||grid.values.length!==nx*ny*nz)throw Error('軌道グリッドが不正です');
 const at=(x,y,z)=>(x*ny+y)*nz+z;
 const position=(x,y,z)=>grid.origin_bohr.map((v,k)=>(v+x*grid.axes_bohr[0][k]+y*grid.axes_bohr[1][k]+z*grid.axes_bohr[2][k])*BOHR);
 for(let x=0;x<nx-1;x++)for(let y=0;y<ny-1;y++)for(let z=0;z<nz-1;z++){
  const v=offsets.map(o=>grid.values[at(x+o[0],y+o[1],z+o[2])]);
  for(const sign of [1,-1]){
   if(v.every(a=>sign*a<iso)||v.every(a=>sign*a>=iso))continue;
   const p=offsets.map(o=>position(x+o[0],y+o[1],z+o[2]));
   for(const t of tetra){
    const inside=t.filter(i=>sign*v[i]>=iso),outside=t.filter(i=>sign*v[i]<iso);
    if(!inside.length||!outside.length)continue;
    const cross=(a,b)=>mix(p[a],p[b],(sign*iso-v[a])/(v[b]-v[a]));
    if(inside.length===1){const a=inside[0];triangles.push({p:outside.map(b=>cross(a,b)),sign});}
    else if(inside.length===3){const a=outside[0];triangles.push({p:inside.map(b=>cross(a,b)),sign});}
    else {const [a,b]=inside,[c,d]=outside,ac=cross(a,c),ad=cross(a,d),bc=cross(b,c),bd=cross(b,d);triangles.push({p:[ac,ad,bc],sign},{p:[ad,bd,bc],sign});}
   }
  }
 }
 return triangles;
}
const numbers={H:1,B:5,C:6,N:7,O:8,F:9,Si:14,P:15,S:16,Cl:17,Br:35,I:53};
function cube(grid,atoms){
 const fmt=n=>Number(n).toExponential(6);
 const lines=['Molecule DFT / '+grid.label+' '+(grid.spin||''),'Orbital amplitude; coordinates in bohr; x,y,z ordering'];
 lines.push(`${atoms.length} ${grid.origin_bohr.map(fmt).join(' ')}`);
 grid.axes_bohr.forEach((v,i)=>lines.push(`${grid.shape[i]} ${v.map(fmt).join(' ')}`));
 atoms.forEach(a=>lines.push(`${numbers[a.element]||0} 0.0 ${[a.x,a.y,a.z].map(v=>fmt(v/BOHR)).join(' ')}`));
 for(let i=0;i<grid.values.length;i+=6)lines.push(grid.values.slice(i,i+6).map(fmt).join(' '));
 return lines.join('\n')+'\n';
}
class Viewer{
 constructor(canvas){this.canvas=canvas;this.rotation=[-.25,.5];this.mode='orbitals';this.triangles=[];this.result=null;this.zoom=1;let drag;
 canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY,...this.rotation];canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;this.rotation=[drag[2]+(e.clientY-drag[1])*.009,drag[3]+(e.clientX-drag[0])*.009];this.draw();});
 canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.min(3,Math.max(.3,this.zoom*Math.exp(-e.deltaY*.001)));this.draw();},{passive:false});
 }
 set(result,mode,grid,iso){this.result=result;this.mode=mode;this.triangles=mode==='orbitals'&&grid?mesh(grid,iso):[];this.draw();}
 draw(){
  const c=this.canvas,r=c.getBoundingClientRect();if(!r.width||!r.height||!this.result)return;
  const ratio=window.devicePixelRatio||1;c.width=r.width*ratio;c.height=r.height*ratio;const ctx=c.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,r.width,r.height);
  const atoms=this.result.atoms3d||[],center=[0,0,0];atoms.forEach(a=>[a.x,a.y,a.z].forEach((v,i)=>center[i]+=v/atoms.length));
  let radius=2;atoms.forEach(a=>radius=Math.max(radius,Math.hypot(a.x-center[0],a.y-center[1],a.z-center[2])));radius+=2;
  const scale=Math.min(r.width,r.height)*.43/radius*this.zoom,[rx,ry]=this.rotation;
  const project=p=>{const [x,y,z]=p.map((v,i)=>v-center[i]),a=x*Math.cos(ry)+z*Math.sin(ry),b=-x*Math.sin(ry)+z*Math.cos(ry);return[a*scale+r.width/2,(y*Math.cos(rx)-b*Math.sin(rx))*-scale+r.height/2,y*Math.sin(rx)+b*Math.cos(rx)];};
  const objects=this.triangles.map(t=>{const p=t.p.map(project);return{kind:'surface',p,sign:t.sign,z:p.reduce((a,b)=>a+b[2],0)/3};});
  const points=atoms.map(a=>project([a.x,a.y,a.z]));
  (this.result.bonds3d||[]).forEach(b=>{if(points[b.a]&&points[b.b])objects.push({kind:'bond',p:[points[b.a],points[b.b]],z:(points[b.a][2]+points[b.b][2])/2});});
  atoms.forEach((a,i)=>objects.push({kind:'atom',a,i,p:points[i],z:points[i][2]}));objects.sort((a,b)=>a.z-b.z);
  const colors={H:'#edf1e7',C:'#5d7569',N:'#6287c0',O:'#d68169',F:'#82b080',Cl:'#82b080',S:'#d5b55e'};
  for(const o of objects){if(o.kind==='surface'){
   const [a,b,d]=o.p,ux=b[0]-a[0],uy=b[1]-a[1],uz=(b[2]-a[2])*scale,vx=d[0]-a[0],vy=d[1]-a[1],vz=(d[2]-a[2])*scale,nz=ux*vy-uy*vx,len=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,nz),light=.65+.35*Math.abs(nz/(len||1));
   const rgb=o.sign>0?[82,136,199]:[218,133,104];ctx.fillStyle=`rgba(${rgb.map(v=>Math.round(v*light)).join(',')},.88)`;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(d[0],d[1]);ctx.closePath();ctx.fill();
  }else if(o.kind==='bond'){ctx.strokeStyle='#82958a';ctx.lineWidth=Math.max(2,scale*.085);ctx.beginPath();ctx.moveTo(...o.p[0].slice(0,2));ctx.lineTo(...o.p[1].slice(0,2));ctx.stroke();}
  else {const q=this.result.charges?.values?.[o.i]||0;ctx.fillStyle=this.mode==='charges'?`hsl(${q>=0?15:215} 55% ${90-Math.min(1,Math.abs(q))*45}%)`:colors[o.a.element]||'#a39ba9';ctx.strokeStyle='#6b8078';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(o.p[0],o.p[1],Math.max(3,Math.min(14,scale*(o.a.element==='H'?.12:.2))),0,Math.PI*2);ctx.fill();ctx.stroke();if(this.mode==='charges'&&atoms.length<50){ctx.fillStyle='#294a3c';ctx.font='10px sans-serif';ctx.fillText(`${o.i+1} ${q.toFixed(2)}`,o.p[0]+7,o.p[1]-7);}}
  }
 }
}
const api={mesh,cube,Viewer};if(typeof module!=='undefined')module.exports=api;root.MoleculeDFTOrbitals=api;
})(typeof window==='undefined'?globalThis:window);
