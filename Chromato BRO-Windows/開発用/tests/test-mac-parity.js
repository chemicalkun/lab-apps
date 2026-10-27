const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('MAC_SOURCE_BASELINE.json'));
for(const [name,hash] of Object.entries(manifest)){
 let data=fs.readFileSync(name);
 if(name.endsWith('/index.html'))data=Buffer.from(data.toString().replace('バージョン 26.10.21','バージョン 26.10.21').replaceAll('Ctrl+','⌘').replace('%LOCALAPPDATA%\\GPCAnalyzer\\session-v1.json','~/Library/Application Support/jp.gpcmac.analyzer.native/session-v1.json').replace('処理はこのPC内で完結','処理はMac内で完結').replace('<script src="windows-bridge.js"></script>\n',''));
 if(name.endsWith('/graph-export.js'))data=Buffer.from(data.toString().replaceAll('Ctrl+V','⌘V'));
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),hash,name);
}
console.log('PASS: all Mac 26.10.21 assets match, including CSS, legend/project UI and numerical engines; only documented Windows text/bridge changes');
