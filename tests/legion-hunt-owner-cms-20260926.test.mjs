import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {validateLegionHuntPolicy,LEGION_HUNT_ACCESS,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
const started=async f=>{
  const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal((await f.call('legion-hunt/begin',{id:r.body.id})).status,200);return r.body;
};
for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': OWNER-only on every endpoint; denied roles perform no content DB work',async()=>{
    const f=await legionFixture({postgres});try{
      const routes=[['legion-hunt/bootstrap'],['admin/legion-hunt'],['admin/legion-hunt',{policy:{}},{method:'PATCH'}],...['start','begin','reveal','claim','finish','cancel'].map(a=>['legion-hunt/'+a,{}])];
      for(const user of [null,{id:2,role:'USER'},{id:3,role:'ADMIN'},{id:4,role:'OWNER '}]){f.setUser(user);f.resetQueries();for(const args of routes)assert.equal((await f.call(...args)).status,user?403:401);assert.equal(f.queries.length,0);}
      assert.deepEqual(LEGION_HUNT_ACCESS,{ownerEnabled:true,publicEnabled:false,liveRewards:false});
    }finally{await f.close();}
  });
  test(dialect+': CMS persistent catalog, explicit opt-in, revision conflicts and transactional audit',async()=>{
    const f=await legionFixture({postgres});try{
      f.resetQueries();let r=await f.call('admin/legion-hunt');assert.equal(r.status,200);assert.deepEqual(r.body.policy.items,[]);assert.equal(r.body.catalog.length,5);
      assert.ok(!f.queries.some(q=>/INSERT|UPDATE|CREATE|DELETE/.test(q)));
      const catalog=r.body.catalog,policy=r.body.policy,item=catalog[0];policy.items=[{...item,enabled:false,weight:5,minQuantity:2,maxQuantity:5}];
      const save=p=>f.call('admin/legion-hunt',{policy:p},{method:'PATCH'});
      assert.equal((await save({...policy,publicEnabled:true})).status,400);
      assert.equal((await save({...policy,items:[{...policy.items[0],code:'INVENTORY_ITEM:OFF_ITEM'}]})).status,400);
      assert.throws(()=>validateLegionHuntPolicy({...policy,items:[policy.items[0],policy.items[0]]},catalog));
      assert.throws(()=>validateLegionHuntPolicy({...policy,items:[{...policy.items[0],enabled:true,weight:0}]},catalog));
      assert.throws(()=>validateLegionHuntPolicy({...policy,items:[{...policy.items[0],minQuantity:6,maxQuantity:5}]},catalog));
      assert.throws(()=>validateLegionHuntPolicy({...policy,difficulties:policy.difficulties.map(d=>({...d,dropPercent:101}))},catalog));
      f.fail('INSERT INTO admin_logs');assert.equal((await save(policy)).status,503);f.fail('');
      assert.equal((await f.call('admin/legion-hunt')).body.policy.revision,0);
      r=await save(policy);assert.equal(r.status,200);assert.equal(r.body.policy.revision,1);assert.equal(r.body.policy.items[0].enabled,false);
      assert.equal((await save(policy)).status,409);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM admin_logs').first()).n,1);
      assert.equal((await f.call('legion-hunt/bootstrap')).body.activeItems,0);
      assert.equal((await save({...r.body.policy,items:[]})).status,200);
      assert.equal((await f.call('admin/legion-hunt')).body.policy.items.length,0);
    }finally{await f.close();}
  });
  test(dialect+': CMS quantity reaches random ground drops; persisted clicks and lost replies award exactly once',async()=>{
    const f=await legionFixture({postgres});try{
      const policy=await f.configure(3),run=await started(f),id=run.id;
      const event=run.payload.battleV2.result.timeline.find(e=>e.huntKill&&e.combatAtMs>500);
      assert.equal((await f.call('legion-hunt/reveal',{id,seq:event.seq})).status,409);
      f.clock.now=301000;
      const reveal=await f.call('legion-hunt/reveal',{id,seq:event.seq});assert.equal(reveal.status,200);
      const drop=reveal.body.drop;assert.equal(drop.item.quantity,3);assert.equal(drop.item.code,policy.items[0].code);
      assert.equal((await f.call('legion-hunt/reveal',{id,seq:event.seq})).body.drop.id,drop.id);
      assert.ok(drop.position.x>=.09&&drop.position.x<=.91);
      const claim={id,dropId:drop.id,token:drop.token,...drop.position};
      assert.equal((await f.call('legion-hunt/claim',{...claim,token:'bad'})).status,409);
      assert.equal((await f.call('legion-hunt/claim',{...claim,x:0,y:0})).status,409);
      f.setUser({id:8,role:'OWNER'});assert.equal((await f.call('legion-hunt/claim',claim)).status,409);f.setUser(f.owner);
      f.loseReply();assert.equal((await f.call('legion-hunt/claim',claim)).status,503);
      const receipt=await f.call('legion-hunt/claim',claim);assert.equal(receipt.status,200);assert.equal(receipt.body.inventory[0].quantity,3);
      assert.deepEqual((await f.call('legion-hunt/claim',claim)).body,receipt.body);
      const final=await f.call('legion-hunt/finish',{id,seq:event.seq});assert.equal(final.body.picked,1);assert.equal(final.body.liveRewards,false);assert.equal(final.body.inventory[0].quantity,3);
      assert.deepEqual((await f.call('legion-hunt/finish',{id,seq:event.seq})).body,final.body);
      const saved=await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('legion_hunt_owner_session_v1:1').first();
      assert.ok(saved.value.length<200000);assert.equal(JSON.parse(saved.value).state.payload,undefined);
      assert.ok(f.queries.every(q=>!/(UPDATE|INSERT INTO) (users|user_cards|cnine_user_inventory|user_equipment|user_garage)/i.test(q)));
    }finally{await f.close();}
  });
}
test('active runs retain their CMS snapshot; new runs use new settings and expire without inventory grants',async()=>{
  const f=await legionFixture();try{
    const policy=await f.configure(2),run=await started(f),event=run.payload.battleV2.result.timeline.find(e=>e.huntKill);
    policy.items[0].minQuantity=policy.items[0].maxQuantity=7;assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);
    f.clock.now=301000;const first=(await f.call('legion-hunt/reveal',{id:run.id,seq:event.seq})).body.drop;assert.equal(first.item.quantity,2);
    f.clock.now+=10000;assert.equal((await f.call('legion-hunt/claim',{id:run.id,dropId:first.id,token:first.token,...first.position})).status,409);
    const missed=await f.call('legion-hunt/finish',{id:run.id,seq:event.seq});assert.equal(missed.body.picked,0);assert.deepEqual(missed.body.inventory,[]);
    const next=await started(f);f.clock.now+=300000;const e=next.payload.battleV2.result.timeline.find(e=>e.huntKill);
    const fresh=(await f.call('legion-hunt/reveal',{id:next.id,seq:e.seq})).body.drop;assert.equal(fresh.item.quantity,7);
    f.clock.now+=31*60000;assert.equal((await f.call('legion-hunt/claim',{id:next.id,dropId:fresh.id,token:fresh.token,...fresh.position})).body.code,'HUNT_SESSION_EXPIRED');
  }finally{await f.close();}
});
test('request boundaries, policy CAS and failed session persistence never acknowledge an uncommitted click',async()=>{
  const f=await legionFixture();try{
    assert.equal((await f.call('legion-hunt/start',{difficulty:'bad'})).status,400);
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'},{origin:'https://evil.test'})).status,403);
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal',owner:true})).status,400);
    await f.configure();const run=await started(f);f.clock.now+=300000;const event=run.payload.battleV2.result.timeline.find(e=>e.huntKill);
    const drop=(await f.call('legion-hunt/reveal',{id:run.id,seq:event.seq})).body.drop;
    const claim={id:run.id,dropId:drop.id,token:drop.token,...drop.position};
    f.fail('UPDATE app_meta');assert.equal((await f.call('legion-hunt/claim',claim)).status,503);f.fail('');
    assert.equal((await f.call('legion-hunt/claim',claim)).body.inventory[0].quantity,3);
    const current=(await f.call('admin/legion-hunt')).body.policy,originalBatch=f.DB.batch;
    f.DB.batch=async statements=>{f.DB.batch=originalBatch;await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify({...current,revision:current.revision+1}),LEGION_HUNT_SETTINGS_KEY).run();return originalBatch.call(f.DB,statements);};
    assert.equal((await f.call('admin/legion-hunt',{policy:current},{method:'PATCH'})).status,409);
    assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM admin_logs').first()).n,1);
  }finally{await f.close();}
});
test('actual PVE renderer exposes the new entry only to OWNER and main/CMS load the reviewed modules',()=>{
  const source=fs.readFileSync('js/pve-command-v2-live.js','utf8');
  const context={window:{},battleState:{},battleView(){},renderBattleBuilder(){},switchPveMode(){},renderPveMonsterBrowser:null,renderBattleSnapshot:null,summaryBar:()=>''};
  vm.createContext(context);vm.runInContext(source,context);
  for(const role of ['USER','ADMIN',undefined])assert.ok(!context.battleView({role}).includes('data-legion-hunt-entry'));
  assert.ok(context.battleView({role:'OWNER'}).includes('data-legion-hunt-entry'));
  assert.match(fs.readFileSync('index.html','utf8'),/legion-hunt-entry-v1.mjs\?v=20260926/);
  assert.match(fs.readFileSync('admin/index.html','utf8'),/legion-hunt-admin-v1.mjs\?v=20260926/);
  assert.match(fs.readFileSync('functions/api/[[path]].js','utf8'),/await handleLegionHunt/);
});
test('OWNER client serializes reveal/pickup/finish and retries account lock contention with the same body',async()=>{
  const source=fs.readFileSync('preview/sustained-hunt-v2/app.js','utf8');
  const requestSource=source.slice(source.indexOf('  async function request('),source.indexOf('  const errorText='));
  let active=0,max=0,busy=true;const calls=[];
  const context={ownerMode:true,ownerRequests:Promise.resolve(),setTimeout:fn=>fn(),ownerTransport:Promise.resolve({async jointAccountRequest(path,{body}){
    active++;max=Math.max(max,active);calls.push([path,body]);await Promise.resolve();active--;
    if(busy){busy=false;throw Object.assign(Error('busy'),{code:'JOINT_LOCK_BUSY'});}return body;
  }})};
  vm.createContext(context);vm.runInContext(requestSource,context);
  const reveal={id:'run',seq:10},claim={id:'run',dropId:'drop',token:'token',x:.3,y:.4},finish={id:'run',seq:11};
  assert.deepEqual(await Promise.all([context.request('reveal',reveal),context.request('claim',claim),context.request('finish',finish)]),[reveal,claim,finish]);
  assert.equal(max,1);assert.deepEqual(calls.map(([path])=>path),['legion-hunt/reveal','legion-hunt/reveal','legion-hunt/claim','legion-hunt/finish']);
  assert.equal(calls[0][1],calls[1][1]);
});
