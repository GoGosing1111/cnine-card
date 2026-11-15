import assert from 'node:assert/strict';
import {decodePolishState,polishStateKey} from '../../functions/_equipment_growth.js';
export const OP='ops:workshop-polish-inheritance:20261115:v1';
export function mergePolish(sourceRaw,targetRaw,sourceId,targetId,userId,settings){
 const inherited=decodePolishState(sourceRaw,sourceId,userId),before=decodePolishState(targetRaw,targetId,userId);
 const after={...before,attempts:before.attempts+inherited.attempts,rolls:(before.rolls??before.attempts)+(inherited.rolls??inherited.attempts),levels:before.levels.map((n,i)=>n+inherited.levels[i]),values:before.values.map((n,i)=>Math.round((n+inherited.values[i])*1000000)/1000000)};
 assert(after.attempts<=settings.maxAttempts,'Recovery requires a separate over-cap policy');assert(after.levels.every((n,i)=>n<=settings.options[i].maxLevel),'Recovery exceeds an option cap');
 return {before,inherited,after};
}
export function recoveryPlan(preflight,lineage){
 const settings=JSON.parse(preflight.settings.find(s=>s.key==='equipment_polish_settings_v1').value),states=new Map(preflight.states.map(s=>[s.key,s])),updates=[];
 const successes=preflight.crafts.filter(c=>c.status==='COMPLETED'&&JSON.parse(c.plan_json).result.success);
 for(const craft of successes){
  const result=JSON.parse(craft.plan_json).result,sourceKey=polishStateKey(result.input.instanceId,craft.user_id),source=states.get(sourceKey);if(!source||result.polishInherited)continue;
  assert(!source.live_id,'Consumed source unexpectedly still exists');
  const equipmentId=String(result.output.ref),owner=String(craft.user_id),owned=lineage.items.filter(x=>x.user_id===owner&&x.equipment_id===equipmentId),records=lineage.destroyed.filter(x=>String(x.user_id)===owner&&String(x.equipment_id)===equipmentId);
  assert.equal(successes.filter(c=>c.user_id===owner&&String(JSON.parse(c.plan_json).result.output.ref)===equipmentId).length,1,'Ambiguous workshop grant');
  assert.equal(owned.length,1,'Ambiguous current equipment');const target=owned[0];
  const chain=[];let rootId=target.id;const visited=new Set([rootId]);
  while(true){const parents=records.filter(r=>r.restored_instance_id===rootId);assert(parents.length<=1);if(!parents.length)break;const r=parents[0];chain.unshift(r);rootId=r.original_instance_id;assert(!visited.has(rootId));visited.add(rootId);}
  assert.equal(records.length,chain.length,'Other disconnected equipment exists');
  const first=lineage.receipts.filter(r=>r.status==='COMPLETED'&&r.kind==='FORGE_ENHANCE'&&String(r.user_id)===owner&&JSON.parse(r.plan_json).item.instanceId===rootId).sort((a,b)=>a.created_at.localeCompare(b.created_at))[0];
  assert(first,'Missing initial enhancement evidence');assert.equal(JSON.parse(first.plan_json).item.level,0);
  const elapsed=Date.parse(first.created_at)-Date.parse(craft.completed_at);assert(elapsed>=0&&elapsed<10*60*1000,'Initial enhancement is not adjacent to this sole craft');
  if(chain.length){assert.equal(target.source_type,'FORGE_RESTORE');assert.equal(target.source_id,chain.at(-1).record_id);assert.equal(target.request_id,chain.at(-1).restore_request_id);}else assert.equal(target.request_id,craft.request_id);
  const merged=mergePolish(source.value,target.polish_raw,result.input.instanceId,target.id,owner,settings);
  updates.push({userId:owner,nickname:craft.nickname,sourceKey,sourceRaw:source.value,sourceId:result.input.instanceId,targetId:target.id,targetKey:polishStateKey(target.id,owner),targetRaw:target.polish_raw,afterRaw:JSON.stringify(merged.after),equipmentId,forgeLevel:Number(target.forge_level),craftRequestId:craft.request_id,craftPlan:craft.plan_json,rootId,chain,firstEnhancement:first,resolution:'Sole successful craft and sole equipment family, immediate +0 enhancement, then exact destroyed/restored IDs',...merged});
 }
 assert.equal(new Set(updates.map(u=>u.targetId)).size,updates.length,'Duplicate target');return {operationKey:OP,settingsRaw:preflight.settings.find(s=>s.key==='equipment_polish_settings_v1').value,updates};
}
