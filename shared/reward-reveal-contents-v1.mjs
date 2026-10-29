export const REWARD_REVEAL_CONTENTS=Object.freeze([
 {id:'CORE',name:'붕괴코어 레이드',group:'레이드',limit:'주간 3회 · 기존 기본 보상과 함께 수령'},
 {id:'LICH',name:'이스겐 레이드',group:'레이드',limit:'주간 3회 · 기존 클리어 보상과 함께 사용'},
 {id:'MADARA',name:'바르센 레이드',group:'레이드',limit:'콘텐츠 CMS의 주간 한도 · 기존 클리어 보상과 함께 사용'},
 {id:'BLACKWING',name:'흑익의 맹약 레이드',group:'레이드',limit:'콘텐츠 CMS의 주간 한도 · 기존 클리어 보상과 함께 사용'},
 {id:'COOP_NORMAL',name:'격전지 · 일반',group:'격전지',limit:'행동력 최대 3회 · 3시간마다 1회 충전'},
 {id:'COOP_HARD',name:'격전지 · 격전',group:'격전지',limit:'행동력 최대 3회 · 3시간마다 1회 충전'},
 {id:'COOP_EXTREME',name:'격전지 · 극한',group:'격전지',limit:'행동력 최대 3회 · 3시간마다 1회 충전'}
]);
export const rewardRevealContent=id=>REWARD_REVEAL_CONTENTS.find(row=>row.id===id);
