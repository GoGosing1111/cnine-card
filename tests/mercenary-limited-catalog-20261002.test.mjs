import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {handleLimitedMercenaryCms} from '../functions/_mercenary_limited_cms.js';
import {LIMITED_MERCENARIES as cards} from '../shared/mercenary-limited-catalog-v1.mjs';
import {LIMITED_POLICY_KEY,limitedPolicyDraft,validateLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
import {mercenaryAcquisitionEnabled,assertMercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {validateCatalog,filterCatalog} from '../mercenary-codex/model.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex').toUpperCase();
test('read-only codex includes all nine limited cards with confirmed ranks and original artwork',()=>{
 const catalog=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-02'}));
 assert.equal(catalog.cards.filter(c=>c.edition==='LIMITED').length,9);assert.equal(new Set(catalog.cards.map(c=>c.code)).size,catalog.cards.length);
 assert.equal(cards.find(c=>c.name==='나무늘봉순').rank,'SS');assert.equal(cards.find(c=>c.name==='조은').rank,'SS');
 assert.deepEqual(cards.filter(c=>c.rank==='SSS').map(c=>c.name),['발테르','헬리오스']);
 assert.deepEqual(cards.filter(c=>c.rank==='SS').map(c=>c.name),['나무늘봉순','조은','이네스','오리꿍','디임','아윤','하이희야']);
 const ayoon=cards.find(c=>c.code==='V-997');assert.ok(ayoon.battleSprite);assert.equal(ayoon.resourceStatus,'V3_MOTION_SKILL_READY');assert.equal(ayoon.sourceArtSha256,'21623C96DFF0FAF9054FF04B4B925D28582E9716A6C40C5B1851E0954E287A39');assert.equal(filterCatalog(cards,{q:'아윤',rank:'SS'},new Set())[0],ayoon);
 const heeya=cards.find(c=>c.code==='V-998');assert.equal(heeya.name,'하이희야');assert.ok(heeya.battleSprite);assert.equal(heeya.resourceStatus,'V3_MOTION_SKILL_READY');assert.equal(heeya.sourceArtSha256,'7FE9B78CCA3243078BB47A4E9F358017F7C633B39E2D888BDEA76B8F7984D20D');assert.equal(filterCatalog(cards,{q:'하이희야',rank:'SS'},new Set())[0],heeya);
 for(const c of cards){assert.equal(c.frameSha256,'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA');assert.equal(c.frame,cards[0].frame);assert.deepEqual(c.artWindow,cards[0].artWindow);assert.equal(c.battlePreview,undefined);for(const [path,hash] of [[c.sourceArt,c.sourceArtSha256],[c.frame,c.frameSha256],...(c.battleSprite?[[c.battleSprite,c.battleSpriteSha256]]:[])])assert.equal(digest(fs.readFileSync(path)),hash,path);assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.equal(c.basePower,null);assert.deepEqual(c.skills,[]);}
 assert.equal(cards.find(c=>c.code==='V-990').sourceArtSha256,'EFC0B6D14A891917D517E8F9850D398165A0F94C11006DD6945BB2D05C627120');
 const canonical=JSON.parse(fs.readFileSync('preview/mercenary-limited-snow-neon-20261001-v1/manifest.json'));for(const card of cards){const entry=canonical.entries.find(e=>e.name===card.name);assert.equal(entry.rank,card.rank);assert.equal(entry.source.sha256,card.sourceArtSha256);assert.equal(entry.frameSha256,card.frameSha256);}assert.deepEqual(JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/limited-20261002/catalog.json')).cards,cards);
 assert.equal(filterCatalog(cards,{q:'발테르',rank:'SSS'},new Set()).length,1);
 const broken=structuredClone(catalog);broken.cards.find(c=>c.edition==='LIMITED').acquisitionEnabled=true;assert.throws(()=>validateCatalog(broken),/조회만/);
});
test('limited grants remain blocked independent of saved weight and never enter general catalog',()=>{
 for(const c of cards){assert.equal(seed.catalog.cards.some(row=>row.code===c.code),false);assert.equal(mercenaryAcquisitionEnabled(c.code,{cardWeights:{[c.code]:1000000}}),false);assert.throws(()=>assertMercenaryAcquisitionEnabled(c.code),e=>e.code==='MERCENARY_ACQUISITION_DISABLED');assert.throws(()=>mercenaryCardAcquisitionStatements({prepare(){throw Error('DB must not be touched');}},{userId:65,mercenaryCode:c.code,acquisitionId:'limited-block-12345'}),/Invalid mercenary acquisition/);}
 const defaults=limitedPolicyDraft();assert.deepEqual(defaults.rankRatesPpm,{SS:null,SSS:null});assert.equal(defaults.acquisitionEnabled,false);
 for(const mutate of [p=>p.acquisitionEnabled=true,p=>p.rankRatesPpm.SSS=1000001,p=>{p.rankRatesPpm.SS=600000;p.rankRatesPpm.SSS=500000;},p=>p.cardWeights['V-001']=1,p=>p.cardWeights['V-996']=.5]){const p=limitedPolicyDraft();mutate(p);assert.throws(()=>validateLimitedPolicy(p));}
});
test('SSS Valter exposes preserved approved SD, V17 motion and effects without runtime activation',()=>{
 const prefix='preview/mercenary-crimson-silver-knight-battle-v1/',m=JSON.parse(fs.readFileSync(prefix+'manifest.json'));assert.equal(m.runtimeEnabled,false);assert.equal(m.version,17);assert.equal(m.rank,'SSS');let motion=0,effects=0;
 for(const [kind,specs] of [['motion',m.activeMotionKeys.map(k=>m.motion[k])],['effect',Object.values(m.effects)]])for(const s of specs){for(const [file,hash] of [[s.atlas,s.atlasSha256],[s.pngAtlas,s.pngAtlasSha256],...s.frames.map(f=>[f.file,f.sha256])])assert.equal(digest(fs.readFileSync(prefix+file)),hash,file);if(kind==='motion')motion+=s.frameCount;else effects+=s.frameCount;}
 assert.equal(motion,27);assert.equal(effects,96);assert.ok(fs.statSync(prefix+'preview.bundle.js').size>100000);assert.ok(cards.find(c=>c.name==='발테르').battleSprite);assert.ok(fs.existsSync(prefix+'index.html'));
});
async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE mercenary_draw_config_v1(id BIGINT,payload_json TEXT);INSERT INTO mercenary_draw_config_v1 VALUES(1,\'general unchanged\');');let fail=false,calls=0;
 const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;calls++;if(fail&&sql.startsWith('INSERT INTO admin_logs'))throw Error('audit failure');const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
 const call=(body,role='OWNER',method=body?'PATCH':'GET')=>handleLimitedMercenaryCms({path:'admin/mercenaries/limited',request:new Request('https://qa.test/api/admin/mercenaries/limited',{method,...(body?{body:JSON.stringify(body)}:{})}),env:{DB},deps:{requirePermission:async()=>({id:1,role}),json:(body,status=200)=>({body,status})}});
 return {pg,call,fail:v=>fail=v,calls:()=>calls};
}
const body=()=>({expectedRevision:1,requestId:crypto.randomUUID(),reason:'리미티드 확률 검수',policy:limitedPolicyDraft()});

test('older six-card CMS policy loads with zero for later artwork cards without changing saved rates or writing on GET',async t=>{
 const f=await fixture(t),policy=limitedPolicyDraft();delete policy.cardWeights['V-997'];delete policy.cardWeights['V-998'];policy.rankRatesPpm={SS:120,SSS:3};policy.cardWeights['V-990']=7;policy.notes='운영자가 저장한 기존 초안';
 const legacy={revision:9,policy,updatedAt:'2026-10-03T00:00:00.000Z'},raw=JSON.stringify(legacy);
 await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',[LIMITED_POLICY_KEY,raw]);
 const read=await f.call();assert.equal(read.status,200);assert.equal(read.body.revision,9);assert.equal(read.body.policy.cardWeights['V-997'],0);assert.equal(read.body.policy.cardWeights['V-998'],0);
 assert.deepEqual(read.body.policy,{...policy,cardWeights:{...policy.cardWeights,'V-997':0,'V-998':0}});
 assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[LIMITED_POLICY_KEY])).rows[0].value,raw);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,0);
 const request={...body(),expectedRevision:9,policy:read.body.policy};const saved=await f.call(request);assert.equal(saved.status,200);assert.equal(saved.body.revision,10);assert.deepEqual(saved.body.policy,read.body.policy);assert.equal((await f.call(request)).body.replayed,true);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});
