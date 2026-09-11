import {createTowerV3Session} from '../../../js/tower-v3-session.mjs';
import {towerRepeatCoin} from '../../../functions/_tower_v3_economy.js';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('ko-KR'),seconds=ms=>(ms/1000).toFixed(2)+'초';
let bootData,bridge,session,payload,ready=false,busy=false,paused=false,disposed=false,epoch=0,autoLeft=0,autoVersion='',lastPlayed=null,lastDisplayed=null;
const clock=ms=>`${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms%60000/1000)).padStart(2,'0')}`;
async function api(route,body){const r=await fetch('/__pve-preview/'+route,{method:body?'POST':'GET',headers:body?{'content-type':'application/json','x-preview-token':bootData.csrf}:{},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error||'연결을 확인하세요.'),{code:value.code});return value;}
function controls(){for(const id of ['start','tier','minus','plus','farm','challenge','power','same','next'])$(id).disabled=!ready||busy;$('pause').disabled=!busy;$('stop').disabled=autoLeft===0;$('pause').textContent=paused?'이어하기':'일시정지';$('start').textContent=`${$('tier').value}층 ${Number($('tier').value)>Number(bootData?.status.progress.bestClearedTier||0)?'한계 도전':'재등반'} →`;}
function showStatus(s){bootData.status=s;$('best-tier').replaceChildren(document.createTextNode(String(s.progress.bestClearedTier)),Object.assign(document.createElement('small'),{textContent:'층'}));$('unlocked').textContent=s.progress.maxUnlockedTier+'층';$('tier').max=Math.min(s.maxTier,s.progress.maxUnlockedTier);$('budget').textContent=`${s.budget.remaining} / ${bootData.economy.dailyRewardedClears}회`;hint();}
function hint(){if(!bootData)return;const t=Number($('tier').value),c=bootData.economy;$('reward-hint').textContent=`반복 코인 ${fmt(towerRepeatCoin(t,c))} · ${c.materialMinTier}층 이상 ${c.materialEvery}회 성공마다 ${c.materialName} ${c.materialQuantity}개 (하루 ${c.materialDailyCap}개)`;}
function event(e,state={}){$('clock').textContent=clock(e.remainingCombatMs??payload.combatLimitMs);$('guardian').textContent=`${e.guardianProgress||0}%`;$('progress').style.width=`${e.guardianProgress||0}%`;$('kills').textContent=state.defeated||0;$('kill-total').textContent=payload.continuousEncounter.total;$('limit').textContent=payload.combatLimitMs/1000+'초';if(e.type==='ENEMY_SPAWN')$('status').textContent=e.boss?'수호자 출현 · 최종 결전':'무리와 정예 돌파 중';}
async function records(){const data=await api('records');if(data.records.length)$('records').replaceChildren(...data.records.map(r=>{const li=document.createElement('li');li.append(Object.assign(document.createElement('span'),{textContent:`${r.tier}층`}),Object.assign(document.createElement('time'),{textContent:seconds(r.best_combat_ms)}));return li;}));}
function failure(e){autoLeft=0;busy=false;paused=false;$('result').textContent='원정 연결 확인';$('detail').textContent=e.message||String(e);$('loading').hidden=true;$('status').textContent='같은 원정으로 다시 확인할 수 있습니다';controls();console.error('[Tower preview]',e);}
async function prepare(){if(busy||disposed||!bridge)return;const token=++epoch;ready=false;controls();$('loading').hidden=false;try{const p=await api('formation?tier='+Number($('tier').value));if(token!==epoch||disposed)return;if(!await bridge.prepare(p)||token!==epoch||disposed)return;payload=p;ready=true;bridge.setSpeed(Number($('speed').value));$('loading').hidden=true;$('status').textContent=`${p.tier}층 · 출격 준비 완료`;event({remainingCombatMs:p.combatLimitMs},{defeated:0});hint();controls();}catch(e){failure(e);}}
async function consume(result){
  if(!result||result.status!=='COMPLETED'||disposed||lastPlayed===result.requestId)return;
  lastPlayed=result.requestId;const token=++epoch;busy=true;ready=true;payload=result;controls();$('loading').hidden=false;$('result-actions').hidden=true;
  try{
    if(!await bridge.prepare(result)||token!==epoch)return;bridge.setSpeed(Number($('speed').value));$('loading').hidden=true;$('status').textContent=`${result.tier}층 원정 중`;
    if(!await bridge.play(event)||token!==epoch||disposed)return;
    const reasons={TIME_LIMIT:'시간 초과',PARTY_DEFEATED:'원정대 전멸',GUARDIAN_SURVIVED:'수호자 미처치'};
    $('result').textContent=result.success?`${result.tier}층 돌파 성공`:reasons[result.failureReason]||'원정 종료';
    $('detail').textContent=`공식 시간 ${seconds(result.elapsedCombatMs)} · ${result.defeated} / ${result.continuousEncounter.total} 격파 · 수호자 잔여 HP ${result.guardianHpPercent}%${result.success?` · ${result.progress.maxUnlockedTier}층까지 해금`:''}`;
    $('rewards').textContent=result.rewards.length?result.rewards.map(r=>`${r.rewardName||r.name||r.rewardRef} ${fmt(r.quantity)}`).join(' · '):result.success?'보상 소진 · 기록은 정상 반영됩니다.':'성공 보상 없음 · 기존 최고 기록은 유지됩니다.';
    $('clock').textContent=clock(result.combatLimitMs-result.elapsedCombatMs);$('result-actions').hidden=false;lastDisplayed=result.requestId;
    showStatus(await api('status'));await records();busy=false;paused=false;controls();
    if(autoLeft>0){autoLeft--;const status=bootData.status;if(!result.success||!status.budget.remaining||document.hidden||status.rulesVersion+'|'+status.policyVersion!==autoVersion)autoLeft=0;
      if(autoLeft>0){$('status').textContent=`자동 재등반 · ${autoLeft}회 남음`;await new Promise(r=>setTimeout(r,1800));if(autoLeft>0&&!document.hidden&&!disposed)await start(false);}}
  }catch(e){failure(e);}finally{if(token===epoch){busy=false;controls();}}
}
async function start(manual=true){
  if(!ready||busy)return;
  if(manual){autoLeft=$('auto').checked?Math.min(Number($('repeat').value),bootData.status.autoRepeatMax,bootData.status.budget.remaining):0;autoVersion=bootData.status.rulesVersion+'|'+bootData.status.policyVersion;}
  const previous=session.getState();
  if(previous.phase==='READY'&&lastDisplayed!==previous.requestId){lastPlayed=null;await consume(previous.result);return;}
  if(previous.phase==='READY'&&!session.acknowledge())return;
  busy=true;controls();$('status').textContent='서버가 원정을 준비하고 있습니다';
  const result=await session.start(String(Number($('tier').value)));
  if(result?.status==='COMPLETED'){busy=false;await consume(result);}else{busy=false;controls();}
}
async function boot(){try{
  bootData=await api('bootstrap');showStatus(bootData.status);$('power').value=String(bootData.power);
  for(const [id,key] of [['daily','dailyRewardedClears'],['percent','repeatCoinPercent'],['coin-cap','repeatCoinCap'],['material-every','materialEvery'],['material-cap','materialDailyCap']])$(id).value=bootData.economy[key];
  const deadline=performance.now()+30000;while(!bridge){bridge=$('battle-frame').contentWindow?.ScrapyardBattleBridge;if(performance.now()>deadline)throw new Error('전장 준비 시간이 초과됐습니다. 새로고침으로 다시 연결하세요.');if(!bridge)await new Promise(r=>setTimeout(r,80));}
  session=createTowerV3Session({accountId:7,content:'TOWER_LOCAL_PREVIEW',storage:localStorage,transport:{run:body=>api('run',body),status:()=>api('status')},
    onChange:s=>{if(s.phase==='RECOVERABLE'&&s.error)failure(new Error(s.error.message));if(s.phase==='READY'&&!busy)void consume(s.result);}});
  await prepare();await records();const pending=await session.resume();if(pending?.status==='COMPLETED')await consume(pending);
}catch(e){failure(e);}}
const select=async value=>{if(busy)return;autoLeft=0;$('tier').value=Math.max(1,Math.min(Number($('tier').max),Number(value)||1));hint();await prepare();};
$('start').onclick=()=>start();$('same').onclick=()=>start();$('next').onclick=()=>select(bootData.status.progress.maxUnlockedTier);$('tier').onchange=()=>select($('tier').value);$('minus').onclick=()=>select(Number($('tier').value)-5);$('plus').onclick=()=>select(Number($('tier').value)+5);$('farm').onclick=()=>select(Math.max(1,bootData.status.progress.bestClearedTier-10));$('challenge').onclick=()=>select(bootData.status.progress.maxUnlockedTier);
$('stop').onclick=()=>{autoLeft=0;$('auto').checked=false;controls();};$('speed').onchange=()=>bridge?.setSpeed(Number($('speed').value));
$('pause').onclick=()=>{paused=!paused;if(paused)bridge.pause();else bridge.resume();controls();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{$('status').textContent='전체화면을 지원하지 않는 브라우저입니다';}};
$('settings').onsubmit=async e=>{e.preventDefault();if(busy)return;autoLeft=0;try{const economy={...bootData.economy,version:'TOWER_ECONOMY_DRAFT_'+Date.now()};for(const [id,key] of [['daily','dailyRewardedClears'],['percent','repeatCoinPercent'],['coin-cap','repeatCoinCap'],['material-every','materialEvery'],['material-cap','materialDailyCap']])economy[key]=Number($(id).value);
  await api('settings',{config:bootData.config,economy,power:Number($('power').value)});bootData=await api('bootstrap');showStatus(bootData.status);await prepare();$('status').textContent='검수 시안을 저장했습니다';}catch(e){failure(e);}};
document.addEventListener('visibilitychange',()=>{session?.setVisible(!document.hidden);if(document.hidden){autoLeft=0;if(busy){paused=true;bridge?.pause();}controls();}});
window.addEventListener('pagehide',()=>{disposed=true;autoLeft=0;++epoch;session?.dispose();bridge?.dispose();},{once:true});
window.TowerV3={start,select,diagnostics:()=>({ready,busy,paused,autoLeft,tier:payload?.tier,result:payload?.battleV2.result,session:session?.getState().phase,bridge:bridge?.diagnostics()})};boot();
