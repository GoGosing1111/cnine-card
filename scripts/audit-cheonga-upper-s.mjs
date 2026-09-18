// Reproduce the operating CMS 55 A/S matchup audit without touching an account.
// node scripts/audit-cheonga-upper-s.mjs <output.json> [samples=128] [first-seed=1]
import fs from 'node:fs/promises';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {createPvpBattleV2,buildFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {applyMercenaryCombatLink} from '../shared/mercenary-combat-link-v2103.mjs';
import {MERCENARY_RANGED_BALANCE_VERSION as version} from '../shared/mercenary-ranged-balance-v1.mjs';
const output=process.argv[2],n=Number(process.argv[3]||128),start=Number(process.argv[4]||1);
if(!output||!Number.isInteger(n)||n<1||n>1024||!Number.isInteger(start)||start<1)throw Error('Specify output.json, samples 1..1024 and positive first seed');
const source=JSON.parse(await fs.readFile(new URL('../docs/mercenary-cheonga-pvp-nerf-20260918.json',import.meta.url),'utf8'));
const snapshot=row=>({...seed.catalog.cards.find(c=>c.code===row.code),...row,level:1,statMode:'RANK_FIXED',combat:source.combat,skills:row.skills.map(s=>({...seed.document.skills.find(d=>d.id===s.id),...s,review:'REVIEWED'}))});
const compositions={mixed:['ATTACK','DEFENSE','SPEED','HP','ATTACK'],attack:['ATTACK','ATTACK','ATTACK','ATTACK','HP'],defense:['DEFENSE','DEFENSE','DEFENSE','HP','SPEED'],speed:['SPEED','SPEED','SPEED','HP','ATTACK']};
const cheonga=snapshot(source.roster.find(c=>c.code==='V-005')),rows=[];
for(const row of source.roster.filter(c=>['A','S'].includes(c.rank)&&c.code!=='V-005')){
 const opponent=snapshot(row),result={code:row.code,name:row.name,rank:row.rank,team:{games:0,wins:0},duel:{games:0,wins:0,draws:0},groups:[]};
 for(const power of [100000,1000000,20000000])for(const [composition,types] of Object.entries(compositions)){
  const group={power,composition,games:0,wins:0,duelGames:0,duelWins:0,duelDraws:0};
  for(const side of ['A','B'])for(let k=start;k<start+n;k++){
   const cards=types.map((power_type,i)=>({id:String(i+1),power,power_type})),own=side==='A'?'attackerMercenary':'defenderMercenary',other=side==='A'?'defenderMercenary':'attackerMercenary';
   const battle=createPvpBattleV2({attackerCards:cards,defenderCards:cards,[own]:cheonga,[other]:opponent,seed:k*7919});
   group.games++;group.wins+=Number(battle.result.winner===side);
   if(row.rank==='A'){
    const a=buildMercenaryFighter(cheonga,side,'PVP',buildFighter),b=buildMercenaryFighter(opponent,side==='A'?'B':'A','PVP',buildFighter);
    applyMercenaryCombatLink([a,b].map(m=>[...cards.map((c,i)=>buildFighter(c,i,m.side,null,'PVP')),m]));
    const duel=simulateBattleV2Preview({teamA:[side==='A'?a:b],teamB:[side==='B'?a:b],seed:k*7919,maxActions:83,suddenDeathAfter:64,healerPenalty:true});
    group.duelGames++;group.duelWins+=Number(duel.winner===side);group.duelDraws+=Number(!['A','B'].includes(duel.winner));
   }
  }
  result.team.games+=group.games;result.team.wins+=group.wins;
  result.duel.games+=group.duelGames;result.duel.wins+=group.duelWins;result.duel.draws+=group.duelDraws;result.groups.push(group);
 }
 rows.push(result);
 console.log(JSON.stringify({name:row.name,rank:row.rank,teamWinRate:result.team.wins/result.team.games,duel:result.duel}));
}
await fs.writeFile(output,JSON.stringify({version,cmsRevision:source.cmsRevision,checkedAt:new Date().toISOString(),method:{n,start,powers:[100000,1000000,20000000],compositions,sides:['A','B'],seedMultiplier:7919},rows},null,2)+'\n');
if(rows.some(r=>r.rank==='A'&&r.duel.games!==r.duel.wins)||rows.some(r=>r.rank==='S'&&r.team.wins/r.team.games<.54))throw Error('Cheonga upper-S/A-duel target failed; inspect the report');
