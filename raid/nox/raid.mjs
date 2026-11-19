import {NoxInput,NoxAudio,nearestNoxNote,noxRhythmTime,noxNoteY,noxHitY,eventTime} from '/js/nox-input-v1.mjs?v=20261119-rhythm2';
import {NOX_TRACK,NOX_RHYTHM_RULES,noxTrack} from '/shared/nox-raid-chart-v1.mjs?v=20261119-rhythm2';
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roles=['저음','중음','고음'],keys=['D','F','J','K'];
let token=sessionStorage.getItem('noxLiveRoom')||'',state=null,payload=null,epoch=0,eventSeq=0,pollTimer=0,flushTimer=0,frame=0,toastTimer=0,input=null,layer=null,mounted=false,mountPromise=null,preparing=false,posting=false,seq=0,offset=Date.now()-performance.now(),bestRtt=Infinity,stageId='',localHits=new Set(),outbox=[],nodes=new Map(),hudSignature='',ended=false,requests=new Set(),polling=false,lastPaint=0,frameTimes=[];
let calibration=Math.max(-150,Math.min(150,Number(localStorage.getItem('noxTimingOffset'))||0));
const audio=new NoxAudio(),serverNow=()=>performance.now()+offset;
let chartObserver=null,hitY=1,noteHeight=56,combo=0,floorAbort=null;
const trackUrls=()=>state?.playlist?.length?state.playlist.map(id=>noxTrack(id).source):[NOX_TRACK.source];
const hitAnimations=new Map();
function clearHitEffects(){for(const list of hitAnimations.values())for(const animation of list)animation.cancel();hitAnimations.clear();}
function showHit(lane,judged,at){
  const grade=judged?.grade||'EMPTY';$('judgement').textContent=grade;$('judgement').dataset.grade=grade;
  const delta=judged?at-judged.note.at:0;$('timingDetail').textContent=judged?(Math.abs(delta)<12?'정확한 타이밍':`${delta<0?'빠름':'늦음'} ${Math.round(Math.abs(delta))}ms`):'노트가 없는 입력';
  combo=judged?combo+1:0;$('rhythmCombo').textContent=combo?combo+' COMBO':'';
  const effect=layer.querySelector(`[data-hit-lane="${lane}"]`),column=layer.querySelectorAll('.nox-chart-columns i')[lane];
  for(const animation of hitAnimations.get(lane)||[])animation.cancel();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,options={duration:reduced?160:300,easing:'cubic-bezier(.16,1,.3,1)'};
  effect.dataset.grade=grade;
  const animations=[effect.animate([{opacity:judged?1:.18,transform:'scale(.72)'},{opacity:0,transform:`scale(${reduced?1:1.7})`}],options),column.animate([{backgroundColor:judged?'#ffd99d26':'#ec283d33'},{backgroundColor:'transparent'}],{duration:180})];
  hitAnimations.set(lane,animations);
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
async function api(route,body,{keepalive=false}={}){
  const controller=new AbortController(),started=performance.now(),auth=playerToken();requests.add(controller);const timeout=setTimeout(()=>controller.abort(),7000);
  const kind=route.split('?')[0];let endpoint='/api/raid/nox/'+route;
  if(body===undefined&&token)endpoint+=(endpoint.includes('?')?'&':'?')+'roomId='+encodeURIComponent(token);
  if(body!==undefined){body={...body,...(token?{roomId:token}:{})};if(kind!=='action')body={requestId:crypto.randomUUID(),clientVersion:2,...body};if(kind==='ready'&&body.ready)body.acceptedCoins=state?.entryCoins||'0';}
  try{
    let result;
    for(let attempt=0;attempt<2;attempt++){
      const response=await fetch(endpoint,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',authorization:'Bearer '+auth},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal,keepalive});
      result=await response.json();if(!response.ok){if(response.status>=500&&body&&kind!=='action'&&!attempt)continue;throw Object.assign(new Error(result.error||'요청에 실패했습니다.'),{status:response.status,code:result.code});}break;
    }
    if(auth!==playerToken())throw Object.assign(new Error('로그인 정보가 바뀌었습니다. 다시 입장하세요.'),{status:401});
    const received=performance.now(),rtt=received-started,clock=result.serverNow??result.state?.responseNow??result.state?.serverNow,networkRtt=Math.max(0,rtt-(clock-(result.serverReceivedAt??clock)));
    if(Number.isFinite(clock)&&networkRtt<bestRtt+10){bestRtt=Math.min(bestRtt,networkRtt);offset=((result.serverReceivedAt??clock)-started+clock-received)/2;}
    if(kind==='start')window.parent.dispatchEvent(new Event('cnine:account-mutation'));
    return result;
  }finally{clearTimeout(timeout);requests.delete(controller);}
}
function screen(combat){$('lobby').hidden=combat;$('combat').hidden=!combat;document.body.classList.toggle('in-combat',combat);}
function healthMarkup(m){return `<article class="nox-member${m.id===state.me.id?' is-me':''}${m.hp<=0?' is-dead':''}" data-member="${esc(m.id)}"><div><strong>${esc(m.name)}</strong><span>${m.hp>0?roles[m.role]:'전투 불능'}</span></div><div class="nox-gauge" style="--hp:${Math.max(0,m.hp/Math.max(1,m.maxHp))}" role="progressbar" aria-label="${esc(m.name)} HP" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(100*m.hp/Math.max(1,m.maxHp))}"><div class="nox-gauge-trail"></div><div class="nox-gauge-fill"></div></div></article>`;}
function render(result){
  if(!result?.state)return;const next=result.state;if(state&&state.id===next.id&&next.serverNow<state.serverNow)return;
  const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;seq=Math.max(seq,next.me.lastSequence);if(result.payload)payload=result.payload;
  if(state.status==='LOBBY'){
    screen(false);$('createForm').hidden=true;$('assembly').hidden=false;$('roomCode').textContent=state.id;showFee(state.release.mode,state.entryCoins);
    $('memberList').innerHTML=state.members.map(m=>`<li>${esc(m.name)}<span>${roles[m.role]} · ${m.ready?'준비 완료':'준비 중'}${m.bot?' · 연습 동료':''}</span></li>`).join('');
    $('startButton').hidden=!state.me.isHost||!state.me.ready||!mounted;$('startButton').disabled=state.members.length!==state.size||state.members.some(m=>!m.ready);$('readyButton').hidden=state.me.ready&&mounted;$('readyButton').disabled=preparing;
    $('prepareStatus').textContent=preparing?'음원과 전장을 준비하고 있습니다…':state.me.ready?`준비 ${state.members.filter(m=>m.ready).length}/${state.size} · 전원 준비 후 출전`:(state.entryCoins==='0'?'무료 TEST · 음원과 전장을 준비하세요.':'출전 시 1인 50조 차감 · 전투 준비로 동의합니다.');return;
  }
  screen(true);if(!mounted){void mountBattle().catch(error=>toast(error.message));return;}
  window.NoxBattle.update(state,events);
  $('roundLabel').textContent=`${state.size}인 · ${state.round}/3회차`;const pct=Math.max(0,state.bossHp/state.bossMaxHp*100);$('bossPercent').textContent=pct.toFixed(1)+'%';$('bossGauge').style.setProperty('--hp',pct/100);$('bossGauge').setAttribute('aria-valuenow',pct.toFixed(1));
  const sig=JSON.stringify(state.members.map(m=>[m.id,m.hp,m.ready,m.left]));if(sig!==hudSignature){hudSignature=sig;$('partyHud').innerHTML=state.members.map(healthMarkup).join('');}
  updateMechanic();
  const last=events.filter(e=>e.type==='NOX_DEATH'||e.type==='NOX_COOP').at(-1);if(last)$('combatMessage').textContent=last.label;
  if(state.status!=='ACTIVE'&&!ended){ended=true;stopLoops();input?.destroy();input=null;audio.stop();window.NoxBattle.finish(state);$('resultTitle').textContent=state.status==='CLEAR'?'종언의 지휘를 끊었다':'공략 실패';$('resultReason').textContent=state.failure?.reason||'적관의 지휘자 녹스를 쓰러뜨렸습니다.';$('resultDetail').textContent=`${state.round}/3회차 · ${state.members.filter(m=>m.hp>0).length}/${state.size}명 생존`;$('resultDialog').showModal();}
}
function loadScript(src){return new Promise((resolve,reject)=>{const existing=document.querySelector(`script[data-nox-src="${src}"]`);if(existing?.dataset.loaded)return resolve();const script=existing||document.createElement('script');script.dataset.noxSrc=src;script.src=src;script.onload=()=>{script.dataset.loaded='1';resolve();};script.onerror=()=>{script.remove();reject(new Error('전투 리소스를 불러오지 못했습니다. 다시 준비해 주세요.'));};if(!existing)document.head.append(script);});}
async function mountBattle(){
  if(mounted)return;if(mountPromise)return mountPromise;const version=epoch;
  mountPromise=(async()=>{
    if(!payload){const result=await api('state?payload=1');payload=result.payload;render(result);}
    await loadScript('/raid/nox/battle.bundle.js?nox=20261119-rhythm2&ryujin=20261119-v3-approach');await loadScript('/js/battle-v3-live.js');if(version!==epoch)return;
    screen(true);await window.NoxBattle.mount(payload);if(version!==epoch){window.NoxBattle.teardown();return;}
    layer=$('mechanicTemplate').content.firstElementChild.cloneNode(true);$('battleMount').querySelector('.battle-v3-canvas-host').append(layer);mounted=true;
    chartObserver=new ResizeObserver(()=>{noteHeight=parseFloat(getComputedStyle($('chart')).getPropertyValue('--note-height'))||56;hitY=noxHitY($('chart').clientHeight,noteHeight);$('chart').style.setProperty('--hit-y',hitY+'px');});chartObserver.observe($('chart'));
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
  if(c.id!==stageId){stageId=c.id;layer.dataset.stage=c.stage;$('combat').dataset.stage=c.stage;outbox=[];localHits=new Set(state.me.hits||[]);nodes.forEach(n=>n.remove());nodes.clear();input?.reset();clearHitEffects();combo=0;$('judgement').textContent='READY';$('timingDetail').textContent='노트 중앙을 밝은 선에 맞추세요';$('rhythmCombo').textContent='';$('combatMessage').textContent='';
    $('rhythm').hidden=c.stage!=='RHYTHM';$('memory').hidden=c.stage!=='MEMORY';$('coop').hidden=c.stage!=='COOP';
    $('mechanicName').textContent=({RHYTHM:'종언의 악보',MEMORY:'잔향의 발판',COOP:'삼중 공명',EXPOSED:'왕관 붕괴'})[c.stage];
    $('mechanicHint').textContent=({RHYTHM:'D · F · J · K  /  정확도 90% · MISS 3 이하',MEMORY:'바닥의 1 → 2 → 3 위치 기억 · 지뢰를 피하세요',COOP:'각자 맡은 주파수를 같은 박자에 맞추세요',EXPOSED:'PVE 덱 집중 공격 · 다음 악보에 대비하세요'})[c.stage];
    if(c.stage==='MEMORY')$('floorTargets').innerHTML=c.tiles.map(tile=>`<button type="button" class="nox-floor-target" data-nox-tile="${tile.id}" aria-label="${tile.id+1}번 위치 ${tile.kind==='mine'?'지뢰지대':'안전지대'}"><span></span></button>`).join('');
    if(c.stage==='RHYTHM')$('rhythmTrack').textContent=(noxTrack(c.trackId).name||'경매 BGM')+' · '+c.chart.length+' NOTES';
    else audio.stop();
  }
  for(const id of state.me.hits||[])localHits.add(id);
  $('spectator').hidden=state.me.hp>0||c.stage==='MEMORY';
  if(c.stage==='RHYTHM'&&state.status==='ACTIVE'){
    audio.schedule(noxTrack(c.trackId).source,c.musicStartAt,serverNow());$('audioResume').hidden=audio.context?.state==='running'&&!!audio.source;
    const age=noxRhythmTime(audio.timeAt()??serverNow()-c.musicStartAt,calibration),passed=c.chart.filter(n=>n.at<=age-NOX_RHYTHM_RULES.goodMs).length;$('rhythmScore').textContent=`정확도 ${Math.min(100,Math.round(state.me.score/Math.max(1,passed)*100))}% · ${state.me.hits.length}/${c.chart.length}`;
  }
  if(c.stage==='MEMORY'){
    const showing=serverNow()<c.revealEnd,dead=state.me.hp<=0,complete=state.me.memoryIndex===3;
    $('memoryCue').textContent=dead?'전투 불능':complete?'안전지대 도착':showing?'안전 경로 기억':'바닥을 누르세요';
    $('memoryCue').parentElement.dataset.state=dead?'dead':complete?'complete':'active';
    layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=showing||dead||complete;b.dataset.kind=c.tiles[Number(b.dataset.noxTile)].kind;});
    $('memoryProgress').textContent=dead?`${state.me.deathReason||'공략 실패'} · 관전 중`:complete?'1 → 2 → 3 성공 · 다음 기믹 대기':showing?'정답 3개 · 지뢰 27개 · 순서를 기억하세요':`${state.me.memoryIndex}/3 · 순서 오류·미입력 시 즉사`;
  }
  if(c.stage==='COOP'){
    $('coopRole').textContent=`내 주파수: ${roles[state.me.role]} · ${keys[state.me.role]}`;
    layer.querySelectorAll('.nox-frequency-buttons button').forEach((b,i)=>b.disabled=i!==state.me.role||state.me.cooperated||state.me.hp<=0);$('coopStatus').textContent=`공명 ${state.members.filter(m=>m.cooperated&&m.hp>0).length}/${state.members.filter(m=>m.hp>0).length} · ±225ms`;
  }
  if(!frame&&state.status==='ACTIVE')frame=requestAnimationFrame(paint);
}
function paint(now){
  frame=0;if(!state||state.status!=='ACTIVE'||!mounted||document.hidden)return;
  if(lastPaint&&frameTimes.length<2400)frameTimes.push(now-lastPaint);lastPaint=now;
  const c=state.challenge,t=serverNow();$('enrageClock').textContent=fmt(state.endsAt-t);$('mechanicClock').textContent=t<c.startsAt?`시작까지 ${Math.ceil((c.startsAt-t)/1000)}`:c.stage==='EXPOSED'?fmt(c.deadline-t):c.stage==='MEMORY'?`${Math.max(0,(c.deadline-t)/1000).toFixed(1)}초`:c.stage==='COOP'?`${Math.max(0,(c.targetAt-t)/1000).toFixed(2)}초`:'';
  if(c.stage==='RHYTHM'){
    $('rhythmClock').textContent=$('mechanicClock').textContent;
    // RAF's shared timestamp can precede expensive V3 callbacks. Sample when
    // actually drawing, using the same clock/calibration as the input event.
    const age=noxRhythmTime(audio.timeAt()??t-c.musicStartAt,calibration),visible=new Set();
    for(const n of c.chart){const delta=n.at-age;if(delta>NOX_RHYTHM_RULES.travelMs||delta< -NOX_RHYTHM_RULES.goodMs||localHits.has(n.id))continue;visible.add(n.id);let el=nodes.get(n.id);if(!el){el=document.createElement('div');el.className='nox-note';el.dataset.noteId=n.id;el.dataset.tone=n.lane===1||n.lane===2?'ivory':'ruby';el.style.setProperty('--lane',n.lane);$('notes').append(el);nodes.set(n.id,el);}el.style.transform=`translateY(${noxNoteY(n.at,age,hitY,noteHeight)}px)`;}
    for(const [id,el]of nodes)if(!visible.has(id)){el.remove();nodes.delete(id);}
  }else if(c.stage==='MEMORY'){
    const cue=c.cues?.find(cue=>t>=cue.from&&t<cue.to);const cueId=cue?.tile??null;if(c.cue!==cueId){c.cue=cueId;c.cueStep=cue?.step??null;window.NoxBattle.memoryCue(state);}const showing=t<c.revealEnd;layer.querySelectorAll('.nox-floor-target').forEach(b=>{b.disabled=showing||state.me.hp<=0||state.me.memoryIndex>=3;});window.NoxBattle.placeFloorTargets($('floorTargets'));
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
  if(at<c.startsAt||c.stage==='MEMORY'&&(at<c.revealEnd||state.me.memoryIndex>=3)||c.stage==='COOP'&&state.me.cooperated)return;
  if(c.stage==='RHYTHM'){const judged=nearestNoxNote(c.chart,localHits,lane,at-c.musicStartAt);showHit(lane,judged,at-c.musicStartAt);if(judged){localHits.add(judged.note.id);nodes.get(judged.note.id)?.remove();nodes.delete(judged.note.id);}}
  outbox.push({lane,at});scheduleFlush();
}
function scheduleFlush(){if(flushTimer||posting||!outbox.length)return;flushTimer=setTimeout(()=>{flushTimer=0;void flush();},35);}
async function flush(){
  if(posting||!outbox.length||state?.status!=='ACTIVE')return;posting=true;const version=epoch,packet={seq:++seq,challengeId:state.challenge.id,inputs:outbox.splice(0,24)};
  try{let result;for(let attempt=0;attempt<2;attempt++){try{result=await api('action?since='+eventSeq,packet);break;}catch(error){if(error.status&&error.status<500||attempt===1)throw error;}}if(version===epoch)render(result);}
  catch(error){if(version===epoch&&error.name!=='AbortError'){toast(error.message);void sync();}}
  finally{posting=false;if(version===epoch)scheduleFlush();}
}
function stopLoops(){clearTimeout(pollTimer);clearTimeout(flushTimer);cancelAnimationFrame(frame);pollTimer=flushTimer=frame=0;lastPaint=0;clearHitEffects();}
function schedulePoll(){clearTimeout(pollTimer);if(!token||ended||document.hidden)return;pollTimer=setTimeout(()=>void sync(),state?.status==='ACTIVE'?200:1500);}
async function sync(){if(!token||polling)return;polling=true;const version=epoch;try{const result=await api('state?since='+eventSeq+(!payload?'&payload=1':''));if(version===epoch){render(result);if(state?.status!=='LOBBY'&&!mounted)await mountBattle();}}catch(error){if(version===epoch&&error.name!=='AbortError'){toast(error.message);if(error.status===401||error.status===403||error.status===404||error.status===423)await leave(false);}}finally{polling=false;if(version===epoch)schedulePoll();}}
async function leave(notify=true){
  const oldToken=token;epoch++;stopLoops();requests.forEach(c=>c.abort());requests.clear();input?.destroy();input=null;floorAbort?.abort();chartObserver?.disconnect();await audio.suspend();window.NoxBattle?.teardown();mounted=false;mountPromise=null;layer?.remove();layer=null;nodes.clear();outbox=[];stageId='';token='';sessionStorage.removeItem('noxLiveRoom');state=null;payload=null;eventSeq=0;seq=0;ended=false;preparing=false;hudSignature='';bestRtt=Infinity;screen(false);$('createForm').hidden=false;$('assembly').hidden=true;$('createButton').disabled=false;$('audioResume').hidden=true;
  if(notify&&oldToken)try{await api('leave',{roomId:oldToken},{keepalive:true});}catch(error){toast(error.message);}
}
async function establish(action,body){$('createButton').disabled=true;$('joinButton').disabled=true;try{await leave();const result=await api(action,body);token=result.roomId;sessionStorage.setItem('noxLiveRoom',token);render(result);schedulePoll();}catch(error){toast(error.message);}finally{$('createButton').disabled=false;$('joinButton').disabled=false;}}
$('createForm').addEventListener('submit',e=>{e.preventDefault();void establish('create',{size:Number(new FormData(e.target).get('size'))});});
$('joinButton').onclick=()=>void establish('join',{roomId:$('joinCode').value.trim().toUpperCase()});
$('readyButton').onclick=()=>void prepare();$('startButton').onclick=async()=>{const b=$('startButton');b.disabled=true;try{await audio.unlock();render(await api('start',{}));schedulePoll();}catch(error){toast(error.message);b.disabled=false;}};
$('leaveButton').onclick=$('lobbyLeave').onclick=()=>void leave();$('retryButton').onclick=()=>{$('resultDialog').close();void leave();};
$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(state.id);toast('공대 코드를 복사했습니다.');}catch{toast('공대 코드: '+state.id);}};
document.querySelectorAll('[data-guide]').forEach(b=>b.onclick=()=>{input?.reset();$('guideDialog').showModal();});$('closeGuide').onclick=()=>$('guideDialog').close();
$('calibration').value=calibration;$('calibrationValue').textContent=calibration+' ms';$('calibration').oninput=e=>{calibration=Number(e.target.value);$('calibrationValue').textContent=calibration+' ms';localStorage.setItem('noxTimingOffset',String(calibration));};
$('audioResume').onclick=async()=>{const version=epoch;try{await audio.unlock();await audio.prepareAll(trackUrls());if(version!==epoch)return;if(state?.challenge?.stage==='RHYTHM')audio.schedule(noxTrack(state.challenge.trackId).source,state.challenge.musicStartAt,serverNow());$('audioResume').hidden=true;}catch(error){if(error.name!=='AbortError')toast(error.message);}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopLoops();input?.reset();audio.stop();window.NoxBattle?.visible(false);}else if(token){window.NoxBattle?.visible(true);lastPaint=0;void sync();}});
window.addEventListener('pagehide',()=>{stopLoops();requests.forEach(c=>c.abort());input?.destroy();floorAbort?.abort();chartObserver?.disconnect();void audio.destroy();window.NoxBattle?.teardown();});
window.addEventListener('resize',()=>window.NoxBattle?.resize());
function showFee(mode,coins){$('feeMode').textContent=mode==='TEST'?'TEST · 지정 참가자 무료':'ON · 전투 입장료 1인 50조';$('feeDetail').textContent=coins==='0'?'테스트 중 입장료 무료 · 보상 없음':'전원 출전 시 각 50조 코인 소모 · 대기실 입장/해산 무료 · 보상 미설정';$('readyButton').textContent=coins==='0'?'무료 전투 준비':'50조 입장료 확인 · 준비';}
$('exitRaid').onclick=async e=>{e.preventDefault();await leave();if(window.parent!==window)window.parent.postMessage({type:'nox-exit'},location.origin);else location.href='/';};
async function boot(){
  $('createButton').disabled=$('joinButton').disabled=true;
  try{const feature=await api('feature');showFee(feature.mode,feature.entryCoins);if(!feature.accessible)throw new Error(feature.mode==='OFF'?'현재 입장 중지 상태입니다.':'지정된 테스트 참가자만 입장할 수 있습니다.');
    const result=await api('deck');$('deckList').innerHTML=result.cards.map(c=>`<figure><img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy"><figcaption>${esc(c.title)}</figcaption></figure>`).join('');$('deckNotice').textContent='저장된 PVE 덱으로 출전합니다. · '+result.account.name;token=result.roomId||'';if(token){sessionStorage.setItem('noxLiveRoom',token);await sync();}else sessionStorage.removeItem('noxLiveRoom');$('createButton').disabled=$('joinButton').disabled=false;
  }catch(error){$('deckNotice').textContent=error.message;$('feeDetail').textContent=error.message;token='';}
}
window.NoxRaid={sync,leave,diagnostics:()=>({state,mounted,pendingInputs:outbox.length,inflight:requests.size,poll:!!pollTimer,raf:!!frame,held:input?.held.size||0,audio:audio.context?.state,playing:!!audio.source,trackUrl:audio.trackUrl,preparedTracks:audio.buffers.size,audioBufferBytes:[...audio.buffers.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),audioPositionMs:audio.timeAt(),serverNowEstimate:serverNow(),notes:nodes.size,frameTimes:[...frameTimes],battle:window.NoxBattle?.diagnostics()})};
void boot();
