import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {mercenaryLevelDraft,attachMercenaryLevel,MERCENARY_GROWTH_REVIEW,mercenaryGrowthLevelTable} from '../shared/mercenary-level-v1.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {kaironDeploymentSnapshot} from '../shared/mercenary-kairon-v1.mjs';
import {jinmuDeploymentSnapshot} from '../shared/mercenary-jinmu-v1.mjs';
import {shiranuiDeploymentSnapshot} from '../shared/mercenary-shiranui-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {PVP_POWER_BALANCE_REVIEW} from '../shared/pvp-power-balance-v1.mjs';
import {sssReferences} from './measure-ss-limited-balance-20261008.mjs';
import {tierCards,tierDecks} from '../tests/helpers/mercenary-operating-roster-v2144.mjs';
export function growthReviewPolicy(){const p=mercenaryLevelDraft();p.growth=structuredClone(MERCENARY_GROWTH_REVIEW);Object.keys(p.xpPerCard).forEach(k=>p.xpPerCard[k]=100);p.levels.forEach(r=>r.requiredXp=1000);p.milestones.forEach(r=>r.successChancePpm=500000);return p;}
export function growthState(level){return {level,experience:0,breakthroughMask:level===20?15:level>15?7:level>10?3:level>5?1:0,revision:1};}
export function growthLimitedSnapshot(code){const row=code==='V-988'?kaironDeploymentSnapshot():code==='V-989'?jinmuDeploymentSnapshot():code==='V-987'?shiranuiDeploymentSnapshot():limitedDeploymentSnapshot(code);return {...row,combat:sssReferences[0].combat};}
export function measureMercenaryGrowth({count=12,start=730001}={}){
 const policy=growthReviewPolicy(),rows=[],pairs=[[1,1],[6,1],[11,1],[16,1],[20,1],[20,6],[20,11],[20,20]],powers=[180000,1000000,20000000],codes=['V-996','V-999','V-988','V-989','V-987'];
 for(const regular of sssReferences)for(const code of codes)for(const [level,otherLevel]of pairs){
  const ordinary=attachMercenaryLevel(regular,policy,growthState(level)),limited=attachMercenaryLevel(growthLimitedSnapshot(code),policy,growthState(otherLevel));
  const row={code:regular.code,name:regular.name,level,limited:code,limitedLevel:otherLevel,wins:0,total:0,draws:0,formations:[]};
  for(const power of powers)for(const [deck,types]of Object.entries(tierDecks)){
   const f={power,deck,wins:0,total:0,draws:0,sides:{A:0,B:0}};
   for(const side of ['A','B'])for(let i=0;i<count;i++){
    const result=createPvpBattleV2({attackerCards:tierCards(power,types),defenderCards:tierCards(power,types),attackerMercenary:side==='A'?ordinary:limited,defenderMercenary:side==='B'?ordinary:limited,seed:start+i*7919,[PVP_POWER_BALANCE_REVIEW]:true}).result;
    f.total++;if(result.winner===side){f.wins++;f.sides[side]++;}if(!['A','B'].includes(result.winner))f.draws++;
   }
   f.winRate=f.wins/f.total;row.formations.push(f);row.wins+=f.wins;row.total+=f.total;row.draws+=f.draws;
  }
  row.winRate=row.wins/row.total;rows.push(row);
 }
 return {sourceFingerprints:Object.fromEntries(['shared/mercenary-growth-review-v2.mjs','shared/mercenary-level-v1.mjs','functions/_mercenary_combat.js','functions/_battle_v2_preview.js','shared/pvp-power-balance-v1.mjs'].map(file=>[file,createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),scope:'ISOLATED_V2_GROWTH_AND_PVP_BONUS_REVIEW_NOT_PRODUCTION_WIN_RATE',releaseEnabled:false,productionPolicyWritten:false,economyValues:'FIXTURE_ONLY_NOT_APPROVED',profile:policy.growth,table:mercenaryGrowthLevelTable(policy.growth),seeds:{start,count,step:7919},powers,decks:Object.keys(tierDecks),rows,total:rows.reduce((n,r)=>n+r.total,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const out=process.argv[2],result=measureMercenaryGrowth();if(out)fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({total:result.total,rows:result.rows.map(({formations,...r})=>r)}));}
