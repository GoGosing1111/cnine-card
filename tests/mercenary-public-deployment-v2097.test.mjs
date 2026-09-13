import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {releasedMercenarySnapshot,releasedMercenarySnapshots,MERCENARY_RUNTIME_KEY} from '../functions/_mercenary_account.js';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {v3JointReleaseState,V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
const origin='https://game.test';
const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'기본 카드 '+i,rarity:'FUR',power:10000,power_type:'ATTACK'}));
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: ordinary user equips exactly one independent mercenary for PVE and both PVP sides with Hyper OFF`,async t=>{
 const f=await mercenaryFixture(t,{postgres});
 await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,mode:'OFF'});
 const user={...f.user,role:'USER'},call=(path,body)=>handleMercenaryAccount({path,env:f.env,deps:{...f.deps,authenticate:async()=>user},request:new Request(origin+'/api/'+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});
 for(const code of ['V-001','V-002'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:user.id,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
 // An assigned but unconfigured skill must stay pending, without preventing
 // the already approved rank-based fighter from joining either battle mode.
 const document=structuredClone(f.document),skill=document.skills[0];skill.review='PENDING';skill.balance={damageRatio:null,cooldownTurns:null,cost:null};
 document.assignments.find(a=>a.code==='V-001').skillIds=[skill.id];
 await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(document)).run();
 const body={requestId:crypto.randomUUID(),mercenaryCode:'V-001',revision:0};
 assert.equal((await call('mercenaries/v3/loadout',body)).status,200);
 assert.equal((await(await call('mercenaries/v3/loadout',body)).json()).replayed,true);
 const state=await(await call('mercenaries/v3/state')).json();assert.equal(state.available,true);assert.equal(state.openingAvailable,false);assert.equal(state.loadout.mercenaryCode,'V-001');assert.equal(state.deployment.mercenarySlots,1);assert.equal(state.cards[0].canDeploy,true);assert.equal(state.cards[0].pendingSkillCount,1);assert.equal(state.cards[0].skills[0].balance.damageRatio,null);
 const mercenary=await releasedMercenarySnapshot(f.env,user);assert.equal(mercenary.skills.length,0);assert.deepEqual(mercenary.pendingSkillIds,[skill.id]);assert.equal(mercenary.level,1);
 const snapshots=await releasedMercenarySnapshots(f.env,[user.id,user.id]);assert.equal(snapshots.size,1);assert.equal(snapshots.get(user.id).code,'V-001');
 const pve=createPveBattleV2({cards,mercenary,monster:{id:1,name:'검수 몬스터',battle_power:100000},seed:7});
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:7});
 assert.equal(pve.teams.A.cards.length,5);assert.equal(pve.teams.A.mercenaries.length,1);
 for(const side of ['A','B']){assert.equal(pvp.teams[side].cards.length,5);assert.equal(pvp.teams[side].mercenaries.length,1);assert.equal(pvp.teams[side].mercenaries[0].slot,5);}
 assert.ok(pvp.result.timeline.some(e=>e.actorId===pvp.teams.A.mercenaries[0].id||e.attackerId===pvp.teams.A.mercenaries[0].id));
 for(const input of [{mercenaryCode:['V-001','V-002']},{mercenaryCode:'V-001',cardIds:[1,2,3,4,5,6]},{mercenaryCode:'V-043'}])assert.ok((await call('mercenaries/v3/loadout',{requestId:crypto.randomUUID(),revision:1,...input})).status>=400);
 assert.equal((await call('mercenaries/v3/loadout',{requestId:crypto.randomUUID(),revision:0,mercenaryCode:'V-002'})).status,409);
 assert.equal((await call('mercenaries/v3/loadout',{requestId:crypto.randomUUID(),revision:1,mercenaryCode:'V-002'})).status,200);
 assert.equal(Number((await f.p('SELECT COUNT(*) n FROM user_mercenary_loadout_v1 WHERE user_id=?',user.id).first()).n),1);
 assert.equal((await releasedMercenarySnapshot(f.env,user)).code,'V-002');
 assert.equal((await call('mercenaries/v3/loadout',{requestId:crypto.randomUUID(),revision:2,mercenaryCode:null})).status,200);assert.equal(await releasedMercenarySnapshot(f.env,user),null);
 assert.equal((await call('mercenaries/v3/train',{requestId:crypto.randomUUID(),mercenaryCode:'V-002',revision:0,quantity:1})).status,423);
 assert.equal(await f.coin(),10000000);
});
test('deployment exposes 5+1 independently and both real deck builders provide the same owned slot',()=>{
 assert.equal(V3_JOINT_RELEASE_ENABLED,false);assert.equal(v3JointReleaseState().publicContent.MERCENARY.enabled,true);
 const module=fs.readFileSync('js/mercenary-deck-slot.mjs','utf8'),draw=fs.readFileSync('admin/mercenary-draw-admin-v1.js','utf8');
 assert.match(module,/\['battleDeck','PVE'\]/);assert.match(module,/\['pvpDeckSlots','PVP'\]/);assert.match(module,/deck\.after\(host\)/);assert.match(module,/mercenaries\/v3\/state/);assert.match(draw,/data-hyper-opening/);
 assert.match(fs.readFileSync('index.html','utf8'),/mercenary-deck-slot\.mjs\?v=2097/);
});
test('displayed PVP power adds the separately deployed mercenary once without counting it as a card',()=>{
 const app=fs.readFileSync('js/app.js','utf8'),source=app.slice(app.indexOf('function pvpDeckStats('),app.indexOf("addEventListener('mercenary-deployment:changed'"));
 const context={cards,loadUser:()=>({}),battleCardPower:c=>c.power,pvpState:{characterBonus:{pvp:500},battleConfig:{}},battleState:{config:{}},MercenaryDeckSlot:{power:()=>120000}};vm.createContext(context);vm.runInContext(source,context);
 const stats=context.pvpDeckStats(cards.map(c=>c.id));assert.equal(stats.count,5);assert.equal(stats.cardPower,50000);assert.equal(stats.totalPower,170500);assert.equal(context.pvpDeckStats([]).totalPower,0);
 assert.match(fs.readFileSync('js/pve-command-v2-live.js','utf8'),/cardPower \+ Number\(bonus.pve \|\| 0\) \+ Number\(globalThis.MercenaryDeckSlot/);
});
