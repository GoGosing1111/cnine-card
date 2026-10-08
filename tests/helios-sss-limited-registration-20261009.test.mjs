import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {mercenaryAccountState,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {LIMITED_MERCENARIES as limited} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {limitedPolicyDraft,readLimitedPolicy} from '../shared/mercenary-limited-policy-v1.mjs';
import {limitedPackDraft,readLimitedPack,LIMITED_PACK_RELEASE_ENABLED} from '../shared/mercenary-limited-pack-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {validateCatalog,filterCatalog} from '../mercenary-codex/model.mjs';
import {publicCodexHtml} from '../mercenary-codex/shell.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
const project=()=>mercenaryCodexDocument({payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-09'});
const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

test('Helios appears under SSS LIMITED with an explicitly deferred empty title',()=>{
 const catalog=validateCatalog(project()),card=catalog.cards.find(c=>c.code==='V-999');
 assert.equal(card.name,'헬리오스');assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');
 assert.equal(card.title,'');assert.equal(card.titleStatus,'DEFERRED_BY_USER');
 assert.equal(limited.length,9);assert.deepEqual(filterCatalog(limited,{rank:'SSS'},new Set()).map(c=>c.name),['발테르','헬리오스']);
 assert.equal(card.deploymentEnabled,false);assert.equal(card.acquisitionEnabled,false);assert.equal(card.basePower,null);assert.deepEqual(card.skills,[]);
 assert.equal(limitedDeploymentSnapshot(card.code),null);assert.equal(mercenaryAcquisitionEnabled(card.code),false);
 assert.equal(catalog.cards.filter(c=>c.edition==='LIMITED'&&c.deploymentEnabled).length,8);
 const missing=structuredClone(catalog);delete missing.cards.find(c=>c.code==='V-999').titleStatus;assert.throws(()=>validateCatalog(missing));
 const normal=structuredClone(catalog);normal.cards.find(c=>c.edition!=='LIMITED'&&c.title).title='';assert.throws(()=>validateCatalog(normal));
});

test('Helios registration preserves approved artwork, prepared SD and the shared V3 frame',()=>{
 const card=limited.find(c=>c.code==='V-999');
 assert.equal(digest(card.sourceArt),'BE6BF7819C24C53A7CDB0C2C86D85802AFA1E39FDF62D8F4306B8013CCE62492');
 assert.equal(digest(card.battleSprite),card.battleSpriteSha256);assert.equal(digest(card.battleSprite),digest('preview/mercenary-limited-solar-sword-20261009-v1/qa/held-sword-v2.png'));
 assert.equal(digest(card.frame),'F5F636CAC672A485F19CE4ED484ECB2798217D365A4D31B2C6C7FABB878189EA');
 assert.equal(card.visualApproval,'USER_REVIEW_PENDING');
 const mirror=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/limited-20261002/catalog.json'));assert.deepEqual(mirror.cards,limited);
 const approval=JSON.parse(fs.readFileSync(card.approvalRecord));assert.equal(approval.name,card.name);assert.equal(approval.title,'');assert.equal(approval.runtimeEnabled,false);
});

test('existing saved rates and stock limits survive the ninth entry without enabling acquisition',()=>{
 const policy=limitedPolicyDraft();delete policy.cardWeights['V-999'];policy.rankRatesPpm={SS:120,SSS:3};policy.cardWeights['V-996']=7;
 const saved=structuredClone(policy),next=readLimitedPolicy(policy);
 assert.deepEqual(policy,saved);assert.deepEqual(next,{...saved,cardWeights:{...saved.cardWeights,'V-999':0}});
 const pack=limitedPackDraft();delete pack.stockLimits['V-999'];pack.stockLimits['V-996']=50;pack.prices={single:100000,ten:1000000};
 const oldPack=structuredClone(pack),nextPack=readLimitedPack(pack);
 assert.deepEqual(pack,oldPack);assert.deepEqual(nextPack,{...oldPack,stockLimits:{...oldPack.stockLimits,'V-999':null}});
 assert.equal(LIMITED_PACK_RELEASE_ENABLED,false);assert.equal(nextPack.mode,'OFF');
});

test('catalog-only ownership remains readable and cannot be equipped while released cards remain available',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 for(const code of ['V-999','V-996'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',code,'2026-10-09','2026-10-09').run();
 const account=await mercenaryAccountState(f.env,f.user),card=account.cards.find(c=>c.code==='V-999');
 assert.equal(card.name,'헬리오스');assert.equal(card.canDeploy,false);assert.equal(card.deploymentEnabled,false);assert.equal(card.basePower,null);assert.deepEqual(card.skills,[]);
 assert.equal(account.cards.find(c=>c.code==='V-996').canDeploy,true);
 await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-999',revision:0}),{code:'MERCENARY_CODE'});
});

test('public shell rebuild preserves limited navigation, styling, growth link and Helios cache version',()=>{
 const html=publicCodexHtml();assert.equal(fs.readFileSync('mercenary-codex/index.html','utf8'),html);
 for(const marker of ['id="limitedView"','/mercenary-codex/limited.css','id="openLeveling"','helios=20261009','petCodex=20261009','mine=20261003'])assert.ok(html.includes(marker),marker);
});
