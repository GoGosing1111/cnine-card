import test from 'node:test';import assert from 'node:assert/strict';
import {jointFixture} from './helpers/joint-db.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {forgeFixture} from './helpers/forge-db.mjs';
import {compileJointReleaseDocument,prepareJointReleaseSchema,collectJointReleaseSchema} from '../functions/_joint_release_preparation.js';
import {readJointReleaseComponent,JOINT_APPROVALS,JOINT_RELEASE_DOCUMENT_KEY} from '../functions/_joint_release_document.js';
import {readTowerV3Settings} from '../functions/_tower_v3_settings.js';
import {readExpeditionPolicy} from '../functions/_expedition_v3_settings.js';
import {readScrapyardSettings} from '../functions/_scrapyard.js';
import {readForgeRuntime} from '../functions/_equipment_forge_transactions.js';
import {V3_JOINT_RELEASE_VERSION} from '../shared/v3-joint-release-v1.mjs';
test('hard release hold never reads storage or accepts a CMS ON override',async()=>{const env={get DB(){throw Error('unexpected DB read');}};assert.equal(await readJointReleaseComponent(env,'MERCENARY'),null);});
test('offline schema candidates include acquisition receipts and never seed or alter operating CMS/account rows',async()=>{
 for(const postgres of[false,true]){const sql=await collectJointReleaseSchema({postgres});assert.ok(sql.some(s=>s.includes('mercenary_card_acquisitions_v1')));assert.ok(sql.some(s=>s.includes('equipment_forge_destroyed_v1')));assert.ok(sql.every(s=>/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS /.test(s)));assert.equal(new Set(sql).size,sql.length);}
});
for(const postgres of[false,true])test(`${postgres?'PostgreSQL':'SQLite'}: explicit preparation preserves drafts, all approvals are required, published document is immutable`,async t=>{
 const base=await jointFixture(t,{postgres}),merc=await mercenaryFixture(t,{base}),f=await forgeFixture(t,{base});
 const before=await f.coin();await prepareJointReleaseSchema(f.env);await prepareJointReleaseSchema(f.env);assert.equal(await f.coin(),before);
 const input={version:V3_JOINT_RELEASE_VERSION,approved:true,approvedBy:7,approvedAt:'2026-09-13T00:00:00Z',approvalReference:'TEST ONLY — explicit isolated QA approval evidence',approvals:Object.fromEntries(JOINT_APPROVALS.map(k=>[k,true])),components:{
  MERCENARY:{document:merc.document,runtime:merc.policy,draw:merc.draw,cmsRevision:1,drawRevision:1},EQUIPMENT_FORGE:await readForgeRuntime(f.env),
  TOWER:await readTowerV3Settings(f.env),COW_ROOM:await readExpeditionPolicy(f.env,'COW_ROOM'),SCRAPYARD:{...await readScrapyardSettings(f.env,{fresh:true}),mode:'ON'},IDLE:{progression:'EXISTING_SERVER_AUTOMATIC'}}};
 for(const key of JOINT_APPROVALS)await assert.rejects(()=>compileJointReleaseDocument({...input,approvals:{...input.approvals,[key]:false}}),{code:'JOINT_RELEASE_PENDING'});
 const pending=structuredClone(input);pending.components.MERCENARY.document.mercenaries[0].stats.attack=null;await assert.rejects(()=>compileJointReleaseDocument(pending));
 input.components.EQUIPMENT_FORGE.protection.sources[0]={content:'TOWER',enabled:true,chancePpm:10,quantity:1};
 const compiled=await compileJointReleaseDocument(input);await f.setting(compiled.key,JSON.parse(compiled.value));
 const released=await readJointReleaseComponent(f.env,'MERCENARY',{enabled:true});assert.equal(released.runtime.mode,'ON');assert.equal(released.runtime.approved,true);assert.equal((await readForgeRuntime(f.env)).approved,false);
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json='{}' WHERE doc_key='config'").run();assert.equal((await readJointReleaseComponent(f.env,'MERCENARY',{enabled:true})).cmsRevision,1);
 const damaged=JSON.parse(compiled.value);damaged.document.components.MERCENARY.runtime.opening.coinPerOpen=1;await f.setting(JOINT_RELEASE_DOCUMENT_KEY,damaged);await assert.rejects(()=>readJointReleaseComponent(f.env,'MERCENARY',{enabled:true}),{code:'JOINT_RELEASE_DOCUMENT'});
});
