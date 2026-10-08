export const POLISH_KEY = 'equipment_polish_settings_v1';
export const POLISH_ITEM_CODE = 'EQUIPMENT_POLISH_STONE';
export const POLISH_EXECUTION_READY = true;
export const POLISH_ART = '/preview/equipment-polish-premium-v1/assets/';
export const POLISH_SLOTS = ['WEAPON', 'TOP', 'BOTTOM', 'SHOES', 'ACCESSORY'];
export const POLISH_OPTIONS = Object.freeze([
  {code:'ATTACK', name:'공격력', unit:'%', symbol:'↗', increment:0.5},
  {code:'CRITICAL_CHANCE', name:'치명타 확률', unit:'%p', symbol:'✧', increment:0.2},
  {code:'CRITICAL_DAMAGE', name:'치명타 피해', unit:'%p', symbol:'✦', increment:1},
  {code:'BOSS_DAMAGE', name:'보스 피해', unit:'%', symbol:'♜', increment:0.5},
  {code:'PENETRATION', name:'방어 관통', unit:'%p', symbol:'◇', increment:0.2}
]);
export function polishDefaults() {
  return {schemaVersion:1, revision:0, publicVisible:false, executionMode:'OFF',
    notice:'장비 연마를 준비하고 있습니다.', maxAttempts:20, slots:[...POLISH_SLOTS],
    options:POLISH_OPTIONS.map(o=>({code:o.code, enabled:true, weight:100, increment:o.increment, maxLevel:10})),
    costs:Array.from({length:20},(_,i)=>({attempt:i+1, coins:1000*2**Math.floor(i/5), masterStars:0, stones:1})),
    material:{code:POLISH_ITEM_CODE,name:'연마석',description:'장비의 잠든 능력을 다듬는 청금색 연마석입니다. 장비 강화 센터의 장비 연마에서 사용합니다.',active:true}};
}
function fail(message){throw Object.assign(Error(message),{code:'POLISH_POLICY',status:400});}
function integer(v,min,max,label){if(!Number.isSafeInteger(v)||v<min||v>max)fail(label+' 범위를 확인하세요.');return v;}
export function validatePolishSettings(raw) {
  if(!raw||raw.schemaVersion!==1||typeof raw.publicVisible!=='boolean'||!['OFF','ON'].includes(raw.executionMode))fail('공개 및 연마 실행 설정을 확인하세요.');
  if(typeof raw.notice!=='string'||raw.notice.length>500)fail('안내는 500자 이내로 입력하세요.');
  const maxAttempts=integer(raw.maxAttempts,1,100,'전체 연마 횟수');
  if(!Array.isArray(raw.slots)||!raw.slots.length||new Set(raw.slots).size!==raw.slots.length||raw.slots.some(s=>!POLISH_SLOTS.includes(s)))fail('대상 장비 부위를 선택하세요.');
  if(!Array.isArray(raw.options)||raw.options.length!==5)fail('성장 옵션 5개를 확인하세요.');
  const options=raw.options.map((o,i)=>{
    if(!o||o.code!==POLISH_OPTIONS[i].code||typeof o.enabled!=='boolean')fail('옵션 코드와 사용 여부를 확인하세요.');
    if(typeof o.increment!=='number'||!Number.isFinite(o.increment)||o.increment<=0||o.increment>100||Math.abs(o.increment*100-Math.round(o.increment*100))>1e-8)fail('상승량은 0.01~100, 소수 둘째 자리까지 입력하세요.');
    return {code:o.code,enabled:o.enabled,weight:integer(o.weight,o.enabled?1:0,1000000,'옵션 가중치'),increment:o.increment,maxLevel:integer(o.maxLevel,1,100,'옵션 최대 단계')};
  });
  if(options.filter(o=>o.enabled).reduce((n,o)=>n+o.maxLevel,0)<maxAttempts)fail('사용 중인 옵션의 최대 단계 합이 전체 연마 횟수보다 작습니다.');
  if(!Array.isArray(raw.costs)||raw.costs.length!==maxAttempts)fail('전체 연마 횟수와 비용표 행 수를 맞추세요.');
  const costs=raw.costs.map((c,i)=>{if(!c||c.attempt!==i+1)fail('비용표 순서를 확인하세요.');return {attempt:i+1,coins:integer(c.coins,0,1e12,'코인'),masterStars:integer(c.masterStars,0,20000000,'마스터의 별'),stones:integer(c.stones,1,1000000,'연마석')};});
  const m=raw.material;
  if(!m||m.code!==POLISH_ITEM_CODE||typeof m.name!=='string'||!m.name.trim()||m.name.length>60||typeof m.description!=='string'||m.description.length>500||typeof m.active!=='boolean')fail('연마석 이름·설명·활성 여부를 확인하세요.');
  if(raw.executionMode==='ON'&&(!raw.publicVisible||!m.active))fail('실행 ON에는 화면 공개와 연마석 활성화가 필요합니다.');
  return {schemaVersion:1,revision:integer(raw.revision,0,2147483646,'설정 버전'),publicVisible:raw.publicVisible,executionMode:raw.executionMode,notice:raw.notice,maxAttempts,slots:[...raw.slots],options,costs,material:{code:POLISH_ITEM_CODE,name:m.name.trim(),description:m.description,active:m.active}};
}
export function polishRates(settings,levels=[0,0,0,0,0]){
  const weights=settings.options.map((o,i)=>o.enabled&&levels[i]<o.maxLevel?o.weight:0),sum=weights.reduce((a,b)=>a+b,0);
  return weights.map(w=>sum?w/sum*100:0);
}
export function polishPreviewResult(settings,levels,unit){
  if(!Array.isArray(levels)||levels.length!==5||levels.some((n,i)=>!Number.isInteger(n)||n<0||n>settings.options[i].maxLevel))fail('검수 단계를 확인하세요.');
  if(levels.reduce((a,b)=>a+b,0)>=settings.maxAttempts)fail('검수 연마를 완료했습니다. 초기화 후 다시 확인하세요.');
  if(!Number.isFinite(unit)||unit<0||unit>=1)fail('추첨 값을 확인하세요.');
  const weights=settings.options.map((o,i)=>o.enabled&&levels[i]<o.maxLevel?o.weight:0),sum=weights.reduce((a,b)=>a+b,0);
  if(!sum)fail('선택 가능한 옵션이 없습니다.');
  let needle=unit*sum,selected=-1;for(let i=0;i<5;i++){needle-=weights[i];if(weights[i]&&needle<0){selected=i;break;}}
  const next=[...levels];next[selected]++;
  return {selected,before:levels[selected],after:next[selected],levels:next,total:next.reduce((a,b)=>a+b,0),previewOnly:true};
}
