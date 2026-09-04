import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const server=await read('functions/api/[[path]].js');
const resolveTier=server.split('\n').find(line=>line.startsWith('function resolveTier('));
const settingsCode=server.slice(server.indexOf('function defaultPvpSettings()'),server.indexOf('async function readPvpSettings'));
const rewardCode=server.split('\n').find(line=>line.startsWith('function pvpSettlementRewardFor('));
const roleCode=server.split('\n').find(line=>line.startsWith('const PVP_RANKED_ROLE_SQL='));
const {clean,resolve,rank,reward}=Function(`${resolveTier}\n${roleCode}\n${settingsCode}\n${rewardCode}\nreturn {clean:cleanPvpSettings,resolve:resolvePvpTier,rank:pvpChallengerRank,reward:pvpSettlementRewardFor};`)();

test('챌린저는 점수 절대값이 아닌 정확히 1~10위만 해당한다',()=>{
  const settings=clean();
  for(const score of [0,1000,2500,1e9])for(let place=1;place<=10;place++)assert.equal(resolve(score,settings,place).id,'challenger');
  for(const place of [0,11,100,-1,1.5,NaN,Infinity])assert.notEqual(resolve(1e9,settings,place).id,'challenger');
  assert.equal(resolve(1100,settings,11).id,'silver');
});
test('설정으로 인원·점수 조건을 바꿀 수 없고 기존 최상위 보상을 안전하게 이어받는다',()=>{
  const tiers=[{id:'grandmaster',min:2500,rewardCoin:3e9,rewardShards:870},{id:'challenger',min:9999}];
  const settings=clean({tiers,challengerTier:{rankLimit:99,min:1}});
  assert.equal(settings.challengerTier.rankLimit,10);
  assert.equal(settings.challengerTier.rewardCoin,3e9);
  assert.equal(settings.challengerTier.rewardShards,870);
  assert.equal(settings.challengerTier.min,undefined);
  assert.ok(!settings.tiers.some(t=>t.id==='challenger'));
  const custom=clean({challengerTier:{rewardCoin:1_500_000_000,rewardShards:900}});
  assert.equal(custom.challengerTier.rewardCoin,1_500_000_000);
  assert.equal(custom.challengerTier.rewardShards,900);
});
test('실제 SQL: 동점이어도 10명만, OWNER·정지·밴 유저 제외 및 순위 교체',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT,banned_until TEXT); CREATE TABLE pvp_profiles(user_id INTEGER PRIMARY KEY,season_score INTEGER,highest_score INTEGER,wins INTEGER,losses INTEGER);');
    for(let id=1;id<=14;id++){
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,'동점',id===1?'OWNER':'USER',id===2?'BLOCKED':'ACTIVE',id===3?'2999-01-01':null);
      db.prepare('INSERT INTO pvp_profiles VALUES(?,?,?,?,?)').run(id,1000,10000,1,0);
    }
    const env={DB:{prepare:sql=>({all:async()=>({results:db.prepare(sql).all()})})}};
    assert.equal(await rank(env,1),0);assert.equal(await rank(env,2),0);assert.equal(await rank(env,3),0);
    assert.equal(await rank(env,4),1);assert.equal(await rank(env,13),10);assert.equal(await rank(env,14),0);
    db.prepare('UPDATE pvp_profiles SET season_score=2000 WHERE user_id=14').run();
    assert.equal(await rank(env,14),1);assert.equal(await rank(env,13),0);
  }finally{db.close();}
});
test('정산은 최종 순위로 챌린저 티어 1개만 지급하고 순위 보상을 합산한다',()=>{
  const settings=clean({challengerTier:{rewardCoin:8e8,rewardShards:800}});
  const top=reward({highest_score:1,final_rank:10},settings,false,false);
  assert.equal(top.tier.id,'challenger');assert.equal(top.tierCoin,8e8);assert.equal(top.rankCoin,12000);
  const outside=reward({highest_score:3000,final_rank:11},settings,false,false);
  assert.equal(outside.tier.id,'grandmaster');assert.equal(outside.tierCoin,20000);
  const claimed=reward({highest_score:3000,final_rank:1},settings,true,true);
  assert.equal(claimed.tierCoin+claimed.rankCoin+claimed.tierShards+claimed.rankShards,0);
});
test('시즌 정산 칭호 SQL은 챌린저★★★★를 1회 지급하며 다음 시즌 만료를 기록한다',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('CREATE TABLE pvp_season_title_grants_v1671(settlement_id INTEGER,user_id INTEGER,title_id INTEGER,season_key TEXT,expires_at TEXT,PRIMARY KEY(settlement_id,user_id,title_id)); CREATE TABLE pvp_season_settlement_ranks(settlement_id INTEGER,user_id INTEGER,tier_id TEXT); CREATE TABLE character_titles(id INTEGER PRIMARY KEY,code TEXT);');
    db.exec("INSERT INTO character_titles VALUES(1,'TITLE_RANKED_CHALLENGER'),(2,'TITLE_RANKED_GAMBLER'),(3,'TITLE_RANKED_DUELIST'); INSERT INTO pvp_season_settlement_ranks VALUES(7,100,'challenger'),(7,101,'grandmaster'),(7,102,'master'),(7,103,'diamond');");
    const query=server.match(/`(INSERT OR IGNORE INTO pvp_season_title_grants_v1671\([\s\S]*?)`\)\.bind/)[1];
    const stmt=db.prepare(query),args=['season-x','2026-09-10 12:00:00','TITLE_RANKED_GAMBLER','TITLE_RANKED_DUELIST',7];
    stmt.run(...args);stmt.run(...args);
    const rows=db.prepare('SELECT * FROM pvp_season_title_grants_v1671 ORDER BY user_id').all();
    assert.equal(rows.length,3);assert.equal(rows[0].title_id,1);assert.equal(rows[0].expires_at,args[1]);
    assert.match(server,/VALUES\('TITLE_RANKED_CHALLENGER','챌린저★★★★'/);
    assert.match(server,/DELETE FROM user_character_titles WHERE source_type='PVP_SEASON_RANKED'/);
  }finally{db.close();}
});
test('투명 원화와 저자극 칭호·WebGL 격리 계약',async()=>{
  const [css,fx,app,admin]=await Promise.all([read('css/ranked-challenger-v2032.css'),read('js/ranked-challenger-fx-v2032.src.js'),read('js/app.js'),read('admin/admin-v1276.js')]);
  const art=sharp(new URL('../assets/ui/tiers/challenger-v2032.png',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'));
  const metadata=await art.metadata();assert.ok(metadata.hasAlpha);assert.ok(metadata.width>=1024);
  const {data}=await art.ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(data[3],0);
  assert.match(css,/color:#83c9ef!important/);assert.match(css,/text-shadow:0 1px 1px #040c12/);
  assert.match(fx,/preference:'webgl'/);assert.match(fx,/prefers-reduced-motion/);assert.match(fx,/IntersectionObserver/);
  assert.doesNotMatch(fx,/BattleEngine|project-v-pixi-battle|battle-v3-live/);
  assert.match(app,/challengerTier\?/);assert.match(admin,/pvpChallengerCoin/);assert.match(admin,/challengerTier:\{rewardCoin/);
});
test('실제 보상 화면은 챌린저 점수를 NaN으로 표시하지 않고 시즌 순위를 안내한다',async()=>{
  const app=await read('js/app.js');
  const source=app.slice(app.indexOf('function rankedSeasonRewardHtml('),app.indexOf('async function renderPvpTab('));
  const render=Function('escapeHtml',source+';return rankedSeasonRewardHtml;')(String);
  const settings=clean(),html=render({highestTier:settings.challengerTier},settings);
  assert.doesNotMatch(html,/NaN|undefined/);
  assert.match(html,/class="challenger-reward-row"/);
  assert.match(html,/시즌 최종 1~10위/);
  assert.match(html,/challenger-title-stars/);
});
