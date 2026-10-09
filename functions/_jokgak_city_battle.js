import {releasedMercenarySnapshot} from './_mercenary_account.js';
import {loadPetBattleSnapshot} from './_pet_account.js';

// Use the ranked PVP engine and its current loadout sources, without changing
// ranked tickets, rating, energy, rewards or the territory power-gap rule.
export async function prepareCityBattle(env,deps,attacker,defender){
  const [battle,aDeck,dDeck]=await Promise.all([deps.battleSettings(env),deps.pvpDeckSnapshot(env,attacker.id),deps.pvpDeckSnapshot(env,defender.id,true)]);
  if([aDeck,dDeck].some(deck=>deck.length!==5||new Set(deck.map(c=>String(c.id))).size!==5))throw Object.assign(Error('양쪽 모두 PVP 덱에 일반 카드 5장이 필요합니다.'),{status:409,code:'CITY_DECK'});
  const users=[attacker,defender],decks=[aDeck,dDeck].map(deck=>deck.map(card=>({...card,id:String(card.id),power:deps.cardBattlePower(card,card.breakthrough_level,battle)})));
  const [unique,synergies,equipment,magic,mercenaries,pets]=await Promise.all([
    deps.cardUniqueDeckStates(env,users.map((user,i)=>({user,cards:decks[i]})),'PVP'),
    Promise.all(users.map((user,i)=>deps.evaluateDeckSynergies(env,user,decks[i].map(c=>c.id),'PVP',{forceOwnerTest:user.role==='OWNER'}))),
    Promise.all(users.map(user=>deps.userEquipmentBonuses(env,user.id))),
    Promise.all(users.map((user,i)=>deps.magicBattleLoadout(env,user,'PVP',i?{presetNo:1}:{}))),
    Promise.all(users.map(user=>releasedMercenarySnapshot(env,user,'PVP'))),
    Promise.all(users.map(user=>loadPetBattleSnapshot(env,user,'PVP')))
  ]);
  const cards=decks.map((deck,i)=>{const byId=new Map((unique[i]?.cards||[]).map(card=>[String(card.id),card]));return deck.map(card=>{const u=byId.get(card.id);return {...card,power:Math.max(1,Math.floor(card.power*(1+Number(synergies[i]?.totals?.attackPercent||0)/100))),uniqueAbility:u?.uniqueAbility||card.uniqueAbility||null,uniqueAdvancement:u?.uniqueAdvancement||null,iconRole:u?.iconRole||null};});});
  const seed=crypto.getRandomValues(new Uint32Array(1))[0];
  const battleV2=deps.createPvpBattleV2({attackerCards:cards[0],defenderCards:cards[1],attackerEquipmentBonus:Number(equipment[0]?.pvp||0),defenderEquipmentBonus:Number(equipment[1]?.pvp||0),attackerMagicCards:magic[0]?.cards||[],defenderMagicCards:magic[1]?.cards||[],attackerMercenary:mercenaries[0],defenderMercenary:mercenaries[1],attackerPet:pets[0],defenderPet:pets[1],seed,singleHealerBonus:battle?.engine?.singleHealerBonus});
  return {battleV2,battleSeed:seed,attackerCards:cards[0],defenderCards:cards[1],attackerPower:Number(battleV2.teams.A.summary.power),defenderPower:Number(battleV2.teams.B.summary.power),attackerCharacterBonus:equipment[0],defenderCharacterBonus:equipment[1],attackerNickname:attacker.nickname,defenderNickname:defender.nickname,opponent:{id:defender.id,nickname:defender.nickname},mode:'PVP',sceneAssetKey:'JOKGAK_CITY',battleEngine:{active:true}};
}
