import {mercenaryVehicleSupport, vehicleBuffText} from '../../shared/mercenary-vehicle-support-v1.mjs';
const query=new URLSearchParams(location.search);
const modes={tower:'무한의 탑',pve:'몬스터 토벌',hunt:'군단 토벌',pvp:'개인 랭크전',duo:'듀오 랭크전'};
const cars={helios:['HELIOS_R','헬리오스-R'],aether:['AETHER_ZERO','에테르 제로'],rolls:['ROLLS_ROYCE_HYPERCAR','롤스로이스 하이퍼카'],bmw:['BMW_M9','BMW M9'],vector:['VECTOR_GT','벡터-GT'],astra:['ASTRA_VOLT','아스트라 볼트']};
const mode=Object.hasOwn(modes,query.get('mode'))?query.get('mode'):'pve';
const vehicle=Object.hasOwn(cars,query.get('vehicle'))?query.get('vehicle'):'aether';
const [code,name]=cars[vehicle];
const $=id=>document.getElementById(id);
for(const [id,options,current] of [['mode',Object.entries(modes),mode],['vehicle',Object.entries(cars).map(([key,v])=>[key,v[1]]),vehicle]]) {
  const list=$(id);
  for(const [value,title] of options)list.add(new Option(title,value));
  list.value=current;
  list.onchange=()=>{query.set(id,list.value);location.search=query.toString();};
}
const status=$('status'),arrival=$('arrival'),guard=$('guard');
try {
  const script=document.createElement('script');
  script.src=mode==='hunt'?'/preview/sustained-hunt-v2/battle.bundle.js':'/preview/project-v-v3/project-v-pixi-battle.bundle.js';
  await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(Error('전투 엔진을 읽을 수 없습니다.'));document.head.append(script);});
  const api=window.ProjectVPixiBattle;
  const response=await fetch(new URL('./'+mode+'-review.json',import.meta.url));
  if(!response.ok)throw Error('전투 기록을 읽을 수 없습니다.');
  const {scene,variants}=await response.json(),battle=variants[code];
  const payload={...scene,battleV2:{...scene.battleV2,...battle}};
  const own=battle.teams.A.mercenaries.filter(row=>row.vehicleSupport?.ownerId===1);
  const spec=mercenaryVehicleSupport(own[0]);
  document.title=name+' · '+modes[mode];
  $('name').textContent=name;
  $('signature').textContent=spec?.name||'';
  $('effect').textContent=spec?'내 출전 용병의 '+vehicleBuffText(spec):'차고에 장착한 이동수단의 등장과 퇴장';
  window.cnineCardCatalog=()=>payload.cards;
  const engine=await api.mountForBattle(payload,$('field'));
  const events=battle.result.timeline;
  guard.hidden=!events.length;
  let next=0;
  async function deploy(reset) {
    if(reset)await engine.resetSession(payload);
    await engine.setVisible(true);
    await engine.deployCards({instant:true,force:true});
    next=0;
    status.textContent=modes[mode]+' · '+(own.length?own.map(m=>m.name).join(' · '):name);
  }
  async function playImpact() {
    const e=events[next++%events.length], attacking=e.vehicleSupportHit===code&&own.some(m=>m.id===e.actorId);
    const actor=engine.combatantById(attacking?e.actorId:e.targetId),target=engine.combatantById(e.targetId);
    status.textContent=actor.name+' · '+(attacking?'공격 적중':'피격');
    target.setHp(Math.min(e.targetMaxHp,e.targetHpAfter+e.damage)/e.targetMaxHp*100);
    target.root.visible=target.root.renderable=target.enabled=true;
    target.setShield(e.targetShieldAfter+e.absorbed,target.serverMaxShield);
    await engine.playEvents([e]);
  }
  async function action(fn){arrival.disabled=guard.disabled=true;try{await fn();}catch(error){status.textContent=error.message;}finally{arrival.disabled=guard.disabled=false;}}
  arrival.onclick=()=>action(()=>deploy(true));
  guard.onclick=()=>action(playImpact);
  await deploy(false);
  arrival.disabled=guard.disabled=false;
  window.vehicleReview={engine,payload,events};
  window.addEventListener('pagehide',()=>api.destroy(),{once:true});
}catch(error){status.textContent='시연을 열 수 없습니다. '+error.message;console.error(error);}
