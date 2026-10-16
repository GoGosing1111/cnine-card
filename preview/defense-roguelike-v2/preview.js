import {DefenseWorkshop} from '../coop-defense-v1/source/DefenseWorkshop.js';
import {createRoom,joinRoom,startRoom,commandRoom,publicSnapshot} from '../coop-defense-v1/source/defense-model.mjs';
import {settleWaveGrowth} from '../../shared/monster-defense-growth-v2.mjs';
let workshop,room,scene,count=0;
function sync(){workshop.receive(publicSnapshot(room),'p0');}
function show(next){
 workshop?.dispose();scene=next;room=createRoom({id:'PREVIEW-'+Date.now()+'-'+(++count),capacity:2});
 for(let i=0;i<2;i++){const p=joinRoom(room,{id:'p'+i,name:i?'협동 대원':'내 분대'});p.ready=true;}startRoom(room,'p0');
 workshop=new DefenseWorkshop(async command=>{try{if(command.type==='FORGE')room.growthRng=scene==='forge-miss'?1000:0;commandRoom(room,'p0',command);sync();return true;}catch{return false;}});
 room.wave=scene==='trait'?5:1;room.growthRng=scene==='draw-miss'?1000:0;settleWaveGrowth(room);
 if(!scene.startsWith('draw')){workshop.mark(room.players[0].growth.draws[0].id);room.players[0].credits=350;}
 sync();workshop.mode=scene==='trait'?'trait':scene.startsWith('draw')?'draw':'forge';workshop.open();
 const label=document.createElement('div');label.className='dw-preview-label';label.textContent='연출 미리보기 · 시간 정지 · 지정 결과 · 실제 포인트 지급 없음';workshop.root.querySelector('.dw-shell').prepend(label);
}
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>show(b.dataset.scene));
show('draw-win');
