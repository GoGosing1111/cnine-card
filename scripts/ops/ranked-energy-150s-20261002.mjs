// User-authorized ranked recharge change; does not touch player energy or seasons.
export const OPERATION_KEY='ops:ranked-energy-150s:20261002';
const keys=['pvp_settings_v1','tier_settings_v1'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
export async function inspect(client){
 const {rows}=await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[...keys,OPERATION_KEY]]);
 return Object.fromEntries(rows.map(({key,value})=>[key,JSON.parse(value)]));
}
export async function setRankedRecharge(client,{commit=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL statement_timeout='8s'");
  await client.query("SET LOCAL lock_timeout='2s'");
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const prior=await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior.rows.length){await client.query('ROLLBACK');return {...JSON.parse(prior.rows[0].value),replayed:true};}
  const {rows}=await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[keys]);
  check(rows.length===2,'Ranked settings or tier mirror missing');
  const before=Object.fromEntries(rows.map(({key,value})=>[key,JSON.parse(value)])),after=structuredClone(before);
  for(const settings of [after.pvp_settings_v1,after.tier_settings_v1.pvp]){
   check(settings?.energy&&Number.isFinite(Number(settings.energy.rechargeMinutes)),'Ranked energy configuration missing');
   settings.energy.rechargeMinutes=2.5;
  }
  for(const key of keys){
   const result=await client.query('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1 RETURNING key',[key,JSON.stringify(after[key])]);
   check(result.rows.length===1,'Ranked settings update failed');
  }
  const receipt={operation:OPERATION_KEY,completedAt:new Date().toISOString(),rechargeSeconds:150,before,after};
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)]);
  await client.query(commit?'COMMIT':'ROLLBACK');
  return {...receipt,committed:commit,dryRun:!commit};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
