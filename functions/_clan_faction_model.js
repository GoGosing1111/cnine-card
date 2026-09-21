import { DISTRICTS, SQUADS, FACTION_RULES as R, FACTION_TAX_CHANGES } from '../shared/clan-faction-rules-v1.mjs';

export const factionFail = (message, status = 409) => { throw Object.assign(new Error(message), {status}); };
export function newFactionState(now) {
  return {version:1, districts:DISTRICTS.map(d => ({id:d.id,owner:0,protectedUntil:0,defense:'',taxAt:now,taxRemainder:0})),
    formations:{}, captains:{}, battles:[], events:[], pools:{}, squadReady:{}, targetReady:{}, strikeReady:{}};
}
export function factionEvent(state, event) {
  state.events.unshift(event); state.events = state.events.slice(0, 80);
}
export function accrueFactionTax(state, now) {
  for (const d of state.districts) {
    const elapsed = Math.max(0, now - d.taxAt);
    if (d.owner && elapsed) {
      // Preserve every historical rate and carry sub-coin fractions exactly.
      let cursor=d.taxAt,numerator=BigInt(d.taxRemainder || 0);
      for(const change of FACTION_TAX_CHANGES){
        const until=Math.min(now,change.at);
        if(until>cursor){numerator+=BigInt(until-cursor)*BigInt(change.previousPerHour);cursor=until;}
      }
      if(now>cursor)numerator+=BigInt(now-cursor)*BigInt(R.taxPerHour);
      state.pools[d.owner] = (state.pools[d.owner] || 0) + Number(numerator / 3600000n);
      d.taxRemainder = Number(numerator % 3600000n);
    }
    d.taxAt = Math.max(d.taxAt, now);
  }
}
export function finishFactionBattle(state, battle, winner, reason, now) {
  if (battle.status !== 'ACTIVE') return;
  battle.status = 'COMPLETED'; battle.winner = winner; battle.reason = reason; battle.endedAt = now;
  state.squadReady[`${battle.attacker}:${battle.squad}`] = now + R.squadCooldownMs;
  state.targetReady[`${battle.attacker}:${battle.districtId}`] = now + R.targetCooldownMs;
  const district = state.districts.find(d => d.id === battle.districtId);
  if (winner === battle.attacker) {
    district.owner = winner; district.protectedUntil = now + R.protectionMs;
    district.defense = ''; district.taxRemainder = 0;
  }
  factionEvent(state,{id:`end:${battle.id}`,kind:winner===battle.attacker?'CAPTURE':'DEFENDED',
    districtId:battle.districtId,clanId:winner,attacker:battle.attacker,defender:battle.defender,at:now});
  state.battles = state.battles.filter(b => b.status === 'ACTIVE').concat(state.battles.filter(b => b.status !== 'ACTIVE').slice(0,40));
}
export function advanceFactionState(state, now, endAt) {
  state.captains ||= {};
  const cutoff = Math.min(now, endAt, state.taxDisabledAt ?? Infinity);
  accrueFactionTax(state, cutoff);
  for (const battle of [...state.battles]) {
    if (battle.status === 'ACTIVE' && Math.min(battle.endsAt,endAt) <= now)
      finishFactionBattle(state,battle,battle.defender,now>=endAt?'SEASON_END':'TIMEOUT',Math.min(battle.endsAt,endAt));
  }
  return state;
}
export function validateFormation(formation, memberIds) {
  const used = new Set(), allowed = new Set(memberIds.map(Number)), clean = {};
  for (const squad of SQUADS) {
    const ids = formation?.[squad.id];
    if (!Array.isArray(ids) || ids.length > R.squadSize) factionFail('각 부대는 최대 5명까지 편성할 수 있습니다.',400);
    clean[squad.id] = ids.map(Number);
    for (const id of clean[squad.id]) {
      if (!Number.isSafeInteger(id) || !allowed.has(id)) factionFail('현재 클랜원만 편성할 수 있습니다.',403);
      if (used.has(id)) factionFail('한 클랜원은 하나의 부대에만 편성할 수 있습니다.',400);
      used.add(id);
    }
  }
  return clean;
}
// Captains manage a lineup; the role does not require fielding themselves.
// Old seasons have no assignments. Only current clan members retain the role.
export function factionCaptains(captains, memberIds) {
  return Object.fromEntries(SQUADS.filter(s=>s.role==='ATTACK').map(s=>{
    const id=captains?.[s.id];
    return [s.id,Number.isSafeInteger(id)&&id>0&&memberIds.includes(id)?id:0];
  }));
}
export function validateFactionCaptains(captains, memberIds) {
  const attacks=SQUADS.filter(s=>s.role==='ATTACK').map(s=>s.id);
  if(!captains||typeof captains!=='object'||Array.isArray(captains)
    ||Object.keys(captains).some(key=>!attacks.includes(key))||attacks.some(key=>!Object.hasOwn(captains,key)))
    factionFail('제1·제2 공격대의 행동대장을 각각 선택하세요.',400);
  const used=new Set(),clean={};
  for(const squad of attacks){
    const id=captains[squad]??0;
    if(!Number.isSafeInteger(id)||id<0)factionFail('행동대장 계정을 확인하세요.',400);
    if(id&&used.has(id))factionFail('한 사람은 하나의 공격대 행동대장만 맡을 수 있습니다.',400);
    if(id&&!memberIds.includes(id))factionFail('현재 클랜원만 행동대장으로 지정할 수 있습니다.',403);
    if(id)used.add(id);clean[squad]=id;
  }
  return clean;
}
export function factionStrikeDamage(battleV2) {
  const original = [...(battleV2?.teams?.B?.cards || []),...(battleV2?.teams?.B?.mercenaries || [])];
  const finalCards = battleV2?.result?.final?.B;
  if (!original.length || !Array.isArray(finalCards) || !finalCards.length) factionFail('서버 전투 결과의 HP를 확인하지 못했습니다.');
  const final = [...finalCards,...(battleV2?.result?.final?.mercenaries?.B || [])];
  const max = original.reduce((n,c) => n+Math.max(0,Number(c.maxHp)||0),0);
  const remaining = final.reduce((n,c) => n+Math.max(0,Number(c.hp)||0),0);
  if (!Number.isFinite(max) || max<=0 || !Number.isFinite(remaining)) factionFail('전투 HP 값이 올바르지 않습니다.');
  return Math.floor(R.sharedHp * R.strikeMaxFraction * Math.max(0,Math.min(1,(max-remaining)/max)));
}
export function splitFactionTax(amount, ids) {
  const members = [...new Set(ids.map(Number))].sort((a,b)=>a-b);
  if (!Number.isSafeInteger(amount) || amount<0 || !members.length) factionFail('분배할 징수세와 클랜원 명단을 확인하세요.');
  const each = Math.floor(amount/members.length),extra=amount%members.length;
  return members.map((userId,i)=>({userId,amount:each+(i<extra?1:0)}));
}
