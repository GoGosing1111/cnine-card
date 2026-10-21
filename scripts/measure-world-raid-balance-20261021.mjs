import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {raidCombatSnapshotV1293,cleanRaidSettingsV1293} from '../functions/_raid_overhaul.js';
import {normalizeStoredWeeklyRaidConfig} from '../functions/_raid_weekly_cms_v2141.js';
import {WEEKLY_RAID_BOSSES_V1,weeklyRaidBossSettings} from '../functions/_raid_weekly_bosses_v1.js';
import {WORLD_RAID_TUNING_20261021 as tuning,WORLD_RAID_CLEAR_COIN_20261021 as coin,WORLD_RAID_BATTLE_SECONDS_20261021 as seconds} from '../shared/world-raid-balance-20261021.mjs';
export const baseline=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/world-raid-cms-20261021.json',import.meta.url)));
export const population=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/world-raid-population-20261021.json',import.meta.url)));
const stored=Object.fromEntries(baseline.meta.map(r=>[r.key,r.value]));
const weekly=normalizeStoredWeeklyRaidConfig(stored.raid_weekly_boss_settings_v2141),common=JSON.parse(stored.raid_settings_v1);
const source=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const projectedSource=source.slice(source.indexOf('function raidProjectedDamage('),source.indexOf('\nasync function repairRaidZeroDamage')).trim();
const projected=vm.runInNewContext('('+projectedSource+')');
export function settingsFor(code,changed=false){
 const base=WEEKLY_RAID_BOSSES_V1.find(b=>b.code===code),row=baseline.bosses.find(b=>b.name===base.name),cms=structuredClone(weekly.bosses[code]),target=tuning[code];
 if(changed){cms.bossAttackPower=target.attack;cms.rewards.clear=cms.rewards.clear.map(r=>r.type==='COIN'?{...r,amount:coin}:r);}
 const profile={...base,...cms,maxHp:Number(row.max_hp),defenseRate:changed?target.defense:Number(row.defense_rate),ultimate:{...base.ultimate,...cms.ultimate},minions:base.minions.map((m,i)=>({...m,...cms.minions[i]}))};
 return cleanRaidSettingsV1293(weeklyRaidBossSettings(changed?{...common,battleSeconds:seconds}:common,profile));
}
export function simulate(cfg,players){
 const start=Date.parse('2026-10-21T00:00:00Z');
 const s=raidCombatSnapshotV1293(players.map(p=>({...p,totalDamage:projected(p.totalPower,cfg)})),{status:'BATTLE',starts_at:new Date(start).toISOString()},cfg,start+cfg.battleSeconds*1000);
 return {clear:s.cleared,seconds:Math.round((s.clearedAtMs??s.wipedAtMs??s.durationMs)/1000),survivors:s.states.filter(p=>!p.isDefeated).length,hpLeftPercent:s.states.reduce((sum,p)=>sum+p.currentHp,0)/s.states.reduce((sum,p)=>sum+p.maxHp,0)*100,bossHpPercent:Math.round(s.bossHpPct*10000)/100,ultimateCasts:s.ultimateCasts};
}
const median=a=>{a=[...a].sort((a,b)=>a-b);const i=Math.floor(a.length/2);return a.length?Math.round((a.length%2?a[i]:(a[i]+a[i-1])/2)*100)/100:null};
export function summarize(rs){const wins=rs.filter(s=>s.clear);return {trials:rs.length,clears:wins.length,clearPercent:rs.length?Math.round(wins.length/rs.length*10000)/100:null,medianClearSeconds:median(wins.map(s=>s.seconds)),medianSurvivors:median(wins.map(s=>s.survivors)),medianPartyHpLeftPercent:median(wins.map(s=>s.hpLeftPercent)),medianUltimateCasts:median(wins.map(s=>s.ultimateCasts))};}
export const hash=text=>createHash('sha256').update(text).digest('hex');
export function measure(){
 let seed=20261022;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const groups=Array.from({length:1000},()=>{const p=[...population.players];for(let i=p.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[p[i],p[j]]=[p[j],p[i]];}return p.slice(0,20);});
 const strongest=[...population.players].sort((a,b)=>b.totalPower-a.totalPower);let totalSimulations=0;
 const run=(cfg,p)=>{totalSimulations++;return simulate(cfg,p);};
 const bosses=Object.keys(tuning).map(code=>({code,name:tuning[code].displayName,...Object.fromEntries([['before',false],['after',true]].map(([version,changed])=>{
  const cfg=settingsFor(code,changed),history=population.historical.filter(h=>h.code===code),historical=history.map(h=>({...run(cfg,h.players),size:h.players.length}));
  let duoClears=null;if(changed){duoClears=0;for(let i=0;i<strongest.length;i++)for(let j=i+1;j<strongest.length;j++)if(run(cfg,[strongest[i],strongest[j]]).clear)duoClears++;}
  return [version,{settings:{hp:cfg.bossProfile.maxHp,defense:cfg.bossProfile.defenseRate,attack:cfg.bossAttackPower,interval:cfg.bossAttackIntervalMs,battleSeconds:cfg.battleSeconds,clearCoin:cfg.clearCoin},groups:Object.fromEntries([5,10,12,15,20].map(n=>[n,summarize(groups.map(g=>run(cfg,g.slice(0,n))))])),historical:summarize(historical),historical10to15:summarize(historical.filter(h=>h.size>=10&&h.size<=15)),strongestSolo:run(cfg,strongest.slice(0,1)),strongestDuo:run(cfg,strongest.slice(0,2)),allObservedDuoPairs:changed?{trials:strongest.length*(strongest.length-1)/2,clears:duoClears}:null}];
 }))}));
 const inputs=['functions/_raid_overhaul.js','functions/_raid_weekly_cms_v2141.js','functions/_raid_weekly_bosses_v1.js','shared/world-raid-balance-20261021.mjs','tests/fixtures/world-raid-cms-20261021.json','tests/fixtures/world-raid-population-20261021.json'];
 const hashes=Object.fromEntries(inputs.map(p=>[p,hash(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'))]));
 return {capturedAt:population.capturedAt,baselineAt:baseline.capturedAt,seed:20261022,players:population.players.length,historicalParties:population.historical.length,totalSimulations,method:'Unmodified authoritative server model and projected-damage function; latest observed power per ordinary player, deterministic samples without replacement. These are simulations, not future live win rates.',hashes,projectedSourceHash:hash(projectedSource),bosses};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=measure();fs.mkdirSync(new URL('../docs/qa/world-raid-balance-20261021/',import.meta.url),{recursive:true});
 fs.writeFileSync(new URL('../docs/qa/world-raid-balance-20261021/measurement.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({total:result.totalSimulations,bosses:result.bosses.map(b=>({name:b.name,after:b.after}))}));
}
