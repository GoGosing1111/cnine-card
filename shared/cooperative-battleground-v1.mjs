export const COOP_VERSION='20261002-arke-v2';
export const COOP_ENCOUNTER=Object.freeze({id:'COOP_ARKE',version:2,name:'삼핵 거신 아르케',arena:'심층 제련소',sceneAssetKey:'COOP_ARKE_FORGE',
 sourceArt:'/assets/ui/cooperative-arke-v1/arke-source-art-v1.png',battleSprite:'/assets/ui/cooperative-arke-v1/arke-battle-sprite-v1.png',background:'/assets/ui/cooperative-arke-v1/forge-arena-v1.png'});
export const COOP_STAGES=Object.freeze([
 {wave:1,name:'제련소 외곽',target:'용철 추적자 ×2 · 불씨 감시기',hint:'근접 추적자와 원거리 감시기 3기를 모두 격파하세요.'},
 {wave:2,name:'노심 관문',target:'노심 수문장',hint:'두꺼운 방벽을 돌파하세요. 수문장은 연속 공격을 사용합니다.'},
 {wave:3,name:'심층 노심',target:COOP_ENCOUNTER.name,hint:'삼핵 차단과 집중 포화에 대응하며 거신을 격파하세요.'}
]);
export const COOP_PATTERNS=Object.freeze({firstAtMs:10000,intervalMs:30000,count:6,windowMs:{NORMAL:9000,HARD:8000,EXTREME:7000},
 rupturePercent:8,overloadPercent:{NORMAL:12,HARD:18,EXTREME:24},focusPercent:{NORMAL:40,HARD:50,EXTREME:60}});
export const COOP_RULES=Object.freeze({players:3,cardsPerPlayer:2,mercenariesPerPlayer:1,lobbyMs:900000,loadingMs:45000,countdownMs:3000,heartbeatMs:1000,disconnectMs:15000,maxBattleMs:180000,rewardLocked:true});
// Fixed opponents, independent of the entering party's equipment/power.
// Final values are checked by scripts/simulate-cooperative-battleground.mjs.
export const COOP_DIFFICULTIES=Object.freeze([
 {id:'NORMAL',name:'일반',subtitle:'협동의 시작',recommendation:'SS 용병 3명 · 공격과 방어를 고르게',power:9000000,hpPercent:500,attackPercent:120,defensePercent:100,attackCount:1,forcedEvery:6},
 {id:'HARD',name:'격전',subtitle:'조합의 증명',recommendation:'SSS 1명 + SS 2명 · 방어와 회복 권장',power:30000000,hpPercent:850,attackPercent:160,defensePercent:100,attackCount:2,forcedEvery:6},
 {id:'EXTREME',name:'극한',subtitle:'최정예의 도전',recommendation:'SSS 2~3명 · 고유효과와 용병 스킬 연계',power:60000000,hpPercent:1100,attackPercent:200,defensePercent:100,attackCount:2,forcedEvery:5}
]);
export const coopDifficulty=id=>COOP_DIFFICULTIES.find(d=>d.id===id);
export function validateCoopSelection(value){
 if(!value||!Array.isArray(value.cardIds)||value.cardIds.length!==2||new Set(value.cardIds).size!==2||value.cardIds.some(id=>typeof id!=='string'||!id||id.length>100)||!/^V-\d{3}$/.test(value.mercenaryCode||''))throw Object.assign(Error('보유 카드 2장과 용병 1명을 선택하세요.'),{code:'COOP_SELECTION',status:400});
 return {cardIds:[...value.cardIds],mercenaryCode:value.mercenaryCode};
}
export const validCoopRoom=id=>typeof id==='string'&&/^[A-F0-9]{10}$/.test(id);
export const validCoopClient=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(id);
