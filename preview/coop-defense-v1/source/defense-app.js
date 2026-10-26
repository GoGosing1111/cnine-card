import { DefenseBattleEngine } from './DefenseBattleEngine.js';
import { DefenseWorkshop } from './DefenseWorkshop.js';
import { DefenseFormation } from './DefenseFormation.js';
import { DefenseRoomBrowser } from './DefenseRoomBrowser.js';
import {DEFENSE_PROFILES,DEFENSE_ROLE_NAMES,defenseSelection,emptyDefenseLoadout} from '../../../shared/monster-defense-loadout-v1.mjs';
import { MERCENARIES, CARDS, LANES, WORLD, RULES, laneY, defaultLoadout, validateLoadout } from './defense-model.mjs';
import {DEFENSE_DIFFICULTIES,DEFENSE_ENEMIES,defenseDifficulty,defenseEnemy} from '../../../shared/monster-defense-v1.mjs';
import {defenseRewardItemLabel,defenseRewardItemRule} from '../../../shared/monster-defense-rewards-v1.mjs';

const $ = id => document.getElementById(id);
const colors = ['#70e4cf', '#e7bb76', '#bda5f5'];
const LIVE=document.documentElement.dataset.defenseLive==='true';
const SESSION_KEY = LIVE?'cnine_monster_defense_test_session_v1':'cnine_coop_defense_review_session_v1';
const FOCUS_QUERY = '(max-width:760px), (max-height:540px) and (pointer:coarse)';
const state = { capacity: 3, difficulty:'NORMAL',access:!LIVE,options:null,loadout: LIVE?emptyDefenseLoadout():defaultLoadout(), session: null, snapshot: null, catalog: null,
  engine: null, mount: null, selected: null, focus: null, poll: null, pollAbort: null, stopped: false, failures: 0, screen: 'lobby', pending: false, epoch: 0 };
