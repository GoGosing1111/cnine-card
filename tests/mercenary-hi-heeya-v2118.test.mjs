import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {HEEYA_BALANCE,HEEYA_IMPACTS} from '../shared/mercenary-hi-heeya-v2118.mjs';
import {mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {buildMercenaryFighter,mercenaryCombat} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
const art=seed.catalog.cards.find(c=>c.code==='V-044'),skill=seed.document.skills.find(s=>s.id==='MS-044');
const legacy=()=>({...structuredClone(seed.document),mercenaries:structuredClone(seed.document.mercenaries.filter(c=>c.code!=='V-044')),skills:structuredClone(seed.document.skills.filter(s=>s.id!=='MS-044')),assignments:structuredClone(seed.document.assignments.filter(c=>c.code!=='V-044'))});
test('complete previous CMS expands exactly once and retains every saved operator field',()=>{
 const old=legacy();old.mercenaries[0].name='저장 이름';old.skills[0].balance={damageRatio:9,cooldownTurns:8,cost:7};old.assignments[0].skillIds=['MS-004'];
 const before=structuredClone(old),next=expandMercenarySkillCatalog(old,seed.document,seed.catalog);
 for(const key of ['mercenaries','skills','assignments'])assert.deepEqual(next[key].slice(0,-1),before[key]);
 assert.deepEqual(old,before);assert.deepEqual(expandMercenarySkillCatalog(next,seed.document,seed.catalog),next);
 assert.deepEqual(next.skills.at(-1).balance,HEEYA_BALANCE);assert.deepEqual(next.assignments.at(-1).skillIds,['MS-044']);
 const broken=legacy();broken.mercenaries.pop();assert.throws(()=>expandMercenarySkillCatalog(broken,seed.document,seed.catalog));
 const changed=structuredClone(next);changed.skills.at(-1).balance.cost=30;changed.assignments.at(-1).skillIds=[];
 assert.deepEqual(expandMercenarySkillCatalog(changed,seed.document,seed.catalog),changed,'Later explicit CMS edits stay authoritative');
 const pools=mercenaryGradePools(next.mercenaries,seed.catalog.cards.map(c=>c.code));assert.ok(JSON.stringify(pools.SS).includes('V-044'));
});
test('approved source art and SD bytes, anchors and full nine-shot timing are preserved',()=>{
 for(const [file,expected]of [[art.sourceArt,art.sourceArtSha256],[art.battleSprite,art.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex').toUpperCase(),expected);
 const sd=fs.readFileSync(new URL('../'+art.battleSprite,import.meta.url));assert.equal(sd[25],6);assert.equal(sd.readUInt32BE(16),1024);assert.equal(sd.readUInt32BE(20),1536);
 assert.deepEqual(art.battleSpriteFootAnchor,{x:.5,y:1485/1536});assert.deepEqual(HEEYA_IMPACTS,[.66,.83,1,1.17,1.34,1.51,1.68,1.85,2.02]);
 assert.notEqual(art.battleSprite,art.sourceArt);
});
const snapshot={code:'V-044',name:'하이희야',rank:'SS',role:'MARKSMAN',position:'MIDDLE',level:1,basePower:120000,stats:{hp:100000,attack:1000,defense:100,speed:100},skills:[skill],combat,sourceArt:art.sourceArt,battleSprite:art.battleSprite};
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: SS draw grants Hi Heeya once, duplicate replay cannot charge twice, and loadout carries the approved skill`,async t=>{
 const f=await mercenaryFixture(t,{postgres});for(const o of f.draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(f.draw);
 const before=await f.coin(),request={requestId:crypto.randomUUID(),count:2};
 const result=await openMercenaryCards(f.env,f.user,request,{randomInt:()=>0});assert.ok(result.draws.every(d=>d.mercenaryCode==='V-044'));
 assert.deepEqual(result.draws.map(d=>d.duplicate),[false,true]);assert.equal(await f.coin(),before-2000);
 await openMercenaryCards(f.env,f.user,request,{randomInt:()=>{throw Error('Unexpected reroll');}});assert.equal(await f.coin(),before-2000);
 await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-044',revision:0});
 const deployed=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(deployed.rank,'SS');assert.equal(deployed.basePower,120000);assert.equal(deployed.battleSprite,art.battleSprite);assert.deepEqual(deployed.skills.map(s=>s.id),['MS-044']);
});
test('nine tracer visuals consume one damage budget, one energy cost and one cooldown; no retarget after loss',()=>{
 for(const outcome of ['hit','dodge','lost']){
  const actor=buildMercenaryFighter(snapshot,'A','PVP'),enemy={...actor,id:'B:TARGET',side:'B',slot:0,isMercenary:false,hp:100000},other={...enemy,id:'B:OTHER',slot:1},events=[];let rolls=0;
  const runtime=mercenaryCombat({teams:{A:[actor],B:[enemy,other]},hit:(_a,_t,r)=>{rolls++;return {damage:1000*r,dodge:outcome==='dodge'};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout:()=>{},emit:(type,data)=>events.push({type,...data}),clock:()=>0});
  actor.actions++;runtime.beforeAction(actor);assert.equal(runtime.state(actor).energy,75);
  if(outcome==='lost'){enemy.hp=0;enemy.alive=false;}
  actor.actions++;runtime.beforeAction(actor);
  assert.equal(rolls,outcome==='lost'?0:1);assert.equal(other.hp,100000);
  assert.equal(events.filter(e=>e.type==='MERCENARY_HIT').length,outcome==='lost'?0:1);
  if(outcome!=='lost')assert.equal(enemy.hp,outcome==='hit'?95800:100000);
  assert.equal(runtime.state(actor).energy,75);assert.equal(runtime.state(actor).cooldown.get('MS-044'),6);
 }
});
test('real PVE and PVP snapshots use separate optional SS slot and server skill events',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:'TEST-'+i,title:'검수 '+i,rarity:'FUR',power:100000,power_type:'ATTACK'}));
 const merc={...snapshot,statMode:'RANK_FIXED'};
 for(const data of [createPveBattleV2({cards,mercenary:merc,monster:{id:1,name:'검수',battle_power:1000000},seed:17}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:merc,defenderMercenary:merc,seed:12})]){
  assert.equal(data.teams.A.cards.length,5);assert.equal(data.teams.A.mercenaries.length,1);assert.equal(data.teams.A.mercenaries[0].cardId,'V-044');
  assert.ok(data.result.timeline.some(e=>e.skillId==='MS-044'&&e.type==='MERCENARY_HIT'));
 }
});
