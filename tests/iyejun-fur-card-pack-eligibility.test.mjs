import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const targetId='CN-346F8DB0DEB84D41';
function section(start,end){
  const from=source.indexOf(start),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`Missing draw function section: ${start}`);
  return source.slice(from,to);
}
const code=[
  source.match(/^const DRAW_RARITIES=.*$/m)[0],
  source.match(/^const ORDER=.*$/m)[0],
  source.match(/^const LIMITED_DRAW_PACKS=.*$/m)[0],
  section('const RANDOM_DRAW_EXCLUDED_KEYWORDS=','const SHARD_REWARD='),
  section('function weightedPick(','async function liveOperationAlerts('),
  section('async function queryDrawContext(','async function loadDrawContext('),
  section('function drawPoolFromContext(','function drawOneWithPityFromContext('),
  '({isRandomDrawExcluded,queryDrawContext,drawOneFromContext})'
].join('\n');
const runtime=vm.runInNewContext(code);

function fixture(t){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  db.exec(`
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT,is_active INTEGER);
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,member_id INTEGER,title TEXT,rarity TEXT,image_url TEXT DEFAULT '',focus_x INTEGER DEFAULT 50,focus_y INTEGER DEFAULT 50,is_active INTEGER DEFAULT 1,card_status TEXT DEFAULT 'PUBLIC',draw_weight REAL DEFAULT 1,limited_total INTEGER,issued_count INTEGER DEFAULT 0);
    CREATE TABLE card_pack_cards(pack_id TEXT,card_id TEXT);
    CREATE TABLE card_pack_rates(pack_id TEXT,rarity TEXT,rate REAL);
    INSERT INTO members VALUES(111,'이예준',1),(112,'다른멤버',1);
    INSERT INTO cards_effective_v1210(id,member_id,title,rarity,draw_weight) VALUES
      ('${targetId}',111,'철구','FUR',0.01),
      ('other-cheolgu',111,'철구 과거 카드','FUR',100);
  `);
  for(const id of ['premium','pickup','ultimate'])db.prepare('INSERT INTO card_pack_rates VALUES(?,?,?)').run(id,'FUR',100);
  const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),all:async()=>({results:db.prepare(sql).all(...values)})});
  return {db,env:{DB:{prepare:statement,batch:statements=>Promise.all(statements.map(s=>s.all()))}}};
}
const pack=id=>({id,allowed_rarities:'["FUR"]',pickup_member_id:null,pickup_multiplier:1});

test('이예준 FUR 0.01 가중치 카드를 세 운영 카드팩의 실제 추첨 후보로 선택한다',async t=>{
  const {env}=fixture(t);
  for(const id of ['premium','pickup','ultimate']){
    const context=await runtime.queryDrawContext(env,pack(id));
    assert.deepEqual(Array.from(context.poolsByGrade.get('FUR')||[],c=>c.id),[targetId]);
    const drawn=runtime.drawOneFromContext(context,pack(id));
    assert.equal(drawn.id,targetId);
    assert.equal(drawn.draw_weight,0.01);
  }
});

test('다른 철구 카드와 이름만 같은 카드는 계속 제외된다',()=>{
  for(const card of [
    {id:'other-cheolgu',name:'이예준',title:'철구'},
    {id:'imitation',name:'철 구',title:'신규'},
    {name:'이예준',title:'철구'}
  ])assert.equal(runtime.isRandomDrawExcluded(card),true);
  assert.equal(runtime.isRandomDrawExcluded({id:'ordinary',name:'다른멤버',title:'일반 FUR'}),false);
});

test('예외 카드는 CMS 활성·공개·가중치·한정수량·멤버 활성 조건을 우회하지 않는다',async t=>{
  const {db,env}=fixture(t);
  for(const update of ["is_active=0","card_status='INACTIVE'","card_status='RETIRED'","draw_weight=0","limited_total=1"]){
    db.prepare(`UPDATE cards_effective_v1210 SET ${update} WHERE id=?`).run(targetId);
    const context=await runtime.queryDrawContext(env,pack('premium'));
    assert.equal((context.poolsByGrade.get('FUR')||[]).length,0,update);
    db.prepare("UPDATE cards_effective_v1210 SET is_active=1,card_status='PUBLIC',draw_weight=0.01,limited_total=NULL WHERE id=?").run(targetId);
  }
  db.prepare('UPDATE members SET is_active=0 WHERE id=111').run();
  const context=await runtime.queryDrawContext(env,pack('premium'));
  assert.equal((context.poolsByGrade.get('FUR')||[]).length,0);
});

test('팩별 명시적 카드 목록을 계속 준수한다',async t=>{
  const {db,env}=fixture(t);
  db.prepare('INSERT INTO card_pack_cards VALUES(?,?)').run('premium','other-cheolgu');
  let context=await runtime.queryDrawContext(env,pack('premium'));
  assert.equal((context.poolsByGrade.get('FUR')||[]).length,0);
  db.prepare('INSERT INTO card_pack_cards VALUES(?,?)').run('premium',targetId);
  context=await runtime.queryDrawContext(env,pack('premium'));
  assert.equal(runtime.drawOneFromContext(context,pack('premium')).id,targetId);
});
