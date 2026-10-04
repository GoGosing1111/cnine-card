import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {ICON_ROLES,ICON_ROLES_KEY,defaultIconRoles,validateIconRoles,iconRoleSnapshot,iconHealingAmount} from '../shared/icon-roles-v1.mjs';
import {buildFighter,simulateBattleV2Preview,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {createIconCombatRuntime} from '../functions/_icon_combat.js';
import {handleIconRoles,iconRoleDeckSettings,applyIconRoleDeckState} from '../functions/_icon_roles.js';
import {iconCmsFixture} from './helpers/icon-cms-fixture.mjs';
import {ICON_FUSION_DEFAULT_SETTINGS,ICON_FUSION_POLICY} from '../shared/icon-fusion-policy-v1.mjs';
import {readFile} from 'node:fs/promises';

function card(role,side='A',slot=0,{tuning={},mode='PVP',hp=1}={}){
 const def=ICON_ROLES.find(d=>d.role===role),doc=defaultIconRoles();Object.assign(doc.cards.find(c=>c.code===def.code).tuning,tuning);
 const row={id:def.cardId,grade:'ICON',name:def.name,power:180000};row.iconRole=iconRoleSnapshot(row,doc,mode);
 const actor=buildFighter(row,slot,side,null,mode);actor.hp=Math.round(actor.maxHp*hp);return actor;
}
const normal=(side='B',slot=0,power=180000)=>buildFighter({id:`${side}-plain-${slot}`,grade:'ZENITH',power,power_type:'NONE'},slot,side,null,'PVP');
function harness(role,options={}){
 const actor=card(role,'A',0,options),ally=normal('A',1),enemy=normal('B',0),second=normal('B',1),teams={A:[actor,ally],B:[enemy,second]},events=[];
 const rawDamage=(t,n)=>{const hb=t.hp,sb=t.shield,absorbed=Math.min(t.shield,n);t.shield-=absorbed;t.hp=Math.max(0,t.hp-(n-absorbed));const result={hpDamage:hb-t.hp,absorbed,shieldBefore:sb,shieldAfter:t.shield};rt?.onDamage(t,result);return result;};
 let rt;rt=createIconCombatRuntime({teams,hit:(a,t,m)=>({damage:Math.round(a.attack*m),dodge:false}),rawDamage,damage:(t,n,o)=>rawDamage(t,rt.beforeDamage(t,n,o)),knockout:t=>{if(t.hp>0)return false;t.alive=false;return true;},emit:(type,data)=>events.push({type,...data}),cleanseOne:()=>false});
 return {actor,ally,enemy,second,teams,events,rt,act(n){actor.actions=n;const used=rt.beforeAction(actor);rt.endAction(actor);return used;}};
}

test('seven fixed identities replace stat drafts; fusion cost and closed state are untouched',()=>{
 assert.equal(new Set(ICON_ROLES.map(d=>d.role)).size,7);assert.equal(validateIconRoles(defaultIconRoles()).cards.length,7);
 assert.equal(ICON_FUSION_POLICY.coinCost,500000000000);assert.equal(ICON_FUSION_DEFAULT_SETTINGS.enabled,false);
 const base=normal('A'),a=card('ASSASSIN');assert.equal(a.maxHp,base.maxHp);assert.equal(a.type,'NONE');assert.equal(a.uniqueAbility,null);
 const forged=buildFighter({id:'evil',grade:'FUR',power:180000,iconRole:a.iconRole},0,'A');assert.equal(forged.iconRole,undefined);
 const over={...a.iconRole,tuning:{...a.iconRole.tuning,damagePercent:100000}};assert.equal(buildFighter({id:a.cardId,grade:'ICON',power:180000,iconRole:over},0,'A').iconRole,undefined);
});
test('configuration rejects missing/duplicate cards, nonfinite values, extra fields and unbounded procs',()=>{
 for(const change of [d=>d.cards.pop(),d=>d.cards[1]=d.cards[0],d=>d.cards[0].tuning.maxCasts=10000,d=>d.cards[0].tuning.cooldownActions=0,d=>d.cards[0].tuning.damagePercent=NaN,d=>d.cards[0].tuning.hpPercent=500,d=>d.cards[0].role='SUPPORT',d=>d.scopes.pvp='true']){const x=defaultIconRoles();change(x);assert.throws(()=>validateIconRoles(x));}
 const cfg=defaultIconRoles();cfg.scopes.pvp=false;assert.equal(iconRoleSnapshot({id:ICON_ROLES[0].cardId,grade:'ICON'},cfg,'PVP'),null);
});
test('attack heat requires same-target landed basics; skill consumes it and has a shared pellet cap',()=>{
 const h=harness('ATTACK',{tuning:{damagePercent:350}});h.rt.afterBasic(h.actor,h.enemy,false);assert.equal(h.rt.snapshot()[0].stacks,0);
 for(let i=0;i<9;i++)h.rt.afterBasic(h.actor,h.enemy,true);assert.equal(h.rt.snapshot()[0].stacks,3);
 h.rt.afterBasic(h.actor,h.second,true);assert.equal(h.rt.snapshot()[0].stacks,1);
 h.act(3);const e=h.events.find(e=>e.type==='ICON_SKILL');assert.equal(e.hits.length,3);assert.equal(h.rt.snapshot()[0].stacks,0);assert.ok(e.hits.reduce((s,h)=>s+h.damage+h.absorbed,0)<=h.second.maxHp*.46+1);
});
test('assassin tracks weak living targets, respects knockout and bounds takedown gauge',()=>{
 const h=harness('ASSASSIN');h.enemy.hp=1;assert.equal(h.rt.selectTarget(h.actor,[h.second]),h.enemy);h.act(2);
 assert.equal(h.enemy.alive,false);assert.equal(h.rt.snapshot()[0].takedowns,1);assert.ok(h.actor.gauge<=95);
 assert.equal(h.rt.selectTarget(h.actor,[h.second]),h.second);
});
test('skill target cap includes vulnerability and the next-attack buff',()=>{
 const h=harness('ATTACK',{tuning:{damagePercent:350,damageCapPercent:10}});h.enemy.iconVulnerability={percent:15,remaining:3};h.actor.iconEmpower={percent:35,remaining:2};
 h.act(3);const e=h.events.find(e=>e.type==='ICON_SKILL');assert.ok(e.hits.reduce((s,row)=>s+row.damage+row.absorbed,0)<=Math.round(h.enemy.maxHp*.1));
});
test('assault opens with a finite ward and converts boss control into bounded vulnerability',()=>{
 const h=harness('ASSAULT');h.enemy.isBoss=true;const gauge=h.enemy.gauge;h.act(1);assert.ok(h.actor.shield>0);assert.equal(h.enemy.gauge,gauge);assert.ok(h.enemy.iconVulnerability.percent<=15);
 const shield=h.actor.shield;h.act(2);h.act(3);assert.equal(h.actor.shield,0);h.act(5);assert.ok(h.actor.shield<shield,'opening shield is not refreshed every cast');
});
test('guardian redirects to one living guardian; shield, protection pool and stored retaliation are finite',()=>{
 const h=harness('DEFENSE',{tuning:{guardBudgetPercent:10}});h.ally.hp=h.ally.maxHp*.2;h.actor.shield=h.actor.maxShield=100;
 let protectedSum=0;for(let i=0;i<20;i++){const before=h.rt.snapshot()[0].guardRemaining;const remaining=h.rt.beforeDamage(h.ally,10000,{actor:h.enemy,direct:true});protectedSum+=10000-remaining;assert.ok(h.rt.snapshot()[0].guardRemaining<=before);}
 assert.ok(protectedSum<=h.actor.maxHp*.1);assert.ok(h.rt.snapshot()[0].guardRemaining>=0);assert.equal(h.rt.beforeDamage(h.ally,5000,{actor:h.enemy,direct:true,iconIndirect:true}),5000);
});
test('curse has finite turns, reduces healing once, spreads to one extra enemy and can be cleansed',()=>{
 const h=harness('CURSE');for(let i=0;i<10;i++)h.rt.afterBasic(h.actor,h.enemy,true);assert.equal(h.enemy.iconCurse.stacks,3);assert.equal(iconHealingAmount(h.enemy,100),70);
 h.act(3);assert.equal(h.second.iconCurse.stacks,1);assert.equal(h.enemy.iconCurse.stacks,1);
 const hp=h.second.hp;h.second.actions++;h.rt.beforeAction(h.second);h.rt.endAction(h.second);assert.ok(h.second.hp<hp);assert.equal(h.rt.cleanse(h.second),true);assert.equal(iconHealingAmount(h.second,100),100);
 for(let i=0;i<3;i++){h.enemy.actions++;h.rt.beforeAction(h.enemy);h.rt.endAction(h.enemy);}assert.equal(h.enemy.iconCurse,undefined);
});
test('mage consumes a channel action, hits multiple targets and is interrupted by a seal',()=>{
 const h=harness('MAGIC');h.act(2);assert.equal(h.events.filter(e=>e.type==='ICON_SKILL').length,0);assert.ok(h.events.some(e=>e.status==='CHANNEL'));
 h.act(3);assert.equal(new Set(h.events.find(e=>e.type==='ICON_SKILL').hits.map(x=>x.targetId)).size,2);
 const blocked=harness('MAGIC');blocked.act(2);blocked.actor.apocalypseStatus={seal:{remaining:2}};
 // Use the same sealed callback contract as the live engine.
 const a=card('MAGIC'),e=normal(),events=[];let seal=false;
 const runtime=createIconCombatRuntime({teams:{A:[a],B:[e]},hit:()=>({damage:1}),damage:()=>({hpDamage:1,absorbed:0}),rawDamage:()=>({}),knockout:()=>false,emit:(type,x)=>events.push({type,...x}),sealed:()=>seal});
 a.actions=2;runtime.beforeAction(a);seal=true;a.actions=3;runtime.beforeAction(a);assert.ok(events.some(e=>e.status==='INTERRUPTED'));assert.ok(!events.some(e=>e.type==='ICON_SKILL'));
});
test('support cleanses and heals using a finite personal budget; no revival or overtime healing',()=>{
 const h=harness('SUPPORT',{tuning:{healBudgetPercent:10}});h.ally.hp=h.ally.maxHp*.1;h.ally.iconCurse={healReductionPercent:50,remaining:3};
 for(let i=0;i<12;i++)h.rt.endAction(h.ally);h.act(2);assert.equal(h.ally.iconCurse,undefined);assert.ok(h.ally.iconEmpower);assert.ok(h.actor.healingDone<=h.actor.maxHp*.1);
 h.actor.actions=6;h.rt.beforeAction(h.actor,{healingAllowed:false});assert.equal(h.events.filter(e=>e.type==='ICON_SKILL').length,1);
});
test('every role obeys cooldowns and max activations without recursively creating actions',()=>{
 for(const d of ICON_ROLES){const h=harness(d.role,{tuning:{maxCasts:2}});h.enemy.hp=h.enemy.maxHp=1e9;h.second.hp=h.second.maxHp=1e9;h.ally.maxHp=1e9;
  for(let i=1;i<=70;i++){h.ally.hp=10;h.act(i);}const casts=h.events.filter(e=>e.type==='ICON_SKILL');assert.ok(casts.length<=2,d.role);assert.ok(casts.length>=1,d.role);
 }
});
test('PVP and PVE share authoritative role events, deterministic replays and ordinary-card compatibility',()=>{
 const a=ICON_ROLES.slice(0,5).map((d,i)=>card(d.role,'A',i)),b=[card('DEFENSE','B',0),card('ASSAULT','B',1),...Array.from({length:3},(_,i)=>normal('B',i+2))];
 const run=()=>simulateBattleV2Preview({teamA:a,teamB:b,seed:812,maxActions:83,suddenDeathAfter:64});const first=run();assert.deepEqual(first,run());
 assert.ok(first.timeline.some(e=>e.type==='ICON_SKILL'));assert.ok(first.timeline.every(e=>!e.damage||Number.isFinite(e.damage)));assert.ok(first.actions<=83);
 const toCard=f=>({id:f.cardId,grade:f.grade,power:180000,iconRole:f.iconRole});
 const pvp=createPvpBattleV2({attackerCards:a.map(toCard),defenderCards:b.map(toCard),seed:43});assert.ok(pvp.result.iconRoles.length>=5);
 const pve=createPveBattleV2({cards:a.map(toCard),monster:{id:'boss',name:'Boss',power:900000,is_boss:1},seed:1});assert.ok(pve.result.iconRoles.length===5);
 const plain=simulateBattleV2Preview({teamA:[normal('A')],teamB:[normal('B')],seed:7});assert.ok(!plain.iconRoles);assert.ok(!plain.timeline.some(e=>e.type.startsWith('ICON_')));
});
test('role database access is one indexed read for all ICON parties and zero for ordinary parties',async()=>{
 let calls=0;const env={DB:{prepare(sql){assert.equal(sql,'SELECT value FROM app_meta WHERE key=?');return {bind(key){assert.equal(key,ICON_ROLES_KEY);return this;},async first(){calls++;return null;}}}}};
 assert.equal(await iconRoleDeckSettings(env,[{cards:[{id:'plain',grade:'FUR'}]}]),null);assert.equal(calls,0);
 const settings=await iconRoleDeckSettings(env,[{cards:ICON_ROLES.map(d=>({id:d.cardId,rarity:'ICON'}))},{cards:ICON_ROLES.map(d=>({id:d.cardId,rarity:'ICON'}))}]);assert.equal(calls,1);
 const applied=applyIconRoleDeckState({cards:[{id:ICON_ROLES[0].cardId,rarity:'ICON',baseBattlePower:180000,power:9999999,uniqueAbility:{hpPercent:500}}]},settings,'PVP');assert.equal(applied.cards[0].power,180000);assert.equal(applied.cards[0].uniqueAbility,null);assert.equal(applied.cards[0].iconRole.role,'ASSASSIN');
});
test('OWNER settings are atomic, preserve legacy documents, reject other roles and replay safely',async()=>{
 const f=await iconCmsFixture();try{
  await f.call();const before=(await f.pg.query('SELECT value FROM app_meta WHERE key=$1',['icon_cms_v1'])).rows[0].value;
  const call=async(body,role='OWNER',path='admin/icon-roles')=>{const r=await handleIconRoles({env:f.env,path,request:new Request('https://qa.test/api/'+path,{method:body?'PATCH':'GET',...(body?{body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>({id:1,role}),json:(x,s=200)=>Response.json(x,{status:s})}});return {status:r.status,body:await r.json()};};
  assert.equal((await call(null,'USER')).status,403);assert.equal((await call(null,'ADMIN')).status,403);
  const x=await call(),body={document:x.body.document,expectedRevision:1,requestId:crypto.randomUUID()};body.document.cards[0].tuning.damagePercent=190;
  const result=await Promise.all([call(body),call(body)]);assert.deepEqual(result.map(r=>r.status),[200,200]);assert.equal((await call(body)).body.replayed,true);
  assert.equal((await call({...body,document:defaultIconRoles()})).status,409);assert.equal((await call({...body,requestId:crypto.randomUUID()})).status,409);
  const pub=await call(null,'USER','icons/roles');assert.equal(pub.status,200);assert.equal(pub.body.audit,undefined);assert.equal(pub.body.document.cards[0].tuning.damagePercent,190);
  assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',['icon_cms_v1'])).rows[0].value,before);
  const invalid={...body,expectedRevision:2,requestId:crypto.randomUUID(),document:defaultIconRoles()};invalid.document.cards[0].tuning.maxCasts=999;assert.equal((await call(invalid)).status,400);
 }finally{await f.close();}
});
test('common V3 handles ICON events and card details/CMS use the same role catalog',async()=>{
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
 assert.match(await read('preview/project-v-v3/source/battle/BattleEngine.js'),/type.startsWith\('ICON_'\).*playIconEvent/);
 assert.match(await read('js/app.js'),/window.IconRoles.open\(card\)/);
 assert.match(await read('admin/icon-admin-v1.mjs'),/mountIconRoleEditor/);
 assert.match(await read('preview/project-v-v3/source/battle/IconRolePlayback.js'),/iconMuzzle\(actor,engine.effectLayer\)/);
});
test('bounded seven-role simulation runs without additional DB work or excessive event growth',()=>{
 const start=performance.now();let events=0;
 for(let i=0;i<40;i++){const a=Array.from({length:5},(_,j)=>card(ICON_ROLES[(i+j)%7].role,'A',j)),b=Array.from({length:5},(_,j)=>card(ICON_ROLES[(i+j+3)%7].role,'B',j));const x=simulateBattleV2Preview({teamA:a,teamB:b,seed:i,maxActions:83,suddenDeathAfter:64});assert.ok(x.timeline.length<900);events+=x.timeline.length;}
 console.log(`ICON: 40 local simulations / ${events} events / ${Math.round(performance.now()-start)} ms; no database in combat.`);
});
