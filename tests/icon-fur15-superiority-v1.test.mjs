import test from 'node:test';
import assert from 'node:assert/strict';
import {live,canonicalPower,iconFurFixture} from './helpers/icon-fur15-fixture.mjs';
import {buildIconFurReference,fur15ReferenceCards,readIconFurReference} from '../functions/_icon_fur_reference.js';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {ICON_ROLES,defaultIconRoles,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {validateDuoDeck,strongestDuoCards} from '../shared/ranked-duo-v1.mjs';
const icon=(d,ref,mode='PVP')=>({id:d.cardId,grade:'ICON',power:180000,iconRole:{...iconRoleSnapshot({id:d.cardId,grade:'ICON'},defaultIconRoles(),mode),supremacy:ref}});
const fields=['attackPercent','defensePercent','hpPercent','speedPercent','dominantType'];
test('reference +15 power matches real server CMS normalization and per-card/Faker rules',async()=>{
 for(const [battle,high] of [[live.battle,live.high],[{},{}],[{powerByGrade:{FUR:7777},highBreakthroughBonus:{FUR:[0,0,0]}},{enabled:false}],[live.battle,{enabled:true,steps:[{},{},{uniqueBoostPercent:0},{powerBonusPercent:12345},{}]}],[live.battle,{enabled:true,steps:[{},{},{},{powerBonusPercent:1000000},{powerBonusPercent:1000000,uniqueBoostPercent:1000}]}]]){
  const rows=[...live.cards,{id:'zero',base_power:0},{id:'custom',base_power:9131}];
  assert.deepEqual(fur15ReferenceCards(rows,battle,high).map(c=>c.power),await canonicalPower(rows,battle,high));
 }
});
test('reference unique stats and advancement match real fresh server deck preparation',async()=>{
 const f=iconFurFixture();try{
  for(const mode of ['PVE','PVP'])for(const high of [live.high,{enabled:false},{enabled:true,steps:[{},{},{uniqueBoostPercent:0},{},{}]},{enabled:true,steps:[{},{},{uniqueBoostPercent:300},{},{uniqueBoostPercent:0}]}]){
   f.save('fur_master_star_breakthrough_v1802',high);
   const ref=fur15ReferenceCards(live.cards,live.battle,high,mode),base=ref.map(({uniqueAbility,uniqueAdvancement,...c})=>c);
   const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards:base}],mode,{fresh:true,batched:true});
   for(let i=0;i<ref.length;i++){
    for(const key of fields)assert.equal(ref[i].uniqueAbility?.[key],state.cards[i].uniqueAbility?.[key],ref[i].id+' '+key);
    const a=buildFighter(ref[i],0,'A',ref[i].uniqueAbility,mode),b=buildFighter({...base[i],uniqueAdvancement:state.cards[i].uniqueAdvancement},0,'A',state.cards[i].uniqueAbility,mode);
    for(const key of ['maxHp','attack','defense','speed'])assert.equal(a[key],b[key],ref[i].id+' '+key);
   }
  }
 }finally{f.close()}
});
test('seven roles exceed every current and maximum-growth FUR +15 stat with equal equipment',()=>{
 const future=live.cards.map((c,i)=>({...c,base_power:i%2?99999:999999,attack_percent:500,defense_percent:500,hp_percent:500,speed_percent:300,is_active:1}));
 const high={enabled:true,steps:[{},{},{},{powerBonusPercent:1000000},{powerBonusPercent:1000000,uniqueBoostPercent:1000}]};
 for(const [rows,b,h] of [[live.cards,live.battle,live.high],[future,live.battle,high]])for(const mode of ['PVE','PVP']){
  const ref=buildIconFurReference(rows,b,h,mode),furs=fur15ReferenceCards(rows,b,h,mode);
  for(const equipmentShare of [0,100000,1e9])for(const d of ICON_ROLES){
   const item=icon(d,ref,mode),a=buildFighter({...item,equipmentShare,effectivePower:item.power+equipmentShare},0,'A',null,mode);
   for(const c of furs){const f=buildFighter({...c,equipmentShare,effectivePower:c.power+equipmentShare},0,'B',c.uniqueAbility,mode);
    for(const k of ['maxHp','attack','defense','speed'])assert.ok(a[k]>=Math.ceil(f[k]*ICON_SUPREMACY.margin),JSON.stringify({role:d.role,mode,k,icon:a[k],fur:f[k],equipmentShare,reference:ref[mode][k]}));
   }
  }
 }
});
test('fresh server reference changes with CMS, does not write, strips forged state and honors disabled scopes',async()=>{
 const f=iconFurFixture(),entry={user:{id:1},cards:[{id:ICON_ROLES[0].cardId,grade:'ICON',power:180000,iconRole:{supremacy:{power:1e15}}}]};
 try{
  const run=async()=> (await cardUniqueDeckStates(f.env,[entry],'PVP',{fresh:true,batched:true}))[0].cards[0];
  const before=await run();assert.equal(before.iconRole.supremacy.power,198200);
  const high=structuredClone(live.high);high.steps[4].powerBonusPercent=10000;f.save('fur_master_star_breakthrough_v1802',high);
  assert.equal((await run()).iconRole.supremacy.power,326200);
  assert.ok(f.queries.every(s=>/^\s*SELECT /i.test(s)),'no grants, writes or user-card changes');
  const doc=defaultIconRoles();doc.scopes.pvp=false;f.save('icon_role_settings_v1',{revision:1,audit:[],document:doc});
  const n=f.queries.length;assert.equal((await run()).iconRole,null);
  assert.ok(!f.queries.slice(n).some(s=>s.includes("WHERE c.rarity='FUR'")));
  const nonIcon={user:{id:1},cards:[{id:'ordinary',grade:'ZENITH',power:1000,iconRole:before.iconRole}]},n2=f.queries.length;
  const [plain]=await cardUniqueDeckStates(f.env,[nonIcon],'PVP',{fresh:true,batched:true});assert.equal(plain.cards[0].iconRole,null);
  assert.ok(!f.queries.slice(n2).some(s=>s.includes("WHERE c.rarity='FUR'")));
  f.db.exec('DELETE FROM cards_effective_v1210');await assert.rejects(readIconFurReference(f.env),/ICON_FUR_REFERENCE_EMPTY/);
 }finally{f.close()}
});
test('server-prepared role snapshots reach bounded authoritative PVE/PVP timelines and preserve ordinary battles',async()=>{
 const f=iconFurFixture();try{
  const ref=buildIconFurReference(live.cards,live.battle,live.high),raw=ICON_ROLES.slice(0,2).map(d=>({id:d.cardId,grade:'ICON',power:180000}));
  const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards:raw}],'PVP',{fresh:true,batched:true});
  const prepared=raw.map(c=>({...c,iconRole:state.cards.find(x=>x.id===c.id).iconRole}));
  const ordinary=Array.from({length:3},(_,i)=>({id:'common-'+i,grade:'SSR',power:30000}));
  const enemies=fur15ReferenceCards(live.cards,live.battle,live.high).filter(c=>c.uniqueAbility).slice(0,2);
  const play=()=>createPvpBattleV2({attackerCards:[...prepared,...ordinary],defenderCards:[...enemies,...ordinary],seed:503,attackerEquipmentBonus:500000,defenderEquipmentBonus:500000});
  const x=play();assert.deepEqual(x,play());assert.equal(x.result.iconRoles.length,2);assert.ok(x.result.timeline.some(e=>e.type==='ICON_SKILL'));
  const pve=createPveBattleV2({cards:[...prepared,...ordinary],monster:{id:'boss',power:2000000,is_boss:1},seed:7});assert.equal(pve.result.iconRoles.length,2);
  for(const b of [x,pve])assert.ok(b.result.timeline.every(e=>e.damage==null||Number.isFinite(e.damage)));
  const plain=()=>createPvpBattleV2({attackerCards:ordinary,defenderCards:ordinary,seed:73});
  assert.deepEqual(plain(),plain());assert.equal(plain().result.iconRoles,undefined);
  assert.equal(buildFighter({id:'foreign',grade:'FUR',power:180000,iconRole:icon(ICON_ROLES[0],ref).iconRole},0,'A').iconRole,undefined);
 }finally{f.close()}
});
test('duo saved formations and automatic strongest selection also enforce two ICONs',()=>{
 const rows=ICON_ROLES.slice(0,3).map(d=>({id:d.cardId,grade:'ICON',power:180000})),normal=['FUR','FUR','SUPERSTAR'].map((grade,i)=>({id:'normal-'+i,grade,power:1000}));
 assert.throws(()=>validateDuoDeck([...rows,...normal.slice(0,2)]),/ICON/);
 assert.equal(validateDuoDeck([...rows.slice(0,2),...normal]).length,5);
 assert.equal(strongestDuoCards([...rows,...normal]).filter(c=>c.grade==='ICON').length,2);
});

