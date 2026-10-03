import {lichCoopInputState} from './clock.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={SEAL:'봉인',SHATTER:'파쇄',TRANSFER:'전이',RESCUE:'구출',CLEANSE:'정화',INTERRUPT:'차단',STRIKE:'공격',BURST:'결전',HEAL:'회복',REVIVE:'부활'};
const sigil=name=>`<svg viewBox="0 0 32 32" aria-hidden="true">${name==='달'?'<path d="M23 4a13 13 0 1 0 5 23A14 14 0 0 1 23 4Z"/>':name==='가시'?'<path d="m16 3 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z"/><path d="m7 7 18 18M25 7 7 25"/>':'<path d="m4 10 6 6 6-12 6 12 6-6-3 16H7Z"/><path d="M8 22h16"/>'}</svg>`;
// Keep the actual input nodes across party updates. Another player's seal,
// damage or shared resource update must not detach a held pointer/focused key.
function syncButtons(parent,actions,support=false){
  const old=new Map([...parent.children].map(n=>[n.dataset.controlKey,n])),keep=new Set();
  for(const a of actions)for(const target of a.choices||[a.target||'']){
    const key=a.key+':'+target;keep.add(key);let button=old.get(key);
    if(!button){
      button=document.createElement('button');button.type='button';button.dataset.controlKey=key;
      button.className='lk-action lk-coop-key'+(a.choices?' is-sigil':'');
      button.innerHTML=(a.choices?sigil(target):'')+'<span></span>';parent.appendChild(button);
    }
    const text=a.choices?target:(support?a.label:label[a.action])+(a.count===undefined?'':' · '+a.count);
    button.dataset.action=a.action;button.dataset.stepToken=a.token;button.dataset.target=target;
    button.setAttribute('aria-label',a.label+' · '+text);button.querySelector('span').textContent=text;
  }
  for(const [key,node]of old)if(!keep.has(key))node.remove();
}
function syncTasks(o,actions,mechanic){
  const root=o.node('targets');root.className='lk-coop-field';
  const old=new Map([...root.querySelectorAll('[data-task]')].map(n=>[n.dataset.task,n])),keep=new Set();
  const tasks=actions.filter(a=>!['HEAL','REVIVE'].includes(a.action));
  for(const a of tasks){
    keep.add(a.key);let card=old.get(a.key);
    if(!card){
      card=document.createElement('article');card.className='lk-coop-task';card.dataset.task=a.key;card.dataset.kind=a.action;
      card.innerHTML='<header><b></b><strong data-task-clock></strong></header><div data-task-runes></div><p></p><div class="lk-coop-keys"></div>';
      root.appendChild(card);
    }
    card.querySelector('header b').textContent=a.label;card.querySelector('[data-task-clock]').dataset.taskClock=a.key;
    const draft=o.sealInputs.get(a.token)||[],entered=a.index+draft.length;
    card.querySelector('p').textContent=draft.length?'선택 '+entered+' / 3 · '+draft.join(' → '):a.action==='SEAL'&&!a.blocked?a.note+' · 남은 '+(3-a.index)+'개 연속 입력':a.note;
    const runes=card.querySelector('[data-task-runes]'),runeKey=JSON.stringify([a.sequence,a.reverse,a.rune]);
    if(runes.dataset.key!==runeKey){
      runes.dataset.key=runeKey;
      runes.innerHTML=a.sequence?`<div class="lk-coop-sequence">${a.sequence.map((r,i)=>`<span data-sequence-index="${i}">${esc(r)}</span>`).join('<i>›</i>')}<em>${a.reverse?'← 역순':'순서 →'}</em></div>`:a.rune?`<div class="lk-coop-rune">내 문양 <b>${esc(a.rune)}</b></div>`:'';
    }
    for(const node of runes.querySelectorAll('[data-sequence-index]')){
      const index=a.reverse?2-Number(node.dataset.sequenceIndex):Number(node.dataset.sequenceIndex);
      node.classList.toggle('done',index<a.index);node.classList.toggle('entered',index>=a.index&&index<entered);node.classList.toggle('current',index===entered);
    }
    syncButtons(card.querySelector('.lk-coop-keys'),[a]);
  }
  for(const [key,node]of old)if(!keep.has(key))node.remove();
  let waiting=root.querySelector('.lk-coop-wait');
  if(tasks.length)waiting?.remove();
  else{
    if(!waiting){waiting=document.createElement('div');waiting.className='lk-coop-wait';root.appendChild(waiting);}
    waiting.textContent=mechanic?'내 작전 완료 · 동료의 진행을 확인하세요':o.state.step==='READY'?'전장 집결 중':o.state.step==='TRANSITION'?'다음 담당과 문양이 다시 배정됩니다':'';
  }
  syncButtons(o.node('support'),actions.filter(a=>['HEAL','REVIVE'].includes(a.action)),true);
}
export function renderCoop(o,c){
  const s=o.state,mechanic=s.status==='ACTIVE'&&s.step==='MECHANIC',exposed=s.status==='ACTIVE'&&s.step==='EXPOSED';
  const who=id=>s.members.find(m=>m.id===id)?.name||'담당 대기';
  o.element.dataset.coop='true';o.element.dataset.step=s.step;o.element.dataset.prison=String(c.prison);
  o.node('order-caption').textContent=`COOPERATIVE RAID · ${s.round} / 7`;
  o.node('order-title').textContent=s.status==='CLEAR'?'왕좌가 무너졌다':s.status==='FAILED'?'공대 전멸':s.step==='READY'?'개인 작전 배정':s.step==='TRANSITION'?'다음 작전으로':exposed?'전원, 결전 개시':!c.sealed?'흩어진 봉인을 연결하라':!c.breathResolved?'감옥을 지켜라':!c.prisonBroken?'지금 사슬을 끊어라':'죽음의 연쇄를 끊어라';
  o.node('order-help').textContent=exposed?'개인 편성으로 공격 · 반격은 공격한 편성에 적용':mechanic?'봉인 연결 → 사슬 파쇄 → 역병·영혼 해방':'같은 역할도 자신의 문양과 담당을 확인하세요';
  o.node('role-hint').textContent=mechanic?`차단 ${who(c.interruptOwner)} · 역병 ${who(c.plagueOwner)} · 정화 ${who(c.curseOwner)}`:exposed?s.combatRevision===2?'모두 연속 공격 · 결전 피해 한도 1.8배 · 개인 2회':'결전은 개인 2회 · 공대 체력은 다음 작전까지 유지':'';
  o.node('cast').hidden=true;o.node('seals').innerHTML='';
  const actions=s.controls||[];
  syncTasks(o,actions,mechanic);
  const hp=s.partyFighters||s.fighters,total=hp.reduce((n,f)=>n+f.maxHp,0),current=hp.reduce((n,f)=>n+f.hp,0);
  o.node('doom').innerHTML=`잔재 <b>${s.doom}/3</b>`;
  o.node('souls').innerHTML=`공대 체력 <b>${total?Math.ceil(current/total*100):0}%</b> · 영혼 ${s.souls}`;
  const seals=c.seals||[],chains=c.chains||[],rescues=c.rescues||[];
  o.node('objectives').innerHTML=mechanic?[
    [c.sealed,`개인 봉인 ${seals.filter(t=>t.index===3).length}/${seals.length}`],
    [c.prisonBroken,`사슬 파쇄 ${chains.filter(t=>t.broken).length}/${chains.length}`],
    [!c.plague,'역병 전이'],[rescues.every(t=>t.done),`영혼 ${rescues.filter(t=>t.done).length}/${rescues.length}`],
    [c.interrupted,'담당 차단'],[c.curseDone,'저주 정화']
  ].map(([done,text])=>`<span class="${done?'done':''}">${text}</span>`).join(''):'';
  const mark=o.node('host-mark');mark.hidden=!mechanic||!c.prison;
  if(!mark.hidden){mark.className='lk-host-mark is-remote';mark.innerHTML=`<strong>${esc(c.targetName)}</strong><span>${c.breathResolved?'절대영도 흡수 · 사슬 파쇄':'서리 감옥 · 엄폐 유지'}</span><b data-breath-clock></b>`;}
  const actor=o.engine.combatantById(c.targetId);o.world.visible=mechanic&&Boolean(actor)&&Boolean(c.prison);
  o.halo.clear();
  if(o.world.visible){
    const color=c.breathResolved?0xf6c779:0x9be7ff;
    o.halo.ellipse(0,0,86,28).stroke({color,width:3,alpha:.8});
    for(let i=0;i<3;i++){const x=(i-1)*42;o.halo.moveTo(x,-110).lineTo(x+12,-75).lineTo(x,-40).lineTo(x+12,0).stroke({color,width:3,alpha:.7});}
  }
  o.applyPending();o.layout();
}
export function tickCoop(o,c,now){
  const s=o.state;
  o.node('enrage').textContent=new Date(Math.max(0,s.endsAt-Math.max(now,s.startedAt))).toISOString().slice(14,19);
  o.node('window').innerHTML=`${s.step==='EXPOSED'?'공격':'작전'} <b>${Math.max(0,Math.ceil((c.deadline-now)/1000))}s</b>`;
  for(const a of s.controls||[]){
    const input=lichCoopInputState(s,c,a,now,o.isPending(a.token));
    const card=[...o.element.querySelectorAll('[data-task]')].find(n=>n.dataset.task===a.key);
    const clock=card?.querySelector('[data-task-clock]');
    const sealedInput=a.action==='SEAL'&&(o.sealInputs.get(a.token)?.length||0)>=3-a.index;
    if(clock)clock.textContent=sealedInput&&!input.expired&&!input.blocked?'3 / 3 입력 완료':input.clock;
    if(card){card.dataset.waiting=String(input.waiting||input.blocked);card.dataset.urgent=String(input.ready&&a.deadline>now&&a.deadline-now<4000);}
    for(const b of o.element.querySelectorAll('[data-step-token]'))if(b.dataset.stepToken===a.token)b.disabled=!input.ready||sealedInput;
  }
  const breath=o.element.querySelector('[data-breath-clock]');
  if(breath)breath.textContent=Math.max(0,Math.ceil(((c.breathResolved?c.breathAt+6000:c.breathAt)-now)/1000))+'s';
}
