import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {
  CHEETAH_CARD_ID,ROSTER_CARD_RETIREMENT_MARKER_KEY,ROSTER_CARD_RETIREMENT_SOURCES,
  SON_HEUNG_MIN_CARD_ID,SUPERSTAR_REROLL_TICKET_CODE,ensureRosterCardRetirementV2056,
  repairRosterRetirementDeck
} from '../functions/_roster_card_retirement_v2056.js';

const FAKER='CN-0B48C6FF8F9B4AC5',CHOVY='CN-48BBCAC81D0E44FA',ZEUS='CN-F7D77F561A7949EE';
const PARK_LIMITED='CN-3723AA9103A748AE',BAMBI_PRESTIGE='CN-9B9094FC8CF14C24';
const REFUNDS=Object.fromEntries(['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR'].map(grade=>[grade,Array.from({length:14},(_,level)=>level*10)]));

async function fixture({insufficient=false,catalogDrift=false}={}){
  const pg=new PGlite();
  await pg.exec(`
    CREATE TABLE app_meta(key text PRIMARY KEY,value text NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id bigint PRIMARY KEY,nickname text NOT NULL,role text NOT NULL DEFAULT 'USER',card_shards bigint NOT NULL DEFAULT 0);
    CREATE TABLE members(id bigint PRIMARY KEY,name text NOT NULL UNIQUE,is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE cards(id text PRIMARY KEY,member_id bigint NOT NULL,title text NOT NULL,rarity text NOT NULL,rarity_override text,image_url text NOT NULL DEFAULT '',
      is_active integer NOT NULL DEFAULT 1,card_status text NOT NULL DEFAULT 'PUBLIC',base_power integer NOT NULL DEFAULT 1000,draw_weight real NOT NULL DEFAULT 1,
      reroll_result_enabled integer NOT NULL DEFAULT 1,reroll_material_enabled integer NOT NULL DEFAULT 1,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE VIEW cards_effective_v1210 AS SELECT id,member_id,title,COALESCE(NULLIF(rarity_override,''),rarity) rarity,image_url,is_active,card_status,base_power,draw_weight,updated_at FROM cards;
    CREATE TABLE user_cards(user_id bigint NOT NULL,card_id text NOT NULL,quantity integer NOT NULL DEFAULT 1,breakthrough_level integer NOT NULL DEFAULT 0,
      breakthrough_fail_count integer NOT NULL DEFAULT 0,first_obtained_at text DEFAULT CURRENT_TIMESTAMP,last_obtained_at text DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id));
    CREATE TABLE card_unique_advancements_v1937(user_id bigint NOT NULL,card_id text NOT NULL,class_code text NOT NULL,dominant_type text NOT NULL,
      config_version integer NOT NULL DEFAULT 1,cost_master_stars integer NOT NULL DEFAULT 3000,modifiers_json text NOT NULL DEFAULT '{}',request_id text NOT NULL,
      activated_at text DEFAULT CURRENT_TIMESTAMP,updated_at text DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,card_id),UNIQUE(user_id,request_id));
    CREATE TABLE inventory_items(code text PRIMARY KEY,name text,subtitle text,description text,category text,rarity text,image_url text,sort_order integer,is_active integer,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cnine_user_inventory(user_id bigint NOT NULL,item_code text NOT NULL,quantity integer NOT NULL DEFAULT 0,unseen_quantity integer NOT NULL DEFAULT 0,
      created_at text DEFAULT CURRENT_TIMESTAMP,updated_at text DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id bigserial PRIMARY KEY,user_id bigint,item_code text,change_amount integer,balance_after integer,reason text,reference_type text,reference_id text,admin_id bigint,created_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE shard_logs(id bigserial PRIMARY KEY,user_id bigint,change_amount bigint,balance_after bigint,reason text,card_id text,created_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE admin_logs(id bigserial PRIMARY KEY,admin_id bigint,action_type text,target_type text,target_id text,before_data text,after_data text,created_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pve_decks(user_id bigint PRIMARY KEY,card_ids text NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_decks(user_id bigint PRIMARY KEY,card_ids text NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE pvp_deck_presets(user_id bigint NOT NULL,preset_no integer NOT NULL,card_ids text NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no));
    CREATE TABLE deck_synergies(id bigserial PRIMARY KEY,required_card_ids text NOT NULL,is_active integer NOT NULL DEFAULT 1,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE card_pack_cards(pack_id text NOT NULL,card_id text NOT NULL,PRIMARY KEY(pack_id,card_id));
    CREATE TABLE card_acquisition_effects(card_id text PRIMARY KEY,enabled integer,updated_at text DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE card_unique_effects(card_id text PRIMARY KEY,is_active integer NOT NULL DEFAULT 1,updated_at text DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO users VALUES(1,'OWNER','OWNER',0),(2,'대상1','USER',100),(3,'대상2','USER',500);
  `);
  const memberNames=[...new Set([...ROSTER_CARD_RETIREMENT_SOURCES.map(card=>card.member),'Son Heung min','이예준','안전멤버'])];
  const memberIds=new Map();let memberId=1;
  for(const name of memberNames){memberIds.set(name,memberId);await pg.query('INSERT INTO members(id,name) VALUES($1,$2)',[memberId++,name]);}
  for(const card of ROSTER_CARD_RETIREMENT_SOURCES)await pg.query('INSERT INTO cards(id,member_id,title,rarity,base_power) VALUES($1,$2,$3,$4,$5)',
    [card.id,memberIds.get(card.member),catalogDrift&&card.id===PARK_LIMITED?'잘못된 카드명':card.title,card.grade,1000]);
  await pg.query('INSERT INTO cards(id,member_id,title,rarity,base_power) VALUES($1,$2,$3,$4,$5)',[SON_HEUNG_MIN_CARD_ID,memberIds.get('Son Heung min'),'Son Heung min','SUPERSTAR',15500]);
  await pg.query('INSERT INTO cards(id,member_id,title,rarity,base_power) VALUES($1,$2,$3,$4,$5)',[CHEETAH_CARD_ID,memberIds.get('이예준'),'치타구','FUR',5000]);
  const safe=[
    ['SAFE-Z1','ZENITH',9000],['SAFE-Z2','ZENITH',8500],['SAFE-F1','FUR',7000],['SAFE-P1','PRESTIGE',6000],['SAFE-P2','PRESTIGE',5900],['SAFE-M1','MA',5000],['SAFE-S1','SSR',4000]
  ];
  for(const [id,grade,power] of safe)await pg.query('INSERT INTO cards(id,member_id,title,rarity,base_power) VALUES($1,$2,$3,$4,$5)',[id,memberIds.get('안전멤버'),id,grade,power]);
  for(const card of ROSTER_CARD_RETIREMENT_SOURCES)await pg.query('INSERT INTO card_unique_effects(card_id) VALUES($1)',[card.id]);
  await pg.query("INSERT INTO deck_synergies(required_card_ids) VALUES($1)",[JSON.stringify([FAKER,'SAFE-S1'])]);
  await pg.query("INSERT INTO card_pack_cards VALUES('pack',$1)",[FAKER]);
  await pg.query('INSERT INTO card_acquisition_effects(card_id,enabled) VALUES($1,1)',[FAKER]);

  const user2Sources=insufficient?[FAKER,CHOVY,ZEUS,PARK_LIMITED,BAMBI_PRESTIGE]:[FAKER,CHOVY,ZEUS,PARK_LIMITED,BAMBI_PRESTIGE];
  const sourceSettings=new Map([[FAKER,[2,13,4]],[CHOVY,[1,12,3]],[ZEUS,[1,11,2]],[PARK_LIMITED,[1,3,1]],[BAMBI_PRESTIGE,[1,2,0]]]);
  for(const id of user2Sources){const [quantity,level,fail]=sourceSettings.get(id);await pg.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(2,$1,$2,$3,$4)',[id,quantity,level,fail]);}
  if(!insufficient)for(const [id] of safe)await pg.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(2,$1,1,5)',[id]);
  await pg.query('INSERT INTO card_unique_advancements_v1937(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id) VALUES(2,$1,\'SHATTER\',\'ATTACK\',7,3333,\'{"attack":77}\',\'faker-adv-u2\')',[FAKER]);
  await pg.query('INSERT INTO card_unique_advancements_v1937(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id) VALUES(2,$1,\'TEMPO\',\'SPEED\',3,3000,\'{"speed":20}\',\'chovy-adv-u2\')',[CHOVY]);
  await pg.query('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,$1,2,0)',[SUPERSTAR_REROLL_TICKET_CODE]);
  const retiredDeck=JSON.stringify([FAKER,CHOVY,ZEUS,PARK_LIMITED,BAMBI_PRESTIGE]);
  await pg.query('INSERT INTO pve_decks VALUES(2,$1,NULL)',[retiredDeck]);await pg.query('INSERT INTO pvp_decks VALUES(2,$1,NULL)',[retiredDeck]);
  await pg.query('INSERT INTO pvp_deck_presets VALUES(2,1,$1,NULL)',[retiredDeck]);

  if(!insufficient){
    await pg.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(3,$1,1,13,6)',[FAKER]);
    await pg.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count) VALUES(3,$1,3,8,2)',[CHEETAH_CARD_ID]);
    for(const [id] of safe.slice(0,5))await pg.query('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(3,$1,1,4)',[id]);
    await pg.query('INSERT INTO card_unique_advancements_v1937(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id) VALUES(3,$1,\'SHATTER\',\'ATTACK\',9,4321,\'{"attack":99}\',\'faker-adv-u3\')',[FAKER]);
    await pg.query('INSERT INTO card_unique_advancements_v1937(user_id,card_id,class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id) VALUES(3,$1,\'BULWARK\',\'DEFENSE\',1,3000,\'{}\',\'old-cheetah-adv-u3\')',[CHEETAH_CARD_ID]);
    await pg.query('INSERT INTO pvp_decks VALUES(3,$1,NULL)',[JSON.stringify([FAKER,...safe.slice(0,4).map(card=>card[0])])]);
  }
  const client={async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];const result=await pg.query(text,values);return{...result,rowCount:result.affectedRows??result.rows.length}}};
  return{pg,env:{DB:new __postgresCompatTest.PostgresD1Database(client)},close:()=>pg.close()};
}

