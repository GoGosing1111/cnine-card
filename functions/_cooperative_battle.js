import {COMPANION_RELEASE,COMPANION_PREPARATION_REVIEW as REVIEW} from '../shared/companion-loadout-v2.mjs';
import {companionSnapshotRows} from '../shared/companion-battle-snapshot-v1.mjs';
import {COOP_DUAL_BALANCE,validateCoopDualBalance} from '../shared/cooperative-dual-preparation-v1.mjs';
import {applyTypeStacking,distributeEquipment,buildFighter,buildAvatarMercenaryFighter,buildMonsterFighter,publicFighter,simulateBattleV2Preview,teamSummary} from './_battle_v2_preview.js';
import {avatarPoweredCard} from '../shared/avatar-power-v1.mjs';
import {cooperativeEnemies} from './_cooperative_enemies.js';
import {COOP_RULES,COOP_ENCOUNTER,coopDifficulty} from '../shared/cooperative-battleground-v1.mjs';

export function createCooperativeBattle({squads,difficulty='NORMAL',seed=1,withdrawals=[],effects=[],monsterSnapshot,combat,turnClockVersion=4,encounter=null,[REVIEW]:review=false,dualBalance=COOP_DUAL_BALANCE}){
 const config=typeof difficulty==='string'?coopDifficulty(difficulty):difficulty;
 if(!config||!Array.isArray(squads)||squads.length!==3||new Set(squads.map(s=>s.ownerId)).size!==3)throw Error('INVALID_COOPERATIVE_PARTY');
 const dual=review===true||COMPANION_RELEASE.dualMercenaries&&squads.some(s=>Array.isArray(s.mercenaries)),mercenariesPerOwner=dual?2:1;
 const cards=[],mercenaries=[],members=[];
 squads.forEach((squad,squadIndex)=>{
  const {ownerId,ownerName}=squad,deck=squad.cards,rows=companionSnapshotRows(squad,review);
  if(!Number.isSafeInteger(ownerId)||ownerId<=0||!Array.isArray(deck)||deck.length!==2||new Set(deck.map(c=>c.id)).size!==2||deck.some(c=>!c.id||c.isMercenary)||deck.filter(c=>(c.rarity||c.grade)==='SUPERSTAR').length>1||!rows.length)throw Error('INVALID_COOPERATIVE_SQUAD');
  const own=distributeEquipment(applyTypeStacking(deck),Math.max(0,Number(squad.equipmentBonus)||0)).map((c,localSlot)=>({
   ...buildFighter(avatarPoweredCard(c,squad.avatarPowerPercent),localSlot,'A',c.uniqueAbility||null,'PVE'),id:`A:OWNER:${ownerId}:CARD:${c.id}`,
   ownerId,ownerName,squadIndex,localSlot,slot:squadIndex*2+localSlot,
   row:c.uniqueAbility?.dominantType==='DEFENSE'||c.power_type==='DEFENSE'?'FRONT':'BACK'
  }));
  cards.push(...own);
  rows.forEach((row,index)=>{const merc=buildAvatarMercenaryFighter(row,'A','PVE',squad.avatarPowerPercent);
  mercenaries.push({...merc,id:`A:OWNER:${ownerId}:MERCENARY:${merc.cardId}`,ownerId,ownerName,squadIndex,localSlot:2+index,slot:6+squadIndex*mercenariesPerOwner+index});});
  members.push({ownerId,ownerName,squadIndex,...(squad.equipmentSetVisual?{equipmentSetVisual:squad.equipmentSetVisual}:{}),ownerRankLevel:squad.ownerRankLevel??null});
 });
 const saved=combat?.difficulties.find(d=>d.id===config.id),maxBattleMs=combat?combat.maxBattleSeconds*1000:COOP_RULES.maxBattleMs;
 const tuned={...config,forcedEvery:saved?.forcedEvery??config.forcedEvery};
 const staged=monsterSnapshot?null:cooperativeEnemies(tuned,saved?.monsters,combat?.stages,encounter);
 const monster=monsterSnapshot?structuredClone(monsterSnapshot):staged.monster;
 monster.projectVMonsterArt??={scope:'BATTLE_ENGINE_ONLY',kind:'COOP_ARKE',primaryUrl:monster.battleSprite,pngFallbackUrl:monster.battleSprite,footAnchor:{x:.5,y:.94},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:1.5,technicalPass:true,reviewOnly:false};
 const enemy={...buildMonsterFighter(monster),battleSprite:monster.battleSprite};
 const enemies=staged?.initial||[enemy];
 const balance=dual?validateCoopDualBalance(dualBalance):null;
 if(balance)for(const fighter of [...enemies,...(staged?.pending||[])]){fighter.hp=Math.round(fighter.hp*balance.hp);fighter.maxHp=Math.round(fighter.maxHp*balance.hp);fighter.shield=Math.round(fighter.shield*balance.hp);fighter.maxShield=Math.round(fighter.maxShield*balance.hp);fighter.attack=Math.round(fighter.attack*balance.attack);}
 if(balance&&staged)staged.encounter.instances=[...enemies,...staged.pending].map(publicFighter);
 const pets=squads.filter(s=>s.pet).map(s=>({...s.pet,ownerId:s.ownerId}));
 const result=simulateBattleV2Preview({[REVIEW]:review,pets:{A:pets},petMode:'PVE',teamA:[...cards,...mercenaries],teamB:enemies,reinforcements:staged?.pending||[],seed,maxActions:600,maxCombatDurationMs:maxBattleMs,
  forcedMonsterEvery:tuned.forcedEvery,healerPenalty:true,singleHealerBonus:squads[0].singleHealerBonus||{},cooperative:{withdrawals,effects,turnClockVersion,encounter}});
 // PVE survival is always a loss, regardless of HP-ratio tiebreaking.
 result.winner=!result.encounter?.remaining&&result.final.B.every(f=>f.hp<=0)&&result.final.A.some(f=>f.hp>0)?'A':'B';
 Object.assign(result.timeline.at(-1),{winner:result.winner});
 const states=result.combatStates;delete result.combatStates;
 const finalMercs=result.final.A.filter(f=>f.isMercenary);
 result.final={...result.final,A:result.final.A.filter(f=>!f.isMercenary),mercenaries:{A:finalMercs,B:[]}};
 return {states,payload:{mode:'RAID',sceneAssetKey:staged||monster.id===COOP_ENCOUNTER.id?COOP_ENCOUNTER.sceneAssetKey:undefined,monster,...(staged?{cooperativeEncounter:staged.encounter}:{}),accountNickname:'격전지 연합',battleV2:{schemaVersion:2,engine:'BATTLE_ENGINE_V2',seed,playbackSpeed:1,
  rules:{formation:'COOP_THREE_SQUADS',...(dual?{mercenariesPerOwner,dualBalance:balance}:{}),mercenaryLinkScope:'OWNER',supportScope:'TEAM',monsterMinDamagePercent:0,maxCombatDurationMs:maxBattleMs},
  teams:{A:{pets,cards:result.openingTeams?.A.filter(c=>!c.isMercenary)||cards.map(publicFighter),mercenaries:result.openingMercenaries.A,members,summary:teamSummary(cards)},B:{cards:enemies.map(publicFighter),summary:teamSummary(enemies)}},result}}};
}
