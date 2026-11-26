import {NoxInput,NoxAudio,NOX_DEFAULT_KEYS,noxKeyLabel,readNoxRhythmKeys,rebindNoxLane,nearestNoxNote,noxRhythmTime,noxNoteY,noxHitY,noxNoteStart,eventTime} from '/js/nox-input-v1.mjs?v=20261126-rhythm-keys1';
import {NOX_CLIENT_VERSION,NOX_TRACK,NOX_RHYTHM_RULES,noxTrack} from '/shared/nox-raid-chart-v1.mjs?v=20261123-hold1';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roomDirectory=$('roomDirectory');
const clockText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
const roles=['저음','중음','고음'];
const keySettings=$('keySettings'),bindingButtons=[...keySettings.querySelectorAll('[data-bind-lane]')];
const rhythmStorageKey='noxRhythmLaneKeysV1';
function readPreference(key){try{return localStorage.getItem(key);}catch{return null;}}
let rhythmKeys=readNoxRhythmKeys(readPreference(rhythmStorageKey)),bindingLane=null;
let token=sessionStorage.getItem('noxLiveRoom')||'',state=null,payload=null,epoch=0,eventSeq=0,pollTimer=0,flushTimer=0,frame=0,toastTimer=0,input=null,layer=null,mounted=false,mountPromise=null,preparing=false,seq=0,offset=Date.now()-performance.now(),bestRtt=Infinity,stageId='',localHits=new Set(),outbox=[],nodes=new Map(),hudSignature='',ended=false,requests=new Set(),polling=false,lastPaint=0,frameTimes=[];
const posts=new Map(),sentPackets=new Map();
const holding=new Map();
let retryAt=0,retryDelay=250,blockedStage='',lastInputNotice='';
let calibration=Math.max(-150,Math.min(150,Number(readPreference('noxTimingOffset'))||0));
const audio=new NoxAudio(),serverNow=()=>performance.now()+offset;
let chartObserver=null,hitY=1,noteHeight=56,combo=0,floorAbort=null;
let lobbyFeature=null,establishing=false,leaving=false,roomsTimer=0,roomsRequest=null,roomListSignature='';
const difficultyLabel=key=>key==='HELL'?'헬':'노말';
const memorySteps=challenge=>challenge.cues?.length??3;
const chartTravelMs=()=>state?.challenge?.travelMs??NOX_RHYTHM_RULES.travelMs;
const trackUrls=()=>state?.playlist?.length?state.playlist.map(id=>noxTrack(id).source):[NOX_TRACK.source];
let frameSummary={count:0,total:0,max:0,over50:0};
const hitAnimations=new Map();
function clearHitEffects(){for(const list of hitAnimations.values())for(const animation of list)animation.cancel();hitAnimations.clear();}
function showCombo(value){
  combo=value;
  const counter=$('rhythmCombo');
  $('rhythmComboValue').textContent=String(value);
  counter.classList.toggle('is-active',value>0);
  for(const animation of hitAnimations.get('combo')||[])animation.cancel();
  hitAnimations.delete('combo');
  if(!value||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const milestone=value%10===0;
  const flash=counter.animate([
    {color:'#fff9df',borderColor:'#ffecae',textShadow:'0 0 4px #fff5b2,0 0 12px #ffa344',boxShadow:'inset -3px 0 10px #ffae5155,3px 0 8px #ffb76688',transform:milestone?'scale(1.10)':'scale(1.05)'},
    {color:'#ffd38c',borderColor:'#bc7849',textShadow:'0 0 5px #c6744780',boxShadow:'inset -2px 0 5px #ec8c3417,0 0 0 transparent',transform:'scale(1)'}
  ],{duration:milestone?320:200,easing:'ease-out'});
  hitAnimations.set('combo',[flash]);
}
function showHit(lane,judged,at,phase='tap'){
  const starting=phase==='holdStart',ending=phase==='holdEnd';
  const grade=judged?.grade||(ending?'MISS':'EMPTY');
  $('judgement').textContent=starting?'HOLD':grade;$('judgement').dataset.grade=grade;
  const delta=judged?at-judged.note.at:0;
  if(starting)$('timingDetail').textContent='꼬리가 판정선에 닿을 때까지';
  else if(ending)$('timingDetail').textContent=judged?'롱노트 성공':'롱노트는 꼬리까지 누르세요';
  else $('timingDetail').textContent=judged?(Math.abs(delta)<12?'정확한 타이밍':`${delta<0?'빠름':'늦음'} ${Math.round(Math.abs(delta))}ms`):'노트가 없는 입력';
  if(!starting)showCombo(judged?combo+1:0);
  const effect=layer.querySelector(`[data-hit-lane="${lane}"]`),column=layer.querySelectorAll('.nox-chart-columns i')[lane],key=layer.querySelector(`.nox-keys [data-nox-lane="${lane}"]`),receptor=layer.querySelectorAll('.nox-hit-line i')[lane];
  for(const animation of hitAnimations.get(lane)||[])animation.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,perfect=grade==='PERFECT',options={duration:reduced?120:320,easing:'cubic-bezier(.16,1,.3,1)'};
  effect.dataset.grade=grade;
  const animations=[column.animate([{backgroundColor:judged?'#ffd99d1a':'#ec283d22'},{backgroundColor:'transparent'}],{duration:140})];
  if(judged){
    if(!ending)audio.hit(grade);
    animations.push(effect.animate([{opacity:1,transform:reduced?'none':'scale(.65,.7)'},{opacity:perfect?1:.8,transform:reduced?'none':'scale(1.12,1)',offset:.18},{opacity:0,transform:reduced?'none':`scale(${perfect?1.55:1.3},1.2)`}],options));
    animations.push(key.animate(reduced?[{filter:'brightness(1.8)'},{filter:'brightness(1)'}]:[{transform:'translateY(3px) scale(.97,.92)',filter:'brightness(2)'},{transform:'translateY(-1px) scale(1.015,1.04)',filter:'brightness(1.3)',offset:.45},{transform:'none',filter:'brightness(1)'}],{duration:reduced?100:190,easing:'ease-out'}));
    animations.push(receptor.animate([{filter:`grayscale(0) brightness(${perfect?2.5:1.8})`},{filter:'grayscale(1) brightness(.75)'}],{duration:180}));
  }
  hitAnimations.set(lane,animations);
  for(const animation of hitAnimations.get('readout')||[])animation.cancel();
  const readout=[];
  if(judged)readout.push($('judgement').animate(reduced?[{opacity:1},{opacity:1}]:[{transform:`scale(${perfect?1.16:1.08})`,textShadow:'0 0 18px #ffc980'},{transform:'scale(1)',textShadow:'0 2px 3px #000'}],{duration:190,easing:'ease-out'}));
  hitAnimations.set('readout',readout);
}
const fmt=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
let rhythmArtPromise=null;
function prepareRhythmArt(){
  return rhythmArtPromise??=Promise.all([
    ...['frame','note','key','impact','surface'].map(name=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.decode().then(resolve,reject);img.onerror=()=>reject(new Error('리듬 UI 이미지를 불러오지 못했습니다. 다시 준비해 주세요.'));img.src='/assets/ui/raid-nox-v2/'+name+'.webp';})),
    document.fonts.load('800 24px NoxHUD'),document.fonts.load('700 18px NoxText')
  ]).catch(error=>{rhythmArtPromise=null;throw error;});
}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function inputNotice(code,message){if(lastInputNotice!==code){lastInputNotice=code;toast(message);}}
function acceptsInputs(){return state?.status==='ACTIVE'&&state.me.hp>0&&state.challenge?.id!==blockedStage;}
function playerToken(){return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}
async function api(route,body,{keepalive=false,controller=new AbortController()}={}){
  const auth=playerToken();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),7000);
  const kind=route.split('?')[0];let endpoint='/api/raid/nox/'+route;
  if(body===undefined&&token)endpoint+=(endpoint.includes('?')?'&':'?')+'roomId='+encodeURIComponent(token);
  if(body!==undefined){body={...body,...(token?{roomId:token}:{})};if(kind!=='action')body={requestId:crypto.randomUUID(),clientVersion:NOX_CLIENT_VERSION,...body};if(kind==='ready'&&body.ready)body.acceptedCoins=state?.entryCoins||'0';}
  try{
    let result;
    for(let attempt=0;attempt<2;attempt++){
      const started=performance.now();
      const response=await fetch(endpoint,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',authorization:'Bearer '+auth},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal,keepalive});
      result=await response.json();
      if(auth!==playerToken())throw Object.assign(new Error('로그인 정보가 바뀌었습니다. 다시 입장하세요.'),{status:401});
      // Error responses carry the same trusted clock sample as success. Do not
      // leave a bad clock untouched while rejecting every following input.
      const received=performance.now(),rtt=received-started,clock=result.serverNow??result.state?.responseNow??result.state?.serverNow,networkRtt=Math.max(0,rtt-(clock-(result.serverReceivedAt??clock)));
      if(Number.isFinite(clock)&&networkRtt<bestRtt+10){bestRtt=Math.min(bestRtt,networkRtt);offset=((result.serverReceivedAt??clock)-started+clock-received)/2;}
      if(!response.ok){if(response.status>=500&&body&&kind!=='action'&&!attempt)continue;throw Object.assign(new Error(result.error||'요청에 실패했습니다.'),{status:response.status,code:result.code});}break;
    }
    if(kind==='start'&&!result.state?.practice||kind==='create'&&result.state?.release.mode==='ON')window.parent.dispatchEvent(new Event('cnine:account-mutation'));
    return result;
  }finally{clearTimeout(timeout);requests.delete(controller);}
}
function screen(combat){$('lobby').hidden=combat;$('combat').hidden=!combat;document.body.classList.toggle('in-combat',combat);}
function healthMarkup(m){return `<article class="nox-member${m.id===state.me.id?' is-me':''}${m.hp<=0?' is-dead':''}" data-member="${esc(m.id)}"><div><strong>${esc(m.name)}</strong><span>${m.hp>0?roles[m.role]:'전투 불능'}</span></div><div class="nox-gauge" style="--hp:${Math.max(0,m.hp/Math.max(1,m.maxHp))}" role="progressbar" aria-label="${esc(m.name)} HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100*m.hp/Math.max(1,m.maxHp))}"><div class="nox-gauge-trail"></div><div class="nox-gauge-fill"></div></div></article>`;}
function render(result){
  if(!result?.state)return;const next=result.state;if(state&&state.id===next.id&&(next.revision<state.revision||next.revision===state.revision&&next.serverNow<state.serverNow))return;
  const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;seq=Math.max(seq,next.me.lastSequence);discardInputsThrough(next.me.lastSequence);if(result.payload)payload=result.payload;
  const practice=state.practice;
  if(state.status==='LOBBY'){
    screen(false);$('createForm').hidden=true;$('assembly').hidden=false;$('openRoomDirectory').hidden=true;
    $('roomDifficulty').textContent=difficultyLabel(state.difficulty)+(practice?' · 1인 연습':'');
    $('assembly').setAttribute('aria-label',practice?'1인 연습 대기실':'공대 집결');
    $('readyButton').textContent=practice?'연습 준비':state.release.mode==='ON'?`${formatAmount(state.entryCoins)} 입장료 확인 · 준비`:'무료 전투 준비';
    $('startButton').textContent=practice?'연습 시작':'전원 출전';
    $('lobbyLeave').textContent=practice?'연습 나가기':'공대 나가기';
    $('memberList').innerHTML=state.members.map(m=>`<li>${esc(m.name)}<span>${roles[m.role]} · ${m.ready?'준비 완료':'준비 중'}${m.bot?' · 연습 동료':''}</span></li>`).join('');
    $('startButton').hidden=!state.me.isHost||!state.me.ready||!mounted;$('startButton').disabled=state.members.length!==state.size||state.members.some(m=>!m.ready);$('readyButton').hidden=state.me.ready&&mounted;$('readyButton').disabled=preparing;
    if(preparing)$('prepareStatus').textContent='음원과 전장을 준비하고 있습니다…';
    else if(practice)$('prepareStatus').textContent=state.me.ready?'준비 완료 · 연습을 시작하세요.':'도전 비용 0 코인 · 음원과 전장을 준비하세요.';
    else $('prepareStatus').textContent=state.me.ready?`준비 ${state.members.filter(m=>m.ready).length}/${state.size} · 전원 준비 후 출전`:(state.entryCoins==='0'?'무료 TEST · 음원과 전장을 준비하세요.':`출전 시 1인 ${formatAmount(state.entryCoins)} 차감 · 전투 준비로 동의합니다.`);
    return;
  }
  screen(true);if(!mounted){void mountBattle().catch(error=>toast(error.message));return;}
  $('roundLabel').textContent=`${difficultyLabel(state.difficulty)} · ${practice?'1인 연습':state.size+'인'} · ${state.round}/3회차`;const pct=Math.max(0,state.bossHp/state.bossMaxHp*100);$('bossPercent').textContent=pct.toFixed(1)+'%';$('bossGauge').style.setProperty('--hp',pct/100);$('bossGauge').setAttribute('aria-valuenow',pct.toFixed(1));
  const sig=JSON.stringify(state.members.map(m=>[m.id,m.hp,m.role,m.ready,m.left]));if(sig!==hudSignature){hudSignature=sig;$('partyHud').innerHTML=state.members.map(healthMarkup).join('');}
  updateMechanic();
  // Apply the stage's layout before V3 projects its floor and click targets.
  window.NoxBattle.update(state,events);
  const last=events.filter(e=>e.type==='NOX_DEATH'||e.type==='NOX_COOP').at(-1);if(last)$('combatMessage').textContent=last.label;
  if(state.status!=='ACTIVE'&&!ended){
    ended=true;stopLoops();holding.clear();input?.destroy();input=null;audio.stop();window.NoxBattle.finish(state);
    $('resultTitle').textContent=practice?(state.status==='CLEAR'?'연습 클리어':'연습 실패'):(state.status==='CLEAR'?'종언의 지휘를 끊었다':'공략 실패');
    $('resultReason').textContent=state.failure?.reason||'적관의 지휘자 녹스를 쓰러뜨렸습니다.';
    $('resultDetail').textContent=`${difficultyLabel(state.difficulty)} · ${state.round}/3회차 · ${practice?'1인 연습':state.members.filter(m=>m.hp>0).length+'/'+state.size+'명 생존'}`;
    const payout=state.reward,paid=payout?.status==='PAID',reward=$('resultReward');
    reward.textContent=practice?'연습 보상 없음':paid?`코인 ${formatAmount(payout.coins)} · 마스터의 별 ${formatAmount(payout.masterStars)} 개 지급 · 주간 ${payout.weekly.used}/${payout.weekly.limit}회`:
      payout?.status==='LIMIT'?`이번 주 보상 ${payout.weekly.limit}회를 모두 수령했습니다.`:state.status==='CLEAR'&&state.release.mode==='TEST'?'TEST 클리어 · 보상 없음':'';
    reward.hidden=!reward.textContent;
    const drops=[payout?.blueprintDrop,payout?.ryujinMaterialDrop].filter(Boolean);
    for(const drop of drops){
      reward.textContent+=(reward.textContent?' · ':'')+drop.name+' '+drop.quantity+'개 획득';
      reward.hidden=false;
    }
    if(paid||drops.length)window.parent.dispatchEvent(new Event('cnine:account-mutation'));
    const resultDialog=$('resultDialog');
    if(keySettings.open)keySettings.close();
    if($('guideDialog').open)$('guideDialog').close();
    resultDialog.showModal();
    if(drops.length)void import('/js/blueprint-acquisition-v1.mjs?v=20261126-ryujin').then(module=>{
      if(state?.id===next.id&&resultDialog.open)module.showNoxAcquisitions(payout,resultDialog);
    }).catch(console.warn);
  }
}
function layoutChart(){
  const chart=$('chart');
  if(!chart)return;
  noteHeight=parseFloat(getComputedStyle(chart).getPropertyValue('--note-height'))||56;
  hitY=noxHitY(chart.clientHeight,noteHeight,chartTravelMs());
  chart.style.setProperty('--hit-y',hitY+'px');
  // Keep the note legible as the four lanes move closer on a portrait board.
  const holdWidth=Math.min(136,chart.clientWidth*.24,document.documentElement.clientWidth*.165);
  chart.style.setProperty('--hold-width',Math.round(holdWidth)+'px');
}
function loadScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[data-nox-src="${src}"]`);if(existing?.dataset.loaded)return resolve();const script=existing||document.createElement('script');script.dataset.noxSrc=src;script.src=src;script.onload=()=>{script.dataset.loaded='1';resolve();};script.onerror=()=>{script.remove();reject(new Error('전투 리소스를 불러오지 못했습니다. 다시 준비해 주세요.'));};if(!existing)document.head.append(script);});}
async function mountBattle(){
  if(mounted)return;if(mountPromise)return mountPromise;const version=epoch;
  mountPromise=(async()=>{
    if(!payload){const result=await api('state?payload=1');payload=result.payload;render(result);}
    await loadScript('/raid/nox/battle.bundle.js?astraLifecycle=20261120-v1&nox=20261126-ryujin&ryujin=20261119-v3-approach');if(version!==epoch)return;
    screen(true);await window.NoxBattle.mount(payload);if(version!==epoch){window.NoxBattle.teardown();return;}
    layer=$('mechanicTemplate').content.firstElementChild.cloneNode(true);$('battleMount').querySelector('.battle-v3-canvas-host').append(layer);mounted=true;
    renderRhythmKeys();
    chartObserver=new ResizeObserver(layoutChart);chartObserver.observe($('chart'));
    const canInput=()=>acceptsInputs()&&!document.hidden&&!$('guideDialog').open&&!keySettings.open&&!$('resultDialog').open;
    input=new NoxInput(layer,press,{laneKeys:()=>state.stage==='RHYTHM'?rhythmKeys:NOX_DEFAULT_KEYS,active:()=>canInput()&&state.stage!=='MEMORY',onRelease:releaseHold,onHeld:(lane,held)=>layer?.querySelectorAll(`[data-nox-lane="${lane}"]`).forEach(b=>b.classList.toggle('is-held',held))});
    floorAbort=new AbortController();const floorPress=e=>{const b=e.target.closest('[data-nox-tile]');if(!b||b.disabled||!canInput()||state.stage!=='MEMORY'||e.type==='pointerdown'&&e.button!==0||e.type==='click'&&e.detail!==0)return;e.preventDefault();press(Number(b.dataset.noxTile),eventTime(e));};
    $('floorTargets').addEventListener('pointerdown',floorPress,{signal:floorAbort.signal});$('floorTargets').addEventListener('click',floorPress,{signal:floorAbort.signal});
    if(state?.status==='LOBBY')screen(false);else if(state)render({state});
  })().finally(()=>{mountPromise=null;});return mountPromise;
}
async function prepare(){
  if(preparing)return;preparing=true;$('readyButton').disabled=true;$('prepareStatus').textContent='음원과 전장을 준비하고 있습니다…';const version=epoch;
  try{await audio.unlock();await Promise.all([audio.prepareAll(trackUrls()),mountBattle(),prepareRhythmArt()]);if(version!==epoch)return;render(await api('ready',{ready:true}));}
  catch(error){if(version!==epoch)return;if(error.name!=='AbortError')toast(error.message);screen(false);}
  finally{if(version===epoch){preparing=false;if(state?.status==='LOBBY')render({state});}}
}
function scheduleRhythmAudio(c){
  const previous=audio.source;
  audio.schedule(noxTrack(c.trackId).source,c.musicStartAt,serverNow());
  if(previous&&audio.source!==previous){holding.clear();input?.reset();}
  $('audioResume').hidden=audio.context?.state==='running'&&!!audio.source;
}
function updateMechanic(){
  if(!layer||!state?.challenge)return;const c=state.challenge;
  if(c.id!==stageId){stageId=c.id;blockedStage='';lastInputNotice='';stopInputStream();layer.dataset.stage=c.stage;$('combat').dataset.stage=c.stage;localHits=new Set();nodes.forEach(n=>n.remove());nodes.clear();input?.reset();clearHitEffects();showCombo(0);$('judgement').textContent='READY';$('timingDetail').textContent='노트 중앙을 판정선에 맞추세요';$('combatMessage').textContent='';
    $('rhythm').hidden=c.stage!=='RHYTHM';$('memory').hidden=c.stage!=='MEMORY';$('coop').hidden=c.stage!=='COOP';
    $('mechanicName').textContent=({RHYTHM:'종언의 악보',MEMORY:'잔향의 발판',COOP:'삼중 공명',EXPOSED:'왕관 붕괴'})[c.stage];
    $('mechanicHint').textContent=({RHYTHM:rhythmHint(),MEMORY:`안전 발판 ${memorySteps(c)}개의 순서를 기억하세요`,COOP:state.practice?'바늘이 중앙에 닿을 때 이 회차의 주파수를 누르세요':'각자 맡은 주파수를 같은 박자에 맞추세요',EXPOSED:'PVE 덱 집중 공격 · 다음 악보에 대비하세요'})[c.stage];
    if(c.stage==='MEMORY')$('floorTargets').innerHTML=c.tiles.map(tile=>`<button type="button" class="nox-floor-target" data-nox-tile="${tile.id}" aria-label="${tile.id+1}번 위치 ${tile.kind==='mine'?'지뢰지대':'안전지대'}"><span></span></button>`).join('');
    if(c.stage==='RHYTHM'){
      if(c.chart.some(n=>n.endAt!==undefined))$('timingDetail').textContent='긴 노트는 꼬리까지 누르세요';
      layoutChart();
    }
    else audio.stop();
  }
  if(!acceptsInputs()&&(outbox.length||holding.size||posts.size))stopInputStream();
  for(const id of state.me.hits||[])localHits.add(id);
  for(const id of state.me.holdAttempts||[])localHits.add(id);
  $('spectator').hidden=state.practice||state.me.hp>0||c.stage==='MEMORY';
  if(c.stage==='RHYTHM'&&state.status==='ACTIVE'){
    scheduleRhythmAudio(c);
    const age=noxRhythmTime(audio.timeAt()??serverNow()-c.musicStartAt,calibration),passed=c.chart.filter(n=>(n.endAt??n.at)<=age-NOX_RHYTHM_RULES.goodMs).length;$('rhythmScore').textContent=`정확도 ${Math.min(100,Math.round(state.me.score/Math.max(1,passed)*100))}% · ${state.me.hits.length}/${c.chart.length}`;
  }
  if(c.stage==='MEMORY'){
    const steps=memorySteps(c),showing=serverNow()<c.revealEnd,dead=state.me.hp<=0,complete=state.me.memoryIndex===steps;
    $('memoryCue').textContent=dead?'전투 불능':complete?'안전지대 도착':showing?'안전 경로 기억':'바닥을 누르세요';
    $('memoryCue').parentElement.dataset.state=dead?'dead':complete?'complete':'active';
    layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=showing||dead||complete;b.dataset.kind=c.tiles[Number(b.dataset.noxTile)].kind;});
    $('memoryProgress').textContent=dead?(state.me.deathReason||'공략 실패')+(state.practice?'':' · 관전 중'):complete?`${steps}개 발판 통과 · 다음 기믹 대기`:showing?`안전 발판 ${steps}개 · 지뢰 ${c.tiles.length-steps}개`:`${state.me.memoryIndex}/${steps} · 순서 오류·미입력 시 즉사`;
  }
  if(c.stage==='COOP'){
    $('coopRole').textContent=`내 주파수: ${roles[state.me.role]} · ${noxKeyLabel(NOX_DEFAULT_KEYS[state.me.role])}`;
    layer.querySelectorAll('.nox-frequency-buttons button').forEach((b,i)=>b.disabled=i!==state.me.role||state.me.cooperated||state.me.hp<=0);$('coopStatus').textContent=`공명 ${state.members.filter(m=>m.cooperated&&m.hp>0).length}/${state.members.filter(m=>m.hp>0).length} · ±225ms`;
  }
  if(!frame&&state.status==='ACTIVE')frame=requestAnimationFrame(paint);
}
function paint(now){
  frame=0;if(!state||state.status!=='ACTIVE'||!mounted||document.hidden)return;
  if(lastPaint){const dt=now-lastPaint;if(frameTimes.length<2400)frameTimes.push(dt);frameSummary.count++;frameSummary.total+=dt;frameSummary.max=Math.max(frameSummary.max,dt);if(dt>50)frameSummary.over50++;}lastPaint=now;
  const c=state.challenge,t=serverNow();clockText('enrageClock',fmt(state.endsAt-t));clockText('mechanicClock',t<c.startsAt?`시작까지 ${Math.ceil((c.startsAt-t)/1000)}`:c.stage==='EXPOSED'?fmt(c.deadline-t):c.stage==='MEMORY'?`${Math.max(0,(c.deadline-t)/1000).toFixed(1)}초`:c.stage==='COOP'?`${Math.max(0,(c.targetAt-t)/1000).toFixed(2)}초`:'');
  if(c.stage==='RHYTHM'){
    // RAF's shared timestamp can precede expensive V3 callbacks. Sample when
    // actually drawing, using the same clock/calibration as the input event.
    const audibleTime=audio.timeAt();
    const musicTime=audibleTime??t-c.musicStartAt,age=noxRhythmTime(musicTime,calibration);
    clockText('rhythmClock',t<c.startsAt?$('mechanicClock').textContent:fmt(noxTrack(c.trackId).chartEndMs-musicTime));
    if(audibleTime!==null&&audio.context?.state==='running'&&state.me.hp>0){
      for(const [lane,{judged}] of holding)if(age>=judged.note.endAt&&input?.isHeld(lane))finishHold(lane,age);
    }
    const travelMs=chartTravelMs(),visible=new Set();
    const first=noxNoteStart(c.chart,age-NOX_RHYTHM_RULES.goodMs-NOX_RHYTHM_RULES.holdMaxMs);
    for(let i=first;i<c.chart.length;i++){
      const n=c.chart[i];
      if(n.at>age+travelMs)break;
      const held=holding.get(n.lane)?.judged.note.id===n.id;
      if(!held&&(localHits.has(n.id)||n.at<age-NOX_RHYTHM_RULES.goodMs))continue;
      visible.add(n.id);
      let el=nodes.get(n.id);
      if(!el){
        el=document.createElement('div');
        el.className=n.endAt===undefined?'nox-note':'nox-note is-long';
        el.dataset.noteId=n.id;
        el.dataset.tone=n.lane===1||n.lane===2?'ivory':'ruby';
        el.style.setProperty('--lane',n.lane);
        $('notes').append(el);
        nodes.set(n.id,el);
      }
      if(n.endAt===undefined){
        el.style.transform=`translateY(${noxNoteY(n.at,age,hitY,noteHeight,travelMs)}px)`;
      }else{
        const head=noxNoteY(held?Math.max(age,n.at):n.at,age,hitY,0,travelMs);
        const tail=noxNoteY(n.endAt,age,hitY,0,travelMs);
        el.classList.toggle('is-holding',held);
        el.style.setProperty('--hold-length',`${Math.max(0,head-tail)}px`);
        el.style.transform=`translateY(${tail}px)`;
      }
    }
    for(const [id,el]of nodes)if(!visible.has(id)){el.remove();nodes.delete(id);}
  }else if(c.stage==='MEMORY'){
    const cue=c.cues?.find(cue=>t>=cue.from&&t<cue.to);const cueId=cue?.tile??null;if(c.cue!==cueId){c.cue=cueId;c.cueStep=cue?.step??null;window.NoxBattle.memoryCue(state);}const blocked=t<c.revealEnd||state.me.hp<=0||state.me.memoryIndex>=memorySteps(c);layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=blocked;});window.NoxBattle.placeFloorTargets($('floorTargets'));
  }else if(c.stage==='COOP'){
    const ratio=Math.min(1,Math.max(0,(t-(c.targetAt-1800))/3600));$('syncNeedle').style.left=`${ratio*100}%`;
  }
  frame=requestAnimationFrame(paint);
}
function queueInput(lane,at,noteId,release=false){
  outbox.push({lane,at,seq:++seq,noteId,...(release?{release:true}:{})});
  scheduleFlush();
}
function finishHold(lane,relative){
  const held=holding.get(lane),c=state?.challenge;
  if(!held||c?.stage!=='RHYTHM')return;
  holding.delete(lane);
  const {judged,at}=held,{endAt,id}=judged.note;
  queueInput(lane,c.musicStartAt+relative,id,true);
  showHit(lane,relative>=endAt-NOX_RHYTHM_RULES.holdReleaseMs?judged:null,at,'holdEnd');
}
function releaseHold(lane,perfTime){
  if(!holding.has(lane)||state?.status!=='ACTIVE')return;
  const time=!document.hidden&&audio.context?.state==='running'?audio.timeAt(perfTime):null;
  if(time!==null)finishHold(lane,noxRhythmTime(time,calibration));
  else holding.delete(lane);
}
function press(lane,perfTime){
  if(!state?.challenge||state.me.hp<=0)return;const c=state.challenge;
  if(!['RHYTHM','MEMORY','COOP'].includes(c.stage)||lane>(c.stage==='RHYTHM'?3:c.stage==='MEMORY'?c.tiles.length-1:2))return;
  const audioTime=c.stage==='RHYTHM'?audio.timeAt(perfTime):null;
  if(c.stage==='RHYTHM'&&(audio.context?.state!=='running'||audioTime===null)){inputNotice('AUDIO','소리 재개를 눌러 음원을 연결하세요.');return;}
  const at=audioTime===null?perfTime+offset:c.musicStartAt+noxRhythmTime(audioTime,calibration);
  if(at<c.startsAt||c.stage==='MEMORY'&&(at<c.revealEnd||state.me.memoryIndex>=memorySteps(c))||c.stage==='COOP'&&state.me.cooperated)return;
  if(c.stage!=='RHYTHM'){queueInput(lane,at);return;}
  const relative=at-c.musicStartAt,judged=nearestNoxNote(c.chart,localHits,lane,relative),note=judged?.note;
  if(note)localHits.add(note.id);
  queueInput(lane,at,note?.id);
  if(note?.endAt!==undefined){
    holding.set(lane,{judged,at:relative});
    showHit(lane,judged,relative,'holdStart');
    if(!input?.isHeld(lane))finishHold(lane,relative);
    return;
  }
  showHit(lane,judged,relative);
  if(note){nodes.get(note.id)?.remove();nodes.delete(note.id);}
}
function stopInputStream(){
  clearTimeout(flushTimer);flushTimer=0;
  for(const {controller} of posts.values())controller.abort();
  posts.clear();sentPackets.clear();holding.clear();outbox=[];retryAt=0;retryDelay=250;
}
function discardInputsThrough(sequence){
  outbox=outbox.filter(p=>p.seq>sequence);
  for(const end of sentPackets.keys())if(end<=sequence)sentPackets.delete(end);
}
function scheduleFlush(){if(flushTimer||posts.size>=8||!outbox.length||!acceptsInputs()||document.hidden)return;flushTimer=setTimeout(()=>{flushTimer=0;void flush();},Math.max(35,retryAt-performance.now()));}
async function flush(){
  if(posts.size>=8||!outbox.length||!acceptsInputs()||document.hidden)return;
  // Do not make subsequent keys wait for a slow acknowledgement. Overlapping
  // packets carry unacknowledged keys; the server applies each sequence once.
  const version=epoch,batch=outbox.slice(0,24),end=batch.at(-1).seq,packet=sentPackets.get(end)||{seq:end,challengeId:state.challenge.id,inputs:batch.map(({lane,at,release})=>release?{lane,at,release}:{lane,at}),stream:true},key=version+':'+packet.seq;
  if(posts.has(key))return;const controller=new AbortController();sentPackets.set(end,packet);posts.set(key,{packet,controller});
  try{
    let result;
    for(let attempt=0;attempt<2;attempt++){
      try{result=await api('action?since='+eventSeq,packet,{controller});break;}
      catch(error){if(controller.signal.aborted||error.status&&error.status<500||attempt===1)throw error;}
    }
    if(version!==epoch)return;
    if(packet.challengeId===stageId&&outbox[0]?.seq<=packet.seq){retryAt=0;retryDelay=250;lastInputNotice='';}
    render(result);
  }catch(error){
    if(version!==epoch||packet.challengeId!==stageId||!acceptsInputs()||!outbox.length||outbox[0].seq>packet.seq)return;
    if(error.code==='INACTIVE'||error.code==='STALE_CHALLENGE'){
      blockedStage=stageId;stopInputStream();void sync();return;
    }
    if(error.status&&error.status<500&&error.status!==429){
      discardInputsThrough(packet.seq);
      localHits=new Set([...(state.me.hits||[]),...(state.me.holdAttempts||[]),...outbox.map(p=>p.noteId).filter(id=>id!==undefined)]);
      for(const [lane,{judged}] of holding)if(!localHits.has(judged.note.id))holding.delete(lane);
      if(error.code==='INPUT_TIME'&&state.stage==='RHYTHM'&&lastInputNotice!==error.code){
        holding.clear();input?.reset();audio.stop();scheduleRhythmAudio(state.challenge);
      }
    }else{
      retryAt=performance.now()+retryDelay;retryDelay=Math.min(2000,retryDelay*2);
    }
    if(error.name!=='AbortError')inputNotice(error.code||'NETWORK',error.message);
    void sync();
  }finally{posts.delete(key);if(version===epoch)scheduleFlush();}
}
function stopLoops(){clearTimeout(pollTimer);clearTimeout(flushTimer);cancelAnimationFrame(frame);pollTimer=flushTimer=frame=0;lastPaint=0;clearHitEffects();}
function schedulePoll(){clearTimeout(pollTimer);if(!token||ended||document.hidden)return;pollTimer=setTimeout(()=>void sync(),state?.status==='ACTIVE'?200:1500);}
async function sync(){if(!token||polling)return;polling=true;const version=epoch;try{const result=await api('state?since='+eventSeq+(!payload?'&payload=1':''));if(version===epoch){render(result);if(state?.status!=='LOBBY'&&!mounted)await mountBattle();}}catch(error){if(version===epoch&&error.name!=='AbortError'){toast(error.message);if(error.status===401||error.status===403||error.status===404||error.status===423)await leave(false);}}finally{polling=false;if(version===epoch)schedulePoll();}}
async function leave(notify=true){
  if(leaving)return;
  leaving=true;
  if(keySettings.open)keySettings.close();
  const oldToken=token;epoch++;stopLoops();stopRoomRefresh();requests.forEach(c=>c.abort());requests.clear();posts.clear();sentPackets.clear();retryAt=0;retryDelay=250;holding.clear();input?.destroy();input=null;floorAbort?.abort();chartObserver?.disconnect();await audio.suspend();window.NoxBattle?.teardown();mounted=false;mountPromise=null;layer?.remove();layer=null;nodes.clear();outbox=[];stageId='';token='';sessionStorage.removeItem('noxLiveRoom');state=null;payload=null;eventSeq=0;seq=0;ended=false;preparing=false;hudSignature='';bestRtt=Infinity;frameTimes=[];frameSummary={count:0,total:0,max:0,over50:0};screen(false);$('createForm').hidden=false;$('assembly').hidden=true;$('createButton').disabled=true;$('audioResume').hidden=true;
  if(notify&&oldToken)try{await api('leave',{roomId:oldToken},{keepalive:true});}catch(error){toast(error.message);}
  leaving=false;
  $('createButton').disabled=establishing||!lobbyFeature?.accessible;
  updateRoomLauncher();
}
function updateRoomLauncher(){
  $('openRoomDirectory').hidden=!!token||!lobbyFeature?.accessible;
  $('openRoomDirectory').disabled=establishing||leaving;
}
function stopRoomRefresh(){
  clearTimeout(roomsTimer);
  roomsRequest?.abort();
  roomsRequest=null;
  $('refreshRooms').disabled=false;
}
function openRoomDirectory(){
  if(roomDirectory.open||token||establishing||leaving||!lobbyFeature?.accessible)return;
  stopRoomRefresh();
  $('roomJoinStatus').hidden=true;
  $('roomListContent').hidden=true;
  $('roomListStatus').textContent='대기방을 불러오는 중입니다.';
  $('roomListStatus').hidden=false;
  roomDirectory.showModal();
  void refreshRooms();
}
async function refreshRooms(){
  clearTimeout(roomsTimer);
  if(!roomDirectory.open||roomsRequest||token||establishing||leaving||document.hidden||!lobbyFeature?.accessible)return;
  const controller=new AbortController();
  roomsRequest=controller;
  $('refreshRooms').disabled=true;
  try{
    const {rooms}=await api('rooms',undefined,{controller});
    if(roomsRequest!==controller||!roomDirectory.open)return;
    const signature=JSON.stringify(rooms);
    if(signature!==roomListSignature){
      $('roomList').innerHTML=rooms.map(room=>{
        const host=esc(room.host||'공대장');
        return `<li>
          <strong class="nox-room-host">${host}</strong>
          <span class="nox-room-mode" data-difficulty="${esc(room.difficulty)}">${difficultyLabel(room.difficulty)}</span>
          <span class="nox-room-seats">${room.members}/${room.size}명</span>
          <button type="button" class="nox-quiet" data-room-id="${esc(room.id)}" aria-label="${host} 공대 참가">참가</button>
        </li>`;
      }).join('');
      roomListSignature=signature;
    }
    $('roomListStatus').textContent=rooms.length?'':'현재 모집 중인 공대가 없습니다.';
    $('roomListStatus').hidden=rooms.length>0;
    $('roomListContent').hidden=!rooms.length;
  }catch(error){
    if(roomsRequest!==controller||!roomDirectory.open)return;
    $('roomListStatus').textContent=error.name==='AbortError'?'대기방을 불러오지 못했습니다. 다시 시도하세요.':error.message;
    $('roomListStatus').hidden=false;
    $('roomListContent').hidden=true;
  }finally{
    if(roomsRequest===controller){
      roomsRequest=null;
      $('refreshRooms').disabled=false;
      if(roomDirectory.open&&!document.hidden)roomsTimer=setTimeout(refreshRooms,5000);
    }
  }
}
async function establish(action,body){
  if(establishing||leaving)return;
  establishing=true;
  $('createButton').disabled=true;
  updateRoomLauncher();
  try{
    await leave();
    $('createButton').disabled=true;
    const result=await api(action,body);
    token=result.roomId;sessionStorage.setItem('noxLiveRoom',token);
    if(roomDirectory.open)roomDirectory.close();
    render(result);schedulePoll();
    if(action==='join')$('readyButton').focus();
  }catch(error){
    if(action==='join'&&roomDirectory.open){
      $('roomJoinStatus').textContent=error.message;
      $('roomJoinStatus').hidden=false;
    }else toast(error.message);
    if(error.code==='NOX_CREATE_FEE_CONSENT')void loadLobbyFeature().catch(()=>{});
  }finally{
    establishing=false;
    $('createButton').disabled=!lobbyFeature?.accessible;
    updateRoomLauncher();
    if(roomDirectory.open)void refreshRooms();
  }
}
$('createForm').addEventListener('submit',e=>{
  e.preventDefault();
  const form=new FormData(e.target);
  const size=Number(form.get('size')),difficulty=form.get('difficulty');
  if(size===1)void establish('practice',{difficulty});
  else void establish('create',{size,difficulty,acceptedCreateCoins:lobbyFeature?.createCoins||'0'});
});
$('createForm').addEventListener('change',e=>{if(e.target.name==='size')showLobbyPolicy();});
$('openRoomDirectory').onclick=openRoomDirectory;
$('closeRoomDirectory').onclick=()=>roomDirectory.close();
roomDirectory.addEventListener('close',()=>{if(!roomDirectory.open)stopRoomRefresh();});
$('roomList').addEventListener('click',async e=>{
  const button=e.target.closest('[data-room-id]');
  if(!button||!roomDirectory.open||token||establishing||leaving)return;
  $('roomJoinStatus').hidden=true;
  button.disabled=true;
  button.textContent='참가 중';
  try{await establish('join',{roomId:button.dataset.roomId});}
  finally{button.disabled=false;button.textContent='참가';}
});
$('refreshRooms').onclick=()=>void refreshRooms();
$('readyButton').onclick=()=>void prepare();$('startButton').onclick=async()=>{const b=$('startButton');b.disabled=true;try{await audio.unlock();render(await api('start',{}));schedulePoll();}catch(error){toast(error.message);b.disabled=false;}};
$('leaveButton').onclick=$('lobbyLeave').onclick=()=>void leave();
$('retryButton').onclick=async()=>{
  $('resultDialog').close();await leave();
  if(lobbyFeature?.mode==='ON')void loadLobbyFeature().catch(error=>toast(error.message));
};
function rhythmKeyText(){return rhythmKeys.map(noxKeyLabel).join(' · ');}
function rhythmHint(){return rhythmKeyText()+'  /  정확도 90% · MISS 3 이하';}

function renderRhythmKeys(){
  $('guideRhythmKeys').textContent=rhythmKeyText();
  for(const [lane,button] of bindingButtons.entries()){
    button.querySelector('kbd').textContent=noxKeyLabel(rhythmKeys[lane]);
  }
  if(!layer)return;
  for(const button of layer.querySelectorAll('.nox-keys [data-nox-lane]')){
    const lane=Number(button.dataset.noxLane),label=noxKeyLabel(rhythmKeys[lane]);
    button.textContent=label;
    button.setAttribute('aria-label',(lane+1)+'번 레인, '+label);
    button.toggleAttribute('data-wide-key',label.length>2);
  }
  if(state?.stage==='RHYTHM')$('mechanicHint').textContent=rhythmHint();
}

function captureLane(lane,message=''){
  bindingLane=lane;
  bindingButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===lane)));
  $('keySettingsStatus').textContent=message;
}

function saveRhythmKeys(keys,message){
  rhythmKeys=keys;
  try { localStorage.setItem(rhythmStorageKey,JSON.stringify(keys)); }
  catch { message+=' 이 브라우저에서는 이번 접속에만 적용됩니다.'; }
  renderRhythmKeys();
  captureLane(null,message);
}

document.querySelectorAll('[data-key-settings]').forEach(button=>button.onclick=()=>{
  input?.reset();
  captureLane(null);
  keySettings.showModal();
});
for(const [lane,button] of bindingButtons.entries()){
  button.onclick=()=>{
    button.focus({preventScroll:true});
    captureLane(lane,(lane+1)+'번 레인에 사용할 키를 누르세요. Esc로 취소할 수 있습니다.');
  };
}
keySettings.addEventListener('focusout',event=>{
  if(bindingLane!==null&&event.target===bindingButtons[bindingLane])captureLane(null);
});
keySettings.addEventListener('keydown',event=>{
  if(bindingLane===null||event.key==='Tab')return;
  event.preventDefault();
  event.stopPropagation();
  if(event.repeat)return;
  if(event.key==='Escape'){captureLane(null,'키 지정을 취소했습니다.');return;}
  const lane=bindingLane,code=event.code,label=noxKeyLabel(code);
  if(!label||event.metaKey){
    $('keySettingsStatus').textContent='이 키는 지정할 수 없습니다. 다른 키를 눌러 주세요.';
    return;
  }
  const other=rhythmKeys.indexOf(code);
  const message=other>=0&&other!==lane
    ? (lane+1)+'번과 '+(other+1)+'번 레인의 키를 맞바꿨습니다.'
    : (lane+1)+'번 레인을 '+label+' 키로 설정했습니다.';
  saveRhythmKeys(rebindNoxLane(rhythmKeys,lane,code),message);
});
keySettings.addEventListener('cancel',event=>{
  if(bindingLane!==null){event.preventDefault();captureLane(null,'키 지정을 취소했습니다.');}
});
keySettings.addEventListener('close',()=>captureLane(null));
$('resetRhythmKeys').onclick=()=>saveRhythmKeys([...NOX_DEFAULT_KEYS],'기본 키 D · F · J · K를 복원했습니다.');
$('closeKeySettings').onclick=()=>keySettings.close();
renderRhythmKeys();

document.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{input?.reset();$('guideDialog').showModal();});$('closeGuide').onclick=()=>$('guideDialog').close();
$('guideDialog').addEventListener('close',()=>{if(state?.status==='ACTIVE'&&!keySettings.open&&!$('resultDialog').open)layer?.focus({preventScroll:true});});
$('calibration').value=calibration;$('calibrationValue').textContent=calibration+' ms';$('calibration').oninput=e=>{calibration=Number(e.target.value);$('calibrationValue').textContent=calibration+' ms';localStorage.setItem('noxTimingOffset',String(calibration));};
$('audioResume').onclick=async()=>{const version=epoch;try{await audio.unlock();await audio.prepareAll(trackUrls());if(version!==epoch)return;if(state?.challenge?.stage==='RHYTHM')scheduleRhythmAudio(state.challenge);}catch(error){if(error.name!=='AbortError')toast(error.message);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopLoops();stopRoomRefresh();input?.reset();audio.stop();window.NoxBattle?.visible(false);}else if(token){window.NoxBattle?.visible(true);lastPaint=0;scheduleFlush();void sync();}else if(roomDirectory.open)void refreshRooms();});
window.addEventListener('pagehide',()=>{stopLoops();stopRoomRefresh();requests.forEach(c=>c.abort());holding.clear();input?.destroy();floorAbort?.abort();chartObserver?.disconnect();void audio.destroy();window.NoxBattle?.teardown();});
window.addEventListener('resize',()=>window.NoxBattle?.resize());
function formatAmount(amount){
  const value=BigInt(amount),trillion=1000000000000n,hundredMillion=100000000n;
  if(value>=trillion&&value%trillion===0n)return value/trillion+'조';
  if(value>=hundredMillion&&value%hundredMillion===0n)return value/hundredMillion+'억';
  return value.toLocaleString('ko-KR');
}
function showLobbyPolicy(){
  if(!lobbyFeature)return;
  const {mode,entryCoins,createCoins}=lobbyFeature,practice=$('practiceOption').checked;
  const official=mode==='ON'&&!practice;
  $('feeMode').textContent=mode==='OFF'?'입장 중지':practice?'무료 1인 연습':official?'공식 레이드':'TEST · 지정 참가자 무료';
  $('feeDetail').textContent=mode==='OFF'?'현재 입장 중지 상태입니다.':practice?'도전 비용 0 코인 · 클리어 보상 없음':official?`출전 시 1인 ${formatAmount(entryCoins)} 코인 차감`:'TEST 클리어 보상 없음';
  $('createButton').textContent=practice?'1인 연습 입장':official?`공대 만들기 · ${formatAmount(createCoins)} 코인`:'공대 만들기';
  $('openRoomDirectory').hidden=!lobbyFeature.accessible||!!token;
  if(!lobbyFeature.accessible&&roomDirectory.open)roomDirectory.close();
  const weekly=official&&lobbyFeature?.weeklyReward;
  $('weeklyReward').textContent=weekly?`노말·헬 합산 보상 ${weekly.used}/${weekly.limit}회 수령 · 류진 재료 추첨 포함 · 월요일 00:00 초기화`:'';
  $('weeklyReward').hidden=!weekly;
  for(const [id,key] of [['normalReward','NORMAL'],['hellReward','HELL']]){
    const reward=official&&lobbyFeature?.rewards?.[key];
    const material=reward?.ryujinChanceBps?` · 류진 재료 3종 중 1개 ${reward.ryujinChanceBps/100}%`:'';
    $(id).textContent=reward?`코인 ${formatAmount(reward.coins)} · 마스터의 별 ${formatAmount(reward.masterStars)} 개`+material:'';
    $(id).hidden=!reward;
  }
}
async function loadLobbyFeature(){
  lobbyFeature=await api('feature?weekly=1');
  showLobbyPolicy();
  return lobbyFeature;
}
$('exitRaid').onclick=async e=>{e.preventDefault();await leave();if(window.parent!==window)window.parent.postMessage({type:'nox-exit'},location.origin);else location.href='/';};
async function boot(){
  $('createButton').disabled=true;
  try{const feature=await loadLobbyFeature();if(!feature.accessible)throw new Error(feature.mode==='OFF'?'현재 입장 중지 상태입니다.':'지정된 테스트 참가자만 입장할 수 있습니다.');
    const result=await api('deck');$('deckList').innerHTML=result.cards.map(c=>`<figure><img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy"><figcaption>${esc(c.title)}</figcaption></figure>`).join('');$('deckNotice').textContent='저장된 PVE 덱으로 출전합니다. · '+result.account.name;token=result.roomId||'';if(token){sessionStorage.setItem('noxLiveRoom',token);await sync();}else sessionStorage.removeItem('noxLiveRoom');$('createButton').disabled=false;
  }catch(error){$('deckNotice').textContent=error.message;$('feeDetail').textContent=error.message;token='';}
  finally{updateRoomLauncher();}
}
window.NoxRaid={sync,leave,diagnostics:()=>({state,mounted,pendingInputs:outbox.length,inputRequests:posts.size,inputPackets:sentPackets.size,inflight:requests.size,poll:!!pollTimer,raf:!!frame,held:input?.held.size||0,audio:audio.context?.state,playing:!!audio.source,trackUrl:audio.trackUrl,hitVoices:audio.hitVoices.size,hitAnimations:[...hitAnimations.values()].flat().filter(a=>a.playState==='running').length,preparedTracks:audio.buffers.size,audioBufferBytes:[...audio.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),audioPositionMs:audio.timeAt(),serverNowEstimate:serverNow(),notes:nodes.size,frameTimes:[...frameTimes],frameSummary:{...frameSummary},battle:window.NoxBattle?.diagnostics()})};
void boot();
