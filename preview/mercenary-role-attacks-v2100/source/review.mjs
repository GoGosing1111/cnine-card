import {BattleEngine} from '../../project-v-v3/source/battle/BattleEngine.js';
import {MERCENARY_ROLE_ATTACKS as roles,preloadMercenaryRole} from '../../project-v-v3/source/battle/MercenaryRoleAttackFX.js';
const $=id=>document.getElementById(id);
let engine,fixtures,selectedRole='GUARDIAN',selectedCode='',request=0,busy=false,paused=false;
const buttons=enabled=>{for(const id of ['play','pause','cancel','seek'])$(id).disabled=!enabled;};
const status=text=>$('status').textContent=text;
function syncAudio(){if(engine?.audio)engine.audio.enabled=()=>$('sound').checked;engine?.mercenaryAudio?.setEnabled($('sound').checked);if($('sound').checked)engine?.audio?.unlock();}
function updateRoles(){
 $('roles').replaceChildren(...Object.entries(roles).map(([key,p])=>{const b=document.createElement('button');b.textContent=p.label;b.setAttribute('aria-pressed',String(key===selectedRole));b.onclick=()=>selectRole(key);return b;}));
 const rows=fixtures.filter(f=>f.role===selectedRole);$('mercenary').replaceChildren(...rows.map(f=>new Option(`${f.name} · ${f.rank}`,f.code)));
 if(!rows.some(f=>f.code===selectedCode))selectedCode=rows[0].code;$('mercenary').value=selectedCode;
 $('frames').replaceChildren(...Array.from({length:16},(_,i)=>{const f=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');img.src=`./assets/${selectedRole.toLowerCase()}/frames/${String(i+1).padStart(2,'0')}.webp`;img.alt=`${roles[selectedRole].label} ${i+1}번째 연속 프레임`;cap.textContent=i===4?'05 · 충돌':String(i+1).padStart(2,'0');f.append(img,cap);return f;}));
}
async function selectRole(role,code=''){
 selectedRole=role;selectedCode=code;request++;engine?.cancelTimelines();updateRoles();await prepare();
}
async function prepare(){
 const ticket=++request;buttons(false);busy=true;const fixture=fixtures.find(f=>f.code===selectedCode);
 status('선택한 용병과 타격 자산을 불러옵니다.');
 try{
  await preloadMercenaryRole(fixture.role);if(ticket!==request)return;
  if(!engine){engine=new BattleEngine({host:$('battle'),battleData:fixture.payload});await engine.mount();}
  else await engine.resetSession(fixture.payload,$('battle'));
  if(ticket!==request)return;engine.setVisible(true);engine.mercenaryRoleReviewHold=true;syncAudio();
  await engine.deployCards({force:true,instant:true});
  // Bring HP/shield to the recorded pre-hit state without replaying earlier
  // turns. The displayed attack still uses exactly one server-issued event.
  for(const event of fixture.payload.battleV2.result.timeline.slice(0,fixture.eventIndex)){
   const target=engine.combatantById(event.targetId);
   if(target&&Number.isFinite(event.targetHpAfter))engine.syncTargetHp(target,engine.eventHpPercent(target,event.targetHpAfter));
   if(target&&Number.isFinite(event.targetShieldAfter))engine.syncTargetShield(target,event.targetShieldAfter);
  }
  $('name').textContent=`${fixture.name} · ${roles[fixture.role].label}`;$('detail').textContent=roles[fixture.role].detail;
  window.roleAttackReview={engine,fixture,play,cancel,selectRole,roles};
  status('재생 준비 완료 · 16개 연속 프레임');$('seek').value=0;paused=false;$('pause').textContent='일시정지';buttons(true);
 }finally{if(ticket===request)busy=false;}
}
async function play({inspectAt=null}={}){
 if(busy)return;await prepare();if(busy)return;
 const ticket=request,fixture=fixtures.find(f=>f.code===selectedCode),event=fixture.payload.battleV2.result.timeline[fixture.eventIndex];
 engine.paceScale=Number($('rate').value);engine.mercenaryRoleReviewStartAt=inspectAt===null?null:inspectAt*roles[selectedRole].duration;syncAudio();
 paused=inspectAt!==null;$('pause').textContent=paused?'계속 재생':'일시정지';status(paused?'프레임 확인 · 슬라이더로 이동':'공격 재생 중');
 const result=await engine.playEvents([event]);if(ticket!==request)return;
 status(result===false?'연출 정리 완료':'소멸 완료 · 잔여 이펙트 0개');
}
function cancel(){request++;busy=false;if(engine&&!engine.disposed){engine.cancelTimelines();engine.mercenaryAudio?.stop();}paused=false;$('pause').textContent='일시정지';status('연출 정리 완료');}
function pause(){const fx=engine?.mercenaryRoleFx;if(!fx?.timeline)return;paused=!paused;fx.timeline.paused(paused);engine.mercenaryAudio?.stop();if(!paused)engine.mercenaryAudio?.scheduleFrom(fx.time,fx.timeline.timeScale());$('pause').textContent=paused?'계속 재생':'일시정지';status(paused?'일시정지':'공격 재생 중');}
$('play').onclick=()=>play().catch(e=>status(e.message));$('cancel').onclick=cancel;$('pause').onclick=pause;
$('mercenary').onchange=()=>selectRole(selectedRole,$('mercenary').value).catch(e=>status(e.message));
$('rate').onchange=()=>{if(engine)engine.paceScale=Number($('rate').value);const fx=engine?.mercenaryRoleFx;if(fx?.timeline){fx.timeline.timeScale(1.3*Number($('rate').value));engine.mercenaryAudio?.stop();if(!paused)engine.mercenaryAudio?.scheduleFrom(fx.time,fx.timeline.timeScale());}};
$('sound').onchange=syncAudio;
$('seek').oninput=()=>{const fx=engine?.mercenaryRoleFx;if(!fx?.timeline){if(!busy)void play({inspectAt:Number($('seek').value)}).catch(e=>status(e.message));return;}paused=true;fx.timeline.pause();engine.mercenaryAudio?.stop();fx.timeline.seek(Number($('seek').value)*fx.profile.duration,true);fx.render(Number($('seek').value)*fx.profile.duration);$('pause').textContent='계속 재생';status(`프레임 ${fx.frame+1} / 16`);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});window.addEventListener('pagehide',()=>{cancel();const previous=engine;engine=null;previous?.destroy();});
fetch('./fixtures.json').then(r=>r.json()).then(async data=>{fixtures=data.fixtures;const query=new URL(location.href).searchParams;const role=query.get('role');await selectRole(roles[role]?role:'GUARDIAN',query.get('mercenary')||'');}).catch(e=>status(e.message));
