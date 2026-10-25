import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {HALLOWEEN_COMBAT} from '../shared/mercenary-halloween-combat-v1.mjs';
import {SS_LIMITED_COMBAT,ssLimitedProfile,ssLimitedActionCredit,mercenaryCombatRank} from '../shared/mercenary-ss-limited-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {limitedVisual} from '../shared/mercenary-limited-visuals-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {buildMercenaryFighter,mercenaryTurnCadence} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';
import {halloweenFixture} from './helpers/halloween-pack-fixture.mjs';
import {saveHalloweenPack} from '../functions/_mercenary_halloween_pack.js';
import {saveMercenaryLoadout,loadMercenaryBattleSnapshot} from '../functions/_mercenary_account.js';

const hash=p=>createHash('sha256').update(fs.readFileSync(p.replace(/^\//,''))).digest('hex').toUpperCase();
test('all pack identities have exact source/SD resources and one public codex entry',()=>{
 const doc=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1}));
 for(const c of HALLOWEEN_PACK_CARDS){
  assert.equal(hash(c.sourceArt),c.sourceArtSha256);assert.equal(hash(c.battleSprite),c.battleSpriteSha256??limitedVisual(c.code)?.spriteSha256);
  const rows=doc.cards.filter(r=>r.code===c.code);assert.equal(rows.length,1);assert.equal(rows[0].deploymentEnabled,true);assert.equal(rows[0].battleSprite,c.battleSprite);
  if(c.season==='HALLOWEEN'){
   assert.equal(rows[0].basePower,216000);assert.equal(rows[0].skills.length,1);
   const v=limitedVisual(c.code);assert.equal(hash(v.sprite),v.spriteSha256);assert.equal(hash(v.effects.url),v.effects.sha256);
   assert.equal(v.effects.frames.length,16);assert.equal(new Set(v.effects.frames.map(f=>f.pixelSha256||f.rawSha256)).size,16);
   assert.equal(v.bodyMotion,'STATIC_SD_USER_SELECTED');assert.ok(v.feet.y>v.headTop&&v.feet.y<v.spriteHeight);
  }
 }
});

test('Halloween power, tempo, skill and rank are server-owned; old identities and prototype keys remain isolated',()=>{
 for(const code of Object.keys(HALLOWEEN_COMBAT))for(const mode of ['PVE','PVP']){
  const a=buildMercenaryFighter({...limitedDeploymentSnapshot(code),rank:'C',basePower:1,skills:[]},'A',mode,buildFighter);
  assert.equal(a.rank,'SS');assert.equal(a.basePower,216000);assert.equal(mercenaryCombatRank(a),'SSS');assert.equal(a.skills[0].balance.damageRatio,6.72);
  assert.equal(ssLimitedActionCredit([a]),2.25);assert.ok(a.skills[0].name);assert.equal(ssLimitedProfile({...a,isMercenary:false}),null);
 }
 for(const code of ['constructor','__proto__','toString','V-989'])assert.equal(ssLimitedProfile({code,isMercenary:true}),null);
 for(const c of Object.values(SS_LIMITED_COMBAT)){assert.equal(c.basePower,180000);assert.equal(c.skill.balance.damageRatio,5.6);}
 const a=buildMercenaryFighter(limitedDeploymentSnapshot('V-980'),'A','PVP',buildFighter),card={id:'card',side:'A',hp:1,alive:true};
 const cadence=mercenaryTurnCadence({A:[card,a],B:[]});let turns=0;
 for(let i=0;i<4;i++){cadence.acted(card);while(cadence.pending()){cadence.acted(a);turns++;}}
 assert.equal(turns,9);
});

test('every seasonal skill executes on the canonical PVE clock, including Diim shields',()=>{
 for(const code of Object.keys(HALLOWEEN_COMBAT)){
  const battle=createPveBattleV2({cards:tierCards(2e7),mercenary:limitedDeploymentSnapshot(code),monster:{id:1,battle_power:6e8},seed:7919});
  const events=battle.result.timeline.filter(e=>e.actorId?.includes(code));
  assert.ok(events.some(e=>e.skillId==='MS-'+code.slice(2)),code);
  assert.ok(events.some(e=>code==='V-984'?e.type==='MERCENARY_BUFF'&&e.amount>0:e.type==='MERCENARY_HIT'&&e.damage>0),code);
 }
});

test('holdout favors every Halloween fighter over the existing SS tier while SSS limited retain the higher tier',()=>{
 const r=JSON.parse(fs.readFileSync('docs/halloween-limited-balance-20261017.json'));
 assert.equal(r.policySha256,createHash('sha256').update(JSON.stringify(HALLOWEEN_COMBAT)).digest('hex'));
 assert.equal(r.existingPolicySha256,createHash('sha256').update(JSON.stringify(SS_LIMITED_COMBAT)).digest('hex'));
 assert.equal(r.start,36101);assert.equal(r.count,16);assert.equal(r.rows.length,7);
 for(const row of r.rows){assert.equal(row.total,1120);assert.ok(row.winRate>=.7,row.code);assert.ok(row.opponents.slice(-3).every(o=>o.winRate<=.1));}
});

test('OWNER can explicitly save ready ON, stop it, and cannot open incomplete odds; no free holdings appear',async t=>{
 const f=await halloweenFixture(t);f.settings.mode='OFF';await f.configure();assert.equal((await f.state()).userOpeningEnabled,false);
 const body={expectedRevision:1,settings:{...f.settings,mode:'ON'},requestId:crypto.randomUUID(),reason:'격리 DB 운영 전환 검사'};
 const on=await saveHalloweenPack(f.env,f.user,body);assert.equal(on.userOpeningEnabled,false);assert.equal(on.shopEnabled,false);assert.equal(on.settings.mode,'ON');assert.equal(on.revision,2);
 assert.equal((await saveHalloweenPack(f.env,f.user,body)).replayed,true);
 const off=await saveHalloweenPack(f.env,f.user,{...body,expectedRevision:2,settings:{...on.settings,mode:'OFF'},requestId:crypto.randomUUID()});assert.equal(off.userOpeningEnabled,false);
 await assert.rejects(f.service.open(f.env,f.user,{...f.body(),expectedRevision:3}),{code:'MERCENARY_HALLOWEEN_CLOSED'});
 await assert.rejects(saveHalloweenPack(f.env,f.user,{...body,expectedRevision:3,settings:{...on.settings,normalSssRatePpm:null},requestId:crypto.randomUUID()}),{code:'MERCENARY_HALLOWEEN_CONFIG'});
 assert.equal(await f.coin(),1000000);assert.equal((await f.pg.query('SELECT * FROM user_mercenary_cards_v1')).rows.length,0);
});

test('seasonal deployment requires ownership and retains canonical stats after saving each loadout',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await ensureLimitedPackSchema(f.env);const user={...f.user,role:'USER'};
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mercenaryCode:'V-980',revision:0}),{code:'MERCENARY_NOT_OWNED'});
 let revision=0;
 for(const code of Object.keys(HALLOWEEN_COMBAT)){
  await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(?,?,1,0,?,?)',user.id,code,'2026-10-17','2026-10-17').run();
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mercenaryCode:code,revision:revision++});
  const snapshot=await loadMercenaryBattleSnapshot(f.env,user);assert.equal(snapshot.code,code);assert.equal(snapshot.basePower,216000);assert.equal(snapshot.skills.length,1);
 }
});
