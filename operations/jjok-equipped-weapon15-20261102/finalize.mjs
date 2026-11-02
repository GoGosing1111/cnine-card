import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import plan from './plan.json' with {type:'json'};
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {inspect} from './grant.mjs';
import {readForgePreparationInventory} from '../../output/revan-live-20261027/release-checkout/functions/_equipment_forge_preparation.js';
import {forgeEquipmentBonus} from '../../output/revan-live-20261027/release-checkout/functions/_equipment_forge_transactions.js';

const read=async name=>JSON.parse(await fs.readFile(new URL('evidence/'+name+'.json',import.meta.url),'utf8'));
const applied=await read('apply'),dry=await read('dry-run'),verified=await read('verify'),snapshots=await read('commit-candidate-snapshots');
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
 const state=await inspect(db),equipment=[],slots=['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'];
 for(const slot of slots){
  const equipped=state.equipped.filter(item=>item.slot===slot);assert.equal(equipped.length,1);const instanceId=equipped[0].id;
  const view=await readForgePreparationInventory(adapter,'303',{focusId:instanceId,includeEnhancement:true});assert.equal(view.items.length,1);const item=view.items[0];
  assert.equal(item.instanceId,instanceId);assert.equal(item.slot,slot);assert.equal(item.equipped,true);assert.equal(item.enhancement.level,15);
  if(slot==='WEAPON'){assert.equal(instanceId,plan.targets[0].instanceId);assert.equal(item.code,plan.targets[0].code);assert.equal(item.enhancement.revision,1);}
  else{
   const prior=snapshots.before.state.forge.find(row=>row.instance_id===instanceId);assert(prior,'Prior upgraded armor must remain equipped');assert.equal(prior.level,15);assert.equal(item.enhancement.revision,prior.revision);
   assert.equal(String(snapshots.before.state.equipmentLoadout.find(row=>row.slot===slot).instance_id),instanceId);
  }
  equipment.push({slot:item.slot,instanceId:item.instanceId,code:item.code,name:item.name,equipped:item.equipped,level:item.enhancement.level,revision:item.enhancement.revision,power:item.enhancement.power,basePower:item.basePower});
 }
 const bonus=await forgeEquipmentBonus({DB:adapter},303);
 const expected=equipment.reduce((sum,item)=>({pve:sum.pve+item.power.pve-item.basePower.pve,pvp:sum.pvp+item.power.pvp-item.basePower.pvp}),{pve:0,pvp:0});assert.deepEqual(bonus,expected);
 live={checkedAt:new Date().toISOString(),readOnly:true,reader:'readForgePreparationInventory',bonusReader:'forgeEquipmentBonus',equipment,bonus,sync:state.sync,ranked:state.ranked};
 await db.query('ROLLBACK');
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(safe(error));process.exitCode=1;}finally{await db.end().catch(()=>{});}
assert(live,'Independent live equipment read required');await fs.writeFile(new URL('evidence/live-equipment-verify.json',import.meta.url),JSON.stringify(live,null,2)+'\n',{flag:'wx'});
const receipt=applied.receipt,kst=value=>new Date(new Date(value).getTime()+9*3600000).toISOString().replace('T',' ').slice(0,19)+' KST';
const summary={status:'COMPLETED_AND_INDEPENDENTLY_VERIFIED',operationKey:plan.operationKey,authorization:plan.authorization,userId:'303',nickname:plan.recipient.nickname,completedAt:receipt.completedAt,completedAtKst:kst(receipt.completedAt),verifiedAt:live.checkedAt,auditId:receipt.auditId,changedEquipment:1,targetLevel:15,changes:receipt.changes,planHash:applied.planHash,sourceSha256:applied.sourceSha256,targetedTests:3,actualInventoryReadersChecked:5,battleBonusReaderChecked:true,previousArmorUpgradePreserved:true,rollbackVerified:true,injectedFailureRollback:true,noWriteReplayVerified:true,independentConnection:true,leasesReleased:true,cost:0,messagesSent:0,deployment:false,storageMaintenance:false};
await fs.writeFile(new URL('completion.json',import.meta.url),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const target=plan.targets[0];
const doc=`# [C9]족쪽이 장착 무기 15강 — 2026-11-02

완료: **${summary.completedAtKst} · 감사 ${summary.auditId}**. 계정 ID303이 장착한 **${target.name}**을 **0 → 15강**으로 변경했다. 고유 장비 ID **${target.instanceId}**, 카탈로그 ID40/코드 ${target.code} 및 장착을 유지했다. 기존 강화 상태 없음 → level15/revision1.

- 완료키: \`${plan.operationKey}\`. 같은 요청을 새키로 다시 실행하거나 이후 정상 변경을 덮지 않는다. 재실행은 기존 영수증 확인을 위한 SELECT만 수행한다. 이전 방어구 작업 \`ops:jjok-equipped-armor15:20261102:v1\`는 재실행하지 않았다.
- 실제 계정 신원·장착·소유·기존 강화 상태 부재를 대조하고, USER_LOCK과 DB 계정 잠금 아래 무기 강화 상태·감사·완료 영수증을 한 거래로 확정했다. 기존 강화 행이 나타나면 덮어쓰지 않고 중단한다.
- 관련 검사3개, 실제 실패/정상 예행연습 원복, 독립 READ ONLY와 SELECT 전용 재실행 쓰기0, inventory/랭크 캐시 갱신, 잠금 반환 확인.
- 실제 readForgePreparationInventory로 무기와 이전 방어구·장신구까지 **5개 장착/15강**을 확인했다. 이전 네 장비의 ID와 강화 revision 유지. forgeEquipmentBonus의 전투 강화 합계도 실제 조회값과 일치했다.
- 장착·배틀슈트·다른 장비·용병 장비·연마·수량·재화·강화 재료 보존, 비용0. UI 변경·실기기 검수·게임재배포·메시지·유지관리·예약 없음. 기존 폴더/의존성 재사용.

계획 SHA-256: \`${summary.planHash}\`. 실행 파일 집합 SHA-256: \`${summary.sourceSha256}\`. 같은 operations 폴더에 계획·전후·원복·완료 영수증·독립 확인 증거를 보존한다.
`;
await fs.writeFile(new URL('README.md',import.meta.url),doc,{flag:'wx'});
const docs=new URL('../../docs/qa/jjok-equipped-weapon15-20261102/',import.meta.url);await fs.mkdir(docs,{recursive:true});await fs.writeFile(new URL('README.md',docs),doc,{flag:'wx'});
console.log(JSON.stringify({status:summary.status,nickname:summary.nickname,auditId:summary.auditId,completedAtKst:summary.completedAtKst,weapon:live.equipment.find(item=>item.slot==='WEAPON'),previousArmorUpgradePreserved:true,allEquippedFiveLevel15:live.equipment.every(item=>item.level===15)}));
