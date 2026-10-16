import {mercenaryCombat} from '../functions/_mercenary_combat.js';
import {validateMercenaryCombat} from './mercenary-combat-policy-v1.mjs';

// The same released V3 skill resolver runs against defense stats and reachable
// lane targets. No client-supplied damage, cosmetic-only casts, or second RNG.
export function defenseMercenaryRuntime(room,emit){
 if(room.mercenarySkillRevision!==1)return null;
 const actors=new Map(),sources=new Map(),teams={A:[],B:[]};
 function refresh(){
  for(const [rows,side]of [[room.units,'A'],[room.enemies,'B']])for(const u of rows){
   sources.set(u.id,u);let a=actors.get(u.id);
   if(!a){a={id:u.id,side,slot:u.slot??Number(u.id.replace(/\D/g,'')),code:u.code,cardId:u.code,
    name:u.name,role:u.mercenary?.role||u.role,row:u.slot===0||side==='B'?'FRONT':'BACK',
    isMercenary:!!u.mercenary,isMonster:side==='B',isBoss:u.type==='BOSS',battleMode:'PVE',statMode:'DEFENSE_NORMALIZED',
    actorKind:u.mercenary?'MERCENARY':side==='B'?'MONSTER':'CARD',skills:u.mercenary?.skills||[],
    combat:validateMercenaryCombat(u.mercenary?.combat),attackStyle:u.mercenary?.attackStyle||(u.range>250?'RANGED':'MELEE'),
    actions:u.v3Actions||0,damageDealt:0,healingDone:0,gauge:100,speed:100,defense:u.v3Defense??u.armor??0,shield:u.shield||0,maxShield:u.maxShield||0};actors.set(u.id,a);}
   Object.assign(a,{hp:u.hp,maxHp:u.maxHp,alive:u.hp>0,attack:u.attack*(u.buffUntil>room.time?1.35:1),shield:u.shield||0,maxShield:u.maxShield||0,untargetable:!!u.move});
  }
 }
 refresh();teams.A=[...actors.values()].filter(a=>a.side==='A');teams.B=[...actors.values()].filter(a=>a.side==='B');
 const damage=(target,amount,{actor,shieldOnly=false}={})=>{
  const u=sources.get(target.id);if(!u||target.hp<=0)return {hpDamage:0,absorbed:0};
  const n=Math.max(0,Math.round(amount*(1-Math.min(95,Math.max(0,target.defense||0))/100)));
  const absorbed=Math.min(target.shield||0,n),hpDamage=shieldOnly?0:Math.min(target.hp,n-absorbed);
  target.shield=Math.max(0,(target.shield||0)-absorbed);target.hp-=hpDamage;target.alive=target.hp>0;
  if(actor?.side==='A'){const p=room.players.find(p=>p.id===sources.get(actor.id)?.ownerId);if(p)p.stats.damage+=hpDamage;}
  runtime.onDamage(target,{hpDamage,absorbed});
  if(target.hp<=0){runtime.cancel(target,'CASTER_LOST');if(target.side==='B'){const source=sources.get(actor?.id);if(source)source.kills=(source.kills||0)+1;emit('KO',{targetId:target.id,x:u.x,y:u.y});}else emit('UNIT_DOWN',{targetId:target.id});}
  return {hpDamage,absorbed};
 };
 const runtime=mercenaryCombat({teams,clock:()=>room.time,
  hit:(a,t,ratio)=>({damage:Math.max(0,a.attack*ratio),dodge:false}),damage,
  knockout:a=>{a.alive=a.hp>0;},
  emit:(type,data)=>{
   const source=sources.get(data.actorId);
   if(data.effect==='APPROACH_DELAY'){
    const target=sources.get(data.targetId),delay=1400*Math.max(0,100-data.targetGaugeAfter)/100;
    if(target){target.suppressedUntil=Math.max(target.suppressedUntil||0,room.time+delay);target.nextAttack=Math.max(target.nextAttack||0,room.time)+delay;}
    const actor=actors.get(data.targetId);if(actor)actor.gauge=100;
   }
   if(source){source.lastMercenarySkill=data.skillName;source.lastMercenarySkillAt=room.time;}
   const heals=type==='MERCENARY_GROUP_HEAL'?data.heals||data.targets||[]:type==='MERCENARY_HEAL'?[data]:[];
   const p=room.players.find(p=>p.id===source?.ownerId);if(p)for(const h of heals)p.stats.heal+=Number(h.amount)||0;
   emit(type,{...data,battleMode:'PVE'});
  }});
 // JSON-safe state preserves cooldowns, energy, multi-action casts and ward
 // actor references across Durable Object reloads. Only IDs are serialized.
 const encode=value=>{
  if(value==null||typeof value!=='object')return value;
  if(value.id&&actors.get(value.id)===value)return {$actor:value.id};
  if(value instanceof Map)return {$map:[...value].map(([k,v])=>[k,encode(v)])};
  if(value instanceof Set)return {$set:[...value].map(encode)};
  if(Array.isArray(value))return value.map(encode);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));
 };
 const decode=value=>{
  if(value==null||typeof value!=='object')return value;
  if(value.$actor)return actors.get(value.$actor)||null;
  if(value.$map)return new Map(value.$map.map(([k,v])=>[k,decode(v)]));
  if(value.$set)return new Set(value.$set.map(decode));
  if(Array.isArray(value))return value.map(decode);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
 };
 for(const [id,s]of room.mercenaryRuntime?.states||[])if(actors.has(id))Object.assign(runtime.state(actors.get(id)),decode(s));
 for(const key of ['buffs','debuffs'])for(const [id,s]of room.mercenaryRuntime?.[key]||[])if(actors.has(id))runtime[key].set(id,decode(s));
 function scope(u){
  refresh();const reach=u.range+300;
  teams.A=[...actors.values()].filter(a=>a.side==='A'&&sources.get(a.id).lane===u.lane);
  teams.B=[...actors.values()].filter(a=>a.side==='B'&&room.enemies.some(e=>e.id===a.id)&&sources.get(a.id).lane===u.lane&&Math.hypot(sources.get(a.id).x-u.x,sources.get(a.id).y-u.y)<=reach);
 }
 function sync(){for(const [id,a]of actors){const u=sources.get(id);if(!u)continue;u.hp=Math.max(0,a.hp);u.shield=a.shield||0;u.maxShield=a.maxShield||0;u.v3Actions=a.actions||0;u.v3Defense=a.defense;}}
 return {
  action(u){scope(u);const a=actors.get(u.id);a.actions++;
   const used=runtime.beforeAction(a);sync();return used;},
  basic(u,target,amount){scope(u);const a=actors.get(u.id),t=actors.get(target.id);
   const raw=runtime.beforeBasicDamage(a,t,amount*runtime.basicMultiplier(a));
   const result=damage(t,raw,{actor:a});runtime.afterBasic(a,t,true);sync();return result;},
  afterHeal(u,target){scope(u);runtime.afterBasic(actors.get(u.id),actors.get(target.id),true);sync();},
  areaDamage(u,target,amount){refresh();const result=damage(actors.get(target.id),amount,{actor:actors.get(u.id)});sync();return result;},
  enemyBasic(u,target,amount){scope(target);const a=actors.get(u.id),t=actors.get(target.id);a.actions++;
   if(runtime.beforeAction(a)){sync();return {hpDamage:0,absorbed:0};}
   const result=damage(t,runtime.beforeBasicDamage(a,t,amount*runtime.basicMultiplier(a)),{actor:a});runtime.afterBasic(a,t,true);sync();return result;},
  save(){const ids=new Set([...room.units,...room.enemies].map(u=>u.id));
   room.mercenaryRuntime={states:[...actors].filter(([id])=>ids.has(id)).map(([id,a])=>[id,encode(runtime.state(a))]),
    buffs:[...runtime.buffs].filter(([id])=>ids.has(id)).map(([id,s])=>[id,encode(s)]),debuffs:[...runtime.debuffs].filter(([id])=>ids.has(id)).map(([id,s])=>[id,encode(s)])};}
 };
}
