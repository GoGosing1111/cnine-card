import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const checks=[];
const assert=(name,condition)=>{if(!condition)throw new Error(`FAIL: ${name}`);checks.push(name)};

const api=read('functions/api/[[path]].js');
const scrapyard=read('functions/_scrapyard.js');
const workshop=read('functions/_workshop.js');
const equipment=read('functions/_equipment.js');
const miracle=read('functions/_black_miracle_pack.js');
const ui=read('js/workshop-v1676.js');
const migration=read('database/migrations/0071_v1676_scrapyard_synthesis.sql');

assert('폐차장 API 라우팅',api.includes('handleScrapyard')&&api.includes("'scrapyard/run'"));
assert('게임 요청 직렬화',api.includes("'workshop/synthesis','scrapyard/run'"));
assert('폐차장 KST 인덱스 범위 조회',scrapyard.includes('created_at>=? AND created_at<?')&&!scrapyard.includes("date(created_at,'+9 hours')"));
assert('웨이브 클리어 수 기반 드랍',scrapyard.includes('rollsMultiplier:battle.wavesCleared'));
assert('원정 영수증 재생',scrapyard.includes("prior?.status==='COMPLETED'")&&scrapyard.includes('replayed:true'));
assert('동일 장비 정확히 3개',workshop.includes('LIMIT 3')&&workshop.includes('!==3'));
assert('장착 장비 합성 제외',workshop.includes('l.instance_id IS NULL'));
assert('합성 원자 가드',workshop.includes('verified=1')&&workshop.includes('SYNTH_LOG_TABLE'));
assert('신화 합성 중복 결과 허용',workshop.includes("rarity==='MYTHIC'?'MYTHIC'"));
assert('신화 중복 트리거 재생성 제거',!equipment.includes('MYTHIC_EQUIPMENT_DUPLICATE'));
assert('신화 보급상자 중복 지급',equipment.includes("&&normalizeEquipmentRarity(item.rarity)!=='MYTHIC'"));
assert('블랙 미라클 신화 중복 지급',!miracle.includes('NOT EXISTS(SELECT 1 FROM user_equipment_instances'));
assert('밀어서 결과 확인',ui.includes('role="slider"')&&ui.includes("pct>=92")&&ui.includes("classList.add('revealed')"));
assert('특수문자 이미지 경로 보호',ui.includes("replace(/#/g,'%23')"));
assert('마이그레이션 트리거 해제',migration.includes('DROP TRIGGER IF EXISTS trg_user_equipment_mythic_unique'));
assert('폐차장 배경 자산',fs.existsSync(new URL('assets/ui/scrapyard/scrapyard-arena-v1676.png',root)));

console.log(`V1676 validation passed (${checks.length} checks)`);
for(const name of checks)console.log(`- ${name}`);
