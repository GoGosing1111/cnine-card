import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {BLOODMOON_MERCENARIES,BLOODMOON_ORIGINAL_CODES as BLOODMOON_CODES} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {BLOODMOON_PACK,BLOODMOON_PACK_KEY,bloodmoonPackDraft,legacyBloodmoonPackDraft} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
import {ALL_LIMITED_MERCENARIES,LIMITED_MERCENARIES,isLimitedMercenary} from '../shared/mercenary-limited-catalog-v1.mjs';
import {HALLOWEEN_PACK_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {handleBloodmoonPack} from '../functions/_mercenary_bloodmoon_pack.js';
import {validateCatalog,filterCatalog} from '../mercenary-codex/model.mjs';
import {readBloodmoonRegistration,registerBloodmoonCodex} from '../scripts/ops/bloodmoon-codex-registration-20261023.mjs';
import {isProductionFile,bloodmoonNodeQaOnly} from '../scripts/prepare-production-assets.mjs';
import {bloodmoonFixture} from './helpers/bloodmoon-pack-fixture.mjs';
const catalog=()=>mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-23'});
const cards=BLOODMOON_MERCENARIES.filter(c=>BLOODMOON_CODES.includes(c.code));
test('five separate SS limited entries publish approved originals, full idle sprites and the reviewed balance',()=>{
 const document=validateCatalog(catalog()),found=filterCatalog(document.cards,{q:'블러드문',rank:'SS'},new Set()).filter(c=>BLOODMOON_CODES.includes(c.code));assert.deepEqual(found.map(c=>c.code),BLOODMOON_CODES);
 const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/bloodmoon-approved-20261023/manifest.json'));
 for(const c of found){assert.equal(c.serverLimit,20);assert.equal(c.basePower,356400);assert.equal(c.skills[0].ready,true);assert.equal(c.skills.length,1);assert.equal(c.deploymentEnabled,true);
  for(const field of ['sourceArt','battleSprite']){const b=fs.readFileSync(c[field]);assert.equal(createHash('sha256').update(b).digest('hex').toUpperCase(),c[field+'Sha256']);assert.deepEqual(b,fs.readFileSync(manifest.assets.find(a=>a.code===c.code)[field].original));}
 }
 const wrong=catalog();wrong.cards.find(c=>c.code==='V-960').packOpeningEnabled=true;assert.throws(()=>validateCatalog(wrong));
});
test('Bloodmoon cannot enter existing packs, normal acquisition, synthesis but can deploy when owned',()=>{
 for(const c of cards){assert(isLimitedMercenary(c.code));assert(ALL_LIMITED_MERCENARIES.includes(c));assert(!LIMITED_MERCENARIES.some(a=>a.code===c.code));assert(!HALLOWEEN_PACK_CARDS.some(a=>a.code===c.code));assert(!seed.catalog.cards.some(a=>a.code===c.code));assert.equal(mercenaryAcquisitionEnabled(c.code,{cardWeights:{[c.code]:999}}),false);assert.equal(limitedDeploymentSnapshot(c.code).code,c.code);}
 assert.equal(bloodmoonPackDraft().mode,'OFF');assert.deepEqual(bloodmoonPackDraft().prices,{single:null,ten:null});
});
test('opening requires authentication before DB, body or currency access',async()=>{
 const never=new Proxy({},{get(){throw Error('Opening must not access a database or account');}}),json=(body,status=200,headers)=>({body,status,headers});
 for(const body of ['{}','{"count":1}','{"count":10,"mode":"ON"}']){const r=await handleBloodmoonPack({path:BLOODMOON_PACK.openPath,request:new Request('https://test/api/'+BLOODMOON_PACK.openPath,{method:'POST',body}),env:never,deps:{json,authenticate:async()=>null}});assert.equal(r.status,401);}
 assert.equal(await handleBloodmoonPack({path:'other',request:{},env:never,deps:{json}}),null);
});
test('public feature preserves the legacy OFF draft and ten copies without writing',async t=>{
 const f=await bloodmoonFixture(t);await f.pg.exec("UPDATE mercenary_limited_stock_v1 SET stock_limit=10 WHERE code IN ('V-960','V-961','V-962','V-963','V-964','V-965')");await f.setting(BLOODMOON_PACK_KEY,{revision:1,settings:legacyBloodmoonPackDraft()});
 const before=JSON.stringify((await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows);
 const r=await handleBloodmoonPack({path:BLOODMOON_PACK.featurePath,request:{method:'GET'},env:f.env,deps:{json:(body,status)=>({body,status})}});
 assert.equal(r.status,200);assert.equal(r.body.userOpeningEnabled,false);assert.equal(r.body.packSettings.mode,'OFF');assert(r.body.stock.filter(s=>BLOODMOON_CODES.includes(s.code)).every(s=>s.limit===10&&s.issued===0&&s.remaining===10));
 assert.equal(JSON.stringify((await f.pg.query('SELECT * FROM app_meta ORDER BY key')).rows),before);
});
test('delivery includes codex assets and retains Node-only QA and local authoring in Git',()=>{
 for(const card of cards)for(const field of ['sourceArt','battleSprite','thumbnailArt','displayArt','frame'])assert(isProductionFile(card[field]));
 assert(!isProductionFile('preview/mercenary-bloodmoon-battle-20261023-v1/manifest.json'));assert(!isProductionFile('docs/qa/bloodmoon-codex-20261023/browser.json'));
 for(const file of bloodmoonNodeQaOnly){assert.match(file,/^tests\/[^/]+\.mjs$/);assert.match(fs.readFileSync(file,'utf8'),/from ['"]node:/);assert(!isProductionFile(file));}
});
test('registration is atomic, dry-run rolls back, replay writes nothing and existing balances remain intact',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec("CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,coin BIGINT);INSERT INTO users VALUES(1,'OWNER',123456);CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE mercenary_limited_stock_v1(code TEXT PRIMARY KEY,stock_limit BIGINT,issued BIGINT DEFAULT 0,revision BIGINT DEFAULT 0);CREATE TABLE user_mercenary_cards_v1(mercenary_code TEXT);CREATE TABLE mercenary_limited_issues_v1(code TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);INSERT INTO mercenary_limited_stock_v1 VALUES('V-980',13,9,7);");
 const before=await readBloodmoonRegistration(db);const dry=await registerBloodmoonCodex(db,{dryRun:true});assert.equal(dry.status,'DRY_RUN_PASSED');assert.deepEqual(await readBloodmoonRegistration(db),before);
 const failing={query:(sql,args)=>sql.startsWith('INSERT INTO admin_logs')?Promise.reject(Error('injected')):db.query(sql,args)};await assert.rejects(registerBloodmoonCodex(failing),/injected/);assert.deepEqual(await readBloodmoonRegistration(db),before);
 const result=await registerBloodmoonCodex(db);assert.equal(result.status,'APPLIED');assert.equal(result.stock.length,5);assert(result.stock.every(s=>s.limit===10&&s.issued===0));assert.equal(result.settings.settings.mode,'OFF');assert.equal(result.ownershipRows,0);assert.equal(result.issueRows,0);
 const replay=await registerBloodmoonCodex({query:(sql,args)=>{assert(!/^(INSERT|UPDATE|DELETE)/.test(sql));return db.query(sql,args);}});assert(replay.replayed);
 assert.equal((await db.query('SELECT coin FROM users WHERE id=1')).rows[0].coin,123456);assert.deepEqual((await db.query("SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-980'")).rows,[{code:'V-980',stock_limit:13,issued:9,revision:7}]);assert.equal((await db.query('SELECT COUNT(*) AS count FROM admin_logs')).rows[0].count,1);
 const settings=(await db.query('SELECT value FROM app_meta WHERE key=$1',[BLOODMOON_PACK_KEY])).rows[0];assert.deepEqual(JSON.parse(settings.value).settings,legacyBloodmoonPackDraft());
});
