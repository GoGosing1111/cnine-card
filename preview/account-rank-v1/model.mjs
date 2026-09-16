// Review model only. No account, reward, persistence, or battle runtime imports.
export const POLICY = Object.freeze({maxLevel:250,startLevel:1,retroactiveXp:false,pvpBuff:false,status:'PROPOSAL',dailyXpCap:null,targetDays:50,referenceDailyXp:280,xpScope:'ALL_PVE'});
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
const rows = [
  ['TRAINEE','훈련병',1,4,'입문','새싹','olive'],
  ['PRIVATE','이병',5,14,'병사','▬','silver'],
  ['PRIVATE_FIRST','일병',15,24,'병사','▬▬','silver'],
  ['CORPORAL','상병',25,34,'병사','▬▬▬','silver'],
  ['SERGEANT','병장',35,49,'병사','▬▬▬▬','silver'],
  ['STAFF_SERGEANT','하사',50,64,'부사관','⌃','teal'],
  ['SERGEANT_FIRST','중사',65,79,'부사관','⌃⌃','teal'],
  ['MASTER_SERGEANT','상사',80,94,'부사관','⌃⌃⌃','teal'],
  ['SERGEANT_MAJOR','원사',95,109,'부사관','⌃✦⌃','teal'],
  ['WARRANT','준위',110,124,'준사관','금빛 봉오리','amber'],
  ['SECOND_LIEUTENANT','소위',125,139,'위관','봉오리 1','blue'],
  ['FIRST_LIEUTENANT','중위',140,154,'위관','봉오리 2','blue'],
  ['CAPTAIN','대위',155,169,'위관','봉오리 3','blue'],
  ['MAJOR','소령',170,184,'영관','✿','ruby'],
  ['LIEUTENANT_COLONEL','중령',185,199,'영관','✿✿','ruby'],
  ['COLONEL','대령',200,214,'영관','✿✿✿','ruby'],
  ['BRIGADIER','준장',215,224,'장군','★','gold'],
  ['MAJOR_GENERAL','소장',225,234,'장군','★★','gold'],
  ['LIEUTENANT_GENERAL','중장',235,244,'장군','★★★','gold'],
  ['GENERAL','대장',245,249,'장군','★★★★','gold'],
  ['MARSHAL','원수',250,250,'원수','★★★★★','gold']
];
const artwork = {PRIVATE:'private-v1.png',MAJOR:'major-v1.png',MARSHAL:'marshal-v1.png'};
export const RANKS=Object.freeze(rows.map(([code,name,min,max,group,insignia,tone],index)=>Object.freeze({
  code,name,min,max,group,insignia,tone,index,art:artwork[code]||null,
  // Total rank effect, never summed across earlier ranks. All values are proposals.
  attackBp:index*50,hpBp:index*75,coinBp:index*25,presetSlots:1+Math.floor(index/5)
})));
export function normalizeLevel(value){const n=Number(value);return Number.isFinite(n)?Math.max(1,Math.min(250,Math.floor(n))):1;}
export function rankForLevel(value){const level=normalizeLevel(value);return RANKS.find(r=>level>=r.min&&level<=r.max);}
export function nextLevelXp(value){const level=normalizeLevel(value);return level===250?0:60+4*level;}
export function totalXpForLevel(value){const n=normalizeLevel(value)-1;return 60*n+2*n*(n+1);}
export function levelFromXp(value){const xp=Math.max(0,Number(value)||0);let level=1;while(level<250&&xp>=totalXpForLevel(level+1))level++;return level;}
export function draftEffects(value,context){
  // Explicit allow-list: unknown, PvP, clan, territory and scored PvE get nothing.
  const r=rankForLevel(value),allowed=context==='PERSONAL_PVE_UNRANKED';
  return {attackBp:allowed?r.attackBp:0,hpBp:allowed?r.hpBp:0,coinBp:allowed?r.coinBp:0};
}
export const percent=bp=>`${Number((bp/100).toFixed(2))}%`;
