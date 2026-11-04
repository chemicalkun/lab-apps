const assert=require('node:assert/strict'),{legendName}=require('../Resources/www/figure-data');
for(const name of ['44.crm','44.csv','CPF 301.crm','sample.v1.csv','.csv'])assert.equal(legendName(name),name);
for(const name of ['44.crm','44.csv','44.CRM','44.txt','44'])assert.equal(legendName(name,{runNumbers:true}),'run44');
assert.equal(legendName('044.crm',{runNumbers:true}),'run044');
for(const name of ['CPF 301.crm','sample44.csv','44.1.csv',' 44.crm','44.png'])assert.equal(legendName(name,{runNumbers:true}),name);
for(const [name,result] of [['44.crm','44'],['sample.v1.csv','sample.v1'],['CPF 301.crm','CPF 301'],['noextension','noextension'],['.csv','.csv']])assert.equal(legendName(name,{stripExtension:true}),result);
assert.equal(legendName('44.crm',{runNumbers:true,stripExtension:true}),'run44');
assert.equal(legendName('CPF 301.csv',{runNumbers:true,stripExtension:true}),'CPF 301');
console.log('PASS: default unchanged, optional run naming, exact numeric patterns, extension-only naming and combined priority');

for(const n of ['0','45','120','2026'])assert.equal(legendName(n+'.crm',{runNumbers:true}),'run'+n);
