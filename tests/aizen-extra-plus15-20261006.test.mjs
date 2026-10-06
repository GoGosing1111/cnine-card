import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {CARD,TARGETS,EXCLUDED,upgradeCards,verifyUpgrade} from '../scripts/ops/aizen-extra-plus15-20261006.mjs';

async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,status TEXT,role TEXT,coin BIGINT,card_shards BIGINT,magic_crystals BIGINT);
 CREATE TABLE members(id BIGINT PRIMARY KEY,name TEXT,is_active INTEGER);INSERT INTO members VALUES(1,'이예준',1);
 CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,member_id BIGINT,is_active INTEGER,card_status TEXT);
 CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity BIGINT,breakthrough_level BIGINT,breakthrough_fail_count BIGINT,first_obtained_at TEXT DEFAULT 'first',last_obtained_at TEXT DEFAULT 'last',PRIMARY KEY(user_id,card_id));
 CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT);
 CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
 await db.query('INSERT INTO cards_effective_v1210 VALUES($1,$2,$3,1,1,$4)',[CARD.id,CARD.title,'FUR','PUBLIC']);
 for(const [i,u] of [{id:1,nickname:'운영자'},...TARGETS,...EXCLUDED,{id:5,nickname:'이전 완료 유저',observedLevel:15},{id:6000,nickname:'명단 외 유저'}].entries()){
  await db.query('INSERT INTO users VALUES($1,$2,$3,$4,9000000000001,456,789)',[u.id,u.nickname,'ACTIVE',u.id===1?'OWNER':u.id===83?'ADMIN':'USER']);
  await db.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES($1,$2,$3,$4,$5),($1,$6,3,10,4)',[u.id,CARD.id,i+2,u.observedLevel??13,Number(u.observedLevel)===15?2:6,'OTHER']);
  await db.query('INSERT INTO cnine_user_inventory VALUES($1,$2,3000000,100),($1,$3,3,1)',[u.id,'MASTER_STAR','OTHER']);
 }
 return db;
}
async function snapshot(db){const s={};for(const table of ['users','user_cards','cnine_user_inventory','app_meta','admin_logs'])s[table]=(await db.query('SELECT * FROM '+table+' ORDER BY 1,2')).rows;return s;}
const norm=rows=>rows.map(r=>({...r,user_id:Number(r.user_id),quantity:Number(r.quantity),breakthrough_level:Number(r.breakthrough_level),breakthrough_fail_count:Number(r.breakthrough_fail_count)}));
async function run(db,{commit=true,failAt='',day='2026-10-06'}={}){
 await db.exec('BEGIN');let audits=0;
 const q=async(sql,args)=>{
  if(sql.startsWith('SELECT to_char(CURRENT_TIMESTAMP'))return [{kst:day}];
  if(sql.startsWith('INSERT INTO admin_logs')&&++audits===3&&failAt==='audit')throw Error('Injected third audit failure');
  if(sql.startsWith('INSERT INTO app_meta')&&failAt==='receipt')throw Error('Injected receipt failure');
  return (await db.query(sql,args)).rows;
 };
 try{const r=await upgradeCards(q);await db.exec(commit?'COMMIT':'ROLLBACK');return r;}catch(e){await db.exec('ROLLBACK');throw e;}
}

test('additional 31 accounts reach +15 once; excluded accounts, existing +15 state, copies, dates, other cards and currencies stay intact',async t=>{
 assert.equal(TARGETS.length,31);
 for(const [id,name] of [[197,'무버지'],[1195,'씨나인택갓'],[4836,'딤키우기'],[4774,'딤럼프'],[4910,'스루형2↑']])assert.equal(TARGETS.find(t=>t.id===id)?.nickname,name);
 assert.deepEqual(EXCLUDED,[]);assert.ok(!TARGETS.some(t=>t.id===5));
 const db=await fixture(t),before=await snapshot(db),receipt=await run(db),after=await snapshot(db);
 assert.equal(receipt.accounts,31);assert.equal(receipt.changed,31);assert.equal(receipt.already15,0);assert.ok(receipt.recipients.every(r=>r.levelAfter===15&&r.quantityBefore===r.quantityAfter));
 assert.deepEqual(after.users,before.users);assert.deepEqual(after.cnine_user_inventory,before.cnine_user_inventory);
 const expected=before.user_cards.map(r=>r.card_id===CARD.id&&TARGETS.some(t=>t.id===Number(r.user_id))&&Number(r.breakthrough_level)<15?{...r,breakthrough_level:15,breakthrough_fail_count:0}:r);
 assert.deepEqual(norm(after.user_cards),norm(expected));assert.equal(after.admin_logs.length,31);assert.equal(after.app_meta.length,1);
 assert.equal((await run(db)).replayed,true);assert.deepEqual(await snapshot(db),after);assert.equal((await verifyUpgrade(async(sql,args)=>(await db.query(sql,args)).rows)).current.length,31);
});

test('dry run and audit/receipt failures roll back all changes; retry leaves a newly completed +15 holding intact',async t=>{
 const db=await fixture(t);await db.query('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=7 WHERE user_id=$1 AND card_id=$2',[TARGETS[0].id,CARD.id]);const before=await snapshot(db);await run(db,{commit:false});assert.deepEqual(await snapshot(db),before);
 for(const failAt of ['audit','receipt']){await assert.rejects(run(db,{failAt}),/Injected/);assert.deepEqual(await snapshot(db),before);}
 const receipt=await run(db);assert.equal(receipt.changed,30);assert.equal(receipt.already15,1);assert.equal(Number((await db.query('SELECT breakthrough_fail_count FROM user_cards WHERE user_id=$1 AND card_id=$2',[TARGETS[0].id,CARD.id])).rows[0].breakthrough_fail_count),7);
});

test('wrong identity, missing ownership, enhancement in progress and expired operation reject all writes',async t=>{
 const db=await fixture(t),id=TARGETS[0].id;
 await db.query('UPDATE users SET nickname=$1 WHERE id=$2',['이름 변경',id]);
 let before=await snapshot(db);await assert.rejects(run(db),/identity changed/);assert.deepEqual(await snapshot(db),before);
 await db.query('UPDATE users SET nickname=$1 WHERE id=$2',[TARGETS[0].nickname,id]);await db.query('UPDATE user_cards SET quantity=0 WHERE user_id=$1 AND card_id=$2',[id,CARD.id]);
 before=await snapshot(db);await assert.rejects(run(db),/Existing owned/);assert.deepEqual(await snapshot(db),before);
 await db.query('UPDATE user_cards SET quantity=3,breakthrough_fail_count=-1 WHERE user_id=$1 AND card_id=$2',[id,CARD.id]);
 before=await snapshot(db);await assert.rejects(run(db),/in progress/);assert.deepEqual(await snapshot(db),before);
 await db.query('UPDATE user_cards SET breakthrough_fail_count=0 WHERE user_id=$1 AND card_id=$2',[id,CARD.id]);
 before=await snapshot(db);await assert.rejects(run(db,{day:'2026-10-07'}),/expired/);assert.deepEqual(await snapshot(db),before);
});
