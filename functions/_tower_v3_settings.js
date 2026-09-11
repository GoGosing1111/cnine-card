import {TOWER_V3_DRAFT,TOWER_V3_RELEASE_ENABLED,validateTowerConfigChange,towerError} from './_tower_v3.js';
import {TOWER_V3_ECONOMY_DRAFT,validateTowerEconomy} from './_tower_v3_economy.js';
export const TOWER_V3_SETTINGS_KEY='tower_v3_settings_v1';
async function readRecord(env){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(TOWER_V3_SETTINGS_KEY).first();
  if(!row)return {raw:null,value:{revision:0,config:{...TOWER_V3_DRAFT},economy:{...TOWER_V3_ECONOMY_DRAFT}}};
  let value;try{value=JSON.parse(row.value);}catch{throw towerError('TOWER_V3_CONFIG','저장된 탑 설정을 확인하세요.');}
  return {raw:row.value,value:{...value,config:validateTowerConfigChange(null,value.config),economy:validateTowerEconomy(value.economy)}};
}
export async function readTowerV3Settings(env){return (await readRecord(env)).value;}
export async function saveTowerV3Draft(env,user,body){
  if(String(user?.role).toUpperCase()!=='OWNER')throw towerError('TOWER_V3_PERMISSION','운영자 권한이 필요합니다.');
  const record=await readRecord(env),before=record.value;
  if(body?.revision!==before.revision)throw towerError('TOWER_V3_CONFIG_CONFLICT','다른 창에서 설정이 변경됐습니다. 최신 시안을 다시 불러오세요.');
  const config=validateTowerConfigChange(before.config,body.config),economy=validateTowerEconomy({...body.economy,approved:false});
  if(!TOWER_V3_RELEASE_ENABLED&&config.mode==='ON')throw towerError('TOWER_V3_RELEASE_HELD','통합 출시 전에는 OFF 또는 TEST 시안만 저장할 수 있습니다.');
  if(config.mode==='ON')throw towerError('TOWER_V3_ECONOMY_APPROVAL','보상 시안 저장은 운영 활성화 승인이 아닙니다.');
  const next={revision:before.revision+1,config,economy,updatedBy:Number(user.id),updatedAt:new Date().toISOString()};
  const result=record.raw!==null?await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),TOWER_V3_SETTINGS_KEY,record.raw).run()
    :await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(TOWER_V3_SETTINGS_KEY,JSON.stringify(next)).run();
  if(Number(result.meta?.changes)!==1)throw towerError('TOWER_V3_CONFIG_CONFLICT','시안 저장 중 설정이 변경됐습니다.');
  return {ok:true,...next};
}
