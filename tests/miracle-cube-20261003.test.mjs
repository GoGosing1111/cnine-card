import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {MIRACLE_TOTAL,MIRACLE_RANKS,emptyMiraclePolicy,validateMiraclePolicy,miracleReadiness,rollMiracleCube,parseMiraclePercent} from '../shared/miracle-cube-policy-v1.mjs';
import {MIRACLE_KEY,ensureMiracleCubeCatalog,miracleCubeState,saveMiraclePolicy,openMiracleCube,miracleCubeReceipt,handleMiracleCube,presentMiracleInventory} from '../functions/_miracle_cube.js';
import {prepareMiracleCube} from '../scripts/ops/miracle-cube-prepare-20261003.mjs';
const id=name=>'miracle-test-'+name;
async function setup(t,options){
 const f=await mercenaryFixture(t,options);await ensureMiracleCubeCatalog(f.env);
 await f.p("INSERT INTO inventory_items(code,name,rarity,image_url) VALUES('PREMIUM_CUBE','프리미엄 큐브','PREMIUM','/cube.png')").run();
 for(const [code,count]of [['MIRACLE_CUBE',13],['PREMIUM_CUBE',10]])await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,?,?)',code,count,count).run();
 const state=await miracleCubeState(f.env,f.user),cards=state.catalog.filter(card=>card.available);
 const policy=emptyMiraclePolicy();policy.mode='ON';policy.ranks[cards[0].rank]=MIRACLE_TOTAL;policy.cards[cards[0].code]=MIRACLE_TOTAL;
 const balance=async code=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',code).first()).quantity);
 const save=async(name,next=policy,revision=0)=>saveMiraclePolicy(f.env,f.user,{requestId:id(name),revision,policy:next});
 return {...f,state,policy,card:cards[0],balance,save};
}
test('exact two-stage odds use all ranks, explicit within-rank percentages, zero exclusions and precise boundaries',()=>{
 const catalog=MIRACLE_RANKS.flatMap((rank,i)=>[0,1].map(j=>({code:'V-'+String(i*2+j+1).padStart(3,'0'),name:rank+j,rank,available:true,sourceArt:'/art.png'})));
 const p=emptyMiraclePolicy();p.mode='ON';
 MIRACLE_RANKS.forEach((rank,i)=>{p.ranks[rank]=[50,20,10,10,9,1][i]*1_000_000;p.cards[catalog[i*2].code]=25_000_000;p.cards[catalog[i*2+1].code]=75_000_000;});
 assert.equal(miracleReadiness(validateMiraclePolicy(p,catalog),catalog).ready,true);
 let tickets=[49_999_999,24_999_999];assert.equal(rollMiracleCube(p,catalog,()=>tickets.shift()).mercenaryCode,'V-001');
 tickets=[50_000_000,25_000_000];assert.equal(rollMiracleCube(p,catalog,()=>tickets.shift()).mercenaryCode,'V-004');
 tickets=[99_999_999,99_999_999];assert.equal(rollMiracleCube(p,catalog,()=>tickets.shift()).mercenaryCode,'V-012');
 assert.equal(parseMiraclePercent('0.000001'),1);assert.throws(()=>parseMiraclePercent('0.0000001'));assert.throws(()=>parseMiraclePercent('NaN'));
 catalog[0].available=false;assert.equal(miracleReadiness(p,catalog).ready,false);
});
test('OFF defaults and incomplete drafts cannot consume cubes; only OWNER can save; ON requires ready odds',async t=>{
 const f=await setup(t);assert.equal(f.state.mode,'OFF');assert.equal(f.state.balance,13);
 await assert.rejects(openMiracleCube(f.env,f.user,{requestId:id('off'),count:1}),{code:'MIRACLE_CLOSED'});
 assert.equal(await f.balance('MIRACLE_CUBE'),13);assert.equal(await f.balance('PREMIUM_CUBE'),10);
 const draft=emptyMiraclePolicy();draft.notes='OWNER 검토 메모';await f.save('draft',draft);
 assert.equal((await miracleCubeState(f.env,{id:8,role:'MEMBER'})).policy.notes,'');
 await assert.rejects(f.save('invalid-on',{...draft,mode:'ON'},1),{code:'MIRACLE_NOT_READY'});
 await assert.rejects(saveMiraclePolicy(f.env,{id:8,role:'MEMBER'},{requestId:id('forbidden'),revision:1,policy:draft}),{code:'MIRACLE_PERMISSION'});
 const request=new Request('https://local/api/admin/miracle-cube',{method:'PATCH',headers:{authorization:'Bearer local-account-7','content-type':'application/json',origin:'https://evil.test'},body:JSON.stringify({requestId:id('origin'),revision:1,policy:draft})});
 assert.equal((await handleMiracleCube({path:'admin/miracle-cube',request,env:f.env,deps:f.deps})).status,403);
});
for(const postgres of [false,true])test(`cube debit, ten mercenary grants, duplicates and replay are atomic (${postgres?'Postgres':'SQLite'})`,async t=>{
 const f=await setup(t,{postgres});await f.save('enable');let rolls=0;
 const input={requestId:id('ten'),count:10},result=await openMiracleCube(f.env,f.user,input,{randomInt:()=>{rolls++;return 0;}});
 assert.equal(result.status,'COMPLETED');assert.equal(result.draws.length,10);assert.equal(result.balance,3);assert.equal(rolls,20);
 assert.equal(await f.balance('MIRACLE_CUBE'),3);assert.equal(await f.balance('PREMIUM_CUBE'),10);
 assert.equal(result.draws[0].duplicate,false);assert.equal(result.draws[9].duplicateCount,9);
 const replay=await openMiracleCube(f.env,f.user,input,{randomInt:()=>{throw Error('reroll forbidden');}});assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,result.draws);
 await assert.rejects(openMiracleCube(f.env,f.user,{...input,count:1}),{code:'JOINT_REQUEST_CONFLICT'});
 await assert.rejects(miracleCubeReceipt(f.env,{id:8},input.requestId),{code:'JOINT_NOT_FOUND'});
 await assert.rejects(openMiracleCube(f.env,f.user,{requestId:id('insufficient'),count:10}),{code:'MIRACLE_BALANCE'});
});
test('grant failure rolls debit back and resumes the fixed draw; OFF and policy changes block pending commits',async t=>{
 const f=await setup(t);await f.save('enable');const input={requestId:id('failure'),count:1};let rolls=0;
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(openMiracleCube(f.env,f.user,input,{randomInt:()=>{rolls++;return 0;}}));
 assert.equal(await f.balance('MIRACLE_CUBE'),13);assert.equal(rolls,2);f.fail('');
 const result=await openMiracleCube(f.env,f.user,input,{randomInt:()=>{throw Error('must reuse draw');}});assert.equal(result.draws[0].mercenaryCode,f.card.code);assert.equal(await f.balance('MIRACLE_CUBE'),12);
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');const blocked={requestId:id('pending-off'),count:1};await assert.rejects(openMiracleCube(f.env,f.user,blocked,{randomInt:()=>0}));f.fail('');
 await f.save('disable',{...f.policy,mode:'OFF'},1);
 await assert.rejects(openMiracleCube(f.env,f.user,blocked),{code:'MIRACLE_POLICY_CHANGED'});assert.equal(await f.balance('MIRACLE_CUBE'),12);
});
test('global acquisition lock cancels a prepared grant and does not change independent cube percentages',async t=>{
 const f=await setup(t);await f.save('enable');const input={requestId:id('lock-race'),count:1};
 f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(openMiracleCube(f.env,f.user,input,{randomInt:()=>0}));f.fail('');
 f.draw.cardRules.cardWeights[f.card.code]=0;await f.setDraw(f.draw);
 await assert.rejects(openMiracleCube(f.env,f.user,input),{code:'MIRACLE_CATALOG_CHANGED'});
 assert.equal(await f.balance('MIRACLE_CUBE'),13);
 assert.equal(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',MIRACLE_KEY).first()).value).policy.cards[f.card.code],MIRACLE_TOTAL);
});
test('only new miracle cubes are consumed and revision conflicts never overwrite settings',async t=>{
 const f=await setup(t);const saved=await f.save('new-only',f.policy);assert.equal(saved.balance,13);
 await openMiracleCube(f.env,f.user,{requestId:id('new-one'),count:1},{randomInt:()=>0});assert.equal(await f.balance('PREMIUM_CUBE'),10);
 await assert.rejects(f.save('stale',{...f.policy,mode:'OFF'},0),{code:'MIRACLE_REVISION_CONFLICT'});
});

test('inventory presentation routes only the new cube and preserves every quantity',()=>{const items=[{code:'MIRACLE_CUBE',quantity:4,unseenQuantity:2},{code:'MASTER_STAR',quantity:100,unseenQuantity:0}];const shown=presentMiracleInventory(items);assert.equal(shown[0].name,'미라클 큐브');assert.equal(shown[0].usable,true);assert.equal(shown[0].quantity,4);assert.equal(shown[0].unseenQuantity,2);assert.strictEqual(shown[1],items[1]);});

test('production preparation is OFF, dry-run-safe, transactional and never overrides existing policy',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});await f.pg.query("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
 await f.setting('ops:premium-cube-retirement:20261003:v1',{at:'test-only'});
 const dry=await prepareMiracleCube(f.pg);assert.equal(dry.mode,'OFF');assert.equal(dry.dryRun,true);assert.equal((await f.pg.query('SELECT key FROM app_meta WHERE key=$1',[MIRACLE_KEY])).rows.length,0);
 const broken={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO admin_logs'))throw Error('INJECTED_AUDIT_FAILURE');return f.pg.query(sql,args);}};
 await assert.rejects(prepareMiracleCube(broken,{apply:true}),/INJECTED_AUDIT_FAILURE/);assert.equal((await f.pg.query("SELECT code FROM inventory_items WHERE code='MIRACLE_CUBE'")).rows.length,0);
 const saved=await prepareMiracleCube(f.pg,{apply:true});assert.equal(saved.createdPolicy,true);assert.equal(saved.assignedCards,0);assert.equal(Object.values(saved.ranks).reduce((a,b)=>a+b,0),0);
 const repeat=await prepareMiracleCube(f.pg,{apply:true});assert.equal(repeat.createdPolicy,false);assert.equal(repeat.createdCatalog,false);assert.equal(repeat.auditId,undefined);
 assert.equal(Number((await f.pg.query("SELECT COUNT(*) count FROM admin_logs WHERE action_type='MIRACLE_CUBE_PREPARE'")).rows[0].count),1);
 assert.equal((await f.pg.query("SELECT user_id FROM cnine_user_inventory WHERE item_code='MIRACLE_CUBE'")).rows.length,0);
});
