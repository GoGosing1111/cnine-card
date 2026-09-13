import {jointAccountRequest as api} from '../js/joint-account-transport.mjs';
import {createPveContinuousSession} from '../js/pve-continuous-session-v1.mjs';
import {createTowerV3Session} from '../js/tower-v3-session.mjs';
const labels={tower:['무한의탑','끝을 넘어서는 도전','해금한 층에 다시 도전하고, 더 높은 기록을 남기세요.'],scrapyard:['폐차장','폐허 속에서 되찾는 가능성','전선을 돌파하고 차량 제작에 필요한 부품을 회수하세요.'],'cow-room':['카우방','붉은 목초지의 지배자','도끼병과 정예를 넘어, 카우 킹에게 도전하세요.'],'idle-dungeon':['자동 원정','끝나지 않는 원정대의 여정','접속하지 않아도 원정과 코인 적립은 계속됩니다.']};
const raw=new URL(location.href).searchParams.get('content'),content=Object.hasOwn(labels,raw)?raw:'tower',isIdle=content==='idle-dungeon',isTower=content==='tower',base=`${content}/v3/`;
const isCow=content==='cow-room';
const $=id=>document.getElementById(id),text=(id,value)=>{$(id).textContent=String(value);},fmt=n=>Number(n||0).toLocaleString('ko-KR');
let state,session,bridge,disposed=false,presenting=false,displayed='',repeatLeft=0,paused=false,speed=1,refreshing=false,idleSession='',idleKey='',idleTimer,heartbeatTimer;
const storage=localStorage;
const soundEnabled=storage.getItem('cnine_battle_sound')!=='OFF';$('sound').setAttribute('aria-pressed',String(soundEnabled));text('sound',soundEnabled?'소리 끄기':'소리 켜기');
document.body.dataset.content=content;text('title',labels[content][0]);text('eyebrow',labels[content][1]);text('description',labels[content][2]);document.title=`숲켓몬 · ${labels[content][0]}`;
document.querySelector(`[data-content-link="${content}"]`).setAttribute('aria-current','page');
$('tier-control').hidden=!isTower;$('difficulty').hidden=isTower;$('repeat-control').hidden=isIdle||isCow;$('idle-stop').hidden=!isIdle;$('claim').hidden=!isIdle;
$('battle-frame').src=`./battle.html?content=${content}`;
text('selection-title',isTower?'도전할 층':isIdle?'진행 난이도':'원정 지역');text('history-title',isTower?'돌파의 흔적':isIdle?'원정대의 발자취':'최근 작전');
if(isIdle){text('record-label','최고 도달');text('cost-label','정산 대기');text('budget-label','오늘 누적');text('record2-label','자동 진행');text('rule-note','화면을 닫아도 원정은 계속됩니다. 직접 정지할 때까지 진행하며, 오늘 코인 상한 이후에도 전투는 이어집니다.');}
function message(value){text('message',value||'');}
function selection(){return isTower?String($('tier').value):$('difficulty').value;}
function lockControls(busy){$('start').disabled=busy||!state||isCow&&(!state.portals?.available||state.budget?.remaining<1||state.policy?.mode==='OFF');$('tier').disabled=busy;$('tier-down').disabled=busy;$('tier-up').disabled=busy;$('difficulty').disabled=busy;$('repeat').disabled=busy;}
function showRecords(records){$('records').replaceChildren();if(!records.length){const li=document.createElement('li');li.textContent='아직 남겨진 기록이 없습니다.';$('records').append(li);return;}
  for(const r of records.slice(0,12)){const li=document.createElement('li'),b=document.createElement('b'),span=document.createElement('span');b.textContent=r.label;span.textContent=r.detail;li.append(b,span);$('records').append(li);}}
