import {clockText, renderConfirmation, renderEntry, renderPrep, renderResult, renderRules, renderToolbar, roomName, sessionOpen, teamReady} from './hideout-plunder-view.mjs?v=20261128-turret-hp3';

export function openPlunder({request, uid, onClose}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ph-raid-dialog';
  dialog.setAttribute('aria-label','은신처 약탈전');
  dialog.innerHTML = '<div class="ph-raid-shell"><div class="raid-top"></div><div class="ph-raid-content" aria-busy="true">전황을 불러오는 중…</div><div class="ph-raid-recovery"></div><p class="ph-raid-notice" role="status" aria-live="polite"></p></div>';
  const content=dialog.querySelector('.ph-raid-content'), top=dialog.querySelector('.raid-top');
  const recovery=dialog.querySelector('.ph-raid-recovery'), notice=dialog.querySelector('.ph-raid-notice');
  const storageKey='cnine-hideout-raid-pending:'+uid, listeners=new AbortController(), seenRewards=new Set();
  let state, job, result, lastFight, playing, selectedId, battleModal, battleExit, prompt, poll, clock;
  let busy=false, closed=false, rules=false, sequence=0, offset=0, phase='', lastHTML='', lastBar='', boundary=Infinity;
  top.innerHTML=renderToolbar('entry',false);
  top.querySelector('[data-raid="rules"]').disabled=true;
  document.body.append(dialog);
  dialog.showModal();

  try {job=JSON.parse(sessionStorage.getItem(storageKey) || 'null');} catch {}
  function saveJob(next) {
    job=next;
    try {
      if (next) sessionStorage.setItem(storageKey,JSON.stringify(next));
      else sessionStorage.removeItem(storageKey);
    } catch {}
  }
  function syncWinnings(events) {
    const fresh=events.filter(e=>Number(e.victoryReward?.userId)===Number(uid)).map(e=>JSON.stringify([e.at,e.attacker,e.defender]));
    if (!fresh.some(k=>!seenRewards.has(k))) return;
    fresh.forEach(k=>seenRewards.add(k));
    globalThis.dispatchEvent(new CustomEvent('cnine:account-sync',{detail:{domains:['inventory','wallet']}}));
    globalThis.dispatchEvent(new CustomEvent('cnine:player-updated',{detail:{source:'hideout-plunder'}}));
  }
  function dismissPrompt() {
    if (!prompt) return;
    prompt.close(); prompt.remove(); prompt=null;
  }
  function stopBattle() {
    if (!battleModal) return;
    const modal=battleModal;
    battleModal=null;
    dialog.querySelector('.ph-raid-shell').inert=false;
    battleExit?.remove(); battleExit=null;
    modal.__battleV2Renderer?.destroy?.();
    modal.remove();
    if (!closed) {
      result=playing;
      render();
      dialog.querySelector('#ph-raid-title')?.focus({preventScroll:true});
      schedule();
    }
  }
  function close() {
    if (closed) return;
    closed=true; ++sequence;
    clearTimeout(poll); clearInterval(clock); listeners.abort();
    dismissPrompt(); stopBattle(); dialog.close(); dialog.remove(); onClose?.();
  }
  function tick() {
    if (closed || document.hidden || battleModal || !state) return;
    const now=Date.now()+offset;
    if (now>=boundary) {render(); return;}
    for (const el of content.querySelectorAll('[data-until]')) {
      const txt=clockText(Math.max(0, Math.ceil((Number(el.dataset.until)-now)/1000)));
      if (el.textContent!==txt) el.textContent=txt;
    }
  }
  function render() {
    if (!state || closed) return;
    const now=Date.now()+offset, open=sessionOpen(state,now);
    const nextPhase=result?'result':open&&state.mine?(state.mine.team?'prep':'waiting'):'entry';
    const changed=phase!==nextPhase;
    const focus=dialog.contains(document.activeElement)?document.activeElement:null;
    const key=focus?.dataset.raid, target=focus?.dataset.target;
    const memo=changed?[]:[...content.querySelectorAll('details[open][data-memory]')].map(d=>d.dataset.memory);
    const focusedSummary=focus?.closest('details')?.dataset.memory;
    const oldRoster=content.querySelector('.ph-raid-targets');
    const rosterTop=oldRoster?.scrollTop || 0, rosterLeft=oldRoster?.scrollLeft || 0;
    const scroll=dialog.scrollTop;
    phase=nextPhase;
    if (phase==='prep' && !state.enemies.some(p=>p.id===selectedId)) {
      selectedId=state.scout?.targetId ?? state.enemies.find(p=>teamReady(p,now))?.id ?? state.enemies[0]?.id;
    }
    const blocked=busy || !!job;
    const bar=renderToolbar(phase,rules)+(rules?renderRules(state.rules):'');
    if (lastBar!==bar) {top.innerHTML=bar;lastBar=bar;}
    const markup=phase==='result'?renderResult(result):phase==='prep'?renderPrep(state,selectedId,now,blocked):renderEntry(state,now,blocked);
    if (markup!==lastHTML) {
      content.innerHTML=markup; lastHTML=markup;
      for (const d of content.querySelectorAll('details[data-memory]')) d.open=memo.includes(d.dataset.memory);
      const roster=content.querySelector('.ph-raid-targets');
      if (roster && !changed) {roster.scrollTop=rosterTop;roster.scrollLeft=rosterLeft;}
    }
    content.setAttribute('aria-busy',String(busy));
    recovery.innerHTML=job&&!busy?'<div><span>처리 결과를 확인할 요청이 있습니다.</span><button type="button" class="ph-raid-btn" data-raid="retry">같은 요청 결과 확인</button></div>':'';
    if (changed) {
      dialog.scrollTop=0;
      if (!prompt && !battleModal) content.querySelector('h2')?.focus({preventScroll:true});
    } else {
      if (!prompt && !battleModal && focus && !focus.isConnected) {
        const replacement=focusedSummary?content.querySelector(`details[data-memory="${focusedSummary}"] summary`):
          [...dialog.querySelectorAll('[data-raid]')].find(b=>b.dataset.raid===key && b.dataset.target===target);
        replacement?.focus({preventScroll:true});
      }
      dialog.scrollTop=scroll;
    }
    boundary=Math.min(Infinity,...[state.window.endsAt,state.mine?.readyAt,...(state.enemies||[]).map(p=>p.protectedUntil)].filter(t=>t>now));
    tick();
  }
  function schedule() {
    clearTimeout(poll);
    if (closed || document.hidden || battleModal || busy) return;
    const w=state?.window, now=Date.now()+offset, edge=w?.open?w.endsAt:w?.nextStart;
    const delay=w?.open?6000:30000;
    poll=setTimeout(refresh,edge>now?Math.min(delay, Math.max(250,edge-now+30)):delay);
  }
  async function refresh() {
    if (closed || busy || battleModal || document.hidden) return;
    const seq=++sequence;
    try {
      const next=await request('hideout/raid'+(selectedId?'?target='+encodeURIComponent(selectedId):''));
      if (closed || seq!==sequence) return;
      if (state && state.window.day!==next.window.day) {result=null;lastFight=null;selectedId=undefined;}
      state=next; offset=next.now-Date.now();
      if (!sessionOpen(state,next.now)) dismissPrompt();
      if (notice.dataset.source==='refresh') {notice.textContent='';delete notice.dataset.source;}
      render(); syncWinnings(next.history || []);
    } catch (e) {
      if (!closed && seq===sequence) {
        notice.textContent=e.message; notice.dataset.source='refresh';
        if (!state) {
          top.innerHTML='<header class="ph-raid-bar"><strong>은신처 약탈전</strong><button class="ph-raid-close" type="button" aria-label="약탈전 닫기" data-raid="close">×</button></header>';
          content.innerHTML='<button type="button" class="ph-raid-btn" data-raid="refresh">전황 다시 불러오기</button>';
          content.removeAttribute('aria-busy');
        }
      }
    } finally {if (seq===sequence) schedule();}
  }
  function confirmJoin() {
    if (prompt || busy || job || state.mine || !sessionOpen(state,Date.now()+offset)) return;
    prompt=document.createElement('dialog');
    prompt.className='ph-raid-prompt';
    prompt.setAttribute('aria-labelledby','ph-raid-question');
    prompt.innerHTML=renderConfirmation(state,busy);
    prompt.addEventListener('cancel',e=>{e.preventDefault();e.stopPropagation();dismissPrompt();});
    dialog.append(prompt); prompt.showModal();
    prompt.querySelector('h3').focus();
  }
  async function play(e) {
    if (closed || battleModal || !e?.battleV2) return;
    clearTimeout(poll);
    const modal=document.createElement('div'), done=document.createElement('button');
    playing=e; battleModal=modal; battleExit=done;
    dialog.querySelector('.ph-raid-shell').inert=true;
    modal.className='ph-raid-playback-loading';
    modal.innerHTML='<span role="status">전투 장면을 불러오는 중…</span>';
    done.type='button'; done.className='ph-raid-btn ph-raid-battle-close'; done.textContent='결과 보기';
    done.onclick=stopBattle;
    dialog.append(modal,done); done.focus({preventScroll:true});
    try {
      await globalThis.ensureFeatureResources('battleV2');
      if (battleModal!==modal) return;
      modal.className=''; modal.replaceChildren();
      const loading=globalThis.prepareBattleV2LiveLoading({modal,mode:'SIEGE',playerName:e.attacker,opponentName:e.defender,autoText:'상대 은신처에서 교전합니다.'});
      const room=roomName(e.residenceLayout);
      loading.stage.querySelector('.battle-v3-header strong')?.replaceChildren(document.createTextNode(e.defender+'의 은신처'+(room?' · '+room:'')));
      const data={...e,result:e.winner==='A'?'WIN':e.winner==='B'?'LOSE':'DRAW',mode:'SIEGE',battlefieldMode:'SIEGE',sceneAssetKey:'PERSONAL_HIDEOUT_RAID',hideoutStage:e.stage};
      const renderer=await globalThis.ProjectVBattleV3Live.createRenderer({...loading,modal,data,mode:'SIEGE',playerName:e.attacker,opponentName:e.defender});
      if (battleModal!==modal) {renderer.destroy();return;}
      modal.__battleV2Renderer=renderer;
      const played=await renderer.play();
      if (battleModal===modal && !played) throw Error('전투 연출 중단');
    } catch {
      if (!closed && battleModal===modal) notice.textContent='교전 정산이 완료되었습니다. 전투를 다시 볼 수 있습니다.';
    } finally {if (battleModal===modal) stopBattle();}
  }
  async function act(action,targetId) {
    if (!state || busy || closed || battleModal) return;
    if (action==='retry' && !job) return;
    if (!job) saveJob({action,body:{day:state.window.day,requestId:crypto.randomUUID(),...(action==='attack'?{targetId}:{})}});
    const task=job;
    clearTimeout(poll); ++sequence; busy=true;
    notice.textContent=''; delete notice.dataset.source; render();
    let playback, updated=false;
    try {
      const response=await request('hideout/raid/'+task.action,task.body);
      saveJob(null);
      if (closed) return;
      if (task.action==='attack') {
        lastFight=response; rules=false; syncWinnings([response]);
        if (response.battleV2) playback=response;
        else result=response;
      } else if (task.action==='repair') notice.textContent='은신처를 수리했습니다.';
      if (task.action==='join'||task.action==='repair') {
        state=await request('hideout/raid');
        offset=state.now-Date.now();
        updated=true;
        syncWinnings(state.history || []);
      }
    } catch (e) {
      if (e.status>=400 && e.status<500) saveJob(null);
      if (!closed) notice.textContent=e.message;
    } finally {
      busy=false;
      if (!closed) {
        render();
        if (playback) await play(playback);
        if (updated) schedule();
        else await refresh();
      }
    }
  }
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('[data-raid]');
    if (!b || b.disabled) return;
    const action=b.dataset.raid;
    if (action==='close') return close();
    if (action==='refresh') return void refresh();
    if (action==='cancel-join') return dismissPrompt();
    if (action==='confirm-join') {if (!prompt) return;dismissPrompt();return void act('join');}
    if (action==='join') return confirmJoin();
    if (action==='rules') {rules=!rules;render();return;}
    if (action==='select') {
      if (busy) return;
      selectedId=Number(b.dataset.target);render();void refresh();return;
    }
    if (action==='history') {
      const event=state.history[Number(b.dataset.target)];
      if (event) {
        const recorded=lastFight && lastFight.at===event.at && lastFight.attacker===event.attacker && lastFight.defender===event.defender;
        result=recorded?lastFight:event;rules=false;notice.textContent='';render();
      }
      return;
    }
    if (action==='back') {result=null;rules=false;notice.textContent='';render();void refresh();return;}
    if (action==='replay') return void play(result);
    if (action==='retry'||action==='repair'||action==='attack') void act(action,Number(b.dataset.target));
  },{signal:listeners.signal});
  dialog.addEventListener('cancel',e=>{e.preventDefault();if (battleModal) stopBattle();else if (rules) {rules=false;render();}else close();},{signal:listeners.signal});
  document.addEventListener('visibilitychange',()=>{clearTimeout(poll);if (!document.hidden && !battleModal) void refresh();},{signal:listeners.signal});
  clock=setInterval(tick,1000);
  void refresh();
  return {close};
}
