// PIPE-0920: 장비 보유 수량 집계 테이블(user_equipment_counts_v1).
//
// user_equipment_instances 는 3억 2천만 행(178GB)이고 한 계정이 870만 개를 갖고 있기도 하다.
// "이 계정이 장비별로 몇 개 갖고 있나"를 인스턴스에서 매번 세면 그 계정은 조회 한 번에 수십 초가 걸리고
// (Neon 실측: 연금술 장비 목록 평균 0.5초·최대 61초, 30일 누적 DB 시간의 23%), 그동안 Hyperdrive 풀 자리를 잡는다.
//
// 그래서 PostgreSQL 트리거가 인스턴스 INSERT/DELETE 마다 (user_id, equipment_id) 별 수량을 유지한다
// (scripts/ops/equipment-counts-v1-20260921.sql). 집계 테이블이 채워지고 app_meta 마커가 켜지면
// 아래 헬퍼가 true 를 돌려주고, 호출부는 인스턴스 스캔 대신 집계 테이블을 읽는다.
// 마커가 없으면(SQLite/D1, 테스트, 백필 전) 호출부는 예전 쿼리를 그대로 쓴다. 결과 형식은 두 경로가 같다.
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

export const EQUIPMENT_COUNTS_TABLE='user_equipment_counts_v1';
export const EQUIPMENT_COUNTS_READY_KEY='equipment_counts_v1_ready';
const CACHE_KEY='equipment-counts-v1-ready';
const READY_TTL_MS=60000;   // 켜진 뒤에는 오래 유지해도 된다
const PENDING_TTL_MS=15000; // 꺼져 있을 때는 짧게 — 백필 완료 뒤 15초 안에 전환된다

export async function equipmentCountsReady(env){
  if(env?.DB?.dialect!=='postgres')return false;
  const cached=readRuntimeData(env,CACHE_KEY);
  if(cached!==undefined)return cached===true;
  let ready=false;
  try{
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(EQUIPMENT_COUNTS_READY_KEY).first();
    ready=String(row?.value||'')==='1';
  }catch(error){
    console.warn('equipment counts marker read failed',error);
  }
  cacheRuntimeData(env,CACHE_KEY,ready,ready?READY_TTL_MS:PENDING_TTL_MS);
  return ready;
}
