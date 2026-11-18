import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import * as policy from '../shared/pvp-deck-policy-v1.mjs';
const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const between=(start,end)=>api.slice(api.indexOf(start),api.indexOf(end,api.indexOf(start)));
const cards=['ZENITH','ZENITH','SUPERSTAR','ICON','ICON','MA','FUR','PRESTIGE','LIMITED','C'].map((rarity,i)=>({id:String(i+1),rarity,title:rarity}));
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec('CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power INTEGER,image_url TEXT,focus_x INTEGER,focus_y INTEGER,member_id INTEGER); CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER); CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO members VALUES(1,\'fixture\');');
 for(const c of cards){db.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?,\'ATTACK\',100,\'\',50,50,1)').run(c.id,c.title,c.rarity);db.prepare('INSERT INTO user_cards VALUES(1,?,1,0)').run(c.id);}
 let queries=0;const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){queries++;return db.prepare(sql).get(...args);},async all(){queries++;return {results:db.prepare(sql).all(...args)};}};}}};
 const ids=['1','2','3','4','5'],state={attack:ids,defense:ids,pve:['6','7','8','9','10']};
 const deps={...policy,PRESTIGE_DECK_LIMIT:2,FUR_DECK_LIMIT:2,ZENITH_DECK_LIMIT:2,SUPERSTAR_DECK_LIMIT:1,ICON_DECK_LIMIT:2,superstarDeckCount:xs=>xs.filter(c=>c.rarity==='SUPERSTAR').length,iconDeckCount:xs=>xs.filter(c=>c.rarity==='ICON').length,pvpDeckCards:async(_e,_u,defense)=>state[defense?'defense':'attack'],pveDeckCards:async()=>state.pve};
 const functions=Function('deps',`with(deps){${between('async function deckGradeCounts','async function deckSynergySettings')}\n${between('async function pvpDeckSnapshot(','async function pvpEnergySnapshot(')}\nreturn {validateDeckGradeLimits,pvpDeckSnapshot,pvpDeckSnapshotByIds,pveDeckSnapshot};}`)(deps);
 return {env,state,...functions,queries:()=>queries};
}
test('only the three ordinary card grades are accepted, with no implicit unknown grade admission',()=>{
 assert(policy.pvpDeckGradeAllowed(cards.slice(0,5)));
 for(const rarity of ['MA','SSR','UR','HR','SR','R','U','C','FUR','PRESTIGE','LIMITED','UNKNOWN','',null])assert(!policy.pvpCardGradeAllowed({rarity}),String(rarity));
 assert(policy.pvpCardGradeAllowed({grade:'zenith'}));
 assert(!policy.pvpDeckGradeAllowed(cards.slice(0,4)));
});
test('actual catalog aggregate rejects each lower grade for PVP in one query and keeps PVE unchanged',async t=>{
 const f=fixture(t);await f.validateDeckGradeLimits(f.env,f.state.attack,'랭크전 덱','PVP');
 for(const c of cards.slice(5)){const n=f.queries();await assert.rejects(f.validateDeckGradeLimits(f.env,['1','2','3','4',c.id],'랭크전 덱','PVP'),e=>e.code==='PVP_MINIMUM_GRADE'&&e.status===400);assert.equal(f.queries()-n,1);}
 await f.validateDeckGradeLimits(f.env,f.state.pve,'전투 덱','PVE');
});
test('saved attack, defense and explicit-id PVP snapshots reject lower grades without fallback; PVE still loads',async t=>{
 const f=fixture(t);assert.equal((await f.pvpDeckSnapshot(f.env,1)).length,5);
 f.state.attack=['1','2','3','4','6'];assert.deepEqual(await f.pvpDeckSnapshot(f.env,1),[]);
 assert.equal((await f.pvpDeckSnapshot(f.env,1,true)).length,5);
 f.state.defense=f.state.pve;assert.deepEqual(await f.pvpDeckSnapshot(f.env,1,true),[]);
 assert.deepEqual(await f.pvpDeckSnapshotByIds(f.env,1,f.state.pve),[]);
 assert.equal((await f.pveDeckSnapshot(f.env,1)).length,5);
});
test('PVP save calls the server restriction before the atomic save',()=>{
 const start=api.indexOf("if(path==='pvp/deck'&&request.method==='POST')"),body=api.slice(start,start+7000);
 assert(body.indexOf("validateDeckGradeLimits(env,ids,'랭크전 덱','PVP')")>=0);
 assert(body.indexOf("validateDeckGradeLimits(env,ids,'랭크전 덱','PVP')")<body.indexOf('savePvpDeckWithMagic('));
});
