import {HIDEOUT_ART, HIDEOUT_DECOR, HIDEOUT_FURNITURE, HIDEOUT_PARTS, HIDEOUT_STAGES} from '../shared/personal-hideout-v1.mjs';
import {projectRaidPlacement, RAID_VICTORY_ITEMS, RAID_VICTORY_PIG_COINS} from '../shared/hideout-defense-v1.mjs';
import {PIG_COIN_IMAGE} from '../shared/loot-shop-policy-v1.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const n = value => Number(value || 0).toLocaleString('ko-KR');
const kst = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const time = value => kst.format(value);
const sideName = side => side === 'A' ? '청팀' : '홍팀';
const outcome = winner => winner === 'A' ? '약탈 성공' : winner === 'B' ? '방어군 승리' : '무승부';
const until = ms => `<time class="ph-raid-clock" data-until="${Number(ms)}"></time>`;
const stageFor = level => HIDEOUT_STAGES.find(s => s.level === level);
const partFor = code => HIDEOUT_PARTS.find(p => p.code === code);
const pieceFor = code => [...HIDEOUT_FURNITURE, ...HIDEOUT_DECOR].find(p => p.code === code)?.name || code;
const pill = (label, mood = '') => `<span class="ph-raid-status ${mood}"><i aria-hidden="true"></i>${label}</span>`;
const arrow = '<i class="ph-raid-arrow" aria-hidden="true"></i>';
const image = (src, alt = '') => `<img src="${esc(src)}" alt="${esc(alt)}" draggable="false">`;

