import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {restoreHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {validateLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';

const runKey=uid=>'legion_hunt_owner_session_v1:'+uid;
async function fixture(postgres){
  const f=await legionFixture({postgres});
  // Only the battle result is short: real auth, account snapshot, drop policy,
  // pickup validation and production grant/transaction code all run unchanged.
  f.deps.createSession=options=>Object.assign(restoreHuntSession({id:crypto.randomUUID(),policy:{id:'normal',huntDurationMs:1000,...options.dropPolicy},
    timeLimit:1000,eventTimes:[100],timeline:[{seq:1,combatAtMs:100,huntKill:true}],outcome:{}},{now:options.now}),{payload:{}});
  return f;
}
async function configure(f,{mode='ON',type='INVENTORY_ITEM',quantity=3}={}){
  f.setUser(f.owner);
  const {body}=await f.call('admin/legion-hunt');
  Object.assign(body.policy,{mode,items:[{...body.catalog.find(i=>i.type===type),enabled:true,weight:.1,minQuantity:quantity,maxQuantity:quantity}]});
  body.policy.difficulties.forEach(d=>{d.dropPercent=100;d.bossDropPercent=100;d.lifetimeSeconds=9;});
  const r=await f.call('admin/legion-hunt',{policy:body.policy},{method:'PATCH'});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.policy;
}
async function start(f,user=f.player){
  f.setUser(user);const r=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal((await f.call('legion-hunt/begin',{id:r.body.id})).status,200);return r.body.id;
}
async function drop(f,id){
  f.clock.now+=101;const r=await f.call('legion-hunt/reveal',{id,seq:1});assert.equal(r.status,200,JSON.stringify(r.body));
  const d=r.body.drop;assert.ok(d);return {id,dropId:d.id,token:d.token,...d.position};
}
async function saved(f,uid){return JSON.parse((await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(runKey(uid)).first()).value);}
const finish=(f,id)=>f.call('legion-hunt/finish',{id,seq:1});

for(const postgres of [false,true]){
  const dialect=postgres?'PostgreSQL':'SQLite';
  test(dialect+': legacy defaults to TEST; OFF blocks everyone; ON opens ordinary daily entries without granting CMS access',async()=>{
    const f=await fixture(postgres);try{
      const initial=(await f.call('admin/legion-hunt')).body.policy;delete initial.mode;
      await f.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind(LEGION_HUNT_SETTINGS_KEY,JSON.stringify(initial)).run();
      f.resetQueries();assert.equal((await f.call('legion-hunt/status')).body.access.mode,'TEST');assert.equal(f.queries.length,1);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/bootstrap')).status,403);assert.equal((await f.call('legion-hunt/status')).body.canEnter,false);
      await configure(f,{mode:'OFF'});
      for(const user of [f.owner,f.player]){f.setUser(user);assert.equal((await f.call('legion-hunt/status')).body.canEnter,false);assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,423);}
      await configure(f);f.setUser(f.player);
      assert.equal((await f.call('legion-hunt/status')).body.canEnter,true);
      assert.equal((await f.call('admin/legion-hunt')).status,403);
      assert.equal((await f.call('admin/legion-hunt',{policy:initial},{method:'PATCH'})).status,403);
      const id=await start(f);f.loseReply();assert.equal((await f.call('legion-hunt/begin',{id})).status,503);
      assert.equal((await f.call('legion-hunt/begin',{id})).body.entries.used,1);
      f.clock.now+=101;await finish(f,id);const second=await start(f);f.clock.now+=101;await finish(f,second);
      assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).body.code,'HUNT_DAILY_LIMIT');
      assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.used,2);
      for(let i=0;i<3;i++)await start(f,f.owner);
      assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.unlimited,true);
      f.clock.now=Date.parse('2026-09-29T00:00:00+09:00');await start(f);assert.equal((await f.call('legion-hunt/bootstrap')).body.entries.used,1);
    }finally{await f.close();}
  });

  test(dialect+': all four reward destinations stage pickups and settle exactly once despite lost pickup/finish replies',async()=>{
    const f=await fixture(postgres);try{
      for(const [type,quantity,table] of [['INVENTORY_ITEM',3,'cnine_user_inventory'],['CARD',2,'user_cards'],['EQUIPMENT',2,'user_equipment_instances'],['VEHICLE',1,'user_garage_vehicles']]){
        await configure(f,{type,quantity});const id=await start(f,f.owner),claim=await drop(f,id);
        f.loseReply();assert.equal((await f.call('legion-hunt/claim',claim)).status,503);
        f.resetQueries();const r=await f.call('legion-hunt/claim',claim);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.liveRewards,false);assert.equal(r.body.pendingRewards,true);
        assert.equal(r.body.item.quantity,quantity);
        assert.deepEqual((await f.call('legion-hunt/claim',claim)).body,r.body);
        assert.ok(f.queries.every(q=>!/^\s*(INSERT|UPDATE|DELETE)/i.test(q)),'replay performs no grant or session writes');
        assert.equal(Number((await f.DB.prepare('SELECT COUNT(*) n FROM '+table+' WHERE user_id=1').first()).n),0);
        f.loseReply();assert.equal((await finish(f,id)).status,503);
        const result=await finish(f,id);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.liveRewards,true);assert.equal(result.body.previewOnly,false);assert.equal(result.body.inventory[0].quantity,quantity);assert.equal(result.body.rewards[0].rewardType,type);
        assert.deepEqual((await finish(f,id)).body,result.body);
        const row=await f.DB.prepare('SELECT '+(['CARD','INVENTORY_ITEM'].includes(type)?'quantity':'COUNT(*) n')+' FROM '+table+' WHERE user_id=1').first();
        assert.equal(Number(row.quantity??row.n),quantity);
      }
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM inventory_logs').first()).n,1);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM joint_atomic_guards_v1').first()).n,0);
      // Existing garage ownership remains one vehicle; no invented duplicate payout.
      const id=await start(f,f.owner);assert.equal((await f.call('legion-hunt/claim',await drop(f,id))).status,200);
      assert.equal((await finish(f,id)).status,200);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM user_garage_vehicles').first()).n,1);
    }finally{await f.close();}
  });

  test(dialect+': settlement failures and competing writes preserve pickups and pending finish without partial grants',async()=>{
    const f=await fixture(postgres);try{
      await configure(f);let id=await start(f),claim=await drop(f,id);
      assert.equal((await f.call('legion-hunt/claim',claim)).status,200);
      for(const failure of ['UPDATE app_meta','INSERT INTO inventory_logs','DELETE FROM joint_atomic_guards_v1']){
        f.fail(failure);assert.equal((await finish(f,id)).status,503);f.fail('');
        assert.equal((await saved(f,2)).state.claims.length,1);
        assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n,0);
      }
      const batch=f.DB.batch;
      f.DB.batch=async statements=>{f.DB.batch=batch;const run=await saved(f,2);run.concurrentWrite=true;await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(run),runKey(2)).run();return batch.call(f.DB,statements);};
      assert.equal((await finish(f,id)).status,503);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n,0);
      assert.equal((await finish(f,id)).status,200);
      await configure(f,{type:'EQUIPMENT',quantity:2});id=await start(f);claim=await drop(f,id);
      assert.equal((await f.call('legion-hunt/claim',claim)).status,200);
      // Force INSERT...SELECT to insert zero rows while leaving the item visible
      // to the pre-grant validation. The in-transaction grant proof must fail.
      f.DB.batch=async statements=>{f.DB.batch=batch;return batch.call(f.DB,statements.filter(s=>!String(s.source??s.sql??'').startsWith('INSERT INTO user_equipment_instances')));};
      const failed=await finish(f,id);assert.equal(failed.status,503,JSON.stringify(failed.body));
      assert.equal((await saved(f,2)).state.claims.length,1);assert.equal((await saved(f,2)).rewardStatus,'PENDING');
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM user_equipment_instances').first()).n,0);
      assert.equal((await finish(f,id)).status,200);
    }finally{await f.close();}
  });

  test(dialect+': mode changes cannot upgrade TEST loot or grant while stopped; old ON runs retain their drop settings',async()=>{
    const f=await fixture(postgres);try{
      await configure(f,{mode:'TEST'});let id=await start(f,f.owner),claim=await drop(f,id);
      await configure(f);let r=await f.call('legion-hunt/claim',claim);assert.equal(r.status,200);assert.equal(r.body.liveRewards,false);
      assert.equal((await finish(f,id)).body.liveRewards,false);
      assert.equal((await f.DB.prepare('SELECT COUNT(*) n FROM cnine_user_inventory').first()).n,0);
      id=await start(f,f.owner);claim=await drop(f,id);await configure(f,{mode:'TEST'});
      assert.equal((await f.call('legion-hunt/claim',claim)).body.code,'HUNT_REWARD_PAUSED');
      assert.equal((await saved(f,1)).state.claims.length,0);
      await configure(f,{mode:'ON',quantity:7});
      assert.equal((await f.call('legion-hunt/claim',claim)).body.item.quantity,3);
      // An OFF save racing settlement is caught inside the atomic batch.
      const batch=f.DB.batch;
      f.DB.batch=async statements=>{f.DB.batch=batch;const row=await f.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(LEGION_HUNT_SETTINGS_KEY).first();const policy=JSON.parse(row.value);policy.mode='OFF';await f.DB.prepare('UPDATE app_meta SET value=? WHERE key=?').bind(JSON.stringify(policy),LEGION_HUNT_SETTINGS_KEY).run();return batch.call(f.DB,statements);};
      assert.equal((await finish(f,id)).status,503);assert.equal((await saved(f,1)).state.claims.length,1);assert.equal((await saved(f,1)).rewardStatus,'PENDING');
      await configure(f,{quantity:7});r=await finish(f,id);assert.equal(r.status,200);assert.equal(r.body.inventory[0].quantity,3);
      const next=await start(f,f.owner),nextClaim=await drop(f,next);
      assert.equal((await f.call('legion-hunt/claim',{...nextClaim,token:'forged'})).status,409);
      f.setUser(f.player);assert.equal((await f.call('legion-hunt/claim',nextClaim)).status,409);f.setUser(f.owner);
      f.clock.now+=10000;assert.equal((await f.call('legion-hunt/claim',nextClaim)).status,409);
      assert.equal((await f.DB.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity,3);
    }finally{await f.close();}
  });
}

