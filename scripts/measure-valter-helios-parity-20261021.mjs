// Read-only balance research: evaluate a pinned Git revision in disposable copies.
// This script never edits runtime source, account state, CMS, or a saved battle.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
const repo=path.resolve(args['--repo']||process.cwd());
const ref=args['--ref']||'c5ede5dace2e5ab197bccdb5c0f29e640be5c1ab';
const samples=Number(args['--samples']||32);
const seedStart=Number(args['--seed-start']||910001);
const levels=(args['--levels']||'1').split(',').map(Number);
const gears=(args['--gears']||'0').split(',').map(Number);
const names=(args['--variants']||'baseline,tempo,linked,passive').split(',');
const out=path.resolve(args['--out']||'docs/qa/valter-helios-parity-20261021/screening.json');
const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true});
const commit=git('rev-parse',ref).trim();
const sources=new Map();
function read(relative){
  relative=relative.replaceAll('\\','/');
  if(sources.has(relative))return sources.get(relative);
  const text=git('show',commit+':'+relative);sources.set(relative,text);
  if(/\.(?:mjs|js)$/.test(relative)){
    const imports=/^\s*(?:import\s+(?:[^'";]*?\s+from\s*)?|export\s+[^'";]*?\s+from\s*)['"](\.[^'"]+)['"]/gm;
    for(const match of text.matchAll(imports))read(path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[1].split('?')[0])));
  }
  return text;
}
read('functions/_battle_v2_preview.js');
read('shared/mercenary-limited-deployment-v1.mjs');
const fixture=JSON.parse(git('show',commit+':tests/fixtures/mercenary-valter-roster-20261008.json'));
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'valter-helios-parity-'));
const decks={balanced:['ATTACK','DEFENSE','SPEED','HP','ATTACK'],attack:['ATTACK','ATTACK','ATTACK','ATTACK','HP'],defense:['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],speed:['SPEED','SPEED','SPEED','HP','ATTACK']};
const cards=(power,types)=>types.map((power_type,i)=>({id:'RESEARCH-'+i,power,power_type}));
const variants={
  baseline:{},
  tempo:{speedScale:3.12,actionCredit:3.12},
  linked:{speedScale:3.12,actionCredit:3.12,link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8}},
  passive:{speedScale:3.12,actionCredit:3.12,basicCapScale:2.08,damageTakenScale:.24,basicMultiplier:1.04,areaRatio:5.824},
  linked_guard:{speedScale:3.12,actionCredit:3.12,link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8},damageTakenScale:.245},
  linked_armor:{speedScale:3.12,actionCredit:3.12,link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8},innateDefensePercent:4},
  linked_armor_12:{speedScale:3.12,actionCredit:3.12,link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8},innateDefensePercent:12},
  linked_armor_20:{speedScale:3.12,actionCredit:3.12,link:{attackPercent:1830.4,shieldPercent:626.4,hpPercent:1164.8},innateDefensePercent:20},
};
assert.ok(Number.isInteger(samples)&&samples>0);
for(const name of names)assert.ok(Object.hasOwn(variants,name),name);
const report={createdAt:new Date().toISOString(),scope:'ISOLATED_CANONICAL_ENGINE_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',commit,
  combatFixture:{capturedAt:fixture.capturedAt,cmsRevision:fixture.cmsRevision,combat:fixture.combat},
  powerConstraint:{valter:1080000,helios:1123200,changed:false},
  method:{samplesPerSidePerCell:samples,levels,gears,cardPowers:[100000,20000000,1000000000],decks,seedStart,seedMultiplier:7919,liveAccounts:false,liveWrites:false},
  sourceFiles:[...sources].map(([file,content])=>({file,sha256:createHash('sha256').update(content).digest('hex')})),variants:[]};