test('덱 복구는 직접 대체 카드를 우선하고 SUPERSTAR 1장 제한을 지킨다',()=>{
  const owned=[{id:CHEETAH_CARD_ID,grade:'FUR',level:13,base_power:5000},{id:SON_HEUNG_MIN_CARD_ID,grade:'SUPERSTAR',level:12,base_power:15500},
    {id:'OTHER-SUPERSTAR',grade:'SUPERSTAR',level:13,base_power:20000},{id:'A',grade:'ZENITH',level:5,base_power:9000},{id:'B',grade:'FUR',level:5,base_power:8000},
    {id:'C',grade:'MA',level:4,base_power:5000}];
  const result=repairRosterRetirementDeck({cardIds:[FAKER,CHOVY,ZEUS,'A','B'],ownedCards:owned});
  assert.equal(result.complete,true);assert.equal(result.after[0],CHEETAH_CARD_ID);assert.equal(result.after[1],SON_HEUNG_MIN_CARD_ID);
  assert.equal(result.after.filter(id=>[SON_HEUNG_MIN_CARD_ID,'OTHER-SUPERSTAR'].includes(id)).length,1);
});

test('24장 퇴사, 페이커·쵸비 직접 이전, 제우스·등급권 보상, 5장 덱 복구와 스냅샷을 한 번만 적용한다',async()=>{
  const f=await fixture();
  try{
    const result=await ensureRosterCardRetirementV2056(f.env,{refundByGrade:REFUNDS});
    assert.equal(result.status,'COMPLETED');assert.equal(result.retiredCards,24);assert.equal(result.snapshotRows,6);
    assert.equal(result.compensation.fakerToCheetahRows,2);assert.equal(result.compensation.fakerAdvancementsTransferred,2);
    assert.equal(result.compensation.chovyToSonRows,1);assert.equal(result.compensation.zeusSuperstarRerollTickets,1);
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM cards WHERE is_active=0 AND card_status='RETIRED'")).rows[0].n),24);
    assert.equal(Number((await f.pg.query('SELECT COUNT(*) n FROM user_cards WHERE card_id=ANY($1::text[])',[ROSTER_CARD_RETIREMENT_SOURCES.map(card=>card.id)])).rows[0].n),0);
    const cheetah2=(await f.pg.query('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=2 AND card_id=$1',[CHEETAH_CARD_ID])).rows[0];
    assert.deepEqual({...cheetah2},{quantity:2,breakthrough_level:13,breakthrough_fail_count:4});
    const fakerAdv2=(await f.pg.query('SELECT class_code,dominant_type,config_version,cost_master_stars,modifiers_json,request_id FROM card_unique_advancements_v1937 WHERE user_id=2 AND card_id=$1',[CHEETAH_CARD_ID])).rows[0];
    assert.deepEqual({...fakerAdv2},{class_code:'SHATTER',dominant_type:'ATTACK',config_version:7,cost_master_stars:3333,modifiers_json:'{"attack":77}',request_id:'faker-adv-u2'});
    const cheetah3=(await f.pg.query('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=3 AND card_id=$1',[CHEETAH_CARD_ID])).rows[0];
    assert.deepEqual({...cheetah3},{quantity:4,breakthrough_level:13,breakthrough_fail_count:6});
    assert.equal((await f.pg.query('SELECT request_id FROM card_unique_advancements_v1937 WHERE user_id=3 AND card_id=$1',[CHEETAH_CARD_ID])).rows[0].request_id,'faker-adv-u3');
    assert.equal((await f.pg.query('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=$1',[SUPERSTAR_REROLL_TICKET_CODE])).rows[0].quantity,3);
    assert.equal((await f.pg.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='LIMITED_REROLL_TICKET'")).rows[0].quantity,1);
    assert.equal((await f.pg.query("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='PRESTIGE_REROLL_TICKET'")).rows[0].quantity,1);
    assert.equal((await f.pg.query('SELECT card_shards FROM users WHERE id=2')).rows[0].card_shards,260);
    for(const table of ['pve_decks','pvp_decks']){const ids=JSON.parse((await f.pg.query(`SELECT card_ids FROM ${table} WHERE user_id=2`)).rows[0].card_ids);assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);assert(!ids.some(id=>ROSTER_CARD_RETIREMENT_SOURCES.some(card=>card.id===id)));}
    const snapshots=(await f.pg.query("SELECT source_card_id,source_advancement_json,target_advancement_json FROM card_retirement_v2056_user_snapshots WHERE source_card_id=$1 ORDER BY user_id",[FAKER])).rows;
    assert.equal(snapshots.length,2);assert(snapshots.every(row=>JSON.parse(row.source_advancement_json).request_id.startsWith('faker-adv-')));assert(snapshots[1].target_advancement_json);
    const replay=await ensureRosterCardRetirementV2056(f.env,{refundByGrade:REFUNDS});assert.equal(replay.replayed,true);
    assert.equal((await f.pg.query('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=$1',[SUPERSTAR_REROLL_TICKET_CODE])).rows[0].quantity,3);
    assert.equal(Number((await f.pg.query("SELECT COUNT(*) n FROM admin_logs WHERE action_type='ROSTER_CARD_RETIREMENT_V2056'")).rows[0].n),1);
  }finally{await f.close()}
});

test('카탈로그 변경이나 5장 덱 복구 불능이면 사용자 보상과 카드 삭제를 모두 롤백한다',async()=>{
  for(const options of [{catalogDrift:true},{insufficient:true}]){
    const f=await fixture(options);
    try{
      await assert.rejects(()=>ensureRosterCardRetirementV2056(f.env,{refundByGrade:REFUNDS}));
      assert.equal((await f.pg.query('SELECT is_active FROM cards WHERE id=$1',[FAKER])).rows[0].is_active,1);
      assert.equal((await f.pg.query('SELECT quantity FROM user_cards WHERE user_id=2 AND card_id=$1',[FAKER])).rows[0].quantity,2);
      assert.equal((await f.pg.query('SELECT card_shards FROM users WHERE id=2')).rows[0].card_shards,100);
      assert.equal((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[ROSTER_CARD_RETIREMENT_MARKER_KEY])).rows.length,0);
    }finally{await f.close()}
  }
});

test('슈퍼스타 재뽑기권은 실제 SUPERSTAR 고정 뽑기로 연결되고 health에는 비식별 요약만 노출된다',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const retirement=readFileSync(new URL('../functions/_roster_card_retirement_v2056.js',import.meta.url),'utf8');
  assert.match(api,/SUPERSTAR:\{code:'SUPERSTAR_REROLL_TICKET'/);
  assert.match(api,/SUPERSTAR_REROLL_TICKET:'SUPERSTAR'/);
  assert.match(api,/ensureRosterCardRetirementV2056\(env,\{refundByGrade:/);
  assert.match(api,/rosterCardRetirementV2056=rosterRetirement\?\{/);
  assert.doesNotMatch(api,/rosterCardRetirementV2056=rosterRetirement;/);
  assert.match(retirement,/SET LOCAL lock_timeout='15s'/);
  assert.match(retirement,/LOCK TABLE \$\{locked\.join\(','\)\} IN SHARE ROW EXCLUSIVE MODE/);
  assert.doesNotMatch(retirement,/SHARE ROW EXCLUSIVE MODE NOWAIT/);
});
