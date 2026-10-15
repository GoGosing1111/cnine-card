import test from 'node:test';
import assert from 'node:assert/strict';
import {networkRequestOptions} from '../packaging/windows-client/lib/network-request.mjs';
const origin='https://cnine-card.pages.dev';
function request({initiatorOrigin,...options}={}){const req=new Request(origin+'/api/scrapyard/v3/run',{method:'POST',...options});if(initiatorOrigin!==undefined)Object.defineProperty(req,'initiatorOrigin',{value:initiatorOrigin});return req;}
test('only native initiator metadata restores a missing Origin',()=>{
  assert.equal(networkRequestOptions(request({initiatorOrigin:origin})).headers.get('origin'),origin);
  assert.equal(networkRequestOptions(request({referrer:origin+'/'})).headers.get('origin'),null);
  assert.equal(networkRequestOptions(request({initiatorOrigin:'null'})).headers.get('origin'),'null');
  assert.equal(networkRequestOptions(request({initiatorOrigin:'https://foreign.invalid'})).headers.get('origin'),'https://foreign.invalid');
});
test('existing foreign Origin and unrelated requests are never upgraded',()=>{
  const req=request({initiatorOrigin:origin,headers:{Origin:'https://foreign.invalid'}});
  assert.equal(networkRequestOptions(req).headers.get('origin'),'https://foreign.invalid');
  assert.equal(networkRequestOptions(request({initiatorOrigin:origin,method:'GET'})).headers.get('origin'),null);
  const foreign=new Request('https://foreign.invalid/submit',{method:'POST'});Object.defineProperty(foreign,'initiatorOrigin',{value:origin});
  assert.equal(networkRequestOptions(foreign).headers.get('origin'),null);
});