test('captain keeps its existing combat model but receives the same grade hierarchy and aggregate power',async()=>{
 const f=iconFurFixture();try{
  const fur=fur15ReferenceCards(live.cards,live.battle,live.high,'CAPTAIN'),raw=fur.filter(c=>c.uniqueAbility).slice(0,2).map(({uniqueAbility,uniqueAdvancement,...c})=>c);
  const [s]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards:[{id:ICON_ROLES[0].cardId,grade:'ICON',power:180000},...raw]}],'CAPTAIN',{fresh:true,batched:true});
  const a=s.cards[0];assert.ok(a.iconRole.supremacy.CAPTAIN);
  for(const b of s.cards.slice(1)){assert.ok(a.power>=b.power*1.2);assert.ok(a.maxHp>=b.maxHp*1.2);assert.ok(1+a.uniqueDefensePercent/100>=(1+b.uniqueDefensePercent/100)*1.2);assert.ok(1+a.uniqueSpeedPercent/100>=(1+b.uniqueSpeedPercent/100)*1.2);}
  assert.equal(s.attackPower,s.cards.reduce((n,c)=>n+c.power,0));assert.ok(s.power>s.basePower);
 }finally{f.close()}
});
test('every existing unique-advancement-to-engine bridge forwards the authoritative ICON role too',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['api/[[path]].js','_battle_v2_preview.js','_clan.js','_cooperative_live.js','_escort_operation.js','_ranked_duo_profiles.js','_scrapyard_v3.js','_siege.js','_territory_war.js']){
  const source=await readFile(new URL('../functions/'+file,import.meta.url),'utf8');
  const bridges=[...source.matchAll(/uniqueAdvancement:\s*([^;\n{}]+?)(\?\.|\.)uniqueAdvancement\s*\|\|\s*null/g)];
  assert.ok(bridges.length,file);
  for(const m of bridges)assert.ok(source.slice(m.index,m.index+260).replaceAll(' ','').includes('iconRole:'+m[1].replaceAll(' ','')+m[2]+'iconRole||null'),file);
 }
});

test('old stored battle snapshots cannot bypass two-card limit and fail before DB work',async()=>{
 let reads=0;const env={DB:{prepare(){reads++;throw Error('Unexpected read')}}};
 for(const scope of ['PVE','PVP','CAPTAIN'])await assert.rejects(cardUniqueDeckStates(env,[{user:{id:1},cards:ICON_ROLES.slice(0,3).map(d=>({id:d.cardId,rarity:'ICON',power:180000}))}],scope),e=>e.code==='ICON_DECK_LIMIT'&&e.count===3&&e.limit===2);
 assert.equal(reads,0);
});
