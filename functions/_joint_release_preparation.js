import {validateJointReleaseDocument,JOINT_RELEASE_DOCUMENT_KEY} from './_joint_release_document.js';
import {jointHash} from './_joint_transactions.js';
import {validateMercenaryRuntime,ensureMercenaryRuntimeSchema} from './_mercenary_account.js';
import {ensureForgeTransactionSchema} from './_equipment_forge_transactions.js';
import {validateForgePolicy} from '../shared/equipment-forge-policy-v1.mjs';
import {validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {validateMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {MERCENARY_ACCOUNTING_SCHEMA} from './_mercenary_draw_accounting.js';
import {validateTowerV3Config} from './_tower_v3.js';
import {validateTowerEconomy} from './_tower_v3_economy.js';
import {validateExpeditionPolicy} from './_expedition_v3_settings.js';
import {ensureTowerV3Schema} from './_tower_v3_runs.js';
import {ensureScrapyardV3Schema} from './_scrapyard_v3_runs.js';
import {ensureExpeditionV3Schema} from './_expedition_v3_runs.js';
import {jointError} from './_joint_request.js';

// Explicit deployment preparation only. There is intentionally no HTTP route.
// Existing CMS/rank/assignment/draw documents and user balances are not seeded.
export async function prepareJointReleaseSchema(env){
 if(env.DB.execSchema)await env.DB.execSchema(MERCENARY_ACCOUNTING_SCHEMA);else for(const sql of MERCENARY_ACCOUNTING_SCHEMA)await env.DB.prepare(sql).run();
 for(const prepare of[ensureTowerV3Schema,ensureScrapyardV3Schema,ensureExpeditionV3Schema,ensureMercenaryRuntimeSchema,ensureForgeTransactionSchema])await prepare(env);
}
export async function collectJointReleaseSchema({postgres=false}={}){
 const statements=[],DB=postgres?{execSchema:async rows=>statements.push(...rows)}:{prepare:sql=>({run:async()=>{statements.push(sql);}})};
 await prepareJointReleaseSchema({DB});
 if(statements.some(sql=>!/^CREATE (?:TABLE|(?:UNIQUE )?INDEX) IF NOT EXISTS /i.test(sql)))throw Error('JOINT_SCHEMA_MUST_NOT_CHANGE_EXISTING_DATA');
 return [...new Set(statements)];
}
export async function compileJointReleaseDocument(input){
 const doc=validateJointReleaseDocument(input),c=doc.components,fail=message=>{throw jointError('JOINT_RELEASE_CONFIG',message,409);};
 const merc=c.MERCENARY,config=validateMercenaryCms(merc.document,MERCENARY_CMS_SEED.catalog),runtime=validateMercenaryRuntime({...merc.runtime,mode:'TEST'});
 if(config.mercenaries.some(m=>!m.rank))fail('용병 등급을 모두 확정하세요.');
 const assigned=new Set(config.assignments.flatMap(a=>a.skillIds));if(config.skills.some(s=>assigned.has(s.id)&&(s.review!=='REVIEWED'||Object.values(s.balance).some(n=>n===null))))fail('직접 배정한 스킬의 검수·계수를 확정하세요.');
 if(runtime.opening.paymentKind==='UNSET')fail('용병 획득 비용을 확정하세요.');
 c.MERCENARY={...merc,document:config,draw:validateMercenaryDraw(merc.draw),runtime:{...runtime,mode:'ON',approved:true}};
 const forge=validateForgePolicy({...c.EQUIPMENT_FORGE,mode:'TEST'});
 if(forge.steps.some(s=>['successPpm','maintainPpm','destroyPpm','coinCost','itemQuantity','protectionQuantity'].some(k=>s[k]===null))||!forge.protection.itemCode||forge.protection.consume==='UNSET'||!forge.protection.sources.some(s=>s.enabled)||!forge.restoration.enabled)fail('강화 10단계 코인·마스터의 별·확률·보호권 게임 내 획득·복구 정책을 모두 확정하세요.');
 c.EQUIPMENT_FORGE={...forge,mode:'ON',approved:true};
 c.TOWER={...c.TOWER,config:validateTowerV3Config({...c.TOWER.config,mode:'ON'}),economy:validateTowerEconomy({...c.TOWER.economy,approved:true})};
 c.COW_ROOM=validateExpeditionPolicy('COW_ROOM',{...c.COW_ROOM,mode:'ON',approved:true});
 if(c.SCRAPYARD.mode!=='ON'||!Array.isArray(c.SCRAPYARD.difficulties)||c.SCRAPYARD.difficulties.length!==3)fail('폐차장 3구역 운영 정책을 확정하세요.');
 if(c.IDLE.progression!=='EXISTING_SERVER_AUTOMATIC')fail('기존 서버 자동 원정을 유지해야 합니다.');
 return {key:JOINT_RELEASE_DOCUMENT_KEY,value:JSON.stringify({document:doc,sha256:await jointHash(doc)})};
}
