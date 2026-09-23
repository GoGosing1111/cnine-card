import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fixture} from './fixtures/chuseok-v1.mjs';
import {CHUSEOK_KEY,CHUSEOK_COIN,CHUSEOK_EVENTS,cleanChuseokSettings,chuseokComplete,chuseokPhase,pickChuseokReward} from '../js/chuseok-model-v1.js';
import {chuseokAdmin,handleChuseok} from '../functions/_chuseok.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const reward=(kind,ref='',amount=1,rate=100,id='gift')=>({id,kind,ref,amount,rate});
const complete=(extra={})=>({enabled:true,startsAt:'2026-09-01T00:00:00+09:00',endsAt:'2027-01-01T00:00:00+09:00',coinCost:2,dailyLimit:0,rewards:[reward('COIN','',50000000000)],...extra});
const policy=(extra={})=>({visible:true,events:{songpyeon:complete(extra)}});
test('both events ship OFF with blank economics, zero inferred rewards and no coin auto-issuance',()=>{
 const s=cleanChuseokSettings();assert(s.visible);
 for(const e of Object.values(s.events)){assert.equal(e.enabled,false);assert.equal(e.coinCost,null);assert.equal(e.dailyLimit,null);assert.equal(e.startsAt,null);assert.equal(e.endsAt,null);assert.deepEqual(e.rewards,[]);assert(!chuseokComplete(e));assert.equal(chuseokPhase(e),'UNCONFIGURED');}
 assert(!read('functions/_chuseok.js').includes('PINGDU_OLD_AXE'));
});
test('strict dates, quantities, percentages and explicit prize selections; cannot enable incomplete policy',()=>{
 for(const extra of [{coinCost:0},{coinCost:'2'},{dailyLimit:-1},{startsAt:'2026-02-30T00:00:00Z'},{endsAt:'2020-01-01T00:00:00Z'},{rewards:[]},{rewards:[reward('ITEM')]},{rewards:[reward('ITEM','PINGDU_OLD_AXE')]},{rewards:[reward('ITEM',CHUSEOK_COIN)]},{rewards:[reward('MISS')]},{rewards:[reward('COIN','',1,99)]},{rewards:[reward('COIN','',1,99.99999)]},{rewards:[reward('EQUIPMENT','BATTLE_SUIT_02',2)]},{rewards:[reward('COIN'),reward('COIN')]},{rewards:[reward('BOGUS')]}])assert.throws(()=>cleanChuseokSettings(policy(extra)));
 assert.throws(()=>cleanChuseokSettings({...policy(),visible:false}));
 const s=cleanChuseokSettings(policy()).events.songpyeon;assert(chuseokComplete(s));assert.equal(chuseokPhase(s,false),'HIDDEN');assert.equal(chuseokPhase({...s,enabled:false}),'PAUSED');assert.equal(chuseokPhase(s,true,Date.parse(s.startsAt)-1),'SCHEDULED');assert.equal(chuseokPhase(s,true,Date.parse(s.startsAt)),'OPEN');assert.equal(chuseokPhase(s,true,Date.parse(s.endsAt)),'ENDED');
});
test('four-decimal probability boundaries are exact, selection index cannot alter the distribution',()=>{
 const s=complete({rewards:[reward('COIN','',100,0.0001,'a'),reward('MISS','',null,99.9999,'miss')]});assert.equal(pickChuseokReward(s,0).id,'a');assert.equal(pickChuseokReward(s,1).id,'miss');assert.equal(pickChuseokReward(s,999999).id,'miss');for(const x of [-1,1000000,0.5,NaN])assert.throws(()=>pickChuseokReward(s,x));
});
test('OFF state cannot debit, settings audit is versioned, stale tabs cannot overwrite it',async()=>{
 const f=await fixture();try{await assert.rejects(f.draw(await f.body()),e=>e.code==='EVENT_CLOSED');assert.equal((await f.state()).chuseokCoins,20);
 const a=await f.configure();await assert.rejects(chuseokAdmin(f.env,{id:99},{...a.settings,revision:null}),e=>e.code==='REVISION_CONFLICT');assert.equal((await f.state()).revision,a.revision);
 assert.equal(Number((await f.row("SELECT COUNT(*) n FROM admin_logs WHERE action_type='CHUSEOK_UPDATE'")).n),1);
 }finally{await f.close();}
});
test('both event modes award coins exactly once; saved receipt survives OFF and negative account balance',async()=>{
 const f=await fixture();try{for(const event of Object.keys(CHUSEOK_EVENTS)){await f.configure(undefined,event);const b=await f.body(event,2,2),r=await f.draw(b,2);assert.equal(r.choice,2);assert.equal(r.coinCost,2);assert.equal(r.reward.amount,50000000000);const c=await chuseokAdmin(f.env,{id:99});await chuseokAdmin(f.env,{id:99},{...c.settings,revision:c.revision,events:{...c.settings.events,[event]:{...c.settings.events[event],enabled:false}}});assert((await f.draw(b,2)).replayed);}
 assert.equal((await f.state(2)).coin,'97000000000');assert.equal((await f.state(2)).chuseokCoins,16);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM coin_logs')).n),2);
 }finally{await f.close();}
});
test('catalog items, equipment and mercenaries receive the configured award with canonical duplicates',async()=>{
 const f=await fixture();try{const rewards=[reward('ITEM','UNIQUE_ADVANCEMENT_PASS',3),reward('EQUIPMENT','BATTLE_SUIT_02'),reward('MERCENARY',f.doc.mercenaries[0].code)];
 for(const r of rewards){await f.configure([r]);for(let i=0;i<2;i++){const b=await f.body(),result=await f.draw(b);assert.equal(result.reward.ref,r.ref);assert((await f.draw(b)).replayed);}}
 assert.equal(Number((await f.row("SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='UNIQUE_ADVANCEMENT_PASS'")).quantity),6);
 assert.equal(Number((await f.row('SELECT COUNT(*) n FROM user_equipment_instances')).n),2);assert.equal(Number((await f.row('SELECT total_copies FROM user_mercenary_cards_v1')).total_copies),2);assert.equal(Number((await f.row('SELECT duplicate_count FROM user_mercenary_cards_v1')).duplicate_count),1);
 }finally{await f.close();}
});
test('MISS is explicit; daily caps serialize simultaneous requests, are event-specific and reset at KST midnight',async()=>{
 const f=await fixture();try{const r=[reward('COIN','',1,1,'coin'),reward('MISS','',null,99,'miss')];await f.configure(r,'songpyeon',{dailyLimit:1});await f.configure(r,'envelope',{dailyLimit:1});
 const outcomes=await Promise.allSettled([f.draw(await f.body(),1,999999),f.draw(await f.body(),1,999999)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='fulfilled').value.reward,null);
 await f.draw(await f.body('envelope'),1,999999);assert.equal((await f.state()).chuseokCoins,16);assert.equal((await f.state()).events.songpyeon.dailyUsed,1);
 await f.pg.query("UPDATE chuseok_receipts_v1 SET created_at=date_trunc('day',CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' - INTERVAL '1 second'");assert.equal((await f.state()).events.songpyeon.dailyUsed,0);
 }finally{await f.close();}
});
test('invalid choice, stale catalog, retired item, insufficient coins and suspended account never spend',async()=>{
 const f=await fixture();try{await f.configure();for(const extra of [{event:'axe'},{choice:-1},{choice:3},{choice:1.2},{choice:'1'},{requestId:'bad'}])await assert.rejects(f.draw({...await f.body(),...extra}));
 await f.configure([reward('EQUIPMENT','BATTLE_SUIT_02')]);const stale=await f.body();await f.pg.exec("UPDATE character_equipment_items SET is_public=0 WHERE code='BATTLE_SUIT_02'");await assert.rejects(f.draw(stale),e=>e.code==='REWARD_UNAVAILABLE');assert.equal((await f.state()).chuseokCoins,20);
 await f.configure();const b=await f.body();await f.configure([reward('COIN','',1)]);await assert.rejects(f.draw(b),e=>e.code==='SETTINGS_CHANGED');
 await f.pg.query('UPDATE cnine_user_inventory SET quantity=0 WHERE user_id=1 AND item_code=$1',[CHUSEOK_COIN]);await assert.rejects(f.draw(await f.body()),e=>e.code==='INSUFFICIENT_COINS');await f.pg.exec("UPDATE users SET banned_until='2999-01-01 00:00:00' WHERE id=2");await assert.rejects(f.draw(await f.body('songpyeon',0,2),2),e=>e.code==='USER_INACTIVE');
 }finally{await f.close();}
});
test('request IDs cannot cross users, events or choices; concurrent retry pays only once',async()=>{
 const f=await fixture();try{await f.configure();const b=await f.body();const results=await Promise.all([f.draw(b),f.draw(b)]);assert.equal(results.filter(r=>r.replayed).length,1);for(const [body,id] of [[b,2],[{...b,choice:1},1],[{...b,event:'envelope'},1]])await assert.rejects(f.draw(body,id),e=>e.code==='REQUEST_CONFLICT');assert.equal((await f.state()).chuseokCoins,18);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM chuseok_receipts_v1')).n),1);
 }finally{await f.close();}
});
test('write failures, zero-row grants and expiry roll back reward, debit, logs and receipt together',async()=>{
 const f=await fixture();try{await f.configure();
 for(const sql of ['INSERT INTO coin_logs','UPDATE cnine_user_inventory','INSERT INTO inventory_logs','INSERT INTO chuseok_receipts_v1']){const b=await f.body();f.fault(sql);await assert.rejects(f.draw(b));f.fault(null);assert.equal((await f.state()).coin,'0');assert.equal((await f.state()).chuseokCoins,20);}
 await f.configure([reward('EQUIPMENT','BATTLE_SUIT_02')]);const b=await f.body();f.zero('INSERT INTO user_equipment_instances');await assert.rejects(f.draw(b),e=>e.code==='GRANT_FAILED');f.zero(null);assert.equal((await f.state()).chuseokCoins,20);
 await f.configure();const expiry=await f.body();f.expire();await assert.rejects(f.draw(expiry),e=>e.code==='EVENT_CLOSED');assert.equal((await f.state()).coin,'0');assert.equal((await f.state()).chuseokCoins,20);assert.equal(Number((await f.row('SELECT COUNT(*) n FROM chuseok_receipts_v1')).n),0);
 }finally{await f.close();}
});
test('route auth, permission and same-origin checks; receipt lookup is owner-scoped',async()=>{
 const deps={json:(v,s=200)=>Response.json(v,{status:s}),readBody:r=>r.json(),authenticate:async()=>null,requirePermission:async()=>null};
 for(const path of ['events/chuseok/draw','admin/chuseok']){const r=await handleChuseok({path,request:new Request('https://game.test/api/'+path),env:{},deps});assert.equal(r.status,path.startsWith('admin')?403:401);}
 const r=await handleChuseok({path:'events/chuseok/draw',request:new Request('https://game.test/api/events/chuseok/draw',{method:'POST',headers:{origin:'https://evil.test'}}),env:{},deps:{...deps,authenticate:async()=>({id:1})}});assert.equal(r.status,403);
 const f=await fixture();try{await f.configure();const b=await f.body();await f.draw(b);for(const id of [1,2]){const r=await handleChuseok({path:'events/chuseok/receipt',request:new Request('https://game.test/api/events/chuseok/receipt?requestId='+b.requestId),env:f.env,deps:{...deps,authenticate:async()=>({id})}});assert.equal((await r.json()).found,id===1);}}finally{await f.close();}
});
test('shared game UI, dedicated art and real Pixi/GSAP timeline; preview never calls draw',()=>{
 const page=read('events/chuseok/index.html');for(const text of ['chuseok-fx-v1.bundle.js','ui-fx-vendor','adventure-navigation-standalone','adventure-lobby-v2107','Noto+Sans+KR'])assert(page.includes(text));
 for(const art of ['moonlit-hanok.png','songpyeon-atlas.png','envelopes-atlas.png','knead-atlas.png','chuseok-coin.svg'])assert(existsSync(new URL('../assets/ui/events/chuseok-v1/'+art,import.meta.url)));
 const fx=read('js/chuseok-fx-v1.src.js');for(const text of ["from 'pixi.js'","from 'gsap'",'length:8','visibilitychange','finish()','texture:false'])assert(fx.includes(text));
 const client=read('js/chuseok-page-v1.js');for(const text of ['if(demo)result=','else{remember(body);result=await api','localStorage.setItem','clearTimeout(safety)','prefers'])if(text!=='prefers')assert(client.includes(text));
 for(const page of ['index.html','equipment-forge/index.html','mercenary-codex/index.html','loot-shop/index.html']){const url=read(page).match(/src="([^"]*adventure-lobby-v2107\.js[^"]*)"/)?.[1];assert(url?.includes('chuseok=20260923'),page+' must refresh the replaced menu bundle');}
 assert(read('admin/index.html').includes('chuseok-v1.js'));assert(!read('admin/index.html').includes('golden-axe-v1.js'));assert(read('functions/api/[[path]].js').includes('handleChuseok('));
});
