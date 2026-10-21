import fs from 'node:fs';
const folder='preview/seal-battle-rework-20261021/';
const cards=JSON.parse(fs.readFileSync('assets/ui/project-v/characters/zenith/manifest-v1.json','utf8')).characters.slice(0,5).map(row=>({cardId:row.cardId,name:row.title,title:row.title,grade:'ZENITH',rarity:'ZENITH',image:'/'+row.sourceArt,projectVBattleArt:{scope:'BATTLE_ENGINE_ONLY',kind:'ZENITH_SD',primaryUrl:'/'+row.responsive.webp[0].path,footAnchor:{x:.5,y:.98},approved:true}}));
let html=fs.readFileSync(folder+'index.html','utf8');
html=html.replace('<title>봉인전 UI 검수</title>','<title>봉인룡 · 세 봉인 해제와 본체전</title>');
html=html.replace('<link rel="stylesheet" href="/css/seal-battle.css">','<link rel="stylesheet" href="/css/seal-battle.css?dragon=20261022"><link rel="stylesheet" href="/css/battle-v2-live.css"><link rel="stylesheet" href="/css/battle-v3-live.css">');
html=html.replace('<b>봉인전 UI · 검수용 예시 데이터</b>','<b>봉인룡 개편 · 예시 전황 · 전투 미리보기 (실제 계정·재화 변경 없음)</b>');
html=html.replace('<option value="active">진행 중</option>','<option value="boss">용 보스 본체전</option><option value="active">세 봉인 해제</option><option value="last-seal">마지막 봉인 · 전환 체험</option><option value="boss-last">마지막 본체 타격</option><option value="legacy">기존 회차</option>');
html=html.replace('>봉인 완료</option>','>공동 토벌 완료</option>');
fs.writeFileSync(folder+'index.html',html);
const fixture=`window.sealPreviewCalls=[];
const previewCards=${JSON.stringify(cards)};
const previewState=()=>({event:{id:999,title:'봉인전',format:'SEALS_BOSS',phase:'SEALS',bossName:'봉인룡 네르가온',bossStage:{name:'봉인룡 네르가온',hp:15000000000,maxHp:15000000000,battlePower:18000000,image:'/assets/ui/seal-battle/dragon-20261022/portrait.webp',hero:'/assets/ui/seal-battle/dragon-20261022/hero.webp',openedAt:null},status:'ACTIVE',description:'세 봉인 해제 → 용 보스 본체전 → 공동 완료 보상',endsAt:'2026-10-25T14:59:59Z',minRewardAttempts:20,maxAttempts:5,rechargeMinutes:30,defeatContributionPercent:10,lowestRoleBonusPercent:10,attemptReward:{coin:100000000,shards:0},clearReward:{coin:100000000000,shards:0,masterStar:1000000},roles:{ATTACK:{progress:11130000000,target:15000000000,percent:74.2,battlePower:7450000,completed:false},GUARD:{progress:6270000000,target:15000000000,percent:41.8,battlePower:5500000,completed:false},PURIFY:{progress:9045000000,target:15000000000,percent:60.3,battlePower:5500000,completed:false}}},availability:{open:true,message:'공동 목표에 도전하세요.'},deck:{ready:true,power:26000000,cards:previewCards},progress:{remainingAttempts:4,availableAttempts:4,maxAttempts:5,rechargeMinutes:30,nextRechargeAt:new Date(Date.now()+1265000).toISOString(),totalAttempts:21,totalContribution:187293400,bossContribution:0},stats:{participants:140,attempts:3416},lowestRoleKeys:['GUARD'],clearReward:{eligible:false,claimed:false,processing:false},pendingClearReward:null});
let scenarioKey='',sampleState=null;
function sample(){const scenario=document.querySelector('#scenario')?.value||'active';if(sampleState&&scenario===scenarioKey)return sampleState;scenarioKey=scenario;const state=previewState();sampleState=state;
if(['boss','boss-last','complete','no-charge','no-deck'].includes(scenario)){state.event.phase='BOSS';state.event.bossStage.openedAt=new Date().toISOString();state.event.bossStage.hp=scenario==='boss-last'?10000000:10500000000;Object.values(state.event.roles).forEach(r=>Object.assign(r,{progress:r.target,percent:100,completed:true}));}
if(scenario==='last-seal'){for(const [key,r]of Object.entries(state.event.roles)){r.progress=r.target-(key==='PURIFY'?10000000:0);r.completed=key!=='PURIFY';r.percent=r.progress/r.target*100;}}
if(scenario==='complete'){state.event.status='CLEARED';state.event.phase='COMPLETED';state.event.bossStage.hp=0;state.availability.open=false;state.availability.message='용 보스를 처치했습니다.';state.progress.totalAttempts=28;state.clearReward.eligible=true;}
if(scenario==='failed'){state.event.status='FAILED';state.availability.open=false;state.availability.message='제한 시간 내 완료하지 못했습니다.';}
if(scenario==='no-charge')state.progress.availableAttempts=state.progress.remainingAttempts=0;
if(scenario==='no-deck'){state.deck.ready=false;state.deck.error='PvE 덱에 카드 5장을 저장해 주세요.';}
if(scenario==='legacy'){state.event.format='CLASSIC';state.event.bossStage=null;}
if(scenario==='empty')state.event=null;
return state;}
window.apiRequest=async(path,options={})=>{const body=options.body?JSON.parse(options.body):{};window.sealPreviewCalls.push({path,method:options.method||'GET',body});const state=sample();if(scenarioKey==='offline')throw Error('연결을 확인한 뒤 다시 시도해 주세요.');
if(path.endsWith('rankings'))return{event:state.event,overall:Array.from({length:30},(_,i)=>({rank:i+1,nickname:'원정대원 '+(i+1),total_attempts:50-i,total_contribution:500000000-i*1063000})),roles:{ATTACK:[],GUARD:[],PURIFY:[]},myRank:{rank:7,totalContribution:187293400,totalAttempts:21}};
if(path.endsWith('clear-reward')){state.clearReward.claimed=true;return{reward:state.event.clearReward,balances:{coin:100000000000}};}
if(path.endsWith('participate')){const isBoss=body.role==='BOSS',boss=state.event.bossStage,before=boss?.hp||0;let contribution=26000000,opened=false,defeated=false;
if(isBoss){contribution=Math.min(contribution,boss.hp);boss.hp-=contribution;state.progress.bossContribution+=contribution;if(boss.hp===0){defeated=true;state.event.status='CLEARED';state.event.phase='COMPLETED';state.availability.open=false;state.clearReward.eligible=true;}}
else{const role=state.event.roles[body.role];contribution=Math.min(contribution,role.target-role.progress);role.progress+=contribution;role.percent=role.progress/role.target*100;role.completed=role.progress>=role.target;if(boss&&Object.values(state.event.roles).every(r=>r.completed)){state.event.phase='BOSS';boss.openedAt=new Date().toISOString();opened=true;}}
state.progress.totalAttempts++;state.progress.totalContribution+=contribution;state.progress.availableAttempts--;state.stats.attempts++;
return{ok:true,eventId:999,battlePhase:isBoss?'BOSS':'SEALS',role:body.role,result:'WIN',playerPower:26000000,totalBattleDamage:26000000,bossPower:isBoss?18000000:5500000,contribution,bonusPercent:0,defeatContributionPercent:10,bossHpBefore:before,bossHpAfter:boss?.hp||0,bossMaxHp:boss?.maxHp||0,bossOpened:opened,bossDefeated:defeated,boss:{name:state.event.bossName},cards:previewCards,reward:state.event.attemptReward,state:structuredClone(state)};}
return structuredClone(state);};
let runtimePromise=null;
window.ensureFeatureResources=()=>runtimePromise||=(async()=>{for(const url of ['/js/battle-v2-live.js','/js/project-v-battle-art-adapter-v1.js','/js/project-v-tier-battle-art-adapter-v1.js','/js/project-v-monster-battle-art-adapter-v1.js','/js/project-v-unassigned-battle-fallback-v1.js','/preview/project-v-v3/project-v-firearm-qc-audio.js','/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js'])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url+'?sealDragon=20261022-v1';s.onload=resolve;s.onerror=()=>reject(Error('전투 파일 로드 실패'));document.head.append(s);});})();
`;
fs.writeFileSync(folder+'fixture.js',fixture);
let admin=fs.readFileSync(folder+'admin.html','utf8');admin=admin.replace("const settings={mode:","const settings={format:'SEALS_BOSS',bossStage:sample.event.bossStage&&{name:sample.event.bossName,hp:15000000000,battlePower:18000000},mode:");fs.writeFileSync(folder+'admin.html',admin);
