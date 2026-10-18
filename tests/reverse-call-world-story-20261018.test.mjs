import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {SCENES, STORAGE_KEY, readBookmark, saveBookmark, sceneFromHash} from '../world/world.js';

test('story bookmarks resume the saved scene and tolerate denied, stale and corrupt storage', () => {
  const data = new Map();
  const storage = {getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value)};
  assert.equal(readBookmark(storage),null);
  assert.equal(saveBookmark(storage,5),true);
  assert.deepEqual(readBookmark(storage),{index:5,completed:false});
  saveBookmark(storage,SCENES.length-1,true);
  assert.deepEqual(readBookmark(storage),{index:SCENES.length-1,completed:true});
  for(const value of ['{', 'null', JSON.stringify({version:0,sceneId:'request'}), JSON.stringify({version:1,sceneId:'missing'})]) {
    storage.setItem(STORAGE_KEY,value);assert.equal(readBookmark(storage),null);
  }
  assert.equal(saveBookmark(storage,-1),false);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  assert.equal(readBookmark(denied),null);assert.equal(saveBookmark(denied,1),false);
  assert.equal(readBookmark(null),null);assert.equal(saveBookmark(null,1),false);
  assert.equal(sceneFromHash('#scene=request'),5);assert.equal(sceneFromHash('#scene=unknown'),-1);
});

const read=file=>readFile(new URL('../'+file,import.meta.url));
test('transparent brand assets retain alpha in web, desktop and every ICO frame',async()=>{
  const dir='assets/ui/brand/reverse-call-20261016/';
  const manifest=JSON.parse(await read(dir+'manifest.json'));
  assert.equal(manifest.files[0].sha256,'67e735ba0ca2ebb715145e414a1598e0087516f74ca7937383582565e9fe714c');
  for(const item of manifest.files) {
    const bytes=await read(item.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.file);
    if(item.file.endsWith('/source.png'))continue;
    if(item.file.endsWith('.ico')) {
      const count=bytes.readUInt16LE(4);assert.equal(count,7);
      for(let i=0;i<count;i++) {const at=6+i*16,size=bytes.readUInt32LE(at+8),offset=bytes.readUInt32LE(at+12);await transparent(bytes.subarray(offset,offset+size));}
    } else await transparent(bytes);
  }
  for(const file of ['packaging/windows-client/renderer/assets/icon.png','packaging/windows-client/renderer/assets/reverse-call-logo.png'])assert.deepEqual(await read(file),await read(dir+'icon-512.png'));
  assert.deepEqual(await read('favicon.ico'),await read(dir+'favicon.ico'));
  const pwa=JSON.parse(await read('manifest.webmanifest'));
  assert(pwa.icons.every(i=>i.purpose==='any'&&i.src.includes('?v=20261018-transparent')));
});
async function transparent(bytes) {
  const metadata=await sharp(bytes).metadata();assert(metadata.hasAlpha);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=pixel=>data[pixel*info.channels+3];
  for(const pixel of [0,info.width-1,info.width*(info.height-1),info.width*info.height-1])assert(alpha(pixel)<8,'transparent corner');
  let clear=0;for(let i=0;i<info.width*info.height;i++)if(alpha(i)<10)clear++;
  assert(clear/(info.width*info.height)>.3,'negative spaces are transparent');
}