async function refresh(){
  if(refreshing||disposed)return;refreshing=true;
  try{state=await api(base+'state');if(disposed)return;text('account-label',`내 원정 · ${state.accountId}`);
    if(isTower){$('tier').max=String(state.progress.maxUnlockedTier);$('tier').value=String(Math.min(Number($('tier').value)||state.progress.selectedTier||1,state.progress.maxUnlockedTier));text('record-value',`${state.progress.bestClearedTier}층`);text('entry-cost',state.economy.entryCoin?`${fmt(state.economy.entryCoin)} 코인`:'무료');text('remaining',`${state.budget.remaining}회`);showRecords((state.records||[]).map(r=>({label:`${r.tier}층`,detail:`${(r.best_combat_ms/1000).toFixed(1)}초`})));
    }else{
      const options=isIdle?state.settings.difficulties:content==='scrapyard'?state.settings.difficulties:state.difficulties,previous=$('difficulty').value;
      $('difficulty').replaceChildren();for(const d of options){const o=document.createElement('option');o.value=d.id;o.textContent=d.name;o.disabled=d.unlocked===false;$('difficulty').append(o);}
      $('difficulty').value=options.some(d=>d.id===previous)?previous:isIdle?state.progress.difficulty:options[0].id;
      if(isIdle){text('record-value',`${state.progress.highestFloor}층`);text('entry-cost',`${fmt(state.progress.pendingCoin)} 코인`);text('remaining',`${fmt(state.progress.dailyCoin)} / ${fmt(state.progress.dailyCap)}`);text('formation',state.progress.running?'진행 중':'정지');$('idle-stop').disabled=!state.progress.running;$('claim').disabled=state.progress.pendingCoin<=0;text('claim',`${fmt(state.progress.pendingCoin)} 코인 수령`);showRecords([{label:`현재 ${state.progress.currentFloor}층`,detail:`누적 회귀 ${fmt(state.progress.resets)}회`},{label:'접속하지 않아도 진행',detail:'서버 기록 유지'}]);
        if(state.progress.running&&state.battle?.idleClock.key!==idleKey&&!document.hidden)void presentIdle(state.battle);
      }else if(content==='scrapyard'){text('record-value',`${state.access.usedRuns}회`);text('record-label','오늘의 출격');text('entry-cost',`입장권 1장 · 보유 ${fmt(state.ticket.quantity)}장`);text('remaining',`${state.access.remainingRuns}회`);showRecords((state.parts||[]).map(r=>({label:r.name,detail:`${fmt(r.quantity)}개`})));
      }else{text('record-value',state.progress.bestCleared?'돌파':'미돌파');text('entry-cost',`${fmt(state.policy.entryCoin)} 코인`);text('remaining',`${state.budget.remaining}회`);showRecords([{label:'카우 킹',detail:state.progress.bestCleared?'돌파 완료':'도전 대기'},{label:'오늘 출격',detail:`${state.budget.attempts}회`}]);}
    }
    text('start',isIdle?state.progress.running?'선택 난이도로 이어가기':'자동 원정 시작':'원정 출발');text('lobby-status',isIdle&&state.progress.running?`${state.progress.currentFloor}층 자동 원정 진행 중`:'원정대, 출발 준비 완료');text('lobby-detail',isIdle?'화면 연결과 관계없이 서버에서 계속 진행됩니다.':'저장된 일반 카드 5장과 별도 용병 편성을 사용합니다.');
    if(isCow){
      text('start',state.portals.available?'포탈로 입장하기':'포탈을 발견해 주세요');
      text('lobby-status',state.portals.available?`발견한 젖소방 포탈 ${fmt(state.portals.available)}개`:'아직 발견한 포탈이 없습니다.');
      text('lobby-detail','일반 PVE 2% · 아포칼립스 3% 확률로 포탈이 열립니다.');
      text('rule-note','토벌·소탕의 완료 전투마다 개별 판정합니다. 입장 시 포탈 1개를 사용하며, 새로고침이나 전투 복구에는 추가 사용하지 않습니다.');
    }
    if(!presenting&&(!session||session.getState().phase==='IDLE'))lockControls(false);
    return state;
  }catch(error){message(error.message);if(!state){text('lobby-status',error.status===423?'공동 업데이트 준비 중':'원정 정보를 불러오지 못했습니다.');text('lobby-detail',error.message);text('start','입장 대기');lockControls(true);}throw error;
  }finally{refreshing=false;}
}
async function readyBridge(){
  if(bridge)return bridge;const frame=$('battle-frame');for(let i=0;i<120;i++){if(disposed)throw Error('화면이 닫혔습니다.');const found=frame.contentWindow?.PveV3BattleBridge;if(found){bridge=found;return found;}await new Promise(r=>setTimeout(r,100));}throw Error('전투 화면을 불러오지 못했습니다. 결과 복구를 눌러 다시 확인하세요.');
}
async function prepareBattle(battle){const b=await readyBridge();$('lobby').hidden=true;$('battle-frame').hidden=false;await b.prepare(battle);if(!isIdle)text('formation',`일반 카드 5장${b.diagnostics().formation?.mercenaries?.length?' + 용병 1장':''}`);$('pause').disabled=false;$('speed').disabled=isIdle;$('sound').disabled=false;paused=false;text('pause','일시정지');return b;}
async function present(result){
  if(disposed||presenting||displayed===result.requestId)return;presenting=true;displayed=result.requestId;lockControls(true);$('result').hidden=true;
  try{const b=await prepareBattle(result);if(!await b.play()||disposed)return;
    text('result-label',result.firstClear?'최초 돌파':result.replayed?'복구한 전투 결과':'전투 결과');text('result-title',result.success?'작전 성공':'다음을 위한 재정비');$('rewards').replaceChildren();
    for(const r of result.rewards||[]){const span=document.createElement('span'),amount=document.createElement('b');span.textContent=r.rewardName||r.rewardRef;amount.textContent=fmt(r.quantity);span.append(amount);$('rewards').append(span);}
    if(!result.rewards?.length){const span=document.createElement('span');span.textContent='이번 전투의 지급 보상 없음';$('rewards').append(span);}
    $('result').hidden=false;await refresh();
    if(repeatLeft>1&&result.success&&(result.budget?.remaining??state.access?.remainingRuns??0)>0&&!document.hidden){repeatLeft--;if(session.acknowledge()){displayed='';presenting=false;void session.start(selection());return;}}
    repeatLeft=0;$('stop-repeat').hidden=true;
  }catch(e){displayed='';repeatLeft=0;message(e.message);$('recover').hidden=false;}
  finally{presenting=false;}
}
async function presentIdle(battle){
  if(disposed||document.hidden)return;idleKey=battle.idleClock.key;
  try{const b=await prepareBattle(battle);await b.play();}catch(e){idleKey='';message(e.message);}
}
function changed(next){
  if(disposed)return;$('recover').hidden=!['RECOVERABLE','RUNNING'].includes(next.phase);if(next.error)message(next.error.message);
  if(next.phase==='READY'&&next.result)void present(next.result);else if(next.phase==='IDLE'){lockControls(false);$('result').hidden=true;}else lockControls(true);
}
async function startIdle(){
  lockControls(true);try{idleSession=crypto.randomUUID();await api(base+'start',{method:'POST',body:{difficulty:selection(),sessionId:idleSession}});idleKey='';await refresh();message('자동 원정을 시작했습니다. 화면을 닫아도 계속 진행됩니다.');
    clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(!disposed&&!document.hidden&&idleSession)void api(base+'heartbeat',{method:'POST',body:{sessionId:idleSession}}).catch(e=>message(e.message));},12000);
  }catch(e){message(e.message);}finally{lockControls(false);}
}
$('start').onclick=()=>{message('');if(isIdle){void startIdle();return;}repeatLeft=isCow?1:Number($('repeat').value);$('stop-repeat').hidden=repeatLeft<=1;void session.start(selection());};
$('recover').onclick=()=>{displayed='';void session?.resume();};
$('acknowledge').onclick=()=>{if(session?.acknowledge()){displayed='';$('result').hidden=true;lockControls(false);}};
$('stop-repeat').onclick=()=>{repeatLeft=0;$('stop-repeat').hidden=true;message('이번 전투 이후 추가 입장을 중지합니다.');};
$('pause').onclick=()=>{paused=!paused;if(paused)bridge?.pause();else bridge?.resume();text('pause',paused?'재개':'일시정지');};
$('speed').onclick=()=>{speed=speed===1?2:1;bridge?.setSpeed(speed);text('speed',`${speed}배속`);};
$('sound').onclick=async()=>{const enabled=$('sound').getAttribute('aria-pressed')!=='true';try{await bridge?.setSound(enabled);$('sound').setAttribute('aria-pressed',String(enabled));text('sound',enabled?'소리 끄기':'소리 켜기');}catch(e){message(e.message);}};
$('tier-down').onclick=()=>{$('tier').value=String(Math.max(1,Number($('tier').value)-1));};$('tier-up').onclick=()=>{$('tier').value=String(Math.min(Number($('tier').max),Number($('tier').value)+1));};
$('idle-stop').onclick=async()=>{try{await api(base+'stop',{method:'POST',body:{sessionId:idleSession}});idleSession='';clearInterval(heartbeatTimer);bridge?.cancel();idleKey='';await refresh();message('진행과 누적 코인을 보존하고 원정을 정지했습니다.');}catch(e){message(e.message);}};
$('claim').onclick=async()=>{const key=`cnine.idle-claim.v3:${state.accountId}`;$('claim').disabled=true;try{let rid=storage.getItem(key);if(!rid){rid=crypto.randomUUID();storage.setItem(key,rid);}const r=await api(base+'claim',{method:'POST',body:{requestId:rid}});if(storage.getItem(key)===rid)storage.removeItem(key);message(`${fmt(r.rewardCoin)} 코인을 수령했습니다.`);await refresh();}catch(e){message(e.message);$('claim').disabled=false;}};
document.addEventListener('visibilitychange',()=>{session?.setVisible(!document.hidden);if(document.hidden){repeatLeft=0;bridge?.pause();}else{bridge?.resume();if(isIdle)void refresh().catch(()=>{});}});
window.addEventListener('pagehide',()=>{disposed=true;repeatLeft=0;session?.dispose();bridge?.dispose();clearInterval(idleTimer);clearInterval(heartbeatTimer);},{once:true});
try{
  await refresh();
  if(isIdle)idleTimer=setInterval(()=>{if(!document.hidden)void refresh().catch(()=>{});},8000);
  else{const transport={run:body=>api(base+'run',{method:'POST',body}),status:()=>api(base+'status')};
    session=isTower?createTowerV3Session({accountId:state.accountId,transport,storage,onChange:changed}):createPveContinuousSession({accountId:state.accountId,transport,storage,onChange:changed,content:content==='cow-room'?'COW_ROOM':'SCRAPYARD',...(content==='cow-room'?{validateSelection:s=>s==='PASTURE'}:{})});
    await session.resume();
    if(isCow&&new URL(location.href).searchParams.get('enter')==='1'){
      const clean=new URL(location.href);clean.searchParams.delete('enter');history.replaceState(null,'',clean);
      if(session.getState().phase==='IDLE'&&!$('start').disabled)$('start').click();
    }
  }
}catch(e){if(e.code==='PVE_V3_RELEASE_HELD'){document.body.dataset.release='off';text('account-label','운영 연결 완료 · 유저 입장 OFF');text('start','입장 OFF');$('start').disabled=true;$('battle-frame').hidden=true;}message(e.message);}
