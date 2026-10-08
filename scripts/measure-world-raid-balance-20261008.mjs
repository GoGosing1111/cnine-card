import fs from 'node:fs';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {raidCombatSnapshotV1293,cleanRaidSettingsV1293} from '../functions/_raid_overhaul.js';
import {WEEKLY_RAID_BOSSES_V1,weeklyRaidBossSettings} from '../functions/_raid_weekly_bosses_v1.js';
import {WORLD_RAID_TUNING} from '../shared/world-raid-balance-20261008.mjs';
export const input=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/world-raid-balance-20261008.json',import.meta.url)));
const source=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
export const projected=vm.runInNewContext('('+source.slice(source.indexOf('function raidProjectedDamage('),source.indexOf('\nasync function repairRaidZeroDamage')).trim()+')');
export function configFor(code,changed=false){
 const base=WEEKLY_RAID_BOSSES_V1.find(b=>b.code===code),row=input.bosses.find(r=>r.name===base.name),stored=input.weekly.bosses[code],change=changed?WORLD_RAID_TUNING[code]:null;
 const profile={...base,...stored,maxHp:change?.hp??Number(row.max_hp),defenseRate:Number(row.defense_rate),bossAttackPower:change?.attack??stored.bossAttackPower,bossAttackIntervalMs:change?.interval??stored.bossAttackIntervalMs,ultimate:{...base.ultimate,...stored.ultimate},minions:base.minions.map((m,i)=>({...m,...stored.minions[i],maxHp:change?.minions[i]??stored.minions[i].maxHp}))};
 return cleanRaidSettingsV1293(weeklyRaidBossSettings(input.common,profile));
}
export function simulate(cfg,players,seconds=cfg.battleSeconds){
 const start=Date.parse('2026-10-08T12:00:00Z');
 const snapshot=raidCombatSnapshotV1293(players.map(p=>({...p,totalDamage:projected(p.totalPower,cfg)})),{status:'BATTLE',starts_at:new Date(start).toISOString(),max_hp:cfg.bossProfile.maxHp},cfg,start+seconds*1000);
 return {cleared:snapshot.cleared,seconds:Math.round((snapshot.clearedAtMs??snapshot.wipedAtMs??snapshot.durationMs)/1000),bossHpPercent:Math.round(snapshot.bossHpPct*10000)/100,survived:snapshot.states.filter(s=>!s.isDefeated).length,firstDefeat:Math.min(...snapshot.states.filter(s=>s.isDefeated).map(s=>s.defeatedAtMs/1000))||null,ultimateCasts:snapshot.ultimateCasts};
}
function summarize(rows){const wins=rows.filter(r=>r.cleared),times=wins.map(r=>r.seconds).sort((a,b)=>a-b);return{trials:rows.length,clears:wins.length,clearPercent:Math.round(wins.length/rows.length*10000)/100,medianClearSeconds:times[Math.floor(times.length/2)]??null,meanSurvivors:Math.round(wins.reduce((n,r)=>n+r.survived,0)/Math.max(1,wins.length)*100)/100};}
export function measure(){
 let seed=871943;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const groups=Array.from({length:1000},()=>{const pool=[...input.players];for(let i=pool.length-1;i;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,20)});
 const strongest=[...input.players].sort((a,b)=>b.totalPower-a.totalPower);
 const bosses=WEEKLY_RAID_BOSSES_V1.map(base=>({code:base.code,name:base.name,...Object.fromEntries([['before',false],['after',true]].map(([version,changed])=>{
  const cfg=configFor(base.code,changed);return [version,{settings:{hp:cfg.bossProfile.maxHp,attack:cfg.bossAttackPower,interval:cfg.bossAttackIntervalMs,minions:cfg.bossProfile.minions.map(m=>m.maxHp)},groups:Object.fromEntries([5,10,15,20].map(count=>[count,summarize(groups.map(g=>simulate(cfg,g.slice(0,count))))])),historical:summarize(input.historicalParties.map(g=>simulate(cfg,g.players))),strongestSolo:simulate(cfg,strongest.slice(0,1)),strongestDuo:simulate(cfg,strongest.slice(0,2))}];
 }))}));
 const hashes={};for(const path of ['functions/_raid_overhaul.js','tests/fixtures/world-raid-balance-20261008.json','shared/world-raid-balance-20261008.mjs'])hashes[path]=createHash('sha256').update(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
 return{capturedAt:input.capturedAt,seed:871943,players:input.players.length,historicalParties:input.historicalParties.length,totalSimulations:3*2*(4000+input.historicalParties.length+2),method:'Canonical world raid server model; equal sampled powers and variance buckets before/after; 1000 held-out groups for each of 5/10/15/20 players. Simulated, not observed live win rates.',hashes,bosses};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const report=measure();fs.writeFileSync(new URL('../docs/world-raid-balance-20261008.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.totalSimulations,bosses:report.bosses.map(b=>({name:b.name,before:b.before.groups,after:b.after.groups,history:b.after.historical,solo:b.after.strongestSolo.cleared,duo:b.after.strongestDuo.cleared}))},null,2));}
