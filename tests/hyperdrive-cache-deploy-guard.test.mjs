import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {productionHyperdriveId,assertFreshHyperdrive,verifyProductionHyperdriveCache} from '../scripts/verify-hyperdrive-cache.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='12ed48b0fb374f82a610cc1daba92e95';

test('production deployment checks fresh Hyperdrive before uploading Pages, including assets-only',()=>{
  const source=read('scripts/deploy-production.mjs');
  assert.ok(source.includes('Hyperdrive query cache must be disabled for cnine-card (stale reads break draw/raid/energy).'));
  const guard=source.indexOf('verifyProductionHyperdriveCache({');
  assert.ok(guard>source.indexOf("else run('npm',['run','release:gate'])")&&guard<source.indexOf("[wrangler,'pages','deploy'"));
});
test('Pages and clan-draft bindings match and mismatches fail closed',()=>{
  const pages=read('wrangler.toml'),draft=read('workers/clan-draft/wrangler.jsonc');
  assert.equal(productionHyperdriveId(pages,draft),id);
  assert.throws(()=>productionHyperdriveId(pages,draft.replace(id,'0'.repeat(32))),/same production Hyperdrive/);
  assert.throws(()=>productionHyperdriveId(pages.replace('[[hyperdrive]]','[[other]]'),draft),/exactly one/);
  assert.throws(()=>productionHyperdriveId(pages+'\n[[hyperdrive]]\nbinding="HYPERDRIVE"\nid="'+id+'"',draft),/exactly one/);
});
test('only explicit boolean disabled true passes; enabled, missing and malformed states block',()=>{
  assert.equal(assertFreshHyperdrive('Wrangler banner\n'+JSON.stringify({id,caching:{disabled:true}}),id).cachingDisabled,true);
  for(const caching of [{disabled:false},{disabled:'true'},{},undefined])assert.throws(()=>assertFreshHyperdrive(JSON.stringify({id,caching}),id),/query cache must be disabled/);
  assert.throws(()=>assertFreshHyperdrive('authentication failed',id),/Cannot verify/);
  assert.throws(()=>assertFreshHyperdrive(JSON.stringify({id:'wrong',caching:{disabled:true}}),id),/unexpected id/);
});
test('inspection uses read-only CLI and blocks failed inspection without printing secrets',()=>{
  const env={CLOUDFLARE_ACCOUNT_ID:'expected-account'};
  const result=verifyProductionHyperdriveCache({root,wrangler:'test-wrangler.js',env,inspect:(command,args,options)=>{
    assert.deepEqual(args,['test-wrangler.js','hyperdrive','get',id]);
    assert.equal(options.env,env);assert.equal(options.timeout,30000);
    return JSON.stringify({id,caching:{disabled:true}});
  }});
  assert.equal(result.id,id);
  assert.throws(()=>verifyProductionHyperdriveCache({root,wrangler:'test',inspect:()=>{throw Error('sensitive value');}}),e=>!e.message.includes('sensitive value')&&/deployment blocked/.test(e.message));
});
