import test from 'node:test';import assert from 'node:assert/strict';
import {emptyAccount} from '../shared/season-s1.mjs';
import {addImmortal,socketRune,itemRuneBonus,publicItemRunes,RUNE_CATALOG,RUNE_TYPE} from '../shared/character-runes.mjs';
import {seasonMutation,seasonStatus,seasonBonus,seasonAccount} from '../functions/_season_s1.js';
import {seasonFixture} from './helpers/season-s1-db.mjs';
const user={id:4242},req=extra=>({requestId:crypto.randomUUID(),...extra}),key=i=>RUNE_TYPE+':'+i;
test('physical copies of one type add up once each; moving or replacing a rune never duplicates it',()=>{
 let state=emptyAccount();for(let i=0;i<5;i++){const id=addImmortal(state,i<2);state=socketRune(state,{instanceId:101+i,code:id});}
 assert.equal(addImmortal(state),null);const ids=[101,102,103,104,105,105];assert.equal(itemRuneBonus(state,'PVE',ids).attackBp,4400);assert.equal(itemRuneBonus(state,'PVP',ids).hpBp,4400);
 state=socketRune(state,{instanceId:105,code:key(1)});assert.equal(state.itemRunes[101],undefined);assert.equal(itemRuneBonus(state,'PVE',ids).attackBp,3600);
 assert(state.owned[key(5)]);state=socketRune(state,{instanceId:105,code:null});assert.equal(state.owned[key(1)].upgraded,true);
 const r=publicItemRunes(state,ids,ids);assert.equal(new Set(r.catalog.map(x=>x.typeCode)).size,1);assert.equal(r.activeCount,3);
});
test('common socket can accept a rune from another content catalog',()=>{
 const spec={...RUNE_CATALOG[0],code:'OTHER',mode:'PVE',effects:undefined,effect:{stat:'attackBp',base:100,upgraded:250}};
 const s=socketRune({...emptyAccount(),owned:{OTHER:{mode:'PVE',kind:'RUNE',upgraded:true}}},{instanceId:101,code:'OTHER'},[spec]);assert.equal(itemRuneBonus(s,'PVE',[101,101],[spec]).attackBp,250);assert.equal(itemRuneBonus(s,'PVP',[101],[spec]).hpBp,0);
});
for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': five copies, permanent upgrades, worn-only effects, no suit socket, stable receipts and ownership checks',async t=>{
 const f=await seasonFixture(t,{postgres}),put=body=>seasonMutation(f.env,user,'socket',body),craft=body=>seasonMutation(f.env,user,'craft',body),bonus=()=>seasonBonus(f.env,user.id,'PVE');
 // Reach the first milestone; one optional forged copy accelerates the same five-copy collection.
 for(let i=0;i<30;i++){f.setClock(f.start+(1+Math.floor(i/4))*86400000);await f.award('PVP',{won:false,score:700});}
 const single=req({recipeId:'COMMON_CORE'});const forged=await craft(single);assert.equal(forged.reward.copyId,key(2));assert.equal((await craft(single)).replayed,true);
 for(let i=30;i<100;i++){f.setClock(f.start+(1+Math.floor(i/4))*86400000);await f.award('PVP',{won:false,score:700});}assert.equal((await seasonStatus(f.env,user.id)).common.owned,5);
 await assert.rejects(craft(req({recipeId:'COMMON_CORE'})),/한도/);await assert.rejects(put(req({instanceId:107,code:key(1)})),/배틀슈트/);await assert.rejects(put(req({instanceId:107,code:null})),/배틀슈트/);
 await f.DB.prepare('INSERT INTO user_equipment_instances(id,user_id,equipment_id) VALUES(999,7,101)').run();await assert.rejects(put(req({instanceId:999,code:key(1)})),/보유한 일반 장비/);
 const first=req({instanceId:101,code:key(1)});f.setFailure('UPDATE season_s1_accounts');await assert.rejects(put(first));f.setFailure('');assert.equal((await bonus()).attackBp,0);
 f.afterCommit(()=>{throw Error('LOST_ACK');});assert.equal((await put(first)).replayed,true);f.afterCommit(null);
 for(let i=2;i<=5;i++)await put(req({instanceId:100+i,code:key(i)}));assert.equal((await bonus()).attackBp,4000);assert.equal((await seasonStatus(f.env,user.id)).runes.activeCount,5);
 await assert.rejects(put({...first,instanceId:105}),/같은 요청/);
 for(let i=1;i<=5;i++){const body=req({recipeId:'COMMON_UPGRADE',copyId:key(i)});await craft(body);assert.equal((await craft(body)).replayed,true);}
 assert.equal((await bonus()).attackBp,5000);assert.equal((await seasonBonus(f.env,user.id,'PVP')).hpBp,5000);
 await put(req({instanceId:106,code:key(1)}));assert.equal((await bonus()).attackBp,4000);assert.equal((await put(first)).replayed,true);assert.equal((await bonus()).attackBp,4000);
 await f.DB.prepare("UPDATE user_equipment_loadout SET instance_id=106 WHERE user_id=4242 AND slot='WEAPON'").run();assert.equal((await bonus()).attackBp,5000);
 await f.DB.prepare('UPDATE character_equipment_items SET is_active=0 WHERE id=106').run();assert.equal((await bonus()).attackBp,4000);assert.equal((await seasonStatus(f.env,user.id)).runes.placements[106],undefined);
 await f.DB.prepare('DELETE FROM user_equipment_instances WHERE id=102').run();assert.equal((await bonus()).attackBp,3000);
 f.setClock(f.start+42*86400000);await seasonMutation(f.env,user,'settle',req({}));assert.equal((await bonus()).attackBp,3000);assert.equal(Object.keys((await seasonAccount(f.env,user.id)).state.owned).length,5);
});
