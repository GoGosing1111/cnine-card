import test from 'node:test';
import assert from 'node:assert/strict';
import {withMercenaryBattle} from '../preview/project-v-v3/source/battle/MercenaryCombatPlayback.js';
import {ASTRA_CODE,ASTRA_EVENT,astraDeploymentSnapshot} from '../shared/mercenary-astra-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {snapshot,scenarios} from '../scripts/measure-razak-balance-20261026.mjs';
import {BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {validatePreparedMercenaries} from '../shared/companion-loadout-v2.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {saveMercenaryLoadout,loadMercenaryBattleSnapshot,mercenaryAccountState} from '../functions/_mercenary_account.js';
import fs from 'node:fs';
import {SKILLS as ASTRA_ANIMATIONS} from '../preview/project-v-v3/source/battle/astra/skills.mjs';
import {skills as BLUE_GEAR_ANIMATIONS} from '../preview/project-v-v3/source/battle/blue-gear/skills.mjs';
const play=withMercenaryBattle(class {}).prototype.playMercenaryEvent;
const astra={...snapshot('V-058',21,'PVE',1000000),...astraDeploymentSnapshot()};
for(const mode of ['PVE','PVP'])test(`Astra ${mode} server windups reach its dedicated playback without generic skill lookup`,async()=>{
 const cards=scenarios[0].cards;
 const b=mode==='PVE'?createPveBattleV2({cards,mercenary:astra,monster:{id:1,name:'QA',battle_power:1e13},seed:71159}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:astra,defenderMercenary:astra,seed:71159});
 const events=b.result.timeline.filter(e=>e.actorId?.includes(ASTRA_CODE)&&e.type==='MERCENARY_WINDUP');
 assert(events.length>0);
 const actors=new Map(['A','B'].map(side=>[`${side}:MERCENARY:${ASTRA_CODE}`,{cardId:ASTRA_CODE,root:{destroyed:false}}]));
 const ctx={combatantById:id=>actors.get(id),mercenaryHitIndices:new Map(),queueBanner(){},visible:true};
 for(const e of events)await play.call(ctx,e);
 assert.equal(ctx.mercenaryHitIndices.size,0);
 assert(b.result.timeline.some(e=>e.type===ASTRA_EVENT));
});
test('Astra lifecycle records are inert; unknown skills on ordinary actors still fail explicitly',async()=>{
 const ctx={combatantById:()=>({cardId:ASTRA_CODE,root:{destroyed:false}}),mercenaryHitIndices:new Map(),queueBanner(){},visible:true};
 for(const type of ['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_END','MERCENARY_FINISH','MERCENARY_CANCEL'])await play.call(ctx,{type,actorId:'A:MERCENARY:V-059',skillId:'MS-1101'});
 ctx.combatantById=()=>({cardId:'V-001',root:{destroyed:false}});
 await assert.rejects(play.call(ctx,{type:'MERCENARY_WINDUP',skillId:'UNKNOWN'}),/정의되지 않은 용병 스킬/);
});
test('all eight Blue Gear identities accept their actual PVE/PVP server lifecycle records',async()=>{
 for(const {code}of BLUE_GEAR_DRAW_POLICY.pool)for(const mode of ['PVE','PVP']){
  const cards=scenarios[0].cards,mercenary={...snapshot('V-058',21,mode,1000000),...limitedDeploymentSnapshot(code)};
  const b=mode==='PVE'?createPveBattleV2({cards,mercenary,monster:{id:1,name:'QA',battle_power:1e13},seed:71159}):createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:71159});
  const actors=new Map(['A','B'].map(side=>[`${side}:MERCENARY:${code}`,{cardId:code,root:{destroyed:false}}]));
  const ctx={combatantById:id=>actors.get(id),mercenaryHitIndices:new Map(),queueBanner(){},visible:true};
  const lifecycle=b.result.timeline.filter(e=>e.actorId?.endsWith(code)&&['MERCENARY_WINDUP','MERCENARY_END','MERCENARY_CANCEL'].includes(e.type));
  for(const e of lifecycle)await play.call(ctx,e);
  if(!['V-976','V-967'].includes(code)||mode==='PVE')assert(lifecycle.length>0,code+' '+mode);
 }
});
test('Blue Gear limited ranks share existing SS/SSS deployment caps',()=>{
 const rows=BLUE_GEAR_DRAW_POLICY.pool.map(p=>limitedDeploymentSnapshot(p.code));
 for(const a of rows)for(const b of rows){
  const check=()=>validatePreparedMercenaries([a,b]);
  if(a.rank===b.rank)assert.throws(check);else assert.equal(check().length,2);
 }
});
test('all eight owned identities save and load through the ordinary PVE/PVP account services',async t=>{
 const f=await mercenaryFixture(t,{postgres:true});
 for(const {code}of BLUE_GEAR_DRAW_POLICY.pool){
  await assert.rejects(saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',mercenaryCodes:[code],revision:0}),{code:'MERCENARY_NOT_OWNED'});
  await f.p('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0,?,?)',f.user.id,code,'2026-11-20','2026-11-20').run();
 }
 for(const mode of ['PVE','PVP']){
  let revision=0;
  for(const {code}of BLUE_GEAR_DRAW_POLICY.pool){
   await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCodes:[code],revision:revision++});
   const row=await loadMercenaryBattleSnapshot(f.env,f.user,mode);assert.equal(row.code,code);assert.equal(row.basePower,limitedDeploymentSnapshot(code).basePower);
  }
 }
 const account=await mercenaryAccountState(f.env,f.user);
 for(const {code}of BLUE_GEAR_DRAW_POLICY.pool)assert(account.cards.find(c=>c.code===code)?.canDeploy,code);
});
test('live playback deadlines cover complete authored casts and all three Zero basic forms',()=>{
 const source=fs.readFileSync(new URL('../js/battle-v3-live.js',import.meta.url),'utf8');
 const begin=source.indexOf('const eventPlaybackTimeoutMs ='),end=source.indexOf('const safePlayEvents',begin);
 const timeout=Function(source.slice(begin,end)+';return eventPlaybackTimeoutMs;')();
 for(const s of Object.values(ASTRA_ANIMATIONS))assert(timeout([{type:ASTRA_EVENT,skillId:s.reference}])>s.duration*1000+500);
 for(const s of Object.values(BLUE_GEAR_ANIMATIONS))assert(timeout([{type:'MERCENARY_BLUE_GEAR_STRIKE'}])>(s.end+s.hold)*1000+500);
 // The reproduced second Zero form takes 2.6s, before dispatch/load headroom.
 for(const {code}of BLUE_GEAR_DRAW_POLICY.pool){const budget=timeout([{type:'TURN',actorId:'A:MERCENARY:'+code}]);assert(budget>3100);assert(budget<=12000);}
 assert.equal(timeout([{type:'TURN',actorId:'A:0:ordinary-card'}]),2000);
});
