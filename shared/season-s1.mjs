import {HEIR_TITLE} from './season-s1-title.mjs';
import {IMMORTAL,RUNE_TYPE,RUNE_LIMIT,publicItemRunes,runeCopies,addImmortal,migrateImmortalItems} from './character-runes.mjs';
export const S1=Object.freeze({id:'S1_IMMORTAL_KING',name:'불멸의 왕',days:30,graceDays:7,maxLevel:50,levelXp:100,participationMax:3500,achievementMax:1400,weeklyXp:1000,weeklyDust:300,dustMax:1200,runeEvery:20,runeLimit:RUNE_LIMIT,
 dailyBattles:10,dailyXp:175,dailyDust:70,dailyRuneBattles:4,runeCraftDays:Object.freeze([3,8,13,18,23]),titleSeasonDay:24,titlePlayDays:20});
export const ART='/assets/items/season-s1-immortal-king/';
export const MODES=['PVE','PVP'];
export const MATERIALS=Object.freeze([
 {code:'DUST',name:'왕좌의 가루',art:'exploration-dust'},
 {code:'TOKEN',name:'왕의 제작 증표',art:'duel-sigil'},
 {code:'TOWER_SIGIL',name:'탑의 각인',mode:'PVE',art:'tower-sigil'},
 {code:'RAID_CORE',name:'공명의 핵',mode:'PVE',art:'resonance-core'},
 {code:'ABYSS_CRYSTAL',name:'심연 결정',mode:'PVE',art:'abyss-crystal'},
 {code:'HONOR_CRYSTAL',name:'명예 결정',mode:'PVP',art:'honor-crystal'}
]);
const recipe=(key,level,name,art,dust,tokens,limit,output,description,quantity=1)=>({id:'COMMON_'+key,mode:'COMMON',level,name,art,dust,tokens,limit,output,description,quantity});
export const RECIPES=Object.freeze([
 recipe('CORE',10,IMMORTAL.name,IMMORTAL.art,200,1,5,RUNE_TYPE,'공용 룬 1개 제작 · 참여 보상과 합쳐 최대 5개'),
 recipe('UPGRADE',10,'불멸왕 룬 강화',IMMORTAL.art,40,0,5,RUNE_TYPE,'선택한 룬 1개의 PVE 공격력·랭크전 최대 체력 효과를 +8%에서 +10%로 강화'),
 recipe('GROWTH',10,'성장 재료 묶음','exploration-dust',50,0,4,'MASTER_STAR','마스터의 별 10만 개 · 인벤토리 지급',100000),
 recipe('SCROLL',20,'강화주문서 선택 제작','resonance-core',100,0,2,'SELECT_SCROLL','무기 또는 방어구 강화주문서 1개 선택'),
 recipe('AURA',40,'왕관의 영혼불','abyss-crystal',100,0,1,'COMMON_S1_AURA','시즌 제작소 전시 오라 · 영구 보유'),
 recipe('TITLE',50,HEIR_TITLE.name,HEIR_TITLE.art,100,0,1,HEIR_TITLE.code,
   '장착 시 PVE·PVP 전투력 +' + HEIR_TITLE.allBattlePower.toLocaleString('ko-KR') + ' · 영구 보유')
]);
// [id, label, XP, confirmed activity counter, goal, artwork key].
const mission=(id,label,xp,counter,goal,icon)=>[id,label,xp,counter,goal,icon];
export const ACHIEVEMENTS=Object.freeze({
 PVE:[mission('hunt10','PVE 출정 10회',150,'ALL',10,'hunt'),mission('tower1','무한의탑 도전 1회',100,'TOWER',1,'tower'),mission('legion5','군단토벌 5회',200,'LEGION',5,'legion'),mission('coop5','격전지 5회',200,'COOP',5,'coop'),mission('defense5','몬스터 디펜스 5회',200,'DEFENSE',5,'defense'),mission('sortie40','PVE 출정 40회',300,'ALL',40,'hunt'),mission('sortie80','PVE 출정 80회',450,'ALL',80,'hunt'),mission('sortie120','PVE 출정 120회',500,'ALL',120,'hunt')],
 PVP:[3,10,20,35,50,75].map((n,i)=>mission('match'+n,'랭크전 참여 '+n+'회',[100,150,200,250,300,400][i],'ALL',n,'duel'))
});
const DAY=86400000,tokenFor=m=>m==='PVE'?'PVE_TOKEN':'DUEL_SIGIL';
export const kstDay=ms=>Math.floor((ms+9*3600000)/DAY);
const emptyDay=()=>({events:0,xp:0,dust:0});
const sharedDays=state=>new Set(MODES.flatMap(mode=>Object.keys(state.tracks[mode].days))).size;
const sharedToday=(state,day)=>Math.min(S1.dailyRuneBattles,MODES.reduce((n,m)=>n+(state.tracks[m].days[day]?.events||0),0));
const eventXp={HUNT:20,NIGHTMARE:25,TOWER:25,RAID:75,APOCALYPSE:50,LEGION:30,COOP:35,DEFENSE:35,PVP:25};
export const fail=(message,status=409,code='SEASON_CONDITION')=>{throw Object.assign(new Error(message),{status,code});};
export const levelOf=t=>Math.min(S1.maxLevel,1+Math.floor((t.participation+t.achievementXp)/S1.levelXp));
export const modeOf=source=>source==='PVP'?'PVP':'PVE';
export function schedule(settings,mode,now){
 const start=Number(settings?.[mode]?.start),end=start+S1.days*DAY,craftEnd=end+S1.graceDays*DAY;
 if(!Number.isFinite(start)||start<=0)return {phase:'UNSCHEDULED',week:0,day:0,start:null,end:null,craftEnd:null,xpCap:0,dustCap:0};
 const phase=now<start?'UPCOMING':now<end?'ACTIVE':now<craftEnd?'CRAFTING':'CLOSED',week=Math.max(0,Math.min(5,Math.floor((Math.min(now,end-1)-start)/(7*DAY))+1));
 const day=now<start?0:Math.min(S1.days,kstDay(Math.min(now,end-1))-kstDay(start)+1);
 return {phase,week,day,start,end,craftEnd,xpCap:Math.min(S1.participationMax,week*S1.weeklyXp),dustCap:Math.min(S1.dustMax,week*S1.weeklyDust)};
}
const newTrack=()=>({participation:0,achievementXp:0,achievements:[],materials:{},earned:{},crafts:{},events:0,wins:0,grantedTokens:0,counts:{},days:{},converted:false});
export function emptyAccount(){return {schemaVersion:3,seasonId:S1.id,tracks:{PVE:newTrack(),PVP:newTrack()},common:{activities:0,cycles:0,crafts:{}},owned:{},itemRunes:{},legacy:0};}
function grantCycles(state){
 const daysPerRune=S1.runeEvery/S1.dailyRuneBattles;
 const reached=Math.min(RUNE_LIMIT,Math.floor(state.common.activities/S1.runeEvery),Math.floor(sharedDays(state)/daysPerRune)),granted=[];
 while(state.common.cycles<reached){
  state.common.cycles++;
  if(runeCopies(state).length<state.common.cycles)granted.push(addImmortal(state));
 }
 return granted;
}
export function seasonState(input,history=[]){
 const state=structuredClone(input);if(state.schemaVersion>=3)return state;
 if(!(state.schemaVersion>=2)){
  state.itemRunes||={};migrateImmortalItems(state);state.common={activities:0,cycles:0,crafts:{}};
  for(const m of MODES){const t=state.tracks[m];t.counts={ALL:t.events||0};
   if(m==='PVE'&&t.achievements.some(code=>/^tower(50|70|90)$/.test(code))){t.counts.TOWER=1;t.achievements.push('tower1');}
   state.common.activities+=t.events||0;
   for(const suffix of ['GROWTH','SCROLL','AURA','TITLE'])if(t.crafts[m+'_'+suffix])state.common.crafts['COMMON_'+suffix]=(state.common.crafts['COMMON_'+suffix]||0)+t.crafts[m+'_'+suffix];
  }
 }
 for(const mode of MODES)state.tracks[mode].days={};
 // Keep every old balance and grant. Only dated server settlements prove distinct play days.
 for(const hour of history){
  const timestamp=Date.parse(hour.utc_hour+':00:00Z');
  if(!MODES.includes(hour.mode)||!Number.isFinite(timestamp))continue;
  const days=state.tracks[hour.mode].days,day=days[kstDay(timestamp)]??=emptyDay();
  day.events=Math.min(S1.dailyBattles,day.events+Number(hour.events));
  day.xp=Math.min(S1.dailyXp,day.xp+Number(hour.xp));day.dust=Math.min(S1.dailyDust,day.dust+Number(hour.dust));
 }
 state.schemaVersion=3;return state;
}
export function countSeasonMissions(track,source,amount=1){
 track.events+=amount;
 track.counts.ALL=track.events;
 track.counts[source]=source==='TOWER'?1:(track.counts[source]||0)+amount;
}
export function applyEvent(input,event,settings,now){
 const state=seasonState(input),mode=modeOf(event.source),t=state.tracks[mode],clock=schedule(settings,mode,now);
 if(!Object.hasOwn(eventXp,event.source))fail('지원하지 않는 시즌 콘텐츠입니다.',400);
 const raw=event.startedAt??now;
 const began=typeof raw==='number'?raw:Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw);
 if(clock.phase!=='ACTIVE'||event.eligible===false||!Number.isFinite(began)||began<clock.start||began>now||began>=clock.end)return {state,award:null};
 const repeatedTower=event.source==='TOWER'&&t.counts.TOWER>=1;
 if(repeatedTower&&event.seasonReplay)return {state,award:null};
 countSeasonMissions(t,event.source);
 if(event.won===true)t.wins++;
 const day=kstDay(now),dailyLimit=(t.days[day]?.events||0)>=S1.dailyBattles;
 if(dailyLimit||repeatedTower)return {state,award:null,countOnly:true,dailyLimit};
 const today=t.days[day]??=emptyDay();
 const runeCredit=sharedToday(state,day)<S1.dailyRuneBattles;
 const base=eventXp[event.source],xp=Math.max(0,Math.min(base,clock.xpCap-t.participation,S1.dailyXp-today.xp)),dustCode=mode+'_DUST';
 const dust=Math.max(0,Math.min(Math.ceil(base*.4),clock.dustCap-(t.earned[dustCode]||0),S1.dailyDust-today.dust));
 today.events++;today.xp+=xp;today.dust+=dust;
 const gains={},give=(code,n)=>{if(n>0){t.materials[code]=(t.materials[code]||0)+n;t.earned[code]=(t.earned[code]||0)+n;gains[code]=(gains[code]||0)+n;}};
 t.participation+=xp;
 give(dustCode,dust);
 const tokenGoal=Math.min(5,Math.floor(t.participation/700));give(tokenFor(mode),Math.max(0,tokenGoal-t.grantedTokens));t.grantedTokens=Math.max(t.grantedTokens,tokenGoal);
 const special={TOWER:'TOWER_SIGIL',RAID:'RAID_CORE',APOCALYPSE:'ABYSS_CRYSTAL'}[event.source];
 if(special&&event.won===true)give(special,Math.min(1,Math.max(0,Math.min(4,clock.week)-(t.earned[special]||0))));
 let axp=0;const achievements=[];
 for(const [id,,reward,counter,goal] of ACHIEVEMENTS[mode]){
  if((t.counts[counter]||0)<goal||t.achievements.includes(id))continue;
  t.achievements.push(id);achievements.push(id);axp+=reward;if(mode==='PVP')give('HONOR_CRYSTAL',1);
 }
 axp=Math.min(axp,S1.achievementMax-t.achievementXp);t.achievementXp+=axp;if(runeCredit)state.common.activities++;
 const runes=grantCycles(state);
 return {state,award:{mode,xp,achievementXp:axp,gains,achievements,runes,runeCredit,activities:state.common.activities,level:levelOf(t)}};
}
function workshop(state,settings,now){
 const modes=MODES.filter(m=>['ACTIVE','CRAFTING'].includes(schedule(settings,m,now).phase)).sort((a,b)=>settings[a].start-settings[b].start);
 const balances=Object.fromEntries(MATERIALS.map(({code,mode})=>[code,modes.reduce((n,m)=>n+(mode&&mode!==m?0:state.tracks[m].materials[code==='DUST'?m+'_DUST':code==='TOKEN'?tokenFor(m):code]||0),0)]));
 const owned=runeCopies(state).length,next=owned+1,playDays=sharedDays(state);
 const titleReady=modes.some(m=>levelOf(state.tracks[m])>=S1.maxLevel && Object.keys(state.tracks[m].days).length>=S1.titlePlayDays && schedule(settings,m,now).day>=S1.titleSeasonDay);
 const pacing={playDays,today:sharedToday(state,kstDay(now)),nextAuto:owned<RUNE_LIMIT?next*S1.runeEvery:null,
  nextAutoDay:owned<RUNE_LIMIT?next*S1.runeEvery/S1.dailyRuneBattles:null,nextCraftDay:S1.runeCraftDays[owned]??null,titleReady};
 return {modes,level:Math.max(0,...modes.map(m=>levelOf(state.tracks[m]))),balances,pacing};
}
export function craftItem(input,body,settings,now){
 const r=RECIPES.find(r=>r.id===body.recipeId);if(!r)fail('제작식을 찾을 수 없습니다.',404);
 const state=seasonState(input),w=workshop(state,settings,now),crafts=state.common.crafts,copies=runeCopies(state),upgrade=r.id==='COMMON_UPGRADE',core=r.id==='COMMON_CORE';
 if(!w.modes.length)fail('시즌 제작 기간이 아닙니다.');
 if(w.level<r.level)fail('PVE 또는 PVP 시즌 '+r.level+'레벨부터 제작할 수 있습니다.');
 if((crafts[r.id]||0)>=r.limit||(core&&copies.length>=RUNE_LIMIT))fail('시즌 제작 한도를 모두 사용했습니다.');
 if(core&&w.pacing.playDays<w.pacing.nextCraftDay)fail('다음 불멸왕 룬 제작에는 공용 참여 '+w.pacing.nextCraftDay+'일이 필요합니다.');
 if(r.output===HEIR_TITLE.code&&!w.pacing.titleReady)fail('칭호 제작은 같은 모드에서 Lv.50과 참여 '+S1.titlePlayDays+'일을 달성하고 시즌 '+S1.titleSeasonDay+'일차부터 가능합니다.');
 const target=upgrade?copies.find(([id,v])=>id===body.copyId&&!v.upgraded):null;
 if(upgrade&&!target)fail('강화할 미강화 룬을 선택하세요.');
 if(w.balances.DUST<r.dust||w.balances.TOKEN<r.tokens)fail('공용 시즌 재료가 부족합니다.');
 let output=r.output,copyId=null;if(output==='SELECT_SCROLL'){
  if(!['WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL'].includes(body.choice))fail('무기 또는 방어구 강화주문서를 선택하세요.',400);
  output=body.choice;
 }
 const spend=(amount,codeFor)=>{for(const m of w.modes){if(!amount)break;const mat=state.tracks[m].materials,code=codeFor(m),take=Math.min(amount,mat[code]||0);if(take){mat[code]-=take;amount-=take;}}};
 spend(r.dust,m=>m+'_DUST');spend(r.tokens,tokenFor);crafts[r.id]=(crafts[r.id]||0)+1;
 const external=['MASTER_STAR','WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL'].includes(output);
 if(core)copyId=addImmortal(state);else if(upgrade){target[1].upgraded=true;copyId=target[0];}else if(!external)state.owned[output]={mode:'COMMON',name:r.name,art:r.art,kind:r.id==='COMMON_AURA'?'AURA':'TITLE'};
 return {state,recipe:r,reward:{code:output,copyId,name:r.name,quantity:r.quantity,external,upgraded:upgrade}};
}
export function exchangeMaterial(input,body,settings,now){
 const spec=MATERIALS.find(m=>m.code===body.code&&m.mode);if(!spec)fail('교환할 수 없는 재료입니다.',400);
 const state=seasonState(input),m=spec.mode,t=state.tracks[m];
 if(!['ACTIVE','CRAFTING'].includes(schedule(settings,m,now).phase))fail('시즌 교환 기간이 아닙니다.');
 if(!(t.materials[spec.code]>0))fail('교환 재료가 부족합니다.');
 t.materials[spec.code]--;const token=tokenFor(m);t.materials[token]=(t.materials[token]||0)+1;return {state};
}
export function convertExpired(input,settings,now){
 const state=seasonState(input);let changed=false;
 for(const m of MODES){const t=state.tracks[m];if(schedule(settings,m,now).phase!=='CLOSED'||t.converted)continue;
  state.legacy+=Object.entries(t.materials).reduce((sum,[code,n])=>sum+n*(code.endsWith('_DUST')?1:25),0);t.materials={};t.converted=true;changed=true;
 }return {state,changed};
}
export function publicSeason(input,settings,now,gear={owned:[],equipped:[]}){
 const state=seasonState(input);if(state.owned[HEIR_TITLE.code]?.kind==='TITLE')state.owned[HEIR_TITLE.code].art=HEIR_TITLE.art;
 const runes=publicItemRunes(state,gear.owned,gear.equipped),w=workshop(state,settings,now);
 const tracks=Object.fromEntries(MODES.map(m=>{
  const t=state.tracks[m],{days,...progress}=t;
  return [m,{...progress,...schedule(settings,m,now),playDays:Object.keys(days).length,today:days[kstDay(now)]||emptyDay(),
   level:levelOf(t),xp:t.participation+t.achievementXp,xpInLevel:(t.participation+t.achievementXp)%100,bonus:runes.bonuses[m]}];
 }));
 return {enabled:true,season:S1,serverNow:now,tracks,common:{...state.common,...w,owned:runeCopies(state).length,upgraded:runeCopies(state).filter(([,v])=>v.upgraded).length},owned:state.owned,runes,legacy:state.legacy,materials:MATERIALS,recipes:RECIPES,achievements:ACHIEVEMENTS};
}