for(const name of names){
  const directory=path.join(scratch,name),changes=variants[name];
  for(const [relative,original]of sources){
    let content=original;
    if(relative==='shared/mercenary-valter-v1.mjs'){
      const policy={version:2,basePower:1080000,speedScale:3,actionCredit:3,link:{attackPercent:1760,shieldPercent:600,hpPercent:1120},basicCapScale:2,damageTakenScale:.25,hardCounter:'V-055',...changes};
      delete policy.basicMultiplier;delete policy.areaRatio;delete policy.innateDefensePercent;
      content=content.replace(/export const VALTER_COMBAT=Object\.freeze\(\{[\s\S]*?\n\}\);/,'export const VALTER_COMBAT=Object.freeze('+JSON.stringify(policy)+');');
      if(changes.areaRatio)content=content.replace('damageRatio:5.6','damageRatio:'+changes.areaRatio);
    }
    if(relative==='functions/_mercenary_combat.js'&&changes.basicMultiplier){
      const needle='return factor*tierScale(a);';assert.ok(content.includes(needle));
      content=content.replace(needle,`return factor*tierScale(a)*(isValter(a)?${changes.basicMultiplier}:1);`);
    }
    if(relative==='functions/_mercenary_combat.js'&&changes.innateDefensePercent){
      const needle='  if(mercenaryEquipmentPower(snapshot,mode)){';assert.equal(content.split(needle).length,2);
      const bonus=`  if(valter)snapshot.stats.defense+=Math.round(buildCardFighter({id:snapshot.code,power:rankPower,type:'NONE'},5,side,null,mode).defense*${changes.innateDefensePercent/100});\n`;
      content=content.replace(needle,bonus+needle);
    }
    await fs.mkdir(path.dirname(path.join(directory,relative)),{recursive:true});
    await fs.writeFile(path.join(directory,relative),content);
  }
  // Explicit .js ESM avoids relying on a caller's package scope.
  await fs.writeFile(path.join(directory,'package.json'),'{"type":"module"}\n');
  const load=relative=>import(pathToFileURL(path.join(directory,relative)).href);
  const engine=await load('functions/_battle_v2_preview.js');
  const {limitedDeploymentSnapshot}=await load('shared/mercenary-limited-deployment-v1.mjs');
  const {MERCENARY_GROWTH_REVIEW}=await load('shared/mercenary-growth-review-v2.mjs');
  const {VALTER_COMBAT}=await load('shared/mercenary-valter-v1.mjs');
  assert.equal(VALTER_COMBAT.basePower,1080000);
  const snapshot=(code,level=1,gear=0,mode='PVP')=>({...limitedDeploymentSnapshot(code),combat:fixture.combat,
    ...(gear?{equipment:{schemaVersion:1,mode,power:gear}}:{}),
    mercenaryLevel:{version:2,level,breakthroughMask:level===20?15:level>15?7:level>10?3:level>5?1:0,growth:structuredClone(MERCENARY_GROWTH_REVIEW)}});
  const data={name,changes,policy:VALTER_COMBAT,pvp:[],pve:[],opening:[]},started=Date.now();
  for(const level of levels)for(const gear of gears)for(const power of report.method.cardPowers)for(const [deck,types]of Object.entries(decks)){
    const team=cards(power,types),v=snapshot('V-996',level,gear),h=snapshot('V-999',level,gear);
    const row={level,gear,power,deck,wins:0,losses:0,draws:0,total:0,bySide:{A:{wins:0,total:0},B:{wins:0,total:0}}};
    for(const side of ['A','B'])for(let i=0;i<samples;i++){
      const battle=engine.createPvpBattleV2({attackerCards:team,defenderCards:team,attackerMercenary:side==='A'?v:h,defenderMercenary:side==='B'?v:h,seed:(seedStart+i)*7919});
      const result=battle.result;
      row.total++;row.bySide[side].total++;
      if(result.winner===side){row.wins++;row.bySide[side].wins++;}else if(['A','B'].includes(result.winner))row.losses++;else row.draws++;
      if(i===0&&side==='A'&&deck==='balanced'){
        const pick=team=>{const f=team.mercenaries[0];return {code:f.code,power:f.power,basePower:f.basePower,hp:f.maxHp,attack:f.attack,defense:f.defense,speed:f.speed,shield:f.shield,link:f.mercenaryLink,growth:f.mercenaryGrowth};};
        const opening={level,gear,power,valter:pick(battle.teams.A),helios:pick(battle.teams.B)};
        assert.equal(opening.valter.basePower,1080000+gear);assert.equal(opening.helios.basePower,1123200+gear);
        assert.equal(opening.valter.power,1080000+gear);assert.equal(opening.helios.power,1123200+gear);
        data.opening.push(opening);
      }
    }
    row.winRate=row.wins/row.total;data.pvp.push(row);
  }
  for(const code of ['V-996','V-999'])for(const [deck,types]of Object.entries(decks))for(const monsterPower of [4e9,8e9,1.6e10]){
    const row={code,deck,monsterPower,total:Math.min(samples,16),wins:0,damage:0,actions:0,areaCasts:0};
    for(let i=0;i<row.total;i++){
      const result=engine.createPveBattleV2({cards:cards(2e7,types),mercenary:snapshot(code,1,0,'PVE'),monster:{id:1,battle_power:monsterPower},seed:(920001+i)*7919}).result;
      row.wins+=Number(result.winner==='A');row.damage+=result.damageBreakdown.mercenary||0;row.actions+=result.mercenaryActions||0;
      row.areaCasts+=result.timeline.filter(e=>e.type===('MERCENARY_'+(code==='V-996'?'VALTER':'HELIOS')+'_AREA')).length;
    }
    row.averageDamage=row.damage/row.total;row.averageActions=row.actions/row.total;data.pve.push(row);
  }
  data.elapsedSeconds=(Date.now()-started)/1000;
  data.byCondition=[];
  for(const level of levels)for(const gear of gears)for(const power of report.method.cardPowers){
    const rows=data.pvp.filter(r=>r.level===level&&r.gear===gear&&r.power===power),wins=rows.reduce((n,r)=>n+r.wins,0),total=rows.reduce((n,r)=>n+r.total,0);
    data.byCondition.push({level,gear,power,wins,total,winRate:wins/total});
  }
  report.variants.push(data);
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({variant:name,seconds:data.elapsedSeconds,byCondition:data.byCondition}));
}
console.log(JSON.stringify({report:out,scratch,sourceFiles:sources.size}));
