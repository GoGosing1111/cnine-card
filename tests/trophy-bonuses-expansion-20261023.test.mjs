import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TROPHY_CATALOG} from '../js/player-card-model-v2052.js';
import {ZERO_REWARD_BONUSES} from '../shared/collection-bonuses-v1.mjs';
import {emptyTrophyBonuses,validateTrophyBonuses,trophyBonusProjection,TROPHY_BONUSES_KEY} from '../shared/trophy-bonuses-v1.mjs';
import {readTrophyBonusSettings,readCollectionBonuses} from '../functions/_collection_bonuses.js';
import {handleTrophyBonusCms} from '../functions/_trophy_bonus_cms.js';

const additions=['BLUE_EMPIRE_20','LIMITED_EDITION_80','LOYAL_SERVICE_POST_20'];
const base=['DUO_CHALLENGER','CLAN_CHAMPION','CHALLENGER_STREAK_3','RANKED_CHAMPION','CLAN_CHAMPIONS_TROPHY','PREDICTION_STAKE_300T','CITY_TOP_25','LICH_KING_CLEAR_1000'];
function legacyDocument(count){
 const allowed=new Set([...base,...(count===9?['WORLD_RAID_CLEAR_5000']:[])]);
 return {version:1,trophies:emptyTrophyBonuses().trophies.filter(t=>allowed.has(t.code)).map((t,i)=>({...t,rewardBonuses:{dropPercent:i+.25,accountXpPercent:i+.5,coinPercent:i+.75}}))};
}
function fixture(t,state){
 const sql=new DatabaseSync(':memory:'),trace=[];
 sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 if(state)sql.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(TROPHY_BONUSES_KEY,JSON.stringify(state));
 t.after(()=>sql.close());
 const DB={prepare(source){return {source,args:[],bind(...args){return {...this,args};},async first(){trace.push(source);return sql.prepare(source).get(...this.args)||null;},async all(){trace.push(source);return {results:sql.prepare(source).all(...this.args)};},async run(){trace.push(source);const result=sql.prepare(source).run(...this.args);return {meta:{changes:Number(result.changes)}};}};}};
 const env={DB},raw=()=>sql.prepare('SELECT value FROM app_meta WHERE key=?').get(TROPHY_BONUSES_KEY)?.value;
 const cms=body=>handleTrophyBonusCms({path:'admin/trophy-bonuses',request:new Request('https://qa.test/api/admin/trophy-bonuses',{method:body?'PATCH':'GET',headers:{origin:'https://qa.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,deps:{requirePermission:async()=>({id:9,role:'OWNER'}),json:(value,status=200)=>Response.json(value,{status})}});
 return {sql,trace,env,raw,cms};
}

test('three new trophy defaults are zero and each earned type contributes its configured bonus once',()=>{
 const document=emptyTrophyBonuses();assert.equal(document.trophies.length,12);
 assert.deepEqual(additions.map(code=>TROPHY_CATALOG.find(t=>t.code===code)?.name),['푸른제국','리미티드 에디션','충신 무공훈장']);
 for(const code of additions)assert.deepEqual(document.trophies.find(t=>t.code===code).rewardBonuses,ZERO_REWARD_BONUSES);
 const honors=Object.fromEntries(additions.map(code=>[code,{count:25,progress:99,goal:20}]));
 honors.LIMITED_EDITION_80={count:1,progress:8,goal:8,total:10,acquiredAt:'2026-10-23T00:00:00Z'};
 assert.deepEqual(trophyBonusProjection(document,honors).totals,ZERO_REWARD_BONUSES);
 additions.forEach(code=>{document.trophies.find(t=>t.code===code).rewardBonuses={dropPercent:1.25,accountXpPercent:2.5,coinPercent:3.75};});
 const result=trophyBonusProjection(document,honors);
 assert.deepEqual(result.totals,{dropPercent:3.75,accountXpPercent:7.5,coinPercent:11.25});
 assert(result.trophies.filter(t=>additions.includes(t.code)).every(t=>t.owned&&t.effect.enabled));
 const limited=result.trophies.find(t=>t.code==='LIMITED_EDITION_80');
 for(const key of ['count','progress','goal','total','acquiredAt'])assert.equal(limited[key],honors.LIMITED_EDITION_80[key],key);
});

for(const count of [8,9])test(`legacy ${count}-trophy read preserves every saved rate and record; strict CMS save requires all current codes`,async t=>{
 const legacy=legacyDocument(count),snapshot=structuredClone(legacy),state={revision:7,document:legacy,audit:[]},f=fixture(t,state),original=f.raw();
 const read=await readTrophyBonusSettings(f.env),get=await f.cms();assert.equal(get.status,200);
 const fetched=await get.json();assert.equal(fetched.revision,7);assert.equal(fetched.catalog.length,12);
 assert.deepEqual(fetched.document,read.document);assert.equal(read.document.trophies.length,12);
 for(const row of legacy.trophies)assert.deepEqual(read.document.trophies.find(t=>t.code===row.code),row);
 for(const row of read.document.trophies.filter(t=>!legacy.trophies.some(old=>old.code===t.code)))assert.deepEqual(row.rewardBonuses,ZERO_REWARD_BONUSES);
 assert.deepEqual(legacy,snapshot);assert.equal(f.raw(),original);assert(f.trace.every(s=>/^SELECT\b/.test(s)));
 assert.throws(()=>validateTrophyBonuses(legacy));
 for(const code of additions){
  const incomplete=structuredClone(read.document);incomplete.trophies=incomplete.trophies.filter(t=>t.code!==code);
  const response=await f.cms({expectedRevision:7,document:incomplete,requestId:crypto.randomUUID()});assert.equal(response.status,400,code);assert.equal(f.raw(),original);
 }
 assert(f.trace.every(s=>/^SELECT\b/.test(s)),'Rejected saves cannot update persisted settings');
 const response=await f.cms({expectedRevision:7,document:read.document,requestId:crypto.randomUUID()});assert.equal(response.status,200);
 const saved=JSON.parse(f.raw());assert.equal(saved.revision,8);assert.equal(saved.document.trophies.length,12);
 for(const row of legacy.trophies)assert.deepEqual(saved.document.trophies.find(t=>t.code===row.code),row);
 for(const code of additions)assert.deepEqual(saved.document.trophies.find(t=>t.code===code).rewardBonuses,ZERO_REWARD_BONUSES);
});

test('legacy normalization still rejects missing original trophies, unknown codes, duplicates and malformed rates',()=>{
 const original=legacyDocument(9);
 for(const code of base){const bad=structuredClone(original);bad.trophies=bad.trophies.filter(t=>t.code!==code);assert.throws(()=>validateTrophyBonuses(bad,{allowLegacy:true}),code);}
 const duplicate=structuredClone(original);duplicate.trophies.push(structuredClone(duplicate.trophies[0]));assert.throws(()=>validateTrophyBonuses(duplicate,{allowLegacy:true}));
 const unknown=structuredClone(original);unknown.trophies.push({code:'UNKNOWN',rewardBonuses:{...ZERO_REWARD_BONUSES}});assert.throws(()=>validateTrophyBonuses(unknown,{allowLegacy:true}));
 const badRate=structuredClone(original);badRate.trophies[0].rewardBonuses.coinPercent=-1;assert.throws(()=>validateTrophyBonuses(badRate,{allowLegacy:true}));
 assert.throws(()=>validateTrophyBonuses({version:1,trophies:[]},{allowLegacy:true}));
});

test('zero configured defaults preserve the reward fast path without reading any milestone source or writing state',async t=>{
 const f=fixture(t,{revision:1,audit:[],document:emptyTrophyBonuses()}),original=f.raw();
 const rewards=await readCollectionBonuses(f.env,7);
 assert.deepEqual(rewards.totals,ZERO_REWARD_BONUSES);assert.deepEqual(rewards.trophies,[]);assert.equal(f.raw(),original);
 assert.equal(f.trace.length,1);assert.match(f.trace[0],/^SELECT key,value FROM app_meta/);
});
