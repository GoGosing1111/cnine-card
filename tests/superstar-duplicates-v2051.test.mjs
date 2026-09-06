import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleSuperstarDuplicateAudit} from '../functions/_superstar_duplicate_audit.js';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8'),app=read('js/app.js');
const snippet=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));

test('SUPERSTAR dex shows current copies and extra copies without changing battle card frames',()=>{
  const context=vm.createContext({uniqueAbilityBadgeHtml:()=>'',FAKER_CHAMPIONSHIP_CARD_ID:'faker',uniqueAbilityDominant:()=>null,
    deckAbilityIconHtml:()=>'',TIER_FRAME_GRADES:[],TIER_RANK_LABELS:{},escapeHtml:String,powerTypeIndicatorHtml:()=>'',responsiveCardImageMarkup:()=>'<img>',drawResultRenderCount:0});
  vm.runInContext(snippet('function cardHtml(','function showDetail('),context);
  for(const [quantity,extra] of [[1,0],[2,1],[10,9],[1000,999]]){
    const user={quantities:{S1:quantity},breakthroughs:{S1:0}},card={id:'S1',grade:'SUPERSTAR',title:'스타'};
    const html=context.cardHtml(card,true,'dex-card-display',user);
    assert.match(html,/dex-superstar-quantity/);assert.ok(html.includes(`보유 ${quantity.toLocaleString('ko-KR')}장`));assert.ok(html.includes(`중복 ${extra.toLocaleString('ko-KR')}장`));
    assert.match(html,/superstar-card-frame/);
    assert.doesNotMatch(context.cardHtml(card,true,'pve-deck-card-display',user),/dex-superstar-quantity/);
    assert.doesNotMatch(context.cardHtml(card,false,'dex-card-display',user),/dex-superstar-quantity/);
  }
  assert.doesNotMatch(context.cardHtml({id:'F1',grade:'FUR'},true,'dex-card-display',{quantities:{F1:2}}),/dex-superstar-quantity/);
  const css=read('css/superstar-v1.css');assert.match(css,/\.dex-card-display\.grade-SUPERSTAR \.dex-superstar-quantity/);assert.match(css,/z-index: 31/);
});

test('SUPERSTAR detail exposes duplicate stock at every enhancement level, leaving Zenith and FUR unchanged',()=>{
  const line=app.split('\n').find(line=>line.includes('const possessionText='));
  const label=(quantity,owned=true,grade='SUPERSTAR')=>vm.runInNewContext(`${line}\npossessionText`,{ownedQuantity:quantity,owned,furOwned:grade==='FUR'&&owned,isZenith:grade==='ZENITH',isSuperstar:grade==='SUPERSTAR'});
  assert.equal(label(1),'1장 보유 · 중복 0장');assert.equal(label(8),'8장 보유 · 중복 7장');assert.equal(label(0,false),'미획득');
  assert.equal(label(3,true,'FUR'),'3장 보유');assert.equal(label(3,true,'ZENITH'),'3회 · 중복 2회');
  const alchemy=read('functions/_alchemy.js');assert.match(alchemy,/ALCHEMY_CARD_INPUT_GRADES=new Set\(\['LIMITED','PRESTIGE','FUR','ZENITH'\]\)/);
});

test('audit is OWNER-only and rejects all write methods before querying inventory',async()=>{
  let queries=0;const env={DB:{prepare(){queries++;throw new Error('must not query');}}};
  const call=(role,method='GET')=>handleSuperstarDuplicateAudit({env,request:new Request('https://qa.test/api/admin/superstar-duplicates',{method}),deps:{requirePermission:async()=>role?{id:1,role}:null,json:(body,status=200)=>({body,status})}});
  for(const role of [null,'USER','ADMIN'])assert.equal((await call(role)).status,403);
  assert.equal((await call('OWNER','POST')).status,405);assert.equal(queries,0);
});

