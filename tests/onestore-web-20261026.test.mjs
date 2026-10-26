import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {canonicalDocument,storeDocumentUrl,DOCUMENTS} from '../shared/onestore-web-v1.mjs';
import {htmlForStore,serveStore,isStoreEntry} from '../functions/_onestore_web.js';
import {onRequest as rootEntry} from '../functions/index.js';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('store documents retain edition and cannot route to excluded/admin documents',()=>{
  for(const path of DOCUMENTS)assert.equal(canonicalDocument('/onestore'+path),path);
  for(const path of ['/admin/','/api/me','/server-support/','/pve-v3/cms.html','/onestore/admin/'])assert.equal(storeDocumentUrl(path),null);
  assert.equal(storeDocumentUrl('/pets/opening/?id=5'),'https://cnine-card.pages.dev/onestore/pets/opening/?id=5');
  assert.equal(new URL(storeDocumentUrl('/?screen=prediction')).searchParams.get('screen'),'home');
  assert.equal(storeDocumentUrl('https://example.com/'),null);
});
test('actual entry installs policy and official SDK before game scripts with correct variants',async()=>{
  const html=htmlForStore(await readFile(new URL('../onestore/index.html',import.meta.url),'utf8'),'/');
  assert.ok(html.indexOf('/onestore/h5-sdk.js')<html.indexOf('/onestore/js/app.js'));
  assert.match(html,/src="\/onestore\/js\/app.js/);
  assert.match(html,/src="\/onestore\/js\/adventure-lobby-v2107.js/);
  assert.doesNotMatch(html,/<script[^>]+src="[^"?]*(?:clan-prison-camp|coin-prediction|server-support|store-distribution|pwa-install)/);
  assert.match(html,/<base href="\/">/);
});
test('standalone pet imports and navigation use the same restrictions',async()=>{
  const html=htmlForStore(await readFile(new URL('../pets/index.html',import.meta.url),'utf8'),'/pets/');
  assert.match(html,/\/onestore\/js\/pet-equipment-window-v1.mjs/);
  assert.match(html,/\/onestore\/js\/adventure-navigation-standalone.js/);
  const module=await readFile(new URL('../onestore/js/pet-equipment-window-v1.mjs',import.meta.url),'utf8');
  assert.match(module,/from '\/shared\/collection-bonuses/);
});
test('Pages serves HTML from assets without API/account writes and with iframe headers',async()=>{
  const calls=[];
  const response=await serveStore({request:new Request('https://cnine-card.pages.dev/onestore/?screen=home'),env:{ASSETS:{fetch:async request=>{calls.push(request.url);return new Response('<html><head></head><body>Game</body></html>',{headers:{'content-type':'text/html','x-frame-options':'DENY'}});}}}});
  assert.equal(response.status,200);assert.equal(response.headers.has('x-frame-options'),false);
  assert.match(response.headers.get('content-security-policy'),/https:\/\/\*\.onestore.net/);
  assert.deepEqual(calls,['https://cnine-card.pages.dev/onestore/']);
  assert.match(await response.text(),/h5-sdk.js/);
  assert.equal((await serveStore({request:new Request('https://cnine-card.pages.dev/onestore/admin/')})).status,404);
});
test('root compatibility redirect preserves ordinary web and native Android edition',async()=>{
  const normal=new Request('https://cnine-card.pages.dev/?source=android&distribution=onestore');
  assert.equal(isStoreEntry(normal),false);
  assert.equal(await rootEntry({request:normal,next:()=>42}),42);
  for(const referer of ['https://dev.onestore.net/','https://dev.onestore.co.kr/']){
    const response=await rootEntry({request:new Request('https://cnine-card.pages.dev/',{headers:{referer}})});
    assert.equal(response.headers.get('location'),'https://cnine-card.pages.dev/onestore/');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
  assert.equal(isStoreEntry(new Request('https://cnine-card.pages.dev/',{headers:{referer:'https://onestore.net.evil.example/'}})),false);
});
test('H5 public runtime is shipped while source packaging remains outside Pages assets',()=>{
  for(const file of ['onestore/index.html','onestore/h5-sdk.js','onestore/js/app.js','shared/onestore-web-v1.mjs'])assert.equal(isProductionFile(file),true);
  for(const file of ['packaging/onestore/web/h5-sdk.mjs','scripts/onestore/prepare-web.mjs','packaging/android-direct/native/GameActivity.java'])assert.equal(isProductionFile(file),false);
});
test('generated web edition matches current approved client sources and SDK policy',()=>{
  const output=execFileSync(process.execPath,['scripts/onestore/prepare-web.mjs','--check'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'});
  assert.equal(JSON.parse(output).verified,true);
});
