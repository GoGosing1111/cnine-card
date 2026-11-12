import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICY, ROLES, formatAmount } from '../shared/mercenary-advancement-v1.mjs';
import { attachReleasedMercenaryLevels } from '../functions/_mercenary_level_policy.js';
import { mercenaryAdvancementCombat } from '../functions/_mercenary_advancement_combat.js';
import { createPveBattleV2, createPvpBattleV2, createDuoBattleV2, simulateBattleV2Preview, buildFighter } from '../functions/_battle_v2_preview.js';
import { buildMercenaryFighter } from '../functions/_mercenary_combat.js';
import { MAGIC_SEASON2_REVIEW } from '../shared/magic-season2-v1.mjs';
import { MERCENARY_LEVEL_KEY } from '../shared/mercenary-level-v1.mjs';
import { ADVANCEMENT_PREFIX } from '../functions/_mercenary_advancement_storage.js';
import { LOAN_PREFIX } from '../functions/_comeback_loans.js';
import { advancementFixture } from './helpers/mercenary-advancement-fixture.mjs';
import { operatingMercenaries, tierCards } from './helpers/mercenary-operating-roster-v2144.mjs';

const change=(role='vanguard',revision=0,extra={})=>({idempotencyKey:crypto.randomUUID(),mercenaryCode:'V-996',advancementId:role,expectedRevision:revision,expectedPolicyRevision:POLICY.revision,expectedAccountId:7,...extra});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' — codex, exact balance, repeat, races, rollback, ownership and snapshots',async t=>{
  const f=await advancementFixture(t,postgres), state=async()=>(await f.call('state')).data;
  const original=await state();
  assert.equal(original.wallet.coin,'90071992547409937');
  assert.equal(original.cards.find(c=>c.code==='V-055').growth.level,1);
  assert.equal(original.cards.find(c=>c.code==='V-049').growth.level,21);
  assert.equal((await f.call('state',null,0)).status,401);
  assert.equal((await f.call('change',change('missing'))).status,400);
  assert.equal((await f.call('change',change('vanguard',0,{expectedPolicyRevision:'old'}))).status,409);
  assert.equal((await f.call('change',change('vanguard',0,{mercenaryCode:'V-055'}))).status,409);
  assert.equal((await f.call('change',change('vanguard',0,{mercenaryCode:'V-977'}))).status,409);
  assert.equal((await f.call('change',change('vanguard',0,{expectedAccountId:8}))).status,409);
  const low=f.document.mercenaries.find(c=>['C','B','A','S'].includes(c.rank)).code;
  await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,?,?)',low,'2026-11-01','2026-11-01').run();
  await f.setState(low,{level:20,experience:0,breakthroughMask:15,revision:1});
  assert.equal((await f.call('change',change('vanguard',0,{mercenaryCode:low}))).data.code,'MERCENARY_ADVANCEMENT_INELIGIBLE');
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',LOAN_PREFIX+7,'2099-01-01T00:00:00.000Z').run();
  await f.setting(ADVANCEMENT_PREFIX+'7:V-977',{id:'barrier',revision:1});
  assert.equal((await f.call('change',change('vanguard',0,{mercenaryCode:'V-977'}))).data.code,'MERCENARY_ADVANCEMENT_INELIGIBLE');
  const borrowed=await attachReleasedMercenaryLevels(f.env,new Map([[7,{code:'V-977',rank:'SSS'}]]));
  assert.equal(borrowed.get(7).advancementId,undefined);
  const id=change();
  f.fail('INSERT INTO inventory_logs');
  assert.equal((await f.call('change',id)).status,503);f.fail('');
  assert.deepEqual((await state()).wallet,original.wallet);
  const originalOwnerOnly=await f.call('change',{...id,expectedAccountId:8},8);
  assert.equal(originalOwnerOnly.status,409);assert.equal(originalOwnerOnly.data.code,'JOINT_REQUEST_CONFLICT');
  const ok=await f.call('change',id);assert.equal(ok.status,200,JSON.stringify(ok.data));
  assert.equal(ok.data.snapshot.wallet.coin,'90061992547409937');assert.equal(ok.data.snapshot.wallet.MASTER_STAR,'110000000');
  assert.deepEqual(ok.data.snapshot.cards.find(c=>c.code===id.mercenaryCode).growth,original.cards.find(c=>c.code===id.mercenaryCode).growth);
  const same=await f.call('change',id);assert.equal(same.data.receiptId,ok.data.receiptId);assert.ok(same.data.replayed);
  assert.equal((await f.call('change',{...id,advancementId:'healer'})).status,409);
  assert.equal((await f.call('change',change('vanguard',1))).status,409);
  const results=await Promise.all([f.call('change',change('healer',1)),f.call('change',change('guardian',1))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const now=await state(), card=now.cards.find(c=>c.code==='V-996');
  assert.equal(card.advancement.revision,2);assert.equal(now.wallet.MASTER_STAR,'60000000');
  assert.equal(now.wallet.coin,'90051992547409937');
  assert.deepEqual(card.growth,original.cards.find(c=>c.code===card.code).growth);
  const snapshots=await attachReleasedMercenaryLevels(f.env,new Map([[7,[{code:card.code,rank:card.rank},{code:'V-049',rank:'SSS'}]]]));
  assert.equal(snapshots.get(7)[0].advancementId,card.advancement.id);
  assert.equal(snapshots.get(7)[1].advancementId,undefined);
  await f.setting(MERCENARY_LEVEL_KEY,{...f.policy,mode:'OFF'});
  const growthClosed=await attachReleasedMercenaryLevels(f.env,new Map([[7,{code:card.code}]]));
  assert.equal(growthClosed.get(7).advancementId,card.advancement.id);
  assert.equal(growthClosed.get(7).mercenaryLevel,undefined);
  assert.equal(Number((await f.p('SELECT source_version FROM ranked_duo_accounts_v1 WHERE user_id=7').first()).source_version),4);
  assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM inventory_logs WHERE reason LIKE '용병 전직%'").first()).n),2);
  assert.equal(Number((await f.p("SELECT COUNT(*) AS n FROM coin_logs WHERE reason LIKE '용병 전직%'").first()).n),2);
  await f.p("UPDATE cnine_user_inventory SET quantity=49999999 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  const nextRole=card.advancement.id==='healer'?'guardian':'healer';
  assert.equal((await f.call('change',change(nextRole,2))).data.code,'MERCENARY_ADVANCEMENT_FUNDS');
  await f.p("UPDATE cnine_user_inventory SET quantity=50000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  await f.p("UPDATE users SET coin=9999999999999 WHERE id=7").run();
  assert.equal((await f.call('change',change(nextRole,2))).data.code,'MERCENARY_ADVANCEMENT_FUNDS');
});

const actor=(id,side,role)=>({id,side,slot:0,attack:100,shield:0,maxShield:0,hp:1000,maxHp:1000,damageDealt:0,healingDone:0,
  alive:true,...(role?{isMercenary:true,advancementId:role}:{})});
function scenario(role) {
  const a=actor('a','A',role),ally=actor('ally','A'),b=actor('b','B'),other=actor('other','B'),events=[],hits=[];
  const teams={A:[a,ally],B:[b,other]};
  const game=mercenaryAdvancementCombat({teams,emit:(type,data)=>events.push({type,...data}),
    heal:(t,n)=>{const healed=Math.min(t.maxHp-t.hp,n);t.hp+=healed;return healed;},
    cleanseOne:t=>t.debuffs?.shift(),extraHit:(s,t,n)=>{hits.push([s.id,t.id,n]);t.hp-=n;return {hpDamage:n,absorbed:0};},knockout:t=>{if(t.hp<=0)t.alive=false;}});
  game.open();
  const hit=(source,target,n=100)=>{
    const opts={direct:true},hpBefore=target.hp;
    game.attempt(source,target);const amount=game.beforeDamage(source,target,n,opts);
    target.hp=Math.max(0,target.hp-amount);
    game.afterDamage(source,target,{hpBefore,hpAfter:target.hp,hpDamage:hpBefore-target.hp,absorbed:0},opts);return amount;
  };
  const attack=(s,t,n)=>{game.begin(s,true);const v=hit(s,t,n);game.end(s);return v;};
  const act=()=>{game.begin(a,true);game.end(a);};
  return {a,ally,b,other,game,hit,attack,act,events,hits,teams};
}
const cases={
  vanguard(s){s.game.begin(s.a,true);assert.equal(s.hit(s.a,s.b),140);assert.equal(s.hit(s.a,s.other),140);s.game.end(s.a);assert.equal(s.attack(s.a,s.b),100);},
  duelist(s){assert.deepEqual([s.b,s.b,s.other,s.b].map(t=>s.attack(s.a,t)),[100,115,100,100]);},
  executioner(s){s.b.hp=301;assert.equal(s.attack(s.a,s.b),100);s.b.hp=300;assert.equal(s.attack(s.a,s.b),125);},
  berserker(s){s.a.hp=501;assert.equal(s.attack(s.a,s.b),100);s.a.hp=500;assert.equal(s.attack(s.a,s.b),120);},
  breaker(s){s.game.begin(s.a,true);s.hit(s.a,s.b);s.game.afterDamage(s.a,s.b,{hpDamage:0,absorbed:25,advancementShieldDamage:10},{direct:true});
    assert.equal(s.events.filter(e=>e.roleId==='breaker').length,1);},
  combo(s){for(let i=0;i<3;i++){s.game.begin(s.a,true);s.hit(s.a,s.b,70);s.hit(s.a,s.other,120);s.hit(s.a,s.b,30);s.game.end(s.a);}assert.deepEqual(s.hits,[['a','b',30]]);},
  vampire(s){s.a.hp=500;s.game.begin(s.a,true);s.hit(s.a,s.b);s.hit(s.a,s.other);s.game.end(s.a);assert.equal(s.a.hp,550);s.act();assert.equal(s.a.hp,550);},
  avenger(s){s.attack(s.b,s.a);s.attack(s.other,s.a);assert.equal(s.attack(s.a,s.b),120);assert.equal(s.attack(s.a,s.b),100);assert.deepEqual(s.events.filter(e=>'charged'in e).map(e=>e.charged),[true,false]);},
  'shield-knight'(s){s.game.begin(s.b,true);assert.equal(s.hit(s.b,s.a),70);assert.equal(s.hit(s.b,s.a),70);s.game.end(s.b);
    assert.deepEqual([1,2,3].map(()=>s.attack(s.b,s.a)),[70,70,100]);assert.deepEqual(s.events.map(e=>e.remaining),[3,2,1,0]);},
  barrier(s){assert.equal(s.a.shield,200);s.act();assert.equal(s.a.shield,200);},
  undying(s){s.a.hp=30;s.attack(s.b,s.a,500);assert.equal(s.a.hp,100);s.attack(s.b,s.a,500);assert.equal(s.a.hp,0);},
  regenerator(s){s.a.hp=501;s.act();assert.equal(s.a.hp,541);s.a.hp=990;s.act();assert.equal(s.a.hp,1000);},
  healer(s){s.a.hp=500;s.ally.maxHp=2000;s.ally.hp=600;s.act();assert.equal(s.ally.hp,660);s.a.hp=200;s.act();assert.equal(s.a.hp,230);},
  guardian(s){s.ally.maxHp=2000;s.act();s.act();assert.equal(s.ally.shield,0);s.act();assert.equal(s.ally.shield,240);assert.equal(s.a.shield,0);},
  cleanser(s){s.ally.debuffs=['curse','poison'];s.game.begin(s.a,true);assert.deepEqual(s.ally.debuffs,['poison']);s.game.end(s.a);},
  commander(s){assert.equal(s.ally.attack,108);s.game.updateCommand();assert.equal(s.ally.attack,108);s.a.alive=false;s.game.updateCommand();assert.equal(s.ally.attack,100);s.a.alive=true;s.game.updateCommand();assert.equal(s.ally.attack,108);}
};
test('wallet formats exact Korean units and individual coin digits',()=>{
  assert.equal(formatAmount('10000000000000'),'10조');
  assert.equal(formatAmount('50000000'),'5,000만');
  assert.equal(formatAmount('10001'),'1만 1');
});
test('shield bonus in the real damage pipeline stops at remaining shield and never spills into HP',()=>{
  const snapshot=operatingMercenaries.find(m=>m.rank==='SS');
  function firstHit(shield,role) {
    const attacker={...buildMercenaryFighter({...snapshot,advancementId:role},'A','PVP',buildFighter),speed:99999,gauge:99,skills:[]};
    const target={...buildFighter({id:'QA',power:100000,power_type:'ATTACK'},0,'B'),shield,maxShield:shield,gauge:0,speed:1};
    const battle=simulateBattleV2Preview({teamA:[attacker],teamB:[target],maxActions:1,seed:485});
    return battle.timeline.find(e=>e.type==='TURN' && e.actorId===attacker.id);
  }
  const damage=firstHit(0,null).damage;
  for(const shield of [0,100,damage+100,10000000]){
    const base=firstHit(shield,null),bonus=firstHit(shield,'breaker');
    assert.equal(bonus.damage,base.damage);
    assert.equal(bonus.absorbed,base.absorbed+Math.min(shield-base.absorbed,Math.round(base.absorbed*.50)));
  }
});
test('two commanders in the real duo share one bonus across both owners',()=>{
  const snapshot=operatingMercenaries.find(m=>m.rank==='SS');
  const squad=(id,role)=>({ownerId:id,cards:tierCards(90000).map(c=>({...c,id:'QA-'+id+'-'+c.id})),
    mercenary:{...snapshot,advancementId:role}});
  const battle=(first,second)=>createDuoBattleV2({attackerSquads:[squad(1,first),squad(2,second)],
    defenderSquads:[squad(3,'barrier'),squad(4)],seed:485});
  const one=battle('commander'),two=battle('commander','commander');
  assert.deepEqual(two.teams.A.mercenaries.map(m=>m.advancementId),['commander','commander']);
  assert.deepEqual(two.teams.A.cards.map(c=>c.attack),one.teams.A.cards.map(c=>c.attack));
  const activations=two.result.timeline.filter(e=>e.roleId==='commander'&&e.active===true&&e.burst);
  assert.equal(activations.length,2);assert.deepEqual(activations[0].allyIds,activations[1].allyIds);
  assert.equal(activations[0].allyIds.length,12);
});
test('two commanders, a defeated commander, a late ally and combat end do not stack or retain the aura',()=>{
  const first=actor('a','A','commander'),second=actor('b','A','commander'),ally=actor('c','A'),team=[first,second,ally],events=[];
  const battle=mercenaryAdvancementCombat({teams:{A:team,B:[]},emit:(_t,e)=>events.push(e)});
  battle.open();assert.equal(ally.attack,108);
  first.alive=false;battle.updateCommand();assert.equal(ally.attack,108);
  second.untargetable=true;battle.updateCommand();assert.equal(ally.attack,108);
  const joined=actor('new','A');team.push(joined);battle.updateCommand();
  assert.equal(joined.attack,108);assert.ok(events.at(-1).allyIds.includes(joined.id));
  second.alive=false;battle.updateCommand();assert.equal(ally.attack,100);assert.equal(joined.attack,100);
});
test('a missed third attack has no follow-up and the next attack starts the next three-action cycle',()=>{
  const s=scenario('combo');s.attack(s.a,s.b,1);s.attack(s.a,s.b,1);
  s.game.begin(s.a,true);s.game.attempt(s.a,s.b);s.game.end(s.a);assert.equal(s.hits.length,0);
  for(let i=0;i<3;i++)s.attack(s.a,s.b,10);
  assert.deepEqual(s.hits,[['a','b',3]]);
});
// Exercise actual damage, healing, debuffs and knockout in a wounded team with no HP-type card.
function conditionedBattle(id,{season2=false,healBlocked=false}={}) {
  const snapshot=operatingMercenaries.find(m=>m.rank==='SS');
  const attacker={...buildMercenaryFighter({...snapshot,advancementId:id},'A','PVP',buildFighter),
    skills:[],speed:1000,gauge:95,hp:id==='undying'?1:450000,maxHp:1000000,attack:12000,defense:100};
  const defender={...buildFighter({id:'enemy',power:10000,power_type:'ATTACK'},0,'B'),
    hp:2400000,maxHp:10000000,speed:90,gauge:90,shield:250000,maxShield:250000,attack:10000,defense:100};
  if(['avenger','shield-knight','undying'].includes(id))Object.assign(defender,{speed:700,gauge:99});
  const team=[attacker];
  if(['healer','guardian','cleanser'].includes(id))team.push({
    ...buildFighter({id:'helper',power:5000,power_type:'ATTACK'},1,'A'),maxHp:1000000,hp:200000,speed:2,
    magicSealCharges:id==='cleanser'?2:0});
  return simulateBattleV2Preview({teamA:team,teamB:[defender],maxActions:40,seed:485,
    [MAGIC_SEASON2_REVIEW]:season2,suddenDeathAfter:healBlocked?1:0});
}
for(const {id,name} of ROLES)test(name+' — canonical engine fires under the documented condition',()=>{
  const events=conditionedBattle(id).timeline.filter(e=>e.type==='MERCENARY_ADVANCEMENT'&&e.roleId===id);
  assert.ok(events.length>0,id);
  if(id==='shield-knight')assert.deepEqual(events.map(e=>e.remaining),[3,2,1,0]);
  if(id==='undying')assert.equal(events.filter(e=>e.survived).length,1);
  if(['vampire','regenerator','healer'].includes(id)){
    for(const sample of [events,conditionedBattle(id,{season2:true}).timeline.filter(e=>e.roleId===id)]){
      const heal=sample.find(e=>e.healing>0);assert.ok(heal);assert.ok(heal.targetHpAfter<=heal.targetMaxHp);
      const percentage={vampire:.05,regenerator:.04,healer:.03}[id];
      assert.equal(heal.healing,Math.round(heal.targetMaxHp*percentage));
    }
    const round=conditionedBattle(id,{healBlocked:true}).timeline;
    const overtime=round.findIndex(e=>e.type==='SUDDEN_DEATH');assert.ok(overtime!==-1);
    assert.ok(!round.slice(overtime).some(e=>e.roleId===id&&e.healing>0));
  }
});
for(const {id,name} of ROLES)test(name+' — own trigger, limits and target',()=>cases[id](scenario(id)));
test('all classes enter canonical PVE and ranked PVP, produce deterministic authoritative replays',()=>{
  const cards=tierCards(90000),opponent=tierCards(100000),seed=27113;
  for(const {id} of ROLES){
    const m={...operatingMercenaries.find(m=>m.rank==='SS'),advancementId:id};
    const pve=createPveBattleV2({cards,mercenary:m,monster:{id:'ADVANCE-QA',name:'검수',hp:2400000,power:320000},seed});
    const options={attackerCards:cards,defenderCards:opponent,attackerMercenary:m,defenderMercenary:operatingMercenaries[0],seed};
    const pvp=createPvpBattleV2(options);
    assert.ok(pve.result.timeline.length>2&&pvp.result.timeline.length>2);
    assert.deepEqual(pvp.result.timeline,createPvpBattleV2(options).result.timeline);
    assert.equal(pvp.teams.A.mercenaries[0].advancementId,id);
    assert.equal(pve.teams.A.mercenaries[0].advancementId,id);
    if(['vanguard','barrier','shield-knight','commander'].includes(id))for(const b of [pve,pvp])assert.ok(b.result.timeline.some(e=>e.type==='MERCENARY_ADVANCEMENT'&&e.roleId===id),id);
  }
});
