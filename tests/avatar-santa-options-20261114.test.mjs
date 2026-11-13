import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {JointSQLiteDB,jointFixtureSchema} from './helpers/joint-db.mjs';
import {ensureSantaAvatars,SANTA_AVATAR_KEY,SANTA_CODES} from '../functions/_avatar_santa.js';
import {avatarBattlePowerPercents} from '../functions/_avatar_power.js';
import {avatarDropIncreasePercent,applyAvatarDropRate} from '../functions/_avatar_drop.js';
import {accountRankAward} from '../functions/_account_rank.js';
import {rankAwardBoosts} from '../functions/_avatar_santa_rank.js';
import {rankPotionKey} from '../functions/_rank_exp_potion.js';
import {nextRankPotion} from '../shared/rank-exp-potion-v1.mjs';
const expected=[['DROP_RATE_PERCENT',50],['COIN_GAIN_PERCENT',175],['RAID_EXTRA_ENTRY',15],['BATTLE_POWER_PERCENT',7.7],['ACCOUNT_RANK_XP_PERCENT',30]].map(([type,value])=>({type,value}));
const legacy=[['DROP_RATE_PERCENT',45],['COIN_GAIN_PERCENT',150],['RAID_EXTRA_ENTRY',15],['BATTLE_POWER_PERCENT',4.5]].map(([type,value])=>({type,value}));
async function fixture(t,postgres){
 const ddl=["CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,coin INTEGER DEFAULT 0)",...jointFixtureSchema.filter(s=>/^CREATE TABLE (app_meta\(|user_messages\(|user_message_rewards\(|user_mercenary_cards_v1\()/.test(s))];
 let DB;
 if(postgres){const pg=new PGlite();t.after(()=>pg.close());await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;"+ddl.map(s=>s.replaceAll('INTEGER PRIMARY KEY AUTOINCREMENT','BIGSERIAL PRIMARY KEY').replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));DB=new __postgresCompatTest.PostgresD1Database({async query(input,values){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?values||[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});}
 else{DB=new JointSQLiteDB();DB.sql.exec(ddl.join(';'));t.after(()=>DB.sql.close());}
 const env={DB},p=(sql,...args)=>DB.prepare(sql).bind(...args);
 await p("INSERT INTO users(id,nickname,role,status) VALUES(1,'owner','OWNER','ACTIVE'),(2,'member','USER','ACTIVE')").run();
 const set=(key,value)=>p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)).run();
 await set('avatar_settings_v1',{mode:'ON',shopEnabled:false,version:2});
 const api=await import('../functions/_avatar.js?scope='+crypto.randomUUID());await api.ensureAvatarFoundation(env);
 const call=(path,body)=>api.handleAvatar({env,path,deps:{authenticate:async()=>({id:2,role:'USER'}),requirePermission:async()=>({id:1,role:'OWNER'}),writeAdminLog:async()=>{},readBody:r=>r.json(),json:(body,status=200)=>({body,status})},request:new Request('https://qa.test/api/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 return {env,p,set,api,call};
}
for(const pg of [false,true])test((pg?'PostgreSQL':'SQLite')+' · four private Santa catalog options, scoped equip multipliers, expiry and replay-safe rank credits',async t=>{
 const {env,p,set,api,call}=await fixture(t,pg),catalog=async()=>(await call('admin/avatars')).body.avatars;
 const rows=await catalog(),before=rows.find(x=>x.code==='IYEJUN');assert.deepEqual(before.effects,legacy);
 assert.equal((await call('avatar/catalog')).body.avatars.filter(x=>SANTA_CODES.includes(x.code)).length,0);
 for(const code of SANTA_CODES){const a=rows.find(i=>i.code===code);assert.deepEqual(a.effects,expected);assert.deepEqual([a.active,a.public,a.saleEnabled,a.coinGainCap,a.rankXpAllowed],[true,false,false,175,true]);const data=await call('admin/avatars',{action:'SAVE_AVATAR',...a,effects:expected});assert.equal(data.status,200);assert.deepEqual(data.body.avatar.effects,expected);}
 assert.equal((await call('admin/avatars',{action:'SAVE_AVATAR',...before,effects:expected})).status,400);
 const code=SANTA_CODES[0];let a=(await catalog()).find(x=>x.code===code);
 assert.equal((await call('admin/avatars',{action:'SAVE_AVATAR',...a,effects:expected,public:true})).status,200);
 await p("INSERT INTO avatar_user_ownership_v1(user_id,avatar_code,source_type) VALUES(2,?,'TEST')",code).run();
 let result=await call('avatar/equip',{avatarCode:code});assert.equal(result.status,200);
 const equipped=await api.equippedAvatarEffect(env,2);assert.deepEqual(equipped.effects,expected);
 assert.deepEqual(api.applyAvatarCoinGain(100,equipped),{base:100,percent:175,bonus:175,total:275});
 assert.equal(api.applyAvatarRaidEntryBonus(2,equipped).limit,17);
 assert.equal(applyAvatarDropRate(10,await avatarDropIncreasePercent(env,2)).total,15);
 assert.equal((await avatarBattlePowerPercents(env,[1,2])).get(2),7.7);
 const award=async event=>{const writes=await accountRankAward(env,2,'HUNT',event);await env.DB.batch(writes);return Number((await p('SELECT ticks FROM account_rank_receipts_v1 WHERE user_id=2 AND event_id=?',event).first()).ticks);};
 assert.equal(await award('first'),6240);assert.equal(await award('first'),6240);
 assert.equal(Number((await p('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=2').first()).total_ticks),6240);
 await set(rankPotionKey(2),nextRankPotion(null,2,Date.now()));assert.equal(await award('with-potion'),12480);
 await set('avatar_settings_v1',{mode:'TEST',shopEnabled:false,version:3});assert.equal((await rankAwardBoosts(env,2)).avatarPercent,0);assert.equal(await api.equippedAvatarEffect(env,2),null);
 await set('avatar_settings_v1',{mode:'ON',shopEnabled:false,version:4});
 await p("UPDATE avatar_user_ownership_v1 SET expires_at='2001-01-01 00:00:00' WHERE user_id=2").run();assert.equal((await rankAwardBoosts(env,2)).avatarPercent,0);assert.equal((await avatarBattlePowerPercents(env,[2])).has(2),false);assert.equal(await api.equippedAvatarEffect(env,2),null);
 await p('DELETE FROM avatar_user_loadout_v1 WHERE user_id=2').run();assert.equal(await award('potion-alone'),9600);
 const second=SANTA_CODES[1],existing=(await catalog()).find(x=>x.code===second);
 const edited=expected.map(e=>e.type==='ACCOUNT_RANK_XP_PERCENT'?{...e,value:28}:e);assert.equal((await call('admin/avatars',{action:'SAVE_AVATAR',...existing,effects:edited})).status,200);
 await p('DELETE FROM app_meta WHERE key=?',SANTA_AVATAR_KEY).run();await ensureSantaAvatars(env);
 const refreshed=await catalog();assert.deepEqual(refreshed.find(x=>x.code===second).effects,edited);assert.deepEqual(refreshed.find(x=>x.code==='IYEJUN'),before);
});
test('only site-ready responsive Santa files are public; cap fits the deployment budget',async()=>{
 const {isProductionFile}=await import('../scripts/prepare-production-assets.mjs');const {readFileSync}=await import('node:fs');const {execFileSync}=await import('node:child_process');const sharp=(await import('sharp')).default;
 const cwd=new URL('..',import.meta.url);for(const id of ['hiheeya','bongsoon','joeun','sudaeng'])for(const [kind,w] of [['equipment-640',640],['lobby-640',640],['lobby-1024',1024]]){const path='assets/ui/avatars-v1/santa-20261114/'+id+'-'+kind+'.webp';assert(isProductionFile(path));const m=await sharp(readFileSync(new URL(path,cwd))).metadata();assert.deepEqual([m.width,m.height],[w,w*1.5]);assert.equal(m.hasAlpha,kind==='equipment-640');}
 assert.equal(isProductionFile('preview/avatar-iyejun-suit-20261018-v1/README.md'),false);const list=execFileSync('git',['ls-files','-z'],{cwd,maxBuffer:40e6}).toString().split('\0').filter(Boolean);const count=list.filter(f=>isProductionFile(f)&&!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+2;assert.ok(count<=20000,'Public file count '+count);
});
