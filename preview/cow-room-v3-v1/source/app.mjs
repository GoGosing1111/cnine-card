import {createCowEncounter} from './model.mjs';
const $=id=>document.getElementById(id);
let catalog,equipment,bridge,payload,ready=false,busy=false,ended=false,paused=false,disposed=false,epoch=0,prep=0;
const records=[];
function log(text){records.unshift(text);records.length=Math.min(records.length,5);$('log').replaceChildren(...records.map(text=>Object.assign(document.createElement('li'),{textContent:text})));}
function controls(){for(const id of ['start','power'])$(id).disabled=!ready||busy;$('pause').disabled=!busy;$('reset').disabled=!bridge;$('start').textContent=ended?'다시 목초지로 →':'목초지 진입 →';$('pause').textContent=paused?'이어하기':'일시정지';}
function onEvent(event,state={}){
  if(disposed)return;
  const defeated=state.defeated||0,total=payload.continuousEncounter.total;
  $('kills').textContent=defeated;$('progress').style.width=`${defeated/total*100}%`;$('survivors').textContent=`${state.survivors??5} / 5`;
  const phase=state.spawned>=total?3:state.spawned>18?2:1;
  for(let i=1;i<=3;i++){$('phase-'+i).classList.toggle('current',i===phase);$('phase-'+i).classList.toggle('done',i<phase||defeated===total);}
  if(event.type==='PREVIEW_PAUSED')$('status').textContent='일시정지';
  if(event.type==='ENEMY_SPAWN'){
    const row=payload.continuousEncounter.instances.find(row=>row.id===event.targetId);
    $('status').textContent=row?.boss?'카우 킹과 최종 결전':row?.elite?'왕의 근위대 교전':'소떼 돌파 중';
    if(row?.boss||row?.elite)log(`${row.name} 출현. 남은 체력으로 교전을 이어갑니다.`);
  }
  if(event.type==='KO'&&event.targetId?.startsWith('A:'))log('아군 전투 불능. 남은 원정대가 전투를 이어갑니다.');
}
function fail(error){bridge?.cancel();busy=false;ready=false;$('loading').hidden=false;$('loading-text').textContent=error.message||String(error);$('loading').querySelector('i').hidden=true;$('status').textContent='전장 준비 실패';controls();$('reset').disabled=false;console.error('[Cow room]',error);}
async function prepare(){
  const token=++prep;ready=false;ended=false;controls();$('loading').hidden=false;$('loading').querySelector('i').hidden=false;$('loading-text').textContent='붉은 차원문을 여는 중…';
  const next=createCowEncounter({catalog,equipment,powerScale:Number($('power').value),seed:7123});
  if(!await bridge.prepare(next)||token!==prep||disposed)return false;
  payload=next;bridge.setSpeed(Number($('speed').value));ready=true;$('loading').hidden=true;$('status').textContent='목초지 진입 준비 완료';$('result').textContent='출격 대기';$('detail').textContent='소떼 18마리 → 정예 3마리 → 카우 킹. 구간 사이 회복 없음.';onEvent({type:'READY'},{spawned:3,defeated:0,survivors:5});controls();return true;
}
async function start(){
  if(!ready||busy)return;const token=++epoch;
  try{
    if(ended&&!await prepare())return;if(token!==epoch||disposed)return;
    busy=true;paused=false;controls();$('status').textContent='소떼 돌파 중';$('result').textContent='원정 진행 중';log('붉은 차원문 통과. 목초지 돌파를 시작합니다.');
    if(!await bridge.play(onEvent)||token!==epoch||disposed)return;
    ended=true;const result=payload.battleV2.result,won=result.winner==='A';
    $('result').textContent=won?'목초지 정복 완료':'원정 실패';$('status').textContent=won?'카우 킹 격파':'목초지에서 퇴각';
    const defeated=result.encounter.defeated;$('detail').textContent=`${defeated} / ${payload.continuousEncounter.total} 격파 · ${result.actions}행동 · ${won?'같은 편성으로 재도전할 수 있습니다.':'편성을 강화한 뒤 다시 도전하세요.'}`;
    log(won?'카우 킹 격파. 원정대가 목초지를 정복했습니다.':`${defeated}마리 격파 후 원정 종료.`);
  }catch(error){if(token===epoch&&!disposed)fail(error);}finally{if(token===epoch){busy=false;paused=false;controls();}}
}
async function reset(){++epoch;++prep;bridge?.cancel();busy=false;paused=false;try{await prepare();log('원정대를 다시 준비했습니다.');}catch(error){fail(error);}}
const json=async url=>{const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error(`자산을 불러오지 못했습니다 (${response.status})`);return response.json();};
async function boot(){try{
  const manifests=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(path=>json('/assets/ui/project-v/characters/'+path)));
  catalog=manifests.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity,sourceArt:'/'+c.sourceArt.replace(/^\/+/,''),battleSprite:'/'+c.battleSprite.replace(/^\/+/,'')})));
  equipment=await json('/assets/ui/project-v/account-battle-suits/manifest-v2.json');
  const deadline=performance.now()+25000;
  while(!bridge&&!disposed){bridge=$('battle-frame').contentWindow?.ScrapyardBattleBridge;if(performance.now()>deadline)throw new Error('전장 연결 시간이 초과됐습니다. 다시 준비를 눌러 주세요.');if(!bridge)await new Promise(resolve=>setTimeout(resolve,80));}
  if(!disposed)await prepare();
}catch(error){fail(error);}}
$('start').addEventListener('click',start);$('reset').addEventListener('click',()=>bridge&&catalog&&equipment?reset():location.reload());$('power').addEventListener('change',()=>prepare().catch(fail));$('speed').addEventListener('change',()=>bridge?.setSpeed(Number($('speed').value)));
$('pause').addEventListener('click',()=>{if(!busy)return;paused=!paused;if(paused){bridge.pause();$('status').textContent='현재 공격 완료 후 정지';}else{bridge.resume();$('status').textContent='교전 재개';}controls();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{log('이 브라우저에서는 전체화면을 사용할 수 없습니다.');}});
window.addEventListener('pagehide',()=>{disposed=true;++epoch;++prep;bridge?.dispose();},{once:true});
window.CowRoomV3={start,reset,diagnostics:()=>({ready,busy,ended,paused,payloadResult:payload?.battleV2.result,bridge:bridge?.diagnostics()})};
boot();
