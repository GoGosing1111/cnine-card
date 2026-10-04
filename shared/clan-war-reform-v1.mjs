export const CLAN_REFORM_KEY='clan_reform_v1';
export const WAR_DAYS=[2,4,6,0];
export const READY_WINDOW_MS=15*60*1000;
export const SUPPORT_RULES=Object.freeze({initial:3,cap:3,limit:3,cooldownMs:5000});
export const OPERATION_LIMITS=Object.freeze({mission:9,combo:3,skill:3,total:15});
export const CLAN_SKILLS=Object.freeze({
  DK:{name:'청룡 강습',description:'지휘력 30 반환 · 상대 지휘력 최대 10 감소',refund:30,drain:10},
  SAMSUNG:{name:'청색 통찰',description:'정보 3 확보 · 아군 보호 1 확보',intel:3,guard:1},
  T1:{name:'붉은 연계',description:'다음 협동 완성 시 지휘력 20 추가 · 정보 2 확보',comboSupply:20,intel:2},
  HANWHA:{name:'불꽃 돌격',description:'상대 보호를 무시하고 지휘력 최대 30 감소',drain:30,ignoreGuard:true},
  LG:{name:'쌍둥이 수호',description:'아군 보호 3 확보 · 지휘력 10 반환',guard:3,refund:10},
  LOTTE:{name:'거인 압박',description:'상대 지휘력 최대 40 감소',drain:40},
  FM:{name:'녹빛 결속',description:'지휘력 25 반환 · 아군 보호 1 확보',refund:25,guard:1},
  DC:{name:'암흑 침투',description:'상대 보호와 정보를 해제',breakGuard:true,clearIntel:true}
});
export const OPERATION_ROLES=Object.freeze({
  assault:{name:'돌파 임무',role:'공격',command:15,description:'팀 점수 +3 · 지휘력 +15'},
  disrupt:{name:'교란 임무',role:'교란',command:10,description:'팀 점수 +3 · 지휘력 +10 · 정보 +1'},
  support:{name:'구호 임무',role:'지원',command:10,description:'팀 점수 +3 · 지휘력 +10 · 보호 +1'}
});
export function utcMs(value){const s=String(value||'');return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:s.replace(' ','T')+'Z');}
export function weekOf(now=Date.now()){
  const d=new Date(now+9*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
export function weekDates(now=Date.now()){
  const monday=Date.parse(weekOf(now)+'T00:00:00+09:00');
  return WAR_DAYS.map(day=>({day,date:new Date(monday+((day+6)%7)*86400000+9*3600000).toISOString().slice(0,10)}));
}
export function readyOpen(war,now=Date.now()){return Boolean(war&&['SCHEDULED','ACTIVE'].includes(war.status)&&now>=utcMs(war.starts_at)-READY_WINDOW_MS&&now<utcMs(war.starts_at));}
export function supportEnergy(war,used=0,now=Date.now()){
  return {available:Math.max(0,SUPPORT_RULES.limit-used),used,limit:SUPPORT_RULES.limit,
    remaining:Math.max(0,SUPPORT_RULES.limit-used),nextAt:0};
}
export function newField(){return {version:3,teams:{},users:{},events:[]};}
export function fieldTeam(state,clanId){return state.teams[clanId]??={command:0,supplies:[],intel:0,guard:0,commander:0,skillAt:0,points:0,operation:{},combos:0,comboSupply:0};}
export function fieldPlayer(state,userId){return state.users[userId]??={used:0,lastAt:0,points:0,missionPoints:0,comboPoints:0,skillPoints:0};}
export function commandCost(team){return 60-Math.min(3,team.intel)*5;}
function addSupply(team,userId,amount){
  const added=Math.min(amount,1000-team.command);if(added<=0)return;
  // Keep original ownership through spending, refunds and enemy disruption.
  // Refunded/bonus supplies have owner 0 and never create another member award.
  const tail=team.supplies.at(-1);
  if(tail?.userId===userId)tail.amount+=added;else team.supplies.push({userId,amount:added});team.command+=added;
}
function spendSupply(team,amount){
  const consumed=new Set();let left=Math.min(amount,team.command);
  while(left>0&&team.supplies.length){const entry=team.supplies[0],take=Math.min(left,entry.amount);
    entry.amount-=take;left-=take;team.command-=take;if(entry.userId)consumed.add(entry.userId);if(!entry.amount)team.supplies.shift();}
  return consumed;
}
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function applyFieldAction(state,{war,userId,clanId,markKey,kind,now,executive=false,targetUserId=0,memberIds=[]}){
  const enemyId=Number(war.clan_a_id)===clanId?Number(war.clan_b_id):Number(war.clan_a_id);
  const team=fieldTeam(state,clanId),enemy=fieldTeam(state,enemyId);
  if(![Number(war.clan_a_id),Number(war.clan_b_id)].includes(clanId))fail('이 경기의 참가 클랜이 아닙니다.');
  if(war.status!=='ACTIVE'||now<utcMs(war.starts_at)||now>=utcMs(war.ends_at))fail('진행 중인 클랜전에서만 사용할 수 있습니다.');
  if(kind==='commander'){
    if(!executive)fail('집행관만 지휘관을 지정할 수 있습니다.');
    if(!memberIds.includes(targetUserId))fail('현재 클랜원 중에서 지휘관을 선택하세요.');
    team.commander=targetUserId;return {points:0,label:'지휘관 지정',targetUserId};
  }
  const player=fieldPlayer(state,userId);
  let label='',combo=false;const credit=new Map();
  const award=(id,category,amount)=>{const p=fieldPlayer(state,id),key=category+'Points';
    const added=Math.max(0,Math.min(amount,OPERATION_LIMITS[category]-p[key],OPERATION_LIMITS.total-p.points));
    if(added){p[key]+=added;p.points+=added;credit.set(id,(credit.get(id)||0)+added);}};
  team.supplies=team.supplies.filter(s=>!s.userId||memberIds.includes(s.userId));team.command=team.supplies.reduce((n,s)=>n+s.amount,0);
  if(kind==='skill'){
    if((team.commander&&memberIds.includes(team.commander))?team.commander!==userId:!executive)fail('지정된 지휘관만 스킬을 사용할 수 있습니다.');
    const cost=commandCost(team);if(team.command<cost)fail(`지휘력 ${cost}이 필요합니다. 클랜원 임무로 지휘력을 모으세요.`);
    if(now<team.skillAt+120000)fail('지휘 스킬 재사용 대기 중입니다.');
    const skill=CLAN_SKILLS[markKey];if(!skill)fail('클랜 전용 스킬을 확인할 수 없습니다.');
    for(const id of spendSupply(team,cost))award(id,'skill',3);
    team.skillAt=now;team.intel=0;
    if(skill.breakGuard)enemy.guard=0;
    if(skill.clearIntel)enemy.intel=0;
    let drain=Math.min(skill.drain||0,enemy.command);
    if(!skill.ignoreGuard&&drain){const blocked=Math.min(enemy.guard,Math.ceil(drain/10));enemy.guard-=blocked;drain=Math.max(0,drain-blocked*10);}
    spendSupply(enemy,drain);
    team.intel=Math.min(3,team.intel+(skill.intel||0));team.guard=Math.min(3,team.guard+(skill.guard||0));
    addSupply(team,0,skill.refund||0);team.comboSupply=Math.max(team.comboSupply,skill.comboSupply||0);label=skill.name;
  }else{
    const role=OPERATION_ROLES[kind];if(!role)fail('클랜 임무를 다시 선택하세요.');
    if(player.lastAt&&now<player.lastAt+SUPPORT_RULES.cooldownMs)fail('임무는 5초 간격으로 수행할 수 있습니다.');
    if(!supportEnergy(war,player.used,now).available)fail('이번 경기 개인 임무 3회를 모두 완료했습니다.');
    player.used++;player.lastAt=now;award(userId,'mission',3);label=role.name;addSupply(team,userId,role.command);
    if(kind==='disrupt')team.intel=Math.min(3,team.intel+1);
    if(kind==='support')team.guard=Math.min(3,team.guard+1);
    // Three different members complete one operation. A lone member cannot farm
    // the group bonus by pressing all three buttons. Normal mission points remain available.
    for(const [roleId,entry] of Object.entries(team.operation))if(!memberIds.includes(entry.userId))delete team.operation[roleId];
    if(!team.operation[kind]&&!Object.values(team.operation).some(e=>e.userId===userId))team.operation[kind]={userId,at:now};
    if(Object.keys(team.operation).length===3){
      for(const entry of Object.values(team.operation))award(entry.userId,'combo',3);
      addSupply(team,0,team.comboSupply);team.comboSupply=0;team.combos++;combo=true;team.operation={};label+=' · 협동 작전 완성';
    }
  }
  const points=[...credit.values()].reduce((n,p)=>n+p,0);team.points+=points;
  state.events.unshift({userId,clanId,kind,label,points,combo,at:now});state.events=state.events.slice(0,20);
  return {points,label,combo,contributions:[...credit].map(([userId,points])=>({userId,points}))};
}
