import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {SS_LIMITED_COMBAT} from '../shared/mercenary-ss-limited-v1.mjs';
import {VALTER_COMBAT} from '../shared/mercenary-valter-v1.mjs';
import {LIMITED_DUO_ASSETS} from '../shared/mercenary-limited-duo-assets-20261008.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots,mercenarySnapshotPower,MERCENARY_RUNTIME_KEY} from '../functions/_mercenary_account.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {validateCatalog} from '../mercenary-codex/model.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {LIMITED_PACK_RELEASE_ENABLED} from '../shared/mercenary-limited-pack-v1.mjs';
import {createPveBattleV2,createPvpBattleV2,buildFighter} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {tierCards} from './helpers/mercenary-operating-roster-v2144.mjs';

const codes=LIMITED_MERCENARIES.map(c=>c.code),rid=()=>crypto.randomUUID();
async function own(f,code){await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',code,'2026-10-09','2026-10-09').run();}
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: all eight limited cards require ownership, persist, replay, replace and unequip`,async t=>{
 const f=await mercenaryFixture(t,{postgres}),user={...f.user,role:'USER'};
 await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,mode:'OFF',combat:fixture.combat});
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mercenaryCode:'V-990',revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mercenaryCode:'V-995',revision:0}),{code:'MERCENARY_CODE'});
 const before=await f.coin();let revision=0;
 for(const code of codes){
  await own(f,code);const body={requestId:rid(),mercenaryCode:code,revision};
  const saved=await saveMercenaryLoadout(f.env,user,body);assert.equal(saved.revision,++revision);
  assert.equal((await saveMercenaryLoadout(f.env,user,body)).replayed,true);
  const single=await loadMercenaryBattleSnapshot(f.env,user),batch=await releasedMercenarySnapshots(f.env,[7,8]);
  assert.deepEqual(batch.get(7),single);assert.equal(batch.has(8),false);assert.equal(single.code,code);
  assert.ok(single.battleSprite);assert.equal(single.basePower,code==='V-996'?VALTER_COMBAT.basePower:SS_LIMITED_COMBAT[code].basePower);
  assert.equal(mercenarySnapshotPower({...single,basePower:1,rank:'C'}),single.basePower);
  await assert.rejects(saveMercenaryLoadout(f.env,{...user,id:8},{requestId:rid(),mercenaryCode:code,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 }
 const state=await mercenaryAccountState(f.env,user);assert.equal(state.available,true);assert.equal(state.cards.length,8);assert.ok(state.cards.every(c=>c.canDeploy&&c.deploymentEnabled&&c.basePower>0));
 const publicCatalog=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(f.document),revision:1}));
 assert.ok(publicCatalog.cards.filter(c=>c.edition==='LIMITED').every(c=>c.deploymentEnabled&&c.acquisitionEnabled===false));
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mercenaryCode:null,revision:0}),{code:'MERCENARY_LOADOUT_CONFLICT'});
 f.fail('INSERT INTO user_mercenary_loadout_v1');const retry={requestId:rid(),mercenaryCode:null,revision};
 await assert.rejects(saveMercenaryLoadout(f.env,user,retry));f.fail('');
 assert.equal((await loadMercenaryBattleSnapshot(f.env,user)).code,codes.at(-1));
 await saveMercenaryLoadout(f.env,user,retry);assert.equal(await loadMercenaryBattleSnapshot(f.env,user),null);
 assert.equal((await releasedMercenarySnapshots(f.env,[7])).size,0);assert.equal(await f.coin(),before);
});

test('released snapshots retain the approved limited combat policies in PVE and PVP',()=>{
 for(const code of codes){
  const snapshot={...limitedDeploymentSnapshot(code),combat:fixture.combat};
  const old={...LIMITED_MERCENARIES.find(c=>c.code===code),statMode:'RANK_FIXED',level:1,combat:fixture.combat};
  for(const mode of ['PVE','PVP']){
   const current=buildMercenaryFighter(snapshot,'A',mode,buildFighter),reference=buildMercenaryFighter(old,'A',mode,buildFighter);
   for(const key of ['attack','defense','speed','maxHp','rank','role','attackStyle'])assert.equal(current[key],reference[key],code+' '+mode+' '+key);
   assert.deepEqual(current.skills,reference.skills);
  }
  const cards=tierCards(2e7),pve=createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,battle_power:6e8},seed:7919});
  assert.equal(pve.teams.A.mercenaries[0].cardId,code);assert.ok(pve.result.timeline.some(e=>e.actorId?.includes(code)));
  for(const side of ['A','B']){
   const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,...(side==='A'?{attackerMercenary:snapshot}:{defenderMercenary:snapshot}),seed:7919});
   assert.equal(pvp.teams[side].mercenaries[0].cardId,code);assert.ok(pvp.result.timeline.some(e=>e.actorId?.includes(code)));
  }
 }
 assert.equal(limitedDeploymentSnapshot('toString'),null);assert.equal(LIMITED_PACK_RELEASE_ENABLED,false);
 for(const code of codes)assert.equal(mercenaryAcquisitionEnabled(code,{cardWeights:{[code]:1}}),false);
});

test('found duo sprites and motion are preserved and registered in the real V3 playback',()=>{
 const hash=p=>createHash('sha256').update(fs.readFileSync(p.replace(/^\//,''))).digest('hex');
 for(const c of Object.values(LIMITED_DUO_ASSETS)){
  assert.equal(hash(c.source),c.sourceSha256);assert.equal(hash(c.sprite),c.spriteSha256);assert.equal(hash(c.atlas),c.atlasSha256);
  assert.equal(c.frames.length,12);assert.equal(new Set(c.frames.map(f=>f.sha256)).size,12);
  assert.equal(limitedDeploymentSnapshot(c.code).battleSprite,c.sprite.slice(1));
 }
 const playback=fs.readFileSync('preview/project-v-v3/source/battle/MercenaryCombatPlayback.js','utf8');
 assert.match(playback,/limitedDuoBattleArt\(card.code\|\|card.cardId\)/);
 assert.match(playback,/event.type==='MERCENARY_HIT'\)return playLimitedDuoSkill/);
 const build=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 assert.ok(build.sources.some(s=>s.file.endsWith('LimitedDuoCombatPlayback.js')));
});
