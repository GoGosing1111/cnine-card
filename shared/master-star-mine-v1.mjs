export const MINE_DURATION_MS=4*60*60*1000;
export const MINE_KEY='master_star_mine_v1';
export const MINE_ASSETS='/assets/ui/master-star-mine-v1/';
export const MINE_DRILLS=Object.freeze([
 Object.freeze({code:'MINE_ELECTRIC_DRILL',id:'electric-drill',name:'전동드릴',label:'ELECTRIC',description:'견고한 전동 모터로 별의 광맥을 채굴합니다.',image:MINE_ASSETS+'electric-drill.webp'}),
 Object.freeze({code:'MINE_SOLAR_DRILL',id:'solar-drill',name:'태양광드릴',label:'SOLAR',description:'축적한 태양 에너지로 깊은 광맥을 채굴합니다.',image:MINE_ASSETS+'solar-drill.webp'}),
 Object.freeze({code:'MINE_GOLDEN_DRILL',id:'golden-drill',name:'황금드릴',label:'GOLDEN',description:'별의 코어를 품은 황금 장비로 광맥을 채굴합니다.',image:MINE_ASSETS+'golden-drill.webp'})
]);
export const emptyMinePolicy=()=>({version:1,mode:'OFF',testUserIds:[],acquisition:'PENDING',acquisitionNotice:'드릴 획득 방법은 추후 안내됩니다.',rewards:{MINE_ELECTRIC_DRILL:5000,MINE_SOLAR_DRILL:15000,MINE_GOLDEN_DRILL:30000}});
export function validateMinePolicy(value){
 if(!value||value.version!==1||!['OFF','TEST','ON'].includes(value.mode))throw Error('광산 운영 상태를 확인하세요.');
 if(!['PENDING','CMS'].includes(value.acquisition))throw Error('드릴 획득 방식을 확인하세요.');
 if(!Array.isArray(value.testUserIds)||value.testUserIds.length>100||value.testUserIds.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(value.testUserIds).size!==value.testUserIds.length)throw Error('검수 계정 ID는 중복 없는 양의 정수로 설정하세요.');
 const notice=String(value.acquisitionNotice??'').trim();if(notice.length<1||notice.length>240)throw Error('드릴 획득 안내를 1~240자로 입력하세요.');
 const rewards={};for(const drill of MINE_DRILLS){const n=value.rewards?.[drill.code];if(n!==null&&(!Number.isSafeInteger(n)||n<1||n>10000000))throw Error(drill.name+' 보상은 미정 또는 1~10,000,000개의 정수로 설정하세요.');rewards[drill.code]=n;}
 return {version:1,mode:value.mode,testUserIds:[...value.testUserIds],acquisition:value.acquisition,acquisitionNotice:notice,rewards};
}
export function mineReadiness(policy){
 const blockers=[];if(policy.acquisition==='PENDING')blockers.push('드릴 획득 방식 미정');
 if(MINE_DRILLS.some(d=>!Number.isSafeInteger(policy.rewards[d.code])))blockers.push('드릴별 채굴 보상 미정');
 if(policy.mode==='TEST'&&!policy.testUserIds.length)blockers.push('검수 계정 미설정');
 return {ready:!blockers.length,blockers};
}
export const mineAccess=(policy,userId)=>mineReadiness(policy).ready&&(policy.mode==='ON'||policy.mode==='TEST'&&policy.testUserIds.includes(Number(userId)));
