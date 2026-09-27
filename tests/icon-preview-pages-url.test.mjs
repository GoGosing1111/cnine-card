import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('Pages clean URLs preserve the ICON preview asset root and shared battlefield paths',async()=>{
  const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');
  const html=await read('preview/icon-battle-assets-v1/battle.html'),base=html.match(/<base href="([^"]+)"/)[1];
  for(const route of ['https://qa.test/preview/icon-battle-assets-v1/battle.html','https://qa.test/preview/icon-battle-assets-v1/battle']){
    const uri=new URL(base,route);assert.equal(new URL('../../assets/ui/coin-prediction/arena-v1.png',uri).pathname,'/assets/ui/coin-prediction/arena-v1.png');
    assert.equal(new URL('./preview.bundle.js',uri).pathname,'/preview/icon-battle-assets-v1/preview.bundle.js');
  }
  assert.match(await read('scripts/serve-icon-cms-review.mjs'),/res.writeHead\(302,\{location:'\/preview\/icon-battle-assets-v1\/battle'\}/);
});
