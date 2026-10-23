import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),base='assets/ui/project-v/mercenaries/codex-loading-20261023';
const digest=b=>createHash('sha256').update(b).digest('hex');
const full=p=>{assert(/^(assets|preview)\/[\w./-]+\.(png|jpg|jpeg|webp)$/.test(p)&&!p.split('/').includes('..'));return path.join(root,p);};
if(process.argv.includes('--check')){
  const m=JSON.parse(fs.readFileSync(path.join(root,base,'manifest.json')));
  for(const row of m.files){assert.equal(digest(fs.readFileSync(full(row.source))),row.sourceSha256);assert.equal(digest(fs.readFileSync(full(row.path))),row.sha256);}
  console.log(JSON.stringify({verified:m.files.length,originalsUnchanged:true,bytes:m.files.reduce((n,r)=>n+r.bytes,0)}));
}else{
  const catalogPath=process.argv.find(a=>a.startsWith('--catalog='))?.slice(10);assert(catalogPath,'Public catalog snapshot required');
  const catalog=JSON.parse(fs.readFileSync(catalogPath));assert.equal(catalog.version,'mercenary-codex-2098');
  const {default:sharp}=await import(process.env.SHARP_MODULE||'sharp');
  fs.mkdirSync(path.join(root,base),{recursive:true});
  const files=[],mapping={},existing=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/mercenaries/codex-v1/manifest.json'))).entries;
  async function image(source,kind,width,{lossless=false}={}){
    const input=fs.readFileSync(full(source)),sourceSha256=digest(input);
    if(kind==='thumb'&&(await sharp(input).metadata()).width<=320&&input.length<98304)return '/'+source;
    const prior=kind==='thumb'&&existing.find(e=>e.source===source&&e.kind==='art'&&e.width===320&&e.sourceSha256.toLowerCase()===sourceSha256);
    if(prior)return '/assets/ui/project-v/mercenaries/codex-v1/'+prior.file;
    const output=base+'/'+sourceSha256.slice(0,20)+'-'+kind+'.webp';
    if(files.some(f=>f.path===output))return '/'+output;
    const buffer=await sharp(input).rotate().resize({width,withoutEnlargement:true}).webp({quality:90,alphaQuality:100,lossless,effort:5}).toBuffer();
    fs.writeFileSync(full(output),buffer);const meta=await sharp(buffer).metadata();
    files.push({source,sourceSha256,sourceBytes:input.length,path:output,sha256:digest(buffer),bytes:buffer.length,width:meta.width,height:meta.height,kind});return '/'+output;
  }
  for(const c of catalog.cards){
    const source='/'+c.sourceArt;mapping[source]??={};
    const thumbnailSource='/'+(c.thumbnailArt||c.sourceArt);
    mapping[thumbnailSource]??={};
    mapping[source].thumb=mapping[thumbnailSource].thumb=await image(thumbnailSource.slice(1),'thumb',320);
    const display=c.displayArt||c.sourceArt;mapping['/'+display]??={};
    mapping['/'+display].display=c.displayArt?'/'+c.displayArt:await image(display,'display',960);
    if(c.frame){mapping['/'+c.frame]??={};mapping['/'+c.frame].display=await image(c.frame,'frame',960,{lossless:true});}
  }
  for(const [source,kind,width]of [['assets/ui/card-frames/mercenary-contract-frame-premium-v2.png','frame',960],['assets/items/pig-coin-v1.png','icon',96],['preview/equipment-forge-v1/assets/upgrade-lab-v2.png','background',1440]]){
    mapping['/'+source]??={};mapping['/'+source].display=await image(source,kind,width,{lossless:kind!=='background'});
  }
  fs.writeFileSync(path.join(root,base,'manifest.json'),JSON.stringify({version:'20261023-v1',originalsModified:false,generator:'scripts/build-codex-loading-media-20261023.mjs',files},null,2)+'\n');
  fs.writeFileSync(path.join(root,'mercenary-codex/media-map.mjs'),'// Display derivatives only. Full original art remains available in the zoom viewer.\nexport const CODEX_MEDIA=Object.freeze('+JSON.stringify(mapping,null,2)+');\n');
  console.log(JSON.stringify({generated:files.length,bytes:files.reduce((n,r)=>n+r.bytes,0),sourceBytes:files.reduce((n,r)=>n+r.sourceBytes,0),pig:mapping['/assets/items/pig-coin-v1.png'].display,background:mapping['/preview/equipment-forge-v1/assets/upgrade-lab-v2.png'].display}));
}
