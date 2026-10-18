import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {reviewPlugin} from '../preview/apocalypse-sahyeon-20261019-v1/build-plugin.mjs';
import {apocalypseLegionBoss} from '../shared/apocalypse-legion-v1.mjs';
const dir='preview/apocalypse-sahyeon-20261019-v1';
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const bundle=await build({entryPoints:[dir+'/fixtures.mjs'],bundle:true,write:false,platform:'node',format:'esm',target:'node22',plugins:[reviewPlugin]});
const temp=path.join(os.tmpdir(),`cnine-sahyeon-test-${process.pid}.mjs`);
let generated;
try{fs.writeFileSync(temp,bundle.outputFiles[0].contents);const {generate}=await import(pathToFileURL(temp));generated=generate(read('azuma-reference.json'));}finally{fs.rmSync(temp,{force:true});}

test('published preview matches the actual server simulator',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(generated.payload)),read('payload.json'));
 assert.deepEqual(JSON.parse(JSON.stringify(generated.balance)),read('balance.json'));
 assert.deepEqual(generated.registrationDraft,read('registration-draft.json'));
});
test('verified Azuma baseline doubles combat budget for boss and six minions',()=>{
 assert.equal(generated.balance.referencePower,110000000);
 assert.equal(generated.balance.power,220000000);
 assert.equal(generated.balance.ratios.length,7);
 for(const row of generated.balance.ratios){for(const key of ['powerRatio','hpRatio','attackRatio','defenseRatio'])assert.equal(row[key],2);assert.equal(row.speedRatio,1);if(row.shieldRatio!==null)assert.equal(row.shieldRatio,2);}
});
test('eye powers apply four-action skill seals and full-team recovery block',()=>{
 const [seal,curse,ultimate]=generated.events;
 assert.deepEqual(generated.events.map(e=>e.kind),['seal','curse','ultimate']);
 assert.equal(seal.hits.length,4);assert.equal(curse.hits.length,5);
 for(const h of seal.hits)assert.equal(h.statuses.seal.remaining,4);
 for(const h of curse.hits)assert.equal(h.statuses.curse.remaining,4);
 assert.equal(ultimate.attackPercent,30);assert.equal(ultimate.shieldPiercePercent,65);
});
test('ultimate damage and shield absorption equal real per-target state loss',()=>{
 const {teams,result}=generated.payload.battleV2;
 const hp=new Map([...teams.A.cards,...teams.B.cards].map(c=>[c.id,c.hp]));
 const shields=new Map([...teams.A.cards,...teams.B.cards].map(c=>[c.id,c.shield]));
 let targets=0,total=0;
 for(const event of result.timeline){
  for(const hit of [event,...(event.hits||[])]){
   if(event.type==='APOCALYPSE_SKILL'&&event.kind==='ultimate'&&hit!==event){
    assert(hit.damage>0);assert.equal(hp.get(hit.targetId)-hit.targetHpAfter,hit.damage);
    assert.equal(shields.get(hit.targetId)-hit.targetShieldAfter,hit.absorbed);targets++;total+=hit.damage;
   }
   if(Number.isFinite(hit.targetHpAfter))hp.set(hit.targetId,hit.targetHpAfter);
   if(Number.isFinite(hit.targetShieldAfter))shields.set(hit.targetId,hit.targetShieldAfter);
  }
 }
 assert.equal(targets,5);assert.equal(total,23074573);
});
test('historical review fixture stays isolated after the approved live registration',()=>{
 assert.equal(apocalypseLegionBoss({id:80}).code,'APOCALYPSE_SAHYEON');
 const draft=generated.registrationDraft;
 assert.equal(draft.registered,false);assert.equal(draft.enabled,false);assert.equal(draft.visualApproval,false);assert.equal(draft.rewardsConfirmed,false);
 assert.equal(generated.payload.battleV2.teams.B.cards[0].projectVMonsterArt.approved,false);
 assert.equal(draft.profile.rewardCoin,0);assert.equal(draft.profile.rewardPercent,0);
});
test('five selected generated originals retain their recorded hashes and prompts',()=>{
 const manifest=read('manifest.json'),prompts=read('prompts.json');assert.equal(manifest.items.length,5);
 for(const item of manifest.items){const bytes=fs.readFileSync(path.join(dir,item.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.equal(bytes.length,item.bytes);assert.equal(item.visualApproval,true);assert(prompts.items.some(p=>p.asset===path.basename(item.file)&&p.status==='selected_for_review'&&p.prompt.length>100));if(['sd','guardian','lens'].includes(item.role))assert(item.hasAlpha&&item.transparentRatio>.2);}
});
