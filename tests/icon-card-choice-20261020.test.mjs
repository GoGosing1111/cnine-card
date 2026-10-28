import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {passFixture} from './helpers/supporter-pass-fixture.mjs';
import {ICON_CHOICE_ITEM as ITEM,ICON_CHOICE_CARDS as CARDS} from '../shared/icon-card-choice-v1.mjs';
import {iconChoiceOptions,useIconChoice,iconChoiceReceipt,handleIconCardChoice} from '../functions/_icon_card_choice.js';
import {ensureJointTransactionSchema} from '../functions/_joint_transactions.js';

const body=()=>({requestId:crypto.randomUUID(),targetCode:CARDS[0].code,version:1});
async function fixture(t,postgres){
 const f=await iconFusionFixture(t,{postgres});
 await f.p('INSERT INTO inventory_items(code,name,rarity,image_url,is_active) VALUES(?,?,?,?,1)',ITEM.code,ITEM.name,ITEM.rarity,ITEM.image).run();
 await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,2,2)',ITEM.code).run();
 return {...f,tickets:async()=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',ITEM.code).first()).quantity)};
}
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: ICON choice is atomic, restricted and recoverable`,async t=>{
 const f=await fixture(t,postgres),before=await f.snapshot();
 const initial=await iconChoiceOptions(f.env,f.user);assert.equal(initial.choices.length,8);assert.equal(initial.quantity,2);
 assert(!initial.choices.some(c=>c.code==='ICON-ZEUS-CHEOLGU'||c.code==='ICON-NAMUNEUL-BONGSOON-20261016'));
 for(const targetCode of ['ICON-ZEUS-CHEOLGU','ICON-NAMUNEUL-BONGSOON-20261016','CN-SUPER','ICON-NAMSUDAENG'])await assert.rejects(()=>useIconChoice(f.env,f.user,{...body(),targetCode}),{code:'ICON_CHOICE_TARGET'});
 await assert.rejects(()=>useIconChoice(f.env,f.user,{...body(),version:0}),{code:'ICON_CHOICE_VERSION'});
 assert.equal(await f.tickets(),2);assert.deepEqual(await f.snapshot(),before);
 await f.p('UPDATE cards SET is_active=0 WHERE id=?',CARDS[0].cardId).run();assert.equal((await iconChoiceOptions(f.env,f.user)).choices.length,7);
 await assert.rejects(()=>useIconChoice(f.env,f.user,body()),{code:'ICON_CHOICE_UNAVAILABLE'});await f.p('UPDATE cards SET is_active=1 WHERE id=?',CARDS[0].cardId).run();
 const request=body();f.fail('INSERT INTO user_cards');await assert.rejects(()=>useIconChoice(f.env,f.user,request));f.fail('');
 assert.equal(await f.tickets(),2);assert.deepEqual(await f.snapshot(),before);assert.equal((await iconChoiceReceipt(f.env,f.user,request.requestId)).status,'PENDING');
 await assert.rejects(()=>useIconChoice(f.env,f.user,body()),{code:'ICON_CHOICE_PENDING'});
 await f.p('UPDATE inventory_items SET is_active=0 WHERE code=?',ITEM.code).run();await assert.rejects(()=>useIconChoice(f.env,f.user,request));assert.equal(await f.tickets(),2);
 await f.p('UPDATE inventory_items SET is_active=1 WHERE code=?',ITEM.code).run();
 const first=await useIconChoice(f.env,f.user,request);assert.equal(first.reward.cardId,CARDS[0].cardId);assert.equal(first.reward.quantity,1);assert.equal(await f.tickets(),1);
 assert.equal((await useIconChoice(f.env,f.user,request)).replayed,true);assert.equal((await iconChoiceReceipt(f.env,f.user,request.requestId)).reward.ownedAfter,1);assert.equal(await f.tickets(),1);
 await assert.rejects(()=>useIconChoice(f.env,f.user,{...request,targetCode:CARDS[1].code}),{code:'JOINT_REQUEST_CONFLICT'});
 await assert.rejects(()=>iconChoiceReceipt(f.env,{id:8},request.requestId),{code:'JOINT_NOT_FOUND'});
 const after=await f.snapshot();assert.equal(after.coin,before.coin);assert.equal(after.stars,before.stars);assert.deepEqual(after.cards.filter(c=>!c.card_id.startsWith('CN-1C')),before.cards);
 await f.p('UPDATE user_cards SET breakthrough_level=4,breakthrough_fail_count=2 WHERE user_id=7 AND card_id=?',CARDS[0].cardId).run();
 const two=await useIconChoice(f.env,f.user,body());assert.equal(two.reward.ownedAfter,2);const card=await f.p('SELECT * FROM user_cards WHERE user_id=7 AND card_id=?',CARDS[0].cardId).first();assert.equal(Number(card.breakthrough_level),4);assert.equal(Number(card.breakthrough_fail_count),2);assert.equal(await f.tickets(),0);
 await assert.rejects(()=>useIconChoice(f.env,f.user,body()),{code:'ICON_CHOICE_BALANCE'});
 assert.equal(Number((await f.p('SELECT count(*) n FROM inventory_logs WHERE item_code=?',ITEM.code).first()).n),2);
});

test('authenticated routes reject cross-origin requests and serialize concurrent uses',async t=>{
 const f=await fixture(t,false),request=body();
 const call=async(path='use',data=request,token='local-account-7',origin='https://choice.test')=>{
  const method=path==='options'?'GET':'POST';const r=await handleIconCardChoice({path:'icons/choice/'+path,request:new Request('https://choice.test/api/icons/choice/'+path,{method,headers:{authorization:'Bearer '+token,origin,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(data)}:{})}),env:f.env,deps:f.deps});return {status:r.status,data:await r.json()};
 };
 assert.equal((await call('options',null,'')).status,401);assert.equal((await call('use',request,'local-account-7','https://evil.test')).status,403);
 assert.equal((await call('use',{...request,userId:8})).status,400);
 const results=await Promise.all([call(),call()]);assert(results.every(r=>r.status===200));assert.equal(await f.tickets(),1);assert.equal(results.filter(r=>r.data.replayed).length,1);
 // Revocation immediately before the atomic write cannot consume a voucher.
 const batch=f.DB.batch.bind(f.DB);f.DB.batch=async statements=>{await f.p('UPDATE members SET is_active=0 WHERE id=1').run();return batch(statements);};
 const blocked=await call('use',body());assert.equal(blocked.status,503);assert.equal(await f.tickets(),1);f.DB.batch=batch;
});

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: season pass catalog → save → claim → choose exactly one ICON`,async t=>{
 const f=await passFixture({postgres});t.after(()=>f.close());
 await f.run('INSERT INTO inventory_items VALUES(?,?,?,?,1)',ITEM.code,ITEM.name,ITEM.rarity,ITEM.image);
 await f.exec('ALTER TABLE user_cards ADD COLUMN breakthrough_level INTEGER DEFAULT 0; ALTER TABLE user_cards ADD COLUMN first_obtained_at TEXT;');
 await ensureJointTransactionSchema(f.env);
 for(const card of CARDS)await f.run("INSERT INTO cards_effective_v1210 VALUES(?,?,'ICON',?,1,1,'PUBLIC')",card.cardId,card.name,card.sourceArt);
 const catalog=(await f.call('admin/server-support/pass')).body.catalog,found=catalog.find(x=>x.ref===ITEM.code);
 assert.equal(found.available,true);assert.equal(found.image,'/'+ITEM.image);assert.equal(found.name,ITEM.name);
 const doc=f.document([{code:found.code,quantity:1}]);assert.equal((await f.save(doc)).status,200);assert.equal((await f.grant()).status,200);
 const pass=await f.pass(),claim={cycle:pass.cycle,day:pass.currentDay,expectedRevision:pass.revision};assert.equal((await f.claim(claim)).status,200);assert.equal((await f.claim(claim)).body.replayed,true);
 assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',ITEM.code)).quantity),1);
 const got=await useIconChoice(f.env,{id:2},body());assert.equal(got.reward.cardId,CARDS[0].cardId);
 assert.equal(Number((await f.one('SELECT quantity FROM user_cards WHERE user_id=2 AND card_id=?',CARDS[0].cardId)).quantity),1);
 assert.equal(Number((await f.one('SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code=?',ITEM.code)).quantity),0);
 await f.run('UPDATE inventory_items SET is_active=0 WHERE code=?',ITEM.code);assert.equal((await f.save(doc)).status,400);
});

test('inventory entry and current asset references ship with the chooser',()=>{
 assert.match(readFileSync('js/app.js','utf8'),/if\(itemCode==='ICON_CARD_CHOICE_TICKET'\)/);
 assert.match(readFileSync('index.html','utf8'),/src="js\/app\.js\?[^"\s]+"/);
 assert.match(readFileSync('js/app.js','utf8'),/assets\/items\/icon-card-choice-20261020\/ticket\.webp/);
 for(const name of ['ticket','panel'])assert(readFileSync(`assets/items/icon-card-choice-20261020/${name}.webp`).length>1000);
});
