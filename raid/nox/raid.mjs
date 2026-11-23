import {NoxInput,NoxAudio,nearestNoxNote,noxRhythmTime,noxNoteY,noxHitY,noxNoteStart,eventTime} from '/js/nox-input-v1.mjs?v=20261123-difficulty1';
import {NOX_TRACK,NOX_RHYTHM_RULES,noxTrack} from '/shared/nox-raid-chart-v1.mjs?v=20261120-full1';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clockText=(id,value)=>{const el=$(id);if(el.textContent!==value)el.textContent=value;};
const roles=['저음','중음','고음'],keys=['D','F','J','K'];
let token=sessionStorage.getItem('noxLiveRoom')||'',state=null,payload=null,epoch=0,eventSeq=0,pollTimer=0,flushTimer=0,frame=0,toastTimer=0,input=null,layer=null,mounted=false,mountPromise=null,preparing=false,seq=0,offset=Date.now()-performance.now(),bestRtt=Infinity,stageId='',localHits=new Set(),outbox=[],nodes=new Map(),hudSignature='',ended=false,requests=new Set(),polling=false,lastPaint=0,frameTimes=[];
const posts=new Map(),sentPackets=new Map();
let retryAt=0,retryDelay=250;
let calibration=Math.max(-150,Math.min(150,Number(localStorage.getItem('noxTimingOffset'))||0));
const audio=new NoxAudio(),serverNow=()=>performance.now()+offset;
let chartObserver=null,hitY=1,noteHeight=56,combo=0,floorAbort=null;
let lobbyFeature=null,establishing=false;
const difficultyLabel=key=>key==='HELL'?'헬':'노말';
const memorySteps=challenge=>challenge.cues?.length??3;
const chartTravelMs=()=>state?.challenge?.travelMs??NOX_RHYTHM_RULES.travelMs;
const trackUrls=()=>state?.playlist?.length?state.playlist.map(id=>noxTrack(id).source):[NOX_TRACK.source];
let frameSummary={count:0,total:0,max:0,over50:0};
const hitAnimations=new Map();
function clearHitEffects(){for(const list of hitAnimations.values())for(const animation of list)animation.cancel();hitAnimations.clear();}
function showHit(lane,judged,at){
  const grade=judged?.grade||'EMPTY';$('judgement').textContent=grade;$('judgement').dataset.grade=grade;
  const delta=judged?at-judged.note.at:0;$('timingDetail').textContent=judged?(Math.abs(delta)<12?'정확한 타이밍':`${delta<0?'빠름':'늦음'} ${Math.round(Math.abs(delta))}ms`):'노트가 없는 입력';
  combo=judged?combo+1:0;$('rhythmCombo').textContent=combo?combo+' COMBO':'';
  const effect=layer.querySelector(`[data-hit-lane="${lane}"]`),column=layer.querySelectorAll('.nox-chart-columns i')[lane],key=layer.querySelector(`.nox-keys [data-nox-lane="${lane}"]`),receptor=layer.querySelectorAll('.nox-hit-line i')[lane];
  for(const animation of hitAnimations.get(lane)||[])animation.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,perfect=grade==='PERFECT',options={duration:reduced?120:320,easing:'cubic-bezier(.16,1,.3,1)'};
  effect.dataset.grade=grade;
  const animations=[column.animate([{backgroundColor:judged?'#ffd99d1a':'#ec283d22'},{backgroundColor:'transparent'}],{duration:140})];
  if(judged){
    audio.hit(grade);
    animations.push(effect.animate([{opacity:1,transform:reduced?'none':'scale(.65,.7)'},{opacity:perfect?1:.8,transform:reduced?'none':'scale(1.12,1)',offset:.18},{opacity:0,transform:reduced?'none':`scale(${perfect?1.55:1.3},1.2)`}],options));
    animations.push(key.animate(reduced?[{filter:'brightness(1.8)'},{filter:'brightness(1)'}]:[{transform:'translateY(3px) scale(.97,.92)',filter:'brightness(2)'},{transform:'translateY(-1px) scale(1.015,1.04)',filter:'brightness(1.3)',offset:.45},{transform:'none',filter:'brightness(1)'}],{duration:reduced?100:190,easing:'ease-out'}));
    animations.push(receptor.animate([{filter:`grayscale(0) brightness(${perfect?2.5:1.8})`},{filter:'grayscale(1) brightness(.75)'}],{duration:180}));
  }
  hitAnimations.set(lane,animations);
  for(const animation of hitAnimations.get('readout')||[])animation.cancel();
  hitAnimations.set('readout',judged?[$('judgement').animate(reduced?[{opacity:1},{opacity:1}]:[{transform:`scale(${perfect?1.16:1.08})`,textShadow:'0 0 18px #ffc980'},{transform:'scale(1)',textShadow:'0 2px 3px #000'}],{duration:190,easing:'ease-out'}),$('rhythmCombo').animate([{transform:reduced?'none':`scale(${combo%10===0?1.22:1.08})`,color:'#fff4ce'},{transform:'none',color:'#ffca9b'}],{duration:220})]:[]);
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
function playerToken(){return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}
async function api(route,body,{keepalive=false,controller=new AbortController()}={}){
  const auth=playerToken();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),7000);
  const kind=route.split('?')[0];let endpoint='/api/raid/nox/'+route;
  if(body===undefined&&token)endpoint+=(endpoint.includes('?')?'&':'?')+'roomId='+encodeURIComponent(token);
  if(body!==undefined){body={...body,...(token?{roomId:token}:{})};if(kind!=='action')body={requestId:crypto.randomUUID(),clientVersion:5,...body};if(kind==='ready'&&body.ready)body.acceptedCoins=state?.entryCoins||'0';}
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
    if(kind==='start'||kind==='create'&&result.state?.release.mode==='ON')window.parent.dispatchEvent(new Event('cnine:account-mutation'));
    return result;
  }finally{clearTimeout(timeout);requests.delete(controller);}
}
function screen(combat){$('lobby').hidden=combat;$('combat').hidden=!combat;document.body.classList.toggle('in-combat',combat);}
function healthMarkup(m){return `<article class="nox-member${m.id===state.me.id?' is-me':''}${m.hp<=0?' is-dead':''}" data-member="${esc(m.id)}"><div><strong>${esc(m.name)}</strong><span>${m.hp>0?roles[m.role]:'전투 불능'}</span></div><div class="nox-gauge" style="--hp:${Math.max(0,m.hp/Math.max(1,m.maxHp))}" role="progressbar" aria-label="${esc(m.name)} HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100*m.hp/Math.max(1,m.maxHp))}"><div class="nox-gauge-trail"></div><div class="nox-gauge-fill"></div></div></article>`;}
function render(result){
  if(!result?.state)return;const next=result.state;if(state&&state.id===next.id&&(next.revision<state.revision||next.revision===state.revision&&next.serverNow<state.serverNow))return;
  const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;seq=Math.max(seq,next.me.lastSequence);outbox=outbox.filter(p=>p.seq>next.me.lastSequence);for(const end of sentPackets.keys())if(end<=next.me.lastSequence)sentPackets.delete(end);if(result.payload)payload=result.payload;
  if(state.status==='LOBBY'){
    screen(false);$('createForm').hidden=true;$('assembly').hidden=false;$('roomCode').textContent=state.id;showFee(state.release.mode,state.entryCoins);
    $('roomDifficulty').textContent=difficultyLabel(state.difficulty);
    $('memberList').innerHTML=state.members.map(m=>`<li>${esc(m.name)}<span>${roles[m.role]} · ${m.ready?'준비 완료':'준비 중'}${m.bot?' · 연습 동료':''}</span></li>`).join('');
    $('startButton').hidden=!state.me.isHost||!state.me.ready||!mounted;$('startButton').disabled=state.members.length!==state.size||state.members.some(m=>!m.ready);$('readyButton').hidden=state.me.ready&&mounted;$('readyButton').disabled=preparing;
    $('prepareStatus').textContent=preparing?'음원과 전장을 준비하고 있습니다…':state.me.ready?`준비 ${state.members.filter(m=>m.ready).length}/${state.size} · 전원 준비 후 출전`:(state.entryCoins==='0'?'무료 TEST · 음원과 전장을 준비하세요.':`출전 시 1인 ${formatAmount(state.entryCoins)} 차감 · 전투 준비로 동의합니다.`);return;
  }
  screen(true);if(!mounted){void mountBattle().catch(error=>toast(error.message));return;}
  $('roundLabel').textContent=`${difficultyLabel(state.difficulty)} · ${state.size}인 · ${state.round}/3회차`;const pct=Math.max(0,state.bossHp/state.bossMaxHp*100);$('bossPercent').textContent=pct.toFixed(1)+'%';$('bossGauge').style.setProperty('--hp',pct/100);$('bossGauge').setAttribute('aria-valuenow',pct.toFixed(1));
  const sig=JSON.stringify(state.members.map(m=>[m.id,m.hp,m.ready,m.left]));if(sig!==hudSignature){hudSignature=sig;$('partyHud').innerHTML=state.members.map(healthMarkup).join('');}
  updateMechanic();
  // Apply the stage's layout before V3 projects its floor and click targets.
  window.NoxBattle.update(state,events);
  const last=events.filter(e=>e.type==='NOX_DEATH'||e.type==='NOX_COOP').at(-1);if(last)$('combatMessage').textContent=last.label;
  if(state.status!=='ACTIVE'&&!ended){
    ended=true;stopLoops();input?.destroy();input=null;audio.stop();window.NoxBattle.finish(state);
    $('resultTitle').textContent=state.status==='CLEAR'?'종언의 지휘를 끊었다':'공략 실패';
    $('resultReason').textContent=state.failure?.reason||'적관의 지휘자 녹스를 쓰러뜨렸습니다.';
    $('resultDetail').textContent=`${difficultyLabel(state.difficulty)} · ${state.round}/3회차 · ${state.members.filter(m=>m.hp>0).length}/${state.size}명 생존`;
    const payout=state.reward,paid=payout?.status==='PAID',reward=$('resultReward');
    reward.textContent=paid?`코인 ${formatAmount(payout.coins)} · 마스터의 별 ${formatAmount(payout.masterStars)} 개 지급 · 주간 ${payout.weekly.used}/${payout.weekly.limit}회`:
      payout?.status==='LIMIT'?`이번 주 보상 ${payout.weekly.limit}회를 모두 수령했습니다.`:state.status==='CLEAR'&&state.release.mode==='TEST'?'TEST 클리어 · 보상 없음':'';
    reward.hidden=!reward.textContent;
    if(paid)window.parent.dispatchEvent(new Event('cnine:account-mutation'));
    $('resultDialog').showModal();
  }
}
function layoutChart(){
  const chart=$('chart');
  if(!chart)return;
  noteHeight=parseFloat(getComputedStyle(chart).getPropertyValue('--note-height'))||56;
  hitY=noxHitY(chart.clientHeight,noteHeight,chartTravelMs());
  chart.style.setProperty('--hit-y',hitY+'px');
}
function loadScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[data-nox-src="${src}"]`);if(existing?.dataset.loaded)return resolve();const script=existing||document.createElement('script');script.dataset.noxSrc=src;script.src=src;script.onload=()=>{script.dataset.loaded='1';resolve();};script.onerror=()=>{script.remove();reject(new Error('전투 리소스를 불러오지 못했습니다. 다시 준비해 주세요.'));};if(!existing)document.head.append(script);});}
async function mountBattle(){
  if(mounted)return;if(mountPromise)return mountPromise;const version=epoch;
  mountPromise=(async()=>{
    if(!payload){const result=await api('state?payload=1');payload=result.payload;render(result);}
    await loadScript('/raid/nox/battle.bundle.js?astraLifecycle=20261120-v1&nox=20261119-input4&ryujin=20261119-v3-approach');await loadScript('/js/battle-v3-live.js');if(version!==epoch)return;
    screen(true);await window.NoxBattle.mount(payload);if(version!==epoch){window.NoxBattle.teardown();return;}
    layer=$('mechanicTemplate').content.firstElementChild.cloneNode(true);$('battleMount').querySelector('.battle-v3-canvas-host').append(layer);mounted=true;
    chartObserver=new ResizeObserver(layoutChart);chartObserver.observe($('chart'));
    const canInput=()=>state?.status==='ACTIVE'&&state.me.hp>0&&!document.hidden&&!$('guideDialog').open&&!$('resultDialog').open;
    input=new NoxInput(layer,press,{active:()=>canInput()&&state.stage!=='MEMORY',onHeld:(lane,held)=>layer?.querySelectorAll(`[data-nox-lane="${lane}"]`).forEach(b=>b.classList.toggle('is-held',held))});
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
function updateMechanic(){
  if(!layer||!state?.challenge)return;const c=state.challenge;
  if(c.id!==stageId){stageId=c.id;for(const p of posts.values())p.controller.abort();posts.clear();retryAt=0;retryDelay=250;layer.dataset.stage=c.stage;$('combat').dataset.stage=c.stage;outbox=[];sentPackets.clear();localHits=new Set(state.me.hits||[]);nodes.forEach(n=>n.remove());nodes.clear();input?.reset();clearHitEffects();combo=0;$('judgement').textContent='READY';$('timingDetail').textContent='노트 중앙을 밝은 선에 맞추세요';$('rhythmCombo').textContent='';$('combatMessage').textContent='';
    $('rhythm').hidden=c.stage!=='RHYTHM';$('memory').hidden=c.stage!=='MEMORY';$('coop').hidden=c.stage!=='COOP';
    $('mechanicName').textContent=({RHYTHM:'종언의 악보',MEMORY:'잔향의 발판',COOP:'삼중 공명',EXPOSED:'왕관 붕괴'})[c.stage];
    $('mechanicHint').textContent=({RHYTHM:'D · F · J · K  /  정확도 90% · MISS 3 이하',MEMORY:`안전 발판 ${memorySteps(c)}개의 순서를 기억하세요`,COOP:'각자 맡은 주파수를 같은 박자에 맞추세요',EXPOSED:'PVE 덱 집중 공격 · 다음 악보에 대비하세요'})[c.stage];
    if(c.stage==='MEMORY')$('floorTargets').innerHTML=c.tiles.map(tile=>`<button type="button" class="nox-floor-target" data-nox-tile="${tile.id}" aria-label="${tile.id+1}번 위치 ${tile.kind==='mine'?'지뢰지대':'안전지대'}"><span></span></button>`).join('');
    if(c.stage==='RHYTHM'){$('rhythmTrack').textContent=(noxTrack(c.trackId).name||'경매 BGM')+' · '+c.chart.length+' NOTES';layoutChart();}
    else audio.stop();
  }
  for(const id of state.me.hits||[])localHits.add(id);
  $('spectator').hidden=state.me.hp>0||c.stage==='MEMORY';
  if(c.stage==='RHYTHM'&&state.status==='ACTIVE'){
    audio.schedule(noxTrack(c.trackId).source,c.musicStartAt,serverNow());$('audioResume').hidden=audio.context?.state==='running'&&!!audio.source;
    const age=noxRhythmTime(audio.timeAt()??serverNow()-c.musicStartAt,calibration),passed=c.chart.filter(n=>n.at<=age-NOX_RHYTHM_RULES.goodMs).length;$('rhythmScore').textContent=`정확도 ${Math.min(100,Math.round(state.me.score/Math.max(1,passed)*100))}% · ${state.me.hits.length}/${c.chart.length}`;
  }
  if(c.stage==='MEMORY'){
    const steps=memorySteps(c),showing=serverNow()<c.revealEnd,dead=state.me.hp<=0,complete=state.me.memoryIndex===steps;
    $('memoryCue').textContent=dead?'전투 불능':complete?'안전지대 도착':showing?'안전 경로 기억':'바닥을 누르세요';
    $('memoryCue').parentElement.dataset.state=dead?'dead':complete?'complete':'active';
    layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=showing||dead||complete;b.dataset.kind=c.tiles[Number(b.dataset.noxTile)].kind;});
    $('memoryProgress').textContent=dead?`${state.me.deathReason||'공략 실패'} · 관전 중`:complete?`${steps}개 발판 통과 · 다음 기믹 대기`:showing?`안전 발판 ${steps}개 · 지뢰 ${c.tiles.length-steps}개`:`${state.me.memoryIndex}/${steps} · 순서 오류·미입력 시 즉사`;
  }
  if(c.stage==='COOP'){
    $('coopRole').textContent=`내 주파수: ${roles[state.me.role]} · ${keys[state.me.role]}`;
    layer.querySelectorAll('.nox-frequency-buttons button').forEach((b,i)=>b.disabled=i!==state.me.role||state.me.cooperated||state.me.hp<=0);$('coopStatus').textContent=`공명 ${state.members.filter(m=>m.cooperated&&m.hp>0).length}/${state.members.filter(m=>m.hp>0).length} · ±225ms`;
  }
  if(!frame&&state.status==='ACTIVE')frame=requestAnimationFrame(paint);
}
function paint(now){
  frame=0;if(!state||state.status!=='ACTIVE'||!mounted||document.hidden)return;
  if(lastPaint){const dt=now-lastPaint;if(frameTimes.length<2400)frameTimes.push(dt);frameSummary.count++;frameSummary.total+=dt;frameSummary.max=Math.max(frameSummary.max,dt);if(dt>50)frameSummary.over50++;}lastPaint=now;
  const c=state.challenge,t=serverNow();clockText('enrageClock',fmt(state.endsAt-t));clockText('mechanicClock',t<c.startsAt?`시작까지 ${Math.ceil((c.startsAt-t)/1000)}`:c.stage==='EXPOSED'?fmt(c.deadline-t):c.stage==='MEMORY'?`${Math.max(0,(c.deadline-t)/1000).toFixed(1)}초`:c.stage==='COOP'?`${Math.max(0,(c.targetAt-t)/1000).toFixed(2)}초`:'');
  if(c.stage==='RHYTHM'){
    clockText('rhythmClock',t<c.startsAt?$('mechanicClock').textContent:fmt(noxTrack(c.trackId).chartEndMs-(audio.timeAt()??t-c.musicStartAt)));
    // RAF's shared timestamp can precede expensive V3 callbacks. Sample when
    // actually drawing, using the same clock/calibration as the input event.
    const age=noxRhythmTime(audio.timeAt()??t-c.musicStartAt,calibration),travelMs=chartTravelMs(),visible=new Set();
    for(let i=noxNoteStart(c.chart,age-NOX_RHYTHM_RULES.goodMs);i<c.chart.length;i++){const n=c.chart[i];if(n.at>age+travelMs)break;if(localHits.has(n.id))continue;visible.add(n.id);let el=nodes.get(n.id);if(!el){el=document.createElement('div');el.className='nox-note';el.dataset.noteId=n.id;el.dataset.tone=n.lane===1||n.lane===2?'ivory':'ruby';el.style.setProperty('--lane',n.lane);$('notes').append(el);nodes.set(n.id,el);}el.style.transform=`translateY(${noxNoteY(n.at,age,hitY,noteHeight,travelMs)}px)`;}
    for(const [id,el]of nodes)if(!visible.has(id)){el.remove();nodes.delete(id);}
  }else if(c.stage==='MEMORY'){
    const cue=c.cues?.find(cue=>t>=cue.from&&t<cue.to);const cueId=cue?.tile??null;if(c.cue!==cueId){c.cue=cueId;c.cueStep=cue?.step??null;window.NoxBattle.memoryCue(state);}const blocked=t<c.revealEnd||state.me.hp<=0||state.me.memoryIndex>=memorySteps(c);layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=blocked;});window.NoxBattle.placeFloorTargets($('floorTargets'));
  }else if(c.stage==='COOP'){
    const ratio=Math.min(1,Math.max(0,(t-(c.targetAt-1800))/3600));$('syncNeedle').style.left=`${ratio*100}%`;
  }
  frame=requestAnimationFrame(paint);
}
function press(lane,perfTime){
  if(!state?.challenge||state.me.hp<=0)return;const c=state.challenge;
  if(!['RHYTHM','MEMORY','COOP'].includes(c.stage)||lane>(c.stage==='RHYTHM'?3:c.stage==='MEMORY'?c.tiles.length-1:2))return;
  const audioTime=c.stage==='RHYTHM'?audio.timeAt(perfTime):null;
  if(c.stage==='RHYTHM'&&(audio.context?.state!=='running'||audioTime===null)){toast('소리 재개를 눌러 음원을 연결하세요.');return;}
  const at=audioTime===null?perfTime+offset:c.musicStartAt+noxRhythmTime(audioTime,calibration);
  if(at<c.startsAt||c.stage==='MEMORY'&&(at<c.revealEnd||state.me.memoryIndex>=memorySteps(c))||c.stage==='COOP'&&state.me.cooperated)return;
  let noteId;
  if(c.stage==='RHYTHM'){const judged=nearestNoxNote(c.chart,localHits,lane,at-c.musicStartAt);showHit(lane,judged,at-c.musicStartAt);if(judged){noteId=judged.note.id;localHits.add(noteId);nodes.get(noteId)?.remove();nodes.delete(noteId);}}
  outbox.push({lane,at,seq:++seq,noteId});scheduleFlush();
}
function scheduleFlush(){if(flushTimer||posts.size>=8||!outbox.length||state?.status!=='ACTIVE'||document.hidden)return;flushTimer=setTimeout(()=>{flushTimer=0;void flush();},Math.max(35,retryAt-performance.now()));}
async function flush(){
  if(posts.size>=8||!outbox.length||state?.status!=='ACTIVE')return;
  // Do not make subsequent keys wait for a slow acknowledgement. Overlapping
  // packets carry unacknowledged keys; the server applies each sequence once.
  const version=epoch,batch=outbox.slice(0,24),end=batch.at(-1).seq,packet=sentPackets.get(end)||{seq:end,challengeId:state.challenge.id,inputs:batch.map(({lane,at})=>({lane,at})),stream:true},key=version+':'+packet.seq;
  if(posts.has(key))return;const controller=new AbortController();sentPackets.set(end,packet);posts.set(key,{packet,controller});
  try{let result;for(let attempt=0;attempt<2;attempt++){try{result=await api('action?since='+eventSeq,packet,{controller});break;}catch(error){if(controller.signal.aborted||error.status&&error.status<500||attempt===1)throw error;}}if(version===epoch){retryAt=0;retryDelay=250;render(result);}}
  catch(error){if(version===epoch&&packet.challengeId===state?.challenge?.id){
    if(error.status&&error.status<500&&packet.challengeId===state?.challenge?.id){outbox=outbox.filter(p=>p.seq>packet.seq);for(const end of sentPackets.keys())if(end<=packet.seq)sentPackets.delete(end);localHits=new Set([...(state.me.hits||[]),...outbox.map(p=>p.noteId).filter(id=>id!==undefined)]);}
    else{retryAt=performance.now()+retryDelay;retryDelay=Math.min(2000,retryDelay*2);}
    if(error.name!=='AbortError')toast(error.message);void sync();
  }}
  finally{posts.delete(key);if(version===epoch)scheduleFlush();}
}
function stopLoops(){clearTimeout(pollTimer);clearTimeout(flushTimer);cancelAnimationFrame(frame);pollTimer=flushTimer=frame=0;lastPaint=0;clearHitEffects();}
function schedulePoll(){clearTimeout(pollTimer);if(!token||ended||document.hidden)return;pollTimer=setTimeout(()=>void sync(),state?.status==='ACTIVE'?200:1500);}
async function sync(){if(!token||polling)return;polling=true;const version=epoch;try{const result=await api('state?since='+eventSeq+(!payload?'&payload=1':''));if(version===epoch){render(result);if(state?.status!=='LOBBY'&&!mounted)await mountBattle();}}catch(error){if(version===epoch&&error.name!=='AbortError'){toast(error.message);if(error.status===401||error.status===403||error.status===404||error.status===423)await leave(false);}}finally{polling=false;if(version===epoch)schedulePoll();}}
async function leave(notify=true){
  const oldToken=token;epoch++;stopLoops();requests.forEach(c=>c.abort());requests.clear();posts.clear();sentPackets.clear();retryAt=0;retryDelay=250;input?.destroy();input=null;floorAbort?.abort();chartObserver?.disconnect();await audio.suspend();window.NoxBattle?.teardown();mounted=false;mountPromise=null;layer?.remove();layer=null;nodes.clear();outbox=[];stageId='';token='';sessionStorage.removeItem('noxLiveRoom');state=null;payload=null;eventSeq=0;seq=0;ended=false;preparing=false;hudSignature='';bestRtt=Infinity;frameTimes=[];frameSummary={count:0,total:0,max:0,over50:0};screen(false);$('createForm').hidden=false;$('assembly').hidden=true;$('createButton').disabled=false;$('audioResume').hidden=true;
  if(notify&&oldToken)try{await api('leave',{roomId:oldToken},{keepalive:true});}catch(error){toast(error.message);}
}
async function establish(action,body){
  if(establishing)return;
  establishing=true;
  $('createButton').disabled=$('joinButton').disabled=true;
  try{
    await leave();
    $('createButton').disabled=true;
    const result=await api(action,body);
    token=result.roomId;sessionStorage.setItem('noxLiveRoom',token);render(result);schedulePoll();
  }catch(error){
    toast(error.message);
    if(error.code==='NOX_CREATE_FEE_CONSENT')void loadLobbyFeature().catch(()=>{});
  }finally{
    establishing=false;
    $('createButton').disabled=$('joinButton').disabled=false;
  }
}
$('createForm').addEventListener('submit',e=>{
  e.preventDefault();
  const form=new FormData(e.target);
  void establish('create',{size:Number(form.get('size')),difficulty:form.get('difficulty'),acceptedCreateCoins:lobbyFeature?.createCoins||'0'});
});
$('joinButton').onclick=()=>void establish('join',{roomId:$('joinCode').value.trim().toUpperCase()});
$('readyButton').onclick=()=>void prepare();$('startButton').onclick=async()=>{const b=$('startButton');b.disabled=true;try{await audio.unlock();render(await api('start',{}));schedulePoll();}catch(error){toast(error.message);b.disabled=false;}};
$('leaveButton').onclick=$('lobbyLeave').onclick=()=>void leave();
$('retryButton').onclick=async()=>{
  $('resultDialog').close();await leave();
  if(lobbyFeature?.mode==='ON')void loadLobbyFeature().catch(error=>toast(error.message));
};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(state.id);toast('공대 코드를 복사했습니다.');}catch{toast('공대 코드: '+state.id);}};
document.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{input?.reset();$('guideDialog').showModal();});$('closeGuide').onclick=()=>$('guideDialog').close();
$('calibration').value=calibration;$('calibrationValue').textContent=calibration+' ms';$('calibration').oninput=e=>{calibration=Number(e.target.value);$('calibrationValue').textContent=calibration+' ms';localStorage.setItem('noxTimingOffset',String(calibration));};
$('audioResume').onclick=async()=>{const version=epoch;try{await audio.unlock();await audio.prepareAll(trackUrls());if(version!==epoch)return;if(state?.challenge?.stage==='RHYTHM')audio.schedule(noxTrack(state.challenge.trackId).source,state.challenge.musicStartAt,serverNow());$('audioResume').hidden=true;}catch(error){if(error.name!=='AbortError')toast(error.message);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopLoops();input?.reset();audio.stop();window.NoxBattle?.visible(false);}else if(token){window.NoxBattle?.visible(true);lastPaint=0;void sync();}});
window.addEventListener('pagehide',()=>{stopLoops();requests.forEach(c=>c.abort());input?.destroy();floorAbort?.abort();chartObserver?.disconnect();void audio.destroy();window.NoxBattle?.teardown();});
window.addEventListener('resize',()=>window.NoxBattle?.resize());
function formatAmount(amount){
  const value=BigInt(amount),trillion=1000000000000n,hundredMillion=100000000n;
  if(value>=trillion&&value%trillion===0n)return value/trillion+'조';
  if(value>=hundredMillion&&value%hundredMillion===0n)return value/hundredMillion+'억';
  return value.toLocaleString('ko-KR');
}
function showFee(mode,coins){
  const official=mode==='ON',fee=official&&lobbyFeature?.createCoins;
  $('feeMode').textContent=official?'공식 레이드':mode==='TEST'?'TEST · 지정 참가자 무료':'입장 중지';
  $('feeDetail').textContent=official?`출전 시 1인 ${formatAmount(coins)} 코인 차감`:'TEST 클리어 보상 없음';
  $('createButton').textContent=fee?`공대 만들기 · ${formatAmount(fee)} 코인`:'공대 만들기';
  $('readyButton').textContent=official?`${formatAmount(coins)} 입장료 확인 · 준비`:'무료 전투 준비';
  const weekly=official&&lobbyFeature?.weeklyReward;
  $('weeklyReward').textContent=weekly?`노말·헬 합산 보상 ${weekly.used}/${weekly.limit}회 수령 · 월요일 00:00 초기화`:'';
  $('weeklyReward').hidden=!weekly;
  for(const [id,key] of [['normalReward','NORMAL'],['hellReward','HELL']]){
    const reward=official&&lobbyFeature?.rewards?.[key];
    $(id).textContent=reward?`코인 ${formatAmount(reward.coins)} · 마스터의 별 ${formatAmount(reward.masterStars)} 개`:'';
    $(id).hidden=!reward;
  }
}
async function loadLobbyFeature(){
  lobbyFeature=await api('feature?weekly=1');
  showFee(lobbyFeature.mode,lobbyFeature.entryCoins);
  return lobbyFeature;
}
$('exitRaid').onclick=async e=>{e.preventDefault();await leave();if(window.parent!==window)window.parent.postMessage({type:'nox-exit'},location.origin);else location.href='/';};
async function boot(){
  $('createButton').disabled=$('joinButton').disabled=true;
  try{const feature=await loadLobbyFeature();if(!feature.accessible)throw new Error(feature.mode==='OFF'?'현재 입장 중지 상태입니다.':'지정된 테스트 참가자만 입장할 수 있습니다.');
    const result=await api('deck');$('deckList').innerHTML=result.cards.map(c=>`<figure><img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy"><figcaption>${esc(c.title)}</figcaption></figure>`).join('');$('deckNotice').textContent='저장된 PVE 덱으로 출전합니다. · '+result.account.name;token=result.roomId||'';if(token){sessionStorage.setItem('noxLiveRoom',token);await sync();}else sessionStorage.removeItem('noxLiveRoom');$('createButton').disabled=$('joinButton').disabled=false;
  }catch(error){$('deckNotice').textContent=error.message;$('feeDetail').textContent=error.message;token='';}
}
window.NoxRaid={sync,leave,diagnostics:()=>({state,mounted,pendingInputs:outbox.length,inputRequests:posts.size,inputPackets:sentPackets.size,inflight:requests.size,poll:!!pollTimer,raf:!!frame,held:input?.held.size||0,audio:audio.context?.state,playing:!!audio.source,trackUrl:audio.trackUrl,hitVoices:audio.hitVoices.size,hitAnimations:[...hitAnimations.values()].flat().filter(a=>a.playState==='running').length,preparedTracks:audio.buffers.size,audioBufferBytes:[...audio.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),audioPositionMs:audio.timeAt(),serverNowEstimate:serverNow(),notes:nodes.size,frameTimes:[...frameTimes],frameSummary:{...frameSummary},battle:window.NoxBattle?.diagnostics()})};
void boot();
