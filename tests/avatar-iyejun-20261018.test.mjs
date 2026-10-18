import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {ensureIyejunAvatar,IYEJUN_AVATAR_KEY} from '../functions/_avatar_iyejun.js';
import {avatarBattlePowerPercents} from '../functions/_avatar_power.js';
import {avatarDropIncreasePercent,applyAvatarDropRate} from '../functions/_avatar_drop.js';
import {buildPvePlayerTeam,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {duoFixture} from './helpers/ranked-duo-db.mjs';
import {loadDuoProfiles} from '../functions/_ranked_duo_profiles.js';
import {ICON_ROLES,iconRoleSnapshot} from '../shared/icon-roles-v1.mjs';
import {ICON_SUPREMACY} from '../shared/icon-supremacy-v1.mjs';
const effects=[{type:'DROP_RATE_PERCENT',value:45},{type:'COIN_GAIN_PERCENT',value:150},{type:'RAID_EXTRA_ENTRY',value:15},{type:'BATTLE_POWER_PERCENT',value:4.5}];
async function fixture(){
 const pg=new PGlite(),api=await import('../functions/_avatar.js?iyejun='+crypto.randomUUID());
 await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,coin BIGINT,status TEXT);
 INSERT INTO users VALUES(1,'owner','OWNER',777,'ACTIVE'),(2,'ordinary','USER',888,'ACTIVE');
 INSERT INTO app_meta VALUES('avatar_settings_v1','{"mode":"ON","shopEnabled":true,"version":3}',NULL);`);
 const q=async(sql,values=[])=>(await pg.query(sql,values)).rows;
 const client={async query(input,values){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?values||[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};await api.ensureAvatarFoundation(env);
 const call=(path,body)=>api.handleAvatar({env,path,deps:{authenticate:async()=>({id:2,role:'USER'}),requirePermission:async()=>({id:1,role:'OWNER'}),writeAdminLog:async()=>{},readBody:r=>r.json(),json:(body,status=200)=>({body,status})},request:new Request('https://qa.test/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 return {pg,api,env,q,call};
}
test('approved four options survive PostgreSQL catalog, equip, reward and CMS save paths',async()=>{
 const f=await fixture();try{
  const avatar=(await f.call('avatar/catalog')).body.avatars.find(a=>a.code==='IYEJUN');
  assert.equal(avatar.name,'이예준');assert.equal(avatar.serial,'A-36');assert.deepEqual(avatar.effects,effects);
  assert.equal(avatar.active,true);assert.equal(avatar.public,true);assert.equal(avatar.owned,false);assert.equal(avatar.saleEnabled,false);assert.equal(avatar.acquisitionType,'UNSET');
  assert.deepEqual(await f.q('SELECT * FROM avatar_user_ownership_v1'),[]);
  assert.equal((await f.call('avatar/purchase',{avatarCode:'IYEJUN',requestId:'iyejun-not-on-sale'})).status,404);
  assert.equal((await f.call('avatar/equip',{avatarCode:'IYEJUN'})).status,404);
  const before=await f.q("SELECT * FROM avatar_catalog_v1 WHERE code<>'IYEJUN' ORDER BY code");
  const saved=await f.call('admin/avatars',{action:'SAVE_AVATAR',...avatar,effects});
  assert.equal(saved.status,200);assert.deepEqual(saved.body.avatar.effects,effects);
  assert.deepEqual(await f.q("SELECT * FROM avatar_catalog_v1 WHERE code<>'IYEJUN' ORDER BY code"),before);
  assert.deepEqual(await f.q("SELECT effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code='IYEJUN' AND option_order=3"),[{effect_type:'BATTLE_POWER_BASIS_POINTS',effect_value:450}]);
  // Ownership here exists only inside this isolated fixture.
  await f.q("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type) VALUES(2,'IYEJUN','TEST')");
  assert.equal((await f.call('avatar/equip',{avatarCode:'IYEJUN'})).status,200);
  const equipped=await f.api.equippedAvatarEffect(f.env,2);assert.deepEqual(equipped.effects,effects);
  assert.deepEqual(f.api.applyAvatarCoinGain(100,equipped),{base:100,percent:150,bonus:150,total:250});
  assert.equal(f.api.applyAvatarCoinGain(100,{code:'HANBOK_DIIM',effects:[{type:'COIN_GAIN_PERCENT',value:999}]}).total,200);
  assert.equal(f.api.applyAvatarRaidEntryBonus(3,equipped).limit,18);
  assert.equal(await avatarDropIncreasePercent(f.env,2),45);assert.equal(applyAvatarDropRate(10,45).total,14.5);
  assert.equal((await avatarBattlePowerPercents(f.env,[2])).get(2),4.5);
  await f.q("UPDATE app_meta SET value='{}' WHERE key='avatar_settings_v1'");assert.equal((await avatarBattlePowerPercents(f.env,[2])).size,0);
  await f.q("UPDATE app_meta SET value='{\"mode\":\"TEST\"}' WHERE key='avatar_settings_v1'");assert.equal((await avatarBattlePowerPercents(f.env,[2])).size,0);
  await f.q("UPDATE users SET role='OWNER' WHERE id=2");assert.equal((await avatarBattlePowerPercents(f.env,[2])).get(2),4.5);
  await f.q("UPDATE avatar_user_ownership_v1 SET expires_at='2020-01-01 00:00:00' WHERE user_id=2");assert.equal((await avatarBattlePowerPercents(f.env,[2])).size,0);assert.equal(await f.api.equippedAvatarEffect(f.env,2),null);
 }finally{await f.pg.close()}
});
test('seed replay preserves operator settings and a serial conflict rolls back every inserted option',async()=>{
 const f=await fixture();try{
  await f.q("UPDATE avatar_catalog_v1 SET is_public=0,is_active=0 WHERE code='IYEJUN'");
  await f.q("UPDATE avatar_effect_options_v1 SET effect_value=120 WHERE avatar_code='IYEJUN' AND effect_type='COIN_GAIN_PERCENT'");
  await f.q('DELETE FROM app_meta WHERE key=$1',[IYEJUN_AVATAR_KEY]);
  await ensureIyejunAvatar(f.env);
  assert.equal((await f.q("SELECT is_public FROM avatar_catalog_v1 WHERE code='IYEJUN'"))[0].is_public,0);
  assert.equal((await f.q("SELECT effect_value FROM avatar_effect_options_v1 WHERE avatar_code='IYEJUN' AND effect_type='COIN_GAIN_PERCENT'"))[0].effect_value,120);
  await f.q("DELETE FROM avatar_effect_options_v1 WHERE avatar_code='IYEJUN'");await f.q("DELETE FROM avatar_catalog_v1 WHERE code='IYEJUN'");
  await f.q('DELETE FROM app_meta WHERE key=$1',[IYEJUN_AVATAR_KEY]);await f.q("UPDATE avatar_catalog_v1 SET serial='A-36' WHERE code='HANBOK_DIIM'");
  await assert.rejects(ensureIyejunAvatar(f.env));assert.deepEqual(await f.q("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code='IYEJUN'"),[]);
  assert.deepEqual(await f.q('SELECT value FROM app_meta WHERE key=$1',[IYEJUN_AVATAR_KEY]),[]);
 }finally{await f.pg.close()}
});
const cards=Array.from({length:5},(_,i)=>({id:'Q'+i,power:10000,rarity:'SS',power_type:'NONE'}));
const mercenary={code:'V-001',rank:'SSS',statMode:'RANK_FIXED',skills:[],role:'VANGUARD',position:'FRONT'};
test('4.5% changes actual PVE/PVP formation power once and leaves unmodified teams identical',()=>{
 const args={cards,characterBonus:10000,battleSuit:{code:'TEST',pvePower:10000},mercenary};
 const base=buildPvePlayerTeam(args),up=buildPvePlayerTeam({...args,pveEquipmentRuntime:{avatarPowerPercent:4.5}});
 assert.deepEqual(buildPvePlayerTeam({...args,pveEquipmentRuntime:{avatarPowerPercent:0}}),base);
 for(let i=0;i<5;i++){assert.equal(up.teamA[i].power,Math.round(base.teamA[i].power*1.045));assert.ok(up.teamA[i].attack>base.teamA[i].attack)}
 assert.equal(up.battleSuitFighter.power,10450);assert.equal(up.mercenaryFighter.power,Math.round(base.mercenaryFighter.power*1.045));
 const p={attackerCards:cards,defenderCards:cards,attackerEquipmentBonus:10000,attackerMercenary:mercenary,seed:12};
 const plain=createPvpBattleV2(p),enhanced=createPvpBattleV2({...p,attackerAvatarPowerPercent:4.5});
 assert.equal(enhanced.teams.A.cards[0].power,12540);assert.deepEqual(enhanced.teams.B.summary,plain.teams.B.summary);
 assert.deepEqual(createPvpBattleV2({...p,attackerAvatarPowerPercent:0}),plain);
});
test('cooperative and duo bonuses remain scoped to the equipped owner',()=>{
 const squad=id=>({ownerId:id,ownerName:'QA',cards,mercenary,equipmentBonus:0});
 const duo=createDuoBattleV2({attackerSquads:[{...squad(1),avatarPowerPercent:4.5},squad(2)],defenderSquads:[squad(3),squad(4)],seed:7});
 assert.equal(duo.teams.A.cards.find(c=>c.ownerId===1).power,10450);assert.equal(duo.teams.A.cards.find(c=>c.ownerId===2).power,10000);
 const squads=[1,2,3].map(id=>({...squad(id),cards:cards.slice(0,2),...(id===1?{avatarPowerPercent:4.5}:{})}));
 const coop=createCooperativeBattle({squads,seed:7}).payload.battleV2;
 assert.equal(coop.teams.A.cards.find(c=>c.ownerId===1).power,10450);assert.equal(coop.teams.A.cards.find(c=>c.ownerId===2).power,10000);
});
test('approved image is unchanged and equipment export has transparent full-body margins',async()=>{
 const dir=new URL('../preview/avatar-iyejun-suit-20261018-v1/',import.meta.url),m=JSON.parse(await readFile(new URL('runtime-manifest.json',dir),'utf8'));
 assert.equal(m.approval.lobbySha256,'639d7f43789d980ead542d64af0d33de1edc5e0079d1d2d5d638253776b7feed');
 for(const [name,entry] of Object.entries(m.files))assert.equal(createHash('sha256').update(await readFile(new URL('assets/'+name,dir))).digest('hex'),entry.sha256);
 const {data,info}=await sharp(await readFile(new URL('assets/avatar-iyejun-equipment-v1-640.webp',dir))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,640);assert.equal(info.height,1088);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(!x||!y||x===info.width-1||y===info.height-1)assert.equal(data[(y*info.width+x)*4+3],0);
});
test('ICON minimum stats retain the same avatar multiplier without mutating the saved snapshot',()=>{
 const card={id:ICON_ROLES[0].cardId,rarity:'ICON',power:180000};
 card.iconRole={...iconRoleSnapshot(card),supremacy:{version:ICON_SUPREMACY.version,power:1000000,
  ...Object.fromEntries(['PVE','PVP'].map(mode=>[mode,Object.fromEntries(['maxHp','attack','defense','speed'].map(key=>[key,{base:1000000,perPower:1}]))]))}};
 const before=JSON.stringify(card),plain=buildPvePlayerTeam({cards:[card]}).teamA[0],up=buildPvePlayerTeam({cards:[card],pveEquipmentRuntime:{avatarPowerPercent:4.5}}).teamA[0];
 assert.equal(up.power,Math.round(plain.power*1.045));assert.ok(up.attack>=Math.floor(plain.attack*1.045));assert.ok(up.maxHp>=Math.floor(plain.maxHp*1.045));assert.equal(JSON.stringify(card),before);
});
for(const postgres of [false,'pipeline'])test(`${postgres||'SQLite'} cached duo profiles observe avatar equip and unequip without caching a bonus twice`,async t=>{
 const f=await duoFixture(t,{postgres});await f.ready();
 const get=()=>loadDuoProfiles(f.env,[2,3],f.config,f.deps,{now:f.clock(),wait:async()=>{}});
 const baseline=await get();
 await f.p("UPDATE app_meta SET value=? WHERE key='avatar_settings_v1'",JSON.stringify({mode:'ON',shopEnabled:false,version:2})).run();
 await f.p("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type) VALUES(2,'IYEJUN','TEST')").run();
 await f.p("INSERT INTO avatar_user_loadout_v1(user_id,avatar_code) VALUES(2,'IYEJUN')").run();
 const up=await get();assert.equal(up[0].power,Math.round(baseline[0].power*1.045));assert.equal(up[0].attack.avatarPowerPercent,4.5);assert.deepEqual(up[1],baseline[1]);
 assert.deepEqual(await get(),up);
 await f.p('DELETE FROM avatar_user_loadout_v1 WHERE user_id=2').run();assert.deepEqual(await get(),baseline);
});
