import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCoopOwnedCards,loadCoopSelection} from '../functions/_cooperative_live.js';
import {cardUniqueDeckState,cardUniqueDeckStates} from '../functions/_magic.js';
import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
import {iconFurFixture,live} from './helpers/icon-fur15-fixture.mjs';

function inventoryFixture({extra=0}={}){
 const f=iconFurFixture({rows:live.cards.filter(c=>Number(c.is_active)&&Number(c.scope_pve)).slice(0,2)});
 f.db.exec('ALTER TABLE cards_effective_v1210 ADD COLUMN image_url TEXT; CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER)');
 f.db.exec("UPDATE cards_effective_v1210 SET image_url='assets/owned-card.png'; INSERT INTO user_cards SELECT 1,id,1,15 FROM cards_effective_v1210");
 const insert=f.db.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?,?,?,?)');
 const owned=f.db.prepare('INSERT INTO user_cards VALUES(?,?,?,?)');
 for(const icon of ICON_ROLES.slice(0,4)){insert.run(icon.cardId,icon.name,'ICON','NONE',180000,'assets/icon.png');owned.run(1,icon.cardId,icon===ICON_ROLES[3]?0:1,0);}
 insert.run('not-owned','다른 계정 카드','SSR','FIXED',100,'assets/other.png');owned.run(2,'not-owned',1,0);
 for(let i=0;i<extra;i++){const id='owned-extra-'+String(i).padStart(3,'0');insert.run(id,id,'SSR','FIXED',100,'assets/extra.png');owned.run(1,id,1,0);}
 const calls={deck:[],batches:[]};
 const deps={
  battleSettings:async()=>({}),
  cardBattlePower:c=>Number(c.base_power)+Number(c.breakthrough_level||0),
  cardUniqueDeckState:async(...args)=>{calls.deck.push(args[2].map(c=>c.id));return cardUniqueDeckState(...args);},
  cardUniqueDeckStates:async(...args)=>{calls.batches.push({count:args[1].flatMap(e=>e.cards).length,options:args[3]});return cardUniqueDeckStates(...args);}
 };
 return {...f,deps,calls,user:{id:1,role:'USER'}};
}

test('owned inventory with 3 ICONs returns all cards and their real PVE effects without a deck-limit error',async()=>{
 const f=inventoryFixture();
 try{
  const rows=await loadCoopOwnedCards(f.env,f.user,f.deps);
  assert.equal(rows.length,5);
  assert.equal(rows.filter(c=>c.grade==='ICON').length,3);
  assert.ok(rows.filter(c=>c.grade==='ICON').every(c=>c.iconRole?.supremacy?.PVE));
  const fur=rows.filter(c=>c.grade==='FUR');assert.equal(fur.length,2);
  assert.ok(fur.every(c=>c.uniqueAbility&&c.uniqueAdvancement));
  assert.ok(rows.every(c=>c.power===Number(c.base_power)+Number(c.breakthrough_level)));
  assert.ok(rows.every(c=>c.image));assert.ok(!rows.some(c=>c.id==='not-owned'||c.id===ICON_ROLES[3].cardId));
  assert.equal(f.calls.deck.length,0);
  assert.equal(f.queries.filter(q=>q.includes('FROM card_unique_advancements_v1937 a')).length,1);
 }finally{f.close();}
});

test('large inventories stay complete and bounded by advancement batch limits',async()=>{
 const f=inventoryFixture({extra:245});
 try{
  const rows=await loadCoopOwnedCards(f.env,f.user,f.deps);
  assert.equal(rows.length,250);assert.equal(new Set(rows.map(c=>c.id)).size,250);
  assert.ok(f.calls.batches.length>1&&f.calls.batches.length<=5);
  assert.ok(f.calls.batches.every(b=>b.count<=120&&b.options.batched===true));
  assert.equal(f.calls.deck.length,0);
  assert.equal(f.queries.filter(q=>q.includes('FROM card_unique_advancements_v1937 a')).length,f.calls.batches.length);
 }finally{f.close();}
});

test('selected cards still use real deck validation and retain two-ICON allowance',async()=>{
 const f=inventoryFixture(),ids=ICON_ROLES.slice(0,2).map(c=>c.cardId);
 f.env.UNIQUE_ADVANCEMENT_MODE='OFF';
 try{
  const rows=await loadCoopOwnedCards(f.env,f.user,f.deps,ids);
  assert.deepEqual(rows.map(c=>c.id),ids);assert.ok(rows.every(c=>c.iconRole));
  assert.equal(f.calls.deck.length,1);assert.equal(f.calls.batches.length,0);
  await assert.rejects(loadCoopOwnedCards(f.env,f.user,f.deps,ICON_ROLES.slice(0,3).map(c=>c.cardId)),e=>e.code==='ICON_DECK_LIMIT'&&e.limit===2);
  await assert.rejects(loadCoopSelection(f.env,f.user,{cardIds:ICON_ROLES.slice(0,3).map(c=>c.cardId),mercenaryCode:'V-004'},f.deps));
 }finally{f.close();}
});

test('an empty owner inventory returns an empty list without loading effect metadata',async()=>{
 const f=inventoryFixture();
 try{
  assert.deepEqual(await loadCoopOwnedCards(f.env,{id:99,role:'USER'},f.deps),[]);
  assert.equal(f.calls.deck.length,0);assert.equal(f.calls.batches.length,0);
 }finally{f.close();}
});

