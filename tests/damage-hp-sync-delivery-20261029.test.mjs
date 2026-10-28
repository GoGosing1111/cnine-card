import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n'),hash=v=>createHash('sha256').update(v).digest('hex');
test('all current V3 consumers and the main/store loader ship the corrected collision ordering',()=>{
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json')),version=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 assert(version.endsWith('-damage-hp-sync-20261029-v1'));
 for(const s of report.sources)assert.equal(hash(read(s.file)),s.sha256,s.file);
 assert(report.outputs.some(o=>o.file==='preview/coop-defense-v1/defense.bundle.js'));
 for(const o of report.outputs){const b=read(o.file);assert.equal(hash(b),o.sha256,o.file);assert(b.includes('authoredFence'),o.file);
  // Defense imports BattleEngine directly, without the live bridge's runtimeVersion export.
  if(!o.standaloneEngine)assert(b.includes(version),o.file);
 }
 for(const f of ['defense/index.html','preview/coop-defense-v1/index.html'])assert(read(f).includes('defense.bundle.js?hpSync=20261029-v1'),f);
 for(const f of ['js/app.js','onestore/js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(read(f).includes(version),f);
 for(const f of ['js/app.js','onestore/js/app.js'])assert(read(f).includes('hpSync=20261029-v1'),f);
 for(const f of ['index.html','onestore/index.html','service-worker.js'])assert(read(f).includes('damage-hp-sync-20261029-v1'),f);
});
const cards=['HP','DEFENSE','ATTACK','SPEED','ATTACK'].map((type,i)=>({id:'qa-'+i,title:'검수 '+i,power:400000,power_type:type}));
const mercenary={...limitedDeploymentSnapshot('V-978'),combat:fixture.combat};
test('server PVE/PVP receipts conserve actual HP loss, shield absorption, targets and seeded results',()=>{
 const args={cards,mercenary,monster:{id:1,name:'검수 보스',battle_power:1.6e10},seed:77};
 const pve=createPveBattleV2(args);assert.deepEqual(pve,createPveBattleV2(args));assert(pve.result.timeline.some(e=>e.type==='MERCENARY_LEONEL_AREA'));
 const pvp=createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77});
 assert(!pvp.result.timeline.some(e=>e.type==='MERCENARY_LEONEL_AREA'));
 for(const b of [pve,pvp]){
  const hp=new Map(Object.values(b.teams).flatMap(t=>[...t.cards,...(t.mercenaries||[])]).map(c=>[c.id,c.hp]));let contacts=0;
  // The team snapshots already include all opening buffs. In particular, the
  // at=0 healer aura precedes mercenary links and must not overwrite that snapshot.
  for(const e of b.result.timeline.filter(e=>e.at>0))for(const r of [e,...(e.hits||[]),...(e.targets||[])]){
   const next=r.targetHpAfter??r.hpAfter;if(!Number.isFinite(next))continue;
   if(e.actorId?.includes('MERCENARY')&&['TURN','MERCENARY_LEONEL_AREA'].includes(e.type)&&r.targetId&&Number.isFinite(r.damage)){
    assert.equal(hp.get(r.targetId)-next,r.damage,'HP damage remains authoritative at '+e.type+' #'+e.seq);assert(r.absorbed>=0);contacts++;
   }if(r.targetId)hp.set(r.targetId,next);
  }assert(contacts>0);
 }
});
