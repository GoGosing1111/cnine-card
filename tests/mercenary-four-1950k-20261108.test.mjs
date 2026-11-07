import test from 'node:test';
import assert from 'node:assert/strict';
import {cards,fighter,snapshot} from './helpers/helios-king-balance-20261106.mjs';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryBaseActionCredit} from '../functions/_mercenary_combat.js';
import {mercenarySnapshotPower,mercenaryAccountState,saveMercenaryLoadout,releasedMercenaryFormations} from '../functions/_mercenary_account.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {MERCENARY_CRAFTS,mercenaryCraftDraft,mercenaryCraftRecipe,KAIRON_RECIPE_CODE} from '../shared/mercenary-craft-v1.mjs';

const targets=['V-996','V-999','V-988','V-989'];
const jokro='V-979';
function linked(code,mode,level,gear,cardPower){
 const merc=fighter(code,'A',mode,level,gear);
 const team=[...cards(cardPower).map((c,i)=>buildFighter(c,i,'A',null,mode)),merc];
 applyMercenaryCombatLink([team]);
 return merc;
}

test('all four keep 1.95m offense and durability below ordinary Jokro across modes, decks, growth and gear',()=>{
 for(const mode of ['PVE','PVP'])for(const level of [1,11,21])for(const gear of [0,1e6,1e8])for(const cardPower of [1e4,2e7,2e9]){
  const ref=linked(jokro,mode,level,gear,cardPower);
  const peers=targets.map(code=>linked(code,mode,level,gear,cardPower));
  for(const m of peers){
   const context=[m.code,mode,level,gear,cardPower].join('/');
   assert.equal(m.basePower-gear,1950000,context);assert.equal(ref.basePower-gear,2200000);
   for(const field of ['attack','defense','maxHp','shield'])assert(m[field]<ref[field],context+' '+field);
   assert(mercenaryEffectiveAttack(m)<mercenaryEffectiveAttack(ref),context+' linked attack');
   for(const field of ['attackFloor','hpFloor','openingShield'])assert(m.mercenaryLink[field]<ref.mercenaryLink[field],context+' '+field);
   assert.equal(m.speed,ref.speed);assert.equal(mercenaryBaseActionCredit([m]),3.12);
   const grownRatio=12.6*(1+m.mercenaryGrowth.total.skillPowerPercent/100);
   assert.deepEqual(m.skills.map(s=>s.balance),mode==='PVE'?[{damageRatio:grownRatio,cooldownTurns:5,cost:35}]:[]);
   if(mode==='PVE')assert(m.skills[0].balance.damageRatio<ref.skills[0].balance.damageRatio);
  }
  for(const m of peers.slice(1)){
   for(const field of ['attack','maxHp','shield','speed'])assert.equal(m[field],peers[0][field]);
   assert.equal(m.defense,peers[1].defense);assert(peers[0].defense>m.defense);
  }
 }
});

test('canonical preparation replaces stale power and skills without changing input or existing level and equipment',()=>{
 for(const code of targets)for(const mode of ['PVE','PVP']){
  const valid=snapshot(code,11,mode,1e6);
  const stale={...valid,basePower:1,stats:{attack:1,defense:1,hp:1,speed:1},skills:[]};
  const input=structuredClone(stale),current=buildMercenaryFighter(stale,'B',mode,buildFighter);
  assert.equal(valid.basePower,1950000);assert.equal(mercenarySnapshotPower(stale),2950000);
  assert.deepEqual(current,fighter(code,'B',mode,11,1e6));assert.deepEqual(stale,input);
 }
});

test('identical decks give all four the expected first PvE cast below Jokro on a boss without cap clipping',()=>{
 const party=cards();
 const first=(code,seed)=>createPveBattleV2({cards:party,mercenary:snapshot(code),monster:{id:1,battle_power:160e9},seed})
  .result.timeline.find(e=>e.actorId==='A:MERCENARY:'+code&&e.type.endsWith('_AREA')).damage;
 for(const seed of [1,7,19,7919]){
  const ref=first(jokro,seed);
  for(const code of targets){
   const damage=first(code,seed);
   assert(damage>0&&ref>damage*1.30&&ref<damage*1.40,code+' '+seed);
  }
 }
});

test('equal-deck PvP honors actual turn and damage outcomes on both sides',()=>{
 const party=cards();
 for(const code of targets)for(const [a,b] of [[code,jokro],[jokro,code]]){
  let jokroWins=0;
  for(let seed=1;seed<=8;seed++){
   const battle=createPvpBattleV2({attackerCards:party,defenderCards:party,attackerMercenary:snapshot(a,1,'PVP'),defenderMercenary:snapshot(b,1,'PVP'),seed});
   assert(battle.result.timeline.some(e=>e.type==='TURN'&&e.actorId?.endsWith(code)&&e.damage>0));
   assert(!battle.result.timeline.some(e=>e.actorId?.endsWith(code)&&e.type.endsWith('_AREA')));
   if(battle.result.winner===(a===jokro?'A':'B'))jokroWins++;
  }
  assert(jokroWins>4,code+' vs ordinary Jokro');
 }
});

test('codex selection, sorting data and crafting read deployed power while legacy catalog locks stay intact',()=>{
 const raw=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
 const display=validateCatalog(raw,{forDisplay:true});
 for(const code of targets){
  const original=raw.cards.find(c=>c.code===code),card=display.cards.find(c=>c.code===code);
  assert.equal(card.basePower,1950000);assert.equal(card.skills.length,1);assert.equal(card.skills[0].balance.damageRatio,12.6);
  assert.match(card.combatLinkDescription,/1,950,000/);assert.match(card.combatLinkDescription,/1,260%/);
  for(const flag of ['releaseStatus','acquisition','acquisitionEnabled','packAcquisitionEnabled','deploymentEnabled'])assert.equal(card[flag],original[flag]);
  if(code!=='V-989'){assert.equal(original.basePower,null);assert.deepEqual(original.skills,[]);}
 }
 const craft=MERCENARY_CRAFTS.find(d=>d.recipeCode===KAIRON_RECIPE_CODE),recipe=mercenaryCraftRecipe(craft,mercenaryCraftDraft(craft));
 assert.equal(recipe.output_pve,1950000);assert.equal(recipe.output_pvp,1950000);
});

test('previously owned copies use current power through account, saved loadout and batched battle preparation',async t=>{
 const f=await mercenaryFixture(t,{postgres:false}),user={id:1,role:'OWNER',nickname:'검수'};
 await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',user.id,user.nickname).run();
 for(const code of targets)await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,1,0,?,?)',user.id,code,'2026-10-25','2026-10-25').run();
 const state=await mercenaryAccountState(f.env,user);
 for(const code of targets){
  const card=state.cards.find(c=>c.code===code);
  assert.equal(card.basePower,1950000);assert.equal(card.canDeploy,true);
 }
 for(const mode of ['PVE','PVP']){
  let revision=0;
  for(const code of targets){
   const saved=await saveMercenaryLoadout(f.env,user,{mode,mercenaryCodes:[code],revision,requestId:crypto.randomUUID()});
   revision=saved.revision;
   const all=await releasedMercenaryFormations(f.env,[user.id],mode,{dual:true});
   const [prepared]=all.get(user.id).mercenaries;
   assert.equal(prepared.code,code);assert.equal(prepared.basePower,1950000);
   assert.equal(buildMercenaryFighter(prepared,'A',mode,buildFighter).basePower,1950000);
  }
 }
});
