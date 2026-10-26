import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHmac} from 'node:crypto';
import {createPlaydkIdentityClient} from '../functions/_playdk_client.js';

test('fresh token accepts the optional SOOP ID and preserves timestamp HMAC and existing identity',async()=>{
  const original=globalThis.fetch;let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({uuid:'test-uuid',name:'검수',soopUserId:'viewer_test'});};
  try{
    const client=createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'qa-key',secretKey:'qa-secret'});
    assert.deepEqual(await client.getUserInfo('single-use-qa-token'),{uuid:'test-uuid',name:'검수',soopUserId:'viewer_test'});
    assert.equal(request.url.pathname,'/api/v2/ext/game/user');assert.equal(request.url.searchParams.get('token'),'single-use-qa-token');
    const [,signature,timestamp]=request.options.headers.Authorization.match(/signature=(.*), timestamp=(\d+)/);
    assert.equal(signature,createHmac('sha256','qa-secret').update(timestamp).digest('base64'));
    assert.equal(request.options.cache,'no-store');
  }finally{globalThis.fetch=original;}
});

test('absent, null or invalid optional SOOP IDs never fabricate provision or break existing login',async()=>{
  const original=globalThis.fetch;
  try{
    for(const soopUserId of [undefined,null,'','   ','a b',123,{},'a'.repeat(129)]){
      globalThis.fetch=async()=>Response.json({uuid:'qa',name:'기존 계정',soopUserId});
      assert.deepEqual(await createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'qa',secretKey:'qa'}).getUserInfo('token'),{uuid:'qa',name:'기존 계정'});
    }
  }finally{globalThis.fetch=original;}
});

test('a spent token keeps its 404 error and is not retried',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({error:'expired'},{status:404});};
  try{
    await assert.rejects(createPlaydkIdentityClient({baseUrl:'https://www.playdk.kr',accessKey:'qa',secretKey:'qa'}).getUserInfo('token'),e=>e.status===404);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const route=api.slice(api.indexOf("    if(path==='secondary-verification/playdk'"),api.indexOf("    if(path==='wago-verification/status'"));
async function exchange({existing={provider:'PLAYDK',provider_user_id:'qa-uuid',verified_at:'today'},identity={uuid:'qa-uuid',name:'검수'},body={token:'fresh-token',soopUserId:'client-forgery',consent:true},linked=null}={}){
  const writes=[];let gifts=0;
  const context={path:'secondary-verification/playdk',request:{method:'POST'},env:{DB:{prepare(sql){return {bind(...values){return {run:async()=>{writes.push({sql,values});},first:async()=>sql.includes('provider_user_id=?')?linked:null};}}}}},
    authenticate:async()=>({id:7}),ensureSecondVerificationFoundation:async()=>{},playdkConfigured:()=>true,
    secondVerificationForUser:async()=>existing,secondaryProviderConflict:()=>({status:409}),readBody:async()=>body,
    playdkIdentityClient:()=>({getUserInfo:async()=>identity}),json:(data,status=200)=>({data,status}),
    ensureVerifiedRewardMessageV1276:async()=>{},completePlaydkVerificationWithGift:async()=>{gifts++;return {newlyVerified:true,giftMessage:{sent:false}};},isSecondaryProviderConflict:()=>false};
  const result=await runInNewContext('(async()=>{'+route+'})()',context);
  return {result,writes,gifts};
}
test('linked user confirmation comes from upstream only, never browser consent or ID claims',async()=>{
  const missing=await exchange();assert.equal(missing.result.data.soopWatch.identityAvailable,false);assert.equal(missing.gifts,0);
  const allowed=await exchange({identity:{uuid:'qa-uuid',name:'검수',soopUserId:'viewer'}});
  assert.equal(allowed.result.data.soopWatch.identityAvailable,true);assert.equal(allowed.gifts,0);
  assert.equal(Object.hasOwn(allowed.result.data,'soopUserId'),false);
  assert.equal(allowed.writes.length,1);assert.match(allowed.writes[0].sql,/SET provider_name=/);
});
test('different linked accounts remain blocked before any identity confirmation or write',async()=>{
  const mismatch=await exchange({identity:{uuid:'other',name:'다른 사람',soopUserId:'viewer'}});
  assert.equal(mismatch.result.status,409);assert.equal(mismatch.result.data.code,'PLAYDK_ACCOUNT_MISMATCH');
  assert.equal(mismatch.writes.length,0);assert.equal(mismatch.gifts,0);
  const duplicate=await exchange({existing:null,linked:{user_id:8}});
  assert.equal(duplicate.result.status,409);assert.equal(duplicate.result.data.code,'PLAYDK_ALREADY_LINKED');assert.equal(duplicate.gifts,0);
});
test('first verification preserves the existing gift path and returns the optional provision result',async()=>{
  const first=await exchange({existing:null,identity:{uuid:'qa-uuid',name:'검수',soopUserId:'viewer'}});
  assert.equal(first.result.status,200);assert.equal(first.result.data.newlyVerified,true);
  assert.equal(first.result.data.soopWatch.identityAvailable,true);assert.equal(first.gifts,1);
});
