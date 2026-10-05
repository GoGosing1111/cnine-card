// Deterministic reproduction of the observed losses, without any live API calls.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fur15ReferenceCards,buildIconFurReference} from '../../functions/_icon_fur_reference.js';
import {iconRoleSnapshot,ICON_ROLES} from '../../shared/icon-roles-v1.mjs';
import {createPvpBattleV2} from '../../functions/_battle_v2_preview.js';
const live=JSON.parse(fs.readFileSync(new URL('./live-settings.json',import.meta.url)));
const audit=JSON.parse(fs.readFileSync(new URL('./balance-report.json',import.meta.url)));
const opponent=fur15ReferenceCards(live.cards,live.battle,live.high,'PVP').find(c=>c.title==='치타구');
const supremacy=buildIconFurReference(live.cards,live.battle,live.high,'PVP');
const rows=[audit.single.find(r=>r.icon==='하이희야'&&r.equipment===0&&r.losses.length),audit.single.find(r=>r.icon==='나무늘봉순'&&r.equipment===0&&r.losses.length),audit.teams.find(r=>r.icon==='오조은'&&r.losses.length)];
const replays=rows.map(row=>{
  const def=ICON_ROLES.find(d=>d.name===row.icon),catalog=live.icons.find(c=>c.id===def.cardId);
  const icon={id:catalog.id,title:catalog.title,grade:'ICON',power:Number(catalog.base_power),iconRole:{...iconRoleSnapshot({id:catalog.id,grade:'ICON'},live.publicRoles.document,'PVP',live.publicRoles.revision),supremacy}};
  const deck=c=>{if(row.slot==null)return [c];const cards=[...audit.common];cards.splice(row.slot,0,c);return cards;};
  const loss=row.losses[0],flip=loss.iconSide==='B';
  const battle=createPvpBattleV2({attackerCards:deck(flip?opponent:icon),defenderCards:deck(flip?icon:opponent),seed:loss.seed,attackerEquipmentBonus:row.equipment,defenderEquipmentBonus:row.equipment,singleHealerBonus:live.battle.engine.singleHealerBonus});
  assert.equal(battle.result.winner,loss.winner);
  return {scenario:{icon:row.icon,opponent:row.opponent,equipment:row.equipment,slot:row.slot??null,...loss},battle};
});
fs.writeFileSync(new URL('./loss-replays.json',import.meta.url),JSON.stringify(replays,null,2)+'\n');
console.log(JSON.stringify(replays.map(r=>{
  const attacks=r.battle.result.timeline.filter(e=>e.type==='TURN'&&e.actorId?.startsWith(r.scenario.iconSide+':')&&e.targetId?.includes(opponent.id));
  return {scenario:r.scenario,winner:r.battle.result.winner,basicsAgainstCheetah:attacks.length,dodges:attacks.filter(e=>e.dodge).length,skillCasts:r.battle.result.timeline.filter(e=>e.type==='ICON_SKILL').length};
}),null,2));
