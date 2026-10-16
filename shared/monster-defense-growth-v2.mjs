// User-approved TEST roguelike contract. All currencies expire with the run.
const art='preview/monster-defense-exclusive-20261016-v1/assets/';
export const ROGUE_ENEMIES=Object.freeze([
 {id:'RIVET',name:'리벳 보병',kind:'NORMAL',asset:art+'01-rivet-vanguard-v1.png',hp:1,speed:1,attack:1,height:180},
 {id:'HOUND',name:'레이저 하운드',kind:'RUNNER',asset:art+'02-razor-hound-v1.png',hp:.58,speed:1.7,attack:.75,height:170},
 {id:'BASTION',name:'바스티온 가드',kind:'ELITE',asset:art+'03-bastion-guard-v1.png',hp:2.6,speed:.65,attack:1.25,armor:25,height:230},
 {id:'VEIL',name:'베일 스나이퍼',kind:'RANGED',asset:art+'04-veil-sniper-v1.png',hp:.8,speed:.8,attack:1.1,range:530,height:210},
 {id:'CRAWLER',name:'시즈 크롤러',kind:'ELITE',asset:art+'05-siege-crawler-v1.png',hp:3.8,speed:.5,attack:1.5,range:410,pattern:'BARRAGE',height:260},
 {id:'WEAVER',name:'펄스 위버',kind:'SUPPORT',asset:art+'06-pulse-weaver-v2.png',hp:1.05,speed:.8,attack:.6,range:370,heal:true,height:215},
 {id:'NOX',name:'노크스 집행관',kind:'BOSS',asset:art+'07-nox-executor-v1.png',hp:14,speed:.6,attack:2.2,pattern:'TRIAD',hint:'10W 포격 · 20W 지원 병력 · 마지막 전선 연속 공격. 붉은 예고를 보고 지원 이동하세요.',height:340}
]);
export const GROWTH_BRANCHES=Object.freeze([
 {id:'ATTACK',name:'공격',subtitle:'화력 증폭',icon:'✦',color:'#f4bd79',key:'attackPercent',unit:'%',description:'분대 전체 공격력'},
 {id:'VITAL',name:'생존',subtitle:'장갑 재구축',icon:'⬡',color:'#8fe0bd',key:'hpPercent',unit:'%',description:'분대 전체 최대 체력'},
 {id:'TACTIC',name:'전술',subtitle:'회로 가속',icon:'⌁',color:'#b6b4ff',key:'cooldownPercent',unit:'%',description:'전술 재사용 대기 감소'}
]);
export const DEFENSE_TRAITS=Object.freeze([
 {id:'PIERCE',name:'관통 탄두',tag:'공격 · 원거리',symbol:'↗',description:'원거리 기본 공격이 뒤의 적 1명에게 60% 추가 피해를 줍니다.',color:'#f4bd79'},
 {id:'BULWARK',name:'방벽 연동',tag:'방어 · 전선',symbol:'⬡',description:'방어 태세의 같은 전선 아군 보호 시간이 6초에서 9초로 늘어납니다.',color:'#8fe0bd'},
 {id:'MEDIC_CORE',name:'응급 회로',tag:'회복 · 수호석',symbol:'✚',description:'응급 회복 전술을 사용하면 공동 수호석 체력도 3% 회복합니다.',color:'#8fe0bd'},
 {id:'ALLIANCE',name:'지원 협약',tag:'협동 · 기동',symbol:'⇄',description:'다른 대원의 전선에 도착하면 8초간 공격속도 +20%, 4초간 보호막을 얻습니다.',color:'#b6b4ff'},
 {id:'QUICK',name:'고속 동기화',tag:'전술 · 충전',symbol:'⌁',description:'분대 전술 재사용 대기가 추가로 10% 감소합니다. 총 감소 상한 40%.',color:'#b6b4ff'},
 {id:'EXECUTE',name:'중장갑 해체',tag:'공격 · 정예',symbol:'✦',description:'정예와 보스에게 주는 분대 피해가 20% 증가합니다.',color:'#f4bd79'},
 {id:'RECOVERY',name:'야전 정비',tag:'생존 · 복구',symbol:'✚',description:'웨이브 종료 시 살아 있는 분대원의 회복량이 최대 체력 25%에서 40%로 늘어납니다.',color:'#8fe0bd'},
 {id:'BARRICADE',name:'최후의 방벽',tag:'협동 · 수호석',symbol:'≋',description:'수호석 앞 합류 구간의 적 이동속도를 20% 줄입니다. 같은 특성은 중복되지 않습니다.',color:'#b6b4ff'}
]);
export const defaultDefenseGrowth=()=>({
 waves:30,prepSeconds:15,
 drops:{NORMAL:{chance:50,amount:100},ELITE:{chance:65,amount:150},BOSS:{chance:80,amount:250}},
 tiers:[{from:1,to:3,chance:60,cost:100},{from:4,to:6,chance:35,cost:150},{from:7,to:9,chance:15,cost:200},{from:10,to:10,chance:5,cost:300}],
 effects:{attackPercent:8,hpPercent:10,cooldownPercent:3}
});
export function validateDefenseGrowth(value=defaultDefenseGrowth()){
 const bad=message=>{throw Object.assign(Error(message),{status:400,code:'DEFENSE_GROWTH'});};
 const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)bad(label+' 범위를 확인하세요.');return n;};
 if(!value||typeof value!=='object')bad('성장 설정을 확인하세요.');
 const waves=integer(value.waves,10,60,'웨이브');if(waves%10)bad('웨이브는 10단위로 설정하세요.');
 const prepSeconds=integer(value.prepSeconds,15,60,'정비 시간');
 const drops={};for(const kind of ['NORMAL','ELITE','BOSS']){const d=value.drops?.[kind];if(!d)bad('포인트 추첨 3종을 설정하세요.');drops[kind]={chance:integer(d.chance,0,100,'획득 확률'),amount:integer(d.amount,1,10000,'포인트')};}
 if(!Array.isArray(value.tiers)||value.tiers.length!==4)bad('강화 구간 4개를 설정하세요.');
 const ranges=[[1,3],[4,6],[7,9],[10,10]],tiers=value.tiers.map((t,i)=>{if(t?.from!==ranges[i][0]||t?.to!==ranges[i][1])bad('강화 구간을 확인하세요.');return {from:t.from,to:t.to,chance:integer(t.chance,0,100,'강화 확률'),cost:integer(t.cost,1,10000,'강화 비용')};});
 const effects={};for(const [key,max]of [['attackPercent',30],['hpPercent',30],['cooldownPercent',3]])effects[key]=integer(value.effects?.[key],1,max,'강화 효과');
 return {waves,prepSeconds,drops,tiers,effects};
}
export const growthTier=(growth,level)=>growth.tiers.find(t=>level>=t.from&&level<=t.to);
export const waveKind=wave=>wave%10===0?'BOSS':wave%5===0?'ELITE':'NORMAL';
export const hasTrait=(player,id)=>Boolean(player?.growth?.traits.includes(id));
export const newPlayerGrowth=()=>({levels:{ATTACK:0,VITAL:0,TACTIC:0},draws:[],attempts:[],attemptSeq:0,traits:[],offers:[],readyWave:-1,earned:0,spent:0});
export function growthRandom(room){room.growthRng=(Math.imul(room.growthRng,1664525)+1013904223)>>>0;return room.growthRng/4294967296;}
export function settleWaveGrowth(room){
 if(room.wave>=room.encounter.waves)return;
 const policy=room.growthPolicy,kind=waveKind(room.wave),drop=policy.drops[kind];
 for(const player of room.players){
  const g=player.growth;if(g.draws.some(d=>d.wave===room.wave))continue;
  const won=growthRandom(room)*100<drop.chance,amount=won?drop.amount:0;
  player.credits+=amount;g.earned+=amount;g.readyWave=-1;
  g.draws.push({id:room.id+':'+room.wave+':'+player.id,wave:room.wave,kind,chance:drop.chance,prize:drop.amount,won,amount,balance:player.credits});
  if(room.wave%5===0){
   const available=DEFENSE_TRAITS.filter(t=>!g.traits.includes(t.id)).map(t=>t.id),choices=[];
   while(available.length&&choices.length<3)choices.push(available.splice(Math.floor(growthRandom(room)*available.length),1)[0]);
   if(choices.length)g.offers.push({id:room.id+':trait:'+room.wave+':'+player.id,wave:room.wave,choices,selected:null});
  }
 }
}
