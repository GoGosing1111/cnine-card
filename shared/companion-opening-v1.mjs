import {petReadiness} from './pet-cms-v1.mjs';
import {MERCENARY_COMBAT_LINK,mercenaryEffectiveAttack} from './mercenary-combat-link-v2103.mjs';
import {berkanActionCredit} from './mercenary-berkan-v1.mjs';

const living=actor=>actor?.alive!==false&&actor?.hp>0&&!actor.isMonster&&!actor.isBattleSuit&&actor.actorKind!=='BATTLE_SUIT';
const stats=actor=>Object.fromEntries(['maxHp','hp','attack','defense','speed','shield'].map(key=>[key,key==='attack'?mercenaryEffectiveAttack(actor):Number(actor[key]||0)]));
export function applyPetOpeningBuff(team,raw,side,mode){
  if(!raw)return null;
  const ready=petReadiness(raw,mode);
  if(!ready.ok)throw Error(ready.reasons.join(' '));
  const pet=ready.pet;
  const targets=team.filter(actor=>living(actor)&&(pet.target==='ALL_ALLIES'||pet.target==='MERCENARIES'&&actor.isMercenary||pet.target==='REGULAR_CARDS'&&!actor.isMercenary));
  if(!targets.length||targets.every(actor=>actor.petOpeningApplied))return null;
  if(targets.some(actor=>actor.petOpeningApplied))throw Error('펫 시작 버프가 일부 대상에 중복 적용됐습니다.');
  const hits=targets.map(actor=>{
    const before=stats(actor);
    // HP first: starting shield is based on the resulting max HP, regardless of CMS row order.
    for(const type of ['MAX_HP_PERCENT','ATTACK_PERCENT','DEFENSE_PERCENT','SPEED_PERCENT','START_SHIELD_PERCENT']){
      const effect=pet.buffs.find(buff=>buff.type===type);if(!effect)continue;
      const multiplier=1+effect.percent/100;
      if(type==='MAX_HP_PERCENT'){
        const ratio=actor.hp/actor.maxHp;actor.maxHp=Math.max(1,Math.round(actor.maxHp*multiplier));actor.hp=Math.min(actor.maxHp,Math.max(1,Math.round(actor.maxHp*ratio)));
      }else if(type==='START_SHIELD_PERCENT'){
        actor.shield=Math.max(0,Number(actor.shield||0))+Math.round(actor.maxHp*effect.percent/100);actor.maxShield=Math.max(Number(actor.maxShield||0),actor.shield);
      }else{const key={ATTACK_PERCENT:'attack',DEFENSE_PERCENT:'defense',SPEED_PERCENT:'speed'}[type];const base=key==='attack'?mercenaryEffectiveAttack(actor):actor[key];actor[key]=Math.max(1,Math.round(base*multiplier));}
    }
    actor.petOpeningApplied=true;
    return {targetId:actor.id,before,after:stats(actor)};
  });
  return {actorId:`${side}:PET:${pet.code}`,actorSide:side,petCode:pet.code,name:pet.name,battleSprite:pet.battleSprite,phase:'BATTLE_START',frequency:'ONCE_PER_BATTLE',duration:'BATTLE',target:pet.target,buffs:pet.buffs,hits,label:`${pet.name} · 시작 버프`};
}

// Review-only independent credit prevents the first companion starving the second.
export function preparedMercenaryCadence(teams){
  let serial=0;
  const states=['A','B'].flatMap(side=>teams[side].filter(actor=>actor.isMercenary).map(actor=>({actor,side,owner:actor.ownerId??null,debt:0,last:-1,
    interval:actor.statMode==='RANK_FIXED'?MERCENARY_COMBAT_LINK.regularActionsPerTurn:5,credit:berkanActionCredit([actor])})));
  const regular=actor=>living(actor)&&!actor.isMercenary;
  const accrue=state=>state.debt=Math.min(state.interval+Math.ceil(state.credit)-1,state.debt+state.credit);
  const pending=(eligible,filter=()=>true)=>states.filter(state=>state.debt>=state.interval&&living(state.actor)&&eligible(state.actor)&&filter(state)).sort((a,b)=>a.last-b.last||a.actor.slot-b.actor.slot)[0]?.actor||null;
  return {
    pending(eligible=()=>true){return pending(eligible);},
    select(actor){return regular(actor)?pending(()=>true,state=>state.side===actor.side&&state.owner===(actor.ownerId??null))||actor:actor;},
    acted(actor){
      if(actor.isMercenary){const state=states.find(row=>row.actor===actor);if(state){state.debt=Math.max(0,state.debt-state.interval);state.last=serial++;}}
      else if(regular(actor)){
        for(const state of states){
          if(state.side===actor.side&&state.owner===(actor.ownerId??null))accrue(state);
          else if(state.side!==actor.side&&state.actor.battleMode==='PVP'&&!teams[state.side].some(row=>regular(row)&&(row.ownerId??null)===state.owner))accrue(state);
        }
      }
    }
  };
}
