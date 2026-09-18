import {APOCALYPSE_LEGION_BOSSES} from '../../shared/apocalypse-legion-v1.mjs';
import {pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';

// Local QA only. Mirrors the approved registration; never reads or writes production.
export const apocalypseQaSettings={enabled:true,monsterProfiles:Object.fromEntries(APOCALYPSE_LEGION_BOSSES.map((b,i)=>[b.monsterId,{battlePower:i?10000000:7500000,rewardCoin:600000,rewardPercent:1000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:70,attackCount:2,forcedActionEvery:4,skillEnabled:true,skillName:'봉인 · 힐불가 저주 · 궁극기',skillDescription:'보스 + 쫄몹 6마리',skillDamagePercent:95}]))};
export const apocalypseQaRows=APOCALYPSE_LEGION_BOSSES.map((b,i)=>({id:b.monsterId,name:b.name,image:b.sourceArt,image_url:b.sourceArt,battle_power:i?10000000:7500000,is_boss:1,isBoss:true,pve_tab:'APOCALYPSE',pveTab:'APOCALYPSE',pveDisplayOrder:39+i}));
export function apocalypseQaDifficulty(id){const m=apocalypseQaRows.find(m=>m.id===Number(id));return m?pveDifficultyRuntime({apocalypse:apocalypseQaSettings},m):null;}
export function apocalypseQaPublic(){return apocalypseQaRows.map(m=>{const p=apocalypseQaDifficulty(m.id);return {...m,difficulty:p.difficulty,battlePower:p.effectiveBattlePower,recommendedPower:p.effectiveBattlePower,rewardCoin:p.effectiveRewardCoin,apocalypse:{hpPercent:p.hpPercent,attackPercent:p.attackPercent,defensePercent:p.defensePercent,speedPercent:p.speedPercent,shieldPercent:p.shieldPercent,attackCount:p.attackCount,forcedActionEvery:p.forcedActionEvery,skill:p.apocalypseSkill}};});}
