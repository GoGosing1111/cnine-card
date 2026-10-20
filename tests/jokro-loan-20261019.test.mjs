import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryAccountState,saveMercenaryLoadout,loadMercenaryBattleSnapshot,releasedMercenarySnapshots} from '../functions/_mercenary_account.js';
import {JOKRO_CODE,JOKRO_LOAN,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {ensureLimitedPackSchema} from '../functions/_mercenary_limited_pack.js';

test('loan closes exactly at 04:00 KST without changing owner or other account access',()=>{
 for(const time of [JOKRO_LOAN.expiresAt-1,JOKRO_LOAN.expiresAt,JOKRO_LOAN.expiresAt+1]){
  assert.equal(jokroAccountAllowed(5950,JOKRO_CODE,time),time<JOKRO_LOAN.expiresAt);
  assert.equal(jokroAccountAllowed(1,JOKRO_CODE,time),true);
  assert.equal(jokroAccountAllowed(5951,JOKRO_CODE,time),false);
  assert.equal(jokroAccountAllowed(5950,'V-001',time),true);
 }
});
test('loan ownership, PVE/PVP selection and single/batch snapshots expire together',async t=>{
 const f=await mercenaryFixture(t,{postgres:true}),user={id:5950,role:'USER'},oldNow=Date.now;
 await ensureLimitedPackSchema(f.env);
 t.after(()=>{Date.now=oldNow;});Date.now=()=>JOKRO_LOAN.expiresAt-60000;
 await f.p('INSERT INTO users(id,nickname) VALUES(?,?)',user.id,'남수댕ㅗ').run();
 await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCode:JOKRO_CODE,revision:0}),{code:'MERCENARY_NOT_OWNED'});
 await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',user.id,JOKRO_CODE,'2026-10-19','2026-10-19').run();
 assert.equal((await mercenaryAccountState(f.env,user)).cards.some(c=>c.code===JOKRO_CODE),true);
 for(const mode of ['PVE','PVP']){
  await saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:0});
  assert.equal((await loadMercenaryBattleSnapshot(f.env,user,mode)).code,JOKRO_CODE);
  assert.equal((await releasedMercenarySnapshots(f.env,[user.id],mode)).has(user.id),true);
 }
 Date.now=()=>JOKRO_LOAN.expiresAt;
 assert.equal((await mercenaryAccountState(f.env,user)).cards.some(c=>c.code===JOKRO_CODE),false);
 for(const mode of ['PVE','PVP']){
  await assert.rejects(loadMercenaryBattleSnapshot(f.env,user,mode),{code:'MERCENARY_NOT_OWNED'});
  assert.equal((await releasedMercenarySnapshots(f.env,[user.id],mode)).has(user.id),false);
  await assert.rejects(saveMercenaryLoadout(f.env,user,{requestId:crypto.randomUUID(),mode,mercenaryCode:JOKRO_CODE,revision:1}),{code:'MERCENARY_NOT_OWNED'});
 }
});
