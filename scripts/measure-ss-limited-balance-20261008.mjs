import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from '../tests/fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
import {LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {SS_LIMITED_COMBAT,SS_LIMITED_BALANCE_VERSION} from '../shared/mercenary-ss-limited-v1.mjs';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
import {equippedFixture,equippedDeck} from './measure-berkan-pvp-reform-20260930.mjs';

export const ssLimitedSnapshot=code=>({...LIMITED_MERCENARIES.find(c=>c.code===code),statMode:'RANK_FIXED',level:1,combat:fixture.combat});
export const sssReferences=fixture.roster.filter(c=>c.rank==='SSS').map(c=>({...c,combat:fixture.combat}));
export const ssLimitedFormations=[
 ...[10000,20000000,2000000000].flatMap(power=>Object.entries(tierDecks).map(([deck,types])=>({id:`basic-${power}-${deck}`,group:'BASIC',cards:tierCards(power,types),magic:[]}))),
 ...equippedFixture.formations.map(f=>({id:`equipped-${f.id}`,group:'EQUIPPED',cards:equippedDeck(f),magic:equippedFixture.magicProfiles[f.magic]}))
];
const tally=()=>({wins:0,draws:0,total:0});
const score=(row,winner,side)=>{row.total++;row.wins+=Number(winner===side);row.draws+=Number(!['A','B'].includes(winner));};
function result(row){
 const rate=row.wins/row.total,z=1.96,n=row.total,center=(rate+z*z/(2*n))/(1+z*z/n),margin=z*Math.sqrt(rate*(1-rate)/n+z*z/(4*n*n))/(1+z*z/n);
 return {...row,losses:row.total-row.wins-row.draws,winRate:rate,wilson95:[center-margin,center+margin]};
}
export function measureSSLimitedBalance({count=128,start=70001,seedStarts={},codes=Object.keys(SS_LIMITED_COMBAT),formationIds=null,seedForCase=null,onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||start<1||(start+count)*7919>0xffffffff)throw Error('Invalid seed range');
 const formations=ssLimitedFormations.filter(f=>!formationIds||formationIds.includes(f.id)),rows=[];
 if(!formations.length||codes.some(code=>!SS_LIMITED_COMBAT[code]))throw Error('Invalid balance scope');
 for(const code of codes){
  const firstSeed=seedStarts[code]??start;if(!Number.isSafeInteger(firstSeed)||firstSeed<1||(firstSeed+count)*7919>0xffffffff)throw Error('Invalid per-fighter seed range');
  const limited=ssLimitedSnapshot(code),all=tally(),sides={A:tally(),B:tally()},groups={BASIC:tally(),EQUIPPED:tally()},opponents=[],formationRows=[];
  for(const opponent of sssReferences){const total=tally();
   for(const formation of formations){const row=tally();
    for(const side of ['A','B'])for(let i=firstSeed;i<firstSeed+count;i++){
     const winner=createPvpBattleV2({attackerCards:formation.cards,defenderCards:formation.cards,attackerMagicCards:formation.magic,defenderMagicCards:formation.magic,
      attackerMercenary:side==='A'?limited:opponent,defenderMercenary:side==='B'?limited:opponent,seed:seedForCase?seedForCase({opponent:opponent.code,formation:formation.id,side,index:i}):i*7919}).result.winner;
     for(const target of [all,total,row,sides[side],groups[formation.group]])score(target,winner,side);
    }
    formationRows.push({opponent:opponent.code,formation:formation.id,group:formation.group,...result(row)});
   }
   opponents.push({code:opponent.code,name:opponent.name,...result(total)});
  }
  const row={code,name:limited.name,scale:SS_LIMITED_COMBAT[code].scale,validationSeedStart:firstSeed,...result(all),sides:Object.fromEntries(Object.entries(sides).map(([key,value])=>[key,result(value)])),groups:Object.fromEntries(Object.entries(groups).filter(([,v])=>v.total).map(([key,value])=>[key,result(value)])),opponents,formations:formationRows};
  rows.push(row);onProgress(row);
 }
 return {date:'2026-10-08',scope:'CANONICAL_PRE_RELEASE_SIMULATION_NOT_LIVE_PLAYER_WIN_RATE',policyVersion:SS_LIMITED_BALANCE_VERSION,cmsRevision:fixture.cmsRevision,
  profileFingerprint:createHash('sha256').update(JSON.stringify(SS_LIMITED_COMBAT)).digest('hex'),target:{min:.48,max:.50},level:1,count,start,seedStarts:Object.fromEntries(codes.map(code=>[code,seedStarts[code]??start])),seedMultiplier:7919,formationCount:formations.length,formationWeights:'EQUAL',opponents:sssReferences.map(c=>({code:c.code,name:c.name})),excludes:['V-996'],rows,total:rows.reduce((n,r)=>n+r.total,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
 // After the first Ines validation exceeded the target, only her revised
 // policy used a fresh holdout. The other six validated policies stay intact.
 const report=measureSSLimitedBalance({count:Number(value('--count',128)),start:Number(value('--start',70001)),seedStarts:args.includes('--final')?{'V-992':90001}:{},codes:value('--codes',Object.keys(SS_LIMITED_COMBAT).join(',')).split(','),
  onProgress:r=>console.log(JSON.stringify({code:r.code,name:r.name,scale:r.scale,wins:r.wins,total:r.total,winRate:r.winRate,groups:r.groups,opponents:r.opponents.map(o=>({code:o.code,winRate:o.winRate}))}))});
 const out=value('--out',null);if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,count:report.count,start:report.start}));
}
