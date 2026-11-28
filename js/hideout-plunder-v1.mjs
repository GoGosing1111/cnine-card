import {PIG_COIN_IMAGE} from '../shared/loot-shop-policy-v1.mjs';
import {RAID_VICTORY_ITEMS,RAID_VICTORY_PIG_COINS} from '../shared/hideout-defense-v1.mjs';
import {HIDEOUT_PARTS, HIDEOUT_STAGES, HIDEOUT_FURNITURE, HIDEOUT_DECOR} from '../shared/personal-hideout-v1.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const team = side => side === 'A' ? '청팀' : '홍팀';
const number = value => Number(value).toLocaleString('ko-KR');
const partName = code => HIDEOUT_PARTS.find(p => p.code === code)?.name || code;
const spoils = loot => Object.entries(loot || {}).map(([code, qty]) => partName(code) + ' ' + qty + '개').join(' · ') || '획득 부품 없음';
const time = ms => new Date(ms).toLocaleTimeString('ko-KR', {timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', hour12:false});
const gauge = (hp, max) => '<meter aria-label="은신처 내구도" min="0" max="'+max+'" value="'+hp+'"></meter>';

function victoryItems(reward){
  if(!reward)return '';
  const goods=[...reward.items,{name:'피그코인',image:PIG_COIN_IMAGE,quantity:reward.pigCoins}];
  return '<div class="ph-raid-victory"><h4>승리 보상 <span>'+esc(reward.name)+' 획득</span></h4><ul>'+
    goods.map(g=>'<li><img src="'+esc(g.image)+'" alt=""><span>'+esc(g.name)+'</span><b>'+number(g.quantity)+'개</b></li>').join('')+'</ul></div>';
}
function roomName(layout){return layout?.rooms?.find(r=>r.code===layout.defenseRoom)?.name||'';}
function savedLayout(layout,expanded){
  if(!layout?.rooms)return '';
  const label=code=>[...HIDEOUT_FURNITURE,...HIDEOUT_DECOR].find(f=>f.code===code)?.name||code;
  return '<details class="ph-raid-layout" '+(expanded?'open':'')+'><summary>전투 당시 저장 배치</summary>'+
    layout.rooms.map(r=>'<div><b>'+esc(r.name)+(r.code===layout.defenseRoom?' · 방어 구역':'')+'</b><span>'+
      (layout.pieces.filter(p=>p.room===r.code).map(p=>esc(label(p.code))).join(' · ')||'배치한 가구 없음')+'</span></div>').join('')+'</details>';
}

export function openPlunder({request, uid, onClose}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ph-raid-dialog';
  dialog.setAttribute('aria-labelledby', 'ph-raid-title');
  dialog.innerHTML = '<header class="ph-raid-hero"><div><small>20:30–22:00 KST</small><h2 id="ph-raid-title">은신처 약탈전</h2></div><button type="button" class="ph-button" data-raid="close">닫기</button></header><div class="ph-raid-content"></div><p class="ph-raid-notice" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  dialog.showModal();
  const content = dialog.querySelector('.ph-raid-content'), notice = dialog.querySelector('.ph-raid-notice');
  const storageKey = 'cnine-hideout-raid-pending:'+uid;
  let state, job, last, timer, battleModal, closed = false, busy = false, refreshSeq = 0, offset = 0;
  const listeners = new AbortController(), seenRewards=new Set();
  function syncWinnings(events){
    const fresh=events.filter(e=>Number(e.victoryReward?.userId)===Number(uid)).map(e=>JSON.stringify([e.at,e.attacker,e.defender]));
    if(!fresh.some(k=>!seenRewards.has(k)))return;
    fresh.forEach(k=>seenRewards.add(k));
    globalThis.dispatchEvent(new CustomEvent('cnine:account-sync',{detail:{domains:['inventory','wallet']}}));
    globalThis.dispatchEvent(new CustomEvent('cnine:player-updated',{detail:{source:'hideout-plunder'}}));
  }
  try { job = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch {}
  function saveJob(next) {
    job = next;
    try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey); } catch {}
  }
  const btn = (action, label, disabled = false, target = '') =>
    '<button type="button" class="ph-button" data-raid="'+action+'" data-target="'+target+'" '+(disabled || busy ? 'disabled' : '')+'>'+esc(label)+'</button>';
  function closeBattle() {
    if (!battleModal) return;
    battleModal.__battleV2Renderer?.destroy?.();
    battleModal.remove();
    battleModal = null;
  }
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    listeners.abort();
    closeBattle();
    dialog.close();
    dialog.remove();
    onClose();
  }
  function render() {
    if (!state || closed) return;
    const {window: session, rules, mine, counts, score, durability} = state;
    const now = Date.now()+offset;
    const open = session.open && now < session.endsAt;
    const finished = now >= session.endsAt;
    const resultTitle = last?.winner === 'A' ? '약탈 성공' : last?.winner === 'B' ? '방어군 승리' : '무승부';
    const standings = finished && counts.A ? (score.A === score.B ? '무승부' : team(score.A > score.B ? 'A' : 'B')+' 승리') : '';
    const canAttack = open && mine?.team && mine.durability > 0 && now >= mine.readyAt && !job;
    const targets = (state.enemies || []).map(p => {
      const stage = HIDEOUT_STAGES[p.level-1];
      const wait = Math.ceil((p.protectedUntil-now)/1000);
      const label = !p.durability ? '함락' : wait > 0 ? '보호 중 '+wait+'초' : '침입';
      return '<li class="ph-raid-target"><img src="'+esc(stage.image)+'" alt="" loading="lazy"><div><strong>'+esc(p.name)+'</strong><span>'+esc(stage.name)+' · 내구도 '+p.durability+'</span></div>'+btn('attack',label,!canAttack || !p.durability || wait>0,p.id)+'</li>';
    }).join('');
    const lost = rules.materials.map(partName).join('·');
    const history = state.history.slice(0,8).map(e => '<li><time>'+time(e.at)+'</time> '+esc(e.attacker)+' → '+esc(e.defender)+' · '+(e.winner==='A'?'약탈 성공':e.winner==='B'?'방어 성공':'무승부')+
      '<small>내구도 '+e.before+' → '+e.after+' · '+esc(spoils(e.loot))+'</small>'+(e.victoryReward?'<small>'+esc(e.victoryReward.name)+' 승리 보상 · '+esc(e.victoryReward.items.map(i=>i.name+' '+i.quantity+'개').join(' · '))+' · 피그코인 '+number(e.victoryReward.pigCoins)+'개</small>':'')+'</li>').join('');
    const expanded=content.querySelector('.ph-raid-layout')?.open;
    content.innerHTML =
      '<div class="ph-raid-summary"><strong>'+(open?'교전 중':finished?'오늘 교전 종료':'교전 준비')+'</strong><span>청팀 '+counts.A+'명 · 홍팀 '+counts.B+'명 · 대기 '+counts.waiting+'명</span><b>청 '+score.A+' 점 / 홍 '+score.B+' 점 '+esc(standings)+'</b></div>'+
      '<section><h3>내 은신처</h3><div class="ph-raid-durability">'+gauge(durability,rules.maxDurability)+'<strong>내구도 '+durability+' / '+rules.maxDurability+'</strong></div>'+
      (open ? (mine ? '<p>'+(mine.team?team(mine.team)+' 소속 · '+(!durability?'은신처 함락':now<mine.readyAt?'재출격까지 '+Math.ceil((mine.readyAt-now)/1000)+'초':'출격 가능'):'상대 참가자를 기다리고 있습니다. 두 명이 모이면 양 진영에 배정됩니다.')+'</p>' :
        '<p>참가하면 오늘 22시까지 내 은신처도 공격 대상이 됩니다. 방어에 실패하면 내구도와 보관 중인 부품을 잃습니다.</p>'+btn('join','오늘 약탈전 참가',!state.level || !durability || !!job)) :
        '<p>회수 철판 '+rules.repairSteel+'개와 구리 배선 '+rules.repairWire+'개로 내구도를 '+rules.repairPoints+' 회복합니다.</p>'+btn('repair','은신처 수리',!state.level || durability>=rules.maxDurability || !state.repairAvailable || !!job))+'</section>'+
      '<p class="ph-raid-rule">승리한 공격자 또는 방어자는 '+esc(RAID_VICTORY_ITEMS.map(i=>i.name+' '+i.quantity+'개').join(', '))+', 피그코인 '+RAID_VICTORY_PIG_COINS+'개를 받고 팀 점수 1점을 얻습니다. 공격에 성공하면 상대 내구도가 '+rules.damage+' 감소합니다. '+esc(lost)+' 보유량의 '+rules.lootPercent+'%를 올림해 종류당 최대 '+rules.lootLimit+'개까지 가져옵니다. 재출격 '+rules.cooldownMs/60000+'분 · 약탈당한 은신처 보호 '+rules.protectionMs/60000+'분.</p>'+
      (job?'<div class="ph-recovery"><p>처리 결과를 확인할 요청이 있습니다.</p>'+btn('retry','같은 요청 결과 확인')+'</div>':'')+
      (last?'<article class="ph-raid-result"><h3>'+resultTitle+'</h3><p>'+esc(last.defender)+'의 '+esc(HIDEOUT_STAGES.find(s=>s.code===last.stage)?.name)+(roomName(last.residenceLayout)?' / '+esc(roomName(last.residenceLayout)):'')+' · 내구도 '+last.before+' → '+last.after+'</p><p class="ph-raid-spoils"><b>약탈품</b> '+esc(spoils(last.loot))+'</p>'+victoryItems(last.victoryReward)+savedLayout(last.residenceLayout,expanded)+(last.battleV2?btn('replay','전투 다시 보기'):'')+'</article>':'')+
      (open && mine?.team?'<section><h3>상대 은신처</h3><ul class="ph-raid-targets">'+(targets || '<li>상대 진영 배정 대기 중</li>')+'</ul></section>':'')+
      (history?'<section><h3>최근 교전</h3><ul class="ph-raid-log">'+history+'</ul></section>':'');
  }
  function schedule() {
    clearTimeout(timer);
    if (closed || document.hidden || battleModal || busy) return;
    const session = state?.window, now = Date.now()+offset;
    const boundary = session?.open ? session.endsAt : session?.nextStart;
    const interval = session?.open ? 6000 : 30000;
    timer = setTimeout(refresh, boundary > now ? Math.min(interval, Math.max(250, boundary-now+50)) : interval);
  }
  async function refresh() {
    if (closed || busy || document.hidden) return;
    const seq = ++refreshSeq;
    try {
      const next = await request('hideout/raid');
      if (closed || seq !== refreshSeq) return;
      state = next; offset = next.now-Date.now(); render(); syncWinnings(next.history);
    } catch (e) {
      if (!closed && seq === refreshSeq) {
        notice.textContent = e.message;
        if (!state) content.innerHTML = btn('refresh', '전황 다시 불러오기');
      }
    } finally { if (seq === refreshSeq) schedule(); }
  }
  async function play(result) {
    await globalThis.ensureFeatureResources('battleV2');
    if (closed || battleModal) return;
    const modal = document.createElement('div');
    dialog.append(modal); battleModal = modal;
    const done = document.createElement('button');
    done.type = 'button'; done.className = 'ph-button ph-raid-battle-close'; done.textContent = '전황으로';
    const loading = globalThis.prepareBattleV2LiveLoading({modal,mode:'SIEGE',playerName:result.attacker,opponentName:result.defender,autoText:'상대 은신처에서 교전합니다.'});
    loading.stage.querySelector('.battle-v3-header strong')?.replaceChildren(document.createTextNode(result.defender+'의 은신처'+(roomName(result.residenceLayout)?' · '+roomName(result.residenceLayout):'')));
    dialog.append(done);
    done.onclick = () => { done.remove(); closeBattle(); schedule(); };
    try {
      const data = {...result, result:result.winner==='A'?'WIN':result.winner==='B'?'LOSE':'DRAW', mode:'SIEGE', battlefieldMode:'SIEGE', sceneAssetKey:'PERSONAL_HIDEOUT_RAID', hideoutStage:result.stage};
      const renderer = await globalThis.ProjectVBattleV3Live.createRenderer({...loading, modal, data, mode:'SIEGE', playerName:result.attacker, opponentName:result.defender});
      if (closed || battleModal !== modal) { renderer.destroy(); return; }
      modal.__battleV2Renderer = renderer;
      const played = await renderer.play();
      if (closed || battleModal !== modal) return;
      if (!played) throw Error('전투 연출을 완료하지 못했습니다.');
      renderer.showResult();
      done.textContent = '결과 확인'; done.focus();
    } catch (e) {
      done.remove();
      if (battleModal === modal) {
        closeBattle();
        if (!closed) notice.textContent = '교전 정산 완료 · 전투 연출을 다시 볼 수 있습니다.';
      }
    }
  }
  async function act(action, targetId) {
    if (!state || busy || closed) return;
    if (!job && action==='join' && !confirm('오늘 22시까지 참가합니다. 방어에 실패하면 내 은신처 내구도와 보관 부품이 감소합니다. 참가할까요?')) return;
    if (!job) saveJob({action, body:{day:state.window.day,requestId:crypto.randomUUID(),...(action==='attack'?{targetId}:{})}});
    const task = job;
    clearTimeout(timer); ++refreshSeq; busy = true; render();
    try {
      const result = await request('hideout/raid/'+task.action,task.body);
      saveJob(null);
      if (closed) return;
      notice.textContent = task.action==='repair'?'은신처를 수리했습니다.':task.action==='join'?'오늘 참가 등록을 마쳤습니다.':'교전 결과를 정산했습니다.';
      if (task.action==='attack') { last=result; syncWinnings([result]); render(); if (result.battleV2) await play(result); }
    } catch (e) {
      if (e.status>=400 && e.status<500) saveJob(null);
      if (!closed) notice.textContent=e.message;
    } finally { busy=false; if (!closed) {render(); await refresh();} }
  }
  dialog.addEventListener('click', e => {
    const button = e.target.closest('[data-raid]');
    if (!button || button.disabled) return;
    const action = button.dataset.raid;
    if (action==='close') return close();
    if (action==='refresh') return refresh();
    if (action==='replay' && last) { clearTimeout(timer); void play(last).catch(e=>{notice.textContent=e.message; schedule();}); return; }
    if (action==='retry' && !job) return;
    void act(action, Number(button.dataset.target));
  }, {signal:listeners.signal});
  dialog.addEventListener('cancel', e=>{e.preventDefault(); close();},{signal:listeners.signal});
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer); if (!document.hidden && !battleModal) void refresh();},{signal:listeners.signal});
  content.textContent = '전황을 불러오는 중…';
  void refresh();
  return {close};
}
