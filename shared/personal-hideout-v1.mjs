export const HIDEOUT_ART='/assets/ui/personal-hideout-20261116/';
export const HIDEOUT_KEY=id=>'personal_hideout_v1:'+Number(id);
export const HIDEOUT_MAX_LEVEL=4;
export const HIDEOUT_MAX_FACILITY_LEVEL=5;
export const HIDEOUT_STAGES=Object.freeze([
 {level:1,code:'shanty',name:'판자촌',description:'회수한 자재로 세운 첫 보금자리',width:2400,facilityLevel:1,activeDays:0,cost:{}},
 {level:2,code:'apartment',name:'일반 아파트',description:'생활과 작업 공간을 갖춘 내 집',width:3200,facilityLevel:2,activeDays:7,cost:{STEEL:240,WIRE:150,CIRCUIT:60,COOLANT:48,DRIVE:30,CORE:18}},
 {level:3,code:'luxury',name:'고급 아파트',description:'넓은 거실과 전용 전시 공간',width:4000,facilityLevel:4,activeDays:21,cost:{STEEL:560,WIRE:350,CIRCUIT:140,COOLANT:112,DRIVE:70,CORE:42}},
 {level:4,code:'penthouse',name:'펜트하우스',description:'도시를 내려다보는 가장 넓은 은신처',width:4800,facilityLevel:5,activeDays:42,cost:{STEEL:1040,WIRE:650,CIRCUIT:260,COOLANT:208,DRIVE:130,CORE:78}}
].map(stage=>Object.freeze({...stage,image:HIDEOUT_ART+'residence-'+stage.code+'.webp'})));
export const hideoutFacilityLimit=level=>level>0?(HIDEOUT_STAGES[level-1]?.facilityLevel||0):0;
export function hideoutSpace(raw){
 const state=hideoutState(raw),stage=HIDEOUT_STAGES[Math.max(0,state.level-1)];let start=0;
 const rooms=(state.rooms.length?state.rooms:['main']).map(code=>{const room=HIDEOUT_ROOMS.find(r=>r.code===code),width=code==='main'?stage.width:1920;const zone={code,name:room.name,start,width};start+=width;return zone;});
 return {height:640,bayWidth:960,width:start,rooms,furnitureWidths:{workbench:480,fridge:180,garage:480,armory:300,sofa:420,lamp:100,trophy:460}};
}
export const HIDEOUT_PARTS=Object.freeze([
 {code:'STEEL',name:'회수 철판',source:'몬스터 토벌 · 군단토벌 · 레이드'},
 {code:'WIRE',name:'구리 배선',source:'몬스터 토벌 · 군단토벌 · 레이드'},
 {code:'CIRCUIT',name:'제어 회로',source:'악몽·아포칼립스 토벌 · 군단토벌 · 레이드'},
 {code:'COOLANT',name:'냉각 장치',source:'군단토벌 · 레이드'},
 {code:'DRIVE',name:'구동 부품',source:'군단토벌 · 레이드'},
 {code:'CORE',name:'동력 코어',source:'군단토벌 클리어 · 레이드 클리어'}
].map((p,i)=>Object.freeze({...p,image:HIDEOUT_ART+'part-'+p.code.toLowerCase()+'.webp',index:i})));
export const HIDEOUT_FURNITURE=Object.freeze([
 {code:'workbench',name:'작업대',description:'다른 시설과 은신처 업그레이드의 부품 소모량 감소',effect:'부품 비용',step:3,unit:'%'},
 {code:'fridge',name:'냉장고',description:'일반 군단토벌 최대 행동력 증가',effect:'군단토벌 최대 행동력',step:1,unit:''},
 {code:'garage',name:'차고',description:'파티 군단토벌 최대 행동력 증가',effect:'파티 군단토벌 최대 행동력',step:1,unit:''},
 {code:'armory',name:'무기고',description:'군단토벌의 용병 장비 드랍 확률을 기본 확률에 비례해 증가',effect:'용병 장비 드랍률',step:5,unit:'%'},
 {code:'sofa',name:'휴식 소파',description:'전투 콘텐츠 코인 보상 증가 · 기존 보상 한도 유지',effect:'전투 코인',step:2,unit:'%'},
 {code:'lamp',name:'분석 조명',description:'일반 카드팩 SSR 이상 추첨 가중치 증가 · 한정·확정·천장 제외',effect:'일반 카드팩 고등급 가중치',step:2,unit:'%'}
].map((p,i)=>Object.freeze({...p,image:HIDEOUT_ART+'furniture-'+p.code+'.webp',index:i})));
const codes=HIDEOUT_FURNITURE.map(f=>f.code);
export const HIDEOUT_ROOMS=Object.freeze([
 {code:'main',name:'주거 공간',requiredLevel:1,cost:{}},
 {code:'workshop',name:'작업 구역',requiredLevel:2,cost:{STEEL:80,WIRE:50,CIRCUIT:20,DRIVE:10}},
 {code:'gallery',name:'트로피 전시관',requiredLevel:2,cost:{STEEL:60,WIRE:40,CIRCUIT:20,CORE:5}},
 {code:'annex',name:'확장 공간',requiredLevel:3,cost:{STEEL:120,WIRE:80,CIRCUIT:30,COOLANT:20,DRIVE:20,CORE:10}}
]);
export const HIDEOUT_DECOR=Object.freeze([
 {code:'sofa',name:'휴식 소파',image:HIDEOUT_ART+'furniture-sofa.webp',cost:{STEEL:6,WIRE:4}},
 {code:'lamp',name:'산업용 조명',image:HIDEOUT_ART+'furniture-lamp.webp',cost:{STEEL:4,WIRE:6}},
 {code:'trophy',name:'대형 트로피 진열장',image:HIDEOUT_ART+'trophy-stand.webp',cost:{STEEL:8,WIRE:4,CIRCUIT:2}}
]);
export const HIDEOUT_TROPHY_SLOTS=6;
export const emptyHideout=()=>({version:2,revision:0,level:0,activityDates:[],facilities:Object.fromEntries(codes.map(c=>[c,0])),rooms:[],placements:[],parts:Object.fromEntries(HIDEOUT_PARTS.map(p=>[p.code,0]))});
const fail=(message,code='HIDEOUT_INPUT',status=400)=>{throw Object.assign(Error(message),{code,status});};
export function hideoutState(raw){
 if(raw==null)return emptyHideout();
 const out=structuredClone(raw),defaults=emptyHideout();
 // V1 had five house levels. Preserve every part, facility and placement when
 // reading it into the four residence tiers; facility growth still reaches 5.
 if(out.version===1&&Number.isInteger(out.level)&&out.level>=0&&out.level<=5){out.level=Math.min(out.level,HIDEOUT_MAX_LEVEL);out.version=2;}
 out.activityDates??=[];
 if(!Array.isArray(out.activityDates)||out.activityDates.length>HIDEOUT_STAGES.at(-1).activeDays||new Set(out.activityDates).size!==out.activityDates.length||out.activityDates.some(day=>!Number.isSafeInteger(day)||day<0))fail('전투 활동일 기록을 확인할 수 없습니다.','HIDEOUT_STATE',503);
 out.facilities={...defaults.facilities,...out.facilities};out.parts={...defaults.parts,...out.parts};
 if(out.version!==2||!Number.isSafeInteger(out.revision)||out.revision<0||!Number.isInteger(out.level)||out.level<0||out.level>HIDEOUT_MAX_LEVEL)fail('은신처 기록을 확인할 수 없습니다.','HIDEOUT_STATE',503);
 if(!out.facilities||codes.some(c=>!Number.isInteger(out.facilities[c])||out.facilities[c]<0||out.facilities[c]>hideoutFacilityLimit(out.level))||!out.parts||HIDEOUT_PARTS.some(p=>!Number.isSafeInteger(out.parts[p.code])||out.parts[p.code]<0||out.parts[p.code]>1000000000))fail('시설·부품 기록을 확인할 수 없습니다.','HIDEOUT_STATE',503);
 if(!Array.isArray(out.rooms)||new Set(out.rooms).size!==out.rooms.length||out.rooms.some(c=>!HIDEOUT_ROOMS.some(r=>r.code===c))||!Array.isArray(out.placements)||out.placements.length>120||new Set(out.placements.map(p=>p.id)).size!==out.placements.length)fail('공간·가구 배치 기록을 확인할 수 없습니다.','HIDEOUT_STATE',503);
 for(const p of out.placements){
  if(p.code==='trophy'&&p.kind==='decor'){
   if(!p.trophyCodes)p.trophyCodes=[p.trophyCode||null,...Array(HIDEOUT_TROPHY_SLOTS-1).fill(null)];
   p.trophyCode=p.trophyCodes[0]||null;
  }
  validatePlacement(p,out.rooms);
 }
 return out;
}
function validatePlacement(p,rooms){
 if(!p||typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(p.id)||!['facility','decor'].includes(p.kind)||!(p.kind==='facility'?codes.includes(p.code):HIDEOUT_DECOR.some(d=>d.code===p.code))||p.room!==null&&!rooms.includes(p.room)||!Number.isInteger(p.x)||p.x<0||p.x>1000||!Number.isInteger(p.y)||p.y<0||p.y>1000||typeof p.flipped!=='boolean'||p.trophyCode!=null&&(p.code!=='trophy'||typeof p.trophyCode!=='string'))fail('가구의 위치와 방향을 확인하세요.');
 if(p.code==='trophy'&&(!Array.isArray(p.trophyCodes)||p.trophyCodes.length!==HIDEOUT_TROPHY_SLOTS||p.trophyCodes.some(code=>code!==null&&(typeof code!=='string'||code.length>80))))fail('트로피 진열칸을 확인하세요.');
}
export function hideoutBenefits(raw){
 const s=hideoutState(raw),f=s.facilities;
 return {unlocked:s.level>0,level:s.level,legionEnergy:s.level>0?1+f.fridge:0,partyEnergy:s.level>0?1+f.garage:0,mercenaryEquipmentPercent:f.armory*5,cardWeightPercent:f.lamp*2,coinPercent:f.sofa*2,materialDiscountPercent:f.workbench*3};
}
export function hideoutCost(raw,target){
 const s=hideoutState(raw),room=target==='room',level=(room?s.level:s.facilities[target])+1;
 if(!room&&!codes.includes(target))fail('시설을 선택하세요.');
 if(level>(room?HIDEOUT_MAX_LEVEL:HIDEOUT_MAX_FACILITY_LEVEL))return null;
 if(room&&level===1)return {};
 const base=room?HIDEOUT_STAGES[level-1].cost:
  {STEEL:12*level,WIRE:8*level,...(level>1?{CIRCUIT:3*level}:{}),...(level>2?{COOLANT:2*level,DRIVE:2*level}:{}),...(level>3?{CORE:level}:{})};
 const scale=room?1:[1,2,4,7,12][level-1];
 const discount=target==='workbench'?0:s.facilities.workbench*3;
 return Object.fromEntries(Object.entries(base).map(([c,n])=>[c,Math.ceil(n*scale*(100-discount)/100)]));
}
export function changeHideout(raw,action,body,{newId,ownedTrophies=[]}={}){
 const s=hideoutState(raw);
 if(body.revision!==s.revision)fail('은신처가 갱신됐습니다. 최신 상태를 확인한 뒤 다시 시도하세요.','HIDEOUT_CONFLICT',409);
 const spend=cost=>{if(Object.entries(cost).some(([c,n])=>s.parts[c]<n))fail('업그레이드 부품이 부족합니다.','HIDEOUT_PARTS',409);for(const [c,n] of Object.entries(cost))s.parts[c]-=n;};
 if(action==='arrange'){
  if(!s.level)fail('먼저 은신처를 개방하세요.');
  if(!Array.isArray(body.placements)||body.placements.length!==s.placements.length||new Set(body.placements.map(p=>p.id)).size!==s.placements.length)fail('보유한 가구 전체의 배치를 확인하세요.');
  s.placements=body.placements.map(p=>{const old=s.placements.find(o=>o.id===p.id);if(!old)fail('보유하지 않은 가구입니다.');const next={...old,room:p.room,x:p.x,y:p.y,flipped:p.flipped};validatePlacement(next,s.rooms);return next;});
 }else if(action==='expand'){
  const room=HIDEOUT_ROOMS.find(r=>r.code===body.room);
  if(!room||s.rooms.includes(room.code)||s.level<room.requiredLevel)fail('확장할 공간과 은신처 레벨을 확인하세요.');
  spend(room.cost);s.rooms.push(room.code);
 }else if(action==='decorate'){
  const item=HIDEOUT_DECOR.find(d=>d.code===body.item);
  if(!s.level||!item||!s.rooms.includes(body.room)||s.placements.filter(p=>p.kind==='decor').length>=114||!newId)fail('장식과 배치할 공간을 확인하세요.');
  spend(item.cost);s.placements.push({id:newId,kind:'decor',code:item.code,room:body.room,x:item.code==='trophy'?585:500,y:item.code==='trophy'?450:800,flipped:false,trophyCode:null,...(item.code==='trophy'?{trophyCodes:Array(HIDEOUT_TROPHY_SLOTS).fill(null)}:{})});
 }else if(action==='trophy'){
  const item=s.placements.find(p=>p.id===body.id&&p.kind==='decor'&&p.code==='trophy');
  const slot=body.slot??0;if(!Number.isInteger(slot)||slot<0||slot>=HIDEOUT_TROPHY_SLOTS)fail('진열칸을 선택하세요.');
  const owned=ownedTrophies.find(t=>t.code===body.trophyCode),displayed=s.placements.reduce((count,p)=>count+(p.trophyCodes||[]).filter((code,index)=>!(p.id===body.id&&index===slot)&&code===body.trophyCode).length,0);
  if(!item||body.trophyCode!==null&&(!owned||displayed>=owned.count))fail('보유 수량 안에서 트로피와 진열대를 선택하세요.','HIDEOUT_TROPHY',403);
  item.trophyCodes[slot]=body.trophyCode;item.trophyCode=item.trophyCodes[0];
 }else if(action==='upgrade'){
  const target=body.target,room=target==='room',cost=hideoutCost(s,target);
  if(!cost)fail('최대 레벨에 도달했습니다.');
  if(room&&s.activityDates.length<HIDEOUT_STAGES[s.level].activeDays)fail('다음 거주지에 필요한 전투 활동일이 부족합니다.','HIDEOUT_ACTIVITY',409);
  if(!room&&(!s.level||s.facilities[target]>=hideoutFacilityLimit(s.level)))fail('은신처 레벨을 먼저 올리세요.');
  if(!room&&s.facilities[target]===0&&s.placements.length>=120)fail('가구 보유 한도는 120개입니다.','HIDEOUT_CAPACITY',409);
  spend(cost);
  if(room){s.level++;if(s.level===1)s.rooms.push('main');}
  else {s.facilities[target]++;if(s.facilities[target]===1){const placementRoom=body.room??'main';if(!s.rooms.includes(placementRoom))fail('시설을 설치할 공간을 선택하세요.');const positions={workbench:[20,700],fridge:[285,400],garage:[625,700],armory:[810,400],sofa:[985,850],lamp:[390,400]},[x,y]=positions[target];s.placements.push({id:'facility-'+target,kind:'facility',code:target,room:placementRoom,x,y,flipped:false,trophyCode:null});}}
 }else fail('지원하지 않는 은신처 요청입니다.');
 s.revision++;return hideoutState(s);
}
export function hideoutAward(event){
 if(event.eligible===false||event.seasonReplay===true)return null;
 const source=event.source,win=event.won===true;
 if(['HUNT','NIGHTMARE','APOCALYPSE'].includes(source))return win?{STEEL:2,WIRE:1,...(source!=='HUNT'?{CIRCUIT:1}:{})}:null;
 if(source==='LEGION')return {STEEL:8,WIRE:5,CIRCUIT:2,COOLANT:2,DRIVE:1,...(win?{CORE:1}:{})};
 if(source==='RAID')return win?{STEEL:20,WIRE:12,CIRCUIT:6,COOLANT:4,DRIVE:4,CORE:3}:null;
 return null;
}
export function publicHideout(raw){
 const state=hideoutState(raw);
 return {state,benefits:hideoutBenefits(state),parts:HIDEOUT_PARTS,rooms:HIDEOUT_ROOMS,decor:HIDEOUT_DECOR,facilities:HIDEOUT_FURNITURE.map(f=>({...f,level:state.facilities[f.code],cost:hideoutCost(state,f.code)})),roomCost:hideoutCost(state,'room'),maximumLevel:HIDEOUT_MAX_LEVEL,trophySlots:HIDEOUT_TROPHY_SLOTS,stages:HIDEOUT_STAGES,stage:HIDEOUT_STAGES[Math.max(0,state.level-1)],nextStage:HIDEOUT_STAGES[state.level]||null,facilityMaximum:hideoutFacilityLimit(state.level),space:hideoutSpace(state)};
}
export function hideoutCardRates(rows,bonus){
 if(!(bonus>0))return rows;
 const boosted=new Set(['SSR','MA','FUR','ZENITH','SUPERSTAR','ICON']);
 return rows.map(row=>boosted.has(row.rarity)?{...row,rate:Number(row.rate)*(1+Math.min(10,bonus)/100)}:row);
}
