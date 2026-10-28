import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {ICON_EXPANSION_CARDS as NEW,liveExpansionIcon} from '../shared/icon-expansion-v1.mjs';
import {ICON_EXPANSION_ART} from '../shared/icon-expansion-art-v1.mjs';
import {ICON_LIVE_CARDS,ICON_FUSION_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {ICON_CHOICE_CARDS} from '../shared/icon-card-choice-v1.mjs';
import {ICON_ROLES,iconRoleSnapshot,defaultIconRoles} from '../shared/icon-roles-v1.mjs';
import {ICON_ROLE_VISUALS} from '../shared/icon-role-visuals-v1.mjs';
import {ICON_CMS_CATALOG} from '../shared/icon-cms-catalog-v1.mjs';
import {iconEnhancementPower} from '../shared/icon-enhancement-v1.mjs';
import {buildFighter,createPvpBattleV2,createPveBattleV2,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {runIconFusion,iconFusionOverview} from '../functions/_icon_fusion.js';
const read=p=>fs.readFileSync(new URL('../'+p.replace(/^\//,''),import.meta.url));
const card=(spec=NEW[0])=>({...spec,id:spec.cardId,rarity:'ICON',image:spec.sourceArt,power:spec.basePower});
test('four independent registered cards use 360k; nine legacy cards and choice ticket exclusions stay intact',()=>{
 assert.equal(ICON_LIVE_CARDS.length,13);assert.equal(ICON_FUSION_CARDS.length,12);assert.equal(ICON_CHOICE_CARDS.length,8);
 assert.deepEqual(ICON_LIVE_CARDS.slice(0,9).map(c=>[c.cardId,c.basePower]),Array.from({length:9},(_,i)=>[`CN-1C00000${i+1}`,180000]));
 assert.equal(new Set(ICON_LIVE_CARDS.map(c=>c.cardId)).size,13);
 for(const c of NEW){assert.equal(c.basePower,360000);assert(c.acquisitionEnabled&&c.battleEnabled);assert(ICON_FUSION_CARDS.includes(c));assert(!ICON_CHOICE_CARDS.includes(c));}
 assert(!ICON_FUSION_CARDS.some(c=>c.code==='ICON-ZEUS-CHEOLGU'));
});
test('all thirteen ICONs retain portraits, SDs and skill atlases; four authored hashes are unchanged',()=>{
 for(const c of ICON_LIVE_CARDS)assert(read(c.sourceArt).length>0,c.code+' portrait');
 for(const c of ICON_CMS_CATALOG)assert(read(c.battleSprite).length>0,c.code+' SD');
 for(const c of Object.values(ICON_ROLE_VISUALS))for(const kind of ['hit','skill'])assert(read(`preview/icon-battle-assets-v1/assets/fx/${c.id}-${kind}/atlas-v1.webp`).length>0);
 for(const art of Object.values(ICON_EXPANSION_ART))for(const [file,expected] of [[art.sd,art.sdSha256],[art.effect,art.effectSha256],...(art.weapon?[[art.weapon.url,art.weapon.sha256]]:[])])assert.equal(createHash('sha256').update(read(file)).digest('hex').toUpperCase(),expected);
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: new craft charges 1T, failed attempts consume once, successful retry cannot duplicate`,async t=>{
 for(const success of [true,false]){
  const f=await iconFusionFixture(t,{postgres}),body={...f.body(),targetCode:NEW[1].code};
  const view=await iconFusionOverview(f.env,f.user);assert.equal(view.catalog.length,12);assert(view.enabled);
  const r=await runIconFusion(f.env,f.user,body,{randomInt:()=>success?99999:100000});assert.equal(r.success,success);assert.equal(r.policy.coinCost,1000000000000);
  const after=await f.snapshot();assert.equal(after.coin,500000000000);assert.equal(after.stars,10000000);assert.equal(after.cards.find(c=>c.card_id===NEW[1].cardId)?.quantity||0,success?1:0);
  assert((await runIconFusion(f.env,f.user,body,{randomInt(){throw Error('reroll')}})).replayed);assert.deepEqual(await f.snapshot(),after);
 }
});
test('partial registration does not close legacy crafting; an unavailable new target and failed commit never consume',async t=>{
 const f=await iconFusionFixture(t,{postgres:true});await f.p('UPDATE cards SET is_active=0 WHERE id=?',NEW[3].cardId).run();
 const view=await iconFusionOverview(f.env,f.user);assert(view.enabled);assert.equal(view.catalog.length,11);
 const before=await f.snapshot();await assert.rejects(runIconFusion(f.env,f.user,{...f.body(),targetCode:NEW[3].code}),{code:'ICON_FUSION_CLOSED'});assert.deepEqual(await f.snapshot(),before);
 const body={...f.body(),targetCode:NEW[0].code};f.fail('INSERT INTO user_cards');await assert.rejects(runIconFusion(f.env,f.user,body,{randomInt:()=>0}));assert.deepEqual(await f.snapshot(),before);f.fail('');
 assert((await runIconFusion(f.env,f.user,body,{randomInt(){throw Error('reroll')}})).success);
});
test('server and client power use 360k for the new four and apply the same +20% enhancement without speed growth',()=>{
 const api=read('functions/api/[[path]].js').toString(),app=read('js/app.js').toString();
 const ctx={iconEnhancementPower,FUR_MAX_ENHANCEMENT:15,FAKER_CHAMPIONSHIP_CARD_ID:'other',FAKER_FLAT_POWER_BONUS:3000,breakthroughBonusPercent:()=>0,clientBreakthroughBonusPercent:()=>0};
 const server=vm.runInNewContext(api.slice(api.indexOf('function cardPowerBase('),api.indexOf('function sqlUtcNow('))+';cardBattlePower',ctx),client=vm.runInNewContext(app.slice(app.indexOf('function battleCardPower('),app.indexOf('function pveDeckCardMini('))+';battleCardPower',ctx);
 for(const c of NEW)for(const mode of ['PVE','PVP']){
  let speed;for(const level of [0,1,10]){const power=server(card(c),level,{});assert.equal(power,360000*(1+level/5));assert.equal(client(card(c),{breakthroughs:{[c.cardId]:level}},{}),power);const actor=buildFighter({...card(c),power,breakthroughLevel:level},0,'A',null,mode);speed??=actor.speed;assert.equal(actor.speed,speed);assert(actor.projectVBattleArt.primaryUrl.endsWith('.webp'));}
 }
});
test('each new card enters real PVE and both PVP sides with its own SD and finite server result',()=>{
 for(const c of NEW){
  const cards=[card(c),...Array.from({length:4},(_,i)=>({id:'QA'+i,power:100000,grade:'FUR'}))];
  const pve=createPveBattleV2({cards,monster:{id:1,name:'QA',battle_power:600000,isBoss:true},seed:17});
  for(const result of [pve,createPvpBattleV2({attackerCards:cards,defenderCards:cards,seed:17})]){assert(['A','B','DRAW'].includes(result.result.winner));assert(result.result.timeline.length>2);assert.equal(result.teams.A.cards[0].basePower,360000);assert.equal(result.teams.A.cards[0].projectVBattleArt.primaryUrl,'/'+c.sd);}
 }
});
test('server registry activates each intended technique, ignores forged tuning and leaves unassigned techniques closed',()=>{
 for(const spec of NEW){
  const actor=buildFighter(card(spec),0,'A'),ally=buildFighter({id:'ALLY',power:360000},1,'A'),enemy=buildFighter({id:'ENEMY',power:360000},0,'B');
  Object.assign(actor,{maxHp:10000000,hp:10000000,attack:500000,speed:100000,iconTechnique:{code:'FORMATION_EDIT',tuning:{}}});Object.assign(ally,{maxHp:10000000,hp:10000000,speed:100});Object.assign(enemy,{maxHp:10000000,hp:10000000,attack:100,speed:100});
  if(spec.techniqueCode==='CROWN_USURP')enemy.iconEmpower={percent:25,remaining:5};
  if(spec.techniqueCode==='SKILL_ADVANCE'){const c={id:ICON_ROLES[2].cardId,grade:'ICON',power:180000};Object.assign(ally,buildFighter({...c,iconRole:iconRoleSnapshot(c,defaultIconRoles(),'PVP')},1,'A'));ally.hp=ally.maxHp=10000000;ally.speed=1000;}
  if(spec.techniqueCode==='RETURN_OATH'){ally.hp=0;ally.alive=false;enemy.hp=100;}
  const result=simulateBattleV2Preview({teamA:[actor,ally],teamB:[enemy],seed:7,maxActions:30});
  assert(result.timeline.some(e=>e.techniqueCode===spec.techniqueCode&&e.phase==='CAST'),spec.code);assert(!result.timeline.some(e=>e.techniqueCode==='FORMATION_EDIT'));
  if(spec.techniqueCode==='AUTONOMOUS_WEAPON')assert(result.timeline.some(e=>e.type==='ICON_SUMMON'));
  if(spec.techniqueCode==='RETURN_OATH')assert(result.timeline.some(e=>e.phase==='REVIVE'));
 }
});
