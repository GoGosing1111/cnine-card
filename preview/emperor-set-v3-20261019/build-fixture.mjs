import fs from 'node:fs';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
const approved=JSON.parse(fs.readFileSync(new URL('../overlord-live-v1/fixtures.json',import.meta.url))).multi.cards;
const cards=approved.map(c=>({...c,power:2000000,base_power:2000000,breakthroughLevel:0}));
const battleV2=createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:20261019});
const payload={ok:true,mode:'PVP',title:'엠퍼러 장비 세트 효과 시연',cards,attackerCards:cards,defenderCards:cards,enemyCards:cards,
 battleV2,battleEngine:'BATTLE_ENGINE_V2',result:battleV2.result,playerName:'엠퍼러 +10 진영',opponentName:'일반 진영',
 equippedBattleSuit:null,equippedWeapon:null,characterBonus:0,attackerEquipmentBonus:0,defenderEquipmentBonus:0,
 review:{scope:'PREVIEW_ONLY',cardArtSource:'preview/overlord-live-v1/fixtures.json',equipmentOwner:'A',visualOnly:true,liveAccountRead:false,liveAccountWrite:false}};
fs.writeFileSync(new URL('./fixture.json',import.meta.url),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify({cards:cards.map(c=>c.id),events:battleV2.result.timeline.length,winner:battleV2.result.winner}));