test('PostgreSQL audit retains zero inventory, normal duplicate spending, reset evidence and every receipt page without writes',async()=>{
  const pg=new PGlite();
  try{
    await pg.exec(`
      CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT);
      INSERT INTO users VALUES(1,'QA','USER','ACTIVE'),(2,'reset','USER','ACTIVE');
      CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,is_active INTEGER,card_status TEXT);
      INSERT INTO cards_effective_v1210 VALUES('S1','스타','SUPERSTAR',1,'PUBLIC'),('F1','일반','FUR',1,'PUBLIC');
      CREATE TABLE user_cards(user_id BIGINT,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,breakthrough_fail_count INTEGER,first_obtained_at TEXT,last_obtained_at TEXT);
      INSERT INTO user_cards VALUES(1,'S1',3,11,0,'2026-09-06','2026-09-06'),(2,'S1',0,0,0,'2026-09-06','2026-09-06'),(1,'F1',99,0,0,'2026-09-06','2026-09-06');
      CREATE TABLE draw_logs(user_id BIGINT,card_id TEXT,is_new INTEGER,created_at TEXT);
      INSERT INTO draw_logs VALUES(1,'S1',1,'2026-09-06'),(1,'S1',0,'2026-09-06');
      CREATE TABLE card_material_logs_v1802(id BIGINT,user_id BIGINT,card_id TEXT,grade TEXT,level INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,created_at TEXT);
      INSERT INTO card_material_logs_v1802 VALUES(1,1,'S1','SUPERSTAR',10,-2,3,'SUPERSTAR_HIGH_BREAKTHROUGH_SUCCESS','2026-09-06');
      CREATE TABLE admin_logs(id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);
      INSERT INTO admin_logs VALUES(1,'CARDS_RESET','USER','2','{}','{}','2026-09-06');
      CREATE TABLE superstar_pack_receipts_v1(request_id TEXT PRIMARY KEY,user_id BIGINT,status TEXT,outcome TEXT,card_id TEXT,cost BIGINT,response_json TEXT,created_at TEXT,updated_at TEXT);
      INSERT INTO superstar_pack_receipts_v1 SELECT 'r'||lpad(i::text,5,'0'),1,'COMPLETED','WIN','S1',300000000,'{}','2026-09-06','2026-09-06' FROM generate_series(1,501) i;
      CREATE TABLE superstar_pack_debits_v1(request_id TEXT PRIMARY KEY,user_id BIGINT,cost BIGINT,created_at TEXT);
      INSERT INTO superstar_pack_debits_v1 VALUES('r00001',1,300000000,'2026-09-06');
    `);
    const queries=[];
    const client={async query(input){const sql=typeof input==='string'?input:input.text;queries.push(sql);const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
    const env={DB:new __postgresCompatTest.PostgresD1Database(client)},deps={requirePermission:async()=>({id:1,role:'OWNER'}),json:(body,status=200)=>({body,status})};
    const call=query=>handleSuperstarDuplicateAudit({env,deps,request:new Request(`https://qa.test/api/admin/superstar-duplicates${query||''}`)});
    const report=await call();assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.body.inventory.length,2);assert.deepEqual(report.body.summary,{owners:1,copies:3,duplicateCopies:2});
    assert.equal(report.body.materialLogs[0].change_amount,-2);assert.equal(report.body.adminLogs[0].action_type,'CARDS_RESET');
    const first=await call('?section=receipts');assert.equal(first.body.receipts.length,500);assert.equal(first.body.nextCursor,'r00500');assert.equal(Number(first.body.receipts[0].debit_cost),300000000);
    const second=await call(`?section=receipts&cursor=${first.body.nextCursor}`);assert.equal(second.body.receipts.length,1);assert.equal(second.body.nextCursor,null);
    assert.equal((await call('?section=receipts&cursor=bad%27sql')).status,400);assert.equal((await call('?section=invalid')).status,400);
    assert.ok(queries.every(sql=>/^SELECT\b/i.test(sql.trim())),queries.join('\n'));
  }finally{await pg.close();}
});
