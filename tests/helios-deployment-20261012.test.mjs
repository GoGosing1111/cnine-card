import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {HELIOS_COMBAT,HELIOS_AREA_SKILL} from '../shared/mercenary-helios-v1.mjs';
const rid=()=>crypto.randomUUID();
test('Helios ownership gates independent PVE/PVP slots; both modes may share the card and retain it on reload',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={...f.user,role:'USER'};
 for(const mode of ['PVE','PVP'])await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mode,mercenaryCode:'V-999',revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)','V-999','2026-10-12','2026-10-12').run();
 const coin=await f.coin();
 for(const mode of ['PVE','PVP']){
  const body={requestId:rid(),mode,mercenaryCode:'V-999',revision:0};
  const result=await saveMercenaryLoadout(f.env,user,body);assert.equal(result.mode,mode);assert.equal(result.revision,1);
  assert.equal((await saveMercenaryLoadout(f.env,user,body)).replayed,true);
  const single=await loadMercenaryBattleSnapshot(f.env,user,mode),batch=await releasedMercenarySnapshots(f.env,[7,8],mode);
  assert.deepEqual(batch.get(7),single);assert.equal(batch.has(8),false);assert.equal(single.code,'V-999');assert.equal(single.basePower,HELIOS_COMBAT.basePower);assert.deepEqual(single.skills,[HELIOS_AREA_SKILL]);
 }
 const state=await mercenaryAccountState(f.env,user);assert.equal(state.cards[0].canDeploy,true);assert.equal(state.loadouts.PVE.mercenaryCode,'V-999');assert.equal(state.loadouts.PVP.mercenaryCode,'V-999');
 await saveMercenaryLoadout(f.env,user,{requestId:rid(),mode:'PVE',mercenaryCode:null,revision:1});
 assert.equal(await loadMercenaryBattleSnapshot(f.env,user,'PVE'),null);assert.equal((await loadMercenaryBattleSnapshot(f.env,user,'PVP')).code,'V-999');assert.equal(await f.coin(),coin);
});
test('production renderer and main loader include authoritative Helios playback with cache invalidation',()=>{
 assert.equal(limitedDeploymentSnapshot('V-999').deploymentEnabled,true);
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 assert(report.sources.some(s=>s.file.endsWith('/HeliosCombatPlayback.js')));
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js']){
  const bundle=fs.readFileSync(file,'utf8');assert(bundle.includes('MERCENARY_HELIOS_AREA'),file);assert(bundle.includes('HELIOS_MOTION_ASSETS'),file);
 }
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(fs.readFileSync(file,'utf8').includes('20261012-helios-deploy-v1'),file);
});
