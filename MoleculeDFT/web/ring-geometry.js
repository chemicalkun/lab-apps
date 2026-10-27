/* Shared-edge placement. Coordinates are transformed as a rigid ring, with a
   uniform scale only to match the existing bond length. Existing atoms win. */
(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const key = (a,b) => [a,b].sort().join('|');
  const limit = a => ({H:1,B:a.charge<0?4:3,C:4,N:a.charge>0?4:3,O:a.charge>0?3:a.charge<0?1:2,F:1,Si:4,P:5,S:6,Cl:1,Br:1,I:1})[a.element]??Infinity;
  function neighbours(graph) {
    const adjacency = new Map(graph.atoms.map(a=>[a.id,[]]));
    for (const b of graph.bonds) { adjacency.get(b.a)?.push({id:b.b,bond:b}); adjacency.get(b.b)?.push({id:b.a,bond:b}); }
    return adjacency;
  }
  function ringPath(bond, adjacency) {
    const pending=[[bond.a]], seen=new Set([bond.a]);
    for(let i=0;i<pending.length;i++) {
      const path=pending[i];
      for(const n of adjacency.get(path[path.length-1])||[]) {
        if(n.bond.id===bond.id||seen.has(n.id))continue;
        if(n.id===bond.b)return [...path,n.id];
        seen.add(n.id);pending.push([...path,n.id]);
      }
    }
    return null;
  }
  function findFusion(fragment,molecule,options={}) {
    const excluded=new Set(options.excludeIds||[]);
    const target={atoms:molecule.atoms.filter(a=>!excluded.has(a.id)),bonds:molecule.bonds.filter(b=>!excluded.has(b.a)&&!excluded.has(b.b))};
    if(fragment.atoms.length<3||!target.bonds.length)return null;
    const sourceAtoms=new Map(fragment.atoms.map(a=>[a.id,a])),targetAtoms=new Map(target.atoms.map(a=>[a.id,a]));
    const sourceAdj=neighbours(fragment),targetAdj=neighbours(target),tolerance=Math.min(22,16/(options.zoom||1));
    const cellSize=tolerance,grid=new Map();
    const cell=a=>[Math.floor(a.x/cellSize),Math.floor(a.y/cellSize)];
    for(const a of target.atoms){const k=cell(a).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(a);}
    function nearby(a){const [x,y]=cell(a),found=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const b of grid.get([x+dx,y+dy].join(','))||[])if(distance(a,b)<=tolerance)found.push(b);return found;}
    const fixedBond=target.bonds.find(b=>b.id===options.bondId);
    const variants=[fragment];
    // Equivalent Kekule choices keep aromatic attachment valid on either side.
    if(fragment.atoms.length===6&&fragment.bonds.length===6&&fragment.atoms.every(a=>a.element==='C'&&sourceAdj.get(a.id).length===2&&sourceAdj.get(a.id).reduce((sum,n)=>sum+n.bond.order,0)===3)&&fragment.bonds.filter(b=>b.order===2).length===3&&fragment.bonds.every(b=>b.order===1||b.order===2)) {
      const alternate=copy(fragment);for(const b of alternate.bonds)b.order=3-b.order;variants.push(alternate);
    }
    const existingPairs=new Set(target.bonds.map(b=>key(b.a,b.b))),existingOrders=new Map(target.atoms.map(a=>[a.id,0]));
    for(const b of target.bonds){existingOrders.set(b.a,existingOrders.get(b.a)+b.order);existingOrders.set(b.b,existingOrders.get(b.b)+b.order);}
    let best=null,bestScore=Infinity;
    for(const sourceBond of fragment.bonds) {
      if(options.rootId&&sourceBond.a!==options.rootId&&sourceBond.b!==options.rootId)continue;
      let sa=sourceAtoms.get(sourceBond.a),sb=sourceAtoms.get(sourceBond.b);
      if(options.rootId===sb.id)[sa,sb]=[sb,sa];
      const starts=fixedBond?[targetAtoms.get(fixedBond.a),targetAtoms.get(fixedBond.b)]:options.anchorId?[targetAtoms.get(options.anchorId)]:nearby(sa);
      for(const ta of starts.filter(Boolean))for(const link of targetAdj.get(ta.id)||[]) {
        const targetBond=link.bond,tb=targetAtoms.get(link.id);
        if(fixedBond&&targetBond.id!==fixedBond.id)continue;
        if(sa.element!==ta.element||sb.element!==tb.element||(sa.charge||0)!==(ta.charge||0)||(sb.charge||0)!==(tb.charge||0))continue;
        const error=distance(sa,ta)+distance(sb,tb);
        if(!fixedBond&&(distance(sa,ta)>tolerance||distance(sb,tb)>tolerance))continue;
        if(!ringPath(sourceBond,sourceAdj))continue;
        const sourceLength=distance(sa,sb),targetLength=distance(ta,tb),scale=targetLength/sourceLength;
        if(!Number.isFinite(scale)||sourceLength<1||targetLength<1||(!fixedBond&&(scale<.85||scale>1.15)))continue;
        const rotation=Math.atan2(tb.y-ta.y,tb.x-ta.x)-Math.atan2(sb.y-sa.y,sb.x-sa.x),cos=Math.cos(rotation),sin=Math.sin(rotation);
        const map={[sa.id]:ta.id,[sb.id]:tb.id};
        const transformed=copy(fragment);
        for(const a of transformed.atoms){const x=(a.x-sa.x)*scale,y=(a.y-sa.y)*scale;a.x=ta.x+x*cos-y*sin;a.y=ta.y+x*sin+y*cos;if(map[a.id]){a.x=targetAtoms.get(map[a.id]).x;a.y=targetAtoms.get(map[a.id]).y;}}
        const added=transformed.atoms.filter(a=>!map[a.id]);
        // Do not snap onto the interior of a ring already occupying this edge.
        const path=ringPath(targetBond,targetAdj),center=added.reduce((p,a)=>({x:p.x+a.x/added.length,y:p.y+a.y/added.length}),{x:0,y:0});
        const side=p=>(tb.x-ta.x)*(p.y-ta.y)-(tb.y-ta.y)*(p.x-ta.x);
        if(path){const others=path.slice(1,-1).map(id=>targetAtoms.get(id)),parent=others.reduce((p,a)=>({x:p.x+a.x/others.length,y:p.y+a.y/others.length}),{x:0,y:0});if(side(parent)*side(center)>1e-6)continue;}
        if(added.some(a=>target.atoms.some(b=>distance(a,b)<Math.min(18,targetLength*.3))))continue;
        const targetChoices=[{}];
        if(variants.length===2&&path?.length===6&&path.every(id=>targetAtoms.get(id).element==='C')){
          const cycle=[targetBond,...path.slice(1).map((id,i)=>target.bonds.find(b=>key(b.a,b.b)===key(path[i],id)))];
          if(cycle.length===6&&cycle.every(b=>b&&(b.order===1||b.order===2))&&path.every(id=>cycle.filter(b=>b.a===id||b.b===id).reduce((n,b)=>n+b.order,0)===3))targetChoices.push(Object.fromEntries(cycle.map(b=>[b.id,3-b.order])));
        }
        for(const [targetIndex,targetOrders] of targetChoices.entries())for(const [variantIndex,variant] of variants.entries()) {
          const shared=variant.bonds.find(b=>key(b.a,b.b)===key(sa.id,sb.id));
          if(variants.length===2&&shared.order!==(targetOrders[targetBond.id]??targetBond.order))continue;
          const orders=new Map(existingOrders);
          for(const b of target.bonds)if(targetOrders[b.id]!==undefined){const delta=targetOrders[b.id]-b.order;orders.set(b.a,orders.get(b.a)+delta);orders.set(b.b,orders.get(b.b)+delta);}
          for(const a of variant.atoms)if(!map[a.id])orders.set('new:'+a.id,0);
          for(const b of variant.bonds){const a=map[b.a]||'new:'+b.a,c=map[b.b]||'new:'+b.b;if(map[b.a]&&map[b.b]&&existingPairs.has(key(a,c)))continue;orders.set(a,(orders.get(a)||0)+b.order);orders.set(c,(orders.get(c)||0)+b.order);}
          if(variant.atoms.some(a=>{const id=map[a.id]||'new:'+a.id,atom=map[a.id]?targetAtoms.get(id):a;return orders.get(id)>Math.max(limit(atom),existingOrders.get(id)||0);}))continue;
          let score=error+variantIndex*.01+targetIndex*.1;
          if(fixedBond){score=targetIndex*.1+variantIndex*.01+distance(sa,ta)*.0001;if(options.point&&Math.abs(side(options.point))/targetLength>8/(options.zoom||1)&&side(options.point)*side(center)<0)score+=1000;}
          if(score<bestScore){bestScore=score;best={graph:{...transformed,bonds:copy(variant.bonds)},map,targetOrders,bondId:targetBond.id,rotation:rotation*180/Math.PI};}
        }
      }
    }
    return best;
  }
  const api={findFusion};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.MoleculeRingGeometry=api;
})();
