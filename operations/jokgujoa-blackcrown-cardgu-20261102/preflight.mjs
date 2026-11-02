import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
import {BLACKCROWN_PACK_KEY} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/shared/mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_LIMITED_CARDS} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/shared/mercenary-blackcrown-pool-v3.mjs';
const OP='ops:jokgujoa-blackcrown-cardgu:20261102:v1',NAME='족구조아',CODE='V-970',hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const users=await q('SELECT u.id::text,u.nickname,u.role,u.status,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.nickname=$1 OR u.id=525 ORDER BY u.id',[NAME]);
 assert.equal(users.length,1);const {provider,provider_user_id,...user}=users[0];assert.deepEqual([user.id,user.nickname,user.role,user.status],['525',NAME,'USER','ACTIVE']);assert(provider&&provider_user_id);user.identityHash=hash({provider,providerUserId:provider_user_id});
 const card=BLACKCROWN_LIMITED_CARDS.find(c=>c.code===CODE);assert(card);assert.deepEqual([card.name,card.rank,card.edition],['카드구','SSS','LIMITED']);
 const holding=await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id=525 AND mercenary_code=$1',[CODE]);
 const prior=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'ops:jokgujoa%cardgu%'",[OP]);
 const acquisitions=await q('SELECT acquisition_id,user_id::text,mercenary_code,total_copies_after,created_at FROM mercenary_card_acquisitions_v1 WHERE user_id=525 AND mercenary_code=$1 ORDER BY created_at DESC LIMIT 20',[CODE]);
 const stock=await q('SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE]),issues=await q('SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE]);assert.equal(stock.length,1);
 const settings=await q('SELECT key,value FROM app_meta WHERE key=$1',[BLACKCROWN_PACK_KEY]);assert.equal(settings.length,1);const pack=JSON.parse(settings[0].value);
 assert.equal(Number(stock[0].stock_limit),pack.settings.stockLimits[CODE]);assert.equal(issues.length,Number(stock[0].issued));issues.forEach((r,i)=>assert.equal(Number(r.serial),i+1));
 const plan={operationKey:OP,authorization:'블랙크라운에서 카드구 한도 한장 차감하고 족구조아 계정에 지급해',stockAuthorization:'블랙크라운 잔여 한도 1장 차감',stockPolicy:'CONSUME_ONE_EXISTING_BLACKCROWN_SLOT',stockLimit:Number(stock[0].stock_limit),cost:0,automaticLoadout:false,sendMessages:false,totalQuantity:1,recipientCount:1,recipients:[user],grants:[{userId:user.id,nickname:NAME,code:CODE,name:card.name,title:card.title,rank:card.rank,edition:card.edition,season:'BLACKCROWN',quantity:1}]};
 const report={checkedAt:new Date().toISOString(),user,card:{code:CODE,name:card.name,title:card.title,rank:card.rank,edition:card.edition,pack:'BLACKCROWN'},holding,prior,acquisitions,stock,issues,settings,productionWrites:0,planHash:hash(plan)};
 assert.deepEqual(await q('SELECT relname FROM pg_stat_xact_user_tables WHERE n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0'),[]);await db.query('ROLLBACK');
 await fs.writeFile(new URL('preflight.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({user,card:report.card,holding,prior,stock,issues:issues.map(i=>({serial:i.serial,userId:i.user_id,acquisitionId:i.acquisition_id})),packRevision:pack.revision,planHash:hash(plan)},null,2));
 assert.equal(prior.length,0,'Prior receipt must be verified, never grant twice');assert(Number(stock[0].stock_limit)-Number(stock[0].issued)>=1,'No remaining stock; cannot increase limit without authorization');
 await fs.writeFile(new URL('plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
