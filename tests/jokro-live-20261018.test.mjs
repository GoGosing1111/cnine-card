import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {JOKRO_CODE,JOKRO_ART,JOKRO_COMBAT,JOKRO_AREA_SKILL} from '../shared/mercenary-jokro-v1.mjs';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';
const rid=()=>crypto.randomUUID();
test('approved art, thumbnail, shipped bundles and live cache tags are connected',()=>{
 for(const [file,expected]of [[JOKRO_ART.sourceArt,JOKRO_ART.sourceArtSha256],[JOKRO_ART.battleSprite,JOKRO_ART.battleSpriteSha256]])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),expected);
 assert(fs.statSync('assets/ui/project-v/mercenaries/codex-v1/v-979-art-320.webp').size>0);
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 assert(report.sources.some(s=>s.file.endsWith('/JokroCombatPlayback.js')));
 for(const file of ['preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/sustained-hunt-v2/battle.bundle.js','pve-v3/battle.bundle.js']){
  const s=fs.readFileSync(file,'utf8');assert(s.includes('MERCENARY_JOKRO_AREA'),file);assert(s.includes('jokro-iaido'),file);assert(!s.includes('JOKRO_MOTION_ASSETS'),file);
 }
 for(const file of ['index.html','js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(fs.readFileSync(file,'utf8').includes('jokro-live'),file);
 const appVersion=fs.readFileSync('index.html','utf8').match(/js\/app\.js\?v=([^&"]+)/)?.[1];
 const shellCache=fs.readFileSync('service-worker.js','utf8').match(/const SHELL_CACHE='([^']+)'/)?.[1];
 assert(appVersion);assert.equal(shellCache,'soop-card-shell-v'+appVersion,'installed shell follows the current app release');
 const approved=JSON.parse(fs.readFileSync('preview/mercenary-jokro-iaido-20261017-v1/live-approval-20261018.json'));
 assert.equal(approved.identity.code,JOKRO_CODE);assert.equal(approved.acquisition.public,false);
});
test('designated owner retains exclusive metadata; stray holdings and ordinary limited pools stay restricted',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),allowed=[{id:1,role:'OWNER'}],blocked=[{...f.user,role:'OWNER'},{id:4977,role:'USER'},{id:4824,role:'USER'}];
 await ensureLimitedPackSchema(f.env);
 for(const [id,name]of [[1,'핑크빛유두'],[4977,'하이희야♡'],[4824,'헬로희야']])await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',id,name).run();
 assert(!LIMITED_MERCENARIES.some(c=>c.code===JOKRO_CODE));
 assert(!MERCENARY_CMS_SEED.catalog.cards.some(c=>c.code===JOKRO_CODE));
 assert(!MERCENARY_CMS_SEED.document.mercenaries.some(c=>c.code===JOKRO_CODE));
 for(const u of [...allowed,...blocked])await assert.rejects(saveMercenaryLoadout(f.env,u,{requestId:rid(),mode:'PVE',mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 for(const id of [1,4977,7,4824])await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',id,JOKRO_CODE,'2026-10-12','2026-10-12').run();
 for(const mode of ['PVE','PVP']){
  for(const user of blocked)await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:rid(),mode,mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
  for(const user of allowed){
   const body={requestId:rid(),mode,mercenaryCode:JOKRO_CODE,revision:0};
   await saveMercenaryLoadout(f.env,user,body);
   assert.equal((await saveMercenaryLoadout(f.env,user,body)).replayed,true);
   const one=await loadMercenaryBattleSnapshot(f.env,user,mode),batch=await releasedMercenarySnapshots(f.env,[1,4977,7,4824],mode);
   assert.equal(one.code,JOKRO_CODE);assert.equal(one.basePower,JOKRO_COMBAT.basePower);assert.deepEqual(one.skills,[JOKRO_AREA_SKILL]);
   assert.deepEqual(batch.get(user.id),one);for(const rejected of blocked)assert.equal(batch.has(rejected.id),false);
  }
 }
 for(const user of blocked)assert.equal((await mercenaryAccountState(f.env,user)).cards.length,0);
 for(const user of allowed){
  const state=await mercenaryAccountState(f.env,user);
  assert.equal(state.cards[0].canDeploy,true);assert.equal(state.cards[0].exclusiveGrant,true);assert.equal(state.cards[0].excludedFromLimitedCount,true);
  await saveMercenaryLoadout(f.env,user,{requestId:rid(),mode:'PVE',mercenaryCode:null,revision:1});
  assert.equal(await loadMercenaryBattleSnapshot(f.env,user,'PVE'),null);assert.equal((await loadMercenaryBattleSnapshot(f.env,user,'PVP')).code,JOKRO_CODE);
 }
});
