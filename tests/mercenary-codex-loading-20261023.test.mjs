import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {requestPublicCodex,loadCodexPanels} from '../mercenary-codex/loading.mjs';
import {CODEX_MEDIA} from '../mercenary-codex/media-map.mjs';
import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {isProductionFile,codexLoadingNodeOnly} from '../scripts/prepare-production-assets.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('public catalog renders while an account response remains pending',async()=>{
  const privateReply=deferred(),shown=deferred(),events=[];
  const loading=loadCodexPanels({catalog:async()=>({cards:['public']}),account:()=>privateReply.promise,
    onCatalog:v=>{events.push(v.cards[0]);shown.resolve();},onAccount:v=>events.push(v),
    onCatalogError:assert.fail,onAccountError:assert.fail});
  await shown.promise;assert.deepEqual(events,['public']);
  privateReply.resolve('owned');await loading;assert.deepEqual(events,['public','owned']);
});
test('account failure does not discard a successful public catalog, and public failure does not discard ownership',async()=>{
  for(const failing of ['account','catalog']){
    const events=[];
    await loadCodexPanels({catalog:async()=>{if(failing==='catalog')throw Error('public offline');return 'public';},
      account:async()=>{if(failing==='account')throw Error('private offline');return 'owned';},
      onCatalog:v=>events.push(v),onAccount:v=>events.push(v),onCatalogError:e=>events.push(e.message),onAccountError:e=>events.push(e.message)});
    assert.deepEqual(events.sort(),failing==='account'?['private offline','public']:['owned','public offline']);
  }
});
test('public request is made once without player credentials or account-sync retry',async()=>{
  let calls=0;
  const result=await requestPublicCodex({fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'/api/mercenary-codex');assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);
    return {ok:true,json:async()=>({version:1})};
  }});
  assert.equal(calls,1);assert.equal(result.version,1);
});
test('public loading aborts on deadline and preserves HTTP failures',async()=>{
  await assert.rejects(requestPublicCodex({timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))))}),{code:'MERCENARY_LOAD_TIMEOUT'});
  await assert.rejects(requestPublicCodex({fetchImpl:async()=>({ok:false,status:503,json:async()=>({error:'temporarily unavailable'})})}),{status:503,message:'temporarily unavailable'});
});
test('every released card has a small thumbnail and a reachable display image, including source-art thumbnail aliases',()=>{
  const catalog=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:61,updated_at:'2026-10-23T00:00:00Z'});
  for(const card of catalog.cards){
    const source='/'+(card.thumbnailArt||card.sourceArt),thumb=CODEX_MEDIA[source]?.thumb,display=CODEX_MEDIA['/'+(card.displayArt||card.sourceArt)]?.display;
    assert.ok(thumb,card.code+' thumbnail');assert.ok(display,card.code+' display');
    assert.ok(fs.statSync('.'+thumb).size<98304,card.code+' thumbnail size budget');assert.ok(fs.existsSync('.'+display),card.code+' display exists');
  }
  const pig=CODEX_MEDIA['/assets/items/pig-coin-v1.png'].display;
  assert.ok(fs.statSync('.'+pig).size<20000,'96px pig icon must not pull the original multi-megabyte PNG');
});
test('all generated display assets match their manifests and preserve approved original bytes',()=>{
  const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/codex-loading-20261023/manifest.json'));
  const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  for(const file of manifest.files){assert.equal(hash(file.path),file.sha256,file.path);assert.equal(hash(file.source),file.sourceSha256,file.source);}
  assert.equal(manifest.originalsModified,false);
});

test('Pages slots are reclaimed from Node commands, while original art and display assets remain public',()=>{
  assert.ok(codexLoadingNodeOnly.size>=100);
  for(const file of codexLoadingNodeOnly){
    assert.match(fs.readFileSync(file,'utf8'),/(?:from\s*|require\(\s*|import\s*)['"](?:node:|assert|fs|path|os|http|url|crypto|child_process|vm|playwright|@playwright\/)/,file);
    assert.equal(isProductionFile(file),false,file);
  }
  const manifest=JSON.parse(fs.readFileSync('assets/ui/project-v/mercenaries/codex-loading-20261023/manifest.json'));
  for(const f of manifest.files){assert.ok(isProductionFile(f.source),f.source);assert.ok(isProductionFile(f.path),f.path);}
});
