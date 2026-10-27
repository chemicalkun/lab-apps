const assert=require('node:assert/strict');
const {findFusion}=require('../web/ring-geometry.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function ring(n,prefix,aromatic=false,scale=1){const r=56*scale/(2*Math.sin(Math.PI/n));return {atoms:Array.from({length:n},(_,i)=>({id:prefix+i,element:'C',charge:0,x:r*Math.cos(i*2*Math.PI/n),y:r*Math.sin(i*2*Math.PI/n)})),bonds:Array.from({length:n},(_,i)=>({id:prefix+'b'+i,a:prefix+i,b:prefix+((i+1)%n),order:aromatic&&i%2===0?2:1}))};}
function validCandidate(f,parent,size=56){assert(f);assert.equal(Object.keys(f.map).length,2);for(const [a,b] of Object.entries(f.map)){const sa=f.graph.atoms.find(x=>x.id===a),ta=parent.atoms.find(x=>x.id===b);assert.equal(sa.x,ta.x);assert.equal(sa.y,ta.y);}for(const bond of f.graph.bonds){const a=f.graph.atoms.find(a=>a.id===bond.a),b=f.graph.atoms.find(a=>a.id===bond.b);assert(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-size)<1e-6);}}
const pentagon=ring(5,'p'),source=ring(5,'s'),original=JSON.stringify([pentagon,source]);
for(const bond of pentagon.bonds){const f=findFusion(source,pentagon,{bondId:bond.id});validCandidate(f,pentagon);const root=Object.keys(f.map)[0],anchor=f.graph.atoms.find(a=>a.id===root),near=clone(f.graph),angle=5*Math.PI/180;for(const a of near.atoms){const x=a.x-anchor.x,y=a.y-anchor.y;a.x=anchor.x+x*Math.cos(angle)-y*Math.sin(angle);a.y=anchor.y+x*Math.sin(angle)+y*Math.cos(angle);}validCandidate(findFusion(near,pentagon,{rootId:root,anchorId:f.map[root],zoom:1.5}),pentagon);}
assert.equal(JSON.stringify([pentagon,source]),original,'fusion must not mutate either input');
console.log('PASS: every pentagon edge supports exact and nearby shared-edge placement');
const ideal=findFusion(source,pentagon,{bondId:pentagon.bonds[0].id});
const moving=clone(ideal.graph);for(const a of moving.atoms){a.x+=5;a.y+=3;}
const separate={atoms:[...pentagon.atoms,...moving.atoms],bonds:[...pentagon.bonds,...moving.bonds]};
validCandidate(findFusion(moving,separate,{excludeIds:moving.atoms.map(a=>a.id),zoom:2}),pentagon);
for(const a of moving.atoms)a.x+=200;
assert.equal(findFusion(moving,pentagon,{zoom:1}),null);
assert.equal(findFusion(source,ring(5,'q'),{zoom:1}),null,'coincident rings must not collapse onto the same interior');
console.log('PASS: moving fragments snap nearby, without merging distant or coincident rings');
const benzene=ring(6,'b',true),newBenzene=ring(6,'a',true);
for(const bond of benzene.bonds){const f=findFusion(newBenzene,benzene,{bondId:bond.id});validCandidate(f,benzene);const orders=new Map(benzene.atoms.map(a=>[a.id,0]));for(const b of benzene.bonds){const order=f.targetOrders?.[b.id]??b.order;orders.set(b.a,orders.get(b.a)+order);orders.set(b.b,orders.get(b.b)+order);}assert.equal(f.graph.bonds.filter(b=>b.order===2).length,3);const shared=f.graph.bonds.find(b=>f.map[b.a]&&f.map[b.b]);assert.equal(shared.order,f.targetOrders?.[bond.id]??bond.order);assert.equal(benzene.bonds.filter(b=>(f.targetOrders?.[b.id]??b.order)===2).length,3);for(const b of f.graph.bonds){if(f.map[b.a]&&f.map[b.b])continue;for(const id of [b.a,b.b])if(f.map[id])orders.set(f.map[id],orders.get(f.map[id])+b.order);}assert([...orders.values()].every(n=>n<=4));}
console.log('PASS: aromatic rings fuse on single and double edges without pentavalent carbon');
const cumulene=ring(6,'c');cumulene.bonds.forEach((b,i)=>b.order=i<3?2:1);
for(const bond of benzene.bonds){const f=findFusion(cumulene,benzene,{bondId:bond.id});if(f)assert.deepEqual(f.graph.bonds.map(b=>b.order),cumulene.bonds.map(b=>b.order),'non-alternating double bonds must not be changed as a Kekule alternative');}
console.log('PASS: non-alternating unsaturated rings retain their original bond orders');
const stretched=ring(5,'l',false,1.04);validCandidate(findFusion(source,stretched,{bondId:stretched.bonds[0].id}),stretched,56*1.04);
const oxygen=ring(5,'o');for(const a of oxygen.atoms)a.element='O';assert.equal(findFusion(source,oxygen,{bondId:oxygen.bonds[0].id}),null);
const saturated=clone(pentagon);for(let i=0;i<2;i++){saturated.atoms.push({id:'h'+i,element:'C',charge:0,x:300+i*56,y:0});saturated.bonds.push({id:'cap'+i,a:'p'+i,b:'h'+i,order:2});}assert.equal(findFusion(source,saturated,{bondId:saturated.bonds[0].id}),null);
console.log('PASS: scale matches the existing edge; element mismatch and overvalence reject fusion');
