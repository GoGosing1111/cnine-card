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
test('read-only codex includes all six limited cards with confirmed ranks and original artwork',()=>{
 const catalog=validateCatalog(mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-02'}));
 assert.equal(catalog.cards.filter(c=>c.edition==='LIMITED').length,6);assert.equal(new Set(catalog.cards.map(c=>c.code)).size,catalog.cards.length);
 assert.equal(cards.find(c=>c.name==='나무늘봉순').rank,null);assert.equal(cards.find(c=>c.name==='조은').rank,null);
 assert.deepEqual(cards.filter(c=>c.rank==='SSS').map(c=>c.name),['발테르','이네스']);
 assert.deepEqual(cards.filter(c=>c.rank==='SS').map(c=>c.name),['오리꿍','디임']);
 for(const c of cards){for(const [path,hash] of [[c.sourceArt,c.sourceArtSha256],[c.frame,c.frameSha256],...(c.battleSprite?[[c.battleSprite,c.battleSpriteSha256]]:[])])assert.equal(digest(fs.readFileSync(path)),hash,path);assert.equal(c.acquisitionEnabled,false);assert.equal(c.deploymentEnabled,false);assert.equal(c.basePower,null);assert.deepEqual(c.skills,[]);}
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
 assert.equal(motion,27);assert.equal(effects,96);assert.ok(fs.statSync(prefix+'preview.bundle.js').size>100000);assert.ok(cards.find(c=>c.name==='발테르').battlePreview);assert.ok(fs.existsSync(prefix+'index.html'));
});
async function fixture(t){
 const pg=new PGlite();t.after(()=>pg.close());await pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE mercenary_draw_config_v1(id BIGINT,payload_json TEXT);INSERT INTO mercenary_draw_config_v1 VALUES(1,\'general unchanged\');');let fail=false,calls=0;
 const DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;calls++;if(fail&&sql.startsWith('INSERT INTO admin_logs'))throw Error('audit failure');const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
 const call=(body,role='OWNER',method=body?'PATCH':'GET')=>handleLimitedMercenaryCms({path:'admin/mercenaries/limited',request:new Request('https://qa.test/api/admin/mercenaries/limited',{method,...(body?{body:JSON.stringify(body)}:{})}),env:{DB},deps:{requirePermission:async()=>({id:1,role}),json:(body,status=200)=>({body,status})}});
 return {pg,call,fail:v=>fail=v,calls:()=>calls};
}
const body=()=>({expectedRevision:1,requestId:crypto.randomUUID(),reason:'리미티드 확률 검수',policy:limitedPolicyDraft()});
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
