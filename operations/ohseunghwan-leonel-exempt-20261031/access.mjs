import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {OP,PLAN} from './grant.mjs';
import {mercenaryAccountState,rankedOwnedMercenaries,selectedMercenaryBattleSnapshots} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/functions/_mercenary_account.js';
import {handleMercenaryLevel} from 'file:///C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site/functions/_mercenary_level.js';
const ID=16,CODE='V-978',db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 let reads=0,queue=Promise.resolve();const query=(sql,args=[])=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i);reads++;const p=queue.then(async()=>(await db.query(sql,args)).rows);queue=p.catch(()=>{});return p;};
 const DB={dialect:'postgres',prepare(raw){let n=0;const sql=raw.replace(/\?/g,()=>'$'+(++n));const bound=args=>({bind(...values){return bound(values);},async first(){return (await query(sql,args))[0]??null;},async all(){return {results:await query(sql,args)};},async run(){throw Error('Writes forbidden in access verification');}});return bound([]);}};
 const identity=(await query('SELECT id::text,nickname,role,status FROM users WHERE id=$1',[ID]))[0];assert.equal(identity.nickname,'오승환이다');assert.equal(identity.status,'ACTIVE');const user={id:ID,role:identity.role},env={DB};
 const receipt=JSON.parse((await query('SELECT value FROM app_meta WHERE key=$1',[OP]))[0].value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.grants.length,1);assert.equal(receipt.grants[0].quantity,1);
 const state=await mercenaryAccountState(env,user),card=state.cards.find(c=>c.code===CODE);assert(card);assert.equal(card.name,'레오넬');assert.equal(card.totalCopies,receipt.grants[0].copiesAfter);assert.equal(card.canDeploy,true);
 const ranked=await rankedOwnedMercenaries(env,[ID]);assert(ranked.get(ID).some(c=>c.code===CODE));
 const growth=await handleMercenaryLevel({path:'mercenaries/v3/leveling/state',request:new Request('http://readonly.test/api/mercenaries/v3/leveling/state'),env,deps:{authenticate:async()=>user,json:body=>body}});assert(growth.cards.some(c=>c.code===CODE));
 const battle={};for(const mode of ['PVE','PVP']){const selected=await selectedMercenaryBattleSnapshots(env,user,[CODE],mode);assert.equal(selected[0].code,CODE);battle[mode]={selectable:true,level:selected[0].level};}
 const result={status:'VERIFIED',checkedAt:new Date().toISOString(),readOnly:(await query("SELECT current_setting('transaction_read_only') value"))[0].value,operationKey:OP,auditId:receipt.auditId,identity,card:{code:card.code,name:card.name,totalCopies:card.totalCopies,level:card.level,canDeploy:card.canDeploy},visibleInAccount:true,rankedVisible:true,growthVisible:true,battle,selectQueries:reads,operationalWrites:0,automaticLoadout:PLAN.automaticLoadout};
 await db.query('ROLLBACK');await fs.writeFile(new URL('./evidence/access.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));console.error(String(e.stack).split('\n').filter(s=>/at /.test(s)).slice(0,4).join('\n'));process.exitCode=1;}finally{await db.end().catch(()=>{});}
