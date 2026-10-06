import test from 'node:test';
import assert from 'node:assert/strict';
import {createLichRoom,addLichMember,setLichLoadout,startLichRoom,lichBattlePayload} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK,REVIEW_BOSS} from '../preview/lich-king-raid-v1/fixture.mjs';
import {emptyPetDraft} from '../shared/pet-cms-v1.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';

test('Lich pets buff only their owner once; saved HP and opening survive re-entry without a second buff',()=>{
 const room=createLichRoom({id:'pet-lich',hostId:'2',cards:REVIEW_DECK,monster:REVIEW_BOSS,rulesVersion:2});
 for(const [id,role] of [['2','ASSAULT'],['3','WARDEN']])addLichMember(room,{id,name:'owner '+id,role});
 const art=PET_ART_CATALOG.find(p=>p.code==='PET-GUSUDAENG');
 const pet={ownerId:2,definition:{...emptyPetDraft(art.code),name:art.name,enabled:true,battleSprite:art.sourceArt,buffs:[{type:'MAX_HP_PERCENT',percent:10}]}};
 setLichLoadout(room,'2',{cards:REVIEW_DECK,pet},'owner 2');setLichLoadout(room,'3',{cards:REVIEW_DECK},'owner 3');
 const before=room.fighters.map(f=>({id:f.id,maxHp:f.maxHp,ownerId:f.ownerId}));startLichRoom(room,'2');
 for(const f of room.fighters){const old=before.find(b=>b.id===f.id);assert.equal(f.maxHp,Math.round(old.maxHp*(f.ownerId==='2'?1.1:1)));}
 assert.equal(room.events.filter(e=>e.type==='PET_OPENING_BUFF').length,1);
 const persisted=JSON.parse(JSON.stringify(room));persisted.fighters[0].hp-=100;const hp=persisted.fighters[0].hp;
 startLichRoom(persisted,'2');assert.equal(persisted.fighters[0].hp,hp);assert.deepEqual(persisted.events,room.events);
 const payload=lichBattlePayload(persisted,'2');assert.equal(payload.battleV2.teams.A.pet.definition.code,art.code);
 assert.equal(payload.battleV2.teams.A.cards[0].hp,hp);assert.equal(lichBattlePayload(persisted,'3').battleV2.teams.A.pet,null);
});
