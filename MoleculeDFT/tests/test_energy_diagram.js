const assert=require('node:assert/strict');
const core=require('../web/energy-diagram.js');
const d=core.demo();assert(Math.abs(core.relative(d)[1].relative-12)<1e-10);d.reference='i';assert(Math.abs(core.relative(d)[0].relative-4)<1e-10);d.unit='kJ/mol';assert(Math.abs(core.relative(d)[0].relative-16.736)<1e-10);
const image=core.svg(d);assert.equal((image.match(/data-energy-state=/g)||[]).length,6);assert.equal((image.match(/stroke-dasharray="7 5"/g)||[]).length,5);
d.title='<script>alert(1)</script>';assert(!core.svg(d).includes('<script>'));assert(core.svg(d).includes('&lt;script&gt;'));
for(const mutate of [x=>x.nodes[0].energy=NaN,x=>x.reference='missing',x=>x.edges.push({...x.edges[0]}),x=>x.nodes[0].step=0,x=>{x.kind='G';x.nodes[0].source={};}]){const bad=core.demo();mutate(bad);assert.throws(()=>core.validate(bad));}
const manual=core.demo();manual.kind='G';assert(core.svg(manual).includes('ΔG'));const roundtrip=core.validate(JSON.parse(JSON.stringify(manual)));assert.deepEqual(roundtrip,manual);
console.log('PASS energy diagram: relative units, reference, branches, escaping, input validation, explicit G, JSON roundtrip');
