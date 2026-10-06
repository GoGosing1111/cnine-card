import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompanionLoadout,legacyCompanionLoadout,preparedFormation,COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {applyPetOpeningBuff} from '../shared/companion-opening-v1.mjs';
import {emptyPetCmsDocument,validatePetCmsDocument,PET_CMS_KEY,petReadiness} from '../shared/pet-cms-v1.mjs';
import {createCompanionPreparationBattle,COMPANION_REVIEW_CARDS} from '../functions/_companion_preparation.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {companionCmsFixture,reviewMercenaries,reviewPet} from './helpers/companion-preparation-fixture.mjs';

const rows=reviewMercenaries(),cards=COMPANION_REVIEW_CARDS.map(card=>({...card}));
const loadout={cardIds:cards.map(card=>card.id),mercenaryCodes:['V-013','V-021'],petCode:'PET-QA'};
const options={mercenaries:rows,pets:[reviewPet()],ownedMercenaryCodes:['V-013','V-021'],ownedPetCodes:['PET-QA']};
const document=()=>({...emptyPetCmsDocument(),pets:[reviewPet()]});
const save=(revision=0,id='pet-cms-request-0001')=>({document:document(),expectedRevision:revision,requestId:id});
test('five regular cards, two distinct ranks and one noncombat pet; legacy deck remains separate',()=>{
  const checked=validateCompanionLoadout(loadout,options);assert.equal(checked.ok,true);assert.equal(checked.combatUnitCount,7);
  const formation=preparedFormation(checked.loadout);assert.deepEqual(formation.mercenaries.map(row=>row.slotIndex),[6,7]);assert.equal(formation.pet.occupiesCombatSlot,false);
  const prior={cardIds:cards.map(card=>card.id),mercenaryCode:'V-013'};assert.deepEqual(legacyCompanionLoadout(prior),{cardIds:prior.cardIds,mercenaryCodes:['V-013'],petCode:null});assert.equal(prior.mercenaryCode,'V-013');
  assert.deepEqual(COMPANION_RELEASE,{dualMercenaries:false,pets:true,petAcquisition:false});
});
test('server rank/ownership enforce duplicates, unknown codes, five cards and client fields',()=>{
  for(const changed of [{mercenaryCodes:['V-013','V-022']},{mercenaryCodes:['V-013','V-013']},{mercenaryCodes:['V-999']},{mercenaryCodes:['V-013','V-021','V-022']},{cardIds:[...loadout.cardIds,'V-021']},{cardIds:['V-021',...loadout.cardIds.slice(1)]},{petCode:'PET-UNKNOWN'},{mercenaryRanks:['SS','SSS']}])assert.equal(validateCompanionLoadout({...loadout,...changed},options).ok,false,JSON.stringify(changed));
  assert.equal(validateCompanionLoadout(loadout,{...options,ownedMercenaryCodes:[]}).ok,false);
  assert.equal(validateCompanionLoadout(loadout,{...options,ownedPetCodes:[]}).ok,false);
  assert.equal(validateCompanionLoadout({...loadout,mercenaryCodes:[],petCode:null},options).ok,true);
});
test('pet CMS rejects unsafe resources, unknown buffs, duplicates, invalid numbers and ON flags',()=>{
  for(const mutate of [p=>p.battleSprite='https://bad.test/x.png',p=>p.battleSprite='assets/../x.png',p=>p.buffs[0].percent=Infinity,p=>p.buffs[0].percent=-1,p=>p.buffs.push({...p.buffs[0]}),p=>p.buffs[0].type='INSTANT_WIN']){const doc=document();mutate(doc.pets[0]);assert.throws(()=>validatePetCmsDocument(doc));}
  assert.throws(()=>validatePetCmsDocument({...document(),acquisitionEnabled:true}));
  assert.throws(()=>validatePetCmsDocument({...document(),pets:[reviewPet(),reviewPet()]}));
  const pending=reviewPet();pending.buffs[0].percent=null;assert.equal(petReadiness(pending).ok,false);
});
test('start buff is applied once, excludes suit and monsters, preserves HP ratio and canonical HP/shield order',()=>{
  const actor={id:'A:1',alive:true,hp:50,maxHp:100,attack:10,defense:20,speed:30,shield:0};
  const merc={...actor,id:'A:MERCENARY:V-013',isMercenary:true,mercenaryLink:{attackFloor:100}};
  const suit={...actor,id:'A:SUIT',isBattleSuit:true},monster={...actor,id:'B:1',isMonster:true};
  const pet={...reviewPet(),buffs:[{type:'START_SHIELD_PERCENT',percent:10},{type:'MAX_HP_PERCENT',percent:20},{type:'ATTACK_PERCENT',percent:50},{type:'SPEED_PERCENT',percent:10}]};
  const event=applyPetOpeningBuff([actor,merc,suit,monster],pet,'A','PVE');assert.equal(event.hits.length,2);assert.equal(actor.hp,60);assert.equal(actor.maxHp,120);assert.equal(actor.shield,12);assert.equal(actor.speed,33);assert.equal(merc.attack,150);assert.equal(suit.maxHp,100);assert.equal(monster.maxHp,100);
  assert.equal(applyPetOpeningBuff([actor,merc,suit,monster],pet,'A','PVE'),null);
});
test('target restrictions and PVE/PVP gating are per pet',()=>{
  const template={alive:true,hp:100,maxHp:100,attack:100,defense:100,speed:100,shield:0};
  for(const [target,expected]of [['REGULAR_CARDS','card'],['MERCENARIES','merc']]){
    const team=[{...template,id:'card'},{...template,id:'merc',isMercenary:true}];
    assert.deepEqual(applyPetOpeningBuff(team,{...reviewPet(),target},'A','PVP').hits.map(hit=>hit.targetId),[expected]);
  }
  assert.throws(()=>applyPetOpeningBuff([{...template,id:'card'}],{...reviewPet(),modes:['PVE']},'A','PVP'));
});
test('real PVE engine executes both mercenaries and emits one opening SD event before actions',()=>{
  const result=createCompanionPreparationBattle({attacker:{cards,mercenaries:rows.slice(0,2),pet:reviewPet()},seed:17});
  assert.equal(result.teams.A.cards.length,5);assert.equal(result.teams.A.mercenaries.length,2);assert.equal(result.result.final.A.length,7);
  const events=result.result.timeline;assert.equal(events.filter(event=>event.type==='PET_OPENING_BUFF').length,1);
  assert.equal(events.find(event=>event.type==='PET_OPENING_BUFF').hits.length,7);
  for(const row of rows.slice(0,2))assert.ok(events.some(event=>event.type==='TURN'&&event.actorId===`A:MERCENARY:${row.code}`));
  assert.ok(events.findIndex(event=>event.type==='PET_OPENING_BUFF')<events.findIndex(event=>event.type==='TURN'));
  assert.ok(!result.result.final.A.some(actor=>actor.id.includes(':PET:')));
});
test('PVP supports two distinct ranks on each side and independent pet openings',()=>{
  const team={cards,mercenaries:rows.slice(0,2),pet:reviewPet()};
  const result=createCompanionPreparationBattle({mode:'PVP',attacker:team,defender:team,seed:17});
  assert.equal(result.result.timeline.filter(event=>event.type==='PET_OPENING_BUFF').length,2);
  for(const side of ['A','B']){assert.equal(result.result.final[side].length,7);for(const row of team.mercenaries)assert.ok(result.result.timeline.some(event=>event.type==='TURN'&&event.actorId===`${side}:MERCENARY:${row.code}`));}
});
test('legacy live PVE/PVP continue ignoring unconnected dual mercenary fields',()=>{
  const pve={cards,mercenary:rows[0],monster:{power:300000,isBoss:true},seed:17};
  assert.deepEqual(createPveBattleV2(pve),createPveBattleV2({...pve,mercenaryCodes:['V-013','V-021']}));
  const pvp={attackerCards:cards,defenderCards:cards,attackerMercenary:rows[0],seed:17};
  assert.deepEqual(createPvpBattleV2(pvp),createPvpBattleV2({...pvp,pet:reviewPet(),attackerMercenaries:rows}));
});
test('OWNER-only GET is read-only, revisions start at zero; config+receipt commit once and replay safely',async()=>{
  const fx=await companionCmsFixture();try{
    assert.equal((await fx.call(null,{role:'ADMIN'})).status,403);assert.equal(fx.count(),0);
    const initial=await fx.call();assert.equal(initial.body.revision,0);assert.equal(fx.count(),1);assert.equal((await fx.pg.query('SELECT * FROM app_meta')).rows.length,0);
    assert.match(initial.headers.get('cache-control'),/no-store/);
    const saved=await fx.call(save());assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal(saved.body.replayed,false);
    assert.equal((await fx.call(save())).body.replayed,true);assert.equal((await fx.call(save(0,'pet-cms-another-0001'))).status,409);
    const other=save();other.document.pets[0].name='다른 내용';assert.equal((await fx.call(other)).body.code,'REQUEST_ID_CONFLICT');
    assert.equal((await fx.call(save(),{owner:2})).status,409);
  }finally{await fx.close();}
});
test('atomic first-save race, failed save retry and corrupt ON records fail closed',async()=>{
  const fx=await companionCmsFixture();try{
    const attempts=await Promise.all([fx.call(save()),fx.call(save(0,'pet-cms-race-000002'))]);assert.deepEqual(attempts.map(row=>row.status).sort(),[200,409]);
    fx.fail(true);const body=save(1,'pet-cms-retry-00001');assert.equal((await fx.call(body)).status,503);fx.fail(false);
    assert.equal((await fx.call(body)).status,200);assert.equal((await fx.call(body)).body.replayed,true);
    const record=JSON.parse((await fx.pg.query('SELECT value FROM app_meta WHERE key=$1',[PET_CMS_KEY])).rows[0].value);record.document.acquisitionEnabled=true;
    await fx.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(record),PET_CMS_KEY]);assert.equal((await fx.call()).status,503);
  }finally{await fx.close();}
});
test('review API uses stored pet and authoritative ranks, rejects stale revisions and forged fields',async()=>{
  const fx=await companionCmsFixture();try{
    await fx.call(save());const body={loadout,mode:'PVE',seed:17,petRevision:1,mercenaryRevision:7};
    const options={path:'admin/companions/preparation/preview',method:'POST'};
    assert.equal((await fx.call(body,options)).status,200);
    assert.equal((await fx.call({...body,loadout:{...loadout,mercenaryCodes:['V-013','V-022']}},options)).status,400);
    assert.equal((await fx.call({...body,petRevision:0},options)).status,409);
    assert.equal((await fx.call({...body,pet:{...reviewPet(),buffs:[]}},options)).status,400);
    assert.equal((await fx.call(body,{...options,role:'ADMIN'})).status,403);
    assert.equal((await fx.call({...body,seed:NaN},options)).status,400);
    assert.equal((await fx.call(null,{path:'admin/companions/preparation'})).body.mercenaries.length,3);
  }finally{await fx.close();}
});
