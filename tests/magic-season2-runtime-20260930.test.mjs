import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMagicSeason2Runtime} from '../functions/_magic_season2.js';
import {buildFighter,simulateBattleV2Preview,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {castApocalypseAction} from '../functions/_apocalypse_legion.js';
import {APOCALYPSE_LEGION_BOSSES} from '../shared/apocalypse-legion-v1.mjs';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {MERCENARY_COMBAT_DRAFT as combat} from '../shared/mercenary-combat-policy-v1.mjs';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {MAGIC_S2_RULES,MAGIC_SEASON2_REVIEW,magicS2Card,magicS2Params} from '../shared/magic-season2-v1.mjs';
import {cards,effectAt} from '../preview/magic-card-season2-v1/catalog.mjs';
import {makeReviewBattle,makePveReview,reviewDeck} from '../preview/magic-card-season2-v1/review-battles.mjs';
import {magicSeason2RegistrationDraft,normalizeMagicSeason2ReviewRows} from '../functions/_magic_season2_catalog.js';
const fighter=(side,slot)=>({...buildFighter({id:`${side}${slot}`,power:10000},slot,side,null,'PVP'),maxHp:10000,hp:10000,attack:1000,defense:0,shield:0,maxShield:0,row:slot<2?'FRONT':'BACK',speed:100,gauge:0});
function fixture(codes,level=0){
 const teams={A:Array.from({length:5},(_,i)=>fighter('A',i)),B:Array.from({length:5},(_,i)=>fighter('B',i))},events=[];
 let runtime,healPool=50000;
 const rawDamage=(t,damage,{ignoreShield=false}={})=>{const hpBefore=t.hp,shieldBefore=t.shield,absorbed=ignoreShield?0:Math.min(t.shield,damage);t.shield-=absorbed;t.hp=Math.max(0,t.hp-damage+absorbed);return {hpBefore,hpAfter:t.hp,hpDamage:hpBefore-t.hp,shieldBefore,shieldAfter:t.shield,absorbed};};
 const knockout=t=>{if(t.hp<=0){t.alive=false;t.gauge=0;}};
 runtime=createMagicSeason2Runtime({teams,loadouts:{A:codes.map((c,i)=>magicS2Card(c,i+1,level))},emit:(type,data)=>events.push({type,...data}),rawDamage,knockout,
  spendHeal:(_side,n)=>{const used=Math.min(healPool,n);healPool-=used;return used;},magicCap:(_t,n)=>n});
 return {teams,events,runtime,rawDamage,knockout,get pool(){return healPool;}};
}

test('mirror consumes its single activation when copied overheal becomes forge shield, and no effect means no use',()=>{
 const f=fixture(['S2_ARCANE_MIRROR','S2_OVERHEAL_FORGE']),a=f.teams.A[0],b=f.teams.B[0];
 f.runtime.observeMagic({type:'MAGIC_CARD',effectType:'CRISIS_HEAL',actorId:b.id,seq:1,amount:1000});
 assert.equal(a.hp,a.maxHp);assert.equal(a.shield,420);
 assert.equal(f.runtime.snapshot().states.find(s=>s.code==='S2_ARCANE_MIRROR').uses,1);
 f.runtime.observeMagic({type:'MAGIC_CARD',effectType:'CRISIS_HEAL',actorId:b.id,seq:2,amount:1000});
 assert.equal(a.shield,420);
 const g=fixture(['S2_ARCANE_MIRROR']);g.teams.B[0].invulnerable=true;
 g.runtime.observeMagic({type:'MAGIC_CARD',effectType:'CHAIN_ECHO',actorId:g.teams.B[0].id,seq:1,damage:1000});
 assert.equal(g.runtime.snapshot().states[0].uses,0);
});
test('all ten preview cards share exact server values at each enhancement; release remains OFF',()=>{
 assert.equal(cards.length,10);assert.equal(Object.keys(MAGIC_S2_RULES).length,10);
 for(const card of cards)for(let level=0;level<=9;level++)assert.deepEqual(effectAt(card,level),magicS2Params(card.code,level));
 assert.throws(()=>magicS2Card(cards[0].code,6),/SLOT/);assert.throws(()=>magicS2Card(cards[0].code,1,10),/INVALID/);
 const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');assert.ok(!api.includes('MAGIC_SEASON2_REVIEW'));
});
test('eclipse uses exactly six direct hits and transfers only the remaining budget',()=>{
 const f=fixture(['S2_ECLIPSE_PROPHECY']);f.runtime.open();const [a]=f.teams.A,[b,c]=f.teams.B;
 const hit={hpDamage:100,absorbed:0,shieldBefore:0};f.runtime.afterAttack(a,b,hit);assert.equal(b.hp,9988);
 b.hp=0;b.alive=false;f.runtime.settle();for(let i=0;i<8;i++)f.runtime.afterAttack(a,c,hit);
 assert.equal(c.hp,9940);assert.equal(f.events.filter(e=>e.phase==='ECLIPSE_HIT').length,6);
});
test('causal sever counts actions, guarantees only attacks 3 and 6, forbids apocalypse shield bypass',()=>{
 const f=fixture(['S2_CAUSAL_SEVER'],9),a=f.teams.A[0],b=f.teams.B[0];
 for(let i=1;i<=9;i++){const r=f.runtime.beforeAttack(a,b);assert.equal(!!r.s2CannotDodge,[3,6].includes(i));if(i===3)assert.equal(r.s2ShieldPierce,.39);}
 const g=fixture(['S2_CAUSAL_SEVER']);g.teams.B[0].isApocalypse=true;
 for(let i=0;i<2;i++)g.runtime.beforeAttack(g.teams.A[0],g.teams.B[0]);assert.equal(g.runtime.beforeAttack(g.teams.A[0],g.teams.B[0]).s2ShieldPierce,0);
});
test('fate intercept conserves lethal HP damage, cannot recurse, and protector can finally die',()=>{
 const f=fixture(['S2_FATE_INTERCEPT']),owner=f.teams.A[0],target=f.teams.A[1];owner.hp=20;target.hp=100;
 const kept=f.runtime.beforeHpDamage(target,200,{direct:true});assert.equal(kept,99);assert.equal(owner.hp,0);assert.equal(owner.alive,false);
 const e=f.events.find(e=>e.phase==='INTERCEPT');assert.equal(kept+e.requestedTransfer+e.mitigated,200);
 assert.equal(f.runtime.beforeHpDamage(target,200,{direct:true}),200);
});
test('overheal consumes approved healing pool, caps shield, respects three-use team budget',()=>{
 const f=fixture(['S2_OVERHEAL_FORGE']),t=f.teams.A[2];t.hp=9900;
 assert.equal(f.runtime.heal(t,1100),100);assert.equal(t.shield,600);assert.equal(f.pool,48900);
 f.runtime.heal(t,10000);assert.equal(t.shield,1800);
 f.runtime.heal(t,10000);assert.equal(f.runtime.snapshot().states[0].uses,2);
 const u=f.teams.A[3];f.runtime.heal(u,1000);assert.equal(u.shield,600);f.runtime.heal(f.teams.A[4],1000);assert.equal(f.teams.A[4].shield,0);
});
test('formation swap changes canonical row and slot, grants exactly two multiplicative protections',()=>{
 const f=fixture(['S2_CONSTELLATION_SHIFT']);const front=f.teams.A[1];front.hp=2000;f.runtime.settle();
 assert.equal(front.row,'BACK');assert.equal(front.slot,2);assert.equal(f.teams.A[2].row,'FRONT');
 assert.equal(f.runtime.beforeDamage(front,100,{direct:true}),80);assert.equal(f.runtime.beforeDamage(front,100,{direct:false}),100);
 assert.equal(f.runtime.beforeDamage(front,100,{direct:true}),80);assert.equal(f.runtime.beforeDamage(front,100,{direct:true}),100);
 f.runtime.settle();assert.equal(f.events.filter(e=>e.phase==='FORMATION_SWAP').length,1);
});
test('shield ledger records actual absorbed damage, resets targets and explodes only once',()=>{
 const f=fixture(['S2_SHIELD_LEDGER']),a=f.teams.A[0],[b,c]=f.teams.B;b.shield=300;
 f.runtime.afterAttack(a,b,{absorbed:500,hpDamage:0,shieldBefore:800});
 c.shield=0;f.runtime.afterAttack(a,c,{absorbed:100,hpDamage:0,shieldBefore:100,shieldAfter:0});assert.equal(c.hp,9970);
 f.runtime.afterAttack(a,c,{absorbed:100,hpDamage:0,shieldBefore:100,shieldAfter:0});assert.equal(c.hp,9970);
 assert.equal(f.runtime.beforeAttack(a,c).s2DefenseReduction,.12);
});
test('fallen star triggers after final death including owner death, excludes mercenaries and revived allies',()=>{
 const f=fixture(['S2_FALLEN_STAR']);f.teams.A[1].hp=1;f.runtime.settle();assert.equal(f.events.length,0);
 f.teams.A[0].hp=0;f.teams.A[0].alive=false;const merc={...fighter('A',5),isMercenary:true};f.teams.A.push(merc);
 f.runtime.settle();assert.equal(f.teams.A[1].attack,1080);assert.equal(merc.attack,1000);f.runtime.settle();assert.equal(f.events.length,1);
});
test('mirror uses authoritative successful S1 event amount once; rejects recursive and forbidden events',()=>{
 const f=fixture(['S2_ARCANE_MIRROR'],9),e={type:'MAGIC_CARD',seq:42,actorId:f.teams.B[0].id,effectType:'CHAIN_ECHO',damage:1000,absorbed:0};
 f.runtime.observeMagic({...e,copied:true});f.runtime.observeMagic({...e,effectType:'PHOENIX_REVIVE'});assert.equal(f.events.length,0);
 f.runtime.observeMagic(e);f.runtime.observeMagic(e);assert.equal(f.teams.B[0].hp,9090);assert.equal(f.events[0].sourceEventSeq,42);
});
test('anti-mercenary debuffs affect only mercenary, expire on its own actions, and cleanse removes them',()=>{
 const f=fixture(['S2_CONTRACT_EROSION','S2_COMMAND_SEVERANCE'],9),merc={...fighter('B',5),isMercenary:true};f.teams.B.push(merc);f.runtime.open();
 assert.equal(f.runtime.beforeDamage(f.teams.A[0],1000,{actor:merc,direct:true}),688);
 assert.equal(f.runtime.beforeDamage(f.teams.A[0],1000,{actor:f.teams.B[0],direct:true}),1000);
 assert.equal(f.runtime.beforeDamage(merc,1000,{direct:true}),1130);assert.equal(f.runtime.skillBlocked(merc),true);
 f.runtime.endAction(f.teams.B[0]);assert.equal(f.runtime.skillBlocked(merc),true);
 f.runtime.endAction(merc);f.runtime.endAction(merc);assert.equal(f.runtime.skillBlocked(merc),false);
 assert.equal(f.runtime.beforeDamage(f.teams.A[0],1000,{actor:merc}),688);
 f.runtime.endAction(merc);f.runtime.endAction(merc);assert.equal(f.runtime.beforeDamage(f.teams.A[0],1000,{actor:merc}),1000);
 const g=fixture(['S2_COMMAND_SEVERANCE']);g.teams.B.push({...merc,hp:10000,alive:true});g.runtime.open();g.runtime.cleanse(g.teams.B.at(-1));assert.equal(g.runtime.skillBlocked(g.teams.B.at(-1)),false);
});
test('no mercenary and control-immune bosses never spend anti-mercenary activation',()=>{
 const f=fixture(['S2_CONTRACT_EROSION','S2_COMMAND_SEVERANCE']);f.teams.B[0].isBoss=true;f.teams.B[0].isMercenary=true;f.runtime.open();assert.equal(f.events.length,0);
});
test('canonical combat requires symbol, accepts mixed S1/S2 and preserves five cards plus mercenary',()=>{
 const normal=Array.from({length:5},(_,i)=>({id:`C-${i}`,title:`카드 ${i}`,power:100000,rarity:'FUR',power_type:'HP'}));
 const skill={...structuredClone(seed.document.skills.find(s=>s.mechanic==='LOCKED_THREAT_SHOT')),balance:{damageRatio:1,cooldownTurns:3,cost:10}};
 const merc={code:'V-001',rank:'C',name:'검수 용병',role:'VANGUARD',position:'FRONT',level:1,basePower:10000,stats:{hp:1000000,attack:10000,defense:100,speed:100000},skills:[skill],combat,sourceArt:'/art.png',battleSprite:'/sprite.png'};
 const input={attackerCards:normal,defenderCards:normal,defenderMercenary:merc,attackerMagicCards:[magicS2Card('S2_COMMAND_SEVERANCE',1,9),magicS2Card('S2_CONTRACT_EROSION',2,9)],seed:4};
 const off=createPvpBattleV2({...input,season2Review:true});assert.ok(!off.result.timeline.some(e=>e.type==='MAGIC_SEASON2'));
 const on=createPvpBattleV2({...input,[MAGIC_SEASON2_REVIEW]:true});assert.equal(on.teams.A.cards.length,5);assert.equal(on.teams.B.mercenaries.length,1);
 const events=on.result.timeline;assert.equal(events.filter(e=>e.phase==='SKILL_BLOCK').length,2);
 assert.ok(events.some(e=>e.type==='MERCENARY_WINDUP'));assert.ok(events.filter(e=>e.type==='TURN'&&e.actorKind==='MERCENARY').length>=2);
});

test('ten canonical combat fixtures actually trigger their effects at +0 and +9',()=>{
 const phases=['ECLIPSE_HIT','PIERCE_READY','INTERCEPT','OVERHEAL','FORMATION_SWAP','LEDGER_BREAK','FALLEN_STAR','MIRROR','STATUS','SKILL_BLOCK'];
 for(const [i,code]of Object.keys(MAGIC_S2_RULES).entries())for(const level of [0,9]){
  const p=makeReviewBattle(code,level),events=p.battleV2.result.timeline;
  assert.ok(events.some(e=>e.magicCode===code&&e.phase===phases[i]),`${code}+${level}`);
  for(const row of [...p.battleV2.result.final.A,...p.battleV2.result.final.B])assert.ok(Number.isFinite(row.hp)&&row.hp>=0&&row.hp<=row.maxHp);
  assert.deepEqual(events.map(e=>e.seq),Array.from({length:events.length},(_,i)=>i+1));
 }
});
test('real PVE entry applies S2 attack effects and never interprets monsters as mercenaries',()=>{
 const p=makePveReview(),events=p.result.timeline;
 assert.ok(events.some(e=>e.phase==='ECLIPSE_HIT'));assert.ok(events.some(e=>e.phase==='PIERCE_READY'));
 assert.ok(!events.some(e=>e.magicCode==='S2_COMMAND_SEVERANCE'));
});
test('seal charges block one eligible activation, not every availability query',()=>{
 const f=fixture(['S2_CAUSAL_SEVER']),a=f.teams.A[0],b=f.teams.B[0];a.magicSealCharges=1;
 f.runtime.beforeAttack(a,b);f.runtime.beforeAttack(a,b);assert.equal(a.magicSealCharges,1);
 assert.equal(f.runtime.beforeAttack(a,b).s2CannotDodge,undefined);assert.equal(a.magicSealCharges,0);
 f.runtime.beforeAttack(a,b);f.runtime.beforeAttack(a,b);assert.equal(f.runtime.beforeAttack(a,b).s2CannotDodge,true);
 assert.equal(f.events.filter(e=>e.type==='MAGIC_SEAL_BLOCK').length,1);
});
test('ledger defense weakness is consumed only by the next two landed direct hits and is cleansable',()=>{
 const f=fixture(['S2_SHIELD_LEDGER']),[a]=f.teams.A,[b]=f.teams.B;
 f.runtime.afterAttack(a,b,{absorbed:1000,hpDamage:0,shieldBefore:1000,shieldAfter:0});
 f.runtime.afterDamage(b,{absorbed:0,hpDamage:10},{direct:false});assert.equal(f.runtime.defenseOptions(b).s2DefenseReduction,.12);
 f.runtime.afterDamage(b,{absorbed:0,hpDamage:10},{direct:true});assert.equal(f.runtime.defenseOptions(b).s2DefenseReduction,.12);
 f.runtime.afterDamage(b,{absorbed:0,hpDamage:10},{direct:true});assert.equal(f.runtime.defenseOptions(b).s2DefenseReduction,undefined);
});
test('catalog registration is inert and review normalization rejects forged level/slot/amount',()=>{
 const d=magicSeason2RegistrationDraft();assert.equal(d.cards.length,10);assert.ok(d.cards.every(c=>c.active===0));assert.equal(d.pack.active,false);assert.equal(d.pack.price,null);assert.equal(d.pack.policy,'INHERIT_S1_MIXED');assert.equal(d.enhancement.policy,'INHERIT_S1');
 const row={effect_type:'S2_CONTRACT_EROSION',slot_no:1,enhancement_level:9,effectValue:999999,triggerChance:999};
 assert.deepEqual(normalizeMagicSeason2ReviewRows([row],{season2Review:true}),[]);
 const opts={[MAGIC_SEASON2_REVIEW]:true},normalized=normalizeMagicSeason2ReviewRows([row],opts);assert.equal(normalized[0].params.reduction,31.2);assert.equal(normalized[0].triggerChance,100);
 assert.throws(()=>normalizeMagicSeason2ReviewRows([{...row,enhancement_level:10}],opts));assert.throws(()=>normalizeMagicSeason2ReviewRows([{...row,slot_no:6}],opts));assert.throws(()=>normalizeMagicSeason2ReviewRows([row,row],opts));
});
test('fate intercept is active for the opening boss ultimate before speed-gauge actions',()=>{
 const p=createPveBattleV2({cards:reviewDeck,magicCards:[magicS2Card('S2_FATE_INTERCEPT',5)],monster:{id:888,name:'검수',battle_power:500000,is_boss:1},bossUltimatePercent:150,bossUltimateCapPercent:200,seed:31,[MAGIC_SEASON2_REVIEW]:true});
 const events=p.result.timeline,intercept=events.find(e=>e.phase==='INTERCEPT'),ultimate=events.find(e=>e.type==='BOSS_ULTIMATE');assert.ok(intercept);assert.ok(ultimate);assert.ok(intercept.seq<ultimate.seq);assert.equal(ultimate.hits.find(h=>h.targetId===intercept.targetId).targetHpAfter,1);
});
test('apocalypse ultimate shares one atomic direct-damage hook for normal and piercing parts',()=>{
 const boss=APOCALYPSE_LEGION_BOSSES[0],a={...fighter('B',0),monsterId:boss.monsterId,apocalypseBossCode:boss.code,apocalypseSkillsEnabled:true,actions:3,damageDealt:0},target=fighter('A',0);
 let calls=0;
 const used=castApocalypseAction(a,[target],{damage:()=>{throw Error('Split damage bypass');},damageCombined:(t,normal,pierce)=>{calls++;assert.ok(normal>=0&&pierce>=0);return {hpDamage:normal+pierce,absorbed:0};},knockout:()=>{},emit:()=>{}});
 assert.equal(used,true);assert.equal(calls,1);
});
