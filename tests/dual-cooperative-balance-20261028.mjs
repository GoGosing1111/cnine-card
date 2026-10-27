import {operatingMercenaries} from './helpers/mercenary-operating-roster-v2144.mjs';
import fs from 'node:fs';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {currentSquads,currentMerc} from './helpers/cooperative-current.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {attachMercenaryLevel} from '../shared/mercenary-level-v1.mjs';
import {mercenaryGrowthLaunchPolicy} from '../shared/mercenary-growth-launch-20261016.mjs';
import {rebalanceCoopCombat} from '../shared/cooperative-balance-20261012.mjs';
import {defaultCoopCombat,validateCoopCombat} from '../shared/cooperative-settings-v1.mjs';
import {rollCoopRoster} from '../shared/cooperative-roster-v3.mjs';
import {COOP_DUAL_BALANCE} from '../shared/cooperative-dual-preparation-v1.mjs';
import {COMPANION_PREPARATION_REVIEW as REVIEW} from '../shared/companion-loadout-v2.mjs';
const output=process.env.DUAL_BALANCE_OUT;if(!output)throw Error('DUAL_BALANCE_OUT required');
const captured=process.env.DUAL_BALANCE_CONFIG?JSON.parse(fs.readFileSync(process.env.DUAL_BALANCE_CONFIG,'utf8')):null;
if(captured&&captured.readOnly!==true)throw Error('A read-only combat snapshot is required');
const combat=captured?validateCoopCombat(captured.combat):rebalanceCoopCombat(defaultCoopCombat()),policy=mercenaryGrowthLaunchPolicy(),runs=Number(process.env.DUAL_BALANCE_SEEDS||16),rows=[];
const merc=(code,level)=>attachMercenaryLevel(limitedDeploymentSnapshot(code)||currentMerc(code)||operatingMercenaries.find(m=>m.code===code),policy,{level,experience:0,breakthrough_mask:level>10?7:level>5?1:0,revision:0});
const cohorts=[
 {name:'SS',primary:'V-048',secondary:operatingMercenaries.find(m=>m.rank==='S').code,level:1,gear:2300000},
 {name:'SSS_ENTRY',primary:'V-049',secondary:'V-048',level:1,gear:2300000},
 {name:'LIMITED_ENTRY',primary:'V-999',secondary:'V-048',level:1,gear:2300000},
 {name:'LIMITED_GROWTH',primary:'V-979',secondary:'V-960',level:10,gear:2300000},
 {name:'LIMITED_LOW_GEAR',primary:'V-970',secondary:'V-961',level:16,gear:2300000},
 {name:'SSS_SS',primary:'V-049',secondary:'V-048',level:10,gear:10000000},
 {name:'LIMITED_16',primary:'V-979',secondary:'V-960',level:16,gear:20000000},
 {name:'LIMITED_20',primary:'V-970',secondary:'V-961',level:20,gear:50000000}
];
for(const cohort of cohorts)for(const deck of ['BALANCED','OFFENSE','CLEANSE'])for(const difficulty of ['NORMAL','HARD','EXTREME']){
 const single=currentSquads({deck,gear:cohort.gear}).map(s=>({...s,mercenary:merc(cohort.primary,cohort.level)}));
 const dual=single.map(({mercenary,...s})=>({...s,mercenaries:[mercenary,merc(cohort.secondary,cohort.level)]}));
 for(const setting of ['SINGLE','DUAL_UNCHANGED','DUAL_TUNED']){
  let wins=0;const seconds=[],remaining=[],turns=[];
  for(let i=1;i<=runs;i++){
   const seed=i*7919,{payload}=createCooperativeBattle({squads:setting==='SINGLE'?single:dual,difficulty,combat,encounter:rollCoopRoster(seed),seed,
    ...(setting==='SINGLE'?{}:{[REVIEW]:true,dualBalance:setting==='DUAL_UNCHANGED'?{...COOP_DUAL_BALANCE,hp:1,attack:1}:COOP_DUAL_BALANCE})});
   const b=payload.battleV2,win=b.result.winner==='A';wins+=Number(win);if(win)seconds.push(b.result.timeline.at(-1).combatAtMs/1000);
   remaining.push(b.result.final.B.reduce((n,a)=>n+a.hp,0)/Math.max(1,b.result.final.B.reduce((n,a)=>n+a.maxHp,0)));
   turns.push(b.result.timeline.filter(e=>e.actorKind==='MERCENARY'&&['TURN','MERCENARY_CAST'].includes(e.type)).length);
  }
  const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:null;
  rows.push({cohort:cohort.name,deck,difficulty,setting,runs,wins,meanClearSeconds:mean(seconds),meanRemainingEnemyHp:mean(remaining),meanMercenaryActions:mean(turns)});
 }
}
const result={scope:'SEEDED_REVIEW_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',combatSource:captured?{at:captured.at,revision:captured.revision,settingsSha256:captured.settingsSha256,readOnly:true}:'20261012 reviewed budgets, no live CMS write',cardSource:'20261012 metadata fixture, ICON +13 with no unique advancement',cohorts,enemyProfile:COOP_DUAL_BALANCE,battles:rows.length*runs,rows};
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({battles:result.battles,summary:Object.fromEntries(['SINGLE','DUAL_UNCHANGED','DUAL_TUNED'].map(s=>[s,rows.filter(r=>r.setting===s).reduce((a,r)=>({wins:a.wins+r.wins,runs:a.runs+r.runs}),{wins:0,runs:0})]))}));
