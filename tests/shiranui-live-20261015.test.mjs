import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {SHIRANUI_CODE,SHIRANUI_ART,SHIRANUI_COMBAT,SHIRANUI_AREA_SKILL} from '../shared/mercenary-shiranui-v1.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {ensureAccountRank,SHIRANUI_MIN_RANK_TICKS} from '../functions/_account_rank.js';
const rid=()=>crypto.randomUUID();
test('approved art, thumbnail, shipped bundles and live cache tags are connected',()=>{
 for(const [file,expected]of [[SHIRANUI_ART.sourceArt,SHIRANUI_ART.sourceArtSha256],[SHIRANUI_ART.battleSprite,SHIRANUI_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),expected);
 assert(fs.statSync('assets/ui/project-v/mercenaries/codex-v1/v-987-art-320.webp').size>0);
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 assert(report.sources.some(s=>s.file.endsWith('/ShiranuiCombatPlayback.js')));
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js']){
  const s=fs.readFileSync(file,'utf8');assert(s.includes('MERCENARY_SHIRANUI_AREA'),file);assert(s.includes('SHIRANUI_MOTION_ASSETS'),file);
 }
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(fs.readFileSync(file,'utf8').includes('shiranui-live-v1'),file);
 const appVersion=fs.readFileSync('index.html','utf8').match(/js\/app\.js\?v=([^&"]+)/)?.[1];
 const shellCache=fs.readFileSync('service-worker.js','utf8').match(/const SHELL_CACHE='([^']+)'/)?.[1];
 assert(appVersion);assert.equal(shellCache,'soop-card-shell-v'+appVersion,'installed shell follows the current app release');
 const approved=JSON.parse(fs.readFileSync('preview/mercenary-monochrome-artillery-battle-v1/live-approval-20261015.json'));
 assert.equal(approved.identity.code,SHIRANUI_CODE);assert.equal(approved.acquisition.public,false);
});
test('Shiranui deployment requires lieutenant general for every account; random acquisition pools stay closed',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),allowed=[{id:1,role:'OWNER'}],blocked=[{...f.user,role:'OWNER'},{id:4977,role:'USER'},{id:4824,role:'USER'}];
 for(const [id,name]of [[1,'핑크빛유두'],[4977,'하이희야♡'],[4824,'헬로희야']])await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',id,name).run();
 assert(!LIMITED_MERCENARIES.some(c=>c.code===SHIRANUI_CODE));
 assert(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===SHIRANUI_CODE));
 assert(!MERCENARY_CMS_SEED.document.mercenaries.some(c=>c.code===SHIRANUI_CODE));
 for(const u of [...allowed,...blocked])await assert.rejects(saveMercenaryLoadout(f.env,u,{requestId:rid(),mode:'PVE',mercenaryCode:SHIRANUI_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const id of [1,4977,7,4824])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,SHIRANUI_CODE,'2026-10-12','2026-10-12').run();
 await ensureAccountRank(f.env);await f.p('INSERT INTO account_rank_progress_v1(user_id,total_ticks) VALUES(1,?)',SHIRANUI_MIN_RANK_TICKS).run();
 for(const mode of ['PVE','PVP']){
  for(const user of blocked)await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mode,mercenaryCode:SHIRANUI_CODE,revision:0}),{code:'MERCENARY_ACCOUNT_RANK'});
  for(const user of allowed){
   const body={requestId:rid(),mode,mercenaryCode:SHIRANUI_CODE,revision:0};
   await saveMercenaryLoadout(f.env,user,body);
   assert.equal((await saveMercenaryLoadout(f.env,user,body)).replayed,true);
   const one=await loadMercenaryBattleSnapshot(f.env,user,mode),batch=await releasedMercenarySnapshots(f.env,[1,4977,7,4824],mode);
   assert.equal(one.code,SHIRANUI_CODE);assert.equal(one.basePower,SHIRANUI_COMBAT.basePower);assert.deepEqual(one.skills,[SHIRANUI_AREA_SKILL]);
   assert.deepEqual(batch.get(user.id),one);for(const rejected of blocked)assert.equal(batch.has(rejected.id),false);
  }
 }
 for(const user of blocked){const cards=(await mercenaryAccountState(f.env,user)).cards;assert.equal(cards.length,1);assert.equal(cards[0].canDeploy,false);}
 for(const user of allowed){
  const state=await mercenaryAccountState(f.env,user);
  assert.equal(state.cards[0].canDeploy,true);assert.equal(state.cards[0].exclusiveGrant,false);assert.equal(state.cards[0].excludedFromLimitedCount,false);
  await saveMercenaryLoadout(f.env,user,{requestId:rid(),mode:'PVE',mercenaryCode:null,revision:1});
  assert.equal(await loadMercenaryBattleSnapshot(f.env,user,'PVE'),null);assert.equal((await loadMercenaryBattleSnapshot(f.env,user,'PVP')).code,SHIRANUI_CODE);
 }
});
