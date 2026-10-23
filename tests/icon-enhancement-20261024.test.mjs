import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {iconFurFixture,live} from './helpers/icon-fur15-fixture.mjs';
import {ICON_ENHANCEMENT_POLICY as POLICY,ICON_ENHANCEMENT_KEY as KEY,defaultIconEnhancementSettings,validateIconEnhancementSettings,iconEnhancementPower,iconEnhancementSteps} from '../shared/icon-enhancement-v1.mjs';
import {runIconEnhancement,iconEnhancementOverview,iconEnhancementReceipt,handleIconEnhancement,saveIconEnhancementSettings,readIconEnhancementSettings} from '../functions/_icon_enhancement.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {buildIconFurReference} from '../functions/_icon_fur_reference.js';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {buildFighter,createPvpBattleV2,createPveBattleV2,distributeEquipment} from '../functions/_battle_v2_preview.js';

const cardId=ICON_ROLES[0].cardId;
const config=()=>({revision:1,enabled:true,steps:Array.from({length:10},(_,i)=>({coinCost:1000000000*(i+1),masterStarCost:100*(i+1)}))});
async function fixture(t,postgres){
  const f=await iconFusionFixture(t,{postgres});
  await f.p('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(7,?,2,0)',cardId).run();
  await f.setting(KEY,config());
  return {...f,body:(level=0)=>({requestId:crypto.randomUUID(),cardId,expectedLevel:level,expectedRevision:1,policyVersion:POLICY.version})};
}
test('fixed 10% policy, +10 triple power, costs stay unset and cannot be zero or forged',()=>{
  const defaults=defaultIconEnhancementSettings();assert.equal(defaults.enabled,false);assert.ok(defaults.steps.every(s=>s.coinCost===null&&s.masterStarCost===null));
  assert.deepEqual(iconEnhancementSteps().map(s=>s.rate),Array(10).fill(10));assert.equal(iconEnhancementPower(0),180000);assert.equal(iconEnhancementPower(10),540000);assert.equal(iconEnhancementPower(99),540000);
  assert.throws(()=>validateIconEnhancementSettings({...defaults,enabled:true}));
  for(const bad of [0,-1,1.5,Number.MAX_SAFE_INTEGER,undefined,'100']){
    const raw=config();raw.steps[0].coinCost=bad;assert.throws(()=>validateIconEnhancementSettings({enabled:false,steps:raw.steps}));
  }
  assert.throws(()=>validateIconEnhancementSettings({enabled:false,steps:config().steps,successRate:100}));
  assert.equal(POLICY.pity,false);assert.equal(POLICY.duplicateCards,0);
});
for(const postgres of [false,true]){
  const name=postgres?'PostgreSQL':'SQLite';
  test(`${name}: all ten success boundaries charge both materials exactly once and retain copies`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot();
    let totalCoins=0,totalStars=0;
    for(let level=0;level<10;level++){
      const body=f.body(level),result=await runIconEnhancement(f.env,f.user,body,{randomInt:()=>99999});
      assert.equal(result.success,true);assert.equal(result.level,level+1);assert.equal(result.power,180000+36000*(level+1));
      const repeated=await runIconEnhancement(f.env,f.user,body,{randomInt(){throw Error('reroll')}});assert.equal(repeated.replayed,true);
      assert.equal((await iconEnhancementReceipt(f.env,f.user,body.requestId)).level,level+1);
      totalCoins+=config().steps[level].coinCost;totalStars+=config().steps[level].masterStarCost;
    }
    const after=await f.snapshot();assert.equal(after.coin,before.coin-totalCoins);assert.equal(after.stars,before.stars-totalStars);
    assert.equal(after.cards.find(c=>c.card_id===cardId).quantity,2);assert.equal(after.cards.find(c=>c.card_id===cardId).breakthrough_level,10);
    assert.equal((await iconEnhancementOverview(f.env,f.user,cardId)).canAttempt,false);
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,f.body(9)),{code:'ICON_ENHANCEMENT_MAX'});
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),10);
    assert.equal(Number((await f.p("SELECT COUNT(*) n FROM inventory_logs WHERE reference_type='V3_JOINT'").first()).n),10);
  });
  test(`${name}: every failure consumes both materials, keeps level, and has no hidden pity`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot();
    for(let level=0;level<10;level++){
      await f.p('UPDATE user_cards SET breakthrough_level=?,breakthrough_fail_count=999 WHERE user_id=7 AND card_id=?',level,cardId).run();
      const result=await runIconEnhancement(f.env,f.user,f.body(level),{randomInt:()=>100000});assert.equal(result.success,false);assert.equal(result.level,level);
      const row=await f.p('SELECT breakthrough_fail_count,quantity FROM user_cards WHERE user_id=7 AND card_id=?',cardId).first();assert.equal(Number(row.breakthrough_fail_count),1000);assert.equal(Number(row.quantity),2);
    }
    const after=await f.snapshot();assert.equal(after.coin,before.coin-55000000000);assert.equal(after.stars,before.stars-5500);
  });
  test(`${name}: failed card write rolls back money, stars and logs; retry preserves the original result`,async t=>{
    const f=await fixture(t,postgres),body=f.body(),before=await f.snapshot();f.fail('UPDATE user_cards SET breakthrough_level=');
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,body,{randomInt:()=>0}));assert.deepEqual(await f.snapshot(),before);
    assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
    const pending=await iconEnhancementReceipt(f.env,f.user,body.requestId);assert.equal(pending.status,'PENDING');assert.equal(pending.success,undefined);assert.equal(pending.roll,undefined);
    assert.equal((await iconEnhancementOverview(f.env,f.user,cardId)).pending.requestId,body.requestId);
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,f.body()),{code:'ICON_ENHANCEMENT_PENDING'});
    f.fail('');const result=await runIconEnhancement(f.env,f.user,body,{randomInt(){throw Error('reroll')}});assert.equal(result.success,true);
  });
  test(`${name}: zero-row update is atomic, stale saved plan is cancelled without payment`,async t=>{
    const f=await fixture(t,postgres),body=f.body(),before=await f.snapshot(),batch=f.DB.batch.bind(f.DB);
    f.DB.batch=statements=>batch(statements.map(s=>s.source?.startsWith('UPDATE user_cards SET breakthrough_level=')?f.p('SELECT 1'):s));
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,body,{randomInt:()=>0}));assert.deepEqual(await f.snapshot(),before);
    f.DB.batch=batch;await f.p('UPDATE user_cards SET breakthrough_level=1 WHERE card_id=?',cardId).run();
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,body),{code:'ICON_ENHANCEMENT_STALE'});
    assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');assert.equal(await f.coin(),before.coin);
  });
  test(`${name}: missing/paused/incomplete settings and insufficient currency cannot charge`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot();
    await f.p('DELETE FROM app_meta WHERE key=?',KEY).run();assert.equal((await readIconEnhancementSettings(f.env)).enabled,false);
    await assert.rejects(()=>runIconEnhancement(f.env,f.user,{...f.body(),expectedRevision:0}),{code:'ICON_ENHANCEMENT_CLOSED'});
    for(const cfg of [{...config(),enabled:false},{...config(),steps:config().steps.map((s,i)=>i===1?{...s,coinCost:null}:s)}]){
      await f.setting(KEY,cfg);const level=cfg.enabled?1:0;await f.p('UPDATE user_cards SET breakthrough_level=? WHERE card_id=?',level,cardId).run();
      await assert.rejects(()=>runIconEnhancement(f.env,f.user,f.body(level)),{code:'ICON_ENHANCEMENT_CLOSED'});
    }
    await f.setting(KEY,config());await f.p('UPDATE user_cards SET breakthrough_level=0 WHERE card_id=?',cardId).run();
    await f.p('UPDATE users SET coin=0 WHERE id=7').run();await assert.rejects(()=>runIconEnhancement(f.env,f.user,f.body()),{code:'ICON_ENHANCEMENT_BALANCE'});
    await f.p('UPDATE users SET coin=? WHERE id=7',before.coin).run();await f.p("UPDATE cnine_user_inventory SET quantity=99 WHERE user_id=7 AND item_code='MASTER_STAR'").run();await assert.rejects(()=>runIconEnhancement(f.env,f.user,f.body()),{code:'ICON_ENHANCEMENT_BALANCE'});
    await f.p("UPDATE cnine_user_inventory SET quantity=? WHERE user_id=7 AND item_code='MASTER_STAR'",before.stars).run();assert.deepEqual(await f.snapshot(),before);
    for(const id of ['CN-FUR','unowned'])await assert.rejects(()=>runIconEnhancement(f.env,f.user,{...f.body(),cardId:id}),{code:'ICON_ENHANCEMENT_CARD'});
  });
  test(`${name}: lost acknowledgement and simultaneous requests cannot duplicate a charge`,async t=>{
    const f=await fixture(t,postgres),before=await f.snapshot(),batch=f.DB.batch.bind(f.DB);let lost=false;
    f.DB.batch=async statements=>{const result=await batch(statements);if(!lost&&statements.some(s=>s.source?.includes("SET status='COMPLETED'"))){lost=true;throw Error('LOST_ACK')}return result;};
    const results=await Promise.allSettled([f.body(),f.body()].map(body=>f.deps.withUserMutationLock(f.env,7,'icons/enhancement/attempt',()=>runIconEnhancement(f.env,f.user,body,{randomInt:()=>0}))));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(lost,true);assert.equal((await f.snapshot()).coin,before.coin-1000000000);
  });
}
test('OWNER settings preserve null drafts, revision conflicts and replay; routes reject tampering and foreign receipts',async t=>{
  const f=await fixture(t,true),deps={...f.deps,requirePermission:async()=>f.user};
  const send=(path,body,method='POST',origin='https://qa.test',auth='local-account-7')=>handleIconEnhancement({path,env:f.env,deps,request:new Request(`https://qa.test/api/${path}`,{method,headers:{origin,'Content-Type':'application/json',Authorization:`Bearer ${auth}`},...(body?{body:JSON.stringify(body)}:{})})});
  assert.equal((await send('icons/enhancement/attempt',f.body(),'POST','https://evil.test')).status,403);
  assert.equal((await send('icons/enhancement/attempt',{...f.body(),success:true})).status,400);
  assert.equal((await send('icons/enhancement/attempt',f.body(),'POST','https://qa.test','no-token')).status,401);
  const settings={requestId:crypto.randomUUID(),expectedRevision:1,enabled:false,steps:defaultIconEnhancementSettings().steps};
  const saved=await saveIconEnhancementSettings(f.env,f.user,settings);assert.equal(saved.revision,2);assert.equal(saved.steps[9].coinCost,null);
  assert.deepEqual(await saveIconEnhancementSettings(f.env,f.user,settings),saved);
  await assert.rejects(()=>saveIconEnhancementSettings(f.env,f.user,{...settings,requestId:crypto.randomUUID()}),{code:'ICON_ENHANCEMENT_CONFLICT'});
  deps.requirePermission=async()=>({id:7,role:'ADMIN'});assert.equal((await send('admin/icons/enhancement',null,'GET')).status,403);
  await f.setting(KEY,config());const body=f.body();await runIconEnhancement(f.env,f.user,body,{randomInt:()=>0});
  await assert.rejects(()=>iconEnhancementReceipt(f.env,{id:8},body.requestId),{code:'JOINT_NOT_FOUND'});
  await assert.rejects(()=>runIconEnhancement(f.env,f.user,{...body,expectedLevel:1}),{code:'JOINT_REQUEST_CONFLICT'});
});
test('changed settings cancel an unpaid saved request; a completed receipt survives switching OFF',async t=>{
  const f=await fixture(t,false),before=await f.snapshot(),body=f.body();f.fail('UPDATE user_cards SET breakthrough_level=');
  await assert.rejects(()=>runIconEnhancement(f.env,f.user,body,{randomInt:()=>0}));f.fail('');await f.setting(KEY,{...config(),revision:2,enabled:false});
  await assert.rejects(()=>runIconEnhancement(f.env,f.user,body),{code:'ICON_ENHANCEMENT_STALE'});assert.deepEqual(await f.snapshot(),before);
  await f.setting(KEY,config());const done=f.body();await runIconEnhancement(f.env,f.user,done,{randomInt:()=>0});await f.setting(KEY,{...config(),enabled:false});
  assert.equal((await runIconEnhancement(f.env,f.user,done)).replayed,true);
});
test('real client/server power, all role stat floors and authoritative snapshots grow without extra speed',async()=>{
  const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),api=read('functions/api/[[path]].js'),app=read('js/app.js');
  const ctx={iconEnhancementPower,FUR_MAX_ENHANCEMENT:15,FAKER_CHAMPIONSHIP_CARD_ID:'other',FAKER_FLAT_POWER_BONUS:3000,breakthroughBonusPercent:()=>0,clientBreakthroughBonusPercent:()=>0};
  const server=vm.runInNewContext(api.slice(api.indexOf('function cardPowerBase('),api.indexOf('function sqlUtcNow('))+';cardBattlePower',ctx);
  const client=vm.runInNewContext(app.slice(app.indexOf('function battleCardPower('),app.indexOf('function pveDeckCardMini('))+';battleCardPower',ctx);
  const ref=buildIconFurReference(live.cards,live.battle,live.high);
  for(const def of ICON_ROLES)for(const mode of ['PVE','PVP'])for(const gear of [0,100000]){
    let previous=null,base=null;
    for(let level=0;level<=10;level++){
      const card={id:def.cardId,grade:'ICON',breakthrough_level:level,power:server({grade:'ICON'},level,{})};
      assert.equal(client(card,{breakthroughs:{[card.id]:level}},{}),180000+36000*level);
      const actor=buildFighter({...card,effectivePower:card.power+gear,equipmentShare:gear,iconRole:{...iconRoleSnapshot(card,defaultIconRoles(),mode),enhancementLevel:level,supremacy:ref}},0,'A',null,mode);
      if(!base)base=actor;
      if(previous)for(const k of ['attack','maxHp','defense'])assert.ok(actor[k]>previous[k],`${def.code} ${mode} ${k} +${level}`);
      assert.equal(actor.speed,base.speed);
      if(level===10&&gear===0)for(const k of ['attack','maxHp','defense'])assert.ok(Math.abs(actor[k]/base[k]-3)<0.0001);
      previous=actor;
    }
  }
  const f=iconFurFixture();try{
    for(const mode of ['PVE','PVP','CAPTAIN']){
      const states=[];
      for(const level of [0,10]){
        const cards=[{id:cardId,grade:'ICON',power:iconEnhancementPower(level),breakthrough_level:level}];
        states.push((await cardUniqueDeckStates(f.env,[{user:{id:1},cards}],mode,{fresh:true,batched:true}))[0]);
      }
      assert.equal(states[1].cards[0].iconRole.enhancementLevel,10);
      if(mode==='CAPTAIN'){assert.ok(Math.abs(states[1].power/states[0].power-3)<0.0001);assert.equal(states[1].speedPercent,states[0].speedPercent);}
      else{
        const cards=states[1].cards.map(c=>({...c,power:540000})),normal=Array.from({length:4},(_,i)=>({id:'n'+i,grade:'SSR',power:50000}));
        const result=mode==='PVE'?createPveBattleV2({cards:[...cards,...normal],monster:{id:'boss',power:3000000,is_boss:1},seed:5}):createPvpBattleV2({attackerCards:[...cards,...normal],defenderCards:[...states[0].cards,...normal],seed:5});
        assert.ok(result.result.timeline.every(e=>e.damage==null||Number.isFinite(e.damage)));
        assert.equal(result.teams.A.cards[0].iconRole.enhancementLevel,10);
      }
    }
  }finally{f.close();}
});
test('enhancing an ICON does not take equipment or speed from its four party members',()=>{
  const normal=Array.from({length:4},(_,i)=>({id:'n'+i,grade:'FUR',power:100000}));
  const party=level=>[{id:cardId,grade:'ICON',power:iconEnhancementPower(level),breakthrough_level:level},...normal];
  for(const bonus of [0,100000,10000000])assert.deepEqual(distributeEquipment(party(10),bonus).map(c=>c.equipmentShare),distributeEquipment(party(0),bonus).map(c=>c.equipmentShare));
});
