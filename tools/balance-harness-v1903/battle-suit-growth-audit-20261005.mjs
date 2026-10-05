// Read-only balance investigation. Candidates run from memory; no game or DB
// settings are changed. Every matchup is synthetic, not a live-user win rate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SKILL_CHIP_CATALOG} from '../../shared/battle-suit-skill-chips.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const engineUrl=new URL('../../functions/_battle_v2_preview.js',import.meta.url);
// Pin the actual pre-reform source so this historical audit stays reproducible
// after the approved runtime changes. Relative imports use the current repo.
const baselineCommit='56b11c3ddc5b3d6b893abf2dd341c6f320f36097';
const original=execFileSync('git',['show',baselineCommit+':functions/_battle_v2_preview.js'],{cwd:root,encoding:'utf8'});
const replaceOnce=(source,before,after)=>{
  assert.equal(source.split(before).length,2,`Expected exactly one current source anchor: ${before}`);
  return source.replace(before,after);
};
const cut=replaceOnce(original,'const BATTLE_SUIT_SKILL_CHIP_DAMAGE_MULTIPLIER = 12;','const BATTLE_SUIT_SKILL_CHIP_DAMAGE_MULTIPLIER = 4;');
const ownPower=replaceOnce(cut,'!counter && target.isMonster && options.minDamagePercent > 0','!counter && !isBattleSuitSupport(actor) && target.isMonster && options.minDamagePercent > 0');
const normalized=replaceOnce(ownPower,'const referenceCycle=100/referenceSpeed;','const referenceCycle=Math.max(BATTLE_SUIT_REFERENCE_CYCLE,100/referenceSpeed);');
const sources={CURRENT:original,SKILL_ONE_THIRD:cut,OWN_POWER_NO_FLOOR:ownPower,OWN_POWER_FIXED_PIERCE_CLOCK:normalized};
const seedCount=64;
const chips=SKILL_CHIP_CATALOG.map(c=>c.code);
const report={
  status:'DIAGNOSTIC_CANDIDATES_ONLY',createdAt:new Date().toISOString(),
  sourceCommit:baselineCommit,
  engineSha256:createHash('sha256').update(original).digest('hex'),
  runtimeModified:false,productionModified:false,
  limitations:[
    'Synthetic five-card fixtures without live account, mercenary, magic or CMS snapshots.',
    'Controlled single apocalypse boss; not the live seven-enemy legion encounter.',
    'A lower skill coefficient alone does not create a mandatory suit requirement.',
    'Removing the floor and normalizing pierce are candidates, not approved release values.'
  ],
  seedCount,weaponCode:'EQ_1785427638137',chips,
  candidateChanges:{
    CURRENT:[],
    SKILL_ONE_THIRD:['Skill base multiplier 12 -> 4; ordinary multiplier remains 4.'],
    OWN_POWER_NO_FLOOR:['Skill base 12 -> 4.','Suit attacks no longer inherit monster-max-HP minimum damage.'],
    OWN_POWER_FIXED_PIERCE_CLOCK:['Skill base 12 -> 4.','No monster-max-HP minimum for suit attacks.','Apocalypse pierce reference cycle cannot be faster than the fixed suit cycle; slower legacy cycles are preserved.']
  },matchups:[]
};
for(const [model,source] of Object.entries(sources)){
  const resolvable=source.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,engineUrl).href));
  const {createPveBattleV2}=await import('data:text/javascript;base64,'+Buffer.from(resolvable+'\n// '+model).toString('base64'));
  for(const bossPower of [2_000_000,80_000_000])for(const deckRatio of [1,1.2,1.7]){
    const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:'CONTROL-'+i,title:'Synthetic '+i,rarity:'FUR',power_type,power:bossPower*deckRatio/5}));
    const monster={id:999,name:'Synthetic apocalypse target',battle_power:bossPower,is_boss:1,pve_difficulty:'APOCALYPSE',pve_hp_percent:260,pve_attack_percent:220,pve_defense_percent:190,pve_speed_percent:160,pve_shield_percent:40,pve_attack_count:2,pve_forced_action_every:4};
    for(const suitPower of [0,1,...[.005,.025,.05,.075,.1,.15,.3].map(r=>Math.round(bossPower*r))]){
      let wins=0,totalDamage=0,chipDamage=0,sample;
      for(let seed=1;seed<=seedCount;seed++){
        const battle=createPveBattleV2({cards,monster,battleSuit:suitPower?{code:'BATTLE_SUIT_03',pvePower:suitPower,weapon:{code:report.weaponCode},skillChips:chips}:null,seed,bossUltimatePercent:28});
        wins+=battle.result.winner==='A'?1:0;
        totalDamage+=battle.result.damageBreakdown.total;
        chipDamage+=battle.result.damageBreakdown.skillChips;
        if(seed===1){
          const opening=battle.result.timeline.find(e=>e.type==='SKILL_CHIP_CAST'&&e.chipCode==='SKILL_CHIP_OCTA_SEEKER');
          sample={seed,bossMaxHp:battle.teams.B.cards[0].maxHp,openingOctaDamage:opening?.calculatedDamage??null};
        }
      }
      report.matchups.push({model,bossPower,deckRatio,suitPower,wins,losses:seedCount-wins,chipDamageSharePercent:totalDamage?Math.round(chipDamage/totalDamage*10000)/100:0,sample});
    }
  }
}
const file=resolve(process.argv[2]||'battle-suit-growth-audit-20261005.json');
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:file,battles:report.matchups.length*seedCount,keyResults:report.matchups.filter(r=>r.bossPower===80_000_000&&(r.deckRatio===1&&[0,1,4_000_000,6_000_000,8_000_000,12_000_000].includes(r.suitPower)||r.deckRatio===1.7&&r.suitPower===0))},null,2));
