export const DEFENSE_KEY='monster_defense_settings_v1';
export const DEFENSE_RULES=Object.freeze({sessionMs:120000,roomMs:3600000,battleMs:1800000,pollMs:300,maxCatchupMs:5000});
// Existing approved originals: no recolouring or replacement of source art.
const hunt='assets/ui/project-v/monsters/hunt-tower/';
const forge='assets/ui/cooperative-arke-v1/';
export const DEFENSE_ENEMIES=Object.freeze([
 {id:'SLIME',name:'점액 선봉',kind:'NORMAL',asset:hunt+'hunt-001-cute-slime-sd-v1.png',hp:1,speed:1,attack:1,height:160},
 {id:'FROG',name:'독안개 개구리',kind:'RUNNER',asset:hunt+'hunt-005-kyokasuigetsu-frog-sd-v1.png',hp:.65,speed:1.85,attack:.8,height:170},
 {id:'STALKER',name:'용철 추적자',kind:'NORMAL',asset:forge+'forge-stalker-v1.png',hp:1.3,speed:1.1,attack:1.2,height:200},
 {id:'WATCHER',name:'불씨 감시기',kind:'RANGED',asset:forge+'ember-watcher-v1.png',hp:.85,speed:.85,attack:1.15,range:480,height:180},
 {id:'CROW',name:'블러드 크로우',kind:'RUNNER',asset:hunt+'tower-024-blood-crow-sd-v1.png',hp:.9,speed:1.65,attack:1.1,height:190},
 {id:'WRAITH',name:'달빛 악령',kind:'RANGED',asset:hunt+'tower-027-moon-wraith-sd-v1.png',hp:1.2,speed:.9,attack:1.35,range:550,height:210},
 {id:'OMEGA',name:'오메가-09',kind:'ELITE',asset:hunt+'hunt-068-omega-09-sd-v1.png',hp:3.5,speed:.7,attack:1.8,armor:20,height:250},
 {id:'WARDEN',name:'노심 수문장',kind:'ELITE',asset:forge+'core-warden-v1.png',hp:3,speed:.75,attack:2,armor:15,height:270},
 {id:'SEAL_KING',name:'거대 물개왕',kind:'BOSS',asset:hunt+'hunt-008-big-seal-boss-sd-v1.png',hp:12,speed:.5,attack:2.5,pattern:'RALLY',hint:'지원 병력을 소환합니다. 돌파병을 먼저 차단하세요.',height:310},
 {id:'KRIEG',name:'커맨더 크리그',kind:'BOSS',asset:hunt+'tower-064-commander-krieg-sd-v1.png',hp:16,speed:.5,attack:3,pattern:'BARRAGE',hint:'붉은 예고 후 해당 전선에 포격합니다. 지원 이동으로 피하세요.',height:320},
 {id:'FALLEN_LORD',name:'타락한 성기사',kind:'BOSS',asset:hunt+'tower-021-fallen-paladin-sd-v1.png',hp:18,speed:.55,attack:3.2,armor:20,pattern:'RUPTURE',hint:'중갑과 전선 충격파로 압박합니다. 전술과 회복을 나눠 사용하세요.',height:330},
 {id:'VAMPIRE',name:'핏빛 군주',kind:'BOSS',asset:hunt+'tower-019-vampire-sd-v1.png',hp:20,speed:.6,attack:3.3,pattern:'DRAIN',hint:'피해를 준 만큼 체력을 흡수합니다. 예고된 전선에서 이탈하세요.',height:330},
 {id:'ARKE',name:'삼핵 거신 아르케',kind:'BOSS',asset:forge+'arke-battle-sprite-v1.png',hp:23,speed:.45,attack:3.5,armor:10,pattern:'TRIAD',hint:'세 전선을 순서대로 강타합니다. 표적 전선과 다음 전선을 확인하세요.',height:390}
]);
export const DEFENSE_DIFFICULTIES=Object.freeze([
 {id:'GUIDE',name:'입문',subtitle:'초록빛 성문',waves:8,hpPercent:65,attackPercent:65,speedPercent:85,spawnPercent:75,coreHp:1300,pool:['SLIME','FROG','STALKER','WATCHER'],elite:'WARDEN',midBoss:'WARDEN',boss:'SEAL_KING',accent:'#79d9a8'},
 {id:'NORMAL',name:'보통',subtitle:'용철의 행군',waves:10,hpPercent:90,attackPercent:85,speedPercent:100,spawnPercent:90,coreHp:1200,pool:['SLIME','FROG','STALKER','WATCHER','CROW'],elite:'OMEGA',midBoss:'SEAL_KING',boss:'KRIEG',accent:'#75cde9'},
 {id:'HARD',name:'어려움',subtitle:'타락한 공성군',waves:12,hpPercent:110,attackPercent:105,speedPercent:108,spawnPercent:100,coreHp:1100,pool:['STALKER','WATCHER','CROW','WRAITH'],elite:'WARDEN',midBoss:'KRIEG',boss:'FALLEN_LORD',accent:'#edbd73'},
 {id:'NIGHTMARE',name:'악몽',subtitle:'핏빛 달의 침공',waves:14,hpPercent:135,attackPercent:125,speedPercent:115,spawnPercent:110,coreHp:1000,pool:['CROW','WRAITH','WATCHER','STALKER','FROG'],elite:'OMEGA',midBoss:'FALLEN_LORD',boss:'VAMPIRE',accent:'#c39ae9'},
 {id:'CATACLYSM',name:'재앙',subtitle:'삼핵 거신의 진격',waves:16,hpPercent:160,attackPercent:145,speedPercent:120,spawnPercent:120,coreHp:1000,pool:['STALKER','WATCHER','CROW','WRAITH','FROG'],elite:'WARDEN',midBoss:'VAMPIRE',boss:'ARKE',accent:'#ee8185'}
]);
export const defenseEnemy=id=>DEFENSE_ENEMIES.find(e=>e.id===id);
export const defenseDifficulty=id=>DEFENSE_DIFFICULTIES.find(d=>d.id===id);
export const defaultDefenseSettings=()=>({mode:'TEST',revision:0,testUserIds:[],rewardsEnabled:false,difficulties:DEFENSE_DIFFICULTIES.map(d=>({id:d.id,enabled:true,hpPercent:d.hpPercent,attackPercent:d.attackPercent,speedPercent:d.speedPercent,spawnPercent:d.spawnPercent,coreHp:d.coreHp}))});
export function validateDefenseSettings(raw){
 const bad=message=>{throw Object.assign(Error(message),{status:400,code:'DEFENSE_SETTINGS'});};
 if(!raw||!['OFF','TEST'].includes(raw.mode)||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.revision>2147483640||raw.rewardsEnabled!==false)bad('디펜스는 OFF 또는 TEST로 설정하며 계정 보상은 비활성입니다.');
 if(!Array.isArray(raw.testUserIds)||raw.testUserIds.length>100||new Set(raw.testUserIds).size!==raw.testUserIds.length||raw.testUserIds.some(id=>!Number.isSafeInteger(id)||id<1))bad('테스트 계정 ID를 확인하세요.');
 if(!Array.isArray(raw.difficulties)||raw.difficulties.length!==5)bad('난이도 5개를 모두 설정하세요.');
 const difficulties=raw.difficulties.map((d,i)=>{
  if(d?.id!==DEFENSE_DIFFICULTIES[i].id||typeof d.enabled!=='boolean')bad('난이도 종류와 순서를 확인하세요.');
  const out={id:d.id,enabled:d.enabled};
  for(const [key,min,max] of [['hpPercent',25,400],['attackPercent',25,400],['speedPercent',50,180],['spawnPercent',50,160],['coreHp',500,5000]]){
   if(!Number.isSafeInteger(d[key])||d[key]<min||d[key]>max)bad(`${d.id} ${key}: ${min}~${max} 정수를 입력하세요.`);out[key]=d[key];
  }return out;
 });
 return {mode:raw.mode,revision:raw.revision,testUserIds:[...raw.testUserIds],rewardsEnabled:false,difficulties};
}
export const defenseAccess=(user,settings)=>Boolean(user)&&settings.mode==='TEST'&&(user.role==='OWNER'||settings.testUserIds.includes(Number(user.id)));
export const validDefenseRoom=id=>typeof id==='string'&&/^[A-F0-9]{12}$/.test(id);
