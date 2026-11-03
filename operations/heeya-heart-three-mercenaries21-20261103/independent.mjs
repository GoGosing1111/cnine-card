import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';
import {mercenaryAccountState,rankedOwnedMercenaries,selectedMercenaryBattleSnapshots} from '../../functions/_mercenary_account.js';
import {handleMercenaryLevel} from '../../functions/_mercenary_level.js';
import {readMercenaryLevelState,releasedMercenaryLevelSummary} from '../../functions/_mercenary_level_policy.js';
import {grant} from './grant.mjs';
const OP='ops:heeya-heart-three-mercenaries21:20261103:v1',ID=4977,CODES=['V-974','V-950','V-982'],db=connect();
db.connectionParameters.application_name='heeya-heart-three-mercenaries21-independent';
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 let reads=0,queue=Promise.resolve();const q=(sql,args=[])=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i);reads++;const next=queue.then(async()=>(await db.query(sql,args)).rows);queue=next.catch(()=>{});return next;},one=r=>(assert.equal(r.length,1),r[0]);
 const identity=one(await q('SELECT id::text,nickname,role,status FROM users WHERE id=$1',[ID]));assert.deepEqual(identity,{id:'4977',nickname:'하이희야♡',role:'USER',status:'ACTIVE'});
 const r=JSON.parse(one(await q('SELECT value FROM app_meta WHERE key=$1',[OP])).value);assert.equal(r.status,'COMPLETED');assert.equal(r.planHash,'a38fc327133c2a7918faf0b77740babdccc2f51490ea3f739bb694c8e1172c32');assert.equal(r.planHash,hash(r.plan));assert.equal(r.protectedBeforeHash,r.protectedAfterHash);assert.equal(r.grants.length,3);assert.deepEqual(r.stockBefore,r.stockAfter);assert.deepEqual(r.issuesBefore,r.issuesAfter);
 const cards=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=ANY($2::text[]) ORDER BY mercenary_code',[ID,CODES]);assert.equal(cards.length,3);assert(cards.every(c=>Number(c.total_copies)===1&&Number(c.duplicate_count)===0));
 const levels=await q('SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 AND mercenary_code=ANY($2::text[]) ORDER BY mercenary_code',[ID,CODES]);assert.equal(levels.length,3);assert(levels.every(l=>Number(l.level)===20&&Number(l.breakthrough_mask)===15&&Number(l.experience)===0&&Number(l.revision)===1));
 const acquisitions=await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY mercenary_code',[OP+':%']);assert.equal(acquisitions.length,3);for(const a of acquisitions){assert(CODES.includes(a.mercenary_code));assert.equal(a.acquisition_id,`${OP}:${ID}:${a.mercenary_code}:1`);assert.equal(String(a.user_id),'4977');assert.equal(Number(a.total_copies_after),1);assert.equal(Number(a.is_duplicate),0);assert.equal(a.created_at,r.completedAt);}
 const a=one(await q('SELECT id::text,admin_id::text,action_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(a.id,r.auditId);assert.equal(a.admin_id,'1');assert.equal(a.action_type,'OPS_MERCENARY_GRANT_OR_LEVEL');const {auditId,...payload}=r;assert.deepEqual(JSON.parse(a.after_data),payload);
 assert.equal((await q('SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE request_id=$1 OR acquisition_id LIKE $2',[OP,OP+':%'])).length,0);assert.equal((await q('SELECT user_id FROM user_mutation_locks_v1520 WHERE action_path=$1',[OP])).length,0);
 const DB={dialect:'postgres',prepare(raw){let n=0;const sql=raw.replace(/\?/g,()=>'$'+(++n));const bound=args=>({bind(...values){return bound(values);},async first(){return (await q(sql,args))[0]??null;},async all(){return {results:await q(sql,args)};},async run(){throw Error('Read-only verification forbids writes');}});return bound([]);}};
 const env={DB},user={id:ID,role:'USER'},account=await mercenaryAccountState(env,user),ranked=await rankedOwnedMercenaries(env,[ID]);
 const growth=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('http://readonly.test/api/mercenaries/v3/leveling/state'),env,deps:{authenticate:async()=>user,json:body=>body}});
 const summary=await releasedMercenaryLevelSummary(env,ID),access=[];
 for(const code of CODES){
  const card=one(account.cards.filter(c=>c.code===code));assert.equal(card.totalCopies,1);assert.equal(card.canDeploy,true);assert(ranked.get(ID).some(c=>c.code===code));assert(growth.cards.some(c=>c.code===code));
  const state=await readMercenaryLevelState(env,ID,code);assert.equal(state.level,21);assert.equal(state.breakthroughMask,15);assert.equal(one(summary.rows.filter(c=>c.code===code)).level,21);
  const battle={};for(const mode of ['PVE','PVP']){const selected=one(await selectedMercenaryBattleSnapshots(env,user,[code],mode));assert.equal(selected.code,code);assert.equal(selected.level,21);battle[mode]={selectable:true,level:selected.level};}
  access.push({code,name:card.name,totalCopies:1,level:21,canDeploy:true,rankedVisible:true,growthVisible:true,battle});
 }
 const replay=await grant({query:(s,a)=>{assert.match(s,/^SELECT\b/);return db.query(s,a);}});assert(replay.replayed);assert.deepEqual(replay.receipt,r);
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);
 const result={status:'VERIFIED',operationKey:OP,identity,completedAt:r.completedAt,auditId:r.auditId,access,totalGranted:3,acquisitionRecords:3,auditRecords:1,actualAccountAndGrowthReads:true,actualPvePvpSelection:true,selectOnlyReplayVerified:true,productionWrites:0,operationLocksRemaining:0,readOnly:one(await q("SELECT current_setting('transaction_read_only') value")).value,selectQueries:reads,checkedAt:new Date().toISOString()};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./evidence/independent.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,5).join('\n'));process.exitCode=1;}finally{await db.end();}
