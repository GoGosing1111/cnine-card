import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const at=file=>new URL('../'+file,import.meta.url);
const logo='assets/ui/brand/reverse-call-20261016/logo-240.webp';

test('hunt, codex and forge use the transparent Reverse Call art in each former play-mark slot',async()=>{
  const manifest=JSON.parse(await readFile(at('assets/ui/brand/reverse-call-20261016/manifest.json'),'utf8'));
  const digest=createHash('sha256').update(await readFile(at(logo))).digest('hex');
  assert.equal(digest,manifest.files.find(asset=>asset.file===logo).sha256);
  const screens=[
    ['js/legion-hunt-entry-v1.mjs',1],
    ['pve/legion-hunt/index.html',1],
    ['mercenary-codex/index.html',2],
    ['mercenary-codex/shell.mjs',2],
    ['equipment-forge/index.html',2],
    ['scripts/build-equipment-forge-public-v1.mjs',2],
    ['preview/equipment-forge-v1/index.html',1]
  ];
  for(const [file,expected] of screens){
    const html=await readFile(at(file),'utf8');
    assert.equal(html.split(`<img src="/${logo}?v=20261018-transparent" alt=""`).length-1,expected,file);
    assert.doesNotMatch(html,/M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 6v12l8-6Z|href="#i-core"/,file);
  }
});
