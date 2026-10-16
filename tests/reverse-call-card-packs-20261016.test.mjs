import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL('../'+p.replace(/^\//,''),import.meta.url));
const manifest=JSON.parse(read('assets/ui/packs/reverse-call-20261016/manifest.json'));
const aliases=JSON.parse(read('assets/ui/packs/reverse-call-20261016/legacy-aliases.json'));
const ctx={};vm.runInNewContext(read('js/image-delivery-map-20261015.js'),ctx);
const map=ctx.CNineImageDeliveryMap.map;

test('all 14 edited packs/cubes and responsive formats are present; approved originals retain their hashes',()=>{
 assert.equal(manifest.assets.length,14);
 for(const row of manifest.assets){
  assert.equal(row.outputs.length,6,row.id);
  for(const asset of [row.original,row.source,...row.outputs]){
   const bytes=fs.readFileSync(new URL('../'+asset.path,import.meta.url));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.path);
  }
 }
 const bytes=fs.readFileSync(new URL('../'+manifest.logo.path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.logo.sha256);
});

test('stored legacy URLs and previously optimized cached URLs resolve directly to current pack artwork',()=>{
 for(const [source,target]of Object.entries(aliases.aliases)){
  assert.equal(map['/'+source],'/'+target,source);assert.ok(exists(target));
 }
 assert.ok(Object.keys(aliases.legacyOptimized).length>0);
 for(const [source,target]of Object.entries(aliases.legacyOptimized)){
  assert.equal(map[source],target,source);assert.ok(exists(target));assert.equal(map[target],undefined,'no second remap to old pixels');
 }
 assert.equal(map['/assets/ui/brand/reverse-call-20261016/icon-128.png'],undefined);
});

for(const file of ['js/app.js','app.js'])test(file+' renders the correct pack in fallback and every picture source',()=>{
 const source=read(file),start=source.indexOf('function packImagePath('),end=source.indexOf('\n}',source.indexOf('function packResponsiveImage(',start))+2;
 const scope={escapeHtml:value=>String(value??''),CNineImageDelivery:{url:value=>map['/'+String(value).replace(/^\//,'').split('?')[0]]||value}};
 vm.runInNewContext(source.slice(start,end),scope);
 for(const [id,name]of Object.entries({basic:'standard',advanced:'advanced',premium:'premium',pickup:'limited',ultimate:'ultimate',superstar:'superstar',...(file.startsWith('js/')?{hyper:'hyper','mercenary-limited':'mercenary-limited'}:{})})){
  const pack={id,theme:id,name:id};
  assert.ok(scope.packImagePath(pack).includes('/'+name+'-768.webp'),id);
  for(const hero of [false,true]){
   const html=scope.packResponsiveImage(pack,{hero}),urls=[...html.matchAll(/(?:src|srcset)="([^"]+)"/g)].flatMap(m=>m[1].split(',').map(part=>part.trim().split(/\s+/)[0]));
   assert.ok(urls.length>0);
   for(const url of urls){assert.ok(url.includes('/reverse-call-20261016/'+name+'-'),id+' '+url);assert.ok(exists(url),url);}
  }
 }
 assert.equal(scope.packImagePath({id:'superstar',imageUrl:'assets/ui/packs/superstar-card-pack-v1.png'}),'/assets/ui/packs/reverse-call-20261016/superstar-768.webp');
 assert.equal(scope.packImagePath({id:'custom',imageUrl:'https://example.test/custom.webp'}),'https://example.test/custom.webp');
});

test('regular cards preserve content and grade while exposing the official brand image',()=>{
 const source=read('js/app.js'),start=source.indexOf('function cardHtml('),end=source.indexOf('\nfunction showDetail(',start);
 const scope={window:{},loadUser:()=>({}),uniqueAbilityBadgeHtml:()=>'',deckAbilityIconHtml:()=>'',FAKER_CHAMPIONSHIP_CARD_ID:'faker',drawResultRenderCount:0,tierFrameLevel:()=>0,tierFrameSource:()=>'',TIER_RANK_LABELS:{},escapeHtml:String,powerTypeIndicatorHtml:()=>'',responsiveCardImageMarkup:card=>`<img src="${card.image}" alt="portrait">`};
 vm.runInNewContext(source.slice(start,end),scope);
 for(const grade of ['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR']){
  const html=scope.cardHtml({id:grade,grade,name:'CNINE 이용자',title:'원래 카드명',image:'portrait.png'},true,'dex-card-display',{});
  assert.match(html,/class="card-brand-logo"[^>]+icon-128\.png/);assert.ok(html.includes('CNINE 이용자'));assert.ok(html.includes('원래 카드명'));assert.ok(html.includes('grade-'+grade));assert.ok(!html.includes('>SOOP<'));
 }
 assert.ok(!source.includes('legacyBrandObserver'),'Do not rewrite user nicknames or chat text with a global brand observer');
});

test('opening canvas source and shipped bundle use the same new hyper/limited pack URLs',()=>{
 for(const file of ['js/hyper-pack-fx-v2076.src.js','js/hyper-pack-fx-v2076.bundle.js']){
  const s=read(file);for(const name of ['hyper','mercenary-limited'])assert.ok(s.includes('/assets/ui/packs/reverse-call-20261016/'+name+'-768.webp'));
  assert.ok(!s.includes('/assets/ui/packs/hyper-pack-v2076.png'));
 }
 for(const file of ['js/black-miracle-opening-v1926.js','js/magic-workbench-v1.js'])assert.ok(read(file).includes('/reverse-call-20261016/'));
});