test('limited CMS saves separately with audited atomic rollback, stale protection and safe retry',async t=>{
 const f=await fixture(t);for(const role of ['USER','ADMIN'])assert.equal((await f.call(null,role)).status,403);assert.equal(f.calls(),0);
 const on=body();on.policy.acquisitionEnabled=true;assert.equal((await f.call(on)).status,400);assert.equal(f.calls(),0);
 assert.equal((await f.call()).body.revision,1);assert.equal((await f.pg.query('SELECT * FROM app_meta')).rows.length,0,'GET is read-only');
 const b=body();b.policy.rankRatesPpm.SSS=1;f.fail(true);await assert.rejects(f.call(b),/audit failure/);f.fail(false);assert.equal((await f.pg.query('SELECT * FROM app_meta')).rows.length,0);
 const saved=await f.call(b);assert.equal(saved.status,200);assert.equal(saved.body.revision,2);assert.equal(saved.body.userOpeningEnabled,false);assert.equal(saved.body.policy.acquisitionEnabled,false);
 assert.equal((await f.call(b)).body.replayed,true);assert.equal((await f.call(body())).status,409);assert.equal((await f.call({...b,reason:'변경된 사유'})).status,409);
 assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);assert.equal((await f.pg.query('SELECT payload_json FROM mercenary_draw_config_v1')).rows[0].payload_json,'general unchanged');assert.ok((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[LIMITED_POLICY_KEY])).rows.length);
});
test('concurrent limited policy edits have one winner and one audit',async t=>{
 const f=await fixture(t),a=body(),b=body();a.policy.notes='first';b.policy.notes='second';assert.deepEqual((await Promise.all([f.call(a),f.call(b)])).map(r=>r.status).sort(),[200,409]);assert.equal((await f.pg.query('SELECT * FROM admin_logs')).rows.length,1);
});
