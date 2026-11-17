import test from 'node:test';import assert from 'node:assert/strict';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {readyLichClear} from './helpers/lich-clear-fixture.mjs';
import {emptyPetDraft,emptyPetCmsDocument,PET_CMS_KEY} from '../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'} Isgen shares current reward reads while preserving each player bonus and atomic replay`,async t=>{
 const h=await lichLiveFixture({postgres});t.after(()=>h.close());
 const art=PET_ART_CATALOG.find(p=>p.code==='PET-BONGSOON');
 const pet={...emptyPetDraft(art.code),name:art.name,sourceArt:art.sourceArt,battleSprite:art.sourceArt,liveEnabled:true,buffs:[{type:'ATTACK_PERCENT',percent:10}],rewardBonuses:{dropPercent:10,accountXpPercent:20,coinPercent:30}};
 for(const [key,value]of [[PET_CMS_KEY,{revision:1,audit:[],document:{...emptyPetCmsDocument(),pets:[pet]}}],['pet_collection_v1:1',{revision:1,pets:{[pet.code]:1}}],['pet_loadout_v1:1',{revision:1,petCode:pet.code,audit:[]}]])await h.run('INSERT INTO app_meta(key,value) VALUES(?,?)',key,JSON.stringify(value));
 const {body}=await readyLichClear(h),queries=[],prepare=h.env.DB.prepare.bind(h.env.DB);
 h.env.DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
 const result=await h.call('action',{body});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.state.status,'CLEAR');
 assert.equal(queries.filter(sql=>sql==='SELECT key,value FROM app_meta WHERE key IN (?,?,?,?,?,?,?)').length,3,'one shared coin/EXP collection read per participant');
 for(const [uid,coin,ticks]of [[1,1300000000,120000],[2,1000000000,100000],[3,1000000000,100000]]){
  assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=?',uid)).coin),coin);
  assert.equal(Number((await h.one('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=?',uid)).total_ticks),ticks);
 }
 await h.call('action',{body});assert.equal(Number((await h.one('SELECT coin FROM users WHERE id=1')).coin),1300000000);
 assert.equal(Number((await h.one('SELECT total_ticks FROM account_rank_progress_v1 WHERE user_id=1')).total_ticks),120000);
});