export const roomName = layout => layout?.rooms?.find(r => r.code === layout.defenseRoom)?.name || '';
export const teamReady = (p, now) => p.durability > 0 && !(p.protectedUntil > now);
export const sessionOpen = (state, now) => state.window.open && now < state.window.endsAt;
export const clockText = seconds => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2,'0')}:${s}` : `${String(m).padStart(2,'0')}:${s}`;
};

function button(action, label, {primary=false, disabled=false, target, forward=false}={}) {
  return `<button type="button" class="ph-raid-btn${primary?' is-primary':''}" data-raid="${action}"${target==null?'':` data-target="${esc(target)}"`}${disabled?' disabled':''}>${label}${forward?arrow:''}</button>`;
}

function meter(hp, max) {
  return `<div class="ph-raid-meter" role="meter" aria-label="은신처 내구도" aria-valuemin="0" aria-valuemax="${Number(max)}" aria-valuenow="${Number(hp)}"><i style="width:${Math.max(0, Math.min(100, hp/max*100))}%"></i></div>`;
}

function goods(reward) {
  const items = [...(reward.items || []), {name:'피그코인', image:'/'+PIG_COIN_IMAGE, quantity:reward.pigCoins}].filter(i => i.quantity > 0);
  return `<ul class="ph-raid-goods">${items.map(i => `<li><div class="ph-raid-item-art">${image(i.image)}<b>×${n(i.quantity)}</b></div><span>${esc(i.name)}</span></li>`).join('')}</ul>`;
}

function rulesText(r) {
  return `<dl class="ph-raid-rule-list">
    <div><dt>진영 배정</dt><dd>두 명씩 청팀과 홍팀에 배정합니다. 새로 합류한 두 사람의 전투력도 배정에 반영합니다.</dd></div>
    <div><dt>승리 조건</dt><dd>교전에서 승리한 진영이 1점을 얻습니다. 종료 시 점수가 높은 진영이 승리합니다.</dd></div>
    <div><dt>약탈과 보호</dt><dd>공격에 성공하면 상대 내구도가 ${n(r.damage)} 감소합니다. ${esc(r.materials.map(c=>partFor(c)?.name || c).join('·'))} 보유량의 ${n(r.lootPercent)}%를 올림해 종류당 최대 ${n(r.lootLimit)}개까지 가져옵니다.</dd></div>
    <div><dt>재출격</dt><dd>공격 후 ${r.cooldownMs/60000}분 뒤 다시 출격할 수 있습니다. 약탈당한 은신처는 ${r.protectionMs/60000}분간 보호됩니다.</dd></div>
    <div><dt>승리 보상</dt><dd>이긴 공격자 또는 방어자에게 엔진과 프레임 각 1개, 피그코인 ${n(RAID_VICTORY_PIG_COINS)}개를 지급합니다.</dd></div>
  </dl>`;
}

export function renderToolbar(phase, showRules) {
  return `<header class="ph-raid-bar"><div class="ph-raid-route"><i class="ph-raid-mark" aria-hidden="true"></i><span>개인 은신처</span><i class="ph-raid-divider" aria-hidden="true"></i><strong>${phase==='result'?'교전 결과':phase==='prep'?'출격 준비':phase==='waiting'?'진영 배정':'작전 진입'}</strong></div>
    <div class="ph-raid-bar-actions"><button type="button" data-raid="rules" aria-expanded="${showRules}" aria-controls="ph-raid-rules">작전 규칙</button><button type="button" class="ph-raid-close" data-raid="close" aria-label="약탈전 닫기">×</button></div></header>`;
}

export function renderRules(r) {
  return `<section class="ph-raid-rules" id="ph-raid-rules" aria-label="작전 규칙">${rulesText(r)}</section>`;
}

export function renderConfirmation(s,busy) {
  return `<section class="ph-raid-confirm" aria-labelledby="ph-raid-question">
    ${pill('참가 확인','is-gold')}<h3 id="ph-raid-question" tabindex="-1">오늘 약탈전에 참가할까요?</h3>
    <p>${time(s.window.endsAt)}까지 내 은신처도 공격 대상이 됩니다. 방어에 실패하면 내구도와 창고 부품 일부를 잃습니다.</p>
    <div class="ph-raid-confirm-actions">${button('cancel-join','돌아가기',{disabled:busy})}${button('confirm-join','참가 확정',{primary:true,disabled:busy,forward:true})}</div></section>`;
}

function myHome(s) {
  const stage = stageFor(s.level);
  return `<div class="ph-raid-own"><div class="ph-raid-section-title"><h3>내 은신처</h3></div>
    <div class="ph-raid-own-info">${stage ? image(stage.image) : ''}<div><strong>${esc(stage?.name || '은신처 미개설')}</strong><small>내구도 ${n(s.durability)} / ${n(s.rules.maxDurability)}</small>${meter(s.durability,s.rules.maxDurability)}</div></div></div>`;
}

function history(s) {
  if (!s.history?.length) return '';
  return `<details class="ph-raid-history" data-memory="history"><summary>교전 기록 <b>${n(s.history.length)}</b></summary><ol>${s.history.slice(0,24).map((e,index) =>
    `<li><button type="button" data-raid="history" data-target="${index}"><time>${time(e.at)}</time><span>${esc(e.attacker)} <i aria-hidden="true">›</i> ${esc(e.defender)}</span><b>${outcome(e.winner)}</b>${arrow}</button></li>`).join('')}</ol></details>`;
}

export function renderEntry(s, now, blocked) {
  const open = sessionOpen(s,now), finished = now >= s.window.endsAt, waiting = open && !!s.mine;
  const status = waiting ? '참가 등록 완료' : open ? '교전 중' : finished ? '오늘 교전 종료' : '개시 전';
  const standing = finished && s.counts.A ? s.score.A===s.score.B ? '진영 무승부' : sideName(s.score.A>s.score.B?'A':'B')+' 승리' : '';
  const title = waiting ? '진영 배정 대기' : finished ? standing || '교전 종료' : '은신처 약탈전';
  const objective = waiting ? '다음 참가자가 합류하면<br>두 명이 서로 다른 진영에 배정됩니다.' : finished ?
    (standing ? '청팀 '+n(s.score.A)+'점 · 홍팀 '+n(s.score.B)+'점' : '다음 교전은 '+time(s.window.nextStart)+'에 시작합니다.') :
    '상대의 방어선을 뚫고<br>은신처의 전리품을 확보하세요.';
  const waitUntil = open ? s.window.endsAt : s.window.nextStart;
  const hint = waiting ? '배정이 끝나면 출격 준비 화면이 열립니다.' : open ? '참가하면 내 은신처도 방어전에 들어갑니다.' : `회수 철판 ${s.rules.repairSteel}개와 구리 배선 ${s.rules.repairWire}개로 내구도 ${s.rules.repairPoints}을 회복합니다.`;
  const action = waiting ? button('join','진영 배정 중',{disabled:true}) : open ? button('join','오늘 약탈전 참가',{primary:true,forward:true,disabled:blocked || !s.level || !s.durability}) :
    button('repair',s.durability>=s.rules.maxDurability?'내구도 최대':'은신처 수리',{primary:true,disabled:blocked || !s.level || !s.repairAvailable || s.durability>=s.rules.maxDurability});
  return `<article class="raid-entry-page"><div class="ph-raid-keyart ph-raid-entry-art">
    <div class="ph-raid-hero-copy">${pill(status,open&&!waiting?'is-live':'is-gold')}<h2 id="ph-raid-title" tabindex="-1">${title}</h2>
      <p>${objective}</p></div></div>
    <div class="ph-raid-intel"><div><small>교전 시간 <em>KST</em></small><strong>${time(s.window.startsAt)} <i>–</i> ${time(s.window.endsAt)}</strong></div>
      <div><small>참가 현황</small><strong class="ph-raid-counts"><span class="ph-raid-blue">청 ${n(s.counts.A)}</span><i>/</i><span class="ph-raid-red">홍 ${n(s.counts.B)}</span><small>대기 ${n(s.counts.waiting)}</small></strong></div>
      <div><small>${open?'종료까지':'다음 개시까지'}</small><strong>${until(waitUntil)}</strong></div></div>
    <div class="ph-raid-body"><div class="ph-raid-entry-panels">${myHome(s)}
      <section class="raid-reward-preview"><div class="ph-raid-section-title"><h3>교전 승리 보상</h3></div>${goods({items:RAID_VICTORY_ITEMS,pigCoins:RAID_VICTORY_PIG_COINS})}</section></div>
      <div class="ph-raid-orders"><p>${hint}</p>${action}</div>${history(s)}</div></article>`;
}

function sides(s, side) {
  const own = s.mine.team === side;
  return `<div class="ph-raid-side side-${side}" aria-label="${sideName(side)} ${n(s.counts[side])}명 ${n(s.score[side])}점"><i class="ph-raid-crest" aria-hidden="true"></i><div class="ph-raid-side-name"><strong>${sideName(side)}</strong>${own?'<small>내 진영</small>':''}</div>
    <div class="ph-raid-side-stats"><span>${n(s.counts[side])}명</span><b>${n(s.score[side])}<small>점</small></b></div></div>`;
}

function statusOf(p,now) {
  if (!p.durability) return pill('함락','is-down');
  if (p.protectedUntil>now) return pill('보호 중','is-gold');
  return pill('침입 가능','is-live');
}

function roomImage(layout,p) {
  const zone=layout?.rooms?.find(r=>r.code===layout.defenseRoom);
  if (!zone) return `<div class="ph-raid-room ph-raid-room-loading">${image(stageFor(p.level)?.image || '')}<span>방어 구역 확인 중</span></div>`;
  const props=layout.pieces.filter(v=>v.room===zone.code).map(piece=>{
    const pos=projectRaidPlacement(piece,zone.width);
    const trophies=(piece.trophyCodes || []).map((code,i)=>{
      const src=layout.trophyArt?.[code];
      return src?`<span class="ph-cabinet-slot" style="--slot-x:${i%2};--slot-y:${Math.floor(i/2)}"><img class="ph-displayed-trophy" src="${esc(src)}" alt=""></span>`:'';
    }).join('');
    return `<div class="ph-defense-prop${pos.wall?' is-wall':''}" data-scout-piece="${esc(piece.id)}" style="left:${pos.x*100}%;top:${pos.y*100}%;width:${pos.width*100}%;z-index:${pos.wall?0:1+Number(piece.y)}"><span style="transform:scaleX(${piece.flipped?-1:1})">${image(HIDEOUT_ART+piece.art,pieceFor(piece.code))}${trophies}</span></div>`;
  }).join('');
  return `<div class="ph-raid-room" role="img" aria-label="${esc(p.name)}의 저장된 ${esc(zone.name)} 배치"><img class="ph-defense-backdrop" src="${HIDEOUT_ART}battle-${esc(layout.stage)}.webp" alt="">${props}</div>`;
}

function dossier(s,p,now,blocked) {
  if (!p) return '<div class="ph-raid-empty">상대 진영의 참가자를 기다리고 있습니다.</div>';
  const layout = s.scout?.targetId === p.id ? s.scout.layout : null;
  let label = '침입 개시', disabled = blocked;
  if (!s.mine.durability) {label='내 은신처 함락';disabled=true;}
  else if (!p.durability) {label='함락된 은신처';disabled=true;}
  else if (now < s.mine.readyAt) {label='재출격 '+until(s.mine.readyAt);disabled=true;}
  else if (now < p.protectedUntil) {label='보호 종료 '+until(p.protectedUntil);disabled=true;}
  return `<section class="ph-raid-dossier" aria-label="선택한 상대 은신처"><div class="ph-raid-scout-frame">${roomImage(layout,p)}<span class="ph-raid-room-label">${esc(roomName(layout) || '방어 구역')}</span></div>
    <div class="ph-raid-dossier-info"><div><p>${esc(stageFor(p.level)?.name)}</p><h3>${esc(p.name)}의 은신처</h3></div>
      <div class="ph-raid-hull"><small>내구도</small><strong>${n(p.durability)} <i>/ ${n(s.rules.maxDurability)}</i></strong>${meter(p.durability,s.rules.maxDurability)}</div></div>
    ${button('attack',label,{target:p.id,primary:true,forward:!disabled,disabled})}</section>`;
}

export function renderPrep(s, selectedId, now, blocked) {
  const p = s.enemies.find(x=>x.id===selectedId);
  const list = s.enemies.map(e=>`<li class="ph-raid-target"><button type="button" data-raid="select" data-target="${Number(e.id)}" aria-pressed="${e.id===selectedId}" aria-label="${esc(e.name)} 은신처 선택">
    ${image(stageFor(e.level)?.image || '')}<span class="ph-raid-roster-name"><strong>${esc(e.name)}</strong><small>${esc(stageFor(e.level)?.name)}</small></span>${statusOf(e,now)}</button></li>`).join('');
  return `<article class="raid-prep-page"><div class="ph-raid-prep-head"><div><small>은신처 약탈전</small><h2 id="ph-raid-title" tabindex="-1">출격 준비</h2></div><div class="ph-raid-deadline">교전 종료까지<strong>${until(s.window.endsAt)}</strong></div></div>
    <div class="ph-raid-score">${sides(s,'A')}<span class="ph-raid-versus" aria-hidden="true">VS</span>${sides(s,'B')}</div>
    <div class="ph-raid-body"><div class="ph-raid-prep-grid"><section class="ph-raid-opponents"><div class="ph-raid-section-title"><h3>상대 은신처</h3><b>${n(s.enemies.length)}</b></div>
      <ul class="ph-raid-targets">${list}</ul><div class="ph-raid-prep-own"><small>내 은신처</small><b>${esc(stageFor(s.level)?.name)}</b><span>내구도 ${n(s.durability)} / ${n(s.rules.maxDurability)}</span>${meter(s.durability,s.rules.maxDurability)}</div></section>
      ${dossier(s,p,now,blocked)}</div>${history(s)}</div></article>`;
}

function savedLayout(layout) {
  if (!layout?.rooms) return '';
  return `<details class="ph-raid-layout" data-memory="layout"><summary>전투 당시 저장 배치</summary>${layout.rooms.map(r=>`<div><b>${esc(r.name)}${r.code===layout.defenseRoom?' · 방어 구역':''}</b><span>${esc(layout.pieces.filter(p=>p.room===r.code).map(p=>pieceFor(p.code)).join(' · ') || '배치한 가구 없음')}</span></div>`).join('')}</details>`;
}

export function renderResult(e) {
  const win=e.winner==='A', defense=e.winner==='B', winner=win?e.attacker:defense?e.defender:'';
  const stage=HIDEOUT_STAGES.find(s=>s.code===e.stage);
  const recovered=Object.entries(e.loot || {}).filter(([,qty])=>qty>0);
  const turret=e.turretHp||e.battleV2?.result?.hideoutTurret;
  return `<article class="ph-raid-result ${win?'is-attack-win':defense?'is-defense-win':'is-draw'}">
    <div class="ph-raid-keyart ph-raid-result-art"><div class="ph-raid-hero-copy">${pill('교전 종료 · '+time(e.at),'is-gold')}<h2 id="ph-raid-title" tabindex="-1">${outcome(e.winner)}</h2>
      <p>${winner?`<strong>${esc(winner)}</strong> 승리 <i>·</i> 진영 점수 +1`:'두 진영 모두 점수를 획득하지 못했습니다.'}</p></div></div>
    <div class="ph-raid-match"><span><small>공격</small> ${esc(e.attacker)}</span><i aria-hidden="true">›</i><span><small>방어</small> ${esc(e.defender)}</span><time>${esc([stage?.name,roomName(e.residenceLayout)].filter(Boolean).join(' / '))}</time></div>
    <div class="ph-raid-body"><div class="ph-raid-result-grid"><section class="ph-raid-victory"><div class="ph-raid-section-title"><h3>승리 보상</h3>${e.victoryReward?`<span>${esc(e.victoryReward.name)} 획득</span>`:''}</div>
      ${e.victoryReward?goods(e.victoryReward):`<p class="ph-raid-empty">${winner?'보상 기록 없음':'무승부로 지급된 보상이 없습니다.'}</p>`}</section>
    <section class="ph-raid-spoils"><div class="ph-raid-section-title"><h3>약탈 결과</h3></div><div class="ph-raid-damage"><small>방어측 내구도</small><strong>${n(e.before)} <i>→</i> <b>${n(e.after)}</b></strong></div>
      ${turret?`<div class="ph-raid-damage"><small>전투 종료 시 포탑 HP</small><b>${turret.hp?n(turret.hp)+' / '+n(turret.maxHp):'0 · 파괴'}</b></div>`:''}
      <ul>${recovered.map(([code,qty])=>{const part=partFor(code);return `<li>${part?image(part.image):''}<span>${esc(part?.name || code)}</span><b>+${n(qty)}</b></li>`;}).join('') || '<li class="ph-raid-empty">이동한 창고 부품 없음</li>'}</ul></section></div>
    <div class="ph-raid-result-actions">${e.battleV2?button('replay','전투 다시 보기'):''}${button('back','전황으로',{primary:true,forward:true})}</div>${savedLayout(e.residenceLayout)}</div></article>`;
}
