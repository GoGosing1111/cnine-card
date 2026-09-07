import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
const read=path=>readFile(new URL('../'+path,import.meta.url));
const json=async path=>JSON.parse((await read(path)).toString('utf8'));
const root='assets/ui/project-v/monsters/hunt-tower/';
const expected=[
  {id:73,name:'마이트 가이',art:'assets/tower/GAI.jpg',master:root+'hunt-073-night-guy-boss-sd-v1.png',folder:'monsters'},
  {id:74,name:'센쥬 하시라마',art:'assets/tower/SENJU.jpg',master:root+'hunt-074-wood-dragon-boss-sd-v1.png',folder:'monsters'},
  {id:'CORE_ARCHEON',name:'유하바하',art:'assets/tower/uhabha.jpg',master:root+'core-yhwach-sd-v1.png',folder:'monsters'},
  {id:'CN-346F8DB0DEB84D41',name:'이예준',art:'assets/cards/special/chulgu-fur.webp',master:'assets/ui/project-v/characters/fur/fur-cn-346f8db0deb84d41-sd-v1.png',folder:'fur'}
];
test('all four SDs have real alpha, clear edges and full-body safe margins; responsive formats preserve transparency',async()=>{
  const provenance=await json('docs/boss-resources-v2048-prompts.json');
  for(const entry of expected){
    await read(entry.art);
    const buffer=await read(entry.master),metadata=await sharp(buffer).metadata();
    assert.equal(metadata.hasAlpha,true);assert.equal(metadata.width,1350);assert.equal(metadata.height,1350);
    const record=provenance.finals.find(row=>row.outputPath===entry.master);
    assert.equal(createHash('sha256').update(buffer).digest('hex').toUpperCase(),record.sha256);
    const {data,info}=await sharp(buffer).raw().toBuffer({resolveWithObject:true});
    let clear=0,solid=0;const bounds={left:info.width,top:info.height,right:-1,bottom:-1};
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const alpha=data[(y*info.width+x)*4+3];if(alpha===0)clear++;if(alpha>245)solid++;
      if(x<64||y<64||x>=info.width-64||y>=info.height-64)assert.equal(alpha,0,entry.master+' edge');
      if(alpha>18){bounds.left=Math.min(bounds.left,x);bounds.top=Math.min(bounds.top,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);}
    }
    assert(clear/(info.width*info.height)>.5,'baked checkerboards/opaque rectangles must not pass');
    assert(solid/(info.width*info.height)>.15,'the figure must not be accidentally erased');
    assert.equal(bounds.bottom,1277);assert(bounds.left>=72&&bounds.top>=72&&bounds.right<1278);
    const base=entry.master.split('/').at(-1).replace('.png','');
    for(const size of [384,768])for(const extension of ['webp','avif']){
      const file=`assets/responsive/project-v/${entry.folder}/${base}-${size}.${extension}`,m=await sharp(await read(file)).metadata();
      assert.equal(m.width,size);assert.equal(m.height,size);assert.equal(m.hasAlpha,true);
    }
  }
});
test('exact monster/card IDs resolve the new sprites without changing original catalog artwork',async()=>{
  const monsters=await json(root+'manifest-v1.json');
  const manifests=Object.fromEntries(await Promise.all([['FUR','fur/manifest-v2.json'],['PRESTIGE','prestige/manifest-v1.json'],['SUPERSTAR','superstar/manifest-v1.json']].map(async([key,path])=>[key,await json('assets/ui/project-v/characters/'+path)])));
  const sandbox={console,globalThis:null};sandbox.globalThis=sandbox;
  vm.runInNewContext((await read('js/project-v-monster-battle-art-adapter-v1.js')).toString(),sandbox);
  vm.runInNewContext((await read('js/project-v-tier-battle-art-adapter-v1.js')).toString(),sandbox);
  const monsterAdapter=sandbox.ProjectVMonsterBattleArt.createAdapter({manifest:monsters});
  const tierAdapter=sandbox.ProjectVTierBattleArt.createAdapter({manifests});
  for(const entry of expected.slice(0,2)){
    const original={id:entry.id,image:entry.art,mode:'APOCALYPSE'},resolved=monsterAdapter.resolveForV3(original);
    assert(resolved);assert(resolved.primaryUrl.includes(entry.master.replace('.png','-768.webp')));assert.equal(original.image,entry.art);
  }
  const card=expected[3],original={id:card.id,cardId:card.id,image:card.art,grade:'FUR'};
  const art=tierAdapter.resolveForV3(original);assert(art);assert(art.primaryUrl.includes(card.master));assert.equal(original.image,card.art);
  assert.equal(art.kind,'FUR_SD');
  const app=(await read('js/app.js')).toString();
  assert(app.includes('project-v-pixi-battle.bundle.js?v=101-nonblocking-fx'));
  const preview=(await read('preview/boss-resources-v2048/battle.html')).toString();
  for(const adapter of ['project-v-battle-art-adapter-v1','project-v-tier-battle-art-adapter-v1','project-v-monster-battle-art-adapter-v1','project-v-unassigned-battle-fallback-v1'])assert(preview.includes(adapter));
});