test('thousandths persist exactly and are used by the weighted draw; earlier tenths remain compatible',async()=>{
  const f=await fixture(false);try{
    const policy=await configure(f),catalog=(await f.call('admin/legion-hunt')).body.catalog;
    assert.equal((await f.call('admin/legion-hunt')).body.policy.items[0].weight,.1);
    for(const weight of [.0001,.0015,1e-12,-.1,1000000.1,NaN])assert.throws(()=>validateLegionHuntPolicy({...policy,items:[{...policy.items[0],weight}]},catalog));
    for(const weight of [.3,.01,.001,.123,999999.999])assert.equal(validateLegionHuntPolicy({...policy,items:[{...policy.items[0],weight}]},catalog).items[0].weight,weight);
    policy.items[0].weight=.001;
    assert.equal((await f.call('admin/legion-hunt',{policy},{method:'PATCH'})).status,200);
    assert.equal((await f.call('admin/legion-hunt')).body.policy.items[0].weight,.001);
    for(const [point,expected] of [[.0005,'a'],[.001,'b'],[.999,'b']]){
      const s=restoreHuntSession({id:crypto.randomUUID(),policy:{dropChance:1,dropLifeMs:9000,items:[{code:'a',weight:.001},{code:'b',weight:.999}]},timeLimit:1000,eventTimes:[0],timeline:[{seq:1,combatAtMs:0,huntKill:true}],outcome:{}},{now:()=>1000,random:()=>point});
      s.begin();assert.equal(s.reveal(1).drop.item.code,expected);
    }
  }finally{await f.close();}
});

test('navigation uses one status-only read per mount and stays hidden on denied or failed checks',async()=>{
  const source=fs.readFileSync('js/legion-hunt-entry-v1.mjs','utf8');
  const code=source.slice(source.indexOf('const checkedNavigation='),source.indexOf('window.openLegionHunt=')).replace('export function','function');
  const sync=vm.runInNewContext(code+';syncLegionHuntNavigation');
  for(const data of [{canEnter:false,access:{mode:'TEST'}},{canEnter:true,access:{mode:'ON'}},null]){
    const detail={textContent:''},button={hidden:false,isConnected:true,querySelector:()=>detail},root={querySelectorAll:()=>[button]};let reads=0;
    const request=async path=>{reads++;assert.equal(path,'legion-hunt/status');if(!data)throw Error('offline');return data;};
    sync(root,request);sync(root,request);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(reads,1);assert.equal(button.hidden,data?.canEnter!==true);
  }
});
