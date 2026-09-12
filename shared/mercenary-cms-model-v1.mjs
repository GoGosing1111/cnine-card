export const CMS_MAX_BYTES = 512 * 1024;
export const ACQUISITIONS = {UNSET:'미설정',COIN:'코인 구매',DROP:'콘텐츠 획득',EVENT:'이벤트',CRAFT:'제작',QUEST:'퀘스트'};
export const REVIEWS = {PENDING:'검수 대기',REVIEWED:'CMS 검수 완료'};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected, label) {
  if (!object(value) || Object.keys(value).length !== expected.length || expected.some(key=>!Object.hasOwn(value,key)))
    throw Error(`${label}: 누락되거나 허용되지 않은 항목이 있습니다.`);
}
function text(value, max, label, required=false) {
  if (typeof value !== 'string' || value.length>max || (required&&!value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw Error(`${label}: ${required?'빈칸 없이 ':''}${max}자 이내로 입력하세요.`);
}
function number(value, max, label, integer=true, min=0) {
  if (value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value))))
    throw Error(`${label}: 미정이면 비우고, ${min}~${max} 범위의 ${integer?'정수':'수치'}를 입력하세요.`);
}
function entries(rows, ids, key, label) {
  if (!Array.isArray(rows)||rows.length!==ids.length||new Set(rows.map(row=>row?.[key])).size!==ids.length||rows.some(row=>!ids.includes(row?.[key])))
    throw Error(`${label}: 전체 목록과 고유 ID를 확인하세요.`);
}
export function validateMercenaryCms(d, catalog) {
  keys(d,['format','rosterVersion','status','runtimeEnabled','mercenaries','skills','assignments','settings'],'CMS');
  if(d.format!=='MERCENARY_CMS_V1'||d.rosterVersion!==catalog.rosterVersion||d.status!=='DRAFT'||d.runtimeEnabled!==false)
    throw Error('공동 출시 전에는 CMS 초안 상태만 저장할 수 있습니다.');
  const codes=catalog.cards.map(c=>c.code), ids=catalog.skills.map(s=>s.id);
  entries(d.mercenaries,codes,'code','용병'); entries(d.skills,ids,'id','스킬'); entries(d.assignments,codes,'code','스킬 배정');
  for(const row of d.mercenaries){
    const label=row.code;
    keys(row,['code','rank','position','role','basicTarget','skillTarget','specialty','weakness','rationale','name','title','stats','acquisition','growth','review','notes'],label);
    if(row.rank!==null&&!catalog.ranks.includes(row.rank))throw Error(`${label}: 용병 등급을 확인하세요.`);
    const locked=catalog.cards.find(c=>c.code===row.code).rank;
    if(locked&&row.rank!==locked)throw Error(`${label}: 사용자 확정 등급 ${locked}를 유지하세요.`);
    const role=catalog.roles[row.role];
    if(!Object.hasOwn(catalog.roles,row.role)||!role.positions.includes(row.position)||!role.targets.includes(row.skillTarget)||row.basicTarget!=='FRONT_ENEMY')
      throw Error(`${label}: 역할에 맞는 포지션·대상을 선택하세요.`);
    text(row.name,60,`${label} 이름`,true);text(row.title,100,`${label} 칭호`,true);
    for(const key of ['specialty','weakness','rationale'])text(row[key],240,`${label} ${key}`,true);
    keys(row.stats,['hp','attack','defense','speed'],`${label} 능력치`);
    for(const key of Object.keys(row.stats))number(row.stats[key],1000000000,`${label} ${key}`);
    keys(row.acquisition,['type','source','coinPrice','dropRate'],`${label} 획득`);
    if(!Object.hasOwn(ACQUISITIONS,row.acquisition.type))throw Error(`${label}: 획득 방식을 확인하세요.`);
    text(row.acquisition.source,500,`${label} 획득처`);number(row.acquisition.coinPrice,1000000000000,`${label} 가격`);
    number(row.acquisition.dropRate,100,`${label} 획득 확률`,false);
    keys(row.growth,['maxLevel','hpPerLevel','attackPerLevel','defensePerLevel'],`${label} 성장`);
    for(const key of Object.keys(row.growth))number(row.growth[key],key==='maxLevel'?10000:1000000000,`${label} ${key}`,true,key==='maxLevel'?1:0);
    if(!Object.hasOwn(REVIEWS,row.review))throw Error(`${label}: 검수 상태를 확인하세요.`);
    text(row.notes,2000,`${label} 메모`);
  }
  for(const row of d.skills){
    keys(row,['id','name','role','target','mechanic','trigger','effect','counterplay','bossRule','procRule','balance','review','notes'],row.id);
    for(const key of ['name','role','target','mechanic','trigger','effect','counterplay','bossRule','procRule'])text(row[key],key==='name'?80:2000,`${row.id} ${key}`,true);
    keys(row.balance,['damageRatio','cooldownTurns','cost'],`${row.id} 밸런스`);
    number(row.balance.damageRatio,10000,`${row.id} 피해 배율`,false);number(row.balance.cooldownTurns,10000,`${row.id} 재사용 턴`);number(row.balance.cost,1000000000,`${row.id} 비용`);
    if(!Object.hasOwn(REVIEWS,row.review))throw Error(`${row.id}: 검수 상태를 확인하세요.`);
    text(row.notes,2000,`${row.id} 메모`);
  }
  for(const row of d.assignments){
    keys(row,['code','skillIds'],`${row.code} 배정`);
    if(!Array.isArray(row.skillIds)||row.skillIds.length>ids.length||new Set(row.skillIds).size!==row.skillIds.length||row.skillIds.some(id=>!ids.includes(id)))
      throw Error(`${row.code}: 중복되거나 등록되지 않은 스킬입니다.`);
  }
  keys(d.settings,['rankGrowth','acquisitionNotes','growthNotes','releaseNotes'],'공통 설정');
  entries(d.settings.rankGrowth,catalog.ranks,'rank','등급 성장');
  for(const row of d.settings.rankGrowth){
    keys(row,['rank','maxLevel','coinPerLevel','expPerLevel'],`${row.rank} 성장`);
    number(row.maxLevel,10000,`${row.rank} 최대 레벨`,true,1);number(row.coinPerLevel,1000000000000,`${row.rank} 성장 코인`);number(row.expPerLevel,1000000000,`${row.rank} 경험치`);
  }
  for(const key of ['acquisitionNotes','growthNotes','releaseNotes'])text(d.settings[key],4000,key);
  return structuredClone(d);
}
