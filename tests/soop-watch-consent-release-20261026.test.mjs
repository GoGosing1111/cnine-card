import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('js/app.js');
const handler=app.slice(app.indexOf('async function completePendingPlaydkVerification(){'),app.indexOf("const PLAYER_CLIENT_ID_KEY="));
function fixture({userId=7,after,result}={}){
  const notices=[],alerts=[],renders=[],context={playdkVerificationInFlight:false,pendingPlaydkVerificationToken:'one-use-token',API_MODE:true,API_TOKEN:'original-session',loadUser:()=>({serverUserId:userId}),apiRequest:async()=>{after?.(context);return result||{status:'ALREADY_VERIFIED',newlyVerified:false,soopWatch:{identityAvailable:true}};},clearApiCache:()=>{},openSoopWatchConsent:options=>notices.push(options),alert:message=>alerts.push(message),renderShell:route=>renders.push(route),requestAnimationFrame:fn=>fn(),openWagoVerification:()=>{}};
  return {context,notices,alerts,renders,run:()=>runInNewContext(handler+'completePendingPlaydkVerification()',context)};
}
test('fresh provision results use the automatic notice gate after the existing token exchange',async()=>{
  const f=fixture();assert.equal(await f.run(),true);assert.equal(f.notices.length,1);
  assert.equal(f.notices[0].verificationResult.soopWatch.identityAvailable,true);
  assert.equal(f.notices[0].automatic,true);
  assert.equal(f.context.pendingPlaydkVerificationToken,'');assert.equal(f.context.playdkVerificationInFlight,false);
  assert.equal(await f.run(),false);assert.equal(f.notices.length,1);assert.equal(f.renders.length,0);
});
test('account or session changes while exchanging a token suppress the stale confirmation',async()=>{
  for(const after of [context=>context.API_TOKEN='new-session',context=>context.loadUser=()=>({serverUserId:8}),context=>context.loadUser=()=>null]){
    const f=fixture({after});assert.equal(await f.run(),false);assert.equal(f.notices.length,0);assert.equal(f.alerts.length,0);assert.equal(f.renders.length,0);assert.equal(f.context.playdkVerificationInFlight,false);
  }
});
test('new verification retains the original messages and gift notification flow',async()=>{
  const f=fixture({result:{newlyVerified:true,verification:{providerName:'검수'},giftMessage:{sent:true},soopWatch:{identityAvailable:false}}});
  assert.equal(await f.run(),true);assert.deepEqual(f.renders,['messages']);assert.match(f.alerts[0],/기프트 박스 1개/);
  assert.equal(f.notices[0].verificationResult.soopWatch.identityAvailable,false);
  assert.equal(f.notices[0].automatic,true);
});
test('normal and store entries load the changed runtime and the service worker refreshes popup assets',()=>{
  for(const file of ['index.html','onestore/index.html'])assert.match(read(file),/app\.js\?v=soop-watch-repeat-20261028-v1-/);
  const sw=read('service-worker.js');assert.match(sw,/soop-card-shell-vsoop-watch-repeat-20261028-v1-/);
  assert.match(sw,/\/js\/soop-watch-consent-v1\.mjs/);assert.match(sw,/\/css\/soop-watch-consent-v1\.css/);
  for(const file of ['js/app.js','onestore/js/app.js']){const text=read(file);assert.match(text,/openSoopWatchConsent\(\{automatic:true\}\)/);assert.match(text,/id="openSoopWatchConsent"/);assert.match(text,/API_TOKEN!==verificationSession/);}
});
