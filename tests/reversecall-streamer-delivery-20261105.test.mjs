import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mercenaryCmsRequest} from '../admin/mercenary-request-v1.mjs';
import {STREAMER_PACK} from '../shared/reversecall-streamer-pack-v1.mjs';
import {BLACKCROWN_MERCENARIES} from '../shared/mercenary-blackcrown-catalog-v1.mjs';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('CMS transport accepts the streamer settings envelope and rejects malformed replies',async()=>{
 const saved={fetch:globalThis.fetch,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage};
 try{
  globalThis.localStorage=globalThis.sessionStorage={getItem:()=>null};
  let response={revision:10,settings:{mode:'ON',stockLimits:{'V-950':10}}};
  globalThis.fetch=async()=>Response.json(response);
  assert.deepEqual(await mercenaryCmsRequest({},'/api/admin/mercenaries/streamer-pack'),response);
  response={revision:10,document:{}};
  await assert.rejects(mercenaryCmsRequest({},'/api/admin/mercenaries/streamer-pack'),e=>e.code==='CMS_RESPONSE_INVALID');
 }finally{for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
test('purple rectangular original and two delivery images are exact; rejected concepts do not ship',()=>{
 const dir='assets/ui/packs/reversecall-streamer-20261105-v4/';
 assert.equal(STREAMER_PACK.image,dir+'pack-768.webp');
 const manifest=JSON.parse(read(dir+'manifest.json'));
 assert.equal(manifest.generator,'built-in image_gen');assert(manifest.metadata.hasAlpha);
 for(const [file,meta]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(new URL('../'+dir+file,import.meta.url))),meta.sha256,file);
 for(const file of ['pack-320.webp','pack-768.webp'])assert(isProductionFile(dir+file));
 for(const file of ['pack-source.png','prompt.txt','manifest.json'])assert(!isProductionFile(dir+file));
 for(const version of [1,2,3])for(const file of ['pack-source.png','pack-320.webp','pack-768.webp','prompt.txt','manifest.json'])assert(!isProductionFile('assets/ui/packs/reversecall-streamer-20261105-v'+version+'/'+file));
 for(const file of ['js/reversecall-streamer-pack-live.bundle.mjs','admin/reversecall-streamer-pack-admin.bundle.mjs','shared/reversecall-streamer-pack-v1.mjs'])assert(isProductionFile(file));
 const bundle=read('js/reversecall-streamer-pack-live.bundle.mjs');for(const token of ['mercenary-reversecall-streamer','mercenaries/v3/streamer-pack/open','cnine.','reversecall-streamer-pack',dir+'pack-768.webp','MERCENARY_STREAMER_ACCESS'])assert(bundle.includes(token),token);
 for(const file of ['js/app.js','onestore/js/app.js']){const source=read(file);assert(source.includes("import('/js/reversecall-streamer-pack-live.bundle.mjs?v=20261105-v1')"));assert(source.includes(dir));assert(source.includes('data-streamer-pack-enter'));}
 assert.equal(read('index.html').match(/js\/app\.js\?v=([^"'&]+)/)[1],read('service-worker.js').match(/soop-card-shell-v([^']+)/)[1]);
 const store=JSON.parse(read('packaging/onestore/web-build.json'));for(const file of ['onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'])assert.equal(hash(read(file)),store.outputs[file]);
});
test('existing six Black Crown original illustrations preserve their approved hashes in sparse checkout',()=>{
 for(const card of BLACKCROWN_MERCENARIES){
  const bytes=fs.existsSync(card.sourceArt)?fs.readFileSync(card.sourceArt):execFileSync('git',['-c','gc.auto=0','show','HEAD:'+card.sourceArt],{windowsHide:true,maxBuffer:25e6});
  assert.equal(hash(bytes),card.sourceArtSha256.toLowerCase(),card.code);
 }
});
