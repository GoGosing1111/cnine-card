import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as access from '../functions/_burning_event_access.js';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const start=source.indexOf("    if(path==='admin/burning-event'||path==='admin/hyper-burning-event'){");
const end=source.indexOf("    if(path==='admin/card-packs'){",start);
assert.ok(start>=0&&end>start,'actual burning route must be found');
const route=source.slice(start,end);
const paths=['admin/burning-event','admin/hyper-burning-event'];

function harness(identity){
  const calls={authenticate:0,read:0,body:0,batch:0,log:[]};
  const settings=new Map(['BURNING','HYPER'].map(mode=>[mode,{mode,enabled:false,durationMinutes:60,title:mode,generation:0}]));
  const env={DB:{
    prepare:()=>({bind:(key,value)=>({key,value})}),
    batch:async statements=>{calls.batch++;for(const statement of statements)settings.set(statement.key,JSON.parse(statement.value));}
  }};
  const context={...access,env,
    BURNING_EVENT_META_KEY:'BURNING',HYPER_BURNING_EVENT_META_KEY:'HYPER',burningEventCache:null,
    authenticate:async()=>{calls.authenticate++;return identity;},
    json:(body,status=200)=>({body,status}),
    readBody:async request=>{calls.body++;return request.json();},
    burningEventPair:async()=>{calls.read++;return {normal:settings.get('BURNING'),hyper:settings.get('HYPER'),active:{enabled:false,mode:'NONE'}};},
    burningPublicState:settings=>settings,
    cleanBurningEventSettings:(settings,mode)=>({...settings,mode}),
    invalidateEquipmentPromotionCache:()=>{},
    writeAdminLog:async(_env,actor,event)=>{calls.log.push({actor,event});}
  };
  const execute=vm.runInNewContext(`(async(path,request)=>{${route}})`,context);
  return {calls,settings,request:(path,method)=>execute(path,{method,json:async()=>({settings:{enabled:false,durationMinutes:60,title:'권한 회귀검사'}})})};
}

test('all authenticated OWNER identities can read and save both burning modes',async()=>{
  for(const nickname of ['핑크빛유두','다른 OWNER','변경한 닉네임','',undefined]){
    for(const path of paths){
      const identity={id:17,role:'OWNER',nickname},h=harness(identity);
      const read=await h.request(path,'GET');
      assert.equal(read.status,200,`${nickname}: ${path} GET`);
      assert.equal(h.calls.batch,0);
      const saved=await h.request(path,'PATCH');
      assert.equal(saved.status,200,`${nickname}: ${path} PATCH`);
      assert.equal(saved.body.ok,true);
      assert.equal(saved.body.settings.title,'권한 회귀검사');
      assert.equal(h.calls.batch,1,'one existing settings transaction');
      assert.equal(h.calls.read,3,'one GET read and two existing save reads');
      assert.equal(h.calls.log.length,1);
      assert.equal(h.calls.log[0].actor,identity,'audit keeps actual OWNER identity');
      assert.equal(h.calls.log[0].event,path.includes('hyper')?'HYPER_BURNING_EVENT_UPDATE':'BURNING_EVENT_UPDATE');
    }
  }
});

test('non-OWNER roles cannot read or save even with the formerly privileged nickname',async()=>{
  for(const role of ['ADMIN','USER','EVENT_MANAGER','CHIEF','SUPER_OWNER','OWNER_ADMIN','']){
    for(const path of paths)for(const method of ['GET','PATCH']){
      const h=harness({id:18,role,nickname:'핑크빛유두'});
      const response=await h.request(path,method);
      assert.equal(response.status,403,`${role}: ${path} ${method}`);
      assert.equal(response.body.code,'BURNING_OPERATOR_ONLY');
      assert.equal(h.calls.read+h.calls.body+h.calls.batch+h.calls.log.length,0,'deny before event data access');
    }
  }
});

test('unauthenticated requests stop before event data access',async()=>{
  for(const path of paths)for(const method of ['GET','PATCH']){
    const h=harness(null),response=await h.request(path,method);
    assert.equal(response.status,401);
    assert.equal(h.calls.read+h.calls.body+h.calls.batch+h.calls.log.length,0);
  }
});

test('CMS loads refreshed access script and badge with no nickname restriction',()=>{
  const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
  const html=read('admin/index.html'),client=read('admin/burning-admin.js'),css=read('admin/hyper-burning-admin.css');
  assert.ok(html.includes('burning-admin.js?v=20260927-all-owners'));
  assert.ok(html.includes('hyper-burning-admin.css?v=20260927-all-owners'));
  assert.match(client,/const allowed=role==='OWNER';/);
  assert.doesNotMatch(client+css,/핑크빛유두|OPERATOR_NICKNAME/);
  assert.ok(css.includes('content:"OWNER 전용"'));
});
