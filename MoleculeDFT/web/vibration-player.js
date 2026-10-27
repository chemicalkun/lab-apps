(() => {
'use strict';
function displaced(atoms,mode,amplitude,phase) {
  if(!Array.isArray(mode)||mode.length!==atoms.length||!mode.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))return null;
  const norm=Math.max(...mode.map(v=>Math.hypot(...v)));
  if(!norm||!Number.isFinite(amplitude)||!Number.isFinite(phase))return null;
  const scale=amplitude*Math.sin(phase)/norm;
  return atoms.map((a,i)=>({...a,x:a.x+scale*mode[i][0],y:a.y+scale*mode[i][1],z:a.z+scale*mode[i][2]}));
}
if(typeof module!=='undefined'){module.exports={displaced};return;}
const api=window.MoleculeDFT;
let result=null,index=0,amplitude=.3,phase=0,playing=false,frame=null,start=0,playButton=null;
function stop(){playing=false;phase=0;if(frame!==null)cancelAnimationFrame(frame);frame=null;if(playButton)playButton.textContent='3Dで再生';api.redrawModel();}
function tick(time){if(!playing)return;phase=(time-start)/1000*Math.PI*2/1.8;api.redrawModel();frame=requestAnimationFrame(tick);}
function atoms(data){return data===result&&phase!==0?displaced(data.atoms3d,data.vibrations.normal_modes[index],amplitude,phase):null;}
function mount(area,data){
  stop();result=data;index=0;playButton=null;
  if(!data?.vibrations?.normal_modes?.length)return;
  const controls=document.createElement('div');controls.className='vibration-controls';
  const label=document.createElement('label');label.textContent='振動モード ';
  const select=document.createElement('select');select.id='vibrationMode';
  data.vibrations.frequencies_cm1.forEach((f,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1} · ${Math.abs(f).toFixed(2)} ${f<0?'i ':''}cm⁻¹`;option.disabled=!displaced(data.atoms3d,data.vibrations.normal_modes[i],.3,0);select.append(option);});
  label.append(select);controls.append(label);
  const size=document.createElement('label');size.textContent='表示振幅 ';
  const slider=document.createElement('input');slider.id='vibrationAmplitude';slider.type='range';slider.min='.05';slider.max='.8';slider.step='.05';slider.value=amplitude;
  const value=document.createElement('output');value.textContent=amplitude.toFixed(2)+' Å';slider.oninput=()=>{amplitude=Number(slider.value);value.textContent=amplitude.toFixed(2)+' Å';api.redrawModel();};size.append(slider,value);controls.append(size);
  const note=document.createElement('p');note.className='product-note';note.id='vibrationMotionNote';
  const describe=()=>{const imaginary=data.vibrations.frequencies_cm1[index]<0;note.textContent=(imaginary?'虚振動の変形方向を往復表示しています。実際の周期運動ではありません。':'原子の相対的な変位を表示します。')+' 振幅と再生速度は見やすさのための表示設定で、熱運動・実時間のシミュレーションではありません。計算座標は変更しません。';};
  playButton=document.createElement('button');playButton.id='vibrationPlay';playButton.className='button quiet';playButton.textContent='3Dで再生';
  playButton.disabled=select.selectedOptions[0]?.disabled||api.debugState().busy;
  playButton.onclick=()=>{if(playing){stop();return;}if(api.debugState().busy)return;api.setTab('model');playing=true;start=performance.now();playButton.textContent='停止して元の構造へ';frame=requestAnimationFrame(tick);};
  select.onchange=()=>{stop();index=Number(select.value);playButton.disabled=select.selectedOptions[0]?.disabled||api.debugState().busy;describe();};
  controls.append(playButton);describe();area.insertBefore(note,area.querySelector('table'));area.insertBefore(controls,note);
}
api.on('tab',({tab})=>{if(tab!=='model')stop();});api.on('change',stop);api.on('busy',({busy})=>{if(busy)stop();if(playButton)playButton.disabled=busy;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('blur',stop);
window.MoleculeVibrations={mount,atoms,stop,displaced,status:()=>({playing,index,phase,amplitude})};
api.renderResults();
})();
