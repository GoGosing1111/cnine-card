import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LEGION_HUNT_SETTINGS_KEY,validateLegionHuntPolicy} from '../../functions/_legion_hunt_settings.js';
import {validateRegionPolicy} from '../../functions/_legion_regions.js';
import {LEGION_REGIONS_KEY} from '../../shared/legion-regions-v1.mjs';

export const operation='ops:legion:secret-blueprints:20261120:v1';
export const chapters=[1,2,3].map(n=>'SECRET_WEAPON_BLUEPRINT_CHAPTER_'+n);
const oldRef='SUPERSTAR_UPGRADE_13_TICKET', weight=0.001;
const keys=[LEGION_HUNT_SETTINGS_KEY,LEGION_REGIONS_KEY];
const digest=s=>createHash('sha256').update(s).digest('hex');
export function replaceTicket(items,catalog){
 const found=items.filter(i=>i.type==='INVENTORY_ITEM'&&i.ref===oldRef);
 assert.equal(found.length,1,'Expected one existing +13 ticket per field table');
 assert.ok(found[0].enabled&&items.every(i=>!chapters.includes(i.ref)));
 const fresh=chapters.map(code=>{
  const c=catalog.find(row=>row.code===code);
  assert.ok(c&&Number(c.is_active)===1&&c.rarity==='SPECIAL'&&c.image_url.startsWith('assets/'));
  return {code:'INVENTORY_ITEM:'+code,type:'INVENTORY_ITEM',ref:code,name:c.name,image:'/'+c.image_url,rarity:c.rarity,tier:'normal',enabled:true,weight,minQuantity:1,maxQuantity:1};
 });
 return items.flatMap(row=>row===found[0]?fresh:[row]);
}
const fields=(island,regional)=>[island,...regional.regions.map(r=>r.fieldDrops)];
function validateTargets(island,regional){
 const all=fields(island,regional);
 assert.equal(all.length,6);assert.equal(island.mode,'ON');assert.equal(regional.mode,'ON');
 for(const p of all){
  assert.ok(p.items.every(i=>i.ref!==oldRef));
  assert.deepEqual(p.items.filter(i=>chapters.includes(i.ref)).map(i=>[i.ref,i.weight,i.minQuantity,i.maxQuantity,i.enabled]),chapters.map(ref=>[ref,weight,1,1,true]));
 }
 validateLegionHuntPolicy(island,island.items);validateRegionPolicy(regional);
}
export async function updateLegionBlueprints(db,mode='check'){
 assert.ok(['check','rehearse','apply','verify'].includes(mode));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.query(mode==='check'||mode==='verify'?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='10s'");
  await db.query("SET LOCAL lock_timeout='3s'");
  const prior=(await q('SELECT value FROM app_meta WHERE key=$1',[operation]))[0];
  if(prior){
   const record=JSON.parse(prior.value);
   if(mode==='verify'){
    const rows=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[keys]);
    const data=Object.fromEntries(rows.map(r=>[r.key,JSON.parse(r.value)]));
    validateTargets(data[keys[0]],data[keys[1]]);
    assert.equal((await q('SELECT id FROM admin_logs WHERE id=$1',[record.auditId])).length,1);
   }
   await db.query('ROLLBACK');return {existing:true,...record};
  }
  assert.notEqual(mode,'verify','Receipt not present');
  const write=mode==='rehearse'||mode==='apply';
  if(write){
   await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[operation]);
   const raced=(await q('SELECT value FROM app_meta WHERE key=$1',[operation]))[0];
   if(raced){await db.query('ROLLBACK');return {existing:true,...JSON.parse(raced.value)};}
  }
  assert.equal((await q('SELECT current_database() db'))[0].db,'cnine');
  const rows=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key'+(write?' FOR UPDATE':''),[keys]);
  assert.equal(rows.length,2);
  const before=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  const island=JSON.parse(before[keys[0]]),regional=JSON.parse(before[keys[1]]);
  const catalog=await q('SELECT code,name,rarity,image_url,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code'+(write?' FOR SHARE':''),[chapters]);
  assert.equal(catalog.length,3);
  const calc=p=>{const old=p.items;p.items=replaceTicket(old,catalog);assert.deepEqual(old.filter(i=>i.ref!==oldRef),p.items.filter(i=>!chapters.includes(i.ref)));};
  fields(island,regional).forEach(calc);
  const previousRevision=[island.revision,regional.revision];island.revision++;regional.revision++;
  const stamp=(await q('SELECT clock_timestamp() at'))[0].at;
  const owner=(await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"))[0];assert.ok(owner);
  island.updatedAt=new Date(stamp).toISOString();island.updatedBy=Number(owner.id);
  validateTargets(island,regional);
  const next=Object.fromEntries([[keys[0],JSON.stringify(island)],[keys[1],JSON.stringify(regional)]]);
  const totalWeight=island.items.reduce((sum,i)=>sum+(i.enabled?Math.round(i.weight*1000):0),0);
  const record={operation,at:stamp,revisionBefore:previousRevision,revisionAfter:[island.revision,regional.revision],tables:6,chapters,weight,quantity:1,totalWeight:totalWeight/1000,conditionalPercent:100/totalWeight,basePercentPerKill:island.difficulties.map(d=>({difficulty:d.id,each:d.dropPercent/totalWeight,bossEach:d.bossDropPercent/totalWeight})),beforeHash:keys.map(k=>digest(before[k])),afterHash:keys.map(k=>digest(next[k])),accountGrants:0};
  if(!write){await db.query('ROLLBACK');return record;}
  for(const key of keys)assert.equal((await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3',[next[key],key,before[key]])).rowCount,1);
  const after=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[])',[keys]);
  for(const row of after)assert.equal(row.value,next[row.key]);
  const audit=(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'LEGION_SECRET_BLUEPRINTS','APP_META',$2,$3,$4) RETURNING id::text",[owner.id,operation,JSON.stringify(Object.fromEntries(keys.map(k=>[k,JSON.parse(before[k])]))),JSON.stringify(Object.fromEntries(keys.map(k=>[k,JSON.parse(next[k])])))]))[0];record.auditId=audit.id;
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[operation,JSON.stringify(record)]);
  const writes=await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins+n_tup_upd+n_tup_del>0');
  assert.ok(writes.every(t=>['app_meta','admin_logs'].includes(t.relname)));
  await db.query(mode==='apply'?'COMMIT':'ROLLBACK');return {...record,rehearsal:mode==='rehearse'};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