let toastTimer, bannerTimer, refreshingSession, entryResetTimer, refreshingEntry;
let workshop;
let formation;
let roomBrowser;
const safeName = value => String(value || '').slice(0, 40);
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function showScreen(screen) {
  state.screen = screen;
  for (const id of ['lobby', 'waiting-room', 'battle']) $(id).hidden = id !== screen;
  $('resume-battle').hidden = screen !== 'lobby' || !state.session;
}
async function renewSession(){
 if(!refreshingSession)refreshingSession=(async()=>{const roomId=state.session?.roomId;if(!roomId)throw Error('이어갈 전투가 없습니다.');const fresh=await request('session',{method:'POST',body:{roomId}});if(state.session?.roomId===roomId){state.session={token:fresh.token,expires:fresh.expires,roomId:fresh.roomId,playerId:fresh.playerId};rememberSession();}})().finally(()=>{refreshingSession=null;});
 await refreshingSession;
}
async function request(path, { method = 'GET', body, signal, recoverSession=true } = {}) {
  if(LIVE){
    const live=path.startsWith('state')||path==='command';
    if(live&&state.session&&Date.now()>state.session.expires-20000){
      await renewSession();
    }
    const token=live?state.session?.token:localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
    const url=live?new URL('/api/defense/live/'+path,location.origin):new URL('/api/defense/'+path,location.origin);
    if(live)url.searchParams.set('room',state.session?.roomId||'');
    if(body&&['create','join'].includes(path)){const {name,...rest}=body;body={...rest,difficulty:state.difficulty,requestId:crypto.randomUUID()};}
    const response=await fetch(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal||AbortSignal.timeout(10000),cache:'no-store'});
    let data;try{data=await response.json();}catch{throw Error('디펜스 서버 응답을 확인하지 못했습니다.');}
    if(!response.ok){
      if(live&&response.status===401&&recoverSession&&state.session){await renewSession();return request(path,{method,body,signal,recoverSession:false});}
      throw Object.assign(Error(data.error||'요청을 처리하지 못했습니다.'),{status:response.status,code:data.code});
    }return data;
  }
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (state.session?.token) headers.Authorization = `Bearer ${state.session.token}`;
  const response = await fetch(`/__coop-defense/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: signal || AbortSignal.timeout(8000), cache: 'no-store', credentials: 'omit' });
  let data;
  try { data = await response.json(); } catch { throw new Error('협동 검수 서버에 연결할 수 없습니다.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status: response.status });
  return data;
}
function rememberSession() {
  try { if (state.session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}
function rosterOptions(){return state.options||{mercenaries:[],cards:[]};}
function mergeRoster(rows){for(const entry of rows||[])state.catalog.units[entry.code]=entry;}
function completeLoadout(){const o=rosterOptions();return state.loadout.mercenaries.length===2&&new Set(state.loadout.mercenaries).size===2&&state.loadout.mercenaries.every(code=>o.mercenaries.some(c=>c.code===code))&&o.cards.some(c=>c.code===state.loadout.card);}
const entryExhausted=()=>LIVE&&state.feature?.mode==='ON'&&state.feature.dailyEntry?.remaining===0;
function updateEntryButtons(){for(const button of [$('create-room'),$('practice')])button.disabled=state.pending||!state.access||!completeLoadout()||(button.id==='create-room'&&entryExhausted());$('find-rooms').disabled=state.pending||!state.access||entryExhausted();}
function renderEntry(){
 const q=state.feature?.dailyEntry,limited=LIVE&&state.feature?.mode==='ON';
 $('daily-entry-status').textContent=limited&&q?`오늘 실전 참여 ${q.remaining} / ${q.limit}회 남음${q.remaining===0?' · 오늘 참여 완료':''}`:'TEST·혼자 연습은 참여 횟수를 차감하지 않습니다.';
 $('daily-entry-status').classList.toggle('is-empty',limited&&q?.remaining===0);
 clearTimeout(entryResetTimer);
 if(limited&&q){state.entryResetDue=Date.now()+Math.max(0,q.resetAt-q.serverNow);entryResetTimer=setTimeout(()=>{if(!document.hidden)void refreshEntry().catch(()=>{});},Math.max(1000,state.entryResetDue-Date.now()+100));}
 updateEntryButtons();
}
async function refreshEntry(){
 if(!LIVE)return;
 refreshingEntry??=request('feature').then(feature=>{if(state.feature&&state.feature.user.id!==feature.user.id)throw Error('계정이 변경됐습니다. 새로고침해 주세요.');state.feature=feature;state.access=feature.accessible;renderEntry();buildDifficulties();}).finally(()=>{refreshingEntry=null;});
 return refreshingEntry;
}
function rememberLoadout(){if(LIVE&&state.feature?.user.id)try{localStorage.setItem('cnine_defense_loadout_v1:'+state.feature.user.id,JSON.stringify(state.loadout));}catch{}}
async function refreshRoster(){
  if(LIVE){const options=await request('options');if(options.you!==state.feature?.user.id)throw Error('계정이 변경됐습니다. 새로고침해 주세요.');state.options=options;}
  else state.options={mercenaries:MERCENARIES.map(c=>({...state.catalog.units[c.code],...c,kind:'MERCENARY',rank:'TEST',roleName:DEFENSE_ROLE_NAMES[c.role],defense:DEFENSE_PROFILES[c.role]})),cards:CARDS.map(c=>({...state.catalog.units[c.code],...c,kind:'CARD',rank:'TEST',roleName:DEFENSE_ROLE_NAMES[c.role],defense:DEFENSE_PROFILES[c.role]}))};
  mergeRoster([...state.options.mercenaries,...state.options.cards]);buildLoadout();updateEntryButtons();
}
function openFormation(slot=0){if(!state.access||state.pending)return Promise.resolve(false);return formation.open(slot<2?'MERCENARY':'CARD');}
function buildLoadout() {
  $('loadout-grid').replaceChildren();
  for (let slot = 0; slot < 3; slot++) {
    const wrap = document.createElement('div'); wrap.className = 'loadout-slot';
    const art = document.createElement('div'); art.className = 'slot-art';
    const code=slot<2?state.loadout.mercenaries[slot]:state.loadout.card,entry=state.catalog.units[code];
    const img = document.createElement('img'); img.alt = ''; const kind = document.createElement('span'); kind.textContent = slot < 2 ? `용병 ${slot + 1}` : '카드 1';
    const role = document.createElement('small'); role.className = 'slot-role';
    if(entry){img.src=entry.battleSprite;img.alt=`${entry.name} 전투 캐릭터`;role.textContent=entry.roleName||'분대 지휘';art.append(img,kind,role);}
    else{const empty=document.createElement('div');empty.className='formation-empty-stage';img.src=state.catalog.uiSkin.crest;empty.append(img);art.append(empty,kind);}
    const button=document.createElement('button');button.type='button';button.id=`loadout-${slot}`;button.className='formation-open';button.textContent=entry?entry.name+' · 변경':kind.textContent+' 선택 ＋';button.disabled=!state.access;button.addEventListener('click',()=>openFormation(slot));
    wrap.append(art,button);$('loadout-grid').append(wrap);
  }
}
async function saveRoomFormation(path,loadout,ready){
  const epoch=state.epoch,roomId=state.session.roomId,mine=state.snapshot.players.find(p=>p.id===state.session.playerId);
  const body={roomId,loadout,requestId:crypto.randomUUID(),loadoutRevision:mine.loadoutRevision||0,...(path==='ready'?{ready}:{})};
  let result;try{result=await request(path,{method:'POST',body});}catch(error){if(error.status)throw error;result=await request(path,{method:'POST',body});}
  if(epoch!==state.epoch||state.session?.roomId!==roomId)throw Error('대기방이 변경됐습니다. 현재 분대를 다시 확인하세요.');
  receive(result.snapshot);schedulePoll(0);
}
async function applyFormation(loadout){
  if(state.snapshot&&state.snapshot.phase!=='LOBBY')throw Error('전투가 시작되어 편성을 바꿀 수 없습니다.');
  if(LIVE)defenseSelection(loadout);else validateLoadout(loadout);
  if(state.session&&state.snapshot?.phase==='LOBBY'){
    if(LIVE)await saveRoomFormation('select',loadout);
    else{const ok=await sendCommand({type:'READY',ready:false,loadout});if(!ok)throw Error('편성을 저장하지 못했습니다.');receive(await request('state'));}
  }
  state.loadout=structuredClone(loadout);rememberLoadout();buildLoadout();updateEntryButtons();
}
async function setReady(){
  if(state.pending||!state.session)return;const mine=state.snapshot.players.find(p=>p.id===state.session.playerId);
  state.pending=true;renderWaiting(state.snapshot);
  try{if(LIVE)await saveRoomFormation('ready',mine.loadout,!mine.ready);else await sendCommand({type:'READY',ready:!mine.ready});}
  catch(e){toast(e.message);}
  finally{state.pending=false;if(state.snapshot?.phase==='LOBBY')renderWaiting(state.snapshot);}
}
async function joinOrCreate(kind,roomId) {
  if (state.pending||!state.access) return false;
  if(kind!=='practice'&&entryExhausted()){toast('오늘 참여 횟수가 0회입니다. 한국시간 00:00에 초기화됩니다.');return false;}
  try {
    if(LIVE)defenseSelection(state.loadout);else validateLoadout(state.loadout);
    if(!completeLoadout())return toast('보유 용병 2명과 카드 1장을 선택하세요.');
    const name = $('nickname').value.trim(); if (!name) { $('nickname').focus(); return toast('대원 이름을 입력하세요.'); }
    state.pending = true;
    updateEntryButtons();
    const session = await request(kind === 'join' ? 'join' : 'create', { method: 'POST', body: { name, loadout: state.loadout,
      capacity: state.capacity, difficulty:state.difficulty,...(kind==='join'?{roomId}:{}), practice: kind === 'practice' } });
    if (state.session) await teardown(false);
    state.session = { token: session.token, expires:session.expires,roomId: session.roomId, playerId: session.playerId };
    state.stopped = false; state.failures = 0; rememberSession();
    receive(session.snapshot); schedulePoll(0);
    return true;
  } catch (error) { if(error.code==='DEFENSE_ENTRY_EMPTY')void refreshEntry().catch(()=>{});toast(error.message);return {ok:false,error:error.message}; }
  finally { state.pending = false; updateEntryButtons(); }
}
async function sendCommand(command) {
  if (!state.session) return false;
  const epoch=state.epoch;
  const requestId = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  try {
    // A lost response can be retried with the exact same identifier, without applying twice.
    const payload = { requestId, command };
    try { await request('command', { method: 'POST', body: payload }); }
    catch (error) {
      if (error.status) throw error;
      await request('command', { method: 'POST', body: payload });
    }
    if(epoch!==state.epoch)return false;
    if(['FORGE','TRAIT','READY_WAVE'].includes(command.type))receive(await request('state'));
    schedulePoll(0);return true;
  } catch (error) { toast(error.message);return false; }
}
function schedulePoll(delay = 300) {
  clearTimeout(state.poll);
  if (!state.stopped && state.session) state.poll = setTimeout(poll, delay);
}
async function poll() {
  if (state.pollAbort || state.stopped || !state.session) return schedulePoll();
  const controller = new AbortController(); state.pollAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 7000), epoch = state.epoch;
  try {
    const snapshot = await request(`state?after=${state.snapshot?.seq || 0}`, { signal: controller.signal });
    if (epoch !== state.epoch) return;
    state.failures = 0; $('connection').hidden = true; $('sync-state').textContent = '서버 연결됨'; receive(snapshot);
  } catch (error) {
    if (epoch !== state.epoch || state.stopped) return;
    if ([401,403,404].includes(error.status)) { await teardown(true); showScreen('lobby'); toast(error.message); return; }
    state.failures++; $('connection').hidden = false; $('sync-state').textContent = '연결 복구 중';
  } finally {
    clearTimeout(timeout); if (state.pollAbort === controller) state.pollAbort = null;
    if (epoch === state.epoch) schedulePoll(Math.min(2000, state.failures ? 400 * state.failures : 300));
  }
}
function receive(snapshot) {
  const previous = state.snapshot;
  if(previous?.id===snapshot.id&&(snapshot.seq<previous.seq||snapshot.time<previous.time))return;
  state.snapshot = snapshot;
  document.querySelectorAll('.review-tag').forEach(el=>el.textContent=snapshot.operatingMode==='ON'?'LIVE':'TEST');
  document.querySelector('.battle-title .eyebrow').textContent='리버스콜 · 디펜스 '+(snapshot.operatingMode==='ON'?'LIVE':'TEST');
  for(const player of snapshot.players)mergeRoster(player.roster);
  const own=snapshot.players.find(p=>p.id===state.session.playerId);if(own)state.loadout=structuredClone(own.loadout);
  if(snapshot.phase!=='LOBBY'&&formation?.dialog.open&&!formation.busy)formation.close();
  if(LIVE&&previous?.phase==='LOBBY'&&snapshot.phase!=='LOBBY')void refreshEntry().catch(()=>{});
  if (snapshot.phase === 'LOBBY') { showScreen('waiting-room'); renderWaiting(snapshot); return; }
  if (state.screen !== 'battle') {
    showScreen('battle');
    const mine = snapshot.players.find(p => p.id === state.session.playerId);
    state.focus = matchMedia(FOCUS_QUERY).matches ? mine?.lane ?? 0 : null;
    state.selected = snapshot.units.find(u => u.ownerId === state.session.playerId)?.id;
    buildControls(snapshot); void ensureEngine();
  }
  renderBattle(snapshot);
  if(snapshot.version>=3){workshop??=new DefenseWorkshop(sendCommand,toast);workshop.receive(snapshot,state.session.playerId);}
  state.engine?.applySnapshot(snapshot, state.session.playerId);
  const beforeMine = previous?.players.find(p => p.id === state.session.playerId);
  const nowMine = snapshot.players.find(p => p.id === state.session.playerId);
  if (beforeMine?.reviveAt && !nowMine.reviveAt && ['PREP', 'WAVE'].includes(snapshot.phase))
    toast(`분대가 체력 ${Math.round(RULES.reviveHpRatio * 100)}%로 ${LANES[nowMine.lane]} 방어선에 복귀했습니다.`);
  if (previous?.phase !== snapshot.phase || previous?.wave !== snapshot.wave) showPhase(snapshot);
  if (['VICTORY', 'DEFEAT'].includes(snapshot.phase)) renderResult(snapshot);
}
function updatePartyViewport() {
  const list=$('party-list'),padding=parseFloat(getComputedStyle(list).paddingLeft)||0;
  let nearest=0,distance=Infinity;
  [...list.children].forEach((item,i)=>{const delta=Math.abs(item.offsetLeft-padding-list.scrollLeft);if(delta<distance){distance=delta;nearest=i;}});
  [...$('party-roster-tabs').children].forEach((tab,i)=>tab.setAttribute('aria-pressed',String(i===nearest)));
}
function renderWaiting(snapshot) {
  const host=snapshot.players.find(p=>p.id===snapshot.hostId);
  $('room-visibility').textContent=snapshot.practice?'자동 대원 연습':'공개 대기방';
  $('room-host').textContent=(host?.name||'우리')+'의 방어대';
  $('waiting-description').textContent = snapshot.practice ? '자동 대원이 준비를 마쳤습니다. 내 분대를 확인하고 출발하세요.' : '각자 용병 2명과 카드 1장. 준비가 끝나면 함께 출발합니다.';
  $('waiting-difficulty').textContent=snapshot.difficultyName;
  $('waiting-wave-count').textContent=snapshot.totalWaves;
  $('room-note').textContent=snapshot.practice?'자동 대원과 함께하는 연습 원정입니다.':snapshot.operatingMode==='ON'?'전투 시작 시 1회 차감 · 실패 시에도 소모 · 재접속 추가 차감 없음':'다른 대원이 방 목록에서 이 방을 선택해 참가할 수 있습니다.';
  $('party-count').textContent=snapshot.players.length+' / '+snapshot.capacity+'명 집결';
  const readyCount=snapshot.players.filter(p=>p.ready&&p.connected).length;
  $('ready-count').textContent=readyCount+' / '+snapshot.capacity;
  $('party-ready-progress').max=snapshot.capacity;$('party-ready-progress').value=readyCount;
  $('party-list').style.setProperty('--party-capacity',snapshot.capacity);
  const signature = JSON.stringify([snapshot.hostId,snapshot.capacity,snapshot.players.map(p => [p.id, p.name, p.ready, p.connected, p.loadout])]);
  if ($('party-list').dataset.signature !== signature) {
    $('party-list').dataset.signature = signature;
    const previousScroll=$('party-list').scrollLeft;
    $('party-list').replaceChildren();$('party-roster-tabs').replaceChildren();
    for (let lane = 0; lane < snapshot.capacity; lane++) {
      const player = snapshot.players.find(p => p.lane === lane);
      const item = document.createElement('article'); item.className = 'party-member'+(!player?' is-empty':'')+(player?.id===state.session.playerId?' is-self':'')+(player?.ready&&player.connected?' is-ready':''); item.style.setProperty('--lane-color', colors[lane]);
      const tag = document.createElement('span'); tag.className = 'party-lane'; tag.textContent = `방어선 ${LANES[lane]}`;
      const name = document.createElement('h3'); name.textContent = player ? safeName(player.name) : '대원 기다리는 중';
      const detail = document.createElement('p'); detail.textContent = player ? (player.id === snapshot.hostId ? '방장 · ' : '') + (player.bot ? '자동 대원' : player.id === state.session.playerId ? '내 분대' : '협동 대원') : '방 목록에서 새 대원을 모집합니다';
      const ready = document.createElement('span'); ready.className = `party-ready${player?.ready&&player.connected ? ' is-ready' : ''}`;
      ready.textContent = !player ? '빈자리' : !player.connected ? '연결 대기' : player.ready ? '준비 완료' : '편성 확인 중';
      const head=document.createElement('div');head.className='party-member-head';head.append(tag,ready);
      item.append(head, name, detail);
      if (player) {
        const art = document.createElement('div'); art.className = 'party-portraits';
        for (const code of [...player.loadout.mercenaries, player.loadout.card]) {
          const unit=player.roster?.find(c=>c.code===code)||state.catalog.units[code],figure=document.createElement('figure'),caption=document.createElement('figcaption');
          const image = document.createElement('img'); image.src = unit.battleSprite; image.alt = '';caption.textContent=unit.name;figure.append(image,caption);art.append(figure);
        }
        item.append(art);
      } else {const empty=document.createElement('div');empty.className='party-empty-slots';empty.setAttribute('aria-hidden','true');for(let slot=0;slot<3;slot++){const tile=document.createElement('span'),plus=document.createElement('i'),label=document.createElement('small');plus.textContent='+';label.textContent=slot<2?'용병 '+(slot+1):'카드';tile.append(plus,label);empty.append(tile);}item.append(empty);}
      $('party-list').append(item);
      const tab=document.createElement('button');tab.type='button';tab.className='party-roster-tab';tab.textContent=LANES[lane]+' · '+(player?safeName(player.name):'빈자리')+(player?.id===state.session.playerId?' · 나':'');tab.setAttribute('aria-label',LANES[lane]+' 방어선 분대 보기');tab.addEventListener('click',()=>{const list=$('party-list');list.scrollTo({left:item.offsetLeft-(parseFloat(getComputedStyle(list).paddingLeft)||0),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});});$('party-roster-tabs').append(tab);
    }
    const viewKey=snapshot.id+':'+state.session.playerId;
    requestAnimationFrame(()=>{const list=$('party-list');if(list.dataset.viewKey!==viewKey){list.dataset.viewKey=viewKey;if(matchMedia('(max-width:760px)').matches)list.scrollLeft=(list.querySelector('.is-self')?.offsetLeft||0)-(parseFloat(getComputedStyle(list).paddingLeft)||0);}else list.scrollLeft=previousScroll;updatePartyViewport();});
  }
  const mine = snapshot.players.find(p => p.id === state.session.playerId), isHost = snapshot.hostId === state.session.playerId;
  $('ready').textContent = mine.ready ? '준비 취소' : '준비 완료'; $('ready').setAttribute('aria-pressed', String(mine.ready));
  $('ready').disabled=state.pending||snapshot.entryPending;$('edit-formation').disabled=state.pending||snapshot.entryPending;$('leave-waiting').disabled=!!snapshot.entryPending;
  $('start').hidden = !isHost;
  $('start').disabled = state.pending || snapshot.entryPending || snapshot.players.length < snapshot.capacity || snapshot.players.some(p => !p.ready || !p.connected);
  $('waiting-room').classList.toggle('is-deploy-ready',!$('start').disabled);
  $('start-hint').textContent = !isHost ? '모두 준비하면 방장이 출발할 수 있습니다.' : $('start').disabled ? '모든 대원이 준비를 마치면 출발할 수 있습니다.' : '모든 대원이 준비됐습니다.';
  if(snapshot.entryPending)$('start-hint').textContent='참여 횟수 확인 중 · 중복 차감 없이 자동으로 복구합니다.';
  else if(snapshot.entryError)$('start-hint').textContent=snapshot.entryError;
}
function buildControls(snapshot) {
  $('lane-tabs').replaceChildren(); $('move-buttons').replaceChildren(); $('unit-controls').replaceChildren();
  for (let lane = 0; lane < snapshot.capacity; lane++) {
    const player = snapshot.players.find(p => p.lane === lane);
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'lane-tab'; tab.dataset.view = lane;
    tab.style.setProperty('--lane-color', colors[lane]);
    const id = document.createElement('span'); id.className = 'lane-id'; id.textContent = LANES[lane];
    const detail = document.createElement('span'), name = document.createElement('b'), status = document.createElement('small');
    name.textContent = player.name; status.dataset.laneStatus = lane; detail.append(name, status);
    const pressure = document.createElement('span'); pressure.className = 'pressure'; pressure.dataset.lanePressure = lane;
    tab.append(id, detail, pressure); tab.addEventListener('click', () => setFocus(lane)); $('lane-tabs').append(tab);
    const move = document.createElement('button'); move.type = 'button'; move.className = 'move-button'; move.dataset.lane = lane; move.textContent = LANES[lane];
    move.setAttribute('aria-label', `${LANES[lane]} 방어선으로 지원 이동`);
    move.addEventListener('click', () => void sendCommand({ type: 'MOVE', unitId: state.selected, lane })); $('move-buttons').append(move);
  }
  for (const unit of snapshot.units.filter(u => u.ownerId === state.session.playerId)) {
    const button = document.createElement('button'); button.className = 'unit-button'; button.type = 'button'; button.dataset.unitId = unit.id;
    const image = document.createElement('img'); image.src = state.catalog.units[unit.code].sourceArt; image.alt = ''; image.className = 'unit-portrait';
    const info = document.createElement('span'), name = document.createElement('strong'), status = document.createElement('small');
    name.textContent = unit.name; status.className = 'unit-location';
    const hp = document.createElement('span'); hp.className = 'unit-hp'; const fill = document.createElement('i'); hp.append(fill);
    info.append(name, status, hp); button.append(image, info);
    button.addEventListener('click', () => { state.selected = unit.id; state.engine?.selectUnit(unit.id); renderBattle(state.snapshot); });
    $('unit-controls').append(button);
  }
  $('minimap').innerHTML = '<span class="minimap-label">전체 전장 · 눌러서 보기</span><button type="button" aria-label="전체 전장 보기"><svg viewBox="0 0 192 108" role="img" aria-label="방어선별 아군과 적 위치"></svg></button>';
  $('minimap').querySelector('button').addEventListener('click', () => setFocus(null));
  updateViewButtons();
}
function setFocus(lane) {
  state.focus = lane;
  state.engine?.setView(lane); updateViewButtons();
}
function updateViewButtons() {
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === (state.focus === null ? 'all' : String(state.focus)))));
  $('view-label').textContent = state.focus === null ? '전체 전장' : `${LANES[state.focus]} 방어선`;
  $('field-subtitle').textContent = state.focus === null ? '공세 예고를 보고 지원할 방어선을 정하세요' : '좌우로 드래그하여 전장을 살펴보세요';
  $('field-pan').hidden = state.focus === null;
  $('minimap').hidden = state.focus === null;
}
async function ensureEngine() {
  if (state.engine || state.mount) return;
  const epoch = state.epoch; $('loading').hidden = false;
  const units=Object.fromEntries([...new Set(state.snapshot.units.map(u=>u.code))].map(code=>[code,state.catalog.units[code]]));
  const engine = new DefenseBattleEngine({ host: $('battle-canvas'), catalog: {...state.catalog,units} });
  state.mount = engine.mount();
  try {
    await state.mount;
    if (epoch !== state.epoch) { engine.destroy(); return; }
    state.engine = engine;
    engine.applySnapshot(state.snapshot, state.session.playerId); engine.setView(state.focus); engine.selectUnit(state.selected);
    await engine.prepareActors();
    if(epoch!==state.epoch)return;
    $('loading').hidden = true;
  } catch (error) {
    engine.destroy();if(state.engine===engine)state.engine=null; $('loading').querySelector('b').textContent = '전장 로딩 실패 · 새로고침하면 같은 방으로 복구합니다';
    console.error('[Cooperative defense]', error); toast('전장 리소스를 불러오지 못했습니다. 새로고침해 다시 연결하세요.');
  } finally { state.mount = null; }
}
function renderBattle(snapshot) {
  const boss=snapshot.enemies.find(e=>e.type==='BOSS'),warning=snapshot.enemies.find(e=>e.cast?.endsAt>snapshot.time);
  const threat=boss||warning;
  $('boss-status').hidden=!threat;
  if(threat){$('wave-banner').hidden=true;$('boss-name').textContent=threat.name+(threat.enraged?' · 격노':'');$('boss-health').value=threat.hp;$('boss-health').max=threat.maxHp;$('boss-instruction').textContent=warning?`${LANES[warning.cast.lane]} 전선 위험 · ${Math.ceil((warning.cast.endsAt-snapshot.time)/1000)}초 후 포격 · 방어 태세 / 지원 이동`:defenseEnemy(threat.archetype)?.hint||'보스의 진격을 막으세요.';}
  const mine = snapshot.players.find(p => p.id === state.session.playerId);
  const active = ['PREP', 'WAVE'].includes(snapshot.phase);
  if(snapshot.waveBrief){
    const brief=snapshot.waveBrief;
    $('field-subtitle').textContent=`${snapshot.phase==='PREP'?'다음 ':''}${brief.wave}W · ${brief.kind==='NORMAL'?'전 전선':LANES[brief.focus]+' 전선'} ${brief.name}`;
    $('field-subtitle').title=brief.hint;
  }
  const recovering = active && mine.reviveAt > snapshot.time;
  const reviveSeconds = Math.max(0, Math.ceil((mine.reviveAt - snapshot.time) / 1000));
  $('field-pan').hidden = state.focus === null || recovering;
  $('revive-panel').hidden = !recovering;
  if (recovering) {
    $('revive-kicker').textContent = `${mine.wipeCount}번째 전멸 · 이번 대기 ${mine.reviveDelayMs / 1000}초`;
    $('revive-seconds').textContent = reviveSeconds;
    $('revive-detail').textContent = `체력 ${Math.round(RULES.reviveHpRatio * 100)}%로 ${LANES[mine.lane]} 방어선에 복귀합니다.`;
    $('revive-progress').style.width = `${Math.max(0, Math.min(100, (1 - (mine.reviveAt - snapshot.time) / mine.reviveDelayMs) * 100))}%`;
    $('revive-next').textContent = `다음 전멸 ${Math.min(RULES.reviveMaxMs, (mine.wipeCount + 1) * RULES.reviveStepMs) / 1000}초 · 수호석 방어는 계속됩니다`;
    $('wave-banner').hidden = true;
  }
  $('my-squad-label').textContent = `${LANES[mine.lane]} · 내 분대`;
  $('core-value').textContent = `${snapshot.coreHp.toLocaleString()} / ${snapshot.coreMaxHp.toLocaleString()}`;
  $('core-fill').style.width = `${snapshot.coreHp / snapshot.coreMaxHp * 100}%`;
  $('core-fill').style.background = snapshot.coreHp < snapshot.coreMaxHp * .3 ? 'var(--red)' : 'var(--mint)';
  document.querySelector('.core-track').setAttribute('aria-valuenow', String(snapshot.coreHp));
  document.querySelector('.core-track').setAttribute('aria-valuemax',String(snapshot.coreMaxHp));
  $('wave-label').textContent = snapshot.phase === 'PREP' ? `정비 ${Math.max(0, Math.ceil((snapshot.phaseUntil - snapshot.time) / 1000))}초` : snapshot.phase === 'WAVE' ? '교전 중' : '전투 종료';
  $('wave-value').innerHTML = `${String(snapshot.wave).padStart(2, '0')} <small>/ ${snapshot.totalWaves}</small>`;
  $('credit-value').textContent = mine.credits;
  const upgradeCost = 100 + mine.upgrades * 50;
  $('upgrade').textContent = mine.upgrades >= 5 ? '강화 완료' : `강화 ${upgradeCost}`;
  $('upgrade').disabled = recovering || snapshot.phase !== 'PREP' || mine.credits < upgradeCost || mine.upgrades >= 5;
  $('upgrade').setAttribute('aria-label', `분대 강화 ${mine.upgrades}단계, 정비 자원 ${upgradeCost} 필요`);
  if(snapshot.version>=3){$('upgrade').textContent=snapshot.phase==='PREP'?'정비실 열기':'강화 · 정비 대기';$('upgrade').disabled=snapshot.phase!=='PREP';$('upgrade').setAttribute('aria-label','포인트 추첨, 분대 강화, 특성 선택 정비실 열기');}
  for (let lane = 0; lane < snapshot.capacity; lane++) {
    const enemies = snapshot.enemies.filter(e => e.lane === lane), danger = enemies.some(e => e.x < WORLD.breachWarningX) || enemies.filter(e => e.x < WORLD.pressureX).length >= 5;
    const player = snapshot.players.find(p => p.lane === lane), tab = $('lane-tabs').querySelector(`[data-view="${lane}"]`);
    const downSeconds = active && player.reviveAt > snapshot.time ? Math.ceil((player.reviveAt - snapshot.time) / 1000) : 0;
    tab.classList.toggle('is-danger', danger || downSeconds > 0);
    tab.classList.toggle('is-reviving', downSeconds > 0);
    const forecast=snapshot.waveBrief?.kind!=='NORMAL'&&snapshot.waveBrief?.focus===lane;
    tab.querySelector('small').textContent = downSeconds ? `전멸 · ${downSeconds}초` : !player.connected ? '자동 방어 중' : danger ? `위험 · 적 ${enemies.length}` : forecast ? `${snapshot.phase==='PREP'?'예고 · ':''}${snapshot.waveBrief.name}` : enemies.length ? `교전 · 적 ${enemies.length}` : '방어 대기';
    tab.querySelector('.pressure').textContent = `적 ${enemies.length}`;
    tab.setAttribute('aria-label', `${LANES[lane]} 방어선, ${player.name}, ${downSeconds ? `분대 전멸, ${downSeconds}초 후 부활, ` : danger ? '위험, ' : ''}적 ${enemies.length}기, 카메라 이동`);
  }
  for (const button of $('unit-controls').children) {
    const unit = snapshot.units.find(u => u.id === button.dataset.unitId);
    button.setAttribute('aria-pressed', String(unit.id === state.selected)); button.classList.toggle('is-down', unit.hp <= 0);
    button.querySelector('.unit-location').textContent = recovering ? `${reviveSeconds}초 후 부활` : unit.hp <= 0 ? '다음 정비에 복귀' : unit.move ? `${LANES[unit.move.lane]}로 이동 중` : `${LANES[unit.lane]} 방어선 · ${Math.ceil(unit.hp / unit.maxHp * 100)}%`;
    button.querySelector('.unit-hp>i').style.width = `${unit.hp / unit.maxHp * 100}%`;
    button.setAttribute('aria-label', `${unit.name}, 체력 ${Math.ceil(unit.hp / unit.maxHp * 100)}%, ${unit.move ? '이동 중' : LANES[unit.lane] + ' 방어선'}`);
  }
  const selected = snapshot.units.find(u => u.id === state.selected);
  if (selected) {
    $('selected-name').textContent = `${selected.name} · 지원 텔레포트`;
    for (const button of $('move-buttons').children) {
      const lane = Number(button.dataset.lane); button.setAttribute('aria-pressed', String(selected.lane === lane && !selected.move));
      button.disabled = !active || selected.hp <= 0 || Boolean(selected.move) || lane === selected.lane || selected.moveReadyAt > snapshot.time;
    }
    const cooldown = Math.max(0, Math.ceil((selected.skillReadyAt - snapshot.time) / 1000));
    $('skill-name').textContent = selected.skillName;
    const outOfRange=snapshot.tempoRevision===1&&['RANGED','STRIKER'].includes(selected.role)&&!snapshot.enemies.some(e=>e.hp>0&&e.lane===selected.lane&&Math.hypot(e.x-selected.x,e.y-selected.y)<=selected.range+(selected.role==='RANGED'?300:240));
    $('skill-state').textContent = recovering ? `${reviveSeconds}초 후 부활` : selected.hp <= 0 ? '전투불능' : selected.move ? '전송 중' : snapshot.phase !== 'WAVE' ? '교전 중 사용' : cooldown ? `${cooldown}초 후 사용` : outOfRange ? '사거리 내 적 대기' : '사용 가능';
    $('skill').disabled = snapshot.phase !== 'WAVE' || selected.hp <= 0 || Boolean(selected.move) || cooldown > 0 || outOfRange;
  }
  renderMinimap(snapshot);
}
function renderMinimap(snapshot) {
  const svg = $('minimap').querySelector('svg'); if (!svg) return;
  const ns = 'http://www.w3.org/2000/svg'; svg.replaceChildren();
  const make = (tag, attributes) => { const node = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v); svg.append(node); return node; };
  const mapX = x => 8 + x / WORLD.width * 174, mapY = y => 8 + y / WORLD.height * 92;
  for (let lane = 0; lane < snapshot.capacity; lane++) {
    const y = mapY(laneY(lane, snapshot.capacity));
    make('path', { d: `M${mapX(WORLD.spawnX)} ${y}H${mapX(WORLD.mergeX)}L${mapX(WORLD.coreX)} ${mapY(WORLD.coreY)}`, fill: 'none', stroke: colors[lane], 'stroke-width': state.focus === lane ? 3 : 1, opacity: .6 });
    const text = make('text', { x: 184, y: y + 3, fill: colors[lane], 'font-size': 10 }); text.textContent = LANES[lane];
  }
  make('image', { href: state.catalog.environment.core, x: mapX(WORLD.coreX) - 12, y: mapY(WORLD.coreY) - 29, width: 24, height: 37 });
  if (state.focus !== null && state.engine) {
    const { focusX, viewWidth } = state.engine;
    const left = Math.max(0, focusX - viewWidth / 2), right = Math.min(WORLD.width, focusX + viewWidth / 2);
    make('rect', { x: mapX(left), y: mapY(laneY(state.focus, snapshot.capacity)) - 9, width: mapX(right) - mapX(left), height: 18,
      fill: colors[state.focus], 'fill-opacity': .1, stroke: colors[state.focus], 'stroke-width': .6 });
  }
  for (const unit of snapshot.units.filter(u => u.hp > 0)) make('circle', { cx: mapX(unit.x), cy: mapY(unit.y), r: 3, fill: colors[unit.ownerLane] });
  for (const enemy of snapshot.enemies) make('rect', { x: mapX(enemy.x) - 2, y: mapY(enemy.y) - 2, width: enemy.type === 'BOSS' ? 7 : 4, height: enemy.type === 'BOSS' ? 7 : 4, fill: '#f49b8d' });
}
function showPhase(snapshot) {
  const banner = $('wave-banner'); clearTimeout(bannerTimer);
  if (!['PREP', 'WAVE'].includes(snapshot.phase) || snapshot.enemies.some(e=>e.type==='BOSS'&&e.hp>0) || snapshot.players.find(p => p.id === state.session.playerId)?.reviveAt) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.querySelector('span').textContent = snapshot.phase === 'PREP' ? '재배치 · 회복 · 강화' : `WAVE ${String(snapshot.wave).padStart(2, '0')}`;
  banner.querySelector('b').textContent = snapshot.phase === 'PREP' ? snapshot.wave ? '다음 공세에 대비하세요' : '첫 공세가 다가옵니다' : snapshot.wave === snapshot.totalWaves ? '최종 보스 · 함께 거점을 지키세요' : snapshot.wave === Math.floor(snapshot.totalWaves/2) ? '중간 보스 진격' : '적이 방어선에 진입합니다';
  if(snapshot.waveBrief){const b=snapshot.waveBrief;banner.querySelector('b').textContent=`${b.kind==='NORMAL'?'전 전선':LANES[b.focus]+' 전선'} · ${b.name}`;banner.querySelector('span').textContent=b.hint;}
  bannerTimer = setTimeout(() => { banner.hidden = true; }, 2800);
}
function rewardLines(reward,items=state.feature?.rewardItems||[]){
 if(!reward)return [];
 const names=new Map(items.map(i=>[i.code,i.name]));
 return [...(reward.coin?[{text:reward.coin.toLocaleString()+' 코인'}]:[]),...(reward.masterStars?[{text:'마스터의 별 '+reward.masterStars.toLocaleString()+'개'}]:[]),...(reward.items||[]).filter(i=>defenseRewardItemRule(i).chancePercent>0).map(i=>({text:(i.name||names.get(i.code)||'아이템 보상')+' '+(reward.granted?i.quantity.toLocaleString()+'개':defenseRewardItemLabel(i)),image:i.image})),...(reward.granted?reward.itemRolls||[]:[]).filter(i=>i.quantity===0&&i.chancePercent>0).map(i=>({text:(i.name||names.get(i.code)||'아이템 보상')+' · 미당첨'}))];
}
function renderRewards(snapshot){
 const reward=snapshot.clearRewards?.[state.session.playerId],status=$('result-reward-status'),list=$('result-reward-items');list.replaceChildren();
 status.textContent=reward?.granted?'클리어 보상이 지급되었습니다.':reward?.status==='DEFEAT'?'클리어 시 보상을 받을 수 있습니다.':reward?.status==='PRACTICE'||snapshot.practice?'혼자 연습은 계정 보상을 지급하지 않습니다.':reward?.status==='TEST'||snapshot.operatingMode!=='ON'?'TEST 전투는 계정 보상을 지급하지 않습니다.':reward?.status==='DISABLED'||!snapshot.rewardsEnabled?'이 방의 클리어 보상 지급이 비활성입니다.':'클리어 보상을 정산 중입니다. 연결이 끊겨도 서버에서 이어서 처리합니다.';
 if(reward?.granted&&!reward.coin&&!reward.masterStars&&!reward.items?.length)status.textContent='보상 추첨을 완료했습니다. 이번에는 당첨된 아이템이 없습니다.';
 if(reward?.granted)for(const line of rewardLines(reward)){const li=document.createElement('li');if(line.image){const img=document.createElement('img');img.src=/^(https?:\/\/|\/)/.test(line.image)?line.image:'/'+line.image;img.alt='';li.append(img);}const text=document.createElement('span');text.textContent=line.text;li.append(text);list.append(li);}
}
function renderResult(snapshot) {
  const won = snapshot.phase === 'VICTORY'; $('result').hidden = false;renderRewards(snapshot);
  $('result-entry-status').textContent=snapshot.entryCharged?'실전 참여 1회 사용 · 재접속 추가 차감 없음 · 종료 후 24시간 결과 복구 가능':'';
  $('result-eyebrow').textContent = won ? 'MISSION COMPLETE' : 'DEFENSE FAILED';
  $('result-title').textContent = won ? '수호석을 지켜냈습니다' : '방어선이 무너졌습니다';
  $('result-summary').textContent = `${snapshot.wave}웨이브 · 거점 체력 ${snapshot.coreHp} · ${Math.floor(snapshot.time / 60000)}분 ${Math.floor(snapshot.time / 1000 % 60)}초`;
  $('result-stats').replaceChildren();
  for (const player of snapshot.players) {
    const row = document.createElement('div'); row.className = 'result-stat';
    const name = document.createElement('strong'); name.textContent = player.name;
    const wipes = document.createElement('small'); wipes.className = 'result-wipes'; wipes.textContent = `전멸 ${player.wipeCount || 0}회`; name.append(wipes); row.append(name);
    for (const [label, value] of [['피해', player.stats.damage], ['회복·방어', player.stats.heal + player.stats.blocked], ['지원 이동', player.stats.supportMoves]]) {
      const cell = document.createElement('span'); cell.textContent = label; const number = document.createElement('b'); number.textContent = value.toLocaleString(); cell.append(number); row.append(cell);
    }
    $('result-stats').append(row);
  }
}
async function teardown(forget) {
  workshop?.dispose();workshop=null;
  state.stopped = true; state.epoch++; clearTimeout(state.poll); clearTimeout(bannerTimer);
  state.pollAbort?.abort(); state.pollAbort = null;
  const pending = state.mount;
  state.engine?.destroy(); state.engine = null;
  if (pending) await pending.catch(() => {});
  state.snapshot = null; $('battle-canvas').replaceChildren(); $('result').hidden = true;
  if (forget) { state.session = null; rememberSession(); }
}
async function leaveLobby() {
  try { if (state.session) await request('leave', { method: 'POST', body: {} }); } catch { /* The local room may already have expired. */ }
  await teardown(true); showScreen('lobby');
  if(LIVE)await refreshEntry().catch(e=>toast(e.message));
}
async function resumeBattle() {
  if (!state.session || state.pending) return;
  state.pending = true; $('resume-battle').disabled = true;
  try {
    const snapshot = await request('state');
    state.stopped = false; state.failures = 0;
    receive(snapshot); schedulePoll(0);
  } catch (error) {
    if (error.status === 401) await teardown(true);
    showScreen('lobby'); toast(error.message);
  } finally { state.pending = false; $('resume-battle').disabled = false; }
}
function bind() {
  $('party-list').addEventListener('scroll',updatePartyViewport,{passive:true});
  for(const detail of document.querySelectorAll('.mission-tools details'))detail.addEventListener('toggle',()=>{if(detail.open)for(const other of document.querySelectorAll('.mission-tools details'))if(other!==detail)other.open=false;});
  document.querySelectorAll('[data-capacity]').forEach(button => button.addEventListener('click', () => {
    state.capacity = Number(button.dataset.capacity);
    document.querySelectorAll('[data-capacity]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  }));
  $('create-room').addEventListener('click', () => void joinOrCreate('create'));
  $('practice').addEventListener('click', () => void joinOrCreate('practice'));
  $('resume-battle').addEventListener('click', () => void resumeBattle());
  $('find-rooms').addEventListener('click',()=>roomBrowser?.open());
  $('ready').addEventListener('click', () => void setReady());
  $('edit-formation').addEventListener('click',()=>openFormation());
  $('start').addEventListener('click', () => void sendCommand({ type: 'START' }));
  $('skill').addEventListener('click', () => void sendCommand({ type: 'SKILL', unitId: state.selected }));
  $('upgrade').addEventListener('click', () => state.snapshot?.version>=3?workshop?.open():void sendCommand({ type: 'UPGRADE' }));
  $('leave-waiting').addEventListener('click', () => void leaveLobby());
  $('return-lobby').addEventListener('click', () => void leaveLobby());
  document.querySelector('.overview-tab').addEventListener('click', () => setFocus(null));
  $('pan-left').addEventListener('click', () => state.engine?.panBy(-1));
  $('pan-right').addEventListener('click', () => state.engine?.panBy(1));
  $('pan-squad').addEventListener('click', () => state.engine?.centerSquad());
  $('exit-battle').addEventListener('click', () => $('leave-dialog').showModal());
  $('leave-dialog').addEventListener('close', async () => {
    if ($('leave-dialog').returnValue !== 'leave') return;
    // Retain the reconnect token; navigation does not delete an active member.
    await teardown(false); showScreen('lobby');if(LIVE)void refreshEntry().catch(()=>{});toast('진행 중인 전투로 돌아가기를 누르면 추가 차감 없이 이어서 조작할 수 있습니다.');
  });
  addEventListener('pagehide', () => { state.stopped = true; clearTimeout(state.poll);clearTimeout(entryResetTimer); state.pollAbort?.abort(); state.engine?.destroy(); });
  addEventListener('online',()=>{if(state.session&&!state.stopped)schedulePoll(0);if(LIVE)void refreshEntry().catch(()=>{});});
  addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const media = matchMedia(FOCUS_QUERY);
  media.addEventListener('change', () => {
    if (state.screen === 'battle') setFocus(media.matches ? state.snapshot.players.find(p => p.id === state.session.playerId)?.lane ?? 0 : null);
    if (state.screen === 'waiting-room') { $('party-list').dataset.signature = ''; renderWaiting(state.snapshot); }
  });
  document.addEventListener('visibilitychange', () => { if(!document.hidden){if(state.session&&!state.stopped)schedulePoll(0);if(LIVE&&Date.now()>=(state.entryResetDue||Infinity))void refreshEntry().catch(()=>{});} });
}
async function main() {
  bind();
  const response = await fetch('./asset-catalog.json?v=20261017-defense-v3-merc1'); if (!response.ok) throw new Error('전투 리소스 색인을 불러오지 못했습니다.');
  state.catalog = await response.json(); buildLoadout();buildDifficulties();
  formation=new DefenseFormation({getLoadout:()=>state.loadout,getOptions:rosterOptions,refresh:refreshRoster,onApply:applyFormation,onToast:toast});
  roomBrowser=new DefenseRoomBrowser({request,canEnter:()=>state.access&&!state.pending&&!entryExhausted()&&completeLoadout(),entryBlocked:entryExhausted,onJoin:id=>joinOrCreate('join',id),onCreate:()=>void joinOrCreate('create'),onFormation:()=>openFormation()});
  if(LIVE){
    try{const feature=await request('feature');state.access=feature.accessible;state.feature=feature;$('nickname').value=feature.user.nickname;$('nickname').readOnly=true;
      $('access-status').textContent=feature.accessible?'보유 용병 2명 + 카드 1장 · '+(feature.mode==='TEST'?'TEST · 계정 보상 없음':feature.rewardsEnabled?'실전 클리어 보상 지급':'실전 · 클리어 보상 미설정'):feature.mode==='OFF'?'현재 디펜스 입장이 중지돼 있습니다.':'OWNER와 지정 테스트 계정만 입장할 수 있습니다.';buildDifficulties();
    }catch(e){state.access=false;$('access-status').textContent=e.message;}
    document.querySelectorAll('.review-tag').forEach(el=>el.textContent=state.feature?.mode==='ON'?'LIVE':state.feature?.mode||'OFF');
    renderEntry();buildLoadout();
    if(!state.access)return;
  }
  try{await refreshRoster();if(LIVE){try{const saved=JSON.parse(localStorage.getItem('cnine_defense_loadout_v1:'+state.feature.user.id)||'null');if(saved)state.loadout=defenseSelection(saved);}catch{}if(!completeLoadout())state.loadout=emptyDefenseLoadout();}buildLoadout();updateEntryButtons();}
  catch(error){toast(error.message);}
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.token && saved?.playerId && saved?.roomId&&(!LIVE||String(saved.playerId)===String(state.feature.user.id))) {
      state.session = saved;
      const snapshot = await request('state'); receive(snapshot); schedulePoll();
    }
    else if(LIVE){try{const session=await request('session',{method:'POST',body:{}});state.session={token:session.token,expires:session.expires,roomId:session.roomId,playerId:session.playerId};rememberSession();receive(session.snapshot);schedulePoll();}catch(e){if(e.status!==404)throw e;}}
  } catch (error) {
    if (error.status === 401 || !state.session) { state.session = null; rememberSession(); }
    else { state.stopped = true; toast('서버 연결을 확인한 뒤 진행 중인 전투로 돌아가기를 눌러 주세요.'); }
    showScreen('lobby');
  }
  window.CoopDefenseReview = { diagnostics: () => ({ screen: state.screen, roomId: state.session?.roomId, playerId: state.session?.playerId,
    phase: state.snapshot?.phase, wave: state.snapshot?.wave, units: state.snapshot?.units.length, capacity: state.snapshot?.capacity,
    focus: state.focus, selected: state.selected, engine: state.engine?.diagnostics(), connected: state.failures === 0,roster:{mercenaries:state.options?.mercenaries.length,cards:state.options?.cards.length,loadout:state.loadout} }),
    snapshot: () => state.snapshot ? structuredClone(state.snapshot) : null };
}
main().catch(error => { console.error(error); toast(error.message); });

function buildDifficulties(){
 const list=$('difficulty-list');list.replaceChildren();
 for(const d of DEFENSE_DIFFICULTIES){
  const button=document.createElement('button');button.type='button';button.dataset.difficulty=d.id;button.className='difficulty-option';button.style.setProperty('--difficulty-color',d.accent);
  button.setAttribute('aria-pressed',String(state.difficulty===d.id));button.setAttribute('aria-label',d.name+' 난이도');
  const name=document.createElement('b'),risk=document.createElement('span');name.textContent=d.name;risk.className='difficulty-marks';risk.setAttribute('aria-hidden','true');for(let i=0;i<5;i++){const mark=document.createElement('i');mark.className=i<=DEFENSE_DIFFICULTIES.indexOf(d)?'is-lit':'';risk.append(mark);}button.append(name,risk);button.disabled=state.feature?.difficulties.find(x=>x.id===d.id)?.enabled===false;
  button.onclick=()=>{state.difficulty=d.id;buildDifficulties();};list.append(button);
 }
 const selected=defenseDifficulty(state.difficulty),boss=defenseEnemy(selected.boss),mid=defenseEnemy(selected.midBoss);
 const reward=state.feature?.difficulties.find(d=>d.id===state.difficulty)?.clearReward;
 const lines=rewardLines(reward);$('clear-reward-preview').textContent=state.feature?.mode!=='ON'?'TEST · 계정 보상 없음':!state.feature?.rewardsEnabled||!lines.length?'이 난이도에 설정된 클리어 보상이 없습니다.':selected.name+' 클리어 · 참가자마다 '+lines.map(l=>l.text).join(' / ');
 $('mission-waves').textContent=state.feature?.growth?.waves||selected.waves;$('difficulty-title').textContent=selected.subtitle;
 $('boss-preview').src='/'+boss.asset;$('boss-preview').alt=boss.name;$('boss-preview-name').textContent=boss.name;$('boss-preview-hint').textContent=boss.hint;
 $('mid-boss-name').textContent=`10W마다 ${mid.name} · 최종 ${state.feature?.growth?.waves||selected.waves}W`;
 $('enemy-lineup').replaceChildren();
 for(const id of [...selected.pool,selected.elite,'CRAWLER']){const e=defenseEnemy(id),item=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src='/'+e.asset;img.alt=e.name;img.loading='lazy';caption.textContent=e.name;item.append(img,caption);$('enemy-lineup').append(item);}
}
