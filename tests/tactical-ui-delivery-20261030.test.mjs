import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(read('output/imagegen/tactical-ui-20261030/manifest.json'));
const bundle=read('js/adventure-lobby-v2107.js').toString();
const images=JSON.parse(bundle.match(/window\.__TACTICAL_UI_IMAGES__=(\{[^\n]+\});\n/)[1]);

test('all 64 shipped icons preserve the original WebP bytes and remain available through the public renderer',()=>{
 const context=vm.createContext({__TACTICAL_UI_IMAGES__:images});
 vm.runInContext(read('js/tactical-icons-20261030.js').toString(),context);
 assert.equal(manifest.icons.length,64);assert.equal(Object.keys(images).length,64);
 for(const icon of manifest.icons){
  const bytes=read(icon.file.slice(1));assert.equal(hash(bytes),icon.sha256,icon.id+' changed');
  assert.deepEqual(Buffer.from(images[icon.id].split(',')[1],'base64'),bytes,icon.id+' delivery changed');
  const html=context.SoopTacticalIcons.html(icon.id);
  assert.ok(html.includes('src="'+images[icon.id]+'"'));assert.ok(html.includes('data-tactical-icon="'+icon.id+'"'));
 }
 assert.equal(context.SoopTacticalIcons.resolve('character'),'equipment');
 assert.equal(context.SoopTacticalIcons.resolve('menu'),'grid');
});

test('Pages ships the shadow-root menu frame while keeping preserved source art out of the public payload',()=>{
 assert.equal(fs.existsSync(new URL('css/tactical-ui-20261030.css',root)),false,'deferred document theme must not ship');
 assert.ok(!bundle.includes('dataset.commandInteriors'));
 assert.ok(!bundle.includes('/css/tactical-ui-20261030.css'));
 assert.ok(isProductionFile('assets/ui/tactical-20261030/panel-flat.webp'));
 assert.ok(isProductionFile('js/adventure-lobby-v2107.js'));
 for(const icon of manifest.icons)assert.equal(isProductionFile(icon.file.slice(1)),false);
 for(const source of ['output/imagegen/tactical-ui-20261030/navigation-atlas-v2.png','ui/adventure-lobby/component.js','ui/adventure-lobby/tactical.css','ui/adventure-lobby/operations.js','ui/adventure-lobby/operations.css','js/tactical-icons-20261030.js','scripts/prepare-tactical-ui-20261030.mjs'])assert.equal(isProductionFile(source),false);
 const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean);
 const publicCount=tracked.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert.ok(publicCount<=20000,'Pages file cap exceeded: '+publicCount);
});
