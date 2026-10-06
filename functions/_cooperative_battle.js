import {applyTypeStacking,distributeEquipment,buildFighter,buildMonsterFighter,publicFighter,simulateBattleV2Preview,teamSummary} from './_battle_v2_preview.js';
import {buildMercenaryFighter} from './_mercenary_combat.js';
import {cooperativeEnemies} from './_cooperative_enemies.js';
import {COOP_RULES,COOP_ENCOUNTER,coopDifficulty} from '../shared/cooperative-battleground-v1.mjs';

export function createCooperativeBattle({squads,difficulty='NORMAL',seed=1,withdrawals=[],effects=[],monsterSnapshot,combat,turnClockVersion=4}){
 const config=typeof difficulty==='string'?coopDifficulty(difficulty):difficulty;
 if(!config||!Array.isArray(squads)||squads.length!==3||new Set(squads.map(s=>s.ownerId)).size!==3)throw Error('INVALID_COOPERATIVE_PARTY');
 const cards=[],mercenaries=[],members=[];
 squads.forEach((squad,squadIndex)=>{
  const {ownerId,ownerName}=squad,deck=squad.cards;
  if(!Number.isSafeInteger(ownerId)||ownerId<=0||!Array.isArray(deck)||deck.length!==2||new Set(deck.map(c=>c.id)).size!==2||deck.some(c=>!c.id||c.isMercenary)||deck.filter(c=>(c.rarity||c.grade)==='SUPERSTAR').length>1||!squad.mercenary)throw Error('INVALID_COOPERATIVE_SQUAD');
  const own=distributeEquipment(applyTypeStacking(deck),Math.max(0,Number(squad.equipmentBonus)||0)).map((c,localSlot)=>({
   ...buildFighter(c,localSlot,'A',c.uniqueAbility||null,'PVE'),id:`A:OWNER:${ownerId}:CARD:${c.id}`,
   ownerId,ownerName,squadIndex,localSlot,slot:squadIndex*2+localSlot,
   row:c.uniqueAbility?.dominantType==='DEFENSE'||c.power_type==='DEFENSE'?'FRONT':'BACK'
  }));
  cards.push(...own);
  const merc=buildMercenaryFighter(squad.mercenary,'A','PVE',buildFighter);
  mercenaries.push({...merc,id:`A:OWNER:${ownerId}:MERCENARY:${merc.cardId}`,ownerId,ownerName,squadIndex,localSlot:2,slot:6+squadIndex});
  members.push({ownerId,ownerName,squadIndex});
 });
 const saved=combat?.difficulties.find(d=>d.id===config.id),maxBattleMs=combat?combat.maxBattleSeconds*1000:COOP_RULES.maxBattleMs;
 const tuned={...config,forcedEvery:saved?.forcedEvery??config.forcedEvery};
 const staged=monsterSnapshot?null:cooperativeEnemies(tuned,saved?.monsters,combat?.stages);
 const monster=monsterSnapshot?structuredClone(monsterSnapshot):staged.monster;
 monster.projectVMonsterArt??={scope:'BATTLE_ENGINE_ONLY',kind:'COOP_ARKE',primaryUrl:monster.battleSprite,pngFallbackUrl:monster.battleSprite,footAnchor:{x:.5,y:.94},objectFit:'contain',objectPosition:'50% 100%',scaleMultiplier:1.5,technicalPass:true,reviewOnly:false};
 const enemy={...buildMonsterFighter(monster),battleSprite:monster.battleSprite};
 const enemies=staged?.initial||[enemy];
 const pets=squads.filter(s=>s.pet).map(s=>({...s.pet,ownerId:s.ownerId}));
 const result=simulateBattleV2Preview({pets:{A:pets},petMode:'PVE',teamA:[...cards,...mercenaries],teamB:enemies,reinforcements:staged?.pending||[],seed,maxActions:600,maxCombatDurationMs:maxBattleMs,
  forcedMonsterEvery:tuned.forcedEvery,healerPenalty:true,singleHealerBonus:squads[0].singleHealerBonus||{},cooperative:{withdrawals,effects,turnClockVersion}});
 // PVE survival is always a loss, regardless of HP-ratio tiebreaking.
 result.winner=!result.encounter?.remaining&&result.final.B.every(f=>f.hp<=0)&&result.final.A.some(f=>f.hp>0)?'A':'B';
 Object.assign(result.timeline.at(-1),{winner:result.winner});
 const states=result.combatStates;delete result.combatStates;
 const finalMercs=result.final.A.filter(f=>f.isMercenary);
 result.final={...result.final,A:result.final.A.filter(f=>!f.isMercenary),mercenaries:{A:finalMercs,B:[]}};
 return {states,payload:{mode:'RAID',sceneAssetKey:monster.id===COOP_ENCOUNTER.id?COOP_ENCOUNTER.sceneAssetKey:undefined,monster,...(staged?{cooperativeEncounter:staged.encounter}:{}),accountNickname:'격전지 연합',battleV2:{schemaVersion:2,engine:'BATTLE_ENGINE_V2',seed,playbackSpeed:1,
  rules:{formation:'COOP_THREE_SQUADS',mercenaryLinkScope:'OWNER',supportScope:'TEAM',monsterMinDamagePercent:0,maxCombatDurationMs:maxBattleMs},
  teams:{A:{pets,cards:result.openingTeams?.A.filter(c=>!c.isMercenary)||cards.map(publicFighter),mercenaries:result.openingMercenaries.A,members,summary:teamSummary(cards)},B:{cards:enemies.map(publicFighter),summary:teamSummary(enemies)}},result}}};
}
