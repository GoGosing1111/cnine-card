import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const api=read('functions/api/[[path]].js'),app=read('js/app.js'),pve=read('js/pve-command-v2-live.js');

// Execute the production helpers, not copies of the arithmetic/validation under test.
export function functionSource(source,name){
  const match=new RegExp(`^(?:async )?function ${name}\\(`,'m').exec(source);
  assert.ok(match,`${name} must exist`);
  return source.slice(match.index).split(/\r?\n(?=(?:async )?function |const |let )/)[0];
}
function constantSource(source,name){
  const line=source.match(new RegExp(`^const ${name}\\s*=.*;$`,'m'))?.[0];
  assert.ok(line,`${name} must exist`);
  return line;
}
function server(){
  const context=vm.createContext({
    normalizeBattleEngineSettings:x=>x||{},normalizeNightmareSettings:x=>x||{},normalizeApocalypseSettings:x=>x||{},normalizeUltimateRequiredGrade:x=>x,
    async pvpDeckCards(env,id){return JSON.parse(env.sqlite.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').get(id)?.card_ids||'[]')},
    async pveDeckCards(env,id){return JSON.parse(env.sqlite.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=?').get(id)?.card_ids||'[]')}
  });
  vm.runInContext([
    ...['BATTLE_POWER_DEFAULT','BATTLE_BREAKTHROUGH_DEFAULT','HIGH_BREAKTHROUGH_BONUS_DEFAULT','FAKER_CHAMPIONSHIP_CARD_ID','FAKER_FLAT_POWER_BONUS','PRESTIGE_DECK_LIMIT','FUR_DECK_LIMIT','ZENITH_DECK_LIMIT','SUPERSTAR_DECK_LIMIT'].map(n=>constantSource(api,n)),
    ...['defaultBattleSettings','cleanBattleSettingsPayload','cardPowerBase','breakthroughBonusPercent','cardBattlePower','superstarDeckCount','deckRulesContract','deckGradeCounts','validateDeckGradeLimits','pvpDeckSnapshot','pvpDeckSnapshotByIds','pveDeckSnapshot','pvpDefenseFormationPowers','raidDeckPower','riftDeckCardsInfo'].map(n=>functionSource(api,n))
  ].join('\n'),context);
  context.battleSettings=async()=>context.defaultBattleSettings();
  return context;
}
function client(){
  const context=vm.createContext({cards:[]});
  vm.runInContext([
    ...['FAKER_CHAMPIONSHIP_CARD_ID','FAKER_FLAT_POWER_BONUS','HIGH_BREAKTHROUGH_BONUS_FALLBACK','ZENITH_DECK_LIMIT','SUPERSTAR_DECK_LIMIT','DEFAULT_DECK_GRADE_LIMITS','DEFAULT_HEALER_PENALTIES'].map(n=>constantSource(app,n)),
    ...['clientBreakthroughBonusPercent','battleCardPower','deckGradeCount','normalizeDeckRules','deckGradeLimitViolation','deckGradeRuleLabel','deckGradeRuleSummaryHtml'].map(n=>functionSource(app,n))
  ].join('\n'),context);
  return context;
}
const plain=x=>JSON.parse(JSON.stringify(x));
const referencePower=(grade,level,cfg)=>{
  const high=Number(cfg.highBreakthroughBonus?.[grade]?.[level-11]);
  const percent=level>=11&&Number.isFinite(high)&&high>0?high:Number(cfg.breakthroughBonus[level]||0);
  return Math.floor(Number(cfg.powerByGrade[grade])*(1+percent/100));
};

test('all +0..13 levels: SUPERSTAR equals max(normal FUR, ZENITH) + exactly 10,000 on client and server',()=>{
  const s=server(),c=client();
  const configs=[
    s.defaultBattleSettings(),
    s.cleanBattleSettingsPayload({powerByGrade:{FUR:7400,ZENITH:6200,SUPERSTAR:1},highBreakthroughBonus:{FUR:[500,800,1000],ZENITH:[750,950,1300]}}),
    s.cleanBattleSettingsPayload({powerByGrade:{FUR:3101,ZENITH:7909,SUPERSTAR:999999},breakthroughBonus:[0,19,33,71,105,149,190,254,317,379,449],highBreakthroughBonus:{FUR:[1300,1800,2550],ZENITH:[700,901,1270]}})
  ];
  for(const cfg of configs){
    for(let level=0;level<=13;level++){
      const expected=Math.max(referencePower('FUR',level,cfg),referencePower('ZENITH',level,cfg))+10000;
      for(const saved of [0,7000,15500,999999]){
        assert.equal(s.cardBattlePower({id:'ss',rarity:'SUPERSTAR',base_power:saved},level,cfg),expected,`server +${level}`);
        assert.equal(c.battleCardPower({id:'ss',grade:'SUPERSTAR',basePower:saved},{breakthroughs:{ss:level}},cfg),expected,`client +${level}`);
      }
    }
    // A stale independently edited SUPERSTAR power/bonus cannot inflate the derived result.
    cfg.powerByGrade.SUPERSTAR=999999;
    cfg.highBreakthroughBonus.SUPERSTAR=[999999,999999,999999];
    assert.equal(s.cardBattlePower({grade:'SUPERSTAR'},13,cfg),Math.max(referencePower('FUR',13,cfg),referencePower('ZENITH',13,cfg))+10000);
  }
});

test('default +0/+10/+11/+12/+13 values and derived CMS base are exact',()=>{
  const s=server(),cfg=s.defaultBattleSettings();
  assert.equal(cfg.powerByGrade.SUPERSTAR,15500);
  assert.deepEqual([0,10,11,12,13].map(lv=>s.cardBattlePower({grade:'SUPERSTAR'},lv,cfg)),[15500,40250,58000,74000,93200]);
  assert.equal(s.cleanBattleSettingsPayload({powerByGrade:{FUR:10000,ZENITH:6000,SUPERSTAR:42}}).powerByGrade.SUPERSTAR,20000);
  assert.equal(s.cardBattlePower({grade:'SUPERSTAR'},99,cfg),93200);
  assert.equal(s.cardBattlePower({grade:'SUPERSTAR'},-1,cfg),15500);
});

test('other grades, per-card FUR bases, Faker flat bonus and LIMITED caps are unchanged',()=>{
  const s=server(),c=client(),cfg=s.defaultBattleSettings();
  for(const grade of Object.keys(cfg.powerByGrade).filter(g=>g!=='SUPERSTAR')){
    for(let level=0;level<=13;level++){
      const card={id:'ordinary',grade,basePower:cfg.powerByGrade[grade]};
      let expected=referencePower(grade,level,cfg);
      if(grade==='LIMITED'&&level>=11){
        const prestige10=referencePower('PRESTIGE',10,cfg),limited10=referencePower('LIMITED',10,cfg);
        expected=Math.min(expected,prestige10,Math.floor(limited10+Math.max(0,prestige10-limited10)*(level-10)/3));
      }
      assert.equal(s.cardBattlePower(card,level,cfg),expected);
      assert.equal(c.battleCardPower(card,{breakthroughs:{ordinary:level}},cfg),expected);
    }
  }
  assert.equal(s.cardBattlePower({id:'CN-0B48C6FF8F9B4AC5',rarity:'FUR',base_power:3200},13,cfg),86200);
  assert.equal(s.cardBattlePower({rarity:'FUR',base_power:4000},13,cfg),104000);
});

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power INTEGER,image_url TEXT,focus_x INTEGER,focus_y INTEGER,member_id INTEGER);
    CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER);
    CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT);
    INSERT INTO members VALUES(1,'fixture');`);
  const fixtures=[['ss1','SUPERSTAR'],['ss2','SUPERSTAR'],['f1','FUR'],['f2','FUR'],['z1','ZENITH'],['z2','ZENITH'],['p1','PRESTIGE']];
  for(const [id,grade] of fixtures){
    db.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?,NULL,3200,NULL,50,50,1)').run(id,id,grade);
    for(const user of [1,2])db.prepare('INSERT INTO user_cards VALUES(?,?,1,13)').run(user,id);
  }
  const good=['ss1','f1','f2','z1','z2'],bad=['ss1','ss2','f1','z1','z2'];
  db.prepare('INSERT INTO pvp_decks VALUES(1,?)').run(JSON.stringify(good));
  db.prepare('INSERT INTO pvp_decks VALUES(2,?)').run(JSON.stringify(bad));
  const env={sqlite:db,DB:{prepare(sql){
    let args=[];
    const query={bind(...values){args=values;return query},
      async first(){return db.prepare(sql).get(...args)||null},
      async all(){if(/user_equipment_loadout|user_garage_loadout|user_title_loadout/.test(sql))return {results:[]};return {results:db.prepare(sql).all(...args)}}};
    return query;
  }}};
  return {db,env,good,bad};
}

test('shared SQL validator permits 0 or 1 SUPERSTAR, rejects 2 with actionable error, and never mutates owned cards/decks',async()=>{
  const s=server(),{db,env,good,bad}=database();
  try{
    const before=JSON.stringify(db.prepare('SELECT * FROM user_cards').all());
    assert.equal((await s.validateDeckGradeLimits(env,good,'PVE')).superstarCount,1);
    assert.equal((await s.validateDeckGradeLimits(env,['f1','f2','z1','z2','p1'],'PVP')).superstarCount,0);
    for(const scope of ['PVE','PVP','OWNER'])await assert.rejects(s.validateDeckGradeLimits(env,bad,scope),e=>e.status===400&&e.code==='SUPERSTAR_DECK_LIMIT'&&e.count===2&&e.limit===1&&/다시 저장/.test(e.message));
    assert.equal((await s.deckGradeCounts(env,[])).superstarCount,0);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM user_cards').all()),before);
    assert.equal(db.prepare('SELECT card_ids FROM pvp_decks WHERE user_id=2').get().card_ids,JSON.stringify(bad));
  }finally{db.close()}
});

test('legacy PVE/PVP/clan/territory snapshots cannot reuse two SUPERSTAR cards; order and valid decks stay intact',async()=>{
  const s=server(),{db,env,good,bad}=database();
  try{
    assert.deepEqual(plain(await s.pvpDeckSnapshot(env,1)).map(c=>c.id),good);
    assert.deepEqual(plain(await s.pvpDeckSnapshot(env,2)),[]);
    assert.deepEqual(plain(await s.pvpDeckSnapshot(env,2,true)),[]);
    assert.deepEqual(plain(await s.pvpDeckSnapshotByIds(env,1,good)).map(c=>c.id),good);
    assert.deepEqual(plain(await s.pvpDeckSnapshotByIds(env,2,bad)),[]);
    assert.deepEqual(plain(await s.pveDeckSnapshot(env,2)),[]);
    assert.deepEqual(plain(await s.riftDeckCardsInfo(env,2,bad)),[]);
    await assert.rejects(s.raidDeckPower(env,2,bad),e=>e.code==='SUPERSTAR_DECK_LIMIT');
  }finally{db.close()}
});

test('ranked matchmaking batch excludes invalid defenders before creating a match ticket',async()=>{
  const s=server(),{db,env}=database();
  try{
    const result=await s.pvpDefenseFormationPowers(env,[1,2],s.defaultBattleSettings());
    assert.equal(result.get(1).deckReady,true);
    assert.equal(result.get(2).deckReady,false);
    assert.ok(result.get(1).power>0);
  }finally{db.close()}
});

test('client defaults, stale cached contracts, counters and selection validation all enforce one SUPERSTAR',()=>{
  const s=server(),c=client();
  c.cards=[{id:'1',grade:'SUPERSTAR'},{id:'2',grade:'SUPERSTAR'},{id:'3',grade:'ZENITH'}];
  for(const rules of [{},{gradeLimits:{SUPERSTAR:5}},{grade_limits:{SUPERSTAR:0}},s.deckRulesContract('PVE'),s.deckRulesContract('PVP')]){
    assert.deepEqual(plain(c.normalizeDeckRules(rules).gradeLimits),{PRESTIGE:2,FUR:2,ZENITH:2,SUPERSTAR:1});
    assert.equal(c.deckGradeLimitViolation(['1','3'],rules),null);
    assert.deepEqual(plain(c.deckGradeLimitViolation(['1','2','3'],rules)),{grade:'SUPERSTAR',count:2,limit:1});
    assert.match(c.deckGradeRuleSummaryHtml(['1'],rules),/SUPERSTAR<\/b><em>1 \/ 1/);
  }
  assert.match(pve,/const grades = \['PRESTIGE', 'FUR', 'ZENITH', 'SUPERSTAR'\]/);
  assert.match(pve,/gradeLimits: \{ \.\.\.fallback\.gradeLimits, .*SUPERSTAR: 1 \}/);
  assert.match(read('css/pve-command-v2.css'),/\.pvev2-deck-rule-chips\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('PVE save, single battle, sweep and PVP preset save validate before spending or saving',()=>{
  for(const route of ["if(path==='battle/deck'&&request.method==='POST')","if(path==='battle/auto'&&request.method==='POST')","if(path==='battle/fight'&&request.method==='POST')","if(path==='pvp/deck'&&request.method==='POST')"]){
    const start=api.indexOf(route);
    assert.ok(start>=0,route);
    const end=api.indexOf("\n    if(path===",start+route.length),block=api.slice(start,end<0?undefined:end);
    assert.match(block,/await validateDeckGradeLimits\(env,ids,/);
  }
  assert.match(app,/hasLimit&&deckGradeCount\(battleState.deck,grade\)>=limit/);
  assert.match(app,/hasLimit&&deckGradeCount\(pvpState.deck,grade\)>=limit/);
});

test('CMS explains derived power and prevents direct SUPERSTAR overrides without altering frames',()=>{
  const cms=read('admin/superstar-admin-v1.js');
  assert.match(cms,/input\.readOnly=true/);
  assert.match(cms,/동일 강화 FUR·ZENITH 중 높은 전투력 \+10,000 · 덱 최대 1장/);
  assert.doesNotMatch(cms,/7,000|value="7000"/);
  assert.match(cms,/superstar-championship-frame-v1\.webp\?v=1-superstar-grade/);
  assert.match(app,/장비·고유효과 등의 보정은 별도로 적용됩니다/);
});
