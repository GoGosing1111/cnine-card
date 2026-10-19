import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {mercenaryGrowthIncomingDamage} from '../shared/mercenary-growth-review-v2.mjs';
import {HALLOWEEN_COMBAT,HALLOWEEN_COMBAT_VERSION,halloweenIncomingDamage,halloweenCombatDescription} from '../shared/mercenary-halloween-combat-v1.mjs';
import {balanceSnapshot,balanceFingerprint} from '../scripts/measure-ss-mercenary-balance-20261019.mjs';

const qa='docs/qa/halloween-bongsoon-matchups-20261019/';
test('separate mirrored holdout puts both requested matchups near half while preserving Kangyun superiority',()=>{
 const before=JSON.parse(fs.readFileSync(qa+'before.json')),after=JSON.parse(fs.readFileSync(qa+'holdout.json'));
 assert.equal(after.policyFingerprint,balanceFingerprint());assert.equal(after.total,18816);assert.equal(after.count,64);assert.equal(after.start,691001);
 assert.equal(before.start,after.start);assert.equal(before.count,after.count);assert.equal(after.rows.length,7);
 for(const row of after.rows){
  assert.equal(row.total,2688);assert.equal(row.draws,0);assert.equal(row.formations.length,21);
  assert.equal(row.wins,row.formations.reduce((sum,f)=>sum+f.wins,0));
  const old=before.rows.find(r=>r.opponent===row.opponent);
  if(['V-983','V-985'].includes(row.opponent)){assert.ok(row.winRate>=.47&&row.winRate<=.53,`${row.opponent}: ${row.winRate}`);assert.ok(row.winRate>old.winRate);}
  else assert.ok(Math.abs(row.winRate-old.winRate)<.05,'unrequested matchups change by less than five percentage points');
  if(row.opponent==='V-057')assert.ok(row.winRate<.35,'Kangyun remains clearly ahead');
 }
});

test('only Halloween Bongsoon receives the intrinsic PvP guard; PVE and all released offensive policies stay unchanged',()=>{
 const old=JSON.parse(fs.readFileSync('docs/qa/ss-halloween-uplift-20261019/holdout.json')).policies.halloween;
 const current=structuredClone(HALLOWEEN_COMBAT);delete current['V-980'].pvpIncomingDamageScale;
 assert.deepEqual(current,old);assert.equal(HALLOWEEN_COMBAT_VERSION,4);
 const actor={isMercenary:true,code:'V-980',statMode:'RANK_FIXED',battleMode:'PVP'};
 assert.equal(halloweenIncomingDamage(actor,1000),850);
 assert.equal(halloweenIncomingDamage({...actor,pvpIncomingDamageScale:0},1000),850,'snapshot cannot override the policy');
 for(const override of [{code:'V-990'},{code:'V-983'},{code:'V-985'},{code:'V-057'},{isMercenary:false},{statMode:'PREVIEW'},{battleMode:'PVE'}])assert.equal(halloweenIncomingDamage({...actor,...override},1000),1000);
 assert.match(halloweenCombatDescription('V-980'),/PVP에서 받는 피해가 15% 감소/);
 assert.match(halloweenCombatDescription('V-980'),/PVE에는 적용하지 않습니다/);
 for(const code of Object.keys(HALLOWEEN_COMBAT).filter(c=>c!=='V-980'))assert.doesNotMatch(halloweenCombatDescription(code),/받는 피해가 15% 감소/);
 const stronger={isMercenary:true,battleMode:'PVP',mercenaryLevelApplied:true,mercenaryLevel:{version:2,level:20},mercenaryGrowth:{total:{mitigationBypassPercent:50}}};
 assert.equal(mercenaryGrowthIncomingDamage({...actor,mercenaryLevel:{level:1}},1000,850,stronger),925,'existing growth mitigation bypass still applies');
});

function firstHit(code,mode,shield){
 const attacker={...buildFighter({id:'probe',power:1000,power_type:'ATTACK'},0,'A',null,mode),attack:1000,speed:100000,defense:0,hp:1e7,maxHp:1e7};
 const target={...buildMercenaryFighter(balanceSnapshot('V-980'),'B',mode,buildFighter),code,skills:[],attack:1,speed:1,defense:0,hp:1e7,maxHp:1e7,shield,maxShield:shield};
 const result=simulateBattleV2Preview({teamA:[attacker],teamB:[target],seed:19291,maxActions:1});
 const hit=result.timeline.find(e=>e.type==='TURN'&&e.actorId===attacker.id&&e.targetId===target.id);
 assert.ok(hit);assert.equal(result.actions,1);return hit;
}

test('canonical damage applies the guard once before splitting shield absorption and HP loss, with no extra action',()=>{
 for(const shield of [0,500,5000]){
  const before=firstHit('V-986','PVP',shield),after=firstHit('V-980','PVP',shield);
  const damage=event=>event.damage+event.absorbed;
  assert.ok(Math.abs(damage(after)-damage(before)*.85)<1e-6);
  assert.ok(Math.abs(after.targetShieldAfter-Math.max(0,shield-damage(after)))<1e-6);
  assert.ok(Math.abs(after.targetHpAfter-(1e7-Math.max(0,damage(after)-shield)))<1e-6);
  assert.deepEqual(firstHit('V-980','PVE',shield),firstHit('V-986','PVE',shield));
 }
});
