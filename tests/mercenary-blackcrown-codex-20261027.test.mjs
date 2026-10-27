import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mercenaryCodexDocument,handleMercenaryCodex} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {BLACKCROWN_MERCENARIES,BLACKCROWN_CODES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {BLACKCROWN_CODEX_DETAILS} from '../shared/mercenary-blackcrown-codex-v2.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {validateCatalog,asset,filterCatalog} from '../mercenary-codex/model.mjs';
import {isProductionFile,blackcrownCodexNodeOnly} from '../scripts/prepare-production-assets.mjs';
const row={payload_json:JSON.stringify(seed.document),revision:1,updated_at:'2026-10-27'};
const document=()=>mercenaryCodexDocument(row),hash=x=>createHash('sha256').update(x).digest('hex');
test('six Black Crown SS Limited cards expose exactly two distinct codex skills',()=>{
 const d=validateCatalog(document()),cards=d.cards.filter(c=>c.season==='BLACKCROWN');
 assert.deepEqual(cards.map(c=>c.code),BLACKCROWN_CODES);const added=cards.flatMap(c=>c.skills.map(s=>s.id));assert.equal(new Set(added).size,12);assert(!d.cards.filter(c=>c.season!=='BLACKCROWN').some(c=>c.skills.some(s=>added.includes(s.id))));
 for(const c of cards){assert.equal(c.skills.length,2);assert(c.skills.every(s=>s.ready===true&&s.codexOnly===false&&s.balance.cost===20));assert.equal(c.rank,'SS');assert.equal(c.edition,'LIMITED');assert.equal(c.serverLimit,10);assert.equal(c.basePower,356400);assert.equal(c.battlePresentation.motionSpeed,2);assert.equal(c.battlePresentation.facing,'RIGHT_TOWARD_ENEMY');assert.equal(c.battlePresentation.bodyHeight,285);assert.equal(filterCatalog(cards,{q:c.skills[1].name},new Set())[0].code,c.code);}
});
test('other cards stay unchanged while six Black Crown identities gain deployment',()=>{
 const before=JSON.parse(fs.readFileSync('docs/qa/blackcrown-codex-skills-20261027/before-hashes.json'));
 assert.equal(hash(JSON.stringify(document().cards.filter(c=>c.season!=='BLACKCROWN'))),before.otherCardsSha256);

 for(const c of BLACKCROWN_MERCENARIES){assert.equal(c.skills.length,2);assert(c.battleSprite);assert.equal(c.deploymentEnabled,true);assert.equal(limitedDeploymentSnapshot(c.code).code,c.code);assert.equal(c.acquisition,'BLACKCROWN_PACK');assert.equal(c.serverLimit,10);}
});
test('codex validates the released identities and authoritative skill balance',()=>{
 for(const mutate of [c=>c.deploymentEnabled=false,c=>c.skills[0].ready=false,c=>c.skills[0].balance.damageRatio=9,c=>c.skills.pop(),c=>c.skills[1].id='MS-001',c=>c.battlePresentation.motionSpeed=1,c=>c.battleSprite='assets/ui/project-v/other.png',c=>c.rank='SSS',c=>c.serverLimit=65]){const d=document();mutate(d.cards.find(c=>c.code==='V-950'));assert.throws(()=>validateCatalog(d));}
});
test('six source originals and full-body side sprites match recorded hashes and delivery paths',()=>{
 for(const c of document().cards.filter(c=>c.season==='BLACKCROWN')){for(const field of ['sourceArt','battleSprite'])assert.equal(hash(fs.readFileSync(c[field])).toUpperCase(),c[field+'Sha256']);for(const field of ['sourceArt','battleSprite','thumbnailArt','displayArt','frame']){asset(c[field]);assert(isProductionFile(c[field]));}const v=c.battleSpriteViewport;assert(v.width>0&&v.height>v.width&&v.x>=0&&v.y>=0&&v.x+v.width<=v.imageWidth&&v.y+v.height<=v.imageHeight);}
 assert(isProductionFile('shared/mercenary-blackcrown-codex-v2.mjs'));
 for(const p of ['assets/ui/packs/other.png','assets/ui/packs/black-crown-20261027-v1/../../secret.webp','https://example.com/a.png'])assert.throws(()=>asset(p));
});
test('public codex performs one SELECT only and rejects write methods before database access',async()=>{
 const statements=[],env={DB:{prepare(sql){statements.push(sql);assert.match(sql,/^SELECT /);return {first:async()=>row}}}},deps={json:(body,status=200,headers={})=>({body,status,headers})};
 const result=await handleMercenaryCodex({path:'mercenary-codex',request:{method:'GET'},env,deps});assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'no-store');validateCatalog(result.body);assert.equal(statements.length,1);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await handleMercenaryCodex({path:'mercenary-codex',request:{method},env:{get DB(){throw Error('write access')}},deps})).status,405);
});
test('Pages delivery preserves all originals and excludes only Node authoring commands',()=>{
 for(const file of blackcrownCodexNodeOnly){assert(fs.existsSync(file));assert.match(fs.readFileSync(file,'utf8'),/node:|from ['"]sharp['"]/);assert.equal(isProductionFile(file),false);}
 assert.equal(isProductionFile('scripts/blackcrown-codex-node-only-20261027.json'),false);
 for(const card of Object.values(BLACKCROWN_CODEX_DETAILS))assert(isProductionFile(card.battleSprite));
});
