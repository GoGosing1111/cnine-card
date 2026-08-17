import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url),read=file=>readFileSync(new URL(file,root),'utf8');
const app=read('js/app.js'),index=read('index.html'),css=read('css/runtime-performance-v1727.css'),manifest=read('js/responsive-card-images-v1729.js'),chief=read('js/chief-system-v1.js');

assert.match(app,/const VIRTUAL_CARD_CHUNK_SIZE=18/);
assert.match(app,/function mountVirtualCardGroups\(/);
assert.match(app,/new IntersectionObserver\(/);
assert.match(app,/unmaterialize\(entry\.target\)/);
assert.match(app,/mountVirtualCardGroups\(root,groups,\{kind:'pve'/);
assert.match(app,/mountVirtualCardGroups\(root,groups,\{kind:'pvp'/);
assert.match(css,/\.virtual-card-chunk/);
assert.match(app,/responsiveCardImageMarkup/);
assert.match(app,/type="image\/avif"/);
assert.match(app,/type="image\/webp"/);
assert.match(index,/responsive-card-images-v1729\.js/);
assert.match(manifest,/CNineResponsiveCardImages/);
assert.match(index,/rel="preload"[^>]+chief-council-election-v1-1280\.avif/);
assert.match(chief,/chief-council-election-v1-768\.avif 768w/);
assert.equal(existsSync(new URL('assets/responsive/ui/chief-council-election-v1-1280.avif',root)),true);

const imageDir=new URL('assets/responsive/cards/',root);
assert.equal(existsSync(imageDir),true);
const files=readdirSync(imageDir);
assert.ok(files.length>=1000,`expected responsive card assets, got ${files.length}`);
assert.ok(files.some(name=>name.endsWith('-192.avif')));
assert.ok(files.some(name=>name.endsWith('-384.webp')));

console.log(`virtual/responsive card v1729 checks passed (${files.length} derived images)`);
