import {validateCatalog} from '../mercenary-codex/model.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {equipmentFixture} from './helpers/workshop-equipment-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {KAIRON_CODE,KAIRON_ART,KAIRON_COMBAT,KAIRON_AREA_SKILL,KAIRON_AREA_EVENT,kaironIncomingDamage} from '../shared/mercenary-kairon-v1.mjs';
import {JINMU_COMBAT} from '../shared/mercenary-jinmu-v1.mjs';
import {KAIRON_CRAFT_KEY,kaironCraftDraft,validateKaironCraft,kaironCraftRecipe} from '../shared/mercenary-craft-v1.mjs';
import {readKaironCraft,saveKaironCraft,decorateMercenaryCraft} from '../functions/_mercenary_craft.js';
import {__workshopCraftTest} from '../functions/_workshop.js';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryGradePools,mercenaryCardChances} from '../shared/mercenary-draw-policy-v1.mjs';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {resolveKaironArea} from '../functions/_mercenary_kairon.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
const snapshot=code=>({...limitedDeploymentSnapshot(code),combat:fixture.combat});
const fighter=(code=KAIRON_CODE,side='A',mode='PVP',power=0)=>buildMercenaryFighter({...snapshot(code),equipment:{schemaVersion:1,mode,power}},side,mode,buildFighter);
const draft=()=>({code:'WORKSHOP_KAIRON',category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:KAIRON_CODE,outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:null,masterStarCost:null,successRate:null,materials:[],isActive:false,isPublic:false});
const configured=()=>({...draft(),coinCost:1000,masterStarCost:2,successRate:100,materials:[{itemCode:'QA_MATERIAL',quantity:3}],isActive:true,isPublic:true});
test('Kairon keeps its original baseline while Jinmu is 20% stronger with the same equipment and cadence',()=>{
 assert.notEqual(KAIRON_COMBAT,JINMU_COMBAT);
 assert.deepEqual(KAIRON_COMBAT,{version:1,basePower:1347840,statsReferencePower:1123200,statScale:1.2,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2.6,link:{attackPercent:2196.48,hpPercent:1397.76,shieldPercent:763.68},basicCapScale:2.4,damageTakenScale:.25,hardCounter:'V-055'});
 const higher=(a,b)=>assert(Math.abs(a-b*1.2)<=3,`${a} must be 20% above ${b}`);
 for(const mode of ['PVE','PVP'])for(const gear of [0,1e8])for(const power of [1e5,2e7,1e9]){
  const k=fighter(KAIRON_CODE,'A',mode,gear),j=fighter('V-989','B',mode,gear);
  for(const field of ['attack','maxHp','defense'])higher(j[field],k[field]);
  for(const field of ['speed','counterImmune','controlImmune','poisonImmune'])assert.equal(k[field],j[field],field);
  assert.equal(k.basePower-gear,1347840);
  applyMercenaryCombatLink(['A','B'].map((side,i)=>[...tierCards(power).map((c,n)=>buildFighter(c,n,side,null,mode)),[k,j][i]]));
  higher(mercenaryEffectiveAttack(j),mercenaryEffectiveAttack(k));higher(j.maxHp,k.maxHp);higher(j.shield,k.shield);
  assert.deepEqual(k.skills.map(s=>s.id),mode==='PVE'?['MS-988']:[]);assert.equal(k.attackStyle,'RANGED');
 }
 const k=fighter(),a={id:'card',side:'A',hp:1},enemy={id:'enemy',side:'B',hp:1},cadence=mercenaryTurnCadence({A:[a,k],B:[enemy]});let count=0;
 for(let i=0;i<25;i++){cadence.acted(a);while(cadence.pending()){assert.equal(cadence.pending(),k);cadence.acted(k);count++;assert(count<100);}}
 assert.equal(count,78);assert.equal(kaironIncomingDamage(k,1000,{isMercenary:true,code:'V-055'}),0);assert.equal(kaironIncomingDamage(k,1000,{}),250);
});
test('Kairon packs remain impossible even with a contaminated catalog and maximum CMS weight',()=>{
 const rules={cardWeights:{[KAIRON_CODE]:1000000}},cards=[{code:KAIRON_CODE,name:'카이론',rank:'SSS'},{code:'V-001',name:'일반',rank:'SSS'}];
 assert.equal(mercenaryAcquisitionEnabled(KAIRON_CODE,rules),false);
 assert.deepEqual(mercenaryGradePools(cards,cards.map(c=>c.code),rules).SSS,['V-001']);
 assert.equal(mercenaryCardChances(1000000,[KAIRON_CODE],rules)[0].percent,0);
 assert.deepEqual(limitedNormalCards(cards,cards,rules).map(c=>c.code),['V-001']);
 assert(!LIMITED_MERCENARIES.some(c=>c.code===KAIRON_CODE));
});
test('one quantum cast keeps the original 560% budget and applies one receipt per living target; PVP only fires basics',()=>{
 const actor=fighter(KAIRON_CODE,'A','PVE'),targets=Array.from({length:5},(_,i)=>({id:'t'+i,hp:10000,maxHp:10000,alive:true})),ratios=[],events=[];
 const args={actor,skill:KAIRON_AREA_SKILL,targets:[...targets,targets[0],{id:'dead',hp:0}],hit:(a,t,r)=>{ratios.push(r);return {damage:100};},damage:(t,n)=>{t.hp-=n;return {hpDamage:n,absorbed:0};},knockout(){},emit:(type,row)=>events.push({type,...row})};
 assert.equal(resolveKaironArea(args).length,5);assert(Math.abs(ratios.reduce((a,b)=>a+b)-5.6)<1e-9);assert.equal(events[0].type,KAIRON_AREA_EVENT);assert(targets.every(t=>t.hp===9900));
 assert.deepEqual(resolveKaironArea({...args,actor:{...actor,battleMode:'PVP'}}),[]);
 const cards=tierCards(2e7),k=snapshot(KAIRON_CODE);
 assert(createPveBattleV2({cards,mercenary:k,monster:{id:1,battle_power:1.6e10},seed:77}).result.timeline.some(e=>e.type===KAIRON_AREA_EVENT));
 assert(!createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:k,defenderMercenary:snapshot('V-989'),seed:77}).result.timeline.some(e=>e.type===KAIRON_AREA_EVENT));
});
test('unset/partial CMS drafts remain null and locked; no recipe economics or acquisition is seeded',async t=>{
 const f=await equipmentFixture(t,true),before=await f.p('SELECT coin FROM users WHERE id=7').first();
 assert.deepEqual((await readKaironCraft(f.env)).policy,kaironCraftDraft());
 const recipe=(await decorateMercenaryCraft(f.env,[],{admin:true}))[0];assert.equal(recipe.craftLocked,true);assert.equal(recipe.success_rate,null);assert.equal(recipe.coin_cost,null);
 await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{recipeId:-988,requestId:'locked'}),/잠금/);
 await assert.rejects(saveKaironCraft(f.env,f.user,{...draft(),isActive:true}),/제작 잠금/);
 assert.equal(await saveKaironCraft(f.env,f.user,draft()),-988);
 await saveKaironCraft(f.env,f.user,{...draft(),craftRevision:1,materials:[{itemCode:'QA_MATERIAL',quantity:null}]});
 assert.equal((await readKaironCraft(f.env)).policy.materials[0].quantity,null);
 assert.equal(await f.p("SELECT id FROM workshop_recipes_v1668 WHERE code='WORKSHOP_KAIRON'").first(),null);
 assert.deepEqual(await f.p('SELECT coin FROM users WHERE id=7').first(),before);
 await assert.rejects(saveKaironCraft(f.env,{...f.user,role:'USER'},draft()),/OWNER/);
 await assert.rejects(saveKaironCraft(f.env,f.user,{...configured(),craftRevision:2,outputRef:'V-989'}),/변경/);
 assert.throws(()=>validateKaironCraft({...kaironCraftDraft(),coinCost:-1}));
});
test('configured craft charges and grants atomically, replays without reroll, tracks duplicates and obeys OFF',async t=>{
 const f=await equipmentFixture(t,true),id=await saveKaironCraft(f.env,f.user,configured()),body={recipeId:id,paymentType:'BOTH',requestId:'kairon-atomic-01'};
 const coin=()=>f.p('SELECT coin FROM users WHERE id=7').first().then(r=>Number(r.coin));const before=await coin();
 const first=await __workshopCraftTest.craft(f.env,f.user,body),replay=await __workshopCraftTest.craft(f.env,f.user,body);
 assert.equal(first.success,true);assert.equal(first.output.ref,KAIRON_CODE);assert.equal(replay.replayed,true);assert.equal(await coin(),before-1000);
 assert.equal(await f.quantity('QA_MATERIAL'),97);assert.equal(await f.quantity('MASTER_STAR'),98);
 assert.equal(Number((await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',KAIRON_CODE).first()).total_copies),1);
 await __workshopCraftTest.craft(f.env,f.user,{...body,requestId:'kairon-atomic-02'});
 const owned=await f.p('SELECT total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=7 AND mercenary_code=?',KAIRON_CODE).first();assert.equal(Number(owned.total_copies),2);assert.equal(Number(owned.duplicate_count),1);
 await assert.rejects(saveKaironCraft(f.env,f.user,configured()),/변경/);
 await saveKaironCraft(f.env,f.user,{...configured(),craftRevision:1,isActive:false});
 const after=await coin();await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{...body,requestId:'kairon-off'}));assert.equal(await coin(),after);
 assert.equal((await __workshopCraftTest.craft(f.env,f.user,body)).replayed,true);
});
test('failed craft consumes only configured inputs; an acquisition insert failure rolls everything back',async t=>{
 const f=await equipmentFixture(t,true),id=await saveKaironCraft(f.env,f.user,{...configured(),successRate:0});
 const body={recipeId:id,paymentType:'BOTH',requestId:'kairon-failed'};
 const fail=await __workshopCraftTest.craft(f.env,f.user,body);assert.equal(fail.success,false);assert.equal(await f.quantity('QA_MATERIAL'),97);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_cards_v1').first()).n),0);
 await saveKaironCraft(f.env,f.user,{...configured(),craftRevision:1});
 const before=await f.p('SELECT coin FROM users WHERE id=7').first();
 // Driver-independent DB failure inside the same transaction.
 await f.pg.exec("CREATE FUNCTION qa_reject_kairon() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_INJECTED_ACQUISITION_FAILURE'; END $$; CREATE TRIGGER qa_reject_kairon BEFORE INSERT ON mercenary_card_acquisitions_v1 FOR EACH ROW EXECUTE FUNCTION qa_reject_kairon();");
 await assert.rejects(__workshopCraftTest.craft(f.env,f.user,{...body,requestId:'kairon-rollback'}));
 assert.deepEqual(await f.p('SELECT coin FROM users WHERE id=7').first(),before);assert.equal(await f.quantity('QA_MATERIAL'),97);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_cards_v1').first()).n),0);
});
test('ordinary owners may deploy a crafted Kairon in PVE/PVP; the public codex describes craft-only acquisition',async t=>{
 const f=await mercenaryFixture(t,{postgres:false}),user={...f.user,role:'USER'};
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:KAIRON_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',user.id,KAIRON_CODE,'2026-10-14','2026-10-14').run();
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:KAIRON_CODE,revision:0});
  const row=await loadMercenaryBattleSnapshot(f.env,user,mode);assert.equal(row.code,KAIRON_CODE);assert.equal(row.basePower,KAIRON_COMBAT.basePower);
 }
 assert.equal((await mercenaryAccountState(f.env,user)).cards[0].name,'카이론');
 const card=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1})).cards.find(c=>c.code===KAIRON_CODE);
 assert.equal(card.acquisition,'CRAFT_ONLY');assert.equal(card.packAcquisitionEnabled,false);
});
test('approved art stays byte-identical and the production PVE/PVP consumers include the Kairon renderer',()=>{
 for(const [file,sha]of [[KAIRON_ART.sourceArt,KAIRON_ART.sourceArtSha256],[KAIRON_ART.battleSprite,KAIRON_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),sha);
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 assert(report.sources.some(s=>s.file.endsWith('/KaironCombatPlayback.js')));
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js']){
  const code=fs.readFileSync(file,'utf8');assert(code.includes('MERCENARY_KAIRON_AREA'),file);assert(code.includes('KAIRON_MOTION_ASSETS'),file);
 }
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js'])assert(fs.readFileSync(file,'utf8').includes('kairon=20261014-craft-v1'),file);
});
