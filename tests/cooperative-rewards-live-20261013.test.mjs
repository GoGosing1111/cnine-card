import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {cooperativeMiniflare} from './helpers/cooperative-miniflare.mjs';
import {coopSquads} from './helpers/cooperative-fixture.mjs';

test('live cooperative API + Durable Object automatically commits rewards and replays terminal state',async()=>{
 const h=await cooperativeMiniflare(),sockets=[],messages=[[],[],[]];let timer;
 const clients=[1,2,3].map(i=>'reward-live-client-'+i);let roomId;
 const command=(id,kind,extra={})=>h.request(id,kind,{clientId:clients[id-1],roomId,requestId:crypto.randomUUID(),...extra});
 const wait=async fn=>{const end=Date.now()+35000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('Cooperative rewards live timeout '+JSON.stringify(messages.map(m=>m.at(-1)?.state?.status)));};
 try{
  const cfg=(await h.request(1,'settings')).settings;cfg.mode='ON';cfg.rewards.enabled=true;
  Object.assign(cfg.rewards.difficulties[0],{coin:456,masterStars:12,items:[{code:'EMPEROR_ENERGY',quantity:2},{code:'PET_ESSENCE',quantity:3}]});
  for(const m of cfg.combat.difficulties[0].monsters)Object.assign(m,{power:1000,hpPercent:100,shieldPercent:0});
  assert.equal((await h.request(2,'settings',{settings:cfg})).status,403);
  const unknown=structuredClone(cfg);unknown.rewards.difficulties[0].items[0].code='NO_SUCH_ITEM';assert.equal((await h.request(1,'settings',{settings:unknown})).status,400);
  assert.equal((await h.request(1,'settings',{settings:cfg})).status,200);
  const cat=await fetch(h.origin+'/api/admin/coop/reward-catalog',{headers:{authorization:'Bearer local-qa-1'}});assert.equal(cat.status,200);assert.equal((await cat.json()).items.length,2);
  const noOwner=await fetch(h.origin+'/api/admin/coop/reward-catalog',{headers:{authorization:'Bearer local-qa-2'}});assert.equal(noOwner.status,403);
  await h.db.batch([{sql:"UPDATE app_meta SET value=json_set(value,'$.encounterVersion',3) WHERE key='cooperative_battleground_settings_v1'"}]);
  const created=await command(1,'create',{difficulty:'NORMAL'});assert.equal(created.status,200);roomId=created.roomId;
  for(const id of [2,3])assert.equal((await command(id,'join')).status,200);
  const squads=coopSquads();
  for(const id of [1,2,3]){
   const ticket=await command(id,'ticket');
   const ws=new WebSocket(h.origin.replace('http:','ws:')+'/api/coop/stream?room='+roomId+'&ticket='+ticket.ticket,{origin:h.origin});sockets.push(ws);
   ws.on('message',raw=>{const v=JSON.parse(raw);messages[id-1].push(v);if(v.state?.status==='LOADING')ws.send(JSON.stringify({type:'loaded'}));});
   await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
   const s=squads[id-1];assert.equal((await command(id,'ready',{cardIds:s.cards.map(c=>c.id),mercenaryCode:s.mercenary.code})).status,200);
  }
  timer=setInterval(()=>sockets.forEach(ws=>ws.readyState===1&&ws.send(JSON.stringify({type:'ping'}))),2000);
  await wait(()=>messages.every(list=>list.some(v=>v.state?.clearReward?.granted)));
  const end=await h.request(1,'current');assert.equal(end.state.status,'VICTORY');assert.equal(end.state.clearReward.coin,456);assert.equal(end.state.clearReward.items.length,2);assert.equal(end.state.clearReward.energy.current,2);
  assert.equal((await h.request(1,'current')).state.clearReward.energy.current,2);
  assert.equal((await h.request(1,'feature')).energy.current,2);
  const balances=await h.db.batch([{sql:'SELECT coin FROM users WHERE id=1'},{sql:"SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code='EMPEROR_ENERGY'"}]);
  assert.equal(balances[0].results[0].coin,12345678+456);assert.equal(balances[1].results[0].quantity,2);
  assert.equal((await command(1,'leave')).status,200);assert.equal((await h.request(1,'current')).state,null);
 }finally{clearInterval(timer);for(const ws of sockets)ws.terminate();await h.dispose();}
});
