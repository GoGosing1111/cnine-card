import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,safe,OP,AUTHORIZATION,CMS_HASH,hash,policy,targets,cms,query} from './cms.mjs';
let db;try{
 db=connect();await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const identity=(await query(db,'SELECT current_database() AS database,current_user AS actor,pg_is_in_recovery() AS replica,CURRENT_TIMESTAMP AS now'))[0];
 assert.equal(identity.database,'cnine');assert.equal(identity.actor,'cnine_migrator');assert.equal(identity.replica,false);
 assert.equal((await query(db,'SELECT key FROM app_meta WHERE key=$1',[OP])).length,0,'Already completed: inspect receipt');
 const cards=await targets(db),settings=await policy(db),pending=(await query(db,"SELECT * FROM card_retirement_batches WHERE status='PENDING' ORDER BY id"));
 assert.equal(cards.filter(c=>c.name==='혜루찡').length,14);assert.equal(cards.filter(c=>c.name!=='혜루찡').length,0);assert.equal(pending.length,0);
 const preview=cms(db,{readOnly:true}),summaries=[];
 for(const card of cards)summaries.push((await preview(card.id,'PREVIEW')).summary);
 const ids=cards.map(c=>c.id);
 const holders=await query(db,'SELECT user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE card_id=ANY($1::text[]) ORDER BY card_id,user_id',[ids]);
 const triggers=await query(db,"SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname IN ('users','cards','cnine_user_inventory') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname");
 const totals={cards:cards.length,previouslyPending:pending.length,owners:new Set(holders.filter(x=>x.quantity>0).map(x=>x.user_id)).size,refundShards:summaries.reduce((s,x)=>s+x.totalRefundShards,0),tickets:summaries.reduce((s,x)=>s+x.rerollTicketUsers,0)};
 const report={operationKey:OP,authorization:AUTHORIZATION,cmsHash:CMS_HASH,identity,cards,policyHash:hash(settings),settings,pending,summaries,holders,triggers,totals};
 await db.query('ROLLBACK');fs.writeFileSync(new URL('./before.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({identity,cmsHash:CMS_HASH,totals,summaries,triggers}));
}catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1}finally{await db?.end()}
