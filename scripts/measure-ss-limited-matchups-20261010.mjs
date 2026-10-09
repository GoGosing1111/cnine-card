import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {measureSSLimitedBalance} from './measure-ss-limited-balance-20261008.mjs';
import {measureSSLimitedPve} from './measure-ss-limited-tempo-20261009.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_TEMPO,SS_LIMITED_PVP_LINK_SCALES,SS_LIMITED_TARGET,SS_LIMITED_BALANCE_VERSION} from '../shared/mercenary-ss-limited-v1.mjs';
export const matchupPolicyFingerprint=()=>createHash('sha256').update(JSON.stringify({profiles:SS_LIMITED_COMBAT,tempo:SS_LIMITED_TEMPO,pvpLinkScales:SS_LIMITED_PVP_LINK_SCALES})).digest('hex');
// Independent strata avoid reusing one random stream across all 35 formations.
// Common case seeds still compare calibration candidates under identical draws.
export const matchupCaseSeed=({opponent,formation,side,index})=>createHash('sha256').update(`SS-LIMITED-20261010|${opponent}|${formation}|${side}|${index}`).digest().readUInt32LE(0)||1;
export function measureSSLimitedMatchups(options={}){
 const report=measureSSLimitedBalance({...options,seedForCase:matchupCaseSeed});
 return {...report,date:'2026-10-10',scope:'CANONICAL_SERVER_PVP_MATCHUP_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',policyVersion:SS_LIMITED_BALANCE_VERSION,policyFingerprint:matchupPolicyFingerprint(),
  target:SS_LIMITED_TARGET,tempo:SS_LIMITED_TEMPO,pvpLinkScales:SS_LIMITED_PVP_LINK_SCALES,excludes:[...SS_LIMITED_TARGET.excludes],seedMultiplier:null,seedStrategy:'SHA256_PER_OPPONENT_FORMATION_SIDE_INDEX',
  rows:report.rows.map(row=>({...row,opponents:row.opponents.map(opponent=>({...opponent,target:SS_LIMITED_TARGET.matchups[opponent.code],withinTarget:opponent.winRate>=SS_LIMITED_TARGET.matchups[opponent.code].min&&opponent.winRate<=SS_LIMITED_TARGET.matchups[opponent.code].max}))}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 const report=measureSSLimitedMatchups({count:Number(value('--count',128)),start:Number(value('--start',310001)),codes:value('--codes',Object.keys(SS_LIMITED_COMBAT).join(',')).split(','),
  onProgress:r=>console.log(JSON.stringify({code:r.code,name:r.name,total:r.total,opponents:r.opponents.map(o=>({code:o.code,winRate:o.winRate}))}))});
 if(args.includes('--pve'))report.pve=measureSSLimitedPve({count:4,start:330001});
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,policyFingerprint:report.policyFingerprint,outside:report.rows.flatMap(r=>r.opponents.filter(o=>!o.withinTarget).map(o=>({code:r.code,opponent:o.code,winRate:o.winRate})))}));
}
