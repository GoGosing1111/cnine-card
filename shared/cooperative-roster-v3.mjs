// Server-selected, immutable room roster. No account strength or card identity
// participates in the draw; every combat trait is an ordinary automatic effect.
export const COOP_ROSTER_VERSION='20261012-random-v3';
const BASE='/assets/ui/cooperative-roster-v3/';
const LEGACY='/assets/ui/cooperative-arke-v1/';
export const COOP_SPECIES=Object.freeze([
 {id:'STALKER',name:'용철 추적자',kind:'MOB',art:LEGACY+'forge-stalker-v1.png',style:'MELEE',trait:'ASSAULT',hint:'전열을 압박하는 근접 공격',hp:1,attack:1,shield:0,height:240},
 {id:'WATCHER',name:'불씨 감시기',kind:'MOB',art:LEGACY+'ember-watcher-v1.png',style:'RANGED',trait:'VOLLEY',hint:'분대를 번갈아 노리는 연사',hp:.9,attack:.85,shield:0,height:220},
 {id:'IRONHOUND',name:'철갑 사냥개',kind:'MOB',art:BASE+'ironhound-768.webp',style:'MELEE',trait:'BULWARK',hint:'방벽 파괴·방어 약화에 취약',hp:1.05,attack:.9,shield:25,height:245},
 {id:'BLIGHTSTALKER',name:'맹독 추적자',kind:'MOB',art:BASE+'blightstalker-768.webp',style:'MELEE',trait:'VENOM',hint:'정화 가능한 독과 회복 억제',hp:.9,attack:1,shield:0,height:245},
 {id:'STORMWISP',name:'폭풍 감시자',kind:'MOB',art:BASE+'stormwisp-768.webp',style:'RANGED',trait:'TEMPEST',hint:'연속 공격·정화 가능한 약화',hp:.85,attack:.85,shield:0,height:230},
 {id:'ARKE',name:'삼핵 거신 아르케',kind:'BOSS',art:LEGACY+'arke-battle-sprite-v1.png',style:'MELEE',trait:'ASSAULT',hint:'강한 연속 공격 · 보호와 지속 화력',hp:1,attack:1,shield:10,height:400},
 {id:'BASTION',name:'철벽 군주 바스티온',kind:'BOSS',art:BASE+'bastion-768.webp',style:'MELEE',trait:'BULWARK',hint:'재생 방벽 · 방벽 파괴와 방어 약화',hp:.78,attack:.86,shield:18,height:370},
 {id:'VESPERA',name:'역병 여왕 베스페라',kind:'BOSS',art:BASE+'vespera-768.webp',style:'RANGED',trait:'VENOM',hint:'생명 재생과 맹독 · 회복 억제와 정화',hp:.95,attack:.85,shield:0,height:370},
 {id:'TEMPEST',name:'폭풍룡 템페스트',kind:'BOSS',art:BASE+'tempest-768.webp',style:'MELEE',trait:'TEMPEST',hint:'분산 연타와 약화 · 보호와 회복',hp:1.25,attack:1.15,shield:0,height:330}
]);
export const coopSpecies=id=>COOP_SPECIES.find(s=>s.id===id);
export function rollCoopRoster(seed){
 let n=(Number(seed)^0xC0090312)>>>0;
 const random=()=>{n=(n+0x6D2B79F5)>>>0;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
 const mobs=COOP_SPECIES.filter(s=>s.kind==='MOB').map(s=>s.id);
 for(let i=mobs.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[mobs[i],mobs[j]]=[mobs[j],mobs[i]];}
 const bosses=COOP_SPECIES.filter(s=>s.kind==='BOSS').map(s=>s.id),boss=bosses[Math.floor(random()*bosses.length)];
 const elites=bosses.filter(id=>id!==boss),elite=elites[Math.floor(random()*elites.length)];
 return {version:3,policyVersion:1,mobs:mobs.slice(0,3),elite,boss};
}
export function validateCoopRoster(value){
 if(value?.version!==3||value.policyVersion!==1||!Array.isArray(value.mobs)||value.mobs.length!==3||new Set(value.mobs).size!==3||value.mobs.some(id=>coopSpecies(id)?.kind!=='MOB')||coopSpecies(value.elite)?.kind!=='BOSS'||coopSpecies(value.boss)?.kind!=='BOSS'||value.elite===value.boss)throw Error('INVALID_COOPERATIVE_ROSTER');
 return {version:3,policyVersion:1,mobs:[...value.mobs],elite:value.elite,boss:value.boss};
}
export function coopRosterSummary(value){
 if(!value)return null;const roster=validateCoopRoster(value);
 const publicSpecies=id=>{const s=coopSpecies(id);return {id:s.id,name:s.name,art:s.art,trait:s.trait,hint:s.hint};};
 return {...roster,mobs:roster.mobs.map(publicSpecies),elite:publicSpecies(roster.elite),boss:publicSpecies(roster.boss),automatic:true};
}
export function coopEnemyTraits(spec,wave,difficulty){
 const scale={NORMAL:.6,HARD:.8,EXTREME:1}[difficulty];
 return {version:1,kind:spec.trait,wave,
  wardPercent:spec.trait==='BULWARK'?1:0,
  wardCapPercent:spec.trait==='BULWARK'?18:0,
  wardResistancePercent:spec.trait==='BULWARK'?20:0,
  regenPercent:spec.trait==='VENOM'&&wave>1?1.5*scale:0,
  regenBudgetPercent:spec.trait==='VENOM'&&wave>1?30:0,
  venomPercent:spec.trait==='VENOM'?(wave===1?8:12)*scale:0,
  vulnerabilityPercent:spec.trait==='TEMPEST'?8*scale:0};
}
