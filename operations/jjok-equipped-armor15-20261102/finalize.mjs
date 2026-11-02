import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import plan from './plan.json' with {type:'json'};
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {inspect} from './grant.mjs';
import {readForgePreparationInventory} from '../../output/revan-live-20261027/release-checkout/functions/_equipment_forge_preparation.js';
import {forgeEquipmentBonus} from '../../output/revan-live-20261027/release-checkout/functions/_equipment_forge_transactions.js';

const read=async name=>JSON.parse(await fs.readFile(new URL('evidence/'+name+'.json',import.meta.url),'utf8'));
const applied=await read('apply'),dry=await read('dry-run'),verified=await read('verify');
assert.equal(applied.replayed,false);assert.equal(verified.verification.status,'VERIFIED');assert.equal(applied.receipt.auditId,verified.verification.auditId);
assert.equal(applied.sourceSha256,dry.sourceSha256);assert.equal(applied.sourceSha256,verified.sourceSha256);
for(const key of ['rollbackVerified','injectedFailureRollback','noWriteReplayVerified','leasesReleased'])assert.equal(dry[key],true);
assert(applied.leasesReleased&&verified.independentConnection&&verified.noWriteReplayVerified);
const db=connect();let live;
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const adapter={dialect:'postgres',prepare(sql){
  assert.match(sql,/^\s*SELECT\b/i,'Only read-only runtime calls allowed');
  return{bind(...args){let i=0;const query=sql.replace(/\?/g,()=>'$'+(++i));return{
   first:async()=>(await db.query(query,args)).rows[0]??null,
   all:async()=>({results:(await db.query(query,args)).rows})
  };}};
 }};
 const state=await inspect(db),equipment=[];
 for(const target of plan.targets){
  const view=await readForgePreparationInventory(adapter,'303',{focusId:target.instanceId,includeEnhancement:true});assert.equal(view.items.length,1);const item=view.items[0];
  assert.equal(item.instanceId,target.instanceId);assert.equal(item.code,target.code);assert.equal(item.slot,target.slot);assert.equal(item.equipped,true);
  assert.equal(item.enhancement.level,15);assert.equal(item.enhancement.revision,target.beforeRevision+1);
  equipment.push({slot:item.slot,instanceId:item.instanceId,code:item.code,name:item.name,equipped:item.equipped,beforeLevel:target.beforeLevel,level:item.enhancement.level,revision:item.enhancement.revision,power:item.enhancement.power,basePower:item.basePower});
 }
 const bonus=await forgeEquipmentBonus({DB:adapter},303);
 const expected=equipment.reduce((sum,item)=>({pve:sum.pve+item.power.pve-item.basePower.pve,pvp:sum.pvp+item.power.pvp-item.basePower.pvp}),{pve:0,pvp:0});
 const otherLevels=state.forge.filter(row=>state.equipped.some(item=>item.id===row.instance_id&&!plan.targetSlots.includes(item.slot)));
 assert(otherLevels.every(row=>row.level===0),'Another equipped upgraded item needs separate bonus accounting');assert.deepEqual(bonus,expected);
 live={checkedAt:new Date().toISOString(),readOnly:true,reader:'readForgePreparationInventory',bonusReader:'forgeEquipmentBonus',equipment,bonus,sync:state.sync,ranked:state.ranked};
 await db.query('ROLLBACK');
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(safe(error));process.exitCode=1;}finally{await db.end().catch(()=>{});}
assert(live,'Independent equipment read required');
await fs.writeFile(new URL('evidence/live-equipment-verify.json',import.meta.url),JSON.stringify(live,null,2)+'\n',{flag:'wx'});
const receipt=applied.receipt,kst=value=>new Date(new Date(value).getTime()+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:plan.authorization,userId:'303',nickname:plan.recipient.nickname,completedAt:receipt.completedAt,completedAtKst:kst(receipt.completedAt),verifiedAt:live.checkedAt,auditId:receipt.auditId,changedEquipment:4,targetLevel:15,changes:receipt.changes,planHash:applied.planHash,sourceSha256:applied.sourceSha256,targetedTests:3,actualInventoryReadersChecked:4,battleBonusReaderChecked:true,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,independentConnection:true,leasesReleased:true,cost:0,messagesSent:0,deployment:false,storageMaintenance:false};
await fs.writeFile(new URL('completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const rows=receipt.changes.map(t=>`| ${t.name} | ${t.slot} | ${t.instanceId} | ${t.beforeLevel} → 15 | ${t.beforeRevision} → ${t.afterRevision} |`).join('\n');
const doc=`# [C9]족쪽이 장착 방어구·장신구 15강 — 2026-11-02

완료: **${summary.completedAtKst} · 감사 ${summary.auditId}**. 계정 ID303의 현재 장착 상의·하의·신발·장신구 4개를 15강으로 변경했다.

| 장비 | 부위 | 고유 장비 ID | 강화 전후 | revision 전후 |
| --- | --- | --- | --- | --- |
${rows}

- 완료 키: \`${plan.operationKey}\`. 같은 요청을 새 키로 재실행하거나 이후 정상 변경을 되돌리지 않는다. 재실행은 기존 영수증 검증을 위한 SELECT만 실행한다.
- 실제 장착·소유·신원·강화 revision을 고정해 대조한 후, 운영 USER_LOCK과 DB 계정 잠금 아래 4개 강화 상태·감사·완료 영수증을 한 거래로 확정했다. 실패/정상 예행연습의 전체 원복과 잠금 반환을 확인했다.
- 강화 레벨과 각 revision만 변경했다. 기존 장착·무기·배틀슈트·미장착 장비·용병 장비·연마·보유 수량·재화·강화 재료를 보존했다. inventory 동기화와 랭크 캐시 버전 갱신을 확인했다.
- 관련 거래 검사 3개 통과. 독립 READ ONLY 연결에서 실제 readForgePreparationInventory로 4개 장착/+15/고유 ID를 확인했고, forgeEquipmentBonus의 실제 전투 강화 합계도 대조했다. UI 변경·실기기 검수·게임 재배포·메시지·유지관리·예약 없음.

계획 SHA-256: \`${summary.planHash}\`. 실행 파일 집합 SHA-256: \`${summary.sourceSha256}\`. 계획·전후 스냅샷·원복·영수증·독립 검증은 같은 operations 폴더에 보존한다.
`;
await fs.writeFile(new URL('README.md',import.meta.url),doc,{flag:'wx'});
const docs=new URL('../../docs/qa/jjok-equipped-armor15-20261102/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});
console.log(JSON.stringify({status:summary.status,userId:'303',nickname:summary.nickname,auditId:summary.auditId,completedAtKst:summary.completedAtKst,equipment:live.equipment.map(item=>({name:item.name,before:item.beforeLevel,after:item.level})),bonus:live.bonus}));
