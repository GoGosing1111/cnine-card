// Internal design model. Never import into a browser bundle or return through a public API.
import {normalizeLevel} from "../../preview/account-rank-v1/model.mjs";
export const GROWTH_POLICY = Object.freeze({maxLevel:250,startLevel:1,retroactiveXp:false,pvpBuff:false,status:'PROPOSAL',dailyXpCap:null,targetDays:50,referenceDailyXp:280,xpScope:'ALL_PVE'});
// Review amounts per server-settled event, not attendance requirements or caps.
export const XP_SOURCES=Object.freeze([
  {code:'HUNT',name:'몬스터 토벌',unit:'클리어',xp:8,example:10,note:'일반·상위 난이도 · 소탕 포함'},
  {code:'APOCALYPSE',name:'아포칼립스',unit:'클리어',xp:24,example:0,note:'정상 전투 정산'},
  {code:'RAID',name:'월드 레이드',unit:'전투 정산',xp:20,example:3,note:'보스 처치 전 유효 참여 포함'},
  {code:'ESCORT',name:'호송작전',unit:'작전 정산',xp:30,example:1,note:'콘텐츠 정산 기록 기준'},
  {code:'SIEGE',name:'몬스터 공성전',unit:'전투 정산',xp:120,example:0,note:'진영전 참여도 경험치 인정'},
  {code:'SEAL',name:'봉인전',unit:'전투 정산',xp:160,example:0,note:'유효 전투 참여 기준'},
  {code:'IDLE',name:'방치형 원정',unit:'정산 시간',xp:6,example:0,note:'1시간당 · 실제 정산 시간 비례'},
  {code:'TOWER',name:'무한의탑',unit:'층 클리어',xp:10,example:5,note:'재등반도 경험치 지급'},
  {code:'SCRAPYARD',name:'폐차장',unit:'원정 정산',xp:20,example:3,note:'전체 구역의 완료 정산'},
  {code:'COW_ROOM',name:'카우방',unit:'클리어',xp:30,example:0,note:'입장 콘텐츠 완료 정산'}
].map(Object.freeze));
export function estimateGrowth(workload={}){
  const dailyXp=Math.floor(XP_SOURCES.reduce((sum,s)=>{const n=Number(workload[s.code]||0);return sum+s.xp*(Number.isFinite(n)?Math.max(0,n):0);},0));
  return {dailyXp,days:dailyXp>0?Math.ceil(totalXpForLevel(250)/dailyXp):null};
}
export function nextLevelXp(value){const level=normalizeLevel(value);return level===250?0:60+4*level;}
export function totalXpForLevel(value){const n=normalizeLevel(value)-1;return 60*n+2*n*(n+1);}
export function levelFromXp(value){const xp=Math.max(0,Number(value)||0);let level=1;while(level<250&&xp>=totalXpForLevel(level+1))level++;return level;}
