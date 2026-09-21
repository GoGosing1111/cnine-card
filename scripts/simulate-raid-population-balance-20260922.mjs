import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
const {raidCombatSnapshotV1293,cleanRaidSettingsV1293}=await import(pathToFileURL(root+'/functions/_raid_overhaul.js'));
const {WEEKLY_RAID_BOSSES_V1,weeklyRaidBossSettings}=await import(pathToFileURL(root+'/functions/_raid_weekly_bosses_v1.js'));
const source=readFileSync(root+'/functions/api/[[path]].js','utf8');
const projected=source.slice(source.indexOf('function raidProjectedDamage('),source.indexOf('\nasync function repairRaidZeroDamage'));
const raidProjectedDamage=vm.runInNewContext('('+projected.trim()+')');
const start=Date.parse('2026-09-22T12:00:00Z');
const sorted=[...input.players].sort((a,b)=>b.totalPower-a.totalPower);
const low=[...sorted].reverse().slice(0,20);
const middle=sorted.slice(Math.floor(sorted.length/2)-10,Math.floor(sorted.length/2)+10);
const cohorts=[{name:'strongest_solo',players:sorted.slice(0,1)},{name:'strongest_duo',players:sorted.slice(0,2)},... [5,10,15,20].map(n=>({name:'representative_'+n,players:Array.from({length:n},(_,i)=>sorted[Math.floor((i+.5)*sorted.length/n)])})),{name:'median_20',players:middle},{name:'strongest_20',players:sorted.slice(0,20)},{name:'weakest_20',players:low},{name:'mixed_15_median_5_weakest',players:[...middle.slice(0,15),...low.slice(0,5)]}];
const rooms=Object.values(Object.groupBy(input.roomPlayers,x=>x.roomId)).filter(r=>r.length>=15&&r.length<=20);
let seed=20260922;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const randomGroups=Array.from({length:1000},()=>{const pool=[...input.players];for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,20);});
function cfgFor(base,change={},commonChange={}){
 const row=input.rows.find(x=>x.name===base.name),tuning=input.weekly.bosses[base.code];
 const profile={...base,...tuning,maxHp:Number(row.max_hp),defenseRate:Number(row.defense_rate),ultimate:{...base.ultimate,...tuning.ultimate},minions:base.minions.map((x,i)=>({...x,...tuning.minions[i]})),...change};
 return cleanRaidSettingsV1293(weeklyRaidBossSettings({...input.common,...commonChange},profile));
}
function simulate(cfg,players){
 const participants=players.map(p=>({...p,totalDamage:raidProjectedDamage(p.totalPower,cfg)}));
 const result=raidCombatSnapshotV1293(participants,{status:'BATTLE',starts_at:new Date(start).toISOString(),max_hp:cfg.bossProfile.maxHp},cfg,start+cfg.battleSeconds*1000);
 return {cleared:result.cleared,seconds:Math.round((result.clearedAtMs??result.wipedAtMs??result.durationMs)/1000),bossHpRemainingPct:Math.round(result.bossHpPct*1000)/10,survived:result.states.filter(s=>!s.isDefeated).length,firstDefeatSeconds:Math.round(Math.min(...result.states.filter(s=>s.isDefeated).map(s=>s.defeatedAtMs))/1000)||null,minionsDefeated:result.minionsDefeated,ultimates:result.ultimateCasts};
}
function resultFor(cfg){
 const results=cohorts.map(g=>({cohort:g.name,...simulate(cfg,g.players)}));
 const groups=randomGroups.map(g=>simulate(cfg,g)),real=rooms.map(g=>simulate(cfg,g));
 const clearSeconds=groups.filter(g=>g.cleared).map(g=>g.seconds).sort((a,b)=>a-b);
 return {results,random20:{cleared:groups.filter(g=>g.cleared).length,total:groups.length,minSeconds:clearSeconds[0],medianSeconds:clearSeconds[Math.floor(clearSeconds.length/2)],maxSeconds:clearSeconds.at(-1)},real15To20:{cleared:real.filter(g=>g.cleared).length,total:real.length}};
}
const existing=WEEKLY_RAID_BOSSES_V1.map(b=>({name:b.name,...resultFor(cfgFor(b))}));
const candidates=[];
for(const base of WEEKLY_RAID_BOSSES_V1){
 const every=3,rage=2,hp=700_000_000+WEEKLY_RAID_BOSSES_V1.indexOf(base)*50_000_000;
 const bossIndex=WEEKLY_RAID_BOSSES_V1.indexOf(base),interval=60_000,tuning={maxHp:hp,bossAttackPower:Math.ceil(input.hashirama[0].fighter.attack*(1.05+bossIndex*.025)),bossAttackIntervalMs:interval,ultimate:{...base.ultimate,everyAttacks:every},minions:base.minions.map((m,i)=>({...m,maxHp:Math.round(hp*(i?.08:.07))}))};
 const cfg=cfgFor(base,tuning,{phase3EnrageMultiplier:rage,enrageMultiplier:rage});candidates.push({boss:base.name,code:base.code,hp,interval,every,rage,attack:cfg.bossAttackPower,settings:cfg,...resultFor(cfg)});
}
const report={checkedAt:input.checkedAt,population:input.players.length,existing,candidates};
writeFileSync(process.argv[3],JSON.stringify(report,null,2));
console.log(JSON.stringify(candidates.map(c=>({boss:c.boss,hp:c.hp,rage:c.rage,attack:c.attack,soloCleared:c.results[0].cleared,duoCleared:c.results[1].cleared,random20:c.random20,real:c.real15To20})),null,2));
