import {COMPANION_RELEASE,COMPANION_PREPARATION_REVIEW as REVIEW,validatePreparedMercenaries} from './companion-loadout-v2.mjs';

// Only trusted server snapshots (or OWNER review constructors) carry REVIEW.
// Unknown arrays in an old/live one-slot snapshot cannot enable the new rules.
export function companionBattleOptions(snapshot={},review=false) {
  const enabled=review===true||snapshot?.[REVIEW]===true||COMPANION_RELEASE.dualMercenaries;
  if(!enabled||!Array.isArray(snapshot?.mercenaries))return {mercenary:snapshot?.mercenary||null};
  const rows=validatePreparedMercenaries(snapshot.mercenaries);
  if(snapshot.mercenary&&snapshot.mercenary.code!==rows[0]?.code)throw Error('AMBIGUOUS_MERCENARY_SNAPSHOT');
  return {mercenaries:rows,...(review===true||snapshot[REVIEW]===true?{[REVIEW]:true}:{})};
}
export function companionSnapshotRows(snapshot={},review=false) {
  const options=companionBattleOptions(snapshot,review);
  return options.mercenaries||(options.mercenary?[options.mercenary]:[]);
}
export const companionReviewOptions=snapshot=>snapshot?.[REVIEW]===true?{[REVIEW]:true}:{};
export function pvpCompanionOptions(attacker={},defender={}) {
  const a=companionBattleOptions(attacker),b=companionBattleOptions(defender);
  return {...(a.mercenaries?{attackerMercenaries:a.mercenaries}:{attackerMercenary:a.mercenary}),
    ...(b.mercenaries?{defenderMercenaries:b.mercenaries}:{defenderMercenary:b.mercenary}),
    ...companionReviewOptions(a),...companionReviewOptions(b)};
}

// Continuation health is keyed by code. Slot order must never revive a dead unit
// or transfer the first mercenary's health to the second after reconnecting.
export function continuedCompanionOptions(state={}) {
  const options=companionBattleOptions(state),health=state.mercenaryHpByCode||{};
  const row=(m,index)=>({...m,startingHpPercent:Math.max(0,Math.min(100,Number(health[m.code]??(index===0?state.mercenaryHpPercent:100)??100)))});
  return options.mercenaries?{...options,mercenaries:options.mercenaries.map(row)}:
    {mercenary:options.mercenary?row(options.mercenary,0):null};
}
export function companionContinuationHealth(state,final=[]) {
  const rows=companionSnapshotRows(state),byCode=new Map(final.map(m=>[m.cardId||m.code,m]));
  const health=Object.fromEntries(rows.map((m,index)=>{
    const f=byCode.get(m.code),previous=state.mercenaryHpByCode?.[m.code]??(index===0?state.mercenaryHpPercent:100)??100;
    return [m.code,f?Math.max(0,Math.min(100,Number(f.hp)/Math.max(1,Number(f.maxHp))*100)):previous];
  }));
  return {mercenaryHpByCode:health,mercenaryHpPercent:rows.length?health[rows[0].code]:state.mercenaryHpPercent,
    livingMercenaries:rows.filter(m=>health[m.code]>0).length};
}
