import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const listener=source.slice(source.indexOf("window.addEventListener('mercenary-pack:complete'"),source.indexOf('function mergeDrawUserSnapshot'));

function harness(){
 const handlers=new Map(),calls=[],nodes=new Map();let user={serverUserId:7,coin:10000000000,cardShards:3,masterStars:0,magicCrystals:0},request;
 const context={API_MODE:true,API_TOKEN:'test',PLAYER_STATE_MUTATION_EPOCH:0,API_INFLIGHT:new Map(),runtimeCommandContext:'buy',console,
  document:{querySelectorAll:selector=>{if(!nodes.has(selector))nodes.set(selector,[{textContent:''}]);return nodes.get(selector);}},
  loadUser:()=>user,clearApiCache:path=>calls.push(['cache',path]),
  apiRequest:async()=>{if(request)return request;return {user:{id:7,coin:5000000000,cardShards:3,masterStars:30,magicCrystals:0}};},
  mergeApiUserSummary:value=>({...user,...value,serverUserId:value.id}),
  saveUser:(value,detail)=>{user=value;calls.push(['save',detail]);},
  renderShell:tab=>calls.push(['route',tab]),
  addEventListener:(type,callback)=>handlers.set(type,callback)};
 context.window=context;vm.runInNewContext(listener,context);
 return {context,calls,nodes,get user(){return user;},setUser:value=>user=value,setRequest:value=>request=value,complete:()=>handlers.get('mercenary-pack:complete')({detail:{accountId:7,requestId:'completed-request'}})};
}

test('a completed Hyper pack updates the wallet without routing away from automatic opening',async()=>{
 const h=harness();await h.complete();
 assert.equal(h.user.coin,5000000000);assert.equal(h.user.masterStars,30);
 assert.equal(h.calls.filter(([kind])=>kind==='route').length,0,'wallet synchronization must not emit shop route cleanup');
 assert.equal(h.calls.filter(([kind])=>kind==='save').length,1);
 assert.equal(h.calls.find(([kind])=>kind==='save')[1].source,'draw');
});

test('late opening wallet responses never replace another account or navigate back to the shop',async()=>{
 const h=harness();let release;h.setRequest(new Promise(resolve=>release=resolve));const pending=h.complete();
 h.setUser({serverUserId:8,coin:123});h.context.runtimeCommandContext='inventory';release({user:{id:7,coin:5}});await pending;
 assert.equal(h.user.serverUserId,8);assert.equal(h.user.coin,123);assert.equal(h.calls.some(([kind])=>kind==='save'||kind==='route'),false);
});

test('a newer account mutation invalidates an older Hyper wallet response',async()=>{
 const h=harness();let release;h.setRequest(new Promise(resolve=>release=resolve));const pending=h.complete();
 h.context.PLAYER_STATE_MUTATION_EPOCH++;release({user:{id:7,coin:5}});await pending;
 assert.equal(h.user.coin,10000000000);assert.equal(h.calls.some(([kind])=>kind==='save'||kind==='route'),false);
});
